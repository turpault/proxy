import { BunRequestContext, ProxyConfig, ProxyRoute } from '../types';
import { logger } from '../utils/logger';
import { BunClassicProxy } from './bun-classic-proxy';
import { BunCorsProxy } from './bun-cors-proxy';
import { BunStaticProxy } from './bun-static-proxy';

export interface ProxyRequestConfig {
  route: ProxyRoute;
  target: string;
  routeIdentifier: string;
  secure: boolean;
  timeouts: { request: number; proxy: number };
  logRequests: boolean;
  logErrors: boolean;
  customErrorResponse?: { code?: string; message?: string };
}

import { Server, sleep, file } from 'bun';
import path from 'path';
import { BunMiddleware } from './bun-middleware';
import { geolocationService } from './geolocation';
import { StatisticsService } from './statistics';

export class BunRoutes {
  private statisticsService: StatisticsService;
  private tempDir: string;
  private routeHandlers: Array<{
    route: ProxyRoute;
    handler: (requestContext: BunRequestContext, server: Server) => Promise<Response | null> | Response | null;
  }> = [];

  constructor(tempDir: string, statisticsService: StatisticsService) {
    this.statisticsService = statisticsService;
    this.tempDir = tempDir;
  }

  setupRoutes(config: ProxyConfig): void {
    this.routeHandlers = [];

    // Set up routes based on configuration
    config.routes.forEach(route => {
      if (route.path) {
        this.setupPathRoute(route);
      } else {
        this.setupDomainRoute(route);
      }
    });

    // Sort routes by path length (longest first) to ensure more specific routes match first
    this.routeHandlers.sort((a, b) => {
      const pathA = a.route.path || '';
      const pathB = b.route.path || '';
      return pathB.length - pathA.length;
    });

    logger.info(`Configured ${config.routes.length} routes`);
  }

  private setupPathRoute(route: ProxyRoute): void {
    switch (route.type) {
      case 'static':
        this.setupStaticRoute(route);
        break;
      case 'redirect':
        this.setupRedirectRoute(route);
        break;
      case 'cors-forwarder':
        this.setupCorsForwarderRoute(route);
        break;
      case 'proxy':
      default:
        this.setupClassicProxyRoute(route);
        break;
    }
  }

  private setupDomainRoute(route: ProxyRoute): void {
    switch (route.type) {
      case 'redirect':
        this.setupRedirectDomainRoute(route);
        break;
      case 'cors-forwarder':
        this.setupCorsForwarderDomainRoute(route);
        break;
      case 'proxy':
      default:
        this.setupClassicProxyDomainRoute(route);
        break;
    }
  }

  private setupStaticRoute(route: ProxyRoute): void {
    if (!route.staticPath) {
      logger.error(`Static path not configured for route ${route.path}`);
      return;
    }

    const staticProxy = new BunStaticProxy({
      staticPath: route.staticPath,
      spaFallback: route.spaFallback,
      publicPaths: route.publicPaths || []
    }, this.tempDir, this.statisticsService);

    this.routeHandlers.push({
      route,
      handler: (requestContext: BunRequestContext, server: Server) => {
        const config: ProxyRequestConfig = {
          route,
          target: route.staticPath!,
          routeIdentifier: `static ${route.path}`,
          secure: false,
          timeouts: { request: 30000, proxy: 30000 },
          logRequests: true,
          logErrors: true
        };

        // Call the static proxy directly with Bun request context
        return staticProxy.handleProxyRequest(requestContext, config);
      }
    });

    logger.info(`Static proxy route configured: ${route.path} -> ${route.staticPath}`);
  }

