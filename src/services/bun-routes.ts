import { ProxyRoute, ProxyConfig } from '../types';
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

import { geolocationService } from './geolocation';
import { BunRequestContext, BunMiddleware } from './bun-middleware';
import path from 'path';
import { Server, sleep } from 'bun';

export class BunRoutes {
  private statisticsService: any;
  private tempDir?: string;
  private middleware?: BunMiddleware;
  private routeHandlers: Map<string, (requestContext: BunRequestContext, server: Server) => { route: ProxyRoute, response: Promise<Response | null> }> = new Map();

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
    const routePath = route.path!;

    switch (route.type) {
      case 'static':
        this.setupStaticRoute(route, routePath);
        break;
      case 'redirect':
        this.setupRedirectRoute(route, routePath);
        break;
      case 'cors-forwarder':
        this.setupCorsForwarderRoute(route, routePath);
        break;
      case 'proxy':
      default:
        this.setupClassicProxyRoute(route, routePath);
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

  private setupStaticRoute(route: ProxyRoute, routePath: string): void {
    if (!route.staticPath) {
      logger.error(`Static path not configured for route ${routePath}`);
      return;
    }

    const staticProxy = new BunStaticProxy({
      staticPath: route.staticPath,
      spaFallback: route.spaFallback,
      publicPaths: route.publicPaths || []
    }, this.tempDir, this.statisticsService);

    this.routeHandlers.set(routePath, (requestContext: BunRequestContext, server: Server) => {
      const config: ProxyRequestConfig = {
        route,
        target: route.staticPath!,
        routeIdentifier: `static ${routePath}`,
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      // Call the static proxy directly with Bun request context
      return { route, response: staticProxy.handleProxyRequest(requestContext, config) };
    });

    logger.info(`Static proxy route configured: ${routePath} -> ${route.staticPath}`);
  }

  private setupRedirectRoute(route: ProxyRoute, routePath: string): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for route ${routePath}`);
      return;
    }

    this.routeHandlers.set(routePath, (requestContext: BunRequestContext) => {
      logger.info(`[REDIRECT] ${requestContext.method} ${requestContext.originalUrl} -> ${route.redirectTo}`);
      const redirectUrl = route.redirectTo!;

      return {
        route, response: Promise.resolve(new Response(null, {
          status: 301,
          headers: { 'Location': redirectUrl }
        }))
      };
    });

    logger.info(`Redirect route configured: ${routePath} -> ${route.redirectTo}`);
  }

  private setupRedirectDomainRoute(route: ProxyRoute): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for domain ${route.domain}`);
      return;
    }

    this.routeHandlers.set(`domain:${route.domain}`, (requestContext: BunRequestContext) => {
      const host = requestContext.headers['host'];
      if (host === route.domain || host === `www.${route.domain}`) {
        logger.info(`[REDIRECT] ${requestContext.method} ${requestContext.originalUrl} -> ${route.redirectTo}`);
        const redirectUrl = route.redirectTo!;

        return {
          route, response: Promise.resolve(new Response(null, {
            status: 301,
            headers: { 'Location': redirectUrl }
          }))
        };
      }
      return { route, response: Promise.resolve(null) }; // Continue to next handler
    });

    logger.info(`Redirect domain route configured: ${route.domain} -> ${route.redirectTo}`);
  }

  private setupClassicProxyRoute(route: ProxyRoute, routePath: string): void {
    const classicProxy = new BunClassicProxy();

    this.routeHandlers.set(routePath, (requestContext: BunRequestContext) => {
      const config: ProxyRequestConfig = {
        route,
        target: route.target!,
        routeIdentifier: `classic ${routePath}`,
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      // Call the classic proxy directly with Bun request context
      return { route, response: classicProxy.handleProxyRequest(requestContext, config) };
    });

    logger.info(`Classic proxy route configured: ${routePath} -> ${route.target}`);
  }

  private setupClassicProxyDomainRoute(route: ProxyRoute): void {
    const classicProxy = new BunClassicProxy();

    this.routeHandlers.set(`domain:${route.domain}`, (requestContext: BunRequestContext) => {
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

        return { route, response };
      }
      return { route, response: Promise.resolve(null) }; // Continue to next handler
    });

    logger.info(`Classic proxy domain route configured: ${route.domain} -> ${route.target}`);
  }

  private setupCorsForwarderRoute(route: ProxyRoute, routePath: string): void {
    const corsProxy = new BunCorsProxy(this.tempDir);

    this.routeHandlers.set(routePath, (requestContext: BunRequestContext) => {
      const target = this.extractTargetFromRequest(requestContext);
      if (!target) {
        return {
          route, response: Promise.resolve(new Response(JSON.stringify({
            error: 'Bad Request',
            message: 'Missing target parameter'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }))
        }
      }

      logger.info(`[CORS FORWARDER] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

      const config: ProxyRequestConfig = {
        route,
        target,
        routeIdentifier: `cors-forwarder ${routePath}`,
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      // Call the CORS proxy directly with Bun request context
      const response = corsProxy.handleProxyRequest(requestContext, config);


      return { route, response };
    });

    logger.info(`CORS forwarder route configured: ${routePath} -> dynamic target via base64 url param`);
  }

  private setupCorsForwarderDomainRoute(route: ProxyRoute): void {
    const corsProxy = new BunCorsProxy(this.tempDir);

    this.routeHandlers.set(`domain:${route.domain}`, (requestContext: BunRequestContext) => {
      const host = requestContext.headers['host'];
      if (host === route.domain || host === `www.${route.domain}`) {
        const target = this.extractTargetFromRequest(requestContext);
        let response: Promise<Response | null> = Promise.resolve(null);
        if (!target) {
          response = Promise.resolve(new Response(JSON.stringify({
            error: 'Bad Request',
            message: 'Missing target parameter'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }));
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
        return { route, response };
      }
      return { route, response: Promise.resolve(null) }; // Continue to next handler
    });

    logger.info(`CORS forwarder domain route configured: ${route.domain} -> dynamic target via base64 url param`);
  }

  private getHandler(requestContext: BunRequestContext) {
    // Check for exact path matches first
    for (const [routePath, handler] of this.routeHandlers.entries()) {
      if (routePath.startsWith('domain:')) {
        // Domain-based route
        const domain = routePath.substring(7);
        const host = requestContext.headers['host'];
        if (host === domain || host === `www.${domain}`) {
          return handler;
        }
      } else {
        // Path-based route
        if (requestContext.pathname === routePath || requestContext.pathname.startsWith(routePath + '/')) {
          return handler;
        }
      }
    }
    return null;
  }

  async handleRequest(req: Request, server: Server): Promise<Response | null> {

    const requestContext: BunRequestContext = {
      method: req.method,
      url: req.url,
      pathname: req.url,
      headers: Object.fromEntries(req.headers as any),
      body: req.body,
      query: Object.fromEntries(new URL(req.url).searchParams.entries()),
      ip: req.headers.get('x-forwarded-for') || '',
      originalUrl: req.url,
      req: req as any,
      server
    };

    const startTime = Date.now();
    // Apply middleware
    const middlewareResult = await this.middleware?.processRequest(requestContext);
    if (middlewareResult) {
      return middlewareResult;
    }
    const handler = this.getHandler(requestContext);
    let response: Response | null = null;
    if (handler) {
      const { route, response } = handler(requestContext, server);
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