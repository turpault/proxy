import { ConfigLoader } from '../config/loader';
import { ServerConfig, MainConfig, ProcessManagementConfig } from '../types';
import { logger } from '../utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';
import { EventEmitter } from 'events';

export class ConfigService extends EventEmitter {
  private static instance: ConfigService;
  private serverConfig: ServerConfig | null = null;
  private mainConfig: MainConfig | null = null;
  private processConfig: ProcessManagementConfig | null = null;
  private configPath?: string;
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private isWatching = false;
  private reloadTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    super();
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
 * Initialize the configuration service
 */
  async initialize(configPath?: string): Promise<void> {
    this.configPath = configPath;

    try {
      // Try to load main configuration first
      this.mainConfig = await ConfigLoader.loadMainConfig(configPath);
      logger.info('Using main configuration structure');

      // Load proxy configuration
      this.serverConfig = await ConfigLoader.loadProxyConfig(this.mainConfig.config.proxy);

      // Load process management configuration if it exists
      try {
        this.processConfig = await ConfigLoader.loadProcessConfig(this.mainConfig.config.processes);
        this.serverConfig.processManagement = this.processConfig;
      } catch (error) {
        logger.warn('Failed to load process management configuration, continuing without it');
      }
    } catch (error) {
      logger.info('Main configuration not found or invalid, falling back to legacy configuration');
      logger.debug('Main config error:', error);

      // Fall back to legacy configuration
      this.serverConfig = await ConfigLoader.load(configPath);
    }

    // Start monitoring configuration files
    await this.startConfigMonitoring();
  }

  /**
   * Get the server configuration
   */
  getServerConfig(): ServerConfig {
    if (!this.serverConfig) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this.serverConfig;
  }

  /**
   * Get the main configuration
   */
  getMainConfig(): MainConfig | null {
    return this.mainConfig;
  }

  /**
   * Get the process management configuration
   */
  getProcessConfig(): ProcessManagementConfig | null {
    return this.processConfig;
  }

  /**
   * Reload configuration
   */
  async reload(): Promise<void> {
    logger.info('Reloading configuration...');
    await this.initialize(this.configPath);
    logger.info('Configuration reloaded successfully');
  }

