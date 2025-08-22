import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
import { watch } from 'fs';
import { logger } from '../utils/logger';
import { ProcessConfig, ProcessManagementConfig, ProxyConfig } from '../types';
import { configService } from './config-service';
import { ProcessScheduler } from './process-scheduler';

/**
 * Process Manager for managing long-running child processes
 * 
 * CRITICAL BEHAVIOR: This process manager is designed to NEVER kill child processes.
 * Child processes are spawned with detached: true and will survive when the process
 * manager is terminated (SIGTERM, SIGINT, or process exit).
 * 
 * Key features:
 * - Child processes are detached from the parent process group
 * - PID files are preserved for reconnection after restart
 * - Health checks and monitoring can be restarted without affecting running processes
 * - Processes continue running even if the process manager crashes or is killed
 * 
 * This ensures that managed processes remain running for their intended purpose
 * regardless of what happens to the process manager itself.
 */

export interface ManagedProcess {
  id: string;
  config: ProcessConfig;
  process: ChildProcess | null;
  isRunning: boolean;
  restartCount: number;
  startTime: Date | null;
  lastRestartTime: Date | null;
  healthCheckFailures: number;
  lastHealthCheckTime: Date | null; // Track when last health check was performed
  pidFilePath: string; // Track the PID file path for this process
  logFilePath: string; // Track the log file path for this process
  isReconnected: boolean; // Whether this process was reconnected to an existing one
  processMonitor?: NodeJS.Timeout; // Change to NodeJS.Timeout
  isStopped: boolean; // Whether this process has been manually stopped by user action
  isTerminated: boolean; // Whether this process has terminated (crashed, exited, etc.)
  isRemoved: boolean; // Whether this process has been removed from configuration
}

// Add function to monitor process by PID
function monitorProcessByPid(pid: number, onDeath: () => void): NodeJS.Timeout {
  return setInterval(() => {
    try {
      process.kill(pid, 0); // Test if process is running
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        // Process has died
        onDeath();
      }
    }
  }, 1000); // Check every second
}

export class ProcessManager {
  private processes: Map<string, ManagedProcess> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isShuttingDown = false;
  private fileWatcher: fs.FSWatcher | null = null;
  private reinitializeTimeout: NodeJS.Timeout | null = null;
  private stoppedStatusFile: string; // File to persist stopped status

  private onProcessUpdate: (() => void) | null = null;
  private onLogUpdate: ((processId: string, newLogs: string[]) => void) | null = null;
  private scheduler: ProcessScheduler;

