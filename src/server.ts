import { ProxyConfig, MainConfig } from './types';
import { logger } from './utils/logger';
import { configService } from './services/config-service';
import { ProxyServer } from './services/proxy-server';
import { ProcessManagementServer } from './services/process-management-server';
import { ManagementConsole } from './services/management-console';

export class BunProxyServer {
  private proxyServer: ProxyServer;
  private processManagementServer: ProcessManagementServer;
  private managementConsole: ManagementConsole;
  private config: ProxyConfig;
  private mainConfig?: MainConfig;

  constructor(config: ProxyConfig, mainConfig?: MainConfig) {
    this.config = config;
    this.mainConfig = mainConfig;

    // Initialize the three separate services
    this.proxyServer = new ProxyServer(config, mainConfig);
    this.processManagementServer = new ProcessManagementServer(config, mainConfig);
    this.managementConsole = new ManagementConsole(config, mainConfig);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Bun proxy server...');

    // Initialize all services
    await this.proxyServer.initialize();
    await this.processManagementServer.initialize();

    logger.info('Bun proxy server initialization complete');
  }

  async start(disableManagementServer: boolean = false): Promise<void> {
    logger.info('Starting Bun proxy server...');

    // Start proxy server
    await this.proxyServer.start();

    // Start process management server
    await this.processManagementServer.start();

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
    await this.processManagementServer.stop();
    await this.managementConsole.stop();

    logger.info('Bun proxy server stopped successfully');
  }

  getStatus(): any {
    return {
      proxy: this.proxyServer.getStatus(),
      processManagement: this.processManagementServer.getStatus(),
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
    return this.processManagementServer.getProcesses();
  }

  async getStatusData(): Promise<any> {
    return this.getStatus();
  }

  async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
    return this.processManagementServer.getProcessLogs(processId, lines);
  }

  async handleProcessConfigUpdate(newConfig: any): Promise<void> {
    await this.processManagementServer.handleProcessConfigUpdate(newConfig);
  }

  // Add broadcast helpers if needed for process/status/logs updates
  broadcastToManagementWebSockets(message: any): void {
    this.managementConsole.broadcastToManagementWebSockets(message);
  }
} 