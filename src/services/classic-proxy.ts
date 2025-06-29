import express from 'express';
import { logger } from '../utils/logger';
import { BaseProxy, ProxyRequestConfig } from './base-proxy';
import { OAuth2Service } from './oauth2';

export class ClassicProxy extends BaseProxy {
  private oauth2Service: OAuth2Service;

  constructor() {
    super();
    this.oauth2Service = new OAuth2Service();
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
      // Check OAuth2 authentication if configured
      if (route.oauth2?.enabled) {
        const authResult = await this.checkOAuth2Authentication(req, route);
        if (!authResult.authenticated) {
          logger.warn(`[CLASSIC PROXY] OAuth2 authentication required but not authenticated for ${routeIdentifier}`);
          res.status(401).json({
            error: 'Unauthorized',
            message: 'OAuth2 authentication required',
            loginUrl: authResult.loginUrl
          });
          return;
        }
        
        // Add OAuth2 session data to request for forwarding to target
        if (authResult.session) {
          (req as any).oauth2Session = authResult.session;
        }
      }
      
      // Build headers - forward all headers transparently
      const headers = this.buildProxyHeaders(route, req);
      
      // Forward all request headers to target
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
        }
      });
      
      // Add OAuth2 session information to headers if available
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

  private async checkOAuth2Authentication(req: express.Request, route: any): Promise<{
    authenticated: boolean;
    session?: any;
    loginUrl?: string;
  }> {
    if (!route.oauth2?.enabled) {
      return { authenticated: true };
    }

    // Get session ID from cookie
    const sessionId = req.cookies?.['oauth2-session'];
    if (!sessionId) {
      // No session cookie, redirect to login
      const loginPath = route.oauth2.loginPath || '/oauth/login';
      const loginUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${loginPath}`;
      return { authenticated: false, loginUrl };
    }

    // Check if session is valid
    if (!this.oauth2Service.isAuthenticated(sessionId)) {
      // Invalid session, redirect to login
      const loginPath = route.oauth2.loginPath || '/oauth/login';
      const loginUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${loginPath}`;
      return { authenticated: false, loginUrl };
    }

    // Get session data
    const session = this.oauth2Service.getSession(sessionId);
    if (!session) {
      // Session not found, redirect to login
      const loginPath = route.oauth2.loginPath || '/oauth/login';
      const loginUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${loginPath}`;
      return { authenticated: false, loginUrl };
    }

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      // Session expired, redirect to login
      const loginPath = route.oauth2.loginPath || '/oauth/login';
      const loginUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${loginPath}`;
      return { authenticated: false, loginUrl };
    }

    return { authenticated: true, session };
  }
} 