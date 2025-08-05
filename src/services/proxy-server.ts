import { Server } from 'bun';
import { ProxyConfig } from '../types';
import { logger } from '../utils/logger';
import { BunMiddleware } from './bun-middleware';
import { BunRoutes } from './bun-routes';
import { cacheService, setCacheExpiration } from './cache';
import { configService } from './config-service';
import { ProxyCertificates } from './proxy-certificates';
import { getStatisticsService } from './statistics';

export class ProxyServer {
  private httpServer: Server | null = null;
  private httpsServer: Server | null = null;
  private config: ProxyConfig;
  private proxyRoutes: BunRoutes;
  private proxyMiddleware: BunMiddleware;
  private proxyCertificates: ProxyCertificates;
  private statisticsService: any;

  constructor(config: ProxyConfig) {
    this.config = config;

    // Initialize statistics service with configuration
    const tempDir = configService.getSetting<string>('tempDir');
    this.statisticsService = getStatisticsService();

    this.proxyMiddleware = new BunMiddleware(this.config, this.statisticsService);
    this.proxyRoutes = new BunRoutes(tempDir, this.statisticsService, this.proxyMiddleware);
    this.proxyCertificates = ProxyCertificates.getInstance(config);

    // Set cache expiration from main config if available
    const cacheMaxAge = configService.getSetting('cache.maxAge');
    setCacheExpiration(typeof cacheMaxAge === 'number' ? cacheMaxAge : 24 * 60 * 60 * 1000);

    // Listen for configuration changes
    this.setupConfigChangeHandling();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing proxy server...');

    // Set up SSL certificates
    await this.proxyCertificates.setupCertificates();

    // Set up routes (for complex routes that need the full routing system)
    this.proxyRoutes.setupRoutes(this.config);

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

  async start(): Promise<void> {
    logger.info('Starting proxy server...');

    // Start HTTP server
    this.httpServer = Bun.serve({
      port: this.config.port,
      fetch: this.handleRequest.bind(this),
      error: this.handleError.bind(this)
    });

    logger.info(`HTTP server started on port ${this.config.port}`);

    // Start HTTPS server only if we have valid certificates
    try {
      const certificates = this.proxyCertificates.getAllCertificates();
      const validCertificates = Array.from(certificates.values()).filter((cert: any) => cert.isValid);

      if (validCertificates.length > 0) {
        // Use the first valid certificate as default for HTTPS server
        const defaultCert = validCertificates[0];
        if (defaultCert) {
          const tlsOptions = this.proxyCertificates.getBunTLSOptions(defaultCert.domain);

          if (tlsOptions) {
            this.httpsServer = Bun.serve({
              port: this.config.httpsPort || 4443,
              fetch: this.handleRequest.bind(this),
              error: this.handleError.bind(this),
              tls: tlsOptions,
              routes: {
                "/robots.txt": () => new Response("User-agent: *\nDisallow: /", { status: 200 }),
                "/": () => new Response("Hello World", { status: 200 })
              }
            });

            logger.info(`HTTPS server started on port ${this.config.httpsPort || 4443} with certificate for ${defaultCert.domain}`);
          } else {
            logger.warn('Failed to get TLS options for HTTPS server');
            this.httpsServer = null;
          }
        } else {
          logger.warn('No valid certificates available, HTTPS server will not start');
          this.httpsServer = null;
        }
      } else {
        logger.warn('No valid certificates available, HTTPS server will not start');
        this.httpsServer = null;
      }
    } catch (error) {
      logger.warn('HTTPS server initialization failed', error);
      this.httpsServer = null;
    }

    logger.info('Proxy server started successfully');
  }

  async stop(): Promise<void> {
    logger.info('Stopping proxy server...');

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

    // Shutdown statistics service
    await this.statisticsService.shutdown();

    // Shutdown cache service (no shutdown method, just cleanup)
    await cacheService.cleanup();

    logger.info('Proxy server stopped successfully');
  }

  private async handleRequest(req: Request, server: Server): Promise<Response> {
    try {
      const response = await this.proxyRoutes.handleRequest(req, server);
      if (!response) {
        throw new Error('No route found');
      }
      return response;
    } catch (e) {
      logger.error('Error handling request', e);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: 'An error occurred while handling the request'
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



  getStatus(): any {
    return {
      httpPort: this.config.port,
      httpsPort: this.config.httpsPort,
      routes: this.config.routes.length,
      certificates: this.proxyCertificates.getAllCertificates(),
      statistics: this.statisticsService.getStatsSummary(),
      cache: cacheService.getStats(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  getConfig(): ProxyConfig {
    return this.config;
  }

  getStatisticsService(): any {
    return this.statisticsService;
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
      logger.info('Proxy server configuration updated successfully');
    } catch (error) {
      logger.error('Failed to update proxy server configuration', error);
    }
  }
} 