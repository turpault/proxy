import { ProxyRoute } from '../types';
import { BunRequestContext } from './bun-middleware';
import { StaticFileConfig, StaticFileUtils } from './static-utils';

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
    const { route } = config;


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