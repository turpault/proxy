import express from 'express';
import { logger } from '../utils/logger';
import { BaseProxy, ProxyRequestConfig } from './base-proxy';

export class ClassicProxy extends BaseProxy {
  constructor() {
    super();
  }

  async handleProxyRequest(
    req: express.Request,
    res: express.Response,
    config: ProxyRequestConfig
  ): Promise<void> {
    const { route, target, routeIdentifier, secure, timeouts, logRequests, logErrors, customErrorResponse } = config;
    
    logger.info(`[CLASSIC PROXY] ${req.method} ${req.originalUrl} -> ${target}`);
    const startTime = Date.now();
    
    try {
      // OAuth2 authentication is handled by middleware before this point
      // The session data should already be available in req.oauth2Session if authenticated
      
      // Build headers - forward all headers transparently
      const headers = this.buildProxyHeaders(route, req);
      
      // Forward all request headers to target
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
        }
      });
      
      // Add OAuth2 session information to headers if available (set by middleware)
      if ((req as any).oauth2Session) {
        const session = (req as any).oauth2Session;
        headers['X-OAuth2-Access-Token'] = session.accessToken;
        headers['X-OAuth2-Token-Type'] = session.tokenType;
        if (session.scope) {
          headers['X-OAuth2-Scope'] = session.scope;
        }
        if (session.expiresAt) {
          headers['X-OAuth2-Expires-At'] = session.expiresAt.toISOString();
        }
        
        // Add subscription key if configured
        if (route.oauth2?.subscriptionKey && route.oauth2?.subscriptionKeyHeader) {
          headers[route.oauth2.subscriptionKeyHeader] = route.oauth2.subscriptionKey;
        }
      }
      
      const response = await fetch(target, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      });
      
      // Set response status
      res.status(response.status);
      
      // Forward all response headers transparently
      response.headers.forEach((value, key) => {
        res.set(key, value);
      });
      
      // Stream the response body as binary
      if (response.body) {
        response.body.pipeTo(new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          },
          abort(reason) {
            logger.error(`[CLASSIC PROXY] Stream aborted for ${routeIdentifier}`, { reason });
            res.end();
          }
        })).catch(error => {
          logger.error(`[CLASSIC PROXY] Stream error for ${routeIdentifier}`, error);
          if (!res.headersSent) {
            res.status(500).end();
          }
        });
      } else {
        res.end();
      }
      
      // Log successful request
      const duration = Date.now() - startTime;
      const responseHeaders = Object.fromEntries(response.headers.entries());
      this.logRequestSummary(req, res, routeIdentifier, target, response.status, responseHeaders, duration, logRequests);
      
    } catch (error) {
      logger.error(`[CLASSIC PROXY] Error in proxy request for ${routeIdentifier}`, error);
      
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
} 