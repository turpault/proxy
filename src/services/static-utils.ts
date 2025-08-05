import path from 'path';
import { ProxyRoute } from '../types';
import { logger } from '../utils/logger';
import { BunRequestContext } from './bun-middleware';

export interface StaticFileConfig {
  staticPath: string;
  spaFallback: boolean;
  publicPaths: string[];
}

export interface StaticFileResult {
  response: Response;
  statusCode: number;
}

export class StaticFileUtils {
  /**
   * Serves a static file from the given path
   */
  static async serveStaticFile(
    requestContext: BunRequestContext,
    config: StaticFileConfig,
    route: ProxyRoute
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
        return {
          response: new Response(file),
          statusCode: 200
        };
      }

      // If file doesn't exist and SPA fallback is enabled
      if (spaFallback) {
        return await this.handleSPAFallback(requestContext, staticPath, route, startTime);
      }

      // File not found
      logger.info(`[STATIC] ${requestContext.method} ${requestContext.originalUrl} [404] (${responseTime}ms)`);

      return {
        response: new Response(JSON.stringify({
          error: 'Not Found',
          message: 'File not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }),
        statusCode: 404
      };

    } catch (error) {
      logger.error(`[STATIC] Error serving static files for ${staticPath}`, error);

      return {
        response: new Response(JSON.stringify({
          error: 'Static Proxy Error',
          message: 'An error occurred while serving static files'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }),
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
    route: ProxyRoute
  ): Promise<StaticFileResult> {
    // Skip if this is an API route or static asset
    if (requestContext.pathname.startsWith('/api/') ||
      requestContext.pathname.startsWith('/static/') ||
      requestContext.pathname.includes('.')) {

      return {
        response: new Response(JSON.stringify({
          error: 'Not Found',
          message: 'File not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }),
        statusCode: 404
      };
    }

    // Serve index.html for SPA routes
    const indexPath = path.join(staticPath, 'index.html');
    const indexFile = Bun.file(indexPath);

    if (await indexFile.exists()) {

      return {
        response: new Response(indexFile),
        statusCode: 200
      };
    }

    return {
      response: new Response(JSON.stringify({
        error: 'Not Found',
        message: 'SPA fallback file not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }),
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