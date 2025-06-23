import express from 'express';
import http from 'http';
import https from 'https';
import { ServerConfig, MainConfig } from '../types';
import { logger } from '../utils/logger';
import { cacheService } from './cache';
import { getStatisticsService } from './statistics';
import { WebSocketService, WebSocketServiceInterface } from './websocket';
import { ProxyRoutes } from './proxy-routes';
import { ProxyMiddleware } from './proxy-middleware';
import { ProxyCertificates } from './proxy-certificates';
import { ProxyProcesses } from './proxy-processes';
import { registerManagementEndpoints } from './management';
import { processManager } from './process-manager';
import path from 'path';

export class ProxyServer implements WebSocketServiceInterface {
  private app: express.Application;
  private managementApp: express.Application;
  private httpServer: http.Server | null = null;
  private httpsServer: https.Server | null = null;
  private managementServer: http.Server | null = null;
  private config: ServerConfig;
  private mainConfig?: MainConfig;
  private webSocketService: WebSocketService;
  private proxyRoutes: ProxyRoutes;
  private proxyMiddleware: ProxyMiddleware;
  private proxyCertificates: ProxyCertificates;
  private proxyProcesses: ProxyProcesses;
  private statisticsService: any;

  constructor(config: ServerConfig, mainConfig?: MainConfig) {
    this.config = config;
    this.mainConfig = mainConfig;
    this.app = express();
    this.managementApp = express();
    this.webSocketService = new WebSocketService(this);
    this.proxyRoutes = new ProxyRoutes();
    this.proxyMiddleware = new ProxyMiddleware();
    this.proxyCertificates = new ProxyCertificates(config);
    this.proxyProcesses = new ProxyProcesses(config);
    
    // Initialize statistics service with configuration
    const reportDir = mainConfig?.settings?.logsDir ? path.join(mainConfig.settings.logsDir, 'statistics') : undefined;
    const dataDir = mainConfig?.settings?.statsDir;
    this.statisticsService = getStatisticsService(reportDir, dataDir);
    
    // Set up process update callback for WebSocket broadcasts
    processManager.setProcessUpdateCallback(() => {
      this.broadcastProcessUpdates();
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupManagementServer();
  }

  private setupMiddleware(): void {
    this.proxyMiddleware.setupMiddleware(this.app, this.config);
  }

  private setupRoutes(): void {
    this.proxyRoutes.setupRoutes(this.app, this.config);
  }

  private setupManagementServer(): void {
    registerManagementEndpoints(this.managementApp, this.config, this, this.statisticsService, this.mainConfig);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing proxy server...');
    
    // Set up SSL certificates
    await this.proxyCertificates.setupCertificates();
    
    // Start managed processes
    await this.proxyProcesses.startManagedProcesses();
    
    // Set up process configuration watching
    this.proxyProcesses.setupProcessConfigWatching();
    
    // Set up cache cleanup
    this.setupCacheCleanup();
    
    logger.info('Proxy server initialization complete');
  }

  private setupCacheCleanup(): void {
    // Set up periodic cache cleanup
    setInterval(() => {
      cacheService.cleanup();
    }, 60 * 60 * 1000); // Clean up every hour
    
    logger.info('Cache cleanup scheduled (every hour)');
  }

  async start(disableManagementServer: boolean = false): Promise<void> {
    logger.info('Starting proxy server...');
    
    // Start HTTP server
    this.httpServer = http.createServer(this.app);
    this.httpServer.listen(this.config.port, () => {
      logger.info(`HTTP server started on port ${this.config.port}`);
    });
    
    // Start HTTPS server only if we have valid certificates
    try {
      this.httpsServer = await this.proxyCertificates.startHttpsServer(this.app);
      this.httpsServer.listen(this.config.httpsPort, () => {
        logger.info(`HTTPS server started on port ${this.config.httpsPort}`);
      });
    } catch (error) {
      logger.warn('No valid certificates available, HTTPS server will not start');
      logger.info('HTTPS server requires valid certificates to be loaded before it can start');
      this.httpsServer = null;
    }
    
    // Start management server only if not disabled
    if (!disableManagementServer) {
      this.managementServer = http.createServer(this.managementApp);
      const managementPort = this.config.port + 1000; // Management on port + 1000
      this.managementServer.listen(managementPort, () => {
        logger.info(`Management server started on port ${managementPort}`);
      });
    }
    
    logger.info('Proxy server started successfully');
  }

  async stop(): Promise<void> {
    logger.info('Stopping proxy server...');
    
    // Stop HTTP server
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
      logger.info('HTTP server stopped');
    }
    
    // Stop HTTPS server
    if (this.httpsServer) {
      this.httpsServer.close();
      this.httpsServer = null;
      logger.info('HTTPS server stopped');
    }
    
    // Stop management server
    if (this.managementServer) {
      this.managementServer.close();
      this.managementServer = null;
      logger.info('Management server stopped');
    }
    
    // Shutdown proxy processes
    await this.proxyProcesses.shutdown();
    
    // Shutdown statistics service
    await this.statisticsService.shutdown();
    
    // Shutdown cache service (no shutdown method, just cleanup)
    await cacheService.cleanup();
    
    logger.info('Proxy server stopped successfully');
  }

  getStatus(): any {
    return {
      httpPort: this.config.port,
      httpsPort: this.config.httpsPort,
      routes: this.config.routes.length,
      certificates: this.proxyCertificates.getAllCertificates(),
      processes: processManager.getProcessStatus().length,
      statistics: this.statisticsService.getStatsSummary(),
      cache: cacheService.getStats(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get the server configuration
   */
  getConfig(): ServerConfig {
    return this.config;
  }

  /**
   * Get the statistics service
   */
  getStatisticsService(): any {
    return this.statisticsService;
  }

  // WebSocket interface methods
  async getProcesses(): Promise<any[]> {
    return this.proxyProcesses.getProcesses();
  }

  async getStatusData(): Promise<any> {
    return this.getStatus();
  }

  async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
    return this.proxyProcesses.getProcessLogs(processId, lines);
  }

  private async broadcastProcessUpdates(): Promise<void> {
    try {
      const processes = await this.getProcesses();
      this.webSocketService.broadcast({
        type: 'processes',
        data: processes,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error broadcasting process updates', error);
    }
  }

  // Methods for management interface
  getTargetForProcess(processId: string, processConfig: any): string {
    // Find the route that corresponds to this process
    const route = this.config.routes.find(r => {
      // Use domain as process ID since ProxyRoute doesn't have processId
      const routeProcessId = r.domain || 'default';
      return routeProcessId === processId;
    });
    
    if (route && route.target) {
      return route.target;
    }

    // Fallback to localhost with a default port
    const defaultPort = 3000 + parseInt(processId.replace(/\D/g, '0'));
    return `http://localhost:${defaultPort}`;
  }

  async handleProcessConfigUpdate(newConfig: any): Promise<void> {
    await this.proxyProcesses.handleProcessConfigUpdate(newConfig);
  }
} 