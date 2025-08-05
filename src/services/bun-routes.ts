import { ProxyConfig, ProxyRoute } from '../types';
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

import { Server, sleep } from 'bun';
import { BunMiddleware, BunRequestContext } from './bun-middleware';

export class BunRoutes {
  private statisticsService: any;
  private tempDir?: string;
  private middleware?: BunMiddleware;
  private routeHandlers: Map<ProxyRoute, (requestContext: BunRequestContext, server: Server) => Promise<Response | null> | Response | null> = new Map();

  constructor(tempDir?: string, statisticsService?: any, middleware?: BunMiddleware) {
    this.statisticsService = statisticsService;
    this.tempDir = tempDir;
    this.middleware = middleware;
  }

  setupRoutes(config: ProxyConfig): void {
    this.routeHandlers.clear();

    // Set up routes based on configuration
    config.routes.forEach(route => {
      if (route.path) {
        this.setupPathRoute(route);
      } else {
        this.setupDomainRoute(route);
      }
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

    this.routeHandlers.set(route, (requestContext: BunRequestContext, server: Server) => {
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
    });

    logger.info(`Static proxy route configured: ${route.path} -> ${route.staticPath}`);
  }

  private setupRedirectRoute(route: ProxyRoute): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for route ${route.path}`);
      return;
    }

    this.routeHandlers.set(route, (requestContext: BunRequestContext) => {
      logger.info(`[REDIRECT] ${requestContext.method} ${requestContext.originalUrl} -> ${route.redirectTo}`);
      const redirectUrl = route.redirectTo!;

      return new Response(null, {
        status: 301,
        headers: { 'Location': redirectUrl }
      });
    });



    logger.info(`Redirect route configured: ${route.path} -> ${route.redirectTo}`);
  }

  private setupRedirectDomainRoute(route: ProxyRoute): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for domain ${route.domain}`);
      return;
    }

    this.routeHandlers.set(route, (requestContext: BunRequestContext) => {
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
    });

