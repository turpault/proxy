import express from 'express';
import { logger } from '../utils/logger';
import { BaseProxy, ProxyRequestConfig } from './base-proxy';
import { OAuth2Service } from './oauth2';
import * as crypto from 'crypto';

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
          // Check if the request accepts HTML
          const acceptsHtml = req.accepts('html');
          
          if (acceptsHtml) {
            // Generate a redirect page that redirects to login URL after 2 seconds
            const redirectPage = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Authentication Required</title>
                <meta http-equiv="refresh" content="2;url=${authResult.loginUrl}">
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background-color: #f5f5f5;
                  }
                  .container {
                    text-align: center;
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    max-width: 400px;
                  }
                  .spinner {
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #007bff;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 1s linear infinite;
                    margin: 1rem auto;
                  }
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                  .countdown {
                    font-size: 1.2em;
                    color: #007bff;
                    margin: 1rem 0;
                  }
                  a {
                    color: #007bff;
                    text-decoration: none;
                  }
                  a:hover {
                    text-decoration: underline;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <h1>Authentication Required</h1>
                  <p>You need to authenticate to access this resource.</p>
                  <div class="spinner"></div>
                  <div class="countdown">Redirecting in <span id="countdown">2</span> seconds...</div>
                  <p><a href="${authResult.loginUrl}">Click here if you are not redirected automatically</a></p>
                </div>
                <script>
                  let seconds = 2;
                  const countdownElement = document.getElementById('countdown');
                  const timer = setInterval(() => {
                    seconds--;
                    countdownElement.textContent = seconds;
                    if (seconds <= 0) {
                      clearInterval(timer);
                      window.location.href = '${authResult.loginUrl}';
                    }
                  }, 1000);
                </script>
              </body>
            </html>
            `;
            
            res.status(401).type('html').send(redirectPage);
            return;
          }
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

    // Generate unique cookie name for this route
    const cookieName = this.generateCookieName(route.oauth2, req.baseUrl);

    // Get session ID from cookie
    const sessionId = req.cookies?.[cookieName];
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

  // Generate unique cookie name for a route (same logic as OAuth2Service)
  private generateCookieName(config: any, baseUrl?: string): string {
    // Create a unique identifier based on provider and baseUrl
    const routeIdentifier = baseUrl ? baseUrl.replace(/[^a-zA-Z0-9]/g, '_') : 'default';
    const providerIdentifier = config.provider.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Generate a hash of the client ID to make it unique but not expose the full client ID
    const clientIdHash = crypto.createHash('sha256').update(config.clientId).digest('hex').substring(0, 8);
    
    return `oauth2_${providerIdentifier}_${routeIdentifier}_${clientIdHash}`;
  }
} 