import { ConfigLoader } from '../config/loader';
import { ServerConfig, MainConfig, ProcessManagementConfig } from '../types';
import { logger } from '../utils/logger';

export class ConfigService {
  private static instance: ConfigService;
  private serverConfig: ServerConfig | null = null;
  private mainConfig: MainConfig | null = null;
  private processConfig: ProcessManagementConfig | null = null;
  private configPath?: string;

  private constructor() { }

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
}

// Export a singleton instance
export const configService = ConfigService.getInstance(); 