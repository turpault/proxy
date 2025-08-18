import { randomBytes, createHash } from 'crypto';
import { logger } from '../utils/logger';
import * as path from 'path';
import { Database } from 'bun:sqlite';

export interface Session {
  id: string;
  userId: string;
  domain: string;
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
  private static instances: Map<string, SessionManager> = new Map();
  private db: Database;
  private sessionCache: Map<string, Session> = new Map();
  private cacheAccessOrder: string[] = []; // For LRU eviction
  private readonly maxCacheSize: number = 100;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private sessionTimeout: number = 3600000; // 1 hour default
  private domain: string;

  private constructor(domain: string = '_default_') {
    this.domain = domain;
    const dbPath = path.join(process.cwd(), 'data', 'sessions.sqlite');
    this.db = new Database(dbPath);
    this.initializeDatabase();
    this.startCleanupInterval();
  }

  static getInstance(domain?: string): SessionManager {
    const domainKey = domain || '_default_';
    if (!SessionManager.instances.has(domainKey)) {
      SessionManager.instances.set(domainKey, new SessionManager(domainKey));
    }
    return SessionManager.instances.get(domainKey)!;
  }

  // Get the management console instance specifically
  static getManagementInstance(): SessionManager {
    return SessionManager.getInstance('_management_');
  }

  setSessionTimeout(timeout: number): void {
    this.sessionTimeout = timeout;
  }

  private updateCacheAccess(sessionId: string): void {
    // Remove from current position
    const index = this.cacheAccessOrder.indexOf(sessionId);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.cacheAccessOrder.push(sessionId);
  }

  private evictLRU(): void {
    if (this.sessionCache.size >= this.maxCacheSize) {
      const lruSessionId = this.cacheAccessOrder.shift();
      if (lruSessionId) {
        this.sessionCache.delete(lruSessionId);
        logger.debug(`Evicted session ${lruSessionId} from cache (LRU) for domain ${this.domain}`);
      }
    }
  }

  private addToCache(session: Session): void {
    this.evictLRU();
    this.sessionCache.set(session.id, session);
    this.updateCacheAccess(session.id);
  }

  private removeFromCache(sessionId: string): void {
    this.sessionCache.delete(sessionId);
    const index = this.cacheAccessOrder.indexOf(sessionId);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
  }

  private getFromCache(sessionId: string): Session | null {
    const session = this.sessionCache.get(sessionId);
    if (session) {
      this.updateCacheAccess(sessionId);
      return session;
    }
    return null;
  }

