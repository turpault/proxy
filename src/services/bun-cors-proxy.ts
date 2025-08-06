import { logger } from '../utils/logger';
import { ProxyRoute } from '../types';
import { BunRequestContext } from './bun-middleware';
import { CORSConfig } from '../types';
import { cacheService } from './cache';
import { convertToImage } from '../utils/pdf-converter';

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

export class BunCorsProxy {
  private tempDir?: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir;
  }

  private getClientIP(requestContext: BunRequestContext): string {
    const headers = requestContext.headers;
    const xForwardedFor = headers['x-forwarded-for'];
    const xRealIP = headers['x-real-ip'];
    const xClientIP = headers['x-client-ip'];

    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, first one is the original client
      const firstIP = xForwardedFor.split(',')[0];
      return firstIP ? firstIP.trim() : 'unknown';
    }

    if (xRealIP) {
      return xRealIP;
    }

    if (xClientIP) {
      return xClientIP;
    }

    return requestContext.ip || 'unknown';
  }

  private getUserId(requestContext: BunRequestContext): string | undefined {
    // Try to get user ID from various sources in order of preference
    
    // 1. OAuth2 session cookie (parse from cookie header)
    const cookieHeader = requestContext.headers.cookie;
    if (cookieHeader) {
      const oauthMatch = cookieHeader.match(/oauth2-session=([^;]+)/);
      if (oauthMatch) {
        return `oauth:${oauthMatch[1]}`;
      }
      
      // 4. Session ID from cookies
      const sessionMatch = cookieHeader.match(/(?:sessionid|sid)=([^;]+)/);
      if (sessionMatch) {
        return `session:${sessionMatch[1]}`;
      }
    }
    
    // 2. Authorization header (for API tokens)
    const authHeader = requestContext.headers.authorization;
    if (authHeader) {
      // Extract token from Bearer token or API key
      const token = authHeader.replace(/^(Bearer|ApiKey)\s+/i, '');
      if (token && token !== authHeader) {
        return `token:${token.substring(0, 8)}`; // Use first 8 chars for privacy
      }
    }
    
    // 3. Custom user header
    const userHeader = requestContext.headers['x-user-id'] || requestContext.headers['x-user'];
    if (userHeader) {
      return `header:${userHeader}`;
    }
    
    // 5. IP-based identification (fallback)
    const clientIP = this.getClientIP(requestContext);
    if (clientIP && clientIP !== 'unknown') {
      return `ip:${clientIP}`;
    }
    
    // No user identification available
    return undefined;
  }

  async handleProxyRequest(
    requestContext: BunRequestContext,
    config: ProxyRequestConfig
  ): Promise<Response> {
    const { route, target, routeIdentifier, logRequests, logErrors, customErrorResponse } = config;
    const startTime = Date.now();

    try {
      logger.info(`[CORS PROXY] ${requestContext.method} ${requestContext.originalUrl} -> ${target}`);

      // Get user information for cache key
      const userIP = this.getClientIP(requestContext);
      const userId = this.getUserId(requestContext);

      // Build the target URL
      const targetUrl = new URL(requestContext.pathname, target);

      // Copy query parameters (excluding convert parameters from cache key)
      for (const [key, value] of Object.entries(requestContext.query)) {
        targetUrl.searchParams.set(key, value);
      }

      // Check cache first (only for GET requests)
      if (requestContext.method === 'GET') {
        const cachedResponse = await cacheService.get(target, requestContext.method, userId, userIP);
        if (cachedResponse) {
          logger.info(`[CACHE] Serving cached response for ${requestContext.method} ${target}${userId ? ` (user: ${userId})` : ''}`);

          // Handle CORS headers for cached response
          const corsHeaders = new Headers(Object.entries(cachedResponse.headers));
          if (route.cors && 'enabled' in route.cors && route.cors.enabled !== false) {
            this.handleCorsHeaders(corsHeaders, route.cors, requestContext.headers.origin);
          }

          // Set Content-Type from cached entry
          corsHeaders.set('Content-Type', cachedResponse.contentType);

          // Log cached response
          const duration = Date.now() - startTime;
          if (logRequests) {
            logger.info(`[CORS PROXY] ${requestContext.method} ${requestContext.originalUrl} [${cachedResponse.status}] (${duration}ms) [CACHED]`);
          }

          return new Response(cachedResponse.body, {
            status: cachedResponse.status,
            headers: corsHeaders
          });
        }
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
        this.handleCorsHeaders(corsHeaders, route.cors, requestContext.headers.origin);
      }

      // For GET requests, cache the response
      if (requestContext.method === 'GET' && response.status === 200) {
        try {
          // Read the response body as binary
          const responseBuffer = await response.arrayBuffer();
          let contentType = response.headers.get('content-type') || 'application/octet-stream';
          let body = Buffer.from(responseBuffer);

          // If the request is a PDF conversion, convert the body to an image
          if (contentType.includes('application/pdf') && requestContext.query.convert) {
            logger.info(`[CORS PROXY] Converting PDF to image for ${routeIdentifier} ${requestContext.query.convert} ${requestContext.query.width} ${requestContext.query.height}`);
            try {
              const { body: newBody, contentType: newContentType } = await convertToImage(
                body,
                contentType,
                requestContext.query.convert as string,
                requestContext.query.width as string,
                requestContext.query.height as string,
                this.tempDir
              );
              body = Buffer.from(newBody);
              contentType = newContentType;
            } catch (error) {
              logger.error(`[CORS PROXY] Error converting PDF to image for ${routeIdentifier}`, error);
              return new Response("Error converting PDF to image", {
                status: 500,
                headers: { 'Content-Type': 'text/plain' }
              });
            }
          }

          // Cache the response with user information
          await cacheService.set(target, requestContext.method, {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body,
            contentType,
          }, userId, userIP);

          // Set the response content type
          corsHeaders.set('Content-Type', contentType);

          // Return the response
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: corsHeaders
          });

        } catch (cacheError) {
          logger.warn('Failed to cache response, falling back to streaming', { target, error: cacheError });
          // Fall back to streaming if caching fails
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: corsHeaders
          });
        }
      } else {
        // For non-GET requests or non-200 responses, return the response directly
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: corsHeaders
        });
      }

    } catch (error) {
      logger.error(`[CORS PROXY] Error in proxy request for ${routeIdentifier}`, error);

      // Use custom error response if provided
      const errorResponse = {
        error: customErrorResponse?.code || 'CORS Proxy Error',
        message: customErrorResponse?.message || 'Failed to proxy request',
        details: error instanceof Error ? error.message : 'Unknown error'
      };

      return new Response(JSON.stringify(errorResponse), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private handleCorsHeaders(headers: Headers, corsConfig: CORSConfig, requestOrigin?: string): void {
    // Set CORS headers based on configuration
    if (corsConfig.origin !== undefined) {
      if (corsConfig.origin === true) {
        // Dynamic origin based on request
        if (requestOrigin) {
          headers.set('Access-Control-Allow-Origin', requestOrigin);
        } else {
          headers.set('Access-Control-Allow-Origin', '*');
        }
      } else if (typeof corsConfig.origin === 'string') {
        headers.set('Access-Control-Allow-Origin', corsConfig.origin);
      } else if (Array.isArray(corsConfig.origin)) {
        // Check if request origin is in allowed list
        if (requestOrigin && corsConfig.origin.includes(requestOrigin)) {
          headers.set('Access-Control-Allow-Origin', requestOrigin);
        } else if (corsConfig.origin.length === 1) {
          headers.set('Access-Control-Allow-Origin', corsConfig.origin[0]);
        }
        // If origin not in allowed list, don't set the header (will block CORS)
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

  // Create CORS middleware for handling OPTIONS requests
  createCorsMiddleware(corsConfig: boolean | CORSConfig) {
    return (requestContext: BunRequestContext): Response | null => {
      if (corsConfig === true) {
        // Simple CORS - allow all origins
        const headers = new Headers();
        const origin = requestContext.headers.origin;
        if (origin) {
          headers.set('Access-Control-Allow-Origin', origin);
        } else {
          headers.set('Access-Control-Allow-Origin', '*');
        }
        headers.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
        headers.set('Access-Control-Max-Age', '86400');
        
        if (requestContext.method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers
          });
        } else {
          // For non-OPTIONS requests, return null to continue processing
          return null;
        }
      }

      // Advanced CORS configuration
      const config = typeof corsConfig === 'object' && corsConfig.enabled !== false ? corsConfig : null;
      if (!config) {
        return null; // No CORS handling
      }

      const headers = new Headers();

      // Handle origin
      if (config.origin !== undefined) {
        if (config.origin === true) {
          const origin = requestContext.headers.origin;
          if (origin) {
            headers.set('Access-Control-Allow-Origin', origin);
          }
        } else if (typeof config.origin === 'string') {
          headers.set('Access-Control-Allow-Origin', config.origin);
        } else if (Array.isArray(config.origin)) {
          const origin = requestContext.headers.origin;
          if (origin && config.origin.includes(origin)) {
            headers.set('Access-Control-Allow-Origin', origin);
          }
        }
      }

      // Handle credentials
      if (config.credentials) {
        headers.set('Access-Control-Allow-Credentials', 'true');
      }

      // Handle methods
      if (config.methods) {
        headers.set('Access-Control-Allow-Methods', config.methods.join(', '));
      }

      // Handle allowed headers
      if (config.allowedHeaders) {
        headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
      }

      // Handle exposed headers
      if (config.exposedHeaders) {
        headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
      }

      // Handle max age
      if (config.maxAge !== undefined) {
        headers.set('Access-Control-Max-Age', config.maxAge.toString());
      }

      if (requestContext.method === 'OPTIONS') {
        return new Response(null, {
          status: (config as any).optionsSuccessStatus || 204,
          headers
        });
      } else {
        // For non-OPTIONS requests, return null to continue processing
        return null;
      }
    };
  }
} 