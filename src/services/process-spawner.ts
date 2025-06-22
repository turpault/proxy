import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
import { logger } from '../utils/logger';
import { ProcessConfig } from '../types';
import { ManagedProcess } from './process-manager';

export class ProcessSpawner {
  private generatePidFilePath(id: string, config: ProcessConfig): string {
    if (config.pidFile) {
      return path.resolve(config.pidFile);
    }
    
    const pidDir = config.pidDir || path.resolve(process.cwd(), 'data', 'pids');
    return path.join(pidDir, `${id}.pid`);
  }

  private generateLogFilePath(id: string, config: ProcessConfig): string {
    const logDir = path.resolve(process.cwd(), 'logs', 'processes');
    return path.join(logDir, `${id}.log`);
  }

  private async writePidFile(pidFilePath: string, pid: number): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(pidFilePath));
      await fs.writeFile(pidFilePath, pid.toString(), 'utf8');
      logger.debug(`PID file written: ${pidFilePath} (PID: ${pid})`);
    } catch (error) {
      logger.error(`Failed to write PID file: ${pidFilePath}`, error);
      throw error;
    }
  }

  private async removePidFile(pidFilePath: string): Promise<void> {
    try {
      await fs.remove(pidFilePath);
      logger.debug(`PID file removed: ${pidFilePath}`);
    } catch (error) {
      logger.warn(`Failed to remove PID file: ${pidFilePath}`, error);
    }
  }

  private isPidRunning(pid: number): boolean {
    try {
      process.kill(pid, 0); // Test if process is running
      return true;
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        return false; // Process does not exist
      }
      throw error; // Other error
    }
  }

  private async checkAndReconnectProcess(id: string, pidFilePath: string, logFilePath: string): Promise<{ pid: number; isRunning: boolean; processMonitor?: NodeJS.Timeout } | null> {
    try {
      if (!await fs.pathExists(pidFilePath)) {
        return null;
      }

      const pidContent = await fs.readFile(pidFilePath, 'utf8');
      const pid = parseInt(pidContent.trim(), 10);

      if (isNaN(pid)) {
        logger.warn(`Invalid PID in file: ${pidFilePath}`);
        await this.removePidFile(pidFilePath);
        return null;
      }

      const isRunning = this.isPidRunning(pid);
      
      if (isRunning) {
        logger.info(`Reconnecting to existing process ${id} (PID: ${pid})`);
        
        // Start monitoring the process
        const processMonitor = this.monitorProcessByPid(pid, () => {
          logger.info(`Reconnected process ${id} (PID: ${pid}) has died`);
        });

        return { pid, isRunning: true, processMonitor };
      } else {
        logger.info(`Process ${id} (PID: ${pid}) is not running, cleaning up PID file`);
        await this.removePidFile(pidFilePath);
        return null;
      }
    } catch (error) {
      logger.error(`Error checking/reconnecting to process ${id}`, error);
      return null;
    }
  }

  private monitorProcessByPid(pid: number, onDeath: () => void): NodeJS.Timeout {
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

  private startLogTailing(id: string, logFilePath: string): void {
    // This is a simplified implementation
    // In a real implementation, you would set up log tailing
    logger.debug(`Log tailing started for process ${id}: ${logFilePath}`);
  }

  async spawnProcess(managedProcess: ManagedProcess, target: string): Promise<void> {
    const { id, config } = managedProcess;
    const processName = config.name || `proxy-${id}`;
    
    logger.info(`Spawning process: ${processName}`, {
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      target
    });

    try {
      // Ensure log directory exists
      const logFilePath = this.generateLogFilePath(id, config);
      await fs.ensureDir(path.dirname(logFilePath));

      // Prepare environment variables
      const env = {
        ...process.env,
        ...config.env,
        PORT: this.extractPortFromTarget(target)?.toString(),
        TARGET: target,
        PROCESS_ID: id,
        PROCESS_NAME: processName
      };

      // Spawn the process
      const childProcess = spawn(config.command, config.args || [], {
        cwd: config.cwd || process.cwd(),
        env,
        detached: true, // Detach from parent process
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Set up output handling
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          const output = data.toString();
          logger.debug(`[${processName}] ${output.trim()}`);
          
          // Append to log file
          fs.appendFile(logFilePath, `[${new Date().toISOString()}] ${output}`).catch(error => {
            logger.error(`Failed to write to log file for ${processName}`, error);
          });
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          const output = data.toString();
          logger.warn(`[${processName}] ${output.trim()}`);
          
          // Append to log file
          fs.appendFile(logFilePath, `[${new Date().toISOString()}] ERROR: ${output}`).catch(error => {
            logger.error(`Failed to write to log file for ${processName}`, error);
          });
        });
      }

      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        logger.info(`Process ${processName} exited`, { code, signal });
        managedProcess.isRunning = false;
        
        // Clean up PID file if configured
        if (config.cleanupPidOnExit !== false) {
          const pidFilePath = this.generatePidFilePath(id, config);
          this.removePidFile(pidFilePath).catch(error => {
            logger.error(`Failed to cleanup PID file for ${processName}`, error);
          });
        }
      });

      // Handle process errors
      childProcess.on('error', (error) => {
        logger.error(`Process ${processName} error`, error);
        managedProcess.isRunning = false;
      });

      // Wait a moment for the process to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if process is still running
      if (childProcess.exitCode !== null) {
        throw new Error(`Process ${processName} exited immediately with code ${childProcess.exitCode}`);
      }

      // Write PID file
      const pidFilePath = this.generatePidFilePath(id, config);
      await this.writePidFile(pidFilePath, childProcess.pid!);

      // Update managed process
      managedProcess.process = childProcess;
      managedProcess.isRunning = true;
      managedProcess.startTime = new Date();
      managedProcess.pidFilePath = pidFilePath;
      managedProcess.logFilePath = logFilePath;
      managedProcess.restartCount++;

      // Start log tailing
      this.startLogTailing(id, logFilePath);

      logger.info(`Process ${processName} started successfully`, {
        pid: childProcess.pid,
        target,
        restartCount: managedProcess.restartCount
      });

    } catch (error) {
      logger.error(`Failed to spawn process ${processName}`, error);
      managedProcess.isRunning = false;
      throw error;
    }
  }

  private extractPortFromTarget(target: string): number | null {
    try {
      const url = new URL(target);
      return url.port ? parseInt(url.port, 10) : null;
    } catch {
      return null;
    }
  }
} 