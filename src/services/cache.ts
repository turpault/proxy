import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

export interface CacheEntry {
  timestamp: number;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  contentType: string;
  userId?: string; // User identifier for user-specific caching
  userIP?: string; // User IP for additional identification
}

export interface CacheOptions {
  maxAge?: number; // in milliseconds, default 24 hours
  cacheDir?: string;
  mruSize?: number; // MRU cache size, default 100
}

export interface MRUCacheItem {
  key: string;
  entry: CacheEntry;
  lastAccessed: number;
}

export class CacheService {
  private cacheDir: string;
  private maxAge: number;
  private mruSize: number;
  private mruCache: Map<string, MRUCacheItem> = new Map();

  constructor(options: CacheOptions = {}) {
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours default
    this.cacheDir = options.cacheDir || path.resolve(process.cwd(), 'data', 'cache');
    this.mruSize = options.mruSize || 100; // 100 items default
    
    // Ensure cache directory exists
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    try {
      fs.ensureDirSync(this.cacheDir);
      logger.debug(`Cache directory ensured: ${this.cacheDir}`);
    } catch (error) {
      logger.error('Failed to create cache directory', error);
    }
  }

  /**
   * Generate a cache key from the target URL (without query parameters) and user info
   */
  private generateCacheKey(target: string, method: string, userId?: string, userIP?: string): string {
    try {
      const url = new URL(target);
      // Remove query parameters and hash
      const cleanUrl = `${url.protocol}//${url.host}${url.pathname}`;
      const userInfo = userId ? `:user:${userId}` : '';
      const ipInfo = userIP ? `:ip:${userIP}` : '';
      const key = `${method}:${cleanUrl}${userInfo}${ipInfo}`;
      return crypto.createHash('sha256').update(key).digest('hex');
    } catch (error) {
      logger.warn('Failed to generate cache key, using fallback', { target, error });
      const userInfo = userId ? `:user:${userId}` : '';
      const ipInfo = userIP ? `:ip:${userIP}` : '';
      const key = `${method}:${target}${userInfo}${ipInfo}`;
      return crypto.createHash('sha256').update(key).digest('hex');
    }
  }