    logger.info(`Redirect domain route configured: ${route.domain} -> ${route.redirectTo}`);
  }

  private setupClassicProxyRoute(route: ProxyRoute): void {
    const classicProxy = new BunClassicProxy();

    this.routeHandlers.set(route, (requestContext: BunRequestContext) => {
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
    });

    logger.info(`Classic proxy route configured: ${route.path} -> ${route.target}`);
  }

  private setupClassicProxyDomainRoute(route: ProxyRoute): void {
    const classicProxy = new BunClassicProxy();

    this.routeHandlers.set(route, (requestContext: BunRequestContext) => {
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
    });

    logger.info(`Classic proxy domain route configured: ${route.domain} -> ${route.target}`);
  }

  private setupCorsForwarderRoute(route: ProxyRoute): void {
    const corsProxy = new BunCorsProxy(this.tempDir);

    this.routeHandlers.set(route, (requestContext: BunRequestContext) => {
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


      logger.info(`[CORS FORWARDER] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

      const config: ProxyRequestConfig = {
        route,
        target,
        routeIdentifier: `cors-forwarder ${route.path}`,
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      // Call the CORS proxy directly with Bun request context
      const response = corsProxy.handleProxyRequest(requestContext, config);


      return response;
    });

    logger.info(`CORS forwarder route configured: ${route.path} -> dynamic target via base64 url param`);
  }

  private setupCorsForwarderDomainRoute(route: ProxyRoute): void {
    const corsProxy = new BunCorsProxy(this.tempDir);

    this.routeHandlers.set(route, (requestContext: BunRequestContext) => {
      const host = requestContext.headers['host'];
      if (host === route.domain || host === `www.${route.domain}`) {
        const target = this.extractTargetFromRequest(requestContext);
        let response = null;
        if (!target) {
          response = new Response(JSON.stringify({
            error: 'Bad Request',
            message: 'Missing target parameter'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {

          logger.info(`[CORS FORWARDER] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

          const config: ProxyRequestConfig = {
            route,
            target,
            routeIdentifier: `cors-forwarder ${route.domain}`,
            secure: false,
            timeouts: { request: 30000, proxy: 30000 },
            logRequests: true,
            logErrors: true
          };

          response = corsProxy.handleProxyRequest(requestContext, config);

        }
        return response;
      }
      return null;
    });

    logger.info(`CORS forwarder domain route configured: ${route.domain} -> dynamic target via base64 url param`);
  }

  private getHandler(requestContext: BunRequestContext) {
    // Check for exact path matches first
    for (const [route, handler] of this.routeHandlers.entries()) {
      if (route.path!.startsWith('domain:')) {
        // Domain-based route
        const domain = route.domain || route.path!.substring(7);
        const host = requestContext.headers['host'];
        if (host === domain || host === `www.${domain}`) {
          return { route, handler };
        }
      } else {
        // Path-based route
        logger.info(`[BUN ROUTES] ${requestContext.method} : ${requestContext.pathname} - checking path ${route.path}`);
        if (requestContext.pathname === route.path || requestContext.pathname.startsWith(route.path + '/')) {
          return { route, handler };
        }
      }
    }

    throw new Error('No route found');
  }

  async handleRequest(req: Request, server: Server): Promise<Response | null> {
    const url = new URL(req.url);
    const requestContext: BunRequestContext = {
      method: req.method,
      url: req.url,
      pathname: url.pathname,
      headers: Object.fromEntries(req.headers as any),
      body: req.body,
      query: Object.fromEntries(url.searchParams.entries()),
      ip: req.headers.get('x-forwarded-for') || '',
      originalUrl: req.url,
      req: req as any,
      server
    };

    const { route, handler } = this.getHandler(requestContext);
    const startTime = Date.now();
    // Apply middleware
    const middlewareResult = await this.middleware?.processRequest(requestContext, route);
    if (middlewareResult) {
      return middlewareResult;
    }

    if (handler) {
      logger.info(`[BUN ROUTES] ${requestContext.method} ${requestContext.originalUrl} - found handler`);
      const response = handler(requestContext, server);
      if (response) {
        let responseData = await response;
        if (!responseData) {
          responseData = new Response(null, {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        // Record statistics for unmatched request
        const responseTime = Date.now() - startTime;
        this.middleware?.recordRequestStats(requestContext, route, route.path || route.domain || '', responseTime, responseData.status, route.type);
        return responseData;
      }
    }
    logger.info(`[BUN ROUTES] ${requestContext.method} ${requestContext.originalUrl} - no handler found`);
    // No route found, record statistics for unmatched request
    const responseTime = Date.now() - startTime;
    this.middleware?.recordRequestStats(requestContext, { name: 'unmatched' }, '', responseTime, 404, 'unmatched');
    await sleep(1000);
    return new Response(null, { status: 404 }); // No matching route found
  }

  private extractTargetFromRequest(requestContext: BunRequestContext): string | null {
    // Extract target from base64 encoded parameter
    const targetParam = requestContext.query.target;
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

  private createMockRequest(requestContext: BunRequestContext): any {
    // Create a mock Express-like request object
    return {
      method: requestContext.method,
      url: requestContext.url,
      originalUrl: requestContext.originalUrl,
      path: requestContext.pathname,
      headers: requestContext.headers,
      query: requestContext.query,
      body: requestContext.body,
      ip: requestContext.ip,
      get: (name: string) => requestContext.headers[name.toLowerCase()],
      on: () => { },
      pipe: () => { }
    };
  }

  private createMockResponse(): any {
    // Create a mock Express-like response object
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let body: any = null;

    return {
      status: (code: number) => {
        statusCode = code;
        return this;
      },
      set: (name: string, value: string) => {
        headers[name] = value;
        return this;
      },
      json: (data: any) => {
        body = JSON.stringify(data);
        headers['content-type'] = 'application/json';
        return this;
      },
      send: (data: any) => {
        body = data;
        return this;
      },
      end: () => { },
      write: (data: any) => {
        body = data;
        return this;
      },
      headersSent: false,
      getHeaders: () => headers,
      getStatusCode: () => statusCode,
      getBody: () => body
    };
  }

  private createBunResponse(mockRes: any): Response {
    const headers = mockRes.getHeaders();
    const status = mockRes.getStatusCode();
    const body = mockRes.getBody();

    return new Response(body, {
      status,
      headers
    });
  }

  private handleProxyError(
    error: Error,
    requestContext: BunRequestContext,
    routeIdentifier: string,
    target: string,
    route: ProxyRoute,
    logErrors: boolean,
    customErrorResponse?: { code?: string; message?: string }
  ): Response {
    const errorDetails = {
      routeIdentifier,
      target,
      error: error.message,
      stack: error.stack
    };

    if (logErrors) {
      logger.error(`Proxy error for ${routeIdentifier}${route.cors ? ' (CORS enabled)' : ''}`, errorDetails);
    }

    const statusCode = customErrorResponse?.code ? parseInt(customErrorResponse.code) : 502;
    const message = customErrorResponse?.message || 'Bad Gateway';

    // Record statistics for error
    if (this.middleware) {
      const requestType = routeIdentifier.includes('cors-forwarder') ? 'cors-forwarder' : 'proxy';
      this.middleware.recordRequestStats(requestContext, route, target, 0, statusCode, requestType);
    }

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