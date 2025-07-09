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
import { BunRequestContext } from './bun-middleware';
import path from 'path';
import { Server } from 'bun';

export class BunRoutes {
  private statisticsService: any;
  private tempDir?: string;
  private routeHandlers: Map<string, (requestContext: BunRequestContext, server: Server) => Promise<Response | null>> = new Map();

  constructor(tempDir?: string, statisticsService?: any) {
    this.statisticsService = statisticsService;
    this.tempDir = tempDir;
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

    this.routeHandlers.set(routePath, async (requestContext: BunRequestContext, server: Server) => {
      const startTime = Date.now();

      try {
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
        return await staticProxy.handleProxyRequest(requestContext, config);
      } catch (error) {
        logger.error(`[STATIC PROXY] Unhandled error for ${routePath}`, error);
        return new Response(JSON.stringify({
          error: 'Internal Server Error',
          message: 'An error occurred while serving static files'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    logger.info(`Static proxy route configured: ${routePath} -> ${route.staticPath}`);
  }

  private setupRedirectRoute(route: ProxyRoute, routePath: string): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for route ${routePath}`);
      return;
    }

    this.routeHandlers.set(routePath, async (requestContext: BunRequestContext) => {
      logger.info(`[REDIRECT] ${requestContext.method} ${requestContext.originalUrl} -> ${route.redirectTo}`);
      const start = Date.now();
      const redirectUrl = route.redirectTo!;

      // Record statistics
      this.recordRequestStats(requestContext, route, redirectUrl, Date.now() - start, 301, 'redirect');

      return new Response(null, {
        status: 301,
        headers: { 'Location': redirectUrl }
      });
    });

    logger.info(`Redirect route configured: ${routePath} -> ${route.redirectTo}`);
  }

  private setupRedirectDomainRoute(route: ProxyRoute): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for domain ${route.domain}`);
      return;
    }

    this.routeHandlers.set(`domain:${route.domain}`, async (requestContext: BunRequestContext) => {
      const host = requestContext.headers['host'];
      if (host === route.domain || host === `www.${route.domain}`) {
        logger.info(`[REDIRECT] ${requestContext.method} ${requestContext.originalUrl} -> ${route.redirectTo}`);
        const start = Date.now();
        const redirectUrl = route.redirectTo!;

        // Record statistics
        this.recordRequestStats(requestContext, route, redirectUrl, Date.now() - start, 301, 'redirect');

        return new Response(null, {
          status: 301,
          headers: { 'Location': redirectUrl }
        });
      }
      return null; // Continue to next handler
    });

    logger.info(`Redirect domain route configured: ${route.domain} -> ${route.redirectTo}`);
  }

  private setupClassicProxyRoute(route: ProxyRoute, routePath: string): void {
    const classicProxy = new BunClassicProxy();

    this.routeHandlers.set(routePath, async (requestContext: BunRequestContext) => {
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
        // Call the classic proxy directly with Bun request context
        const response = await classicProxy.handleProxyRequest(requestContext, config);

        // Record statistics for successful classic proxy request
        const responseTime = Date.now() - startTime;
        this.recordRequestStats(requestContext, route, route.target!, responseTime, response.status, 'proxy');

        return response;
      } catch (error) {
        logger.error(`[CLASSIC PROXY] Error in proxy request for ${routePath}`, error);
        return this.handleProxyError(error as Error, requestContext, `classic ${routePath}`, route.target!, route, true);
      }
    });

    logger.info(`Classic proxy route configured: ${routePath} -> ${route.target}`);
  }

  private setupClassicProxyDomainRoute(route: ProxyRoute): void {
    const classicProxy = new BunClassicProxy();

    this.routeHandlers.set(`domain:${route.domain}`, async (requestContext: BunRequestContext) => {
      const host = requestContext.headers['host'];
      if (host === route.domain || host === `www.${route.domain}`) {
        const startTime = Date.now();
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
          // Call the classic proxy directly with Bun request context
          const response = await classicProxy.handleProxyRequest(requestContext, config);

          // Record statistics for successful classic proxy request
          const responseTime = Date.now() - startTime;
          this.recordRequestStats(requestContext, route, route.target!, responseTime, response.status, 'proxy');

          return response;
        } catch (error) {
          logger.error(`[CLASSIC PROXY] Error in proxy request for ${route.domain}`, error);
          return this.handleProxyError(error as Error, requestContext, `classic ${route.domain}`, route.target!, route, true);
        }
      }
      return null; // Continue to next handler
    });

    logger.info(`Classic proxy domain route configured: ${route.domain} -> ${route.target}`);
  }

  private setupCorsForwarderRoute(route: ProxyRoute, routePath: string): void {
    const corsProxy = new BunCorsProxy(this.tempDir);

    this.routeHandlers.set(routePath, async (requestContext: BunRequestContext) => {
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
        routeIdentifier: `cors-forwarder ${routePath}`,
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      try {
        const startTime = Date.now();
        // Call the CORS proxy directly with Bun request context
        const response = await corsProxy.handleProxyRequest(requestContext, config);

        // Record statistics for successful CORS forwarder request
        const responseTime = Date.now() - startTime;
        this.recordRequestStats(requestContext, route, target, responseTime, response.status, 'cors-forwarder');

        return response;
      } catch (error) {
        logger.error(`[CORS FORWARDER] Error in proxy request for ${routePath}`, error);
        return this.handleProxyError(error as Error, requestContext, `cors-forwarder ${routePath}`, target, route, true);
      }
    });

    logger.info(`CORS forwarder route configured: ${routePath} -> dynamic target via base64 url param`);
  }

  private setupCorsForwarderDomainRoute(route: ProxyRoute): void {
    const corsProxy = new BunCorsProxy(this.tempDir);

    this.routeHandlers.set(`domain:${route.domain}`, async (requestContext: BunRequestContext) => {
      const host = requestContext.headers['host'];
      if (host === route.domain || host === `www.${route.domain}`) {
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
          routeIdentifier: `cors-forwarder ${route.domain}`,
          secure: false,
          timeouts: { request: 30000, proxy: 30000 },
          logRequests: true,
          logErrors: true
        };

        try {
          const startTime = Date.now();
          // Call the CORS proxy directly with Bun request context
          const response = await corsProxy.handleProxyRequest(requestContext, config);

          // Record statistics for successful CORS forwarder request
          const responseTime = Date.now() - startTime;
          this.recordRequestStats(requestContext, route, target, responseTime, response.status, 'cors-forwarder');

          return response;
        } catch (error) {
          logger.error(`[CORS FORWARDER] Error in proxy request for ${route.domain}`, error);
          return this.handleProxyError(error as Error, requestContext, `cors-forwarder ${route.domain}`, target, route, true);
        }
      }
      return null; // Continue to next handler
    });

    logger.info(`CORS forwarder domain route configured: ${route.domain} -> dynamic target via base64 url param`);
  }

