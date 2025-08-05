import axios from 'axios';
import * as crypto from 'crypto';
import { OAuth2Config, OAuth2TokenResponse, OAuth2Session } from '../types';
import { logger } from '../utils/logger';
import { BunRequestContext } from './bun-middleware';

export class OAuth2Service {
  private sessions: Map<string, OAuth2Session> = new Map();
  private states: Map<string, { config: OAuth2Config; timestamp: number }> = new Map();
  private codeVerifiers: Map<string, string> = new Map();

  constructor() {
    // Clean up expired states every 10 minutes
    setInterval(() => this.cleanupExpiredStates(), 10 * 60 * 1000);
  }

  // Generate unique cookie name for a route
  private generateCookieName(config: OAuth2Config, baseUrl?: string): string {
    // Create a unique identifier based on provider and baseUrl
    const routeIdentifier = baseUrl ? baseUrl.replace(/[^a-zA-Z0-9]/g, '_') : 'default';
    const providerIdentifier = config.provider.replace(/[^a-zA-Z0-9]/g, '_');

    // Generate a hash of the client ID to make it unique but not expose the full client ID
    const clientIdHash = crypto.createHash('sha256').update(config.clientId).digest('hex').substring(0, 8);

    return `oauth2_${providerIdentifier}_${routeIdentifier}_${clientIdHash}`;
  }

  // Generate secure random state parameter
  generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate PKCE code verifier and challenge
  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  // Validate OAuth2 configuration
  private validateConfig(config: OAuth2Config): void {
    // If subscriptionKey is provided, ensure subscriptionKeyHeader is also set
    if (config.subscriptionKey && !config.subscriptionKeyHeader) {
      logger.warn(`Subscription key provided but no header name specified for provider ${config.provider}.'`, {
        provider: config.provider,
        hasSubscriptionKey: !!config.subscriptionKey,
        subscriptionKeyHeader: config.subscriptionKeyHeader,
      });

      throw new Error(`Subscription key provided but no header name specified for provider ${config.provider}.`);
    }

    // Log subscription key configuration for debugging
    if (config.subscriptionKey) {
      logger.info(`OAuth2 subscription key configured for provider ${config.provider}`, {
        provider: config.provider,
        subscriptionKeyHeader: config.subscriptionKeyHeader,
        hasSubscriptionKey: !!config.subscriptionKey,
      });
    }
  }

