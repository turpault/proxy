import { Server } from 'bun';
import { ProxyConfig, MainConfig } from './types';
import { logger } from './utils/logger';
import { cacheService, setCacheExpiration } from './services/cache';
import { getStatisticsService } from './services/statistics';
import { WebSocketServiceInterface } from './services/websocket';
import { BunRoutes } from './services/bun-routes';
import { BunMiddleware } from './services/bun-middleware';
import { ProxyCertificates } from './services/proxy-certificates';
import { configService } from './services/config-service';
import { registerManagementEndpoints } from './services/management';
import { processManager } from './services/process-manager';
import path from 'path';

export class BunProxyServer implements WebSocketServiceInterface {
  private httpServer: Server | null = null;
  private httpsServer: Server | null = null;
  private managementServer: Server | null = null;
  private config: ProxyConfig;
  private mainConfig?: MainConfig;
  private proxyRoutes: BunRoutes;
  private proxyMiddleware: BunMiddleware;
  private proxyCertificates: ProxyCertificates;
  private statisticsService: any;

  constructor(config: ProxyConfig, mainConfig?: MainConfig) {
    this.config = config;
    this.mainConfig = mainConfig;

    // Initialize statistics service with configuration
    const logsDir = configService.getSetting<string>('logsDir');
    const reportDir = logsDir ? path.join(logsDir, 'statistics') : undefined;
    const dataDir = configService.getSetting<string>('statsDir');
    this.statisticsService = getStatisticsService(reportDir, dataDir);

    // Get temp directory from main config
    const tempDir = configService.getSetting<string>('tempDir');
    this.proxyRoutes = new BunRoutes(tempDir, this.statisticsService);
    this.proxyMiddleware = new BunMiddleware(this.config);
    this.proxyCertificates = new ProxyCertificates(config);
    processManager.initialize(config);

    // Set cache expiration from main config if available
    const cacheMaxAge = configService.getSetting('cache.maxAge');
    setCacheExpiration(typeof cacheMaxAge === 'number' ? cacheMaxAge : 24 * 60 * 60 * 1000);

    // Listen for configuration changes
    this.setupConfigChangeHandling();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Bun proxy server...');

    // Set up SSL certificates
    await this.proxyCertificates.setupCertificates();

    // Set up routes
    this.proxyRoutes.setupRoutes(this.config);

    // Start managed processes
    await processManager.startManagedProcesses();

    // Set up process configuration watching
    processManager.setupProcessConfigWatching();

    // Set up cache cleanup
    this.setupCacheCleanup();

    logger.info('Bun proxy server initialization complete');
  }

  private setupCacheCleanup(): void {
    // Set up periodic cache cleanup
    setInterval(() => {
      cacheService.cleanup();
    }, 60 * 60 * 1000); // Clean up every hour

    logger.info('Cache cleanup scheduled (every hour)');
  }

  async start(disableManagementServer: boolean = false): Promise<void> {
    logger.info('Starting Bun proxy server...');

    // Start HTTP server
    this.httpServer = Bun.serve({
      port: this.config.port,
      fetch: this.handleRequest.bind(this),
      error: this.handleError.bind(this)
    });

    logger.info(`HTTP server started on port ${this.config.port}`);

    // Start HTTPS server only if we have valid certificates
    try {
      // TODO: Update ProxyCertificates to work with Bun's native server
      // For now, we'll skip HTTPS until we update the certificate service
      logger.warn('HTTPS server not yet implemented for Bun native server');
      this.httpsServer = null;
    } catch (error) {
      logger.warn('No valid certificates available, HTTPS server will not start');
      logger.info('HTTPS server requires valid certificates to be loaded before it can start');
      this.httpsServer = null;
    }

    // Start management server only if not disabled
    if (!disableManagementServer) {
      const managementConfig = configService.getManagementConfig();
      const managementPort = managementConfig?.port || (this.config.port + 1000);
      const managementHost = managementConfig?.host || '0.0.0.0';

      this.managementServer = Bun.serve({
        port: managementPort,
        hostname: managementHost,
        fetch: this.handleManagementRequest.bind(this),
        error: this.handleError.bind(this)
      });

      logger.info(`Management server started on ${managementHost}:${managementPort}`);

      // Initialize WebSocket service after server starts listening
      // TODO: Implement WebSocket initialization for Bun
    }

    logger.info('Bun proxy server started successfully');
  }

