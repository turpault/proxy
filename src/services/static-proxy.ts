import express from 'express';
import path from 'path';
import { logger } from '../utils/logger';
import { BaseProxy, ProxyRequestConfig } from './base-proxy';
import { ProxyRoute } from '../types';

export interface StaticProxyConfig {
  staticPath: string;
  spaFallback?: boolean;
  publicPaths?: string[];
}

export class StaticProxy extends BaseProxy {
  private staticPath: string;
  private spaFallback: boolean;
  private publicPaths: string[];

  constructor(config: StaticProxyConfig, tempDir?: string) {
    super();
    this.staticPath = config.staticPath;
    this.spaFallback = config.spaFallback || false;
    this.publicPaths = config.publicPaths || [];
  }

  async handleProxyRequest(
    req: express.Request,
    res: express.Response,
    config: ProxyRequestConfig
  ): Promise<void> {
    const { route, routeIdentifier } = config;
    const startTime = Date.now();

    try {
      logger.info(`[STATIC PROXY] ${req.method} ${req.originalUrl} -> ${this.staticPath}`);
      
      // Check if this is a public path that doesn't require authentication
      const isPublicPath = this.publicPaths.some(publicPath => 
        req.path.startsWith(publicPath)
      );

      if (!isPublicPath && route.oauth2?.enabled) {
        // OAuth2 authentication would be handled by middleware before this point
        // This is just a fallback check
        logger.debug(`[STATIC PROXY] OAuth2 check for ${routeIdentifier}`);
      }

      // Serve static files
      const staticMiddleware = express.static(this.staticPath);
      
      // Create a mock next function for the static middleware
      const next = (err?: any) => {
        if (err) {
          logger.error(`[STATIC PROXY] Static middleware error for ${routeIdentifier}`, err);
          if (!res.headersSent) {
            res.status(500).json({
              error: 'Static File Error',
              message: 'Failed to serve static file'
            });
          }
          return;
        }

        // If static middleware didn't handle the request and SPA fallback is enabled
        if (this.spaFallback && !res.headersSent) {
          this.handleSPAFallback(req, res, routeIdentifier);
        } else if (!res.headersSent) {
          res.status(404).json({
            error: 'Not Found',
            message: 'File not found'
          });
        }
      };

      // Call the static middleware
      staticMiddleware(req, res, next);

      // Record statistics when response finishes
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        logger.info(`[STATIC PROXY] ${req.method} ${req.originalUrl} [${res.statusCode}] (${responseTime}ms)`);
      });

    } catch (error) {
      logger.error(`[STATIC PROXY] Error serving static files for ${routeIdentifier}`, error);
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Static Proxy Error',
          message: 'An error occurred while serving static files'
        });
      }
    }
  }

  private handleSPAFallback(req: express.Request, res: express.Response, routeIdentifier: string): void {
    // Skip if this is an API route or static asset
    if (req.path.startsWith('/api/') || req.path.startsWith('/static/') || req.path.includes('.')) {
      res.status(404).json({
        error: 'Not Found',
        message: 'File not found'
      });
      return;
    }

    // Serve index.html for SPA routes
    const indexPath = path.join(this.staticPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        logger.error(`[STATIC PROXY] Failed to serve index.html for SPA route: ${req.path}`, err);
        if (!res.headersSent) {
          res.status(404).json({
            error: 'Not Found',
            message: 'SPA fallback file not found'
          });
        }
      }
    });
  }

  /**
   * Create Express middleware for static file serving
   */
  createStaticMiddleware(): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const config: ProxyRequestConfig = {
        route: {} as ProxyRoute, // This will be set by the caller
        target: this.staticPath,
        routeIdentifier: 'static-proxy',
        secure: false,
        timeouts: { request: 30000, proxy: 30000 },
        logRequests: true,
        logErrors: true
      };

      this.handleProxyRequest(req, res, config).catch(error => {
        logger.error(`[STATIC PROXY] Unhandled error in static middleware`, error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while processing the request'
          });
        }
      });
    };
  }
} 