  // Build authorization URL
  buildAuthorizationUrl(config: OAuth2Config): { url: string; state: string } {
    // Validate configuration first
    this.validateConfig(config);

    const state = this.generateState();

    // Store state for validation
    this.states.set(state, {
      config,
      timestamp: Date.now(),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      state,
    });

    // Add scopes if configured
    if (config.scopes && config.scopes.length > 0) {
      params.append('scope', config.scopes.join(' '));
    }

    // Add PKCE if enabled
    if (config.pkce) {
      const { codeVerifier, codeChallenge } = this.generatePKCE();
      this.codeVerifiers.set(state, codeVerifier);
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    // Add additional parameters (avoid duplicating standard OAuth2 params)
    if (config.additionalParams) {
      const standardParams = ['response_type', 'client_id', 'redirect_uri', 'state', 'scope', 'code_challenge', 'code_challenge_method'];
      Object.entries(config.additionalParams).forEach(([key, value]) => {
        if (!standardParams.includes(key)) {
          params.append(key, value);
        } else {
          logger.warn(`Skipping duplicate OAuth2 parameter: ${key}`, {
            provider: config.provider,
            key,
            value,
          });
        }
      });
    }

    const url = `${config.authorizationEndpoint}?${params.toString()}`;

    logger.info(`OAuth2 authorization URL generated for ${config.provider}`, {
      provider: config.provider,
      clientId: config.clientId,
      state,
      url: url.replace(config.clientId, '***'), // Hide client ID in logs
      params: params.toString(),
    });

    return { url, state };
  }

  // Handle OAuth2 callback
  async handleCallback(
    code: string,
    state: string,
    sessionId: string,
    config: OAuth2Config
  ): Promise<{ success: boolean; error?: string; redirectUrl?: string }> {
    try {
      // Validate state
      const stateData = this.states.get(state);
      if (!stateData) {
        return { success: false, error: 'Invalid or expired state parameter' };
      }

      const stateConfig = stateData.config;

      // Validate configuration
      this.validateConfig(stateConfig);

      // Clean up state
      this.states.delete(state);

      // Prepare token request
      const tokenParams: Record<string, string> = {
        grant_type: 'authorization_code',
        client_id: stateConfig.clientId,
        client_secret: stateConfig.clientSecret,
        code,
        redirect_uri: stateConfig.callbackUrl,
      };

      // Add PKCE code verifier if used
      if (stateConfig.pkce) {
        const codeVerifier = this.codeVerifiers.get(state);
        if (codeVerifier) {
          tokenParams.code_verifier = codeVerifier;
          this.codeVerifiers.delete(state);
        }
      }

      // Exchange code for tokens
      logger.info(`Exchanging authorization code for tokens`, {
        provider: stateConfig.provider,
        tokenEndpoint: stateConfig.tokenEndpoint,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      };

      // Add subscription key header if configured
      if (stateConfig.subscriptionKey) {
        const headerName = stateConfig.subscriptionKeyHeader!;
        headers[headerName] = stateConfig.subscriptionKey;
      }

      const tokenResponse = await axios.post<OAuth2TokenResponse>(
        stateConfig.tokenEndpoint,
        new URLSearchParams(tokenParams),
        {
          headers,
          timeout: 30000,
        }
      );

      const tokens = tokenResponse.data;

      // Create session
      const session: OAuth2Session = {
        accessToken: tokens.access_token,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      };

      // Store session
      this.sessions.set(sessionId, session);

      logger.info(`OAuth2 session created successfully`, {
        provider: stateConfig.provider,
        sessionId,
        expiresAt: session.expiresAt?.toISOString(),
      });

      return { success: true, redirectUrl: stateConfig.callbackRedirectEndpoint || '/' };
    } catch (error) {
      logger.error('OAuth2 callback failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: config.provider,
      });

      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Check if session is authenticated
  isAuthenticated(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Check if token is expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      return false;
    }

    return true;
  }

  // Get session data
  getSession(sessionId: string): OAuth2Session | null {
    return this.sessions.get(sessionId) || null;
  }

  // Refresh access token
  async refreshToken(
    sessionId: string,
    config: OAuth2Config
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session?.refreshToken) {
      return false;
    }

    try {
      const tokenParams: Record<string, string> = {
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: session.refreshToken,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      };

      // Add subscription key header if configured
      if (config.subscriptionKey) {
        const headerName = config.subscriptionKeyHeader!;
        headers[headerName] = config.subscriptionKey;
      }

      const tokenResponse = await axios.post<OAuth2TokenResponse>(
        config.tokenEndpoint,
        new URLSearchParams(tokenParams),
        {
          headers,
          timeout: 30000,
        }
      );

      const tokens = tokenResponse.data;

      // Update session
      const updatedSession: OAuth2Session = {
        accessToken: tokens.access_token,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        refreshToken: tokens.refresh_token || session.refreshToken,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      };

      this.sessions.set(sessionId, updatedSession);

      logger.info(`OAuth2 token refreshed successfully`, {
        provider: config.provider,
        sessionId,
        expiresAt: updatedSession.expiresAt?.toISOString(),
      });

      return true;
    } catch (error) {
      logger.error('OAuth2 token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: config.provider,
        sessionId,
      });

      // Remove invalid session
      this.sessions.delete(sessionId);
      return false;
    }
  }