  async handleRequest(requestContext: BunRequestContext, server: Server, config: ProxyConfig): Promise<Response | null> {
    // Check for exact path matches first
    for (const [routePath, handler] of this.routeHandlers.entries()) {
      if (routePath.startsWith('domain:')) {
        // Domain-based route
        const domain = routePath.substring(7);
        const host = requestContext.headers['host'];
        if (host === domain || host === `www.${domain}`) {
          const result = await handler(requestContext, server);
          if (result) return result;
        }
      } else {
        // Path-based route
        if (requestContext.pathname === routePath || requestContext.pathname.startsWith(routePath + '/')) {
          const result = await handler(requestContext, server);
          if (result) return result;
        }
      }
    }

    return null; // No matching route found
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

    return new Response(JSON.stringify({
      error: 'Proxy Error',
      message,
      timestamp: new Date().toISOString()
    }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private recordRequestStats(
    requestContext: BunRequestContext,
    route: ProxyRoute,
    target: string,
    responseTime: number,
    statusCode: number,
    requestType: string = 'proxy'
  ): void {
    if (!this.statisticsService) return;

    const clientIP = this.getClientIP(requestContext);
    const geolocation = this.getGeolocation(clientIP);
    const userAgent = requestContext.headers['user-agent'] || 'Unknown';

    this.statisticsService.recordRequest(
      clientIP,
      geolocation,
      requestContext.pathname,
      requestContext.method,
      userAgent,
      responseTime,
      route.domain || 'unknown',
      target,
      requestType
    );
  }

  private getClientIP(requestContext: BunRequestContext): string {
    return requestContext.ip || 'unknown';
  }

  private getGeolocation(ip: string): any {
    try {
      return geolocationService.getGeolocation(ip);
    } catch (error) {
      return null;
    }
  }
} 