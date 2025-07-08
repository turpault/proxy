import { logger } from '../utils/logger';
import { ProxyRoute } from '../types';

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
import { BunRequestContext } from './bun-middleware';
import { CORSConfig } from '../types';

export class BunCorsProxy {
  private tempDir?: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir;
  }

  async handleProxyRequest(
    requestContext: BunRequestContext,
    config: ProxyRequestConfig
  ): Promise<Response> {
    const { route, target, routeIdentifier } = config;
    const startTime = Date.now();

    try {
      logger.info(`[CORS PROXY] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

      // Build the target URL
      const targetUrl = new URL(requestContext.pathname, target);

      // Copy query parameters
      for (const [key, value] of Object.entries(requestContext.query)) {
        targetUrl.searchParams.set(key, value);
      }

      // Build headers for the proxy request
      const headers = new Headers();
      for (const [key, value] of Object.entries(requestContext.headers)) {
        // Skip some headers that shouldn't be proxied
        if (!['host', 'connection'].includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      }

      // Add proxy headers
      headers.set('X-Forwarded-For', requestContext.ip);
      headers.set('X-Forwarded-Proto', 'http');
      headers.set('X-Forwarded-Host', requestContext.headers['host'] || 'localhost');

      // Make the proxy request
      const proxyRequest = new Request(targetUrl.toString(), {
        method: requestContext.method,
        headers,
        body: requestContext.body,
        redirect: 'manual' // Don't follow redirects automatically
      });

      const response = await fetch(proxyRequest);
      const responseTime = Date.now() - startTime;

      logger.info(`[CORS PROXY] ${requestContext.method} ${requestContext.originalUrl} [${response.status}] (${responseTime}ms)`);

      // Handle CORS headers if enabled
      const corsHeaders = new Headers(response.headers);
      if (route.cors && 'enabled' in route.cors && route.cors.enabled !== false) {
        this.handleCorsHeaders(corsHeaders, route.cors);
      }

      // Return the response
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: corsHeaders
      });

    } catch (error) {
      logger.error(`[CORS PROXY] Error in proxy request for ${routeIdentifier}`, error);

      return new Response(JSON.stringify({
        error: 'CORS Proxy Error',
        message: 'Failed to proxy request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private handleCorsHeaders(headers: Headers, corsConfig: CORSConfig): void {
    // Set CORS headers based on configuration
    if (corsConfig.origin) {
      if (Array.isArray(corsConfig.origin)) {
        headers.set('Access-Control-Allow-Origin', corsConfig.origin.join(', '));
      } else if (typeof corsConfig.origin === 'string') {
        headers.set('Access-Control-Allow-Origin', corsConfig.origin);
      } else {
        // origin is boolean true, use wildcard
        headers.set('Access-Control-Allow-Origin', '*');
      }
    } else {
      headers.set('Access-Control-Allow-Origin', '*');
    }

    if (corsConfig.methods) {
      headers.set('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
    } else {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    }

    if (corsConfig.allowedHeaders) {
      headers.set('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
    } else {
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }

    if (corsConfig.exposedHeaders) {
      headers.set('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
    }

    if (corsConfig.credentials !== undefined) {
      headers.set('Access-Control-Allow-Credentials', corsConfig.credentials ? 'true' : 'false');
    } else {
      headers.set('Access-Control-Allow-Credentials', 'true');
    }

    if (corsConfig.maxAge) {
      headers.set('Access-Control-Max-Age', corsConfig.maxAge.toString());
    } else {
      headers.set('Access-Control-Max-Age', '86400');
    }
  }
} 