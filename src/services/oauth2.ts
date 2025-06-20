import express from 'express';
import axios from 'axios';
import * as crypto from 'crypto';
import { OAuth2Config, OAuth2TokenResponse, OAuth2Session } from '../types';
import { logger } from '../utils/logger';

export class OAuth2Service {
  private sessions: Map<string, OAuth2Session> = new Map();
  private states: Map<string, { config: OAuth2Config; timestamp: number }> = new Map();
  private codeVerifiers: Map<string, string> = new Map();

  constructor() {
    // Clean up expired states every 10 minutes
    setInterval(() => this.cleanupExpiredStates(), 10 * 60 * 1000);
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
    sessionId: string
  ): Promise<{ success: boolean; error?: string; redirectUrl?: string }> {
    try {
      // Validate state
      const stateData = this.states.get(state);
      if (!stateData) {
        return { success: false, error: 'Invalid or expired state parameter' };
      }

      const config = stateData.config;
      
      // Validate configuration
      this.validateConfig(config);

      // Clean up state
      this.states.delete(state);

      // Prepare token request
      const tokenParams: Record<string, string> = {
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
      };

      // Add PKCE code verifier if used
      if (config.pkce) {
        const codeVerifier = this.codeVerifiers.get(state);
        if (codeVerifier) {
          tokenParams.code_verifier = codeVerifier;
          this.codeVerifiers.delete(state);
        }
      }

      // Exchange code for tokens
      logger.info(`Exchanging authorization code for tokens`, {
        provider: config.provider,
        tokenEndpoint: config.tokenEndpoint,
      });

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

      // Create session
      const session: OAuth2Session = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        expiresAt: tokens.expires_in 
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : undefined,
      };

      // Store session
      this.sessions.set(sessionId, session);

      logger.info(`OAuth2 authentication successful`, {
        provider: config.provider,
        sessionId,
        tokenType: tokens.token_type,
        expiresIn: tokens.expires_in,
      });

      return { 
        success: true, 
        redirectUrl: '/' // Redirect to app root after successful auth
      };

    } catch (error: any) {
      logger.error('OAuth2 token exchange failed', {
        error: error.message,
        response: error.response?.data,
      });

      return { 
        success: false, 
        error: `Token exchange failed: ${error.message}` 
      };
    }
  }

  // Check if session is authenticated
  isAuthenticated(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

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
    // Validate configuration
    this.validateConfig(config);
    
    const session = this.sessions.get(sessionId);
    if (!session?.refreshToken) {
      return false;
    }

    try {
      const tokenParams = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: session.refreshToken,
      });

      const refreshHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      };

      // Add subscription key header if configured
      if (config.subscriptionKey) {
        const headerName = config.subscriptionKeyHeader!;
        refreshHeaders[headerName] = config.subscriptionKey;
      }

      const tokenResponse = await axios.post<OAuth2TokenResponse>(
        config.tokenEndpoint,
        tokenParams,
        {
          headers: refreshHeaders,
          timeout: 30000,
        }
      );

      const tokens = tokenResponse.data;

      // Update session with new tokens
      session.accessToken = tokens.access_token;
      if (tokens.refresh_token) {
        session.refreshToken = tokens.refresh_token;
      }
      session.expiresAt = tokens.expires_in 
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined;

      this.sessions.set(sessionId, session);

      logger.info('OAuth2 token refreshed successfully', {
        provider: config.provider,
        sessionId,
      });

      return true;

    } catch (error: any) {
      logger.error('OAuth2 token refresh failed', {
        error: error.message,
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

  // Get OAuth2 middleware for Express
  createMiddleware(config: OAuth2Config, publicPaths: string[] = []): express.RequestHandler {
    // Validate configuration when middleware is created
    this.validateConfig(config);
    
    return (req, res, next) => {
      // Skip authentication for public paths
      const isPublicPath = publicPaths.some(path => 
        req.path.startsWith(path) || req.path === path
      );

      if (isPublicPath) {
        return next();
      }

      // Get session ID from cookie or create new one
      let sessionId = req.cookies?.['oauth2-session'];
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        res.cookie('oauth2-session', sessionId, {
          httpOnly: true,
          secure: req.secure,
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });
      }

      // Check if authenticated
      if (this.isAuthenticated(sessionId)) {
        // Add session data to request
        (req as any).oauth2Session = this.getSession(sessionId);
        return next();
      }

      // Handle OAuth2 callback (both success and error cases)
      const callbackPath = new URL(config.callbackUrl).pathname;
      const fullRequestPath = req.baseUrl + req.path;
      if (fullRequestPath === callbackPath) {
        // Handle OAuth2 error responses
        if (req.query.error) {
          logger.error(`OAuth2 authorization error: ${req.query.error}`, {
            error: req.query.error,
            errorDescription: req.query.error_description,
            provider: config.provider,
          });
          
          // Clear session and redirect with error
          res.clearCookie('oauth2-session');
          return res.status(400).send(`
            <h1>OAuth2 Authorization Failed</h1>
            <p><strong>Error:</strong> ${req.query.error}</p>
            <p><strong>Description:</strong> ${req.query.error_description || 'No description provided'}</p>
            <p><a href="/">Try again</a></p>
          `);
        }

        // Handle successful authorization with code
        if (req.query.code && req.query.state) {
          return this.handleCallback(
            req.query.code as string,
            req.query.state as string,
            sessionId
          ).then(result => {
            if (result.success) {
              // Redirect to the original route path, not just root
              const redirectPath = req.baseUrl || '/';
              res.redirect(redirectPath);
            } else {
              logger.error('OAuth2 callback failed', { error: result.error });
              res.status(400).send(`
                <h1>OAuth2 Callback Failed</h1>
                <p><strong>Error:</strong> ${result.error}</p>
                <p><a href="/">Try again</a></p>
              `);
            }
          }).catch(next);
        }
        
        // Invalid callback request
        return res.status(400).send(`
          <h1>Invalid OAuth2 Callback</h1>
          <p>No authorization code or error information provided.</p>
          <p><a href="/">Try again</a></p>
        `);
      }

      // Redirect to authorization
      const { url } = this.buildAuthorizationUrl(config);
      res.redirect(url);
    };
  }
} 