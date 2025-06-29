import express from 'express';
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

export abstract class BaseProxy {
  protected getClientIP(req: express.Request): string {
    // Get real IP address, considering proxies
    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    const xRealIP = req.headers['x-real-ip'] as string;
    const xClientIP = req.headers['x-client-ip'] as string;
    
    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, first one is the original client
      return xForwardedFor.split(',')[0].trim();
    }
    
    if (xRealIP) {
      return xRealIP;
    }
    
    if (xClientIP) {
      return xClientIP;
    }
    
    // Fall back to connection remote address or req.ip
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  protected getUserId(req: express.Request): string | undefined {
    // Try to get user ID from various sources in order of preference
    
    // 1. OAuth2 session cookie (look for unique cookie names)
    const oauth2Cookies = Object.keys(req.cookies || {}).filter(key => key.startsWith('oauth2_'));
    if (oauth2Cookies.length > 0) {
      // Use the first OAuth2 cookie found
      const oauthSessionId = req.cookies?.[oauth2Cookies[0]];
      if (oauthSessionId) {
        return `oauth:${oauthSessionId}`;
      }
    }
    
    // 2. Authorization header (for API tokens)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      // Extract token from Bearer token or API key
      const token = authHeader.replace(/^(Bearer|ApiKey)\s+/i, '');
      if (token && token !== authHeader) {
        return `token:${token.substring(0, 8)}`; // Use first 8 chars for privacy
      }
    }
    
    // 3. Custom user header
    const userHeader = req.headers['x-user-id'] || req.headers['x-user'];
    if (userHeader) {
      return `header:${userHeader}`;
    }
    
    // 4. Session ID from cookies
    const sessionId = req.cookies?.sessionid || req.cookies?.sid;
    if (sessionId) {
      return `session:${sessionId}`;
    }
    
    // 5. IP-based identification (fallback)
    const clientIP = this.getClientIP(req);
    if (clientIP && clientIP !== 'unknown') {
      return `ip:${clientIP}`;
    }
    