  async stop(): Promise<void> {
    logger.info('Stopping Bun proxy server...');

    // Stop HTTP server
    if (this.httpServer) {
      this.httpServer.stop();
      this.httpServer = null;
      logger.info('HTTP server stopped');
    }

    // Stop HTTPS server
    if (this.httpsServer) {
      this.httpsServer.stop();
      this.httpsServer = null;
      logger.info('HTTPS server stopped');
    }

    // Stop management server
    if (this.managementServer) {
      this.managementServer.stop();
      this.managementServer = null;
      logger.info('Management server stopped');
    }

    // Shutdown process manager
    await processManager.shutdown();

    // Shutdown statistics service
    await this.statisticsService.shutdown();

    // Shutdown cache service (no shutdown method, just cleanup)
    await cacheService.cleanup();

    logger.info('Bun proxy server stopped successfully');
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;
    const headers = Object.fromEntries(req.headers.entries());

    // Create a request-like object for middleware compatibility
    const requestContext = {
      method,
      url: req.url,
      pathname,
      headers,
      body: req.body,
      query: Object.fromEntries(url.searchParams.entries()),
      ip: this.getClientIP(req),
      originalUrl: req.url
    };

    // Apply middleware
    const middlewareResult = await this.proxyMiddleware.processRequest(requestContext);
    if (middlewareResult) {
      return middlewareResult;
    }

    // Handle routes
    const routeResponse = await this.proxyRoutes.handleRequest(requestContext, this.config);
    if (routeResponse) {
      return routeResponse;
    }

    // Handle unmatched requests (404)
    const startTime = Date.now();
    const clientIP = this.getClientIP(req);
    const geolocation = this.getGeolocation(clientIP);
    const userAgent = headers['user-agent'] || 'Unknown';

    this.statisticsService.recordRequest(
      clientIP,
      geolocation,
      pathname,
      method,
      userAgent,
      undefined,
      'Unmatched',
      pathname,
      'unmatched'
    );

    return new Response(JSON.stringify({
      error: 'Not Found',
      message: `No route configured for ${method} ${pathname}`,
      timestamp: new Date().toISOString()
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleManagementRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Handle static files for management interface
    if (pathname.startsWith('/static/') || pathname === '/') {
      return this.serveStaticFile(pathname);
    }

    // Handle API endpoints
    if (pathname.startsWith('/api/')) {
      return this.handleApiRequest(req, pathname);
    }

    // Handle health endpoint
    if (pathname === '/health') {
      return this.handleHealthRequest();
    }

    // Default management response
    return new Response('Management Interface', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }

  private async serveStaticFile(pathname: string): Promise<Response> {
    try {
      const staticPath = path.join(__dirname, '../static/management', pathname === '/' ? 'index.html' : pathname);
      const file = Bun.file(staticPath);

      if (await file.exists()) {
        return new Response(file);
      }
    } catch (error) {
      logger.error('Error serving static file', error);
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleApiRequest(req: Request, pathname: string): Promise<Response> {
    // TODO: Implement API endpoints for management interface
    // This will need to be implemented based on the existing management.ts endpoints
    return new Response('API endpoint not implemented yet', { status: 501 });
  }

  private handleHealthRequest(): Response {
    try {
      const certificates = this.proxyCertificates?.getAllCertificates() || new Map();
      const validCertificates = Array.from(certificates.values()).filter((cert: any) => cert.isValid);

      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        certificates: {
          total: certificates.size,
          valid: validCertificates.length,
          domains: Array.from(certificates.keys()),
          validDomains: validCertificates.map((cert: any) => cert.domain),
        },
        servers: {
          http: !!this.httpServer,
          https: !!this.httpsServer,
          management: !!this.managementServer,
        },
        config: {
          httpPort: configService.getServerConfig().port,
          httpsPort: configService.getServerConfig().httpsPort,
          routes: configService.getServerConfig().routes.length,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      logger.error('Health check failed', error);
      return new Response(JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private handleError(error: Error): Response {
    logger.error('Server error', error);
    return new Response('Internal Server Error', { status: 500 });
  }

  private getClientIP(req: Request): string {
    const headers = req.headers;
    const xForwardedFor = headers.get('x-forwarded-for');
    const xRealIP = headers.get('x-real-ip');
    const xClientIP = headers.get('x-client-ip');

    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }

    if (xRealIP) {
      return xRealIP;
    }

    if (xClientIP) {
      return xClientIP;
    }

    return 'unknown';
  }

  private getGeolocation(ip: string): any {
    try {
      const { geolocationService } = require('./services/geolocation');
      return geolocationService.getGeolocation(ip);
    } catch (error) {
      return null;
    }
  }

  getStatus(): any {
    return {
      httpPort: this.config.port,
      httpsPort: this.config.httpsPort,
      routes: this.config.routes.length,
      certificates: this.proxyCertificates.getAllCertificates(),
      processes: this.getProcessesSync(),
      statistics: this.statisticsService.getStatsSummary(),
      cache: cacheService.getStats(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  private getProcessesSync(): any[] {
    const processes = processManager.getProcessStatus();
    return Array.isArray(processes) ? processes : [];
  }

  getConfig(): ProxyConfig {
    return this.config;
  }

  getStatisticsService(): any {
    return this.statisticsService;
  }

  async getProcesses(): Promise<any[]> {
    return processManager.getProcessStatus();
  }

  async getStatusData(): Promise<any> {
    return this.getStatus();
  }

  async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
    return processManager.getProcessLogs(processId, lines);
  }

  getTargetForProcess(processId: string, processConfig: any): string {
    // TODO: Implement or make this method public in ProcessManager
    return `http://localhost:${processConfig.port || 3000}`;
  }

  async handleProcessConfigUpdate(newConfig: any): Promise<void> {
    // TODO: Implement or make this method public in ProcessManager
    logger.info('Process config update not yet implemented for Bun server');
  }

  private setupConfigChangeHandling(): void {
    configService.on('configReloading', () => {
      logger.info('Configuration reloading...');
    });

    configService.on('configReloaded', async (newConfigs: any) => {
      logger.info('Configuration reloaded, updating server...');
      await this.handleConfigUpdate(newConfigs);
    });

    configService.on('configReloadError', (error: any) => {
      logger.error('Configuration reload failed', error);
    });
  }

  private async handleConfigUpdate(newConfigs: any): Promise<void> {
    try {
      // Update server configuration
      if (newConfigs.serverConfig) {
        this.config = newConfigs.serverConfig;
      }

      // Update main configuration
      if (newConfigs.mainConfig) {
        this.mainConfig = newConfigs.mainConfig;
      }

      // Update process configuration
      if (newConfigs.processConfig) {
        // TODO: Implement or make this method public in ProcessManager
        logger.info('Process config update not yet implemented for Bun server');
      }

      logger.info('Server configuration updated successfully');
    } catch (error) {
      logger.error('Failed to update server configuration', error);
    }
  }
} 