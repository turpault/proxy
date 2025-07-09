import path from 'path';
import { logger } from '../utils/logger';
import { ProxyRoute } from '../types';
import { BunRequestContext } from './bun-middleware';

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

export interface StaticProxyConfig {
  staticPath: string;
  spaFallback?: boolean;
  publicPaths?: string[];
}

export class BunStaticProxy {
  private staticPath: string;
  private spaFallback: boolean;
  private publicPaths: string[];
  private statisticsService?: any;

  constructor(config: StaticProxyConfig, tempDir?: string, statisticsService?: any) {
    this.staticPath = config.staticPath;
    this.spaFallback = config.spaFallback || false;
    this.publicPaths = config.publicPaths || [];
    this.statisticsService = statisticsService;
  }

  async handleProxyRequest(
    requestContext: BunRequestContext,
    config: ProxyRequestConfig
  ): Promise<Response> {
    const { route, routeIdentifier } = config;
    const startTime = Date.now();

    try {
      logger.info(`[STATIC PROXY] ${requestContext.method} ${requestContext.originalUrl} -> ${this.staticPath}`);

      // Check if this is a public path that doesn't require authentication
      const isPublicPath = this.publicPaths.some(publicPath =>
        requestContext.pathname.startsWith(publicPath)
      );

      if (!isPublicPath && route.oauth2?.enabled) {
        // OAuth2 authentication would be handled by middleware before this point
        // This is just a fallback check
        logger.debug(`[STATIC PROXY] OAuth2 check for ${routeIdentifier}`);
      }

      // Try to serve the static file
      const filePath = path.join(this.staticPath, requestContext.pathname);
      const file = Bun.file(filePath);

      if (await file.exists()) {
        const responseTime = Date.now() - startTime;
        logger.info(`[STATIC PROXY] ${requestContext.method} ${requestContext.originalUrl} [200] (${responseTime}ms)`);

        // Record statistics for successful static file request
        this.recordRequestStats(requestContext, route, this.staticPath, responseTime, 200, 'static');

        return new Response(file);
      }

      // If file doesn't exist and SPA fallback is enabled
      if (this.spaFallback) {
        const spaResponse = await this.handleSPAFallback(requestContext, routeIdentifier);
        const responseTime = Date.now() - startTime;

        // Record statistics for SPA fallback request
        this.recordRequestStats(requestContext, route, this.staticPath, responseTime, spaResponse.status, 'static');

        return spaResponse;
      }

      // File not found
      const responseTime = Date.now() - startTime;
      logger.info(`[STATIC PROXY] ${requestContext.method} ${requestContext.originalUrl} [404] (${responseTime}ms)`);

      // Record statistics for 404 request
      this.recordRequestStats(requestContext, route, this.staticPath, responseTime, 404, 'static');

      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'File not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`[STATIC PROXY] Error serving static files for ${routeIdentifier}`, error);

      // Record statistics for error request
      this.recordRequestStats(requestContext, route, this.staticPath, responseTime, 500, 'static');

      return new Response(JSON.stringify({
        error: 'Static Proxy Error',
        message: 'An error occurred while serving static files'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleSPAFallback(requestContext: BunRequestContext, routeIdentifier: string): Promise<Response> {
    // Skip if this is an API route or static asset
    if (requestContext.pathname.startsWith('/api/') ||
      requestContext.pathname.startsWith('/static/') ||
      requestContext.pathname.includes('.')) {
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'File not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Serve index.html for SPA routes
    const indexPath = path.join(this.staticPath, 'index.html');
    const indexFile = Bun.file(indexPath);

    if (await indexFile.exists()) {
      return new Response(indexFile);
    }

    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'SPA fallback file not found'
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private recordRequestStats(
    requestContext: BunRequestContext,
    route: ProxyRoute,
    target: string,
    responseTime: number,
    statusCode: number,
    requestType: string = 'static'
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
      // Import geolocation service dynamically to avoid circular dependencies
      const { geolocationService } = require('./geolocation');
      return geolocationService.getGeolocation(ip);
    } catch (error) {
      return null;
    }
  }
} 