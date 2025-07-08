import express from 'express';
import { ProxyRoute, ProxyConfig } from '../types';
import { logger } from '../utils/logger';
import { ClassicProxy } from './classic-proxy';
import { CorsProxy } from './cors-proxy';
import { StaticProxy } from './static-proxy';
import { ProxyRequestConfig } from './base-proxy';
import { OAuth2Service } from './oauth2';
import { geolocationService } from './geolocation';
import path from 'path';

export class ProxyRoutes {
  private statisticsService: any;
  private tempDir?: string;

  constructor(tempDir?: string, statisticsService?: any) {
    this.statisticsService = statisticsService;
    this.tempDir = tempDir;
  }

  setupRoutes(app: express.Application, config: ProxyConfig): void {
    // Set up routes based on configuration
    config.routes.forEach(route => {
      if (route.path) {
        this.setupPathRoute(app, route);
      } else {
        this.setupDomainRoute(app, route);
      }
    });

    logger.info(`Configured ${config.routes.length} routes`);
  }

  private setupPathRoute(app: express.Application, route: ProxyRoute): void {
    const routePath = route.path!;

    switch (route.type) {
      case 'static':
        this.setupStaticRoute(app, route, routePath);
        break;
      case 'redirect':
        this.setupRedirectRoute(app, route, routePath);
        break;
      case 'cors-forwarder':
        this.setupCorsForwarderRoute(app, route, routePath);
        break;
      case 'proxy':
      default:
        this.setupClassicProxyRoute(app, route, routePath);
        break;
    }
  }

  private setupDomainRoute(app: express.Application, route: ProxyRoute): void {
    switch (route.type) {
      case 'redirect':
        this.setupRedirectDomainRoute(app, route);
        break;
      case 'cors-forwarder':
        this.setupCorsForwarderDomainRoute(app, route);
        break;
      case 'proxy':
      default:
        this.setupClassicProxyDomainRoute(app, route);
        break;
    }
  }

