import { randomBytes, createHash } from 'crypto';
import { logger } from '../utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  ipAddress: string;
  userAgent: string;
}

export interface SessionData {
  sessions: Session[];
  lastCleanup: number;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, Session> = new Map();
  private sessionFile: string;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private sessionTimeout: number = 3600000; // 1 hour default

  private constructor() {
    this.sessionFile = path.join(process.cwd(), 'data', 'sessions.json');
    this.loadSessions();
    this.startCleanupInterval();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  setSessionTimeout(timeout: number): void {
    this.sessionTimeout = timeout;
  }

  private async loadSessions(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.sessionFile));
      
      if (await fs.pathExists(this.sessionFile)) {
        const data = await fs.readJson(this.sessionFile) as SessionData;
        
        // Only load non-expired sessions
        const now = Date.now();
        for (const session of data.sessions) {
          if (session.expiresAt > now) {
            this.sessions.set(session.id, session);
          }
        }
        
        logger.info(`Loaded ${this.sessions.size} active sessions from disk`);
      }
    } catch (error) {
      logger.error('Failed to load sessions from disk:', error);
    }
  }

  private async saveSessions(): Promise<void> {
    try {
      const data: SessionData = {
        sessions: Array.from(this.sessions.values()),
        lastCleanup: Date.now()
      };
      
      await fs.writeJson(this.sessionFile, data, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save sessions to disk:', error);
    }
  }

  private startCleanupInterval(): void {
    // Clean up expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired sessions`);
      this.saveSessions();
    }
  }

  createSession(userId: string, ipAddress: string, userAgent: string): Session {
    const sessionId = randomBytes(32).toString('hex');
    const now = Date.now();
    
    const session: Session = {
      id: sessionId,
      userId,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + this.sessionTimeout,
      ipAddress,
      userAgent
    };

    this.sessions.set(sessionId, session);
    this.saveSessions();
    
    logger.info(`Created session ${sessionId} for user ${userId}`);
    return session;
  }

  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      this.saveSessions();
      return null;
    }

    // Update last activity and extend session
    session.lastActivity = Date.now();
    session.expiresAt = Date.now() + this.sessionTimeout;
    
    return session;
  }

  updateSessionActivity(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    session.lastActivity = Date.now();
    session.expiresAt = Date.now() + this.sessionTimeout;
    this.saveSessions();
    
    return true;
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this.saveSessions();
      logger.info(`Deleted session ${sessionId}`);
    }
    return deleted;
  }

  deleteAllSessionsForUser(userId: string): number {
    let deletedCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.saveSessions();
      logger.info(`Deleted ${deletedCount} sessions for user ${userId}`);
    }

    return deletedCount;
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.saveSessions();
    logger.info('Session manager shutdown complete');
  }
}

// Export a singleton instance
export const sessionManager = SessionManager.getInstance();
