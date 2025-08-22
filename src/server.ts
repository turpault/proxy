import { ProxyConfig, MainConfig } from './types';
import { logger } from './utils/logger';
import { ProxyServer } from './services/proxy-server';
import { ManagementConsole } from './services/management-console';
import { initializeServiceContainer, shutdownServiceContainer, getServiceContainer } from './services/service-container';

export class BunProxyServer {
  private proxyServer: ProxyServer;
  private managementConsole: ManagementConsole;
  private config: ProxyConfig;
  private mainConfig?: MainConfig;

  constructor(config: ProxyConfig, mainConfig?: MainConfig) {
    this.config = config;
    this.mainConfig = mainConfig;

    // Initialize service container
    const serviceContainer = initializeServiceContainer(config, mainConfig);

    // Initialize the two separate services with dependency injection
    this.proxyServer = new ProxyServer(config, serviceContainer);
    this.managementConsole = new ManagementConsole(config, serviceContainer);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Bun proxy server...');

    // Initialize service container
    const serviceContainer = getServiceContainer();
    await serviceContainer.initialize();

    // Initialize all services
    await this.proxyServer.initialize();
    await this.managementConsole.initialize();

    // Start managed processes
    await serviceContainer.processManager.startManagedProcesses();

    logger.info('Bun proxy server initialization complete');
  }

  async start(disableManagementServer: boolean = false): Promise<void> {
    logger.info('Starting Bun proxy server...');

    // Start proxy server
    await this.proxyServer.startHttpsServer();

    // Start management console only if not disabled
    if (!disableManagementServer) {
      await this.managementConsole.start();
    }

    logger.info('Bun proxy server started successfully');
  }

  async stop(): Promise<void> {
    logger.info('Stopping Bun proxy server...');

    // Stop all services
    await this.proxyServer.stop();
    await this.managementConsole.stop();

    // Shutdown service container (handles all service shutdown)
    await shutdownServiceContainer();

    logger.info('Bun proxy server stopped successfully');
  }

  getStatus(): any {
    return {
      proxy: this.proxyServer.getStatus(),
      management: this.managementConsole.getStatus(),
      timestamp: new Date().toISOString()
    };
  }

  getConfig(): ProxyConfig {
    return this.config;
  }

  getStatisticsService(): any {
    return this.proxyServer.getStatisticsService();
  }

  async getProcesses(): Promise<any[]> {
    const serviceContainer = getServiceContainer();
    return this.managementConsole.getProcesses();
  }

  async getStatusData(): Promise<any> {
    return this.getStatus();
  }

  async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
    return this.managementConsole.getProcessLogs(processId, lines);
  }

  async handleProcessConfigUpdate(newConfig: any): Promise<void> {
    await this.managementConsole.handleProcessConfigUpdate(newConfig);
  }

  // Add broadcast helpers if needed for process/status/logs updates
  broadcastToManagementWebSockets(message: any): void {
    this.managementConsole.broadcastToManagementWebSockets(message);
  }
} 