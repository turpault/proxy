import express from 'express';
import { ProxyRoute, ServerConfig } from '../types';
import { logger } from '../utils/logger';
import { ClassicProxy } from './classic-proxy';
import { CorsProxy } from './cors-proxy';
import { ProxyRequestConfig } from './base-proxy';
import { OAuth2Service } from './oauth2';
import path from 'path';

export class ProxyRoutes {
  private classicProxy: ClassicProxy;
  private corsProxy: CorsProxy;
  private oauth2Service: OAuth2Service;

  constructor() {
    this.classicProxy = new ClassicProxy();
    this.corsProxy = new CorsProxy();
    this.oauth2Service = new OAuth2Service();
  }

  setupRoutes(app: express.Application, config: ServerConfig): void {
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

    // Apply OAuth2 middleware if configured
    if (route.oauth2 && route.oauth2.enabled) {
      const oauthMiddleware = this.oauth2Service.createMiddleware(route.oauth2, route.publicPaths || []);
      app.use(routePath, oauthMiddleware);
      logger.info(`OAuth2 middleware applied to static route: ${routePath}`);
    }

    // Set up static file serving
    app.use(routePath, express.static(route.staticPath));
    
    // Handle SPA fallback - serve index.html for routes that don't exist
    if (route.spaFallback) {
      app.use(routePath, (req, res, next) => {
        // Skip if this is an API route or static asset
        if (req.path.startsWith('/api/') || req.path.startsWith('/static/') || req.path.includes('.')) {
          return next();
        }
        
        // Serve index.html for SPA routes
        const indexPath = path.join(route.staticPath!, 'index.html');
        res.sendFile(indexPath, (err) => {
          if (err) {
            logger.error(`Failed to serve index.html for SPA route: ${req.path}`, err);
            return next();
          }
        });
      });
      logger.info(`SPA fallback enabled for static route: ${routePath}`);
    }
    
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
      res.redirect(301, redirectUrl);
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`[REDIRECT] ${req.method} ${req.originalUrl} -> ${redirectUrl} [${res.statusCode}] (${duration}ms)`);
      });
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
        res.redirect(301, redirectUrl);
        res.on('finish', () => {
          const duration = Date.now() - start;
          logger.info(`[REDIRECT] ${req.method} ${req.originalUrl} -> ${redirectUrl} [${res.statusCode}] (${duration}ms)`);
        });
      } else {
        next();
      }
    });

    logger.info(`Redirect domain route configured: ${route.domain} -> ${route.redirectTo}`);
  }

  private setupClassicProxyRoute(app: express.Application, route: ProxyRoute, routePath: string): void {
    const proxy = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
        await this.classicProxy.handleProxyRequest(req, res, config);
      } catch (error) {
        logger.error(`[CLASSIC PROXY] Error in proxy request for ${routePath}`, error);
        this.handleProxyError(error as Error, req, res, `classic ${routePath}`, route.target!, route, true);
      }
    };
    
    app.use(routePath, proxy);
    logger.info(`Classic proxy route configured: ${routePath} -> ${route.target}`);
  }

  private setupClassicProxyDomainRoute(app: express.Application, route: ProxyRoute): void {
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
        await this.classicProxy.handleProxyRequest(req, res, config);
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
    const proxy = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const encodedUrl = req.query.url;
      if (!encodedUrl || typeof encodedUrl !== 'string') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing base64-encoded url query parameter'
        });
      }
      let target: string;
      try {
        target = Buffer.from(encodedUrl, 'base64').toString('utf-8');
      } catch {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid base64 encoding in url parameter'
        });
      }
      // Validate target URL
      try {
        new URL(target);
      } catch {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Decoded url is not a valid URL'
        });
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
        await this.corsProxy.handleProxyRequest(req, res, config);
      } catch (error) {
        logger.error(`[CORS FORWARDER] Error in proxy request for ${routePath}`, error);
        this.handleProxyError(error as Error, req, res, `cors-forwarder ${routePath}`, target, route, true);
      }
    };
    
    if (route.cors) {
      app.use(routePath, this.corsProxy.createCorsMiddleware(route.cors));
    }
    app.use(routePath, proxy);
    const corsStatus = route.cors ? ' (with CORS)' : '';
    logger.info(`CORS forwarder route configured: ${routePath} -> dynamic target via base64 url param${corsStatus}`);
  }

  private setupCorsForwarderDomainRoute(app: express.Application, route: ProxyRoute): void {
    const proxy = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const encodedUrl = req.query.url;
      if (!encodedUrl || typeof encodedUrl !== 'string') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing base64-encoded url query parameter'
        });
      }
      let target: string;
      try {
        target = Buffer.from(encodedUrl, 'base64').toString('utf-8');
      } catch {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid base64 encoding in url parameter'
        });
      }
      // Validate target URL
      try {
        new URL(target);
      } catch {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Decoded url is not a valid URL'
        });
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
        await this.corsProxy.handleProxyRequest(req, res, config);
      } catch (error) {
        logger.error(`[CORS FORWARDER] Error in proxy request for ${route.domain}`, error);
        this.handleProxyError(error as Error, req, res, `cors-forwarder ${route.domain}`, target, route, true);
      }
    };
    
    app.use((req, res, next) => {
      const host = req.get('host');
      if (host === route.domain || host === `www.${route.domain}`) {
        if (route.cors) {
          const corsMiddleware = this.corsProxy.createCorsMiddleware(route.cors);
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
} 