  private initializeDatabase(): void {
    try {
      // Check if table exists and if it has the domain column
      const checkTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'");
      const tableExists = checkTable.get() as any;

      if (!tableExists) {
        // Create new table with domain column
        this.db.run(`
          CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            domain TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            lastActivity INTEGER NOT NULL,
            expiresAt INTEGER NOT NULL,
            ipAddress TEXT NOT NULL,
            userAgent TEXT NOT NULL
          )
        `);
        logger.info('Created new sessions table with domain column');
      } else {
        // Table exists, check if it has domain column
        const checkColumn = this.db.prepare("PRAGMA table_info(sessions)");
        const columns = checkColumn.all() as any[];
        const hasDomainColumn = columns.some(col => col.name === 'domain');

        if (!hasDomainColumn) {
          this.db.run('ALTER TABLE sessions ADD COLUMN domain TEXT DEFAULT "_default_"');
          logger.info('Added domain column to existing sessions table');
        } else {
          logger.debug('Domain column already exists in sessions table');
        }
      }

      // Create indexes for faster queries
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt 
        ON sessions(expiresAt)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_sessions_userId 
        ON sessions(userId)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_sessions_domain 
        ON sessions(domain)
      `);

      logger.info(`Session database initialized for domain: ${this.domain}`);
    } catch (error) {
      logger.error('Failed to initialize session database:', error);
    }
  }

  private startCleanupInterval(): void {
    // Clean up expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  private cleanupExpiredSessions(): void {
    try {
      const now = Date.now();

      // Clean up expired sessions from database for this domain
      const stmt = this.db.prepare('DELETE FROM sessions WHERE expiresAt <= ? AND domain = ?');
      const result = stmt.run(now, this.domain);

      // Clean up expired sessions from cache
      let cacheCleanedCount = 0;
      for (const [sessionId, session] of this.sessionCache.entries()) {
        if (session.expiresAt <= now) {
          this.removeFromCache(sessionId);
          cacheCleanedCount++;
        }
      }

      if (result.changes > 0 || cacheCleanedCount > 0) {
        logger.info(`Cleaned up ${result.changes} expired sessions from database, ${cacheCleanedCount} from cache for domain ${this.domain}`);
      }
    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error);
    }
  }

  createSession(userId: string, ipAddress: string, userAgent: string): Session {
    const sessionId = randomBytes(32).toString('hex');
    return this.createSessionWithId(sessionId, userId, ipAddress, userAgent);
  }

  createSessionWithId(sessionId: string, userId: string, ipAddress: string, userAgent: string): Session {
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      userId,
      domain: this.domain,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + this.sessionTimeout,
      ipAddress,
      userAgent
    };

    try {
      const stmt = this.db.prepare(`
        INSERT INTO sessions (id, userId, domain, createdAt, lastActivity, expiresAt, ipAddress, userAgent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(sessionId, userId, this.domain, now, now, session.expiresAt, ipAddress, userAgent);

      // Add to cache
      this.addToCache(session);

      logger.info(`Created session ${sessionId} for user ${userId} in domain ${this.domain}`);
      return session;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  getSession(sessionId: string): Session | null {
    try {
      // First, check cache
      const cachedSession = this.getFromCache(sessionId);
      if (cachedSession) {
        // Check if cached session is expired
        if (cachedSession.expiresAt <= Date.now()) {
          this.removeFromCache(sessionId);
          this.deleteSession(sessionId);
          return null;
        }

        // Update last activity and extend session
        const now = Date.now();
        const newExpiresAt = now + this.sessionTimeout;

        const updatedSession: Session = {
          ...cachedSession,
          lastActivity: now,
          expiresAt: newExpiresAt
        };

        // Update database
        const updateStmt = this.db.prepare(`
          UPDATE sessions 
          SET lastActivity = ?, expiresAt = ? 
          WHERE id = ? AND domain = ?
        `);
        updateStmt.run(now, newExpiresAt, sessionId, this.domain);

        // Update cache
        this.addToCache(updatedSession);

        return updatedSession;
      }

      // Cache miss - query database
      const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ? AND domain = ?');
      const row = stmt.get(sessionId, this.domain) as any;

      if (!row) {
        return null;
      }

      // Check if session is expired
      if (row.expiresAt <= Date.now()) {
        this.deleteSession(sessionId);
        return null;
      }

      // Update last activity and extend session
      const now = Date.now();
      const newExpiresAt = now + this.sessionTimeout;

      const updateStmt = this.db.prepare(`
        UPDATE sessions 
        SET lastActivity = ?, expiresAt = ? 
        WHERE id = ? AND domain = ?
      `);
      updateStmt.run(now, newExpiresAt, sessionId, this.domain);

      const session: Session = {
        id: row.id,
        userId: row.userId,
        domain: row.domain,
        createdAt: row.createdAt,
        lastActivity: now,
        expiresAt: newExpiresAt,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent
      };

      // Add to cache
      this.addToCache(session);

      return session;
    } catch (error) {
      logger.error('Failed to get session:', error);
      return null;
    }
  }

  updateSessionActivity(sessionId: string): boolean {
    try {
      const now = Date.now();
      const newExpiresAt = now + this.sessionTimeout;

      // Update database
      const stmt = this.db.prepare(`
        UPDATE sessions 
        SET lastActivity = ?, expiresAt = ? 
        WHERE id = ? AND domain = ?
      `);
      const result = stmt.run(now, newExpiresAt, sessionId, this.domain);

      if (result.changes > 0) {
        // Update cache if session exists in cache
        const cachedSession = this.sessionCache.get(sessionId);
        if (cachedSession) {
          const updatedSession: Session = {
            ...cachedSession,
            lastActivity: now,
            expiresAt: newExpiresAt
          };
          this.addToCache(updatedSession);
        }
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to update session activity:', error);
      return false;
    }
  }

  deleteSession(sessionId: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ? AND domain = ?');
      const result = stmt.run(sessionId, this.domain);

      if (result.changes > 0) {
        // Remove from cache
        this.removeFromCache(sessionId);
        logger.info(`Deleted session ${sessionId} from domain ${this.domain}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to delete session:', error);
      return false;
    }
  }

  deleteAllSessionsForUser(userId: string): number {
    try {
      // Delete from database
      const stmt = this.db.prepare('DELETE FROM sessions WHERE userId = ? AND domain = ?');
      const result = stmt.run(userId, this.domain);

      if (result.changes > 0) {
        // Remove from cache
        for (const [sessionId, session] of this.sessionCache.entries()) {
          if (session.userId === userId) {
            this.removeFromCache(sessionId);
          }
        }

        logger.info(`Deleted ${result.changes} sessions for user ${userId} in domain ${this.domain}`);
        return result.changes;
      }

      return 0;
    } catch (error) {
      logger.error('Failed to delete sessions for user:', error);
      return 0;
    }
  }

  getActiveSessions(): Session[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM sessions WHERE expiresAt > ? AND domain = ?');
      const rows = stmt.all(Date.now(), this.domain) as any[];

      return rows.map(row => ({
        id: row.id,
        userId: row.userId,
        domain: row.domain,
        createdAt: row.createdAt,
        lastActivity: row.lastActivity,
        expiresAt: row.expiresAt,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent
      }));
    } catch (error) {
      logger.error('Failed to get active sessions:', error);
      return [];
    }
  }

  getSessionCount(): number {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE expiresAt > ? AND domain = ?');
      const result = stmt.get(Date.now(), this.domain) as any;
      return result?.count || 0;
    } catch (error) {
      logger.error('Failed to get session count:', error);
      return 0;
    }
  }

  getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.sessionCache.size,
      maxSize: this.maxCacheSize
    };
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Clear cache on shutdown
    this.sessionCache.clear();
    this.cacheAccessOrder.length = 0;
    logger.info(`Session manager shutdown complete for domain: ${this.domain}`);
  }

  // Static method to shutdown all instances
  static shutdownAll(): void {
    for (const [domain, instance] of SessionManager.instances) {
      instance.shutdown();
    }
    SessionManager.instances.clear();
    logger.info('All session manager instances shutdown complete');
  }
}

// Export the default instance for backward compatibility
export const sessionManager = SessionManager.getManagementInstance();
