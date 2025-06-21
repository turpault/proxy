import express from 'express';
import { logger } from '../utils/logger';
import { BaseProxy, ProxyRequestConfig } from './base-proxy';

export class ClassicProxy extends BaseProxy {
  async handleProxyRequest(
    req: express.Request,
    res: express.Response,
    config: ProxyRequestConfig
  ): Promise<void> {
    const { route, target, routeIdentifier, secure, timeouts, logRequests, logErrors, customErrorResponse } = config;
    
    logger.info(`[CLASSIC PROXY] ${req.method} ${req.originalUrl} -> ${target}`);
    const startTime = Date.now();
    
    try {
      // Build headers - forward all headers transparently
      const headers = this.buildProxyHeaders(route, req);
      
      // Forward all request headers to target
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
        }
      });
      
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