  private setupStaticRoute(app: express.Application, route: ProxyRoute, routePath: string): void {
    if (!route.staticPath) {
      logger.error(`Static path not configured for route ${routePath}`);
      return;
    }

    // Create per-route proxy instances
    const oauth2Service = new OAuth2Service();
    const staticProxy = new StaticProxy({
      staticPath: route.staticPath,
      spaFallback: route.spaFallback,
      publicPaths: route.publicPaths || []
    }, this.tempDir);

    // Apply OAuth2 middleware if configured
    if (route.oauth2 && route.oauth2.enabled) {
      const oauthMiddleware = oauth2Service.createMiddleware(route.oauth2, route.publicPaths || []);
      app.use(routePath, oauthMiddleware);
      logger.info(`OAuth2 middleware applied to static route: ${routePath}`);
    }

    // Set up static file serving with statistics recording
    app.use(routePath, (req, res, next) => {
      const startTime = Date.now();

      // Record statistics when response finishes
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        this.recordRequestStats(req, route, route.staticPath!, responseTime, res.statusCode, 'static');
      });

      next();
    });

    // Use the StaticProxy to handle the request
    const config: ProxyRequestConfig = {
      route,
      target: route.staticPath,
      routeIdentifier: `static ${routePath}`,
      secure: false,
      timeouts: { request: 30000, proxy: 30000 },
      logRequests: true,
      logErrors: true
    };

    app.use(routePath, (req, res, next) => {
      staticProxy.handleProxyRequest(req, res, config).catch(error => {
        logger.error(`[STATIC PROXY] Unhandled error for ${routePath}`, error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while serving static files'
          });
        }
      });
    });

    logger.info(`Static route configured: ${routePath} -> ${route.staticPath}${route.spaFallback ? ' (with SPA fallback)' : ''}`);
  }

  private setupRedirectRoute(app: express.Application, route: ProxyRoute, routePath: string): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for route ${routePath}`);
      return;
    }

    app.use(routePath, (req, res, next) => {
      logger.info(`[REDIRECT] ${req.method} ${req.originalUrl} -> ${route.redirectTo}`);
      const start = Date.now();
      const redirectUrl = route.redirectTo!;

      // Record statistics when response finishes
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`[REDIRECT] ${req.method} ${req.originalUrl} -> ${redirectUrl} [${res.statusCode}] (${duration}ms)`);
        this.recordRequestStats(req, route, redirectUrl, duration, res.statusCode, 'redirect');
      });

      res.redirect(301, redirectUrl);
    });

    logger.info(`Redirect route configured: ${routePath} -> ${route.redirectTo}`);
  }

  private setupRedirectDomainRoute(app: express.Application, route: ProxyRoute): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for domain ${route.domain}`);
      return;
    }

    app.use((req, res, next) => {
      const host = req.get('host');
      if (host === route.domain || host === `www.${route.domain}`) {
        logger.info(`[REDIRECT] ${req.method} ${req.originalUrl} -> ${route.redirectTo}`);
        const start = Date.now();
        const redirectUrl = route.redirectTo!;

        // Record statistics when response finishes
        res.on('finish', () => {
          const duration = Date.now() - start;
          logger.info(`[REDIRECT] ${req.method} ${req.originalUrl} -> ${redirectUrl} [${res.statusCode}] (${duration}ms)`);
          this.recordRequestStats(req, route, redirectUrl, duration, res.statusCode, 'redirect');
        });

        res.redirect(301, redirectUrl);
      } else {
        next();
      }
    });

    logger.info(`Redirect domain route configured: ${route.domain} -> ${route.redirectTo}`);
  }

  private setupClassicProxyRoute(app: express.Application, route: ProxyRoute, routePath: string): void {
    // Create per-route proxy instances
    const oauth2Service = new OAuth2Service();
    const classicProxy = new ClassicProxy();

    // Apply OAuth2 middleware if configured
    if (route.oauth2 && route.oauth2.enabled) {
      const oauthMiddleware = oauth2Service.createMiddleware(route.oauth2, route.publicPaths || []);
      app.use(routePath, oauthMiddleware);
      logger.info(`OAuth2 middleware applied to classic proxy route: ${routePath}`);
    }

    const proxy = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const startTime = Date.now();
      const config: ProxyRequestConfig = {
        route,
        target: route.target!,
        routeIdentifier: `classic ${routePath}`,
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      try {
        await classicProxy.handleProxyRequest(req, res, config);

        // Record statistics after successful request
        const responseTime = Date.now() - startTime;
        this.recordRequestStats(req, route, route.target!, responseTime, res.statusCode, 'proxy');
      } catch (error) {
        logger.error(`[CLASSIC PROXY] Error in proxy request for ${routePath}`, error);
        this.handleProxyError(error as Error, req, res, `classic ${routePath}`, route.target!, route, true);

        // Record statistics even for failed requests
        const responseTime = Date.now() - startTime;
        this.recordRequestStats(req, route, route.target!, responseTime, res.statusCode || 500, 'proxy');
      }
    };

    app.use(routePath, proxy);
    logger.info(`Classic proxy route configured: ${routePath} -> ${route.target}`);
  }

  private setupClassicProxyDomainRoute(app: express.Application, route: ProxyRoute): void {
    // Create per-route proxy instances
    const oauth2Service = new OAuth2Service();
    const classicProxy = new ClassicProxy();

    // Apply OAuth2 middleware if configured
    if (route.oauth2 && route.oauth2.enabled) {
      const oauthMiddleware = oauth2Service.createMiddleware(route.oauth2, route.publicPaths || []);
      app.use(oauthMiddleware);
      logger.info(`OAuth2 middleware applied to classic proxy domain route: ${route.domain}`);
    }

    const proxy = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const config: ProxyRequestConfig = {
        route,
        target: route.target!,
        routeIdentifier: `classic ${route.domain}`,
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      try {
        await classicProxy.handleProxyRequest(req, res, config);
      } catch (error) {
        logger.error(`[CLASSIC PROXY] Error in proxy request for ${route.domain}`, error);
        this.handleProxyError(error as Error, req, res, `classic ${route.domain}`, route.target!, route, true);
      }
    };

    app.use((req, res, next) => {
      const host = req.get('host');
      if (host === route.domain || host === `www.${route.domain}`) {
        proxy(req, res, next);
      } else {
        next();
      }
    });
    logger.info(`Classic proxy domain route configured: ${route.domain} -> ${route.target}`);
  }

  private setupCorsForwarderRoute(app: express.Application, route: ProxyRoute, routePath: string): void {
    // Create per-route proxy instances
    const corsProxy = new CorsProxy(this.tempDir);

    const proxy = async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
      const startTime = Date.now();

      // Validate and decode target URL
      const encodedUrl = req.query.url;
      if (!encodedUrl || typeof encodedUrl !== 'string') {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Missing base64-encoded url parameter'
        });
        return;
      }

      let target: string;
      try {
        target = Buffer.from(encodedUrl, 'base64').toString('utf-8');
      } catch {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid base64 encoding in url parameter'
        });
        return;
      }

      // Validate URL format
      try {
        new URL(target);
      } catch {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Decoded url is not a valid URL'
        });
        return;
      }

      logger.info(`[CORS FORWARDER] ${req.method} ${req.originalUrl} -> ${target}`);

      try {
        const config: ProxyRequestConfig = {
          route,
          target,
          routeIdentifier: `cors-forwarder ${routePath}`,
          secure: false,
          timeouts: { request: 30000, proxy: 30000 },
          logRequests: true,
          logErrors: true
        };
        await corsProxy.handleProxyRequest(req, res, config);

        // Record statistics after successful request
        const responseTime = Date.now() - startTime;
        this.recordRequestStats(req, route, target, responseTime, res.statusCode, 'proxy');
      } catch (error) {
        logger.error(`[CORS FORWARDER] Error in proxy request for ${routePath}`, error);
        this.handleProxyError(error as Error, req, res, `cors-forwarder ${routePath}`, target, route, true);

        // Record statistics even for failed requests
        const responseTime = Date.now() - startTime;
        this.recordRequestStats(req, route, target, responseTime, res.statusCode || 500, 'proxy');
      }
    };

    if (route.cors) {
      app.use(routePath, corsProxy.createCorsMiddleware(route.cors));
    }
    app.use(routePath, proxy);
    const corsStatus = route.cors ? ' (with CORS)' : '';
    logger.info(`CORS forwarder route configured: ${routePath} -> dynamic target via base64 url param${corsStatus}`);
  }

  private setupCorsForwarderDomainRoute(app: express.Application, route: ProxyRoute): void {
    // Create per-route proxy instances
    const corsProxy = new CorsProxy(this.tempDir);

    const proxy = async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
      const encodedUrl = req.query.url;
      if (!encodedUrl || typeof encodedUrl !== 'string') {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Missing base64-encoded url query parameter'
        });
        return;
      }
      let target: string;
      try {
        target = Buffer.from(encodedUrl, 'base64').toString('utf-8');
      } catch {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid base64 encoding in url parameter'
        });
        return;
      }
      // Validate target URL
      try {
        new URL(target);
      } catch {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Decoded url is not a valid URL'
        });
        return;
      }
      logger.info(`[CORS FORWARDER] ${req.method} ${req.originalUrl} -> ${target}`);
      try {
        const config: ProxyRequestConfig = {
          route,
          target,
          routeIdentifier: `cors-forwarder ${route.domain}`,
          secure: false,
          timeouts: { request: 30000, proxy: 30000 },
          logRequests: true,
          logErrors: true
        };
        await corsProxy.handleProxyRequest(req, res, config);
      } catch (error) {
        logger.error(`[CORS FORWARDER] Error in proxy request for ${route.domain}`, error);
        this.handleProxyError(error as Error, req, res, `cors-forwarder ${route.domain}`, target, route, true);
      }
    };

    app.use((req, res, next) => {
      const host = req.get('host');
      if (host === route.domain || host === `www.${route.domain}`) {
        if (route.cors) {
          const corsMiddleware = corsProxy.createCorsMiddleware(route.cors);
          corsMiddleware(req, res, () => proxy(req, res, next));
        } else {
          proxy(req, res, next);
        }
      } else {
        next();
      }
    });
    const corsStatus = route.cors ? ' (with CORS)' : '';
    logger.info(`CORS forwarder domain route configured: ${route.domain} -> dynamic target via base64 url param${corsStatus}`);
  }

  private handleProxyError(
    error: Error,
    req: express.Request,
    res: express.Response,
    routeIdentifier: string,
    target: string,
    route: ProxyRoute,
    logErrors: boolean,
    customErrorResponse?: { code?: string; message?: string }
  ): void {
    // Create a simple error response since we can't access the protected method
    if (logErrors) {
      logger.error(`[PROXY ERROR] ${routeIdentifier} -> ${target}`, {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.originalUrl,
        clientIP: req.ip || req.socket?.remoteAddress || 'unknown'
      });
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: customErrorResponse?.code || 'Proxy Error',
        message: customErrorResponse?.message || 'An error occurred while processing your request'
      });
    }
  }

  /**
   * Record request statistics if statistics service is available
   */
  private recordRequestStats(
    req: express.Request,
    route: ProxyRoute,
    target: string,
    responseTime: number,
    statusCode: number,
    requestType: string = 'proxy'
  ): void {
    if (!this.statisticsService) return;

    try {
      const clientIP = this.getClientIP(req);
      const geolocation = geolocationService.getGeolocation(clientIP);
      const userAgent = req.get('user-agent') || 'Unknown';
      const method = req.method;
      const routePath = route.path || route.domain || 'unknown';
      const domain = route.domain;

      this.statisticsService.recordRequest(
        clientIP,
        geolocation,
        routePath,
        method,
        userAgent,
        responseTime,
        domain,
        target,
        requestType
      );
    } catch (error) {
      logger.debug('Failed to record request statistics', error);
    }
  }

  /**
   * Get client IP address with proxy header support
   */
  private getClientIP(req: express.Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    ).split(',')[0].trim();
  }
} 