  /**
   * Get cache file path for a given key
   */
  private getCacheFilePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  /**
   * Update MRU cache - move item to front and maintain size limit
   */
  private updateMRU(key: string, entry: CacheEntry): void {
    // Remove if exists
    this.mruCache.delete(key);
    
    // Add to front
    this.mruCache.set(key, {
      key,
      entry,
      lastAccessed: Date.now()
    });
    
    // Maintain size limit
    if (this.mruCache.size > this.mruSize) {
      // Remove least recently used item
      let oldestKey: string | null = null;
      let oldestTime = Date.now();
      
      for (const [k, item] of this.mruCache.entries()) {
        if (item.lastAccessed < oldestTime) {
          oldestTime = item.lastAccessed;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.mruCache.delete(oldestKey);
      }
    }
  }

  /**
   * Check if a cache entry exists and is valid (checks MRU first, then disk)
   */
  async get(target: string, method: string, userId?: string, userIP?: string): Promise<CacheEntry | null> {
    try {
      const key = this.generateCacheKey(target, method, userId, userIP);
      
      // Check MRU cache first
      const mruItem = this.mruCache.get(key);
      if (mruItem) {
        const now = Date.now();
        if (now - mruItem.entry.timestamp <= this.maxAge) {
          // Update last accessed time
          mruItem.lastAccessed = now;
          logger.debug(`MRU cache hit for ${method} ${target}`);
          return mruItem.entry;
        } else {
          // Expired, remove from MRU
          this.mruCache.delete(key);
        }
      }

      // Check disk cache
      const cachePath = this.getCacheFilePath(key);
      if (!await fs.pathExists(cachePath)) {
        return null;
      }

      // Read cache entry
      const cacheData = await fs.readJson(cachePath);
      const entry: CacheEntry = {...cacheData, body: Buffer.from(cacheData.body, "binary")};

      // Check if cache is expired
      const now = Date.now();
      if (now - entry.timestamp > this.maxAge) {
        logger.debug(`Cache expired for ${method} ${target}`);
        await this.delete(target, method, userId, userIP);
        return null;
      }

      // Add to MRU cache
      this.updateMRU(key, entry);
      
      logger.debug(`Disk cache hit for ${method} ${target}`);
      return entry;
    } catch (error) {
      logger.error('Error reading from cache', { target, method, userId, userIP, error });
      return null;
    }
  }

  /**
   * Store a response in cache (both MRU and disk)
   */
  async set(target: string, method: string, entry: Omit<CacheEntry, 'timestamp'>, userId?: string, userIP?: string): Promise<void> {
    try {
      const key = this.generateCacheKey(target, method, userId, userIP);
      const cachePath = this.getCacheFilePath(key);

      const cacheEntry: CacheEntry = {
        ...entry,
        timestamp: Date.now(),
        userId,
        userIP,
      };

      // Store in MRU cache
      this.updateMRU(key, cacheEntry);

      // Store on disk
      await fs.writeJson(cachePath, {...cacheEntry, body: cacheEntry.body.toString('binary')}, { spaces: 2 });
      logger.debug(`Cached response for ${method} ${target}${userId ? ` (user: ${userId})` : ''}`);
    } catch (error) {
      logger.error('Error writing to cache', { target, method, userId, userIP, error });
    }
  }

  /**
   * Delete a cache entry (from both MRU and disk)
   */
  async delete(target: string, method: string, userId?: string, userIP?: string): Promise<void> {
    try {
      const key = this.generateCacheKey(target, method, userId, userIP);
      const cachePath = this.getCacheFilePath(key);

      // Remove from MRU cache
      this.mruCache.delete(key);

      // Remove from disk
      if (await fs.pathExists(cachePath)) {
        await fs.remove(cachePath);
        logger.debug(`Deleted cache for ${method} ${target}${userId ? ` (user: ${userId})` : ''}`);
      }
    } catch (error) {
      logger.error('Error deleting cache entry', { target, method, userId, userIP, error });
    }
  }

  /**
   * Clear all cache entries (both MRU and disk)
   */
  async clear(): Promise<void> {
    try {
      // Clear MRU cache
      this.mruCache.clear();
      
      // Clear disk cache
      const files = await fs.readdir(this.cacheDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of jsonFiles) {
        await fs.remove(path.join(this.cacheDir, file));
      }
      
      logger.info(`Cleared ${jsonFiles.length} cache entries (MRU and disk)`);
    } catch (error) {
      logger.error('Error clearing cache', error);
    }
  }

  /**
   * Clean up expired cache entries (both MRU and disk)
   */
  async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      // Clean up MRU cache
      for (const [key, item] of this.mruCache.entries()) {
        if (now - item.entry.timestamp > this.maxAge) {
          this.mruCache.delete(key);
          cleanedCount++;
        }
      }

      // Clean up disk cache
      const files = await fs.readdir(this.cacheDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const cacheData = await fs.readJson(filePath);
          const entry: CacheEntry = cacheData;
          
          if (now - entry.timestamp > this.maxAge) {
            await fs.remove(filePath);
            cleanedCount++;
          }
        } catch (error) {
          // If we can't read the file, remove it
          await fs.remove(filePath);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired cache entries`);
      }
    } catch (error) {
      logger.error('Error cleaning up cache', error);
    }
  }

  /**
   * Get cache statistics including MRU info
   */
  async getStats(): Promise<{ 
    totalEntries: number; 
    totalSize: number; 
    oldestEntry?: number; 
    newestEntry?: number;
    mruSize: number;
    mruEntries: number;
    mruHitRate?: number;
  }> {
    try {
      const files = await fs.readdir(this.cacheDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      let totalSize = 0;
      let oldestEntry: number | undefined;
      let newestEntry: number | undefined;

      for (const file of jsonFiles) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          
          const cacheData = await fs.readJson(filePath);
          const entry: CacheEntry = cacheData;
          
          if (!oldestEntry || entry.timestamp < oldestEntry) {
            oldestEntry = entry.timestamp;
          }
          if (!newestEntry || entry.timestamp > newestEntry) {
            newestEntry = entry.timestamp;
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }

      return {
        totalEntries: jsonFiles.length,
        totalSize,
        oldestEntry,
        newestEntry,
        mruSize: this.mruSize,
        mruEntries: this.mruCache.size,
      };
    } catch (error) {
      logger.error('Error getting cache stats', error);
      return { 
        totalEntries: 0, 
        totalSize: 0, 
        mruSize: this.mruSize,
        mruEntries: this.mruCache.size 
      };
    }
  }

  /**
   * Get all cache entries for management console
   */
  async getAllEntries(): Promise<Array<{
    key: string;
    target: string;
    method: string;
    userId?: string;
    userIP?: string;
    status: number;
    contentType: string;
    bodySize: number;
    timestamp: number;
    lastAccessed?: number;
    inMRU: boolean;
  }>> {
    try {
      const entries: Array<{
        key: string;
        target: string;
        method: string;
        userId?: string;
        userIP?: string;
        status: number;
        contentType: string;
        bodySize: number;
        timestamp: number;
        lastAccessed?: number;
        inMRU: boolean;
      }> = [];

      // Get MRU entries
      for (const [key, item] of this.mruCache.entries()) {
        entries.push({
          key,
          target: this.extractTargetFromKey(key),
          method: this.extractMethodFromKey(key),
          userId: item.entry.userId,
          userIP: item.entry.userIP,
          status: item.entry.status,
          contentType: item.entry.contentType,
          bodySize: item.entry.body.length,
          timestamp: item.entry.timestamp,
          lastAccessed: item.lastAccessed,
          inMRU: true,
        });
      }

      // Get disk entries (excluding those already in MRU)
      const files = await fs.readdir(this.cacheDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const cacheData = await fs.readJson(filePath);
          const entry: CacheEntry = cacheData;
          const key = file.replace('.json', '');
          
          // Skip if already in MRU
          if (this.mruCache.has(key)) {
            continue;
          }

          entries.push({
            key,
            target: this.extractTargetFromKey(key),
            method: this.extractMethodFromKey(key),
            userId: entry.userId,
            userIP: entry.userIP,
            status: entry.status,
            contentType: entry.contentType,
            bodySize: entry.body.length,
            timestamp: entry.timestamp,
            inMRU: false,
          });
        } catch (error) {
          // Skip files that can't be read
        }
      }

      // Sort by timestamp (newest first)
      return entries.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('Error getting all cache entries', error);
      return [];
    }
  }

  /**
   * Extract target URL from cache key (reverse engineering)
   */
  private extractTargetFromKey(key: string): string {
    // This is a simplified extraction - in practice, you might want to store
    // the original target URL in the cache entry for easier retrieval
    return `target-${key.substring(0, 8)}`;
  }

  /**
   * Extract method from cache key (reverse engineering)
   */
  private extractMethodFromKey(key: string): string {
    // This is a simplified extraction
    return 'GET'; // Most cache entries are GET requests
  }

  /**
   * Get cache entries for a specific user
   */
  async getUserEntries(userId: string): Promise<Array<{
    key: string;
    target: string;
    method: string;
    userId?: string;
    userIP?: string;
    status: number;
    contentType: string;
    bodySize: number;
    timestamp: number;
    lastAccessed?: number;
    inMRU: boolean;
  }>> {
    const allEntries = await this.getAllEntries();
    return allEntries.filter(entry => entry.userId === userId);
  }

  /**
   * Clear cache entries for a specific user
   */
  async clearUserCache(userId: string): Promise<void> {
    try {
      const userEntries = await this.getUserEntries(userId);
      let clearedCount = 0;

      for (const entry of userEntries) {
        await this.delete(entry.target, entry.method, userId, entry.userIP);
        clearedCount++;
      }

      logger.info(`Cleared ${clearedCount} cache entries for user ${userId}`);
    } catch (error) {
      logger.error('Error clearing user cache', error);
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService(); 