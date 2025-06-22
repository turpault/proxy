import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
import { watch } from 'fs';
import { logger } from '../utils/logger';
import { ProcessConfig, ProcessManagementConfig } from '../types';
import axios from 'axios';

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
  isStopped: boolean; // Whether this process has been manually stopped
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
  private configFilePath: string | null = null;
  private fileWatcher: fs.FSWatcher | null = null;
  private reinitializeTimeout: NodeJS.Timeout | null = null;
  private onConfigUpdate: ((config: ProcessManagementConfig) => void) | null = null;
  private onProcessUpdate: (() => void) | null = null;

  constructor() {
    // Handle graceful shutdown
    // Note: This process manager is designed to NEVER kill child processes
    // Child processes are spawned with detached: true and will survive
    // when the process manager is terminated
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Set callback for process updates
   */
  public setProcessUpdateCallback(callback: () => void): void {
    this.onProcessUpdate = callback;
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
   * Load process management configuration directly from YAML file
   */
  public async loadProcessConfig(configFilePath: string): Promise<ProcessManagementConfig | null> {
    try {
      const configContent = await fs.readFile(configFilePath, 'utf8');
      const { parse } = await import('yaml');
      const config = parse(configContent) as ProcessManagementConfig;
      
      // Basic validation
      if (!config.processes) {
        throw new Error('Invalid process configuration: missing processes section');
      }
      
      logger.info(`Process management configuration loaded from ${configFilePath}`, {
        processCount: Object.keys(config.processes).length,
        processes: Object.keys(config.processes)
      });
      
      return config;
    } catch (error) {
      logger.error(`Failed to load process management configuration from ${configFilePath}`, error);
      return null;
    }
  }

  /**
   * Set up file watching for the processes configuration file
   */
  public setupFileWatching(configFilePath: string, onConfigUpdate: (config: ProcessManagementConfig) => void): void {
    this.configFilePath = configFilePath;
    this.onConfigUpdate = onConfigUpdate;
    
    // Start watching the file
    this.startFileWatcher();
    
    logger.info(`Process manager watching for changes in ${configFilePath}`);
  }

  /**
   * Start watching the processes configuration file
   */
  private startFileWatcher(): void {
    if (!this.configFilePath) {
      logger.warn('No config file path set for file watching');
      return;
    }

    try {
      // Stop existing watcher if any
      if (this.fileWatcher) {
        this.fileWatcher.close();
      }

      this.fileWatcher = watch(this.configFilePath, { persistent: true }, (eventType, filename) => {
        if (eventType === 'change' && filename) {
          logger.info(`Process configuration file changed: ${filename}`);
          this.scheduleReinitialize();
        }
      });

      this.fileWatcher.on('error', (error) => {
        logger.error('Error watching process configuration file', error);
      });

    } catch (error) {
      logger.error('Failed to start file watcher for process configuration', error);
    }
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
   * Reinitialize process management from the configuration file
   */
  private async reinitializeFromFile(): Promise<void> {
    if (!this.configFilePath || !this.onConfigUpdate) {
      logger.warn('Cannot reinitialize: missing config file path or update callback');
      return;
    }

    try {
      logger.info('Reinitializing process management from updated configuration file');
      
      // Read and parse the updated configuration
      const configContent = await fs.readFile(this.configFilePath, 'utf8');
      const { parse } = await import('yaml');
      const newConfig = parse(configContent) as ProcessManagementConfig;

      // Validate the configuration
      if (!newConfig.processes) {
        throw new Error('Invalid process configuration: missing processes section');
      }

      // Call the update callback to notify the proxy server
      this.onConfigUpdate(newConfig);
      
      logger.info('Process management configuration updated successfully');
    } catch (error) {
      logger.error('Failed to reinitialize process management from file', error);
    }
  }

  /**
   * Stop file watching
   */
  public stopFileWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    
    if (this.reinitializeTimeout) {
      clearTimeout(this.reinitializeTimeout);
      this.reinitializeTimeout = null;
    }
    
    this.configFilePath = null;
    this.onConfigUpdate = null;
    
    logger.info('Process manager file watching stopped');
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
   * Start tailing log file to monitor process output
   */
  private startLogTailing(id: string, logFilePath: string): void {
    // Use tail -f to follow the log file
    const tailProcess = spawn('tail', ['-f', logFilePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    tailProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.info(`[${id}] ${output}`);
      }
    });

    tailProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.warn(`[${id}] TAIL-ERROR: ${output}`);
      }
    });

    tailProcess.on('error', (error) => {
      logger.error(`Failed to tail log file for process ${id}`, error);
    });

    // Store the tail process reference for cleanup
    const managedProcess = this.processes.get(id);
    if (managedProcess) {
      managedProcess.process = tailProcess;
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
      logger.warn(`Process ${id} already exists, stopping existing process first`);
      await this.stopProcess(id);
    }

    // Generate PID and log file paths
    const pidFilePath = this.generatePidFilePath(id, config);
    const logFilePath = this.generateLogFilePath(id, config);
    
    // Check if process is already running and try to reconnect
    const existingProcess = await this.checkAndReconnectProcess(id, pidFilePath, logFilePath);

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
      isStopped: false,
      isRemoved: false,
    };

    this.processes.set(id, managedProcess);

    if (existingProcess) {
      // Reconnect to existing process
      managedProcess.isRunning = true;
      managedProcess.isReconnected = true;
      managedProcess.isStopped = false;
      managedProcess.startTime = new Date();

      // Set up process death monitoring
      const pid = existingProcess.pid;
      managedProcess.processMonitor = monitorProcessByPid(pid, () => {
        logger.warn(`Reconnected process ${id} (PID ${pid}) has died`);
        clearInterval(managedProcess.processMonitor);
        
        // Handle process death
        managedProcess.isRunning = false;
        if (managedProcess.process) {
          managedProcess.process.kill(); // Kill the tail process
        }

        // Trigger restart if configured
        if (config.restartOnExit !== false && !this.isShuttingDown) {
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
   * Stop a managed process (detach from monitoring without killing)
   */
  async stopProcess(id: string): Promise<void> {
    const managedProcess = this.processes.get(id);
    if (!managedProcess) {
      logger.debug(`Process ${id} not found, nothing to stop`);
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

    // Do NOT kill the actual managed process - it should continue running
    // Do NOT remove PID file - preserve it for reconnection

    managedProcess.isRunning = false;
    managedProcess.isStopped = true;
    
    // Notify listeners of process update
    this.notifyProcessUpdate();
    
    logger.info(`Process ${managedProcess.config.name || `proxy-${id}`} stopped successfully`);
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

    // Wait for restart delay
    const restartDelay = managedProcess.config.restartDelay || 1000;
    await new Promise(resolve => setTimeout(resolve, restartDelay));

    // First try to reconnect to existing process
    const existingProcess = await this.checkAndReconnectProcess(id, managedProcess.pidFilePath, managedProcess.logFilePath);
    
    if (existingProcess) {
      // Reconnected to existing process
      managedProcess.isRunning = true;
      managedProcess.isReconnected = true;
      
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
      
      const processOptions: any = {
        cwd: config.cwd ? path.resolve(config.cwd) : process.cwd(),
        env: {
          // Start with a clean environment, excluding proxy-specific variables
          ...Object.fromEntries(
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
          ),
          ...config.env,
          // Set process name environment variables for the child process
          PROCESS_NAME: processName,
          PROXY_PROCESS_ID: id,
          PROXY_PROCESS_NAME: processName,
        },
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

      // Redirect stdout and stderr to log file
      const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
      
      if (childProcess.stdout) {
        childProcess.stdout.pipe(logStream, { end: false });
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
        childProcess.stderr.pipe(logStream, { end: false });
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
        managedProcess.startTime = new Date();
        
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

        // Auto-restart if configured
        if (config.restartOnExit !== false && !this.isShuttingDown) {
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
        reject(error);
      });

      // Proxy stdout and stderr
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            logger.info(`[${processName}] STDOUT: ${output}`);
          }
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            logger.warn(`[${processName}] STDERR: ${output}`);
          }
        });
      }
    });
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
        const response = await axios.get(healthUrl, {
          timeout,
          validateStatus: (status) => status >= 200 && status < 300,
        });

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
          // Optionally restart if configured
          if (managedProcess.config.restartOnExit !== false) {
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
    isRemoved: boolean;
  }> {
    return Array.from(this.processes.values()).map(proc => {
      // Check if the process is actually running by verifying the PID
      let actualIsRunning = proc.isRunning;
      if (proc.process?.pid) {
        actualIsRunning = this.isPidRunning(proc.process.pid);
      } else if (proc.isReconnected && proc.startTime) {
        // For reconnected processes, check if the PID from the PID file is still running
        // This is a fallback since we don't store the PID in the process object for reconnected processes
        actualIsRunning = true; // Assume running if reconnected and not explicitly stopped
      }
      
      return {
        id: proc.id,
        name: proc.config.name || `proxy-${proc.id}`,
        isRunning: actualIsRunning,
        pid: proc.process?.pid,
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
    this.stopFileWatching();

    // Stop all health checks
    for (const [id] of this.healthCheckIntervals) {
      this.stopHealthCheck(id);
    }

    // Detach from all processes without killing them
    const shutdownPromises = Array.from(this.processes.keys()).map(id => 
      this.stopProcess(id)
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
}

export const processManager = new ProcessManager();