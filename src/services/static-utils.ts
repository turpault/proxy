import path from 'path';
import { logger } from '../utils/logger';
import { ProxyRoute } from '../types';
import { BunRequestContext } from './bun-middleware';

export interface StaticFileConfig {
  staticPath: string;
  spaFallback: boolean;
  publicPaths: string[];
}

export interface StaticFileResult {
  response: Response;
  responseTime: number;
  statusCode: number;
}

export class StaticFileUtils {
  /**
   * Serves a static file from the given path
   */
  static async serveStaticFile(
    requestContext: BunRequestContext,
    config: StaticFileConfig,
    route: ProxyRoute,
    statisticsService?: any
  ): Promise<StaticFileResult> {
    const startTime = Date.now();
    const { staticPath, spaFallback } = config;

    try {
      logger.info(`[STATIC] ${requestContext.method} ${requestContext.originalUrl} -> ${staticPath}`);

      // Find the matching route path to remove from the request pathname
      const relativePath = this.getRelativePath(requestContext.pathname, route.path || '');
      const filePath = path.join(staticPath, relativePath);
      const file = Bun.file(filePath);

      if (await file.exists()) {
        const responseTime = Date.now() - startTime;
        logger.info(`[STATIC] ${requestContext.method} ${requestContext.originalUrl} [200] (${responseTime}ms)`);

        // Record statistics
        this.recordRequestStats(requestContext, route, staticPath, responseTime, 200, 'static', statisticsService);

        return {
          response: new Response(file),
          responseTime,
          statusCode: 200
        };
      }

      // If file doesn't exist and SPA fallback is enabled
      if (spaFallback) {
        return await this.handleSPAFallback(requestContext, staticPath, route, startTime, statisticsService);
      }

      // File not found
      const responseTime = Date.now() - startTime;
      logger.info(`[STATIC] ${requestContext.method} ${requestContext.originalUrl} [404] (${responseTime}ms)`);

      this.recordRequestStats(requestContext, route, staticPath, responseTime, 404, 'static', statisticsService);

      return {
        response: new Response(JSON.stringify({
          error: 'Not Found',
          message: 'File not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }),
        responseTime,
        statusCode: 404
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`[STATIC] Error serving static files for ${staticPath}`, error);

      // Record statistics for error
      this.recordRequestStats(requestContext, route, staticPath, responseTime, 500, 'static', statisticsService);

      return {
        response: new Response(JSON.stringify({
          error: 'Static Proxy Error',
          message: 'An error occurred while serving static files'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }),
        responseTime,
        statusCode: 500
      };
    }
  }

  /**
   * Handles SPA fallback by serving index.html for client-side routing
   */
  private static async handleSPAFallback(
    requestContext: BunRequestContext,
    staticPath: string,
    route: ProxyRoute,
    startTime: number,
    statisticsService?: any
  ): Promise<StaticFileResult> {
    // Skip if this is an API route or static asset
    if (requestContext.pathname.startsWith('/api/') ||
      requestContext.pathname.startsWith('/static/') ||
      requestContext.pathname.includes('.')) {

      const responseTime = Date.now() - startTime;
      this.recordRequestStats(requestContext, route, staticPath, responseTime, 404, 'static', statisticsService);

      return {
        response: new Response(JSON.stringify({
          error: 'Not Found',
          message: 'File not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }),
        responseTime,
        statusCode: 404
      };
    }

    // Serve index.html for SPA routes
    const indexPath = path.join(staticPath, 'index.html');
    const indexFile = Bun.file(indexPath);

    if (await indexFile.exists()) {
      const responseTime = Date.now() - startTime;
      this.recordRequestStats(requestContext, route, staticPath, responseTime, 200, 'static', statisticsService);

      return {
        response: new Response(indexFile),
        responseTime,
        statusCode: 200
      };
    }

    const responseTime = Date.now() - startTime;
    this.recordRequestStats(requestContext, route, staticPath, responseTime, 404, 'static', statisticsService);

    return {
      response: new Response(JSON.stringify({
        error: 'Not Found',
        message: 'SPA fallback file not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }),
      responseTime,
      statusCode: 404
    };
  }

  /**
   * Gets the relative path by removing the route path from the request pathname
   */
  private static getRelativePath(pathname: string, routePath: string): string {
    return pathname.startsWith(routePath)
      ? pathname.substring(routePath.length)
      : pathname;
  }

  /**
   * Records request statistics
   */
  private static recordRequestStats(
    requestContext: BunRequestContext,
    route: ProxyRoute,
    target: string,
    responseTime: number,
    statusCode: number,
    requestType: string = 'static',
    statisticsService?: any
  ): void {
    if (!statisticsService) return;

    const clientIP = this.getClientIP(requestContext);
    const geolocation = this.getGeolocation(clientIP);
    const userAgent = requestContext.headers['user-agent'] || 'Unknown';

    statisticsService.recordRequest(
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

  /**
   * Gets client IP from request context
   */
  private static getClientIP(requestContext: BunRequestContext): string {
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

  /**
   * Gets geolocation for an IP address
   */
  private static getGeolocation(ip: string): any {
    try {
      // Import geolocation service dynamically to avoid circular dependencies
      const { geolocationService } = require('./geolocation');
      return geolocationService.getGeolocation(ip);
    } catch (error) {
      return null;
    }
  }
} 