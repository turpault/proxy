import { BunRequest, Server, sleep } from 'bun';
import { ProxyConfig, MainConfig, ProxyRoute } from '../types';
import { logger } from '../utils/logger';
import { cacheService, setCacheExpiration } from './cache';
import { getStatisticsService } from './statistics';
import { BunRoutes } from './bun-routes';
import { BunMiddleware, BunRequestContext } from './bun-middleware';
import { ProxyCertificates } from './proxy-certificates';
import { configService } from './config-service';
import { BunClassicProxy } from './bun-classic-proxy';
import { BunCorsProxy } from './bun-cors-proxy';
import { geolocationService } from './geolocation';
import { OAuth2Service } from './oauth2';
import { StaticFileUtils, StaticFileConfig } from './static-utils';
import path from 'path';

export class ProxyServer {
  private httpServer: Server | null = null;
  private httpsServer: Server | null = null;
  private config: ProxyConfig;
  private proxyRoutes: BunRoutes;
  private proxyMiddleware: BunMiddleware;
  private proxyCertificates: ProxyCertificates;
  private statisticsService: any;
  private oauth2Service: OAuth2Service;

  // Native route handlers for better performance
  private staticRoutes: Map<string, { staticPath: string; spaFallback: boolean; publicPaths: string[]; route: ProxyRoute; oauth2Service?: OAuth2Service }> = new Map();
  private redirectRoutes: Map<string, string> = new Map();
  private proxyRoutesMap: Map<string, { target: string; route: ProxyRoute }> = new Map();
  private corsRoutes: Map<string, { route: ProxyRoute; corsProxy: BunCorsProxy }> = new Map();

  constructor(config: ProxyConfig) {
    this.config = config;

    this.oauth2Service = new OAuth2Service();
    // Initialize statistics service with configuration
    const logsDir = configService.getSetting<string>('logsDir');
    const reportDir = logsDir ? path.join(logsDir, 'statistics') : undefined;
    const dataDir = configService.getSetting<string>('statsDir');
    this.statisticsService = getStatisticsService();

    // Get temp directory from main config
    const tempDir = configService.getSetting<string>('tempDir');
    this.proxyRoutes = new BunRoutes(tempDir, this.statisticsService);
    this.proxyMiddleware = new BunMiddleware(this.config);
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

    // Set up native route handlers for better performance
    this.setupNativeRoutes();

    // Set up routes (for complex routes that need the full routing system)
    this.proxyRoutes.setupRoutes(this.config);

    // Set up cache cleanup
    this.setupCacheCleanup();

    logger.info('Proxy server initialization complete');
  }