  // Logout and clear session
  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.info('OAuth2 session logged out', { sessionId });
  }

  // Clean up expired states
  private cleanupExpiredStates(): void {
    const now = Date.now();
    const expireTime = 10 * 60 * 1000; // 10 minutes

    for (const [state, data] of this.states.entries()) {
      if (now - data.timestamp > expireTime) {
        this.states.delete(state);
        this.codeVerifiers.delete(state);
      }
    }
  }

  // Parse cookies from request headers
  private parseCookies(cookieHeader: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
    });

    return cookies;
  }

  // Create Bun-native middleware function
  createBunMiddleware(config: OAuth2Config, publicPaths: string[] = [], baseRoutePath: string = ''): (requestContext: BunRequestContext) => Promise<Response | null> {
    // Validate configuration when middleware is created
    this.validateConfig(config);

    // Get endpoint paths from config with defaults
    const sessionEndpoint = config.sessionEndpoint || '/oauth/session';
    const logoutEndpoint = config.logoutEndpoint || '/oauth/logout';
    const loginPath = config.loginPath || '/oauth/login';

    return async (requestContext: BunRequestContext) => {
      // Generate unique cookie name for this route
      const cookieName = this.generateCookieName(config, baseRoutePath);

      // Parse cookies from headers
      const cookies = this.parseCookies(requestContext.headers['cookie']);

      // Add debug logging
      logger.info(`[OAUTH2] ${requestContext.method} ${requestContext.originalUrl} - path: ${requestContext.pathname} - cookie: ${cookieName}`);

      // Handle session endpoint
      if (requestContext.pathname === sessionEndpoint) {
        // Get session ID from cookie
        const sessionId = cookies[cookieName];

        if (sessionId && this.isAuthenticated(sessionId)) {
          const session = this.getSession(sessionId);
          const now = new Date();
          const isExpired = session?.expiresAt && session.expiresAt < now;

          return new Response(JSON.stringify({
            authenticated: true,
            session: {
              accessToken: session?.accessToken,
              tokenType: session?.tokenType,
              scope: session?.scope,
              expiresAt: session?.expiresAt?.toISOString(),
              isExpired: isExpired,
              expiresIn: session?.expiresAt ? Math.max(0, session.expiresAt.getTime() - now.getTime()) : null,
              sessionId: sessionId
            },
            provider: config.provider,
            subscriptionKey: config.subscriptionKey,
            subscriptionKeyHeader: config.subscriptionKeyHeader,
            timestamp: now.toISOString()
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          return new Response(JSON.stringify({
            authenticated: false,
            provider: config.provider,
            subscriptionKey: config.subscriptionKey,
            subscriptionKeyHeader: config.subscriptionKeyHeader,
            timestamp: new Date().toISOString()
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Handle logout endpoint
      if (requestContext.pathname === logoutEndpoint) {
        const sessionId = cookies[cookieName];
        if (sessionId) {
          this.logout(sessionId);
        }

        const response = new Response(JSON.stringify({
          success: true,
          message: 'Logged out successfully'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

        // Clear cookie
        response.headers.set('Set-Cookie', `${cookieName}=; HttpOnly; Path=/; Max-Age=0`);

        return response;
      }

      // Handle login endpoint - initiates OAuth2 flow
      if (requestContext.pathname === loginPath) {
        // Get session ID from cookie or create new one
        let sessionId = cookies[cookieName];
        if (!sessionId) {
          sessionId = crypto.randomUUID();
        }

        // Check if already authenticated
        if (this.isAuthenticated(sessionId)) {
          // If already authenticated, redirect to the callback redirect endpoint or root
          const redirectEndpoint = config.callbackRedirectEndpoint || '/';
          const response = new Response(null, { status: 302 });
          response.headers.set('Location', redirectEndpoint);
          response.headers.set('Set-Cookie', `${cookieName}=${sessionId}; HttpOnly; Path=/; Max-Age=${24 * 60 * 60}`);
          return response;
        }

        // Redirect to OAuth2 authorization
        const { url } = this.buildAuthorizationUrl(config);
        const response = new Response(null, { status: 302 });
        response.headers.set('Location', url);
        response.headers.set('Set-Cookie', `${cookieName}=${sessionId}; HttpOnly; Path=/; Max-Age=${24 * 60 * 60}`);
        return response;
      }

      // Skip authentication for other public paths
      const isPublicPath = publicPaths.some(path =>
        requestContext.pathname.startsWith(path) || requestContext.pathname === path
      );

      if (isPublicPath) {
        return null; // Continue to next handler
      }

      // Get session ID from cookie or create new one
      let sessionId = cookies[cookieName];
      if (!sessionId) {
        sessionId = crypto.randomUUID();
      }

      // Check if authenticated
      if (this.isAuthenticated(sessionId)) {
        // Add session data to request context
        (requestContext as any).oauth2Session = this.getSession(sessionId);
        return null; // Continue to next handler
      }

      // Handle OAuth2 callback (both success and error cases)
      const callbackPath = new URL(config.callbackUrl).pathname;
      if (requestContext.pathname === callbackPath) {
        // Handle OAuth2 error responses
        if (requestContext.query.error) {
          logger.error(`OAuth2 authorization error: ${requestContext.query.error}`, {
            error: requestContext.query.error,
            errorDescription: requestContext.query.error_description,
            provider: config.provider,
          });

          const response = new Response(`
            <h1>OAuth2 Authorization Failed</h1>
            <p><strong>Error:</strong> ${requestContext.query.error}</p>
            <p><strong>Description:</strong> ${requestContext.query.error_description || 'No description provided'}</p>
            <p><a href="${baseRoutePath}${loginPath}">Try again</a></p>
          `, {
            status: 400,
            headers: { 'Content-Type': 'text/html' }
          });

          // Clear cookie
          response.headers.set('Set-Cookie', `${cookieName}=; HttpOnly; Path=/; Max-Age=0`);

          return response;
        }

        // Handle successful authorization with code
        if (requestContext.query.code && requestContext.query.state) {
          const result = await this.handleCallback(
            requestContext.query.code as string,
            requestContext.query.state as string,
            sessionId,
            config
          );

          if (result.success) {
            // Use the redirect endpoint from the result
            const redirectEndpoint = result.redirectUrl || '/';
            const response = new Response(null, { status: 302 });
            response.headers.set('Location', redirectEndpoint);
            response.headers.set('Set-Cookie', `${cookieName}=${sessionId}; HttpOnly; Path=/; Max-Age=${24 * 60 * 60}`);
            return response;
          } else {
            logger.error('OAuth2 callback failed', { error: result.error });
            const response = new Response(`
              <h1>OAuth2 Callback Failed</h1>
              <p><strong>Error:</strong> ${result.error}</p>
              <p><a href="${baseRoutePath}${loginPath}">Try again</a></p>
            `, {
              status: 400,
              headers: { 'Content-Type': 'text/html' }
            });

            // Clear cookie
            response.headers.set('Set-Cookie', `${cookieName}=; HttpOnly; Path=/; Max-Age=0`);

            return response;
          }
        }
      }

      // Not authenticated and not a public path - redirect to login
      const response = new Response(null, { status: 302 });
      response.headers.set('Location', `${baseRoutePath}${loginPath}`);
      response.headers.set('Set-Cookie', `${cookieName}=${sessionId}; HttpOnly; Path=/; Max-Age=${24 * 60 * 60}`);
      return response;
    };
  }

  // Legacy method for backward compatibility (returns null for Bun)
  createMiddleware(config: OAuth2Config, publicPaths: string[] = []): null {
    logger.warn('OAuth2 createMiddleware() is deprecated for Bun. Use createBunMiddleware() instead.');
    return null;
  }
} 