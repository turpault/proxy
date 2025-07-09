import { ProxyConfig, MainConfig } from './types';
import { logger } from './utils/logger';
import { configService } from './services/config-service';
import { ProxyServer } from './services/proxy-server';
import { ManagementConsole } from './services/management-console';
import { ProcessManager } from './services/process-manager';

export class BunProxyServer {
  private proxyServer: ProxyServer;
  private managementConsole: ManagementConsole;
  private processManager: ProcessManager;
  private config: ProxyConfig;
  private mainConfig?: MainConfig;

  constructor(config: ProxyConfig, mainConfig?: MainConfig) {
    this.config = config;
    this.mainConfig = mainConfig;

    // Create process manager instance
    this.processManager = new ProcessManager();

    // Initialize the two separate services
    this.proxyServer = new ProxyServer(config, mainConfig);
    this.managementConsole = new ManagementConsole(config, this.processManager);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Bun proxy server...');

    // Initialize all services
    await this.proxyServer.initialize();
    await this.managementConsole.initialize();

    logger.info('Bun proxy server initialization complete');
  }

  async start(disableManagementServer: boolean = false): Promise<void> {
    logger.info('Starting Bun proxy server...');

    // Start proxy server
    await this.proxyServer.start();

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