  constructor() {
    // Initialize the process scheduler
    this.scheduler = new ProcessScheduler();

    // Set up stopped status file path
    const dataDir = configService.getSetting<string>('dataDir') || './data';
    this.stoppedStatusFile = path.resolve(dataDir, 'stopped-processes.json');

    // Set up scheduler callbacks
    this.scheduler.setProcessStartCallback(async (id: string, config: ProcessConfig) => {
      await this.startProcess(id, config, 'scheduled');
    });

    this.scheduler.setProcessStopCallback(async (id: string) => {
      // For scheduler-requested stops, detach by default to respect long-running processes
      await this.detachProcess(id);
    });

    this.scheduler.setProcessStatusChangeCallback((id: string, isRunning: boolean) => {
      this.updateSchedulerProcessStatus(id, isRunning);
    });

    // Set up configuration change handling
    this.setupConfigChangeHandling();

    // Handle graceful shutdown
    // Note: This process manager is designed to NEVER kill child processes
    // Child processes are spawned with detached: true and will survive
    // when the process manager is terminated
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Initialize with server configuration
   */
  public initialize(): void {
    // Initialize schedules if process management config is available
    const processConfig = configService.getProcessConfig();
    if (processConfig) {
      this.initializeSchedules(processConfig);
    }
  }

  /**
   * Save stopped status to persistent storage
   */
  private async saveStoppedStatus(): Promise<void> {
    try {
      const stoppedProcesses = Array.from(this.processes.entries())
        .filter(([_, process]) => process.isStopped)
        .map(([id, _]) => id);

      const data = {
        stoppedProcesses,
        timestamp: new Date().toISOString()
      };

      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.stoppedStatusFile));

      // Write to file
      await fs.writeJson(this.stoppedStatusFile, data, { spaces: 2 });

      logger.debug(`Saved stopped status for ${stoppedProcesses.length} processes`);
    } catch (error) {
      logger.error('Failed to save stopped status', error);
    }
  }

  /**
   * Load stopped status from persistent storage
   */
  private async loadStoppedStatus(): Promise<Set<string>> {
    try {
      if (!await fs.pathExists(this.stoppedStatusFile)) {
        logger.debug('No stopped status file found, starting fresh');
        return new Set();
      }

      const data = await fs.readJson(this.stoppedStatusFile);
      const stoppedProcesses = new Set((data.stoppedProcesses || []) as string[]);

      logger.info(`Loaded stopped status for ${stoppedProcesses.size} processes`);
      return stoppedProcesses;
    } catch (error) {
      logger.error('Failed to load stopped status', error);
      return new Set();
    }
  }

  /**
   * Check if a process should be considered stopped based on persistent storage
   */
  private async isProcessPersistentlyStopped(processId: string): Promise<boolean> {
    const stoppedProcesses = await this.loadStoppedStatus();
    return stoppedProcesses.has(processId);
  }

  /**
   * Clear stopped status for a process (when it's started or restarted)
   */
  private async clearStoppedStatus(processId: string): Promise<void> {
    const stoppedProcesses = await this.loadStoppedStatus();
    if (stoppedProcesses.has(processId)) {
      stoppedProcesses.delete(processId);

      // Save updated status
      const data = {
        stoppedProcesses: Array.from(stoppedProcesses),
        timestamp: new Date().toISOString()
      };

      await fs.ensureDir(path.dirname(this.stoppedStatusFile));
      await fs.writeJson(this.stoppedStatusFile, data, { spaces: 2 });

      logger.debug(`Cleared stopped status for process ${processId}`);
    }
  }

  /**
   * Start all managed processes from configuration
   */
  async startManagedProcesses(): Promise<void> {
    const processManagementConfig = configService.getProcessConfig();
    if (!processManagementConfig?.processes) {
      logger.info('No process management configuration found');
      return;
    }

    logger.info('Starting managed processes...');

    for (const [processId, processConfig] of Object.entries(processManagementConfig.processes)) {
      if (processConfig.enabled !== false) {
        try {
          const target = this.getTargetForProcess(processId, processConfig);
          await this.startProcess(processId, processConfig, target);
          logger.info(`Started managed process: ${processId}`);
        } catch (error) {
          logger.error(`Failed to start managed process: ${processId}`, error);
        }
      } else {
        logger.info(`Skipping disabled process: ${processId}`);
      }
    }

    logger.info('Managed processes startup complete');
  }

  /**
   * Schedule reinitialization with debouncing
   */
  private scheduleReinitialize(): void {
    // Clear existing timeout
    if (this.reinitializeTimeout) {
      clearTimeout(this.reinitializeTimeout);
    }

    // Debounce reinitialization to avoid multiple rapid updates
    this.reinitializeTimeout = setTimeout(() => {
      this.reinitializeFromFile();
    }, 2000); // Wait 2 seconds after last change
  }

  /**
   * Reinitialize from configuration file
   */
  private async reinitializeFromFile(): Promise<void> {

    try {
      logger.info('Reinitializing process management from updated configuration file');

      const newConfig = configService.getProcessConfig();

      if (!newConfig) {
        throw new Error('Failed to load process configuration file');
      }

      // Handle the configuration update
      await this.handleProcessConfigUpdate(newConfig);

    } catch (error) {
      logger.error('Failed to reinitialize process management', error);
    }
  }

  /**
   * Handle process configuration update
   */
  async handleProcessConfigUpdate(newConfig: ProcessManagementConfig): Promise<void> {
    logger.info('Processing process configuration update', {
      processCount: Object.keys(newConfig.processes).length,
      processes: Object.keys(newConfig.processes)
    });

    // Create a target resolver function
    const targetResolver = (processId: string, processConfig: ProcessConfig): string => {
      return this.getTargetForProcess(processId, processConfig);
    };

    // Use the ProcessManager's updateConfiguration method
    await this.updateConfiguration(newConfig, targetResolver);

    logger.info('Process configuration update complete');
  }

  /**
   * Get target for a process based on route configuration
   */
  private getTargetForProcess(processId: string, processConfig: ProcessConfig): string {
    const serverConfig = configService.getServerConfig();

    // Find the route that corresponds to this process
    const route = serverConfig.routes.find(r => this.getProcessId(r) === processId);

    if (route && route.target) {
      return route.target;
    }

    // Fallback to localhost with a default port
    const defaultPort = 3000 + parseInt(processId.replace(/\D/g, '0'));
    return `http://localhost:${defaultPort}`;
  }

  /**
   * Extract process ID from route configuration
   */
  private getProcessId(route: any): string {
    // Extract process ID from route configuration
    // This is a simplified implementation - adjust based on your actual route structure
    return route.processId || route.domain || 'default';
  }

  /**
   * Get process logs
   */
  async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
    const processes = this.getProcessStatus();
    const process = processes.find(p => p.id === processId);

    if (!process || !process.logFile) {
      return [];
    }

    try {
      const logContent = await fs.readFile(process.logFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim());

      const lineCount = typeof lines === 'string' ? parseInt(lines) : lines;
      return logLines.slice(-lineCount);
    } catch (error) {
      logger.error(`Failed to read logs for process ${processId}`, error);
      return [];
    }
  }

  /**
   * Get process port
   */
  getProcessPort(processId: string): number | null {
    // This would be implemented based on your process port mapping logic
    // For now, return a default port
    const defaultPort = 3000 + parseInt(processId.replace(/\D/g, '0'));
    return defaultPort;
  }

  /**
   * Set callback for process updates
   */
  public setProcessUpdateCallback(callback: () => void): void {
    this.onProcessUpdate = callback;
  }

  public setLogUpdateCallback(callback: (processId: string, newLogs: string[]) => void): void {
    this.onLogUpdate = callback;
  }

  /**
   * Notify listeners of process updates
   */
  private notifyProcessUpdate(): void {
    if (this.onProcessUpdate) {
      this.onProcessUpdate();
    }
  }


  /**
   * Generate PID file path for a process
   */
  private generatePidFilePath(id: string, config: ProcessConfig): string {
    if (config.pidFile) {
      // Use explicit PID file path
      return path.resolve(config.pidFile);
    } else if (config.pidDir) {
      // Use PID directory with generated filename
      return path.resolve(config.pidDir, `${id}.pid`);
    } else {
      // Default to /tmp directory when no PID configuration is provided
      return path.resolve('/tmp', `${id}.pid`);
    }
  }

  /**
   * Generate log file path for a process
   */
  private generateLogFilePath(id: string, config: ProcessConfig): string {
    if (config.pidDir) {
      return path.resolve(config.pidDir, `${id}.log`);
    } else if (config.pidFile) {
      const dir = path.dirname(config.pidFile);
      return path.resolve(dir, `${id}.log`);
    } else {
      return path.resolve('/tmp', `${id}.log`);
    }
  }

  /**
   * Write PID to file
   */
  private async writePidFile(pidFilePath: string, pid: number): Promise<void> {
    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(pidFilePath));

      // Write PID to file
      await fs.writeFile(pidFilePath, pid.toString(), 'utf8');

      logger.debug(`PID file written: ${pidFilePath} (PID: ${pid})`);
    } catch (error) {
      logger.error(`Failed to write PID file ${pidFilePath}`, error);
      throw error;
    }
  }

  /**
   * Remove PID file
   */
  private async removePidFile(pidFilePath: string): Promise<void> {
    try {
      if (await fs.pathExists(pidFilePath)) {
        await fs.unlink(pidFilePath);
        logger.debug(`PID file removed: ${pidFilePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to remove PID file ${pidFilePath}`, error);
    }
  }

  /**
   * Check if process with PID is still running
   */
  private isPidRunning(pid: number): boolean {
    try {
      // process.kill with signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        // Process does not exist
        return false;
      }
      // Other errors mean we can't determine, assume it's running
      return true;
    }
  }

  /**
   * Check if a process is already running and reconnect if possible
   */
  private async checkAndReconnectProcess(id: string, pidFilePath: string, logFilePath: string): Promise<{ pid: number; isRunning: boolean; processMonitor?: NodeJS.Timeout } | null> {
    try {
      if (await fs.pathExists(pidFilePath)) {
        const pidContent = await fs.readFile(pidFilePath, 'utf8');
        const pid = parseInt(pidContent.trim(), 10);

        if (isNaN(pid)) {
          logger.warn(`Invalid PID in file ${pidFilePath}, removing`);
          await this.removePidFile(pidFilePath);
          return null;
        }

        if (this.isPidRunning(pid)) {
          logger.info(`Found existing process ${id} with PID ${pid}, reconnecting`);
          // We'll set up the monitor later when we have access to the managedProcess
          return { pid, isRunning: true };
        } else {
          logger.info(`Process ${id} with PID ${pid} is not running, will start new process`);
          await this.removePidFile(pidFilePath);
          return null;
        }
      }
    } catch (error) {
      logger.error(`Failed to check existing process ${id}`, error);
    }
    return null;
  }

  /**
   * Start monitoring log file directly instead of using tail
   */
  private startLogTailing(id: string, logFilePath: string): void {
    const managedProcess = this.processes.get(id);
    if (!managedProcess) return;

    // Store the current file size to track changes
    let lastFileSize = fs.statSync(logFilePath).size;
    let fileWatcher: fs.FSWatcher | null = null;

    const readNewLogs = async () => {
      try {
        if (!await fs.pathExists(logFilePath)) {
          return;
        }

        const stats = await fs.stat(logFilePath);
        const currentFileSize = stats.size;

        // Only read if file has grown
        if (currentFileSize > lastFileSize) {
          const stream = fs.createReadStream(logFilePath, {
            start: lastFileSize,
            end: currentFileSize - 1
          });

          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString();
          });

          stream.on('end', () => {
            const lines = buffer.split('\n').filter(line => line.trim());
            lines.forEach(line => {
              if (line) {
                logger.info(`[${id}] ${line}`);
              }
            });

            // Notify listeners about new logs
            if (lines.length > 0 && this.onLogUpdate) {
              this.onLogUpdate(id, lines);
            }
          });

          stream.on('error', (error) => {
            logger.error(`Error reading log file for process ${id}`, error);
          });

          lastFileSize = currentFileSize;
        }
      } catch (error) {
        logger.error(`Failed to read log file for process ${id}`, error);
      }
    };

    // Initial read of existing content
    readNewLogs();

    // Set up file watcher to monitor for changes
    try {
      fileWatcher = fs.watch(logFilePath, { persistent: true }, (eventType, filename) => {
        if (eventType === 'change' && filename) {
          // Debounce the read to avoid multiple rapid reads
          setTimeout(readNewLogs, 100);
        }
      });

      fileWatcher.on('error', (error) => {
        logger.error(`Error watching log file for process ${id}`, error);
      });

      // Store the file watcher reference for cleanup
      managedProcess.process = {
        pid: null,
        stdout: null,
        stderr: null,
        stdin: null,
        kill: (signal?: string) => {
          if (fileWatcher) {
            fileWatcher.close();
            fileWatcher = null;
          }
        },
        on: () => { },
        unref: () => { },
        ref: () => { },
        exitCode: null,
        killed: false,
        spawnargs: [],
        spawnfile: '',
        connected: false,
        disconnect: () => { },
        send: () => false,
        channel: null,
        sendHandle: null,
        addListener: () => managedProcess.process!,
        emit: () => false,
        eventNames: () => [],
        getMaxListeners: () => 0,
        listenerCount: () => 0,
        listeners: () => [],
        off: () => managedProcess.process!,
        once: () => managedProcess.process!,
        prependListener: () => managedProcess.process!,
        prependOnceListener: () => managedProcess.process!,
        rawListeners: () => [],
        removeAllListeners: () => managedProcess.process!,
        removeListener: () => managedProcess.process!,
        setMaxListeners: () => managedProcess.process!,
      } as any;

    } catch (error) {
      logger.error(`Failed to set up log file watcher for process ${id}`, error);
    }
  }

  /**
   * Start a managed process
   */
  async startProcess(id: string, config: ProcessConfig, target: string): Promise<void> {
    if (!config.enabled) {
      logger.debug(`Process ${id} is disabled, skipping`);
      return;
    }

    if (this.processes.has(id)) {
      logger.warn(`Process ${id} already exists, killing existing process first`);
      await this.killProcess(id);
    }

    // Generate PID and log file paths
    const pidFilePath = this.generatePidFilePath(id, config);
    const logFilePath = this.generateLogFilePath(id, config);

    // Check if process is already running and try to reconnect
    const existingProcess = await this.checkAndReconnectProcess(id, pidFilePath, logFilePath);

    // Check if this process was previously stopped by user action
    const wasPersistentlyStopped = await this.isProcessPersistentlyStopped(id);

    const managedProcess: ManagedProcess = {
      id,
      config,
      process: null,
      isRunning: false,
      restartCount: 0,
      startTime: null,
      lastRestartTime: null,
      healthCheckFailures: 0,
      lastHealthCheckTime: null,
      pidFilePath,
      logFilePath,
      isReconnected: false,
      isStopped: wasPersistentlyStopped && !existingProcess, // Only stopped if persistently stopped AND not reconnected
      isTerminated: false,
      isRemoved: false,
    };

    this.processes.set(id, managedProcess);

    // Set up scheduler for this process if configured
    this.scheduler.scheduleProcess(id, config);

    if (existingProcess) {
      // Reconnect to existing process
      managedProcess.isRunning = true;
      managedProcess.isReconnected = true;
      managedProcess.isStopped = false; // Reconnected processes are never stopped
      managedProcess.isTerminated = false;
      managedProcess.startTime = new Date();

      // Clear stopped status when reconnected
      await this.clearStoppedStatus(id);

      // Update scheduler status
      this.scheduler.updateProcessStatus(id, true);

      // Set up process death monitoring
      const pid = existingProcess.pid;
      managedProcess.processMonitor = monitorProcessByPid(pid, () => {
        logger.warn(`Reconnected process ${id} (PID ${pid}) has died`);
        clearInterval(managedProcess.processMonitor);

        // Handle process death
        managedProcess.isRunning = false;
        managedProcess.isTerminated = true; // Mark as terminated when process dies
        this.scheduler.updateProcessStatus(id, false);

        if (managedProcess.process) {
          managedProcess.process.kill(); // Kill the tail process
        }

        // Trigger restart if configured and not manually stopped
        if (config.restartOnExit !== false && !this.isShuttingDown && !managedProcess.isStopped) {
          logger.info(`Auto-restarting dead process ${id}`);
          this.restartProcess(id, target).catch(error => {
            logger.error(`Failed to auto-restart process ${id}`, error);
          });
        }
      });

      managedProcess.processMonitor.unref(); // Don't keep process alive just for monitoring

      logger.info(`Reconnected to existing process ${id}`, {
        pid: existingProcess.pid,
        command: config.command,
        logFile: logFilePath,
      });

      // Start tailing the log file for output
      if (await fs.pathExists(logFilePath)) {
        this.startLogTailing(id, logFilePath);
      }

      // Start health check if configured
      if (config.healthCheck?.enabled) {
        this.startHealthCheck(id, target);
      }
    } else {
      // Start new process
      logger.info(`Starting new process ${id}`, {
        command: config.command,
        args: config.args,
        cwd: config.cwd,
        logFile: logFilePath,
      });

      try {
        await this.spawnProcess(managedProcess, target);

        // Update scheduler status
        this.scheduler.updateProcessStatus(id, managedProcess.isRunning);

        // Notify listeners of process update
        this.notifyProcessUpdate();

        logger.info(`Process ${config.name || `proxy-${id}`} started successfully`, {
          pid: managedProcess.process?.pid,
          pidFile: managedProcess.pidFilePath,
          logFile: managedProcess.logFilePath,
          target,
        });
      } catch (error) {
        logger.error(`Failed to start process ${id}`, error);
        this.processes.delete(id);
        throw error;
      }
    }
  }
  /**
   * Stops the process and prevents it from restarting
   * @param id 
   * @returns 
   */
  async stopProcess(id: string): Promise<void> {
    const managedProcess = this.processes.get(id);
    if (!managedProcess) {
      logger.debug(`Process ${id} not found, nothing to stop`);
      return;
    }
    managedProcess.isStopped = true;
    managedProcess.isTerminated = false; // Reset termination state when manually stopped

    // Save stopped status persistently
    await this.saveStoppedStatus();

    await this.killProcess(id);
  }

  /**
   * Kill a managed process (terminates the actual process)
   * @param id Process ID
   */
  async killProcess(id: string): Promise<void> {
    const managedProcess = this.processes.get(id);
    if (!managedProcess) {
      logger.debug(`Process ${id} not found, nothing to stop`);
      return;
    }

    logger.info(`Killing process ${id} (terminating the actual process)`);

    // Try to kill the actual process using PID from file
    try {
      if (await fs.pathExists(managedProcess.pidFilePath)) {
        const pidContent = await fs.readFile(managedProcess.pidFilePath, 'utf8');
        const pid = parseInt(pidContent.trim(), 10);

        if (!isNaN(pid)) {
          if (this.isPidRunning(pid)) {
            logger.info(`Killing process ${id} with PID ${pid}`);

            // Try graceful termination first
            try {
              process.kill(pid, 'SIGTERM');

              // Wait a bit for graceful shutdown
              await new Promise(resolve => setTimeout(resolve, 2000));

              // Check if process is still running
              if (this.isPidRunning(pid)) {
                logger.warn(`Process ${id} did not terminate gracefully, forcing kill with SIGKILL`);
                process.kill(pid, 'SIGKILL');

                // Wait a bit more
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (error: any) {
              if (error.code === 'ESRCH') {
                logger.debug(`Process ${id} with PID ${pid} was already terminated`);
              } else {
                logger.warn(`Failed to kill process ${id} with PID ${pid}: ${error.message}`);
              }
            }
          } else {
            logger.info(`Process ${id} with PID ${pid} is not running, marking as stopped`);
          }
        }
      }

      // Also try to kill the child process directly if we have a reference
      if (managedProcess.process && managedProcess.process.pid) {
        if (this.isPidRunning(managedProcess.process.pid)) {
          try {
            managedProcess.process.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (this.isPidRunning(managedProcess.process.pid)) {
              managedProcess.process.kill('SIGKILL');
            }
          } catch (error: any) {
            if (error.code !== 'ESRCH') {
              logger.debug(`Failed to kill child process reference for ${id}: ${error.message}`);
            }
          }
        } else {
          logger.debug(`Child process reference for ${id} with PID ${managedProcess.process.pid} is not running`);
        }
      }

      // Remove PID file after killing or if process was already stopped
      await this.removePidFile(managedProcess.pidFilePath);

    } catch (error) {
      logger.error(`Error while killing process ${id}:`, error);
    }

    // Stop health check
    this.stopHealthCheck(id);

    // Clear process monitor if it exists
    if (managedProcess.processMonitor) {
      clearInterval(managedProcess.processMonitor);
    }

    // If this is a reconnected process, we only need to stop our tail process
    if (managedProcess.isReconnected && managedProcess.process) {
      managedProcess.process.kill('SIGTERM'); // Kill the tail process, not the actual managed process
    }

    // Always remove PID file when killing

    managedProcess.isRunning = false;
    managedProcess.isStopped = true;
    managedProcess.isTerminated = false; // Reset termination state when manually killed

    // Notify listeners of process update
    this.notifyProcessUpdate();

    logger.info(`Process ${managedProcess.config.name || `proxy-${id}`} killed successfully`);
  }

  /**
   * Detach from a managed process without killing it
   */
  async detachProcess(id: string): Promise<void> {
    const managedProcess = this.processes.get(id);
    if (!managedProcess) {
      logger.debug(`Process ${id} not found, nothing to detach`);
      return;
    }

    logger.info(`Detaching from process ${id} (process will continue running)`);

    // Stop health check
    this.stopHealthCheck(id);

    // Clear process monitor if it exists
    if (managedProcess.processMonitor) {
      clearInterval(managedProcess.processMonitor);
    }

    // If this is a reconnected process, we only need to stop our tail process
    if (managedProcess.isReconnected && managedProcess.process) {
      managedProcess.process.kill('SIGTERM'); // Kill the tail process, not the actual managed process
    }

    // Do NOT remove PID file - preserve it for reconnection

    managedProcess.isRunning = false;
    managedProcess.isStopped = true;
    managedProcess.isTerminated = false; // Reset termination state when manually detached

    // Notify listeners of process update
    this.notifyProcessUpdate();

    logger.info(`Process ${managedProcess.config.name || `proxy-${id}`} detached successfully`);
  }

  /**
   * Restart a managed process
   */
  async restartProcess(id: string, target: string): Promise<void> {
    const managedProcess = this.processes.get(id);
    if (!managedProcess) {
      logger.warn(`Cannot restart process ${id}: not found`);
      return;
    }

    // Don't restart if the process was manually stopped by management console
    if (managedProcess.isStopped) {
      logger.info(`Skipping restart for process ${id}: process was manually stopped`);
      return;
    }

    logger.info(`Restarting process ${id}`);

    // Check restart limits
    const maxRestarts = managedProcess.config.maxRestarts || 5;
    if (managedProcess.restartCount >= maxRestarts) {
      logger.error(`Process ${id} has exceeded maximum restart attempts (${maxRestarts})`);
      return;
    }

    managedProcess.restartCount++;
    managedProcess.lastRestartTime = new Date();

    // Stop health check
    this.stopHealthCheck(id);

    // If this is a reconnected process, only kill our tail process
    if (managedProcess.isReconnected && managedProcess.process) {
      managedProcess.process.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Reset reconnection state
    managedProcess.isReconnected = false;
    managedProcess.isStopped = false;
    managedProcess.isTerminated = false;

    // Wait for restart delay
    const restartDelay = managedProcess.config.restartDelay || 1000;
    await new Promise(resolve => setTimeout(resolve, restartDelay));

    // First try to reconnect to existing process
    const existingProcess = await this.checkAndReconnectProcess(id, managedProcess.pidFilePath, managedProcess.logFilePath);

    if (existingProcess) {
      // Reconnected to existing process
      managedProcess.isRunning = true;
      managedProcess.isReconnected = true;
      managedProcess.isTerminated = false;

      // Clear stopped status when reconnected during restart
      await this.clearStoppedStatus(id);

      logger.info(`Reconnected to existing process ${id} during restart`, {
        pid: existingProcess.pid,
      });

      // Start tailing the log file for output
      if (await fs.pathExists(managedProcess.logFilePath)) {
        this.startLogTailing(id, managedProcess.logFilePath);
      }

      // Start health check if configured
      if (managedProcess.config.healthCheck?.enabled) {
        this.startHealthCheck(id, target);
      }
    } else {
      // Start new process
      try {
        await this.spawnProcess(managedProcess, target);

        // Clear stopped status when new process is started
        await this.clearStoppedStatus(id);

        // Notify listeners of process update
        this.notifyProcessUpdate();

        logger.info(`Process ${id} restarted successfully`, {
          pid: managedProcess.process?.pid,
          restartCount: managedProcess.restartCount,
          target,
        });
      } catch (error) {
        logger.error(`Failed to restart process ${id}`, error);
      }
    }
  }

  /**
   * Spawn the actual process
   */
  private async spawnProcess(managedProcess: ManagedProcess, target: string): Promise<void> {
    const { id, config, logFilePath } = managedProcess;

    // Ensure log file directory exists
    await fs.ensureDir(path.dirname(logFilePath));

    return new Promise((resolve, reject) => {
      // Generate process name for ps output
      const processName = config.name || `proxy-${id}`;

      // Build environment variables with enhanced support
      const processEnv = this.buildProcessEnvironment(id, config, processName);

      const processOptions: any = {
        cwd: config.cwd ? path.resolve(config.cwd) : process.cwd(),
        env: processEnv,
        // Detach the process so it survives parent exit
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      };

      // Create command array with process name
      let commandArgs = config.args || [];

      // For Node.js processes, we can set the process title more reliably
      if (config.command === 'node' || config.command.endsWith('/node')) {
        // Add process name to the command line arguments
        // This will show up in ps output as part of the command line
        commandArgs = ['--title', processName, ...commandArgs];

        // Set additional Node.js options for process naming
        const existingNodeOptions = processOptions.env.NODE_OPTIONS || '';
        processOptions.env.NODE_OPTIONS = `${existingNodeOptions} --max-old-space-size=4096`.trim();
      } else if (config.command === 'ts-node' || config.command.endsWith('/ts-node')) {
        // For ts-node processes, we can't use --title as it's not supported
        // Instead, we'll use environment variables and let the child process set its own title
        // Don't add --title argument to avoid the error

        // Set additional Node.js options for ts-node process naming
        const existingNodeOptions = processOptions.env.NODE_OPTIONS || '';
        processOptions.env.NODE_OPTIONS = `${existingNodeOptions} --max-old-space-size=4096`.trim();

        // Set ts-node specific environment variables
        processOptions.env.TS_NODE_PROJECT = processOptions.env.TS_NODE_PROJECT || 'tsconfig.json';
      } else if (config.command === 'bun' || config.command.endsWith('/bun')) {
        // For Bun processes, we can set the process title via environment variables
        // Don't add --title argument to avoid potential conflicts

        // Set Bun-specific environment variables for process naming
        processOptions.env.BUN_PROCESS_NAME = processName;

        // Set additional Bun options if needed
        const existingBunOptions = processOptions.env.BUN_OPTIONS || '';
        processOptions.env.BUN_OPTIONS = `${existingBunOptions}`.trim();
      } else if (config.command === 'deno' || config.command.endsWith('/deno')) {
        // For Deno processes, we can set the process title
        commandArgs = ['--title', processName, ...commandArgs];

        // Set Deno-specific environment variables for process naming
        processOptions.env.DENO_PROCESS_NAME = processName;

        // Set additional Deno options for better process visibility
        const existingDenoOptions = processOptions.env.DENO_OPTIONS || '';
        processOptions.env.DENO_OPTIONS = `${existingDenoOptions} --allow-all`.trim();
      } else if (config.command === 'python' || config.command.endsWith('/python')) {
        // For Python processes, we can set the process name
        commandArgs = ['-u', ...commandArgs]; // -u for unbuffered output
        processOptions.env.PYTHONUNBUFFERED = '1';
      } else if (config.command === 'java' || config.command.endsWith('/java')) {
        // For Java processes, we can set the process name via JVM arguments
        const existingJavaOpts = processOptions.env.JAVA_OPTS || '';
        processOptions.env.JAVA_OPTS = `${existingJavaOpts} -Dprocess.name="${processName}"`.trim();
      }

      const childProcess = spawn(config.command, commandArgs, processOptions);

      // Set process title for the child process if possible
      if (childProcess.pid) {
        try {
          // On Unix-like systems, we can set the process title
          if (process.platform !== 'win32') {
            // Use process title setting if available
            process.title = processName;
          }
        } catch (error) {
          // Ignore errors setting process title
          logger.debug(`Could not set process title for ${id}: ${error}`);
        }
      }

      // Redirect stdout and stderr to log file with proper formatting
      const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            // Add stdout prefix to log file
            const timestamp = new Date().toISOString();
            logStream.write(`[${timestamp}] [STDOUT] ${output}\n`);
            logger.info(`[${processName}] ${output}`);
          }
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            // Add stderr prefix to log file
            const timestamp = new Date().toISOString();
            logStream.write(`[${timestamp}] [STDERR] ${output}\n`);
            logger.warn(`[${processName}] STDERR: ${output}`);
          }
        });
      }

      // Handle process startup
      childProcess.on('spawn', async () => {
        managedProcess.process = childProcess;
        managedProcess.isRunning = true;
        managedProcess.isStopped = false;
        managedProcess.isTerminated = false;
        managedProcess.startTime = new Date();

        // Clear stopped status when process is successfully started
        await this.clearStoppedStatus(id);

        // Write PID file
        if (childProcess.pid) {
          try {
            await this.writePidFile(managedProcess.pidFilePath, childProcess.pid);
          } catch (error) {
            logger.error(`Failed to write PID file for process ${processName}`, error);
          }
        }

        // Detach the process from the parent to prevent it from being killed
        if (childProcess.pid) {
          childProcess.unref();

          // On Unix-like systems, create a new process group for the child
          // This ensures it won't be killed when the parent process group is terminated
          if (process.platform !== 'win32') {
            try {
              // Set the child process to its own process group
              process.kill(childProcess.pid, 0); // Check if process is still running
              // Note: We can't directly set process group from parent, but detached: true should handle this
            } catch (error) {
              logger.debug(`Could not verify process group for ${id}: ${error}`);
            }
          }
        }

        logger.info(`Process ${processName} started successfully`, {
          id,
          pid: childProcess.pid,
          command: config.command,
          args: commandArgs,
          processName,
          pidFile: managedProcess.pidFilePath,
          logFile: managedProcess.logFilePath,
          detached: true,
          envVarsCount: Object.keys(processEnv).length,
          // Note: This process will survive when the process manager is terminated
        });

        // Start health check if configured
        if (config.healthCheck?.enabled) {
          this.startHealthCheck(id, target);
        }

        resolve();
      });

      // Handle process exit
      childProcess.on('exit', async (code, signal) => {
        managedProcess.isRunning = false;
        managedProcess.isTerminated = true; // Mark as terminated when process exits

        // Only remove PID file if cleanup is enabled AND the process exited normally
        // This preserves PID files for unexpected exits to allow reconnection
        if (config.cleanupPidOnExit !== false && code === 0) {
          try {
            await this.removePidFile(managedProcess.pidFilePath);
          } catch (error) {
            logger.error(`Failed to remove PID file for process ${processName}`, error);
          }
        }

        const exitInfo = {
          id,
          processName,
          pid: childProcess.pid,
          code,
          signal,
          uptime: managedProcess.startTime ? Date.now() - managedProcess.startTime.getTime() : 0,
        };

        if (this.isShuttingDown) {
          logger.info(`Process ${processName} exited during shutdown, PID file preserved for reconnection`, exitInfo);
          return;
        }

        if (code === 0) {
          logger.info(`Process ${processName} exited normally`, exitInfo);
        } else {
          logger.warn(`Process ${processName} exited unexpectedly, PID file preserved for potential reconnection`, exitInfo);
        }

        // Auto-restart if configured and not manually stopped
        if (config.restartOnExit !== false && !this.isShuttingDown && !managedProcess.isStopped) {
          logger.info(`Auto-restarting process ${processName}`);
          setTimeout(() => {
            this.restartProcess(id, target).catch(error => {
              logger.error(`Failed to auto-restart process ${processName}`, error);
            });
          }, config.restartDelay || 1000);
        }
      });

      // Handle process errors
      childProcess.on('error', (error) => {
        logger.error(`Process ${processName} error`, error);
        managedProcess.isRunning = false;
        managedProcess.isTerminated = true; // Mark as terminated when process errors
        reject(error);
      });
    });
  }

  /**
   * Build environment variables for a process with enhanced support
   */
  private buildProcessEnvironment(id: string, config: ProcessConfig, processName: string): NodeJS.ProcessEnv {
    // Start with a clean environment, excluding proxy-specific variables
    const baseEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        key !== 'PORT' &&
        key !== 'HTTPS_PORT' &&
        key !== 'CONFIG_FILE' &&
        key !== 'LOG_LEVEL' &&
        key !== 'LOG_FILE' &&
        key !== 'RATE_LIMIT_' &&
        key !== 'PRIMARY_DOMAIN' &&
        key !== 'CERT_DIR'
      )
    );

    // Process custom environment variables with substitution
    const customEnv = this.processEnvironmentVariables(config.env || {}, id, processName);

    // Set process identification environment variables
    const processEnv = {
      PROCESS_NAME: processName,
      PROXY_PROCESS_ID: id,
      PROXY_PROCESS_NAME: processName,
    };

    // Merge all environment variables (custom env overrides base env)
    const finalEnv = {
      ...baseEnv,
      ...customEnv,
      ...processEnv,
    };

    // Validate environment variables if configured
    if (config.envValidation?.validateOnStart !== false) {
      this.validateEnvironmentVariables(id, finalEnv, config);
    }

    // Log environment variable information (without sensitive values)
    this.logEnvironmentVariables(id, finalEnv, config.env || {});

    return finalEnv;
  }

  /**
   * Validate environment variables for a process
   */
  private validateEnvironmentVariables(id: string, env: NodeJS.ProcessEnv, config: ProcessConfig): void {
    const validation = config.envValidation;
    if (!validation) return;

    const missing: string[] = [];
    const invalid: string[] = [];

    // Check required environment variables
    const requiredVars = validation.required || config.requiredEnv || [];
    for (const varName of requiredVars) {
      if (!env[varName] || env[varName].trim() === '') {
        missing.push(varName);
      }
    }

    // Check optional environment variables (if they exist, validate their format)
    const optionalVars = validation.optional || [];
    for (const varName of optionalVars) {
      if (env[varName] !== undefined) {
        // Add custom validation logic here if needed
        // For now, just check if it's not empty if it exists
        if (env[varName] && env[varName].trim() === '') {
          invalid.push(varName);
        }
      }
    }

    // Log validation results
    if (missing.length > 0) {
      const message = `Missing required environment variables for process ${id}: ${missing.join(', ')}`;
      if (validation.failOnMissing !== false) {
        throw new Error(message);
      } else {
        logger.warn(message);
      }
    }

    if (invalid.length > 0) {
      logger.warn(`Invalid environment variables for process ${id}: ${invalid.join(', ')}`);
    }

    if (missing.length === 0 && invalid.length === 0) {
      logger.debug(`Environment variable validation passed for process ${id}`);
    }
  }

  /**
   * Process environment variables with substitution support
   */
  private processEnvironmentVariables(envConfig: Record<string, string>, id: string, processName: string): Record<string, string> {
    const processed: Record<string, string> = {};

    for (const [key, value] of Object.entries(envConfig)) {
      try {
        // Support environment variable substitution in values
        const substitutedValue = this.substituteEnvironmentVariables(value, id, processName);
        processed[key] = substitutedValue;
      } catch (error) {
        logger.warn(`Failed to process environment variable ${key} for process ${id}: ${error}`);
        // Use original value if substitution fails
        processed[key] = value;
      }
    }

    return processed;
  }

  /**
   * Substitute environment variables in a string value
   */
  private substituteEnvironmentVariables(value: string, id: string, processName: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      // Handle special variables
      switch (varName) {
        case 'PROCESS_ID':
        case 'PROXY_PROCESS_ID':
          return id;
        case 'PROCESS_NAME':
        case 'PROXY_PROCESS_NAME':
          return processName;
        case 'PID':
          // This will be available after process spawn
          return '${PID}'; // Keep as placeholder for now
        case 'TIMESTAMP':
          return new Date().toISOString();
        case 'RANDOM':
          return Math.random().toString(36).substring(2, 15);
        default:
          // Check if it's an environment variable
          const envValue = process.env[varName];
          if (envValue !== undefined) {
            return envValue;
          }

          // Check if it's a built-in Node.js variable
          const builtInValue = process[varName as keyof NodeJS.Process];
          if (builtInValue !== undefined) {
            return String(builtInValue);
          }

          // If not found, log a warning and keep the placeholder
          logger.warn(`Environment variable ${varName} not found for process ${id}, keeping placeholder: ${match}`);
          return match;
      }
    });
  }

  /**
   * Log environment variable information (without sensitive values)
   */
  private logEnvironmentVariables(id: string, env: NodeJS.ProcessEnv, customEnv: Record<string, string>): void {
    const sensitiveKeys = [
      'PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'AUTH', 'CREDENTIAL', 'PRIVATE',
      'API_KEY', 'API_SECRET', 'DATABASE_URL', 'DB_PASSWORD', 'JWT_SECRET',
      'OAUTH_SECRET', 'CLIENT_SECRET', 'ACCESS_TOKEN', 'REFRESH_TOKEN'
    ];

    const customEnvKeys = Object.keys(customEnv);
    const sensitiveCustomKeys = customEnvKeys.filter(key =>
      sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))
    );

    logger.debug(`Environment variables for process ${id}`, {
      totalEnvVars: Object.keys(env).length,
      customEnvVars: customEnvKeys.length,
      sensitiveCustomVars: sensitiveCustomKeys.length,
      customEnvKeys: customEnvKeys.filter(key => !sensitiveCustomKeys.includes(key)),
      // Don't log sensitive environment variable names or values
    });

    if (sensitiveCustomKeys.length > 0) {
      logger.debug(`Sensitive environment variables detected for process ${id} (values not logged): ${sensitiveCustomKeys.join(', ')}`);
    }
  }

  /**
   * Start health check for a process
   */
  private startHealthCheck(id: string, target: string): void {
    const managedProcess = this.processes.get(id);
    if (!managedProcess || !managedProcess.config.healthCheck?.enabled) {
      return;
    }

    const healthConfig = managedProcess.config.healthCheck;
    const interval = healthConfig.interval || 30000; // 30 seconds default
    const healthCheckPath = healthConfig.path || '/health';
    const timeout = healthConfig.timeout || 5000;
    const maxRetries = healthConfig.retries || 3;
    const processName = managedProcess.config.name || `proxy-${id}`;

    const healthCheckInterval = setInterval(async () => {
      let healthUrl: string = "unset";
      try {
        // Update last health check time
        managedProcess.lastHealthCheckTime = new Date();

        // Check if healthCheckPath is already a full URL
        if (healthCheckPath.startsWith('http://') || healthCheckPath.startsWith('https://')) {
          // Use the full URL directly
          healthUrl = healthCheckPath;
        } else {
          // Append the path to the target URL
          healthUrl = `${target}${healthCheckPath}`;
        }

        logger.debug(`Health check request to ${healthUrl}`);
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(timeout),
        });

        // Check if status is in the valid range (axios validateStatus equivalent)
        if (!(response.status >= 200 && response.status < 300)) {
          throw new Error(`Health check failed with status ${response.status}`);
        }

        // Reset failure count on successful health check
        managedProcess.healthCheckFailures = 0;

        logger.debug(`Health check passed for process ${processName}`, {
          url: healthUrl,
          status: response.status,
        });
      } catch (error) {
        managedProcess.healthCheckFailures++;

        logger.warn(`Health check failed for process ${processName}`, {
          url: healthUrl,
          failures: managedProcess.healthCheckFailures,
          maxRetries,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Restart process if health check fails too many times
        if (managedProcess.healthCheckFailures >= maxRetries) {
          logger.error(`Process ${processName} failed health check ${maxRetries} times, killing child process`);
          await this.killChildProcess(id);
          // Optionally restart if configured and not manually stopped
          if (managedProcess.config.restartOnExit !== false && !managedProcess.isStopped) {
            logger.info(`Restarting process ${processName} after health check failure`);
            this.restartProcess(id, target).catch(restartError => {
              logger.error(`Failed to restart unhealthy process ${processName}`, restartError);
            });
          }
        }
      }
    }, interval);

    this.healthCheckIntervals.set(id, healthCheckInterval);
    logger.info(`Health check started for process ${processName}`, {
      interval,
      path: healthCheckPath,
      timeout,
      maxRetries,
    });
  }

  /**
   * Stop health check for a process
   */
  private stopHealthCheck(id: string): void {
    const interval = this.healthCheckIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(id);

      const managedProcess = this.processes.get(id);
      const processName = managedProcess?.config.name || `proxy-${id}`;
      logger.debug(`Health check stopped for process ${processName}`);
    }
  }

  /**
   * Mark a process as removed from configuration
   */
  markProcessAsRemoved(id: string): void {
    const managedProcess = this.processes.get(id);
    if (managedProcess) {
      managedProcess.isRemoved = true;
      logger.info(`Process ${id} marked as removed from configuration`);
    }
  }

  /**
   * Get status of all managed processes
   */
  getProcessStatus(): Array<{
    id: string;
    name?: string;
    isRunning: boolean;
    pid?: number;
    pidFile?: string;
    logFile?: string;
    isReconnected?: boolean;
    restartCount: number;
    startTime: Date | null;
    lastRestartTime: Date | null;
    uptime?: number;
    healthCheckFailures: number;
    lastHealthCheckTime: Date | null;
    isStopped: boolean;
    isTerminated: boolean;
    isRemoved: boolean;
  }> {
    return Array.from(this.processes.values()).map(proc => {
      // Check if the process is actually running
      let actualIsRunning = proc.isRunning;
      let actualPid = proc.process?.pid;

      if (proc.process?.pid) {
        // For spawned processes, check if the PID is still running
        actualIsRunning = this.isPidRunning(proc.process.pid);
        actualPid = proc.process.pid;
      } else if (proc.isReconnected && !proc.isStopped) {
        // For reconnected processes, read the PID from the PID file and check if it's running
        try {
          const pidContent = fs.readFileSync(proc.pidFilePath, 'utf8');
          const pid = parseInt(pidContent.trim(), 10);
          if (!isNaN(pid)) {
            actualPid = pid;
            actualIsRunning = this.isPidRunning(pid);
          } else {
            actualIsRunning = false;
          }
        } catch (error) {
          // If we can't read the PID file, assume the process is not running
          actualIsRunning = false;
        }
      } else if (proc.isStopped) {
        // If explicitly stopped by user, mark as not running
        actualIsRunning = false;
      } else if (proc.isTerminated) {
        // If terminated (crashed/exited), mark as not running
        actualIsRunning = false;
      }

      return {
        id: proc.id,
        name: proc.config.name || `proxy-${proc.id}`,
        isRunning: actualIsRunning,
        pid: actualPid,
        pidFile: proc.pidFilePath,
        logFile: proc.logFilePath,
        isReconnected: proc.isReconnected,
        restartCount: proc.restartCount,
        startTime: proc.startTime,
        lastRestartTime: proc.lastRestartTime,
        uptime: proc.startTime ? Date.now() - proc.startTime.getTime() : undefined,
        healthCheckFailures: proc.healthCheckFailures,
        lastHealthCheckTime: proc.lastHealthCheckTime,
        isStopped: proc.isStopped,
        isTerminated: proc.isTerminated,
        isRemoved: proc.isRemoved,
      };
    });
  }

  /**
   * Check if a process is running
   */
  isProcessRunning(id: string): boolean {
    const managedProcess = this.processes.get(id);
    return managedProcess?.isRunning || false;
  }

  /**
   * Gracefully shutdown process manager (detach from processes without killing them)
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down process manager (processes will continue running)...');

    // Stop file watching
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    // Clear any pending timeouts
    if (this.reinitializeTimeout) {
      clearTimeout(this.reinitializeTimeout);
      this.reinitializeTimeout = null;
    }

    // Stop scheduler
    this.scheduler.shutdown();

    // Stop all health checks
    for (const id of Array.from(this.healthCheckIntervals.keys())) {
      this.stopHealthCheck(id);
    }

    // Detach from all processes without killing them
    const shutdownPromises = Array.from(this.processes.keys()).map(id =>
      this.detachProcess(id)
    );

    await Promise.all(shutdownPromises);
    logger.info('Process manager shutdown complete - all managed processes left running');
  }

  /**
   * Kill the child process and remove the PID file (used only for health check failures)
   */
  private async killChildProcess(id: string): Promise<void> {
    const managedProcess = this.processes.get(id);
    if (!managedProcess) return;
    if (managedProcess.process && managedProcess.process.pid) {
      try {
        process.kill(managedProcess.process.pid, 'SIGKILL');
        managedProcess.isRunning = false;
        await this.removePidFile(managedProcess.pidFilePath);
        logger.warn(`Child process ${id} killed due to health check failure`);
      } catch (error) {
        logger.error(`Failed to kill child process ${id}`, error);
      }
    }
  }

  /**
   * Forcefully kill and restart a process (for management console use only)
   */
  public async forceKillAndRestartProcess(id: string, target: string): Promise<void> {
    const managedProcess = this.processes.get(id);
    if (!managedProcess) {
      logger.warn(`Cannot force kill/restart process ${id}: not found`);
      return;
    }
    logger.info(`Force killing and restarting process ${id} by management console request`);
    // Kill the child process if running
    if (managedProcess.process && managedProcess.process.pid) {
      try {
        process.kill(managedProcess.process.pid, 'SIGKILL');
        managedProcess.isRunning = false;
        await this.removePidFile(managedProcess.pidFilePath);
        logger.warn(`Child process ${id} force killed by management console request`);
      } catch (error) {
        logger.error(`Failed to force kill child process ${id}`, error);
      }
    }
    // Wait a moment to ensure process is dead
    await new Promise(resolve => setTimeout(resolve, 500));
    // Start a new process
    try {
      await this.spawnProcess(managedProcess, target);
      this.notifyProcessUpdate();
      logger.info(`Process ${id} force restarted successfully`);
    } catch (error) {
      logger.error(`Failed to force restart process ${id}`, error);
    }
  }

  /**
   * Update scheduler process status
   */
  private updateSchedulerProcessStatus(id: string, isRunning: boolean): void {
    this.scheduler.updateProcessStatus(id, isRunning);
    this.notifyProcessUpdate();
  }

  /**
   * Initialize schedules for all processes in a configuration
   */
  public initializeSchedules(config: ProcessManagementConfig): void {
    logger.info('Initializing process schedules');

    for (const [id, processConfig] of Object.entries(config.processes)) {
      if (processConfig.schedule?.enabled) {
        this.scheduler.scheduleProcess(id, processConfig);
      }
    }
  }

  /**
   * Get scheduler instance
   */
  public getScheduler(): ProcessScheduler {
    return this.scheduler;
  }

  /**
   * Update process management configuration and apply changes
   */
  public async updateConfiguration(newConfig: ProcessManagementConfig, targetResolver?: (id: string, config: ProcessConfig) => string): Promise<void> {
    logger.info('Updating process management configuration', {
      processCount: Object.keys(newConfig.processes).length,
      processes: Object.keys(newConfig.processes)
    });

    const currentProcesses = this.getProcessStatus();
    const newProcessIds = new Set(Object.keys(newConfig.processes));
    const currentProcessIds = new Set(currentProcesses.map(p => p.id));

    // Start new processes
    for (const [processId, processConfig] of Object.entries(newConfig.processes)) {
      if (!currentProcessIds.has(processId) && processConfig.enabled !== false) {
        logger.info(`Starting new process: ${processId}`);
        try {
          const target = targetResolver ? targetResolver(processId, processConfig) : `http://localhost:3000`;
          await this.startProcess(processId, processConfig, target);
        } catch (error) {
          logger.error(`Failed to start new process: ${processId}`, error);
        }
      }
    }

    // Stop removed processes
    for (const processId of Array.from(currentProcessIds)) {
      if (!newProcessIds.has(processId)) {
        logger.info(`Killing removed process: ${processId}`);
        try {
          await this.killProcess(processId);
          this.markProcessAsRemoved(processId);
        } catch (error) {
          logger.error(`Failed to kill removed process: ${processId}`, error);
        }
      }
    }

    // Update existing processes if configuration changed
    for (const [processId, newProcessConfig] of Object.entries(newConfig.processes)) {
      if (currentProcessIds.has(processId)) {
        const currentProcess = this.processes.get(processId);
        if (currentProcess && this.hasProcessConfigChanged(currentProcess.config, newProcessConfig)) {
          logger.info(`Configuration changed for process: ${processId}, restarting`);
          try {
            await this.killProcess(processId);
            const target = targetResolver ? targetResolver(processId, newProcessConfig) : `http://localhost:3000`;
            await this.startProcess(processId, newProcessConfig, target);
          } catch (error) {
            logger.error(`Failed to restart process with new config: ${processId}`, error);
          }
        }
      }
    }

    // Update scheduler with new configurations
    this.scheduler.clearSchedules();
    this.initializeSchedules(newConfig);

    logger.info('Process management configuration update complete');
  }

  /**
   * Check if process configuration has changed
   */
  private hasProcessConfigChanged(oldConfig: ProcessConfig, newConfig: ProcessConfig): boolean {
    // Compare key configuration properties
    const keysToCompare = [
      'command', 'args', 'cwd', 'env', 'restartOnExit',
      'restartDelay', 'maxRestarts', 'healthCheck', 'schedule'
    ];

    for (const key of keysToCompare) {
      const oldValue = (oldConfig as any)[key];
      const newValue = (newConfig as any)[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        logger.debug(`Process config changed for key: ${key}`, {
          old: oldValue,
          new: newValue
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Set up configuration change handling
   */
  private setupConfigChangeHandling(): void {
    // Listen for configuration reload events
    configService.on('configReloading', () => {
      logger.info('Process manager: Configuration reloading...');
    });

    configService.on('configReloaded', (newConfigs: any) => {
      logger.info('Process manager: Configuration reloaded, updating processes...');
      this.handleConfigUpdate(newConfigs);
    });

    configService.on('configReloadError', (error: any) => {
      logger.error('Process manager: Configuration reload failed', error);
    });
  }

  /**
   * Handle configuration updates
   */
  private async handleConfigUpdate(newConfigs: any): Promise<void> {
    try {
      // Update process management configuration
      if (newConfigs.processConfig) {
        await this.updateConfiguration(newConfigs.processConfig);
      }

      // Update scheduler with new configuration
      if (newConfigs.processConfig) {
        this.initializeSchedules(newConfigs.processConfig);
      }

      logger.info('Process manager configuration updated successfully');
    } catch (error) {
      logger.error('Failed to update process manager configuration', error);
    }
  }
}

export const processManager = new ProcessManager();