  private setupRedirectRoute(route: ProxyRoute): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for route ${route.path}`);
      return;
    }

    this.routeHandlers.push({
      route,
      handler: (requestContext: BunRequestContext) => {
        logger.info(`[REDIRECT] ${requestContext.method} ${requestContext.originalUrl} -> ${route.redirectTo}`);
        const redirectUrl = route.redirectTo!;

        return new Response(null, {
          status: 301,
          headers: { 'Location': redirectUrl }
        });
      }
    });



    logger.info(`Redirect route configured: ${route.path} -> ${route.redirectTo}`);
  }

  private setupRedirectDomainRoute(route: ProxyRoute): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for domain ${route.domain}`);
      return;
    }

    this.routeHandlers.push({
      route,
      handler: (requestContext: BunRequestContext) => {
        const host = requestContext.headers['host'];
        if (host === route.domain || host === `www.${route.domain}`) {
          logger.info(`[REDIRECT] ${requestContext.method} ${requestContext.originalUrl} -> ${route.redirectTo}`);
          const redirectUrl = route.redirectTo!;

          return new Response(null, {
            status: 301,
            headers: { 'Location': redirectUrl }
          }
          );
        }
        return null;
      }
    });

    logger.info(`Redirect domain route configured: ${route.domain} -> ${route.redirectTo}`);
  }

  private setupClassicProxyRoute(route: ProxyRoute): void {
    const classicProxy = new BunClassicProxy();

    this.routeHandlers.push({
      route,
      handler: (requestContext: BunRequestContext) => {
        const config: ProxyRequestConfig = {
          route,
          target: route.target!,
          routeIdentifier: `classic ${route.path}`,
          secure: false,
          timeouts: { request: 30000, proxy: 30000 },
          logRequests: true,
          logErrors: true
        };

        // Call the classic proxy directly with Bun request context
        return classicProxy.handleProxyRequest(requestContext, config);
      }
    });

    logger.info(`Classic proxy route configured: ${route.path} -> ${route.target}`);
  }

  private setupClassicProxyDomainRoute(route: ProxyRoute): void {
    const classicProxy = new BunClassicProxy();

    this.routeHandlers.push({
      route,
      handler: (requestContext: BunRequestContext) => {
        const host = requestContext.headers['host'];
        if (host === route.domain || host === `www.${route.domain}`) {
          const config: ProxyRequestConfig = {
            route,
            target: route.target!,
            routeIdentifier: `classic ${route.domain}`,
            secure: false,
            timeouts: { request: 30000, proxy: 30000 },
            logRequests: true,
            logErrors: true
          };

          // Call the classic proxy directly with Bun request context
          const response = classicProxy.handleProxyRequest(requestContext, config);

          return response;
        }
        return null;
      }
    });

    logger.info(`Classic proxy domain route configured: ${route.domain} -> ${route.target}`);
  }

  private setupCorsForwarderRoute(route: ProxyRoute): void {
    const corsProxy = new BunCorsProxy(this.tempDir, route);

    this.routeHandlers.push({
      route,
      handler: (requestContext: BunRequestContext) => {
        return corsProxy.handleProxyRequest(requestContext);
      }
    });

    logger.info(`CORS forwarder route configured: ${route.path} -> dynamic target via base64 url param`);
  }

  private setupCorsForwarderDomainRoute(route: ProxyRoute): void {
    const corsProxy = new BunCorsProxy(this.tempDir, route);

    this.routeHandlers.push({
      route,
      handler: (requestContext: BunRequestContext) => {
        const host = requestContext.headers['host'];
        if (host === route.domain || host === `www.${route.domain}`) {
          return corsProxy.handleProxyRequest(requestContext);
        }
        throw new Error('No handler found');
      }
    });

    logger.info(`CORS forwarder domain route configured: ${route.domain} -> dynamic target via base64 url param`);
  }

  private getHandler(requestContext: BunRequestContext) {
    // Check for matches - routes are already sorted by path length (longest first)
    for (const { route, handler } of this.routeHandlers) {
      const host = requestContext.headers['host'];
      if (host === route.domain || host === `www.${route.domain} `) {
        if (!route.path) {
          // Domain-based route (no path property)
          return { route, handler };
        } else {
          // Path-based route          
          if (requestContext.pathname === route.path || requestContext.pathname.startsWith(route.path + '/')) {
            return { route, handler };
          }
        }
      }
    }

    return { route: null, handler: null };
  }
  private createRequestContext(req: Request, server: Server): BunRequestContext {
    const url = new URL(req.url);
    const headers = Object.fromEntries(req.headers as any);
    let ip = server.requestIP(req)?.address || 'unknown';
    const xForwardedFor = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
    const xRealIP = headers['x-real-ip'] || headers['X-Real-IP'];
    const xClientIP = headers['x-client-ip'] || headers['X-Client-IP'];

    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, first one is the original client
      const firstIP = xForwardedFor.split(',')[0];
      ip = firstIP ? firstIP.trim() : 'unknown';
    }

    if (xRealIP) {
      ip = xRealIP;
    }

    if (xClientIP) {
      ip = xClientIP;
    }

    const requestContext: BunRequestContext = {
      method: req.method,
      geolocation: geolocationService.getGeolocation(ip),
      userAgent: headers['user-agent'] || 'Unknown',
      url: req.url,
      pathname: url.pathname,
      headers,
      body: req.body,
      query: Object.fromEntries(url.searchParams.entries()),
      ip,
      originalUrl: req.url,
      req: req as any,
      server
    };

    return requestContext;
  }

  async handleRequest(req: Request, server: Server, middleware: BunMiddleware): Promise<Response> {
    const requestContext = this.createRequestContext(req, server);
    let route: ProxyRoute | null = null;
    const startTime = Date.now();
    let response: Response | null = null;

    try {

      const { route: matchedRoute, handler } = this.getHandler(requestContext);
      route = matchedRoute;
      if (route && handler) {
        // Apply middleware
        if (middleware) {
          const middlewareResult = await middleware?.processRequest(requestContext, route);
          if (middlewareResult) {
            response = middlewareResult;
          } else {

            response = await handler(requestContext, server);
          }
        }

      } else {
        logger.info(`[BUN ROUTES] ${requestContext.method} ${requestContext.originalUrl} - no handler found`);
        // No route found, record statistics for unmatched request
        await sleep(1000 + Math.random() * 1000);

        // Return 404 with 404.jpg image
        try {
          const imagePath = path.join(__dirname, '404.jpg');
          const imageFile = file(imagePath);
          const imageExists = await imageFile.exists();

          if (imageExists) {
            response = new Response(imageFile.stream(), {
              status: 404,
              headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=3600'
              }
            });
          } else {
            logger.warn(`404.jpg not found at ${imagePath}, returning plain 404`);
            response = new Response('Not Found', { status: 404 });
          }

        } catch (error) {
          logger.error('Error loading 404.jpg:', error);
          response = new Response('Not Found', { status: 404 });
        }
      }
    } catch (error) {
      response = this.handleProxyError(error as Error, requestContext, route, true);
    }
    finally {
      const responseTime = Date.now() - startTime;
      if (response) {
        response.headers.set('X-Response-Time', responseTime.toString());
        this.recordRequestStats(requestContext, route, responseTime, response);
        return response;
      }
      throw new Error('No response from handler');
    }
  }

  private recordRequestStats(requestContext: BunRequestContext, route: ProxyRoute | null, responseTime: number, response: Response) {
    this.statisticsService.recordRequest(requestContext, route, responseTime, response);
  }



  private handleProxyError(
    error: Error,
    requestContext: BunRequestContext,
    route: ProxyRoute | null,
    logErrors: boolean,
    customErrorResponse?: { code?: string; message?: string }
  ): Response {
    const errorDetails = {
      error: error.message,
      stack: error.stack
    };

    if (logErrors) {
      logger.error(`Proxy error for ${route?.name}${route?.cors ? ' (CORS enabled)' : ''} `, errorDetails);
    }

    const statusCode = customErrorResponse?.code ? parseInt(customErrorResponse.code) : 502;
    const message = customErrorResponse?.message || 'Bad Gateway';

    return new Response(JSON.stringify({
      error: 'Proxy Error',
      message,
      timestamp: new Date().toISOString()
    }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    });
  }


} 