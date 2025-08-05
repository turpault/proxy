import path from 'path';
import { logger } from '../utils/logger';
import { ProxyRoute } from '../types';
import { BunRequestContext } from './bun-middleware';
import { StaticFileUtils, StaticFileConfig } from './static-utils';

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

    // Check if this is a public path that doesn't require authentication
    const isPublicPath = this.publicPaths.some(publicPath =>
      requestContext.pathname.startsWith(publicPath)
    );

    if (!isPublicPath && route.oauth2?.enabled) {
      // OAuth2 authentication would be handled by middleware before this point
      // This is just a fallback check
      logger.debug(`[STATIC PROXY] OAuth2 check for ${routeIdentifier}`);
    }

    // Use shared static file utilities
    const staticConfig: StaticFileConfig = {
      staticPath: this.staticPath,
      spaFallback: this.spaFallback,
      publicPaths: this.publicPaths
    };

    const result = await StaticFileUtils.serveStaticFile(
      requestContext,
      staticConfig,
      route,
      this.statisticsService
    );

    return result.response;
  }


} 