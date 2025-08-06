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
  /**
   * Apply URL rewrite rules to the pathname
   * @param pathname Original pathname
   * @param rewriteRules Record of regex patterns to replacement strings
   * @returns Rewritten pathname
   */
  private applyRewriteRules(pathname: string, rewriteRules: Record<string, string>): string {
    let rewrittenPath = pathname;

    for (const [pattern, replacement] of Object.entries(rewriteRules)) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(rewrittenPath)) {
          rewrittenPath = rewrittenPath.replace(regex, replacement);
          logger.debug(`[CLASSIC PROXY] Applied rewrite rule: ${pattern} -> ${replacement}, result: ${rewrittenPath}`);
          break; // Apply only the first matching rule
        }
      } catch (error) {
        logger.error(`[CLASSIC PROXY] Invalid rewrite pattern: ${pattern}`, error);
      }
    }

    return rewrittenPath;
  }

  async handleProxyRequest(
    requestContext: BunRequestContext,
    config: ProxyRequestConfig
  ): Promise<Response> {
    const { route, target, routeIdentifier } = config;
    const startTime = Date.now();

    try {
      logger.info(`[CLASSIC PROXY] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

      // Apply URL rewrite rules if configured
      let pathname = requestContext.pathname;
      if (route.rewrite && Object.keys(route.rewrite).length > 0) {
        const originalPathname = pathname;
        pathname = this.applyRewriteRules(pathname, route.rewrite);

        if (pathname !== originalPathname) {
          logger.info(`[CLASSIC PROXY] URL rewrite applied: ${originalPathname} -> ${pathname}`);
        }
      }

      // Build the target URL with rewritten pathname
      const targetUrl = new URL(pathname, target);

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