import path from 'path';
import { logger } from '../utils/logger';
import { ProxyRoute } from '../types';
import { BunRequestContext, BunMiddleware } from './bun-middleware';

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
    middleware?: BunMiddleware
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
        if (middleware) {
          middleware.recordRequestStats(requestContext, route, staticPath, responseTime, 200, 'static');
        }

        return {
          response: new Response(file),
          responseTime,
          statusCode: 200
        };
      }

      // If file doesn't exist and SPA fallback is enabled
      if (spaFallback) {
        return await this.handleSPAFallback(requestContext, staticPath, route, startTime, middleware);
      }

      // File not found
      const responseTime = Date.now() - startTime;
      logger.info(`[STATIC] ${requestContext.method} ${requestContext.originalUrl} [404] (${responseTime}ms)`);

      if (middleware) {
        middleware.recordRequestStats(requestContext, route, staticPath, responseTime, 404, 'static');
      }

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
      if (middleware) {
        middleware.recordRequestStats(requestContext, route, staticPath, responseTime, 500, 'static');
      }

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
    middleware?: BunMiddleware
  ): Promise<StaticFileResult> {
    // Skip if this is an API route or static asset
    if (requestContext.pathname.startsWith('/api/') ||
      requestContext.pathname.startsWith('/static/') ||
      requestContext.pathname.includes('.')) {

      const responseTime = Date.now() - startTime;
      if (middleware) {
        middleware.recordRequestStats(requestContext, route, staticPath, responseTime, 404, 'static');
      }

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
      if (middleware) {
        middleware.recordRequestStats(requestContext, route, staticPath, responseTime, 200, 'static');
      }

      return {
        response: new Response(indexFile),
        responseTime,
        statusCode: 200
      };
    }

    const responseTime = Date.now() - startTime;
    if (middleware) {
      middleware.recordRequestStats(requestContext, route, staticPath, responseTime, 404, 'static');
    }

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


} 