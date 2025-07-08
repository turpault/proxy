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

export class BunClassicProxy {
  async handleProxyRequest(
    requestContext: BunRequestContext,
    config: ProxyRequestConfig
  ): Promise<Response> {
    const { route, target, routeIdentifier } = config;
    const startTime = Date.now();

    try {
      logger.info(`[CLASSIC PROXY] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

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

      logger.info(`[CLASSIC PROXY] ${requestContext.method} ${requestContext.originalUrl} [${response.status}] (${responseTime}ms)`);

      // Return the response
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });

    } catch (error) {
      logger.error(`[CLASSIC PROXY] Error in proxy request for ${routeIdentifier}`, error);

      return new Response(JSON.stringify({
        error: 'Proxy Error',
        message: 'Failed to proxy request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
} 