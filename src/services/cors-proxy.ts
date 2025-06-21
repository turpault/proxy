import express from 'express';
import { logger } from '../utils/logger';
import { BaseProxy, ProxyRequestConfig } from './base-proxy';
import { cacheService } from './cache';
import { CORSConfig } from '../types';

export class CorsProxy extends BaseProxy {
  async handleProxyRequest(
    req: express.Request,
    res: express.Response,
    config: ProxyRequestConfig
  ): Promise<void> {
    const { route, target, routeIdentifier, secure, timeouts, logRequests, logErrors, customErrorResponse } = config;
    
    logger.info(`[CORS PROXY] ${req.method} ${req.originalUrl} -> ${target}`);
    const startTime = Date.now();
    
    // Get user information for cache key
    const userIP = this.getClientIP(req);
    const userId = this.getUserId(req);
    
    // Check cache first (only for GET requests)
    if (req.method === 'GET') {
      const cachedResponse = await cacheService.get(target, req.method, userId, userIP);
      if (cachedResponse) {
        logger.info(`[CACHE] Serving cached response for ${req.method} ${target}${userId ? ` (user: ${userId})` : ''}`);
        
        // Set response status and headers
        res.status(cachedResponse.status);
        Object.entries(cachedResponse.headers).forEach(([key, value]) => {
          res.set(key, value);
        });
        
        // Handle CORS headers for cached response
        if (route.cors && 'enabled' in route.cors && route.cors.enabled !== false) {
          const proxyRes = { headers: cachedResponse.headers };
          this.handleCorsProxyResponse(proxyRes, req, res, route.cors);
        }
        
        // Send cached body as binary
        res.set('Content-Type', cachedResponse.contentType);
        res.send(Buffer.from(cachedResponse.body, 'binary'));
        
        // Log cached response
        const duration = Date.now() - startTime;
        this.logRequestSummary(req, res, routeIdentifier, target, cachedResponse.status, cachedResponse.headers, duration, logRequests);
        return;
      }
    }
    
    try {
      const response = await fetch(target, {
        method: req.method,
        headers: this.buildProxyHeaders(route, req),
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      });
      
      // Set response status
      res.status(response.status);
      
      // Create a proxyRes-like object for CORS handling
      const proxyRes = {
        headers: Object.fromEntries(response.headers.entries())
      };
      
      // Handle CORS headers if enabled
      if (route.cors && 'enabled' in route.cors && route.cors.enabled !== false) {
        this.handleCorsProxyResponse(proxyRes, req, res, route.cors);
      }
      
      // Set response headers
      response.headers.forEach((value, key) => {
        res.set(key, value);
      });
      
      // For GET requests, cache the response
      if (req.method === 'GET' && response.status === 200) {
        try {
          // Read the response body as binary
          const responseBuffer = await response.arrayBuffer();
          const contentType = response.headers.get('content-type') || 'application/octet-stream';
          
          // Cache the response with user information
          await cacheService.set(target, req.method, {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: Buffer.from(responseBuffer).toString('binary'),
            contentType,
          }, userId, userIP);
          
          // Send the response as binary
          res.set('Content-Type', contentType);
          res.send(Buffer.from(responseBuffer));
        } catch (cacheError) {
          logger.warn('Failed to cache response, falling back to streaming', { target, error: cacheError });
          // Fall back to streaming if caching fails
          if (response.body) {
            response.body.pipeTo(new WritableStream({
              write(chunk) {
                res.write(chunk);
              },
              close() {
                res.end();
              },
              abort(reason) {
                logger.error(`[CORS PROXY] Stream aborted for ${routeIdentifier}`, { reason });
                res.end();
              }
            })).catch(error => {
              logger.error(`[CORS PROXY] Stream error for ${routeIdentifier}`, error);
              if (!res.headersSent) {
                res.status(500).end();
              }
            });
          } else {
            res.end();
          }
        }
      } else {
        // For non-GET requests or non-200 responses, stream the response as binary
        if (response.body) {
          response.body.pipeTo(new WritableStream({
            write(chunk) {
              res.write(chunk);
            },
            close() {
              res.end();
            },
            abort(reason) {
              logger.error(`[CORS PROXY] Stream aborted for ${routeIdentifier}`, { reason });
              res.end();
            }
          })).catch(error => {
            logger.error(`[CORS PROXY] Stream error for ${routeIdentifier}`, error);
            if (!res.headersSent) {
              res.status(500).end();
            }
          });
        } else {
          res.end();
        }
      }
      
      // Log successful request
      const duration = Date.now() - startTime;
      const responseHeaders = Object.fromEntries(response.headers.entries());
      this.logRequestSummary(req, res, routeIdentifier, target, response.status, responseHeaders, duration, logRequests);
      
    } catch (error) {
      logger.error(`[CORS PROXY] Error in proxy request for ${routeIdentifier}`, error);
      
      // Use the existing error handler
      this.handleProxyError(
        error as Error,
        req,
        res,
        routeIdentifier,
        target,
        route,
        logErrors,
        customErrorResponse
      );
    }
  }