    // No user identification available
    return undefined;
  }

  protected buildProxyHeaders(route: ProxyRoute, req?: express.Request): Record<string, string> {
    const headers: Record<string, string> = { ...route.headers };
    
    // Forward headers from the client request if available
    if (req) {
      // Always forward Authorization header
      const headerValue = req.headers['authorization'];
      if (headerValue) {
        logger.debug(`[PROXY] Authorization header found: ${typeof headerValue} - "${headerValue}"`);
        
        // Ensure the header value is properly formatted
        let cleanValue: string;
        if (Array.isArray(headerValue)) {
          cleanValue = headerValue[0]; // Take the first value if it's an array
        } else {
          cleanValue = String(headerValue).trim(); // Convert to string and trim whitespace
        }
        
        headers['Authorization'] = cleanValue;
        logger.debug(`[PROXY] Authorization header set in proxy headers: "${headers['Authorization']}"`);
      } else {
        logger.debug(`[PROXY] No Authorization header found in request`);
      }
    }
    
    return headers;
  }

  protected maskSensitiveHeaders(headers: any): Record<string, string> {
    const maskedHeaders: Record<string, string> = {};
    const sensitiveHeaderPatterns = [
      /^authorization$/i,
      /^cookie$/i,
      /^set-cookie$/i,
      /^x-api-key$/i,
      /^x-auth-token$/i,
      /^Bb-Api-Subscription-Key$/i,
      /^api-key$/i,
      /^access-token$/i,
      /^refresh-token$/i,
      /^session-id$/i,
      /^session-token$/i,
    ];

    for (const [key, value] of Object.entries(headers)) {
      const stringValue = Array.isArray(value) ? value.join(', ') : String(value || '');
      
      // Check if this header should be masked
      const shouldMask = sensitiveHeaderPatterns.some(pattern => pattern.test(key));
      
      if (shouldMask && stringValue) {
        // Show only first 4 and last 4 characters for sensitive headers
        if (stringValue.length > 8) {
          maskedHeaders[key] = `${stringValue.substring(0, 4)}...${stringValue.substring(stringValue.length - 4)}`;
        } else {
          maskedHeaders[key] = '*'.repeat(stringValue.length);
        }
      } else {
        maskedHeaders[key] = stringValue;
      }
    }

    return maskedHeaders;
  }

  protected logRequestSummary(
    req: express.Request,
    res: express.Response,
    routeIdentifier: string,
    target: string,
    statusCode: number,
    responseHeaders: any,
    duration: number,
    logRequests: boolean
  ): void {
    if (!logRequests) return;

    const summary = {
      method: req.method,
      url: req.url,
      originalUrl: req.originalUrl,
      target,
      routeIdentifier,
      statusCode,
      duration,
      contentLength: responseHeaders['content-length'],
      contentType: responseHeaders['content-type'],
      clientIP: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
      // Include key response headers for debugging
      responseHeaders: {
        'cache-control': responseHeaders['cache-control'],
        'content-encoding': responseHeaders['content-encoding'],
        'content-type': responseHeaders['content-type'],
        'content-length': responseHeaders['content-length'],
        'last-modified': responseHeaders['last-modified'],
        'etag': responseHeaders['etag'],
        'server': responseHeaders['server'],
        'x-powered-by': responseHeaders['x-powered-by'],
        'x-frame-options': responseHeaders['x-frame-options'],
        'x-content-type-options': responseHeaders['x-content-type-options'],
        'x-xss-protection': responseHeaders['x-xss-protection'],
        'strict-transport-security': responseHeaders['strict-transport-security'],
        'access-control-allow-origin': responseHeaders['access-control-allow-origin'],
        'access-control-allow-methods': responseHeaders['access-control-allow-methods'],
        'access-control-allow-headers': responseHeaders['access-control-allow-headers'],
      }
    };

    // Log at different levels based on status code
    if (statusCode >= 500) {
      logger.error(`Proxy request summary - Server Error (${statusCode})`, summary);
    } else if (statusCode >= 400) {
      logger.warn(`Proxy request summary - Client Error (${statusCode})`, summary);
    } else if (statusCode >= 300) {
      logger.info(`Proxy request summary - Redirect (${statusCode})`, summary);
    } else {
      logger.info(`Proxy request summary - Success (${statusCode})`, summary);
    }
  }

  protected handleProxyError(
    error: Error,
    req: express.Request,
    res: express.Response,
    routeIdentifier: string,
    target: string,
    route: ProxyRoute,
    logErrors: boolean,
    customErrorResponse?: { code?: string; message?: string }
  ): void {
    // Calculate response time (duration)
    const responseTime = Date.now() - (req as any).__startTime || 0;
    
    if (logErrors) {
      // Enhanced error logging with more details
      const errorDetails: any = {
        error: error.message,
        errorStack: error.stack,
        target,
        url: req.url,
        originalUrl: req.originalUrl,
        method: req.method,
        corsEnabled: !!route.cors,
        clientIP: this.getClientIP(req),
        userAgent: req.get('user-agent'),
        host: req.get('host'),
        routeIdentifier,
        duration: responseTime,
        timestamp: new Date().toISOString(),
        request: {
          headers: this.maskSensitiveHeaders(req.headers),
          query: req.query,
          params: req.params,
        },
      };

      // Add request body if available (captured earlier)
      const requestBodyForLogging = (req as any).__requestBodyForLogging;
      if (requestBodyForLogging) {
        errorDetails.request.body = requestBodyForLogging;
      }

      // Add content type and length information
      if (req.headers['content-type']) {
        errorDetails.request.contentType = req.headers['content-type'];
      }
      if (req.headers['content-length']) {
        errorDetails.request.contentLength = req.headers['content-length'];
      }

      // Add error code if available
      if ('code' in error) {
        errorDetails.errorCode = (error as any).code;
      }

      // Add syscall info if available (for network errors)
      if ('syscall' in error) {
        errorDetails.syscall = (error as any).syscall;
      }

      // Add errno if available
      if ('errno' in error) {
        errorDetails.errno = (error as any).errno;
      }

      // Capture any upstream response data if available in the error
      if ('response' in error && (error as any).response) {
        const upstreamResponse = (error as any).response;
        errorDetails.upstreamResponse = {
          statusCode: upstreamResponse.statusCode,
          statusMessage: upstreamResponse.statusMessage,
          headers: this.maskSensitiveHeaders(upstreamResponse.headers || {}),
        };
        
        // Capture upstream response body if available
        if (upstreamResponse.data || upstreamResponse.body) {
          let responseBody = upstreamResponse.data || upstreamResponse.body;
          
          // Convert to string if it's not already
          if (typeof responseBody !== 'string') {
            try {
              responseBody = JSON.stringify(responseBody);
            } catch {
              responseBody = String(responseBody);
            }
          }
          
          // Limit response body size for logging (max 2KB)
          const maxBodySize = 2048;
          if (responseBody.length > maxBodySize) {
            responseBody = responseBody.substring(0, maxBodySize) + '... [truncated]';
          }
          
          errorDetails.upstreamResponse.body = responseBody;
        }
      }

      logger.error(`Proxy error for ${routeIdentifier}${route.cors ? ' (CORS enabled)' : ''}`, errorDetails);
    }
    
    // Log error summary
    this.logRequestSummary(req, res, routeIdentifier, target, 502, {}, responseTime, logErrors);
    
    if (!res.headersSent) {
      const errorResponse: any = {
        error: 'Bad Gateway',
        message: customErrorResponse?.message || 'The upstream server is not responding',
      };
      
      if (customErrorResponse?.code) {
        errorResponse.code = customErrorResponse.code;
      }
      
      // Log the response body we're sending back to the client
      if (logErrors) {
        logger.debug(`Sending error response to client for ${routeIdentifier}`, {
          statusCode: 502,
          responseBody: errorResponse,
          clientIP: this.getClientIP(req),
          url: req.url,
          method: req.method,
        });
      }
      
      res.status(502).json(errorResponse);
    }
  }

  abstract handleProxyRequest(
    req: express.Request,
    res: express.Response,
    config: ProxyRequestConfig
  ): Promise<void>;
} 