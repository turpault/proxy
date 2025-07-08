import * as fs from 'fs-extra';
import * as path from 'path';
import { watch } from 'fs';
import { ProcessConfig, ProcessManagementConfig, ServerConfig } from '../types';
import { logger } from '../utils/logger';
import { processManager } from './process-manager';

export class ProxyProcesses {
  private config: ServerConfig;
  private fileWatcher: fs.FSWatcher | null = null;
  private reinitializeTimeout: NodeJS.Timeout | null = null;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async startManagedProcesses(): Promise<void> {
    if (!this.config.processManagement?.processes) {
      logger.info('No process management configuration found');
      return;
    }

    logger.info('Starting managed processes...');

    for (const [processId, processConfig] of Object.entries(this.config.processManagement.processes)) {
      if (processConfig.enabled !== false) {
        try {
          const target = this.getTargetForProcess(processId, processConfig);
          await processManager.startProcess(processId, processConfig, target);
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

  setupProcessConfigWatching(): void {
    if (!this.config.processConfigFile) {
      logger.info('No process config file specified, skipping file watching');
      return;
    }

    const configFilePath = path.resolve(process.cwd(), this.config.processConfigFile);

    try {
      // Stop existing watcher if any
      if (this.fileWatcher) {
        this.fileWatcher.close();
      }

      this.fileWatcher = watch(configFilePath, { persistent: true }, (eventType, filename) => {
        if (eventType === 'change' && filename) {
          logger.info(`Process configuration file changed: ${filename}`);
          this.scheduleReinitialize();
        }
      });

      this.fileWatcher.on('error', (error) => {
        logger.error('Error watching process configuration file', error);
      });

      logger.info(`Process manager watching for changes in ${configFilePath}`);
    } catch (error) {
      logger.error('Failed to start file watcher for process configuration', error);
    }
  }

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

  private async reinitializeFromFile(): Promise<void> {
    if (!this.config.processConfigFile) {
      logger.warn('Cannot reinitialize: missing process config file path');
      return;
    }

    try {
      logger.info('Reinitializing process management from updated configuration file');

      // Read and parse the updated configuration
      const configFilePath = path.resolve(process.cwd(), this.config.processConfigFile);
      const newConfig = await processManager.loadProcessConfig(configFilePath);

      if (!newConfig) {
        throw new Error('Failed to load process configuration file');
      }

      // Handle the configuration update
      await this.handleProcessConfigUpdate(newConfig);

    } catch (error) {
      logger.error('Failed to reinitialize process management', error);
    }
  }

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
    await processManager.updateConfiguration(newConfig, targetResolver);

    // Update the local config reference
    this.config.processManagement = newConfig;

    logger.info('Process configuration update complete');
  }



  private getTargetForProcess(processId: string, processConfig: ProcessConfig): string {
    // Find the route that corresponds to this process
    const route = this.config.routes.find(r => this.getProcessId(r) === processId);

    if (route && route.target) {
      return route.target;
    }

    // Fallback to localhost with a default port
    const defaultPort = 3000 + parseInt(processId.replace(/\D/g, '0'));
    return `http://localhost:${defaultPort}`;
  }

  private getProcessId(route: any): string {
    // Extract process ID from route configuration
    // This is a simplified implementation - adjust based on your actual route structure
    return route.processId || route.domain || 'default';
  }

  async getProcesses(): Promise<any[]> {
    return processManager.getProcessStatus();
  }

  async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
    const processes = processManager.getProcessStatus();
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

  getProcessPort(processId: string): number | null {
    // This would be implemented based on your process port mapping logic
    // For now, return a default port
    const defaultPort = 3000 + parseInt(processId.replace(/\D/g, '0'));
    return defaultPort;
  }

  async shutdown(): Promise<void> {
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

    logger.info('Proxy processes shutdown complete');
  }
} 