  /**
   * Validate configuration without loading it
   */
  async validateConfig(configPath?: string): Promise<boolean> {
    try {
      await ConfigLoader.load(configPath);
      return true;
    } catch (error) {
      logger.error('Configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Get a specific route configuration by domain
   */
  getRouteByDomain(domain: string) {
    if (!this.serverConfig) {
      return null;
    }
    return this.serverConfig.routes.find(route => route.domain === domain);
  }

  /**
   * Get a specific route configuration by path
   */
  getRouteByPath(path: string) {
    if (!this.serverConfig) {
      return null;
    }
    return this.serverConfig.routes.find(route => route.path === path);
  }

  /**
   * Get all routes
   */
  getRoutes() {
    if (!this.serverConfig) {
      return [];
    }
    return this.serverConfig.routes;
  }

  /**
   * Get process configuration by ID
   */
  getProcessById(processId: string) {
    if (!this.processConfig?.processes) {
      return null;
    }
    return this.processConfig.processes[processId] || null;
  }

  /**
   * Get all process configurations
   */
  getProcesses() {
    if (!this.processConfig?.processes) {
      return {};
    }
    return this.processConfig.processes;
  }

  /**
   * Get a setting from main config
   */
  getSetting<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.mainConfig?.settings) {
      return defaultValue;
    }

    const keys = key.split('.');
    let value: any = this.mainConfig.settings;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Get management configuration
   */
  getManagementConfig() {
    return this.mainConfig?.management || null;
  }

  /**
   * Check if configuration is initialized
   */
  isInitialized(): boolean {
    return this.serverConfig !== null;
  }

  /**
   * Start monitoring configuration files for changes
   */
  private async startConfigMonitoring(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    // Check if config watching is disabled
    const watchDisabled = process.env.DISABLE_CONFIG_WATCH === 'true' ||
      process.argv.includes('--no-watch');

    if (watchDisabled) {
      logger.info('Configuration file watching disabled');
      return;
    }

    try {
      // Determine which config files to watch
      const filesToWatch: string[] = [];

      if (this.mainConfig) {
        // Watch main config and its referenced files
        const mainConfigFile = this.configPath || process.env.MAIN_CONFIG_FILE || './config/main.yaml';
        const resolvedMainPath = path.resolve(mainConfigFile);
        filesToWatch.push(resolvedMainPath);

        // Watch proxy config
        const proxyConfigPath = path.resolve(this.mainConfig.config.proxy);
        filesToWatch.push(proxyConfigPath);

        // Watch process config
        const processConfigPath = path.resolve(this.mainConfig.config.processes);
        filesToWatch.push(processConfigPath);
      } else {
        // Watch legacy config
        const legacyConfigFile = this.configPath || process.env.CONFIG_FILE || './config/proxy.yaml';
        const resolvedLegacyPath = path.resolve(legacyConfigFile);
        filesToWatch.push(resolvedLegacyPath);
      }

      // Set up watchers for each file
      for (const filePath of filesToWatch) {
        if (await fs.pathExists(filePath)) {
          this.setupFileWatcher(filePath);
        } else {
          logger.warn(`Configuration file not found for watching: ${filePath}`);
        }
      }

      this.isWatching = true;
      logger.info('Configuration file monitoring started');
    } catch (error) {
      logger.error('Failed to start configuration monitoring', error);
    }
  }

  /**
   * Set up a file watcher for a specific configuration file
   */
  private setupFileWatcher(filePath: string): void {
    try {
      // Stop existing watcher if any
      if (this.fileWatchers.has(filePath)) {
        this.fileWatchers.get(filePath)?.close();
        this.fileWatchers.delete(filePath);
      }

      const watcher = fs.watch(filePath, { persistent: true }, (eventType, filename) => {
        if (eventType === 'change' && filename) {
          logger.info(`Configuration file changed: ${filePath}`);
          this.scheduleConfigReload();
        }
      });

      watcher.on('error', (error) => {
        logger.error(`Error watching configuration file ${filePath}`, error);
      });

      this.fileWatchers.set(filePath, watcher);
      logger.debug(`File watcher set up for: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to set up file watcher for ${filePath}`, error);
    }
  }

  /**
   * Schedule configuration reload with debouncing
   */
  private scheduleConfigReload(): void {
    // Clear existing timeout
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }

    // Debounce reload to avoid multiple rapid updates
    this.reloadTimeout = setTimeout(async () => {
      try {
        logger.info('Configuration files changed, reloading configuration...');

        // Emit event before reload
        this.emit('configReloading');

        // Reload configuration
        await this.reload();

        // Emit event after successful reload
        this.emit('configReloaded', {
          serverConfig: this.serverConfig,
          mainConfig: this.mainConfig,
          processConfig: this.processConfig
        });

        logger.info('Configuration reloaded successfully');
      } catch (error) {
        logger.error('Failed to reload configuration', error);
        this.emit('configReloadError', error);
      }
    }, 1000); // Wait 1 second after last change
  }

  /**
   * Stop monitoring configuration files
   */
  stopConfigMonitoring(): void {
    if (!this.isWatching) {
      return;
    }

    // Clear reload timeout
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
      this.reloadTimeout = null;
    }

    // Close all file watchers
    for (const [filePath, watcher] of this.fileWatchers.entries()) {
      try {
        watcher.close();
        logger.debug(`File watcher closed for: ${filePath}`);
      } catch (error) {
        logger.error(`Error closing file watcher for ${filePath}`, error);
      }
    }
    this.fileWatchers.clear();

    this.isWatching = false;
    logger.info('Configuration file monitoring stopped');
  }

  /**
   * Get list of watched configuration files
   */
  getWatchedFiles(): string[] {
    return Array.from(this.fileWatchers.keys());
  }

  /**
   * Check if configuration monitoring is active
   */
  isMonitoring(): boolean {
    return this.isWatching;
  }
}

// Export a singleton instance
export const configService = ConfigService.getInstance(); 