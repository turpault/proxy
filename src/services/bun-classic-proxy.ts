import { logger } from '../utils/logger';
import { ProxyRoute, BunRequestContext } from '../types';

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

  /**
   * Check if the request is a WebSocket upgrade request
   */
  private isWebSocketUpgrade(requestContext: BunRequestContext): boolean {
    const connection = requestContext.headers['connection']?.toLowerCase();
    const upgrade = requestContext.headers['upgrade']?.toLowerCase();
    return connection === 'upgrade' && upgrade === 'websocket';
  }

  /**
   * Handle WebSocket proxy connection
   */
  async handleWebSocketProxy(
    requestContext: BunRequestContext,
    config: ProxyRequestConfig
  ): Promise<Response> {
    const { route, target, routeIdentifier } = config;

    try {
      // Check if WebSocket is enabled for this route
      if (route.websocket && route.websocket.enabled === false) {
        logger.warn(`[CLASSIC PROXY WS] WebSocket disabled for route ${routeIdentifier}`);
        return new Response('WebSocket not enabled for this route', { status: 403 });
      }

      logger.info(`[CLASSIC PROXY WS] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

      // Apply URL rewrite rules if configured
      let pathname = requestContext.pathname;
      if (route.rewrite && Object.keys(route.rewrite).length > 0) {
        const originalPathname = pathname;
        pathname = this.applyRewriteRules(pathname, route.rewrite);

        if (pathname !== originalPathname) {
          logger.info(`[CLASSIC PROXY WS] URL rewrite applied: ${originalPathname} -> ${pathname}`);
        }
      }

      // Build the target WebSocket URL
      const targetUrl = new URL(pathname, target);
      // Convert http/https to ws/wss
      targetUrl.protocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';

      // Copy query parameters
      for (const [key, value] of Object.entries(requestContext.query)) {
        targetUrl.searchParams.set(key, String(value));
      }

      // Get WebSocket configuration with defaults
      const wsConfig = route.websocket || {};
      const timeout = wsConfig.timeout || 30000;
      const pingInterval = wsConfig.pingInterval || 30000;
      const maxRetries = wsConfig.maxRetries || 3;
      const retryDelay = wsConfig.retryDelay || 1000;

      // Use Bun's server.upgrade() to handle WebSocket upgrade
      const success = requestContext.server.upgrade(requestContext.req, {
        data: {
          target: targetUrl.toString(),
          routeIdentifier,
          headers: requestContext.headers,
          wsConfig: {
            timeout,
            pingInterval,
            maxRetries,
            retryDelay
          }
        }
      });

      if (success) {
        logger.info(`[CLASSIC PROXY WS] WebSocket upgrade successful for ${routeIdentifier}`);
        return new Response(null); // Return empty response for successful upgrade
      } else {
        logger.error(`[CLASSIC PROXY WS] WebSocket upgrade failed for ${routeIdentifier}`);
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

    } catch (error) {
      logger.error(`[CLASSIC PROXY WS] Error in WebSocket proxy for ${routeIdentifier}`, error);
      return new Response(JSON.stringify({
        error: 'WebSocket Proxy Error',
        message: 'Failed to proxy WebSocket connection',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleProxyRequest(
    requestContext: BunRequestContext,
    config: ProxyRequestConfig
  ): Promise<Response> {
    // Check if this is a WebSocket upgrade request
    if (this.isWebSocketUpgrade(requestContext)) {
      return this.handleWebSocketProxy(requestContext, config);
    }

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
        targetUrl.searchParams.set(key, String(value));
      }

      // Build headers for the proxy request
      const headers = new Headers();
      for (const [key, value] of Object.entries(requestContext.headers)) {
        // Skip some headers that shouldn't be proxied
        if (!['host', 'connection'].includes(key.toLowerCase())) {
          headers.set(key, String(value));
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

      let response = await fetch(proxyRequest);
      const contentType = response.headers?.get('content-type') || '';
      if ((contentType.includes('text/html') || contentType.includes('application/json') || contentType.includes('text/javascript')) && route.replace && Object.keys(route.replace).length > 0) {
        let newBody = await response.text();
        for (const [pattern, replacement] of Object.entries(route.replace)) {
          // replace all occurences of pattern with replacement
          newBody = newBody.replace(new RegExp(pattern, 'g'), replacement);
        }
        response = new Response(newBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }

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