  // Handle CORS headers in proxy responses
  private handleCorsProxyResponse(proxyRes: any, req: express.Request, res: express.Response, corsConfig: boolean | CORSConfig): void {
    if (corsConfig === true) {
      // Simple CORS - set permissive headers
      const origin = req.headers.origin;
      if (origin) {
        proxyRes.headers['access-control-allow-origin'] = origin;
      } else {
        proxyRes.headers['access-control-allow-origin'] = '*';
      }
      proxyRes.headers['access-control-allow-methods'] = 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS';
      proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin';
      proxyRes.headers['access-control-expose-headers'] = 'Content-Length, Content-Type';
      proxyRes.headers['access-control-max-age'] = '86400';
      return;
    }

    // Advanced CORS configuration
    const config = corsConfig.enabled !== false ? corsConfig : null;
    if (!config) return;

    // Handle origin
    if (config.origin !== undefined) {
      if (config.origin === true) {
        const origin = req.headers.origin;
        if (origin) {
          proxyRes.headers['access-control-allow-origin'] = origin;
        }
      } else if (typeof config.origin === 'string') {
        proxyRes.headers['access-control-allow-origin'] = config.origin;
      } else if (Array.isArray(config.origin)) {
        const origin = req.headers.origin;
        if (origin && config.origin.includes(origin)) {
          proxyRes.headers['access-control-allow-origin'] = origin;
        }
      }
    }

    // Handle credentials
    if (config.credentials) {
      proxyRes.headers['access-control-allow-credentials'] = 'true';
    }

    // Handle methods
    if (config.methods) {
      proxyRes.headers['access-control-allow-methods'] = config.methods.join(', ');
    }

    // Handle allowed headers
    if (config.allowedHeaders) {
      proxyRes.headers['access-control-allow-headers'] = config.allowedHeaders.join(', ');
    }

    // Handle exposed headers
    if (config.exposedHeaders) {
      proxyRes.headers['access-control-expose-headers'] = config.exposedHeaders.join(', ');
    }

    // Handle max age
    if (config.maxAge !== undefined) {
      proxyRes.headers['access-control-max-age'] = config.maxAge.toString();
    }
  }

  // Create CORS middleware for a specific route
  createCorsMiddleware(corsConfig: boolean | CORSConfig) {
    if (corsConfig === true) {
      // Simple CORS - allow all origins
      return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const origin = req.headers.origin;
        if (origin) {
          res.set('Access-Control-Allow-Origin', origin);
        } else {
          res.set('Access-Control-Allow-Origin', '*');
        }
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
        res.set('Access-Control-Max-Age', '86400');
        
        if (req.method === 'OPTIONS') {
          res.status(204).end();
        } else {
          next();
        }
      };
    }

    // Advanced CORS configuration
    const config = corsConfig.enabled !== false ? corsConfig : null;
    if (!config) {
      return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        next();
      };
    }

    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Handle origin
      if (config.origin !== undefined) {
        if (config.origin === true) {
          const origin = req.headers.origin;
          if (origin) {
            res.set('Access-Control-Allow-Origin', origin);
          }
        } else if (typeof config.origin === 'string') {
          res.set('Access-Control-Allow-Origin', config.origin);
        } else if (Array.isArray(config.origin)) {
          const origin = req.headers.origin;
          if (origin && config.origin.includes(origin)) {
            res.set('Access-Control-Allow-Origin', origin);
          }
        }
      }

      // Handle credentials
      if (config.credentials) {
        res.set('Access-Control-Allow-Credentials', 'true');
      }

      // Handle methods
      if (config.methods) {
        res.set('Access-Control-Allow-Methods', config.methods.join(', '));
      }

      // Handle allowed headers
      if (config.allowedHeaders) {
        res.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
      }

      // Handle exposed headers
      if (config.exposedHeaders) {
        res.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
      }

      // Handle max age
      if (config.maxAge !== undefined) {
        res.set('Access-Control-Max-Age', config.maxAge.toString());
      }

      if (req.method === 'OPTIONS') {
        res.status(config.optionsSuccessStatus || 204).end();
      } else {
        next();
      }
    };
  }
} 