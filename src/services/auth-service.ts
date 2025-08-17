import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { sessionManager, Session } from './session-manager';

export interface AuthResult {
  success: boolean;
  session?: Session;
  error?: string;
}

export interface LoginRequest {
  password: string;
}

export interface LogoutRequest {
  sessionId: string;
}

export class AuthService {
  private static instance: AuthService;
  private adminPassword: string = '';
  private sessionTimeout: number = 3600000; // 1 hour default

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  initialize(adminPassword: string, sessionTimeout?: number): void {
    this.adminPassword = adminPassword;
    if (sessionTimeout) {
      this.sessionTimeout = sessionTimeout;
      sessionManager.setSessionTimeout(sessionTimeout);
    }
    logger.info('Authentication service initialized');
  }

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  private verifyPassword(password: string): boolean {
    const hashedPassword = this.hashPassword(password);
    const hashedAdminPassword = this.hashPassword(this.adminPassword);
    return hashedPassword === hashedAdminPassword;
  }

  login(password: string, ipAddress: string, userAgent: string): AuthResult {
    try {
      if (!this.adminPassword) {
        return {
          success: false,
          error: 'Authentication service not initialized'
        };
      }

      if (!this.verifyPassword(password)) {
        logger.warn(`Failed login attempt from ${ipAddress}`);
        return {
          success: false,
          error: 'Invalid password'
        };
      }

      // Create a new session
      const session = sessionManager.createSession('admin', ipAddress, userAgent);
      
      logger.info(`Successful login from ${ipAddress}`);
      
      return {
        success: true,
        session
      };
    } catch (error) {
      logger.error('Login error:', error);
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  }

  logout(sessionId: string): boolean {
    try {
      const deleted = sessionManager.deleteSession(sessionId);
      if (deleted) {
        logger.info(`User logged out, session ${sessionId} deleted`);
      }
      return deleted;
    } catch (error) {
      logger.error('Logout error:', error);
      return false;
    }
  }

  validateSession(sessionId: string): Session | null {
    try {
      return sessionManager.getSession(sessionId);
    } catch (error) {
      logger.error('Session validation error:', error);
      return null;
    }
  }

  refreshSession(sessionId: string): boolean {
    try {
      return sessionManager.updateSessionActivity(sessionId);
    } catch (error) {
      logger.error('Session refresh error:', error);
      return false;
    }
  }

  getActiveSessions(): Session[] {
    return sessionManager.getActiveSessions();
  }

  getSessionCount(): number {
    return sessionManager.getSessionCount();
  }

  isAuthenticated(sessionId: string): boolean {
    return this.validateSession(sessionId) !== null;
  }
}

// Export a singleton instance
export const authService = AuthService.getInstance();