  private setupNativeRoutes(): void {
    this.staticRoutes.clear();
    this.redirectRoutes.clear();
    this.proxyRoutesMap.clear();
    this.corsRoutes.clear();

    const tempDir = configService.getSetting<string>('tempDir');

    this.config.routes.forEach(route => {
      if (route.path) {
        const routePath = route.path;
        if (route.oauth2?.enabled) {
          route.oauthMiddleware = this.oauth2Service.createBunMiddleware(route.oauth2, route.publicPaths || [], routePath);
        }

        switch (route.type) {
          case 'static':
            if (route.staticPath) {
              this.staticRoutes.set(routePath, {
                staticPath: route.staticPath,
                spaFallback: route.spaFallback || false,
                publicPaths: route.publicPaths || [],
                route: route
              });
              logger.info(`Native static route configured: ${routePath} -> ${route.staticPath}`);
            }
            break;

          case 'redirect':
            if (route.redirectTo) {
              this.redirectRoutes.set(routePath, route.redirectTo);
              logger.info(`Native redirect route configured: ${routePath} -> ${route.redirectTo}`);
            }
            break;

          case 'proxy':
            if (route.target) {
              this.proxyRoutesMap.set(routePath, { target: route.target, route });
              logger.info(`Native proxy route configured: ${routePath} -> ${route.target}`);
            }
            break;

          case 'cors-forwarder':
            const corsProxy = new BunCorsProxy(tempDir);
            this.corsRoutes.set(routePath, { route, corsProxy });
            logger.info(`Native CORS route configured: ${routePath} -> dynamic target`);
            break;
        }
      }
    });
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
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;
    const headers = Object.fromEntries(req.headers as any);

    // Create a request-like object for middleware compatibility
    const requestContext: BunRequestContext = {
      method,
      url: req.url,
      pathname,
      headers,
      body: req.body,
      query: Object.fromEntries(url.searchParams.entries()),
      ip: this.getClientIP(req as any, server),
      originalUrl: req.url,
      req: req as any,
      server
    };

    // Apply middleware
    const middlewareResult = await this.proxyMiddleware.processRequest(requestContext);
    if (middlewareResult) {
      return middlewareResult;
    }


    // Handle native static routes first (most efficient)
    const staticRoute = this.findStaticRoute(pathname);
    if (staticRoute) {
      return this.handleStaticRoute(requestContext, staticRoute);
    }

    // Handle native redirect routes
    const redirectTarget = this.redirectRoutes.get(pathname);
    if (redirectTarget) {
      return this.handleRedirectRoute(requestContext, redirectTarget);
    }

    // Handle native proxy routes
    const proxyRoute = this.proxyRoutesMap.get(pathname);
    if (proxyRoute) {
      return this.handleProxyRoute(requestContext, proxyRoute);
    }

    // Handle native CORS routes
    const corsRoute = this.corsRoutes.get(pathname);
    if (corsRoute) {
      return this.handleCorsRoute(requestContext, corsRoute);
    }

    // Handle complex routes that need the full routing system
    const routeResponse = await this.proxyRoutes.handleRequest(requestContext, server, this.config);
    if (routeResponse) {
      return routeResponse;
    }

    // Handle unmatched requests (404)
    const startTime = Date.now();
    const clientIP = this.getClientIP(req as any, server);
    const geolocation = this.getGeolocation(clientIP);
    const userAgent = headers['user-agent'] || 'Unknown';

    // Create request context for statistics
    const unmatchedRequestContext: BunRequestContext = {
      method,
      url: req.url,
      pathname,
      headers,
      body: req.body,
      query: Object.fromEntries(url.searchParams.entries()),
      ip: clientIP,
      originalUrl: req.url,
      req: req as any,
      server
    };

    // Record statistics for unmatched request
    this.recordRequestStats(unmatchedRequestContext, { name: 'unmatched' }, 'unmatched', Date.now() - startTime, 404, 'unmatched');

    await sleep(10000);
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'No route configured for ' + method + ' ' + pathname,
      timestamp: new Date().toISOString()
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private findStaticRoute(pathname: string): { staticPath: string; spaFallback: boolean; publicPaths: string[]; route: ProxyRoute } | null {
    // Find the longest matching static route
    let bestMatch: { staticPath: string; spaFallback: boolean; publicPaths: string[]; route: ProxyRoute } | null = null;
    let bestLength = 0;

    for (const [routePath, config] of this.staticRoutes) {
      if (pathname.startsWith(routePath) && routePath.length > bestLength) {
        bestMatch = config;
        bestLength = routePath.length;
      }
    }

    return bestMatch;
  }

  private async handleStaticRoute(requestContext: BunRequestContext, config: { staticPath: string; spaFallback: boolean; publicPaths: string[]; route: ProxyRoute }): Promise<Response> {
    const { staticPath, spaFallback, route } = config;

    // Find the matching route path to remove from the request pathname
    let routePath = '';
    for (const [route, routeConfig] of this.staticRoutes) {
      if (routeConfig === config) {
        routePath = route;
        break;
      }
    }

    // Handle OAuth middleware if present
    if (route.oauthMiddleware) {
      const oauthResult = await route.oauthMiddleware(requestContext);
      if (oauthResult) {
        return oauthResult;
      }
    }

    // Use shared static file utilities
    const staticConfig: StaticFileConfig = {
      staticPath,
      spaFallback,
      publicPaths: config.publicPaths || []
    };

    const result = await StaticFileUtils.serveStaticFile(
      requestContext,
      staticConfig,
      route,
      this.statisticsService
    );

    return result.response;
  }



  private handleRedirectRoute(requestContext: BunRequestContext, redirectTarget: string): Response {
    logger.info(`[NATIVE REDIRECT] ${requestContext.method} ${requestContext.originalUrl} -> ${redirectTarget}`);
    const start = Date.now();

    // Record statistics
    this.recordRequestStats(requestContext, { name: 'redirect' }, redirectTarget, Date.now() - start, 301, 'redirect');

    return new Response(null, {
      status: 301,
      headers: { 'Location': redirectTarget }
    });
  }

  private async handleProxyRoute(requestContext: BunRequestContext, config: { target: string; route: ProxyRoute }): Promise<Response> {
    const { target, route } = config;
    const startTime = Date.now();
    const classicProxy = new BunClassicProxy();

    try {
      const proxyConfig = {
        route,
        target,
        routeIdentifier: `native-proxy ${requestContext.pathname}`,
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      const response = await classicProxy.handleProxyRequest(requestContext, proxyConfig);

      // Record statistics
      const responseTime = Date.now() - startTime;
      this.recordRequestStats(requestContext, route, target, responseTime, response.status, 'proxy');

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`[NATIVE PROXY] Error in proxy request for ${requestContext.pathname}`, error);

      // Record statistics for error
      this.recordRequestStats(requestContext, route, target, responseTime, 502, 'proxy');

      return new Response(JSON.stringify({
        error: 'Proxy Error',
        message: 'Failed to proxy request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleCorsRoute(requestContext: BunRequestContext, config: { route: ProxyRoute; corsProxy: BunCorsProxy }): Promise<Response> {
    const { route, corsProxy } = config;
    const target = this.extractTargetFromRequest(requestContext);

    if (!target) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Missing target parameter'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    logger.info(`[NATIVE CORS] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

    const proxyConfig = {
      route,
      target,
      routeIdentifier: `native-cors ${requestContext.pathname}`,
      secure: false,
      timeouts: { request: 30000, proxy: 30000 },
      logRequests: true,
      logErrors: true
    };

    const startTime = Date.now();

    try {
      const response = await corsProxy.handleProxyRequest(requestContext, proxyConfig);

      // Record statistics for successful CORS request
      const responseTime = Date.now() - startTime;
      this.recordRequestStats(requestContext, route, target, responseTime, response.status, 'cors-forwarder');

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`[NATIVE CORS] Error in proxy request for ${requestContext.pathname}`, error);

      // Record statistics for error
      this.recordRequestStats(requestContext, route, target, responseTime, 502, 'cors-forwarder');

      return new Response(JSON.stringify({
        error: 'CORS Proxy Error',
        message: 'Failed to proxy request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private extractTargetFromRequest(requestContext: BunRequestContext): string | null {
    // Extract target from base64 URL parameter for CORS forwarder
    const url = new URL(requestContext.url);
    const targetParam = url.searchParams.get('target');

    if (targetParam) {
      try {
        return atob(targetParam);
      } catch (error) {
        logger.error('Failed to decode target parameter', error);
        return null;
      }
    }

    return null;
  }



  private recordRequestStats(requestContext: BunRequestContext, route: any, target: string, responseTime: number, statusCode: number, requestType: string = 'proxy'): void {
    if (this.statisticsService) {
      const clientIP = this.getClientIPFromContext(requestContext);
      const geolocation = this.getGeolocation(clientIP);
      const userAgent = requestContext.headers['user-agent'] || 'Unknown';

      this.statisticsService.recordRequest(
        clientIP,
        geolocation,
        requestContext.pathname,
        requestContext.method,
        userAgent,
        responseTime,
        route?.domain || 'unknown',
        target,
        requestType
      );
    }
  }

  private handleError(error: Error): Response {
    logger.error('Server error', error);
    return new Response('Internal Server Error', { status: 500 });
  }

  private getClientIP(req: BunRequest, server: Server): string {
    const headers = req.headers;
    const xForwardedFor = headers.get('x-forwarded-for');
    const xRealIP = headers.get('x-real-ip');
    const xClientIP = headers.get('x-client-ip');

    if (xForwardedFor) {
      const firstIP = xForwardedFor.split(',')[0];
      return firstIP ? firstIP.trim() : 'unknown';
    }

    if (xRealIP) {
      return xRealIP;
    }

    if (xClientIP) {
      return xClientIP;
    }

    const remoteAddress = server.requestIP(req);
    if (remoteAddress) {
      return remoteAddress.address;
    }

    return 'unknown';
  }

  private getClientIPFromContext(requestContext: BunRequestContext): string {
    const headers = requestContext.headers;
    const xForwardedFor = headers['x-forwarded-for'];
    const xRealIP = headers['x-real-ip'];
    const xClientIP = headers['x-client-ip'];

    if (xForwardedFor) {
      const firstIP = xForwardedFor.split(',')[0];
      return firstIP ? firstIP.trim() : 'unknown';
    }

    if (xRealIP) {
      return xRealIP;
    }

    if (xClientIP) {
      return xClientIP;
    }

    return requestContext.ip || 'unknown';
  }

  private getGeolocation(ip: string): any {
    try {
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