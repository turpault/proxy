import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from '../utils/logger';
import { RequestStats, SerializableRequestStats } from './statistics';

export class StatisticsPersistence {
  private dataDir: string;
  private reportDir: string;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), 'data', 'statistics');
    this.reportDir = path.resolve(process.cwd(), 'logs', 'statistics');
  }

  /**
   * Convert RequestStats to serializable format
   */
  serializeStats(stats: RequestStats): SerializableRequestStats {
    return {
      ip: stats.ip,
      geolocation: stats.geolocation,
      count: stats.count,
      firstSeen: stats.firstSeen.toISOString(),
      lastSeen: stats.lastSeen.toISOString(),
      userAgents: Array.from(stats.userAgents),
      routes: Array.from(stats.routes),
      methods: Array.from(stats.methods),
      responseTimes: stats.responseTimes,
      routeDetails: stats.routeDetails.map(detail => ({
        ...detail,
        timestamp: detail.timestamp.toISOString()
      }))
    };
  }

  /**
   * Convert serializable format back to RequestStats
   */
  deserializeStats(serialized: SerializableRequestStats): RequestStats {
    return {
      ip: serialized.ip,
      geolocation: serialized.geolocation,
      count: serialized.count,
      firstSeen: new Date(serialized.firstSeen),
      lastSeen: new Date(serialized.lastSeen),
      userAgents: new Set(serialized.userAgents),
      routes: new Set(serialized.routes),
      methods: new Set(serialized.methods),
      responseTimes: serialized.responseTimes,
      routeDetails: serialized.routeDetails.map(detail => ({
        ...detail,
        timestamp: new Date(detail.timestamp)
      }))
    };
  }

  /**
   * Save current statistics to disk
   */
  async saveStats(stats: Map<string, RequestStats>): Promise<void> {
    try {
      const statsData: SerializableRequestStats[] = Array.from(stats.values()).map(stat => 
        this.serializeStats(stat)
      );

      const dataFile = path.join(this.dataDir, 'current-stats.json');
      await fs.writeJson(dataFile, {
        timestamp: new Date().toISOString(),
        stats: statsData,
        totalEntries: statsData.length
      }, { spaces: 2 });

      logger.debug(`Statistics saved: ${statsData.length} entries`);
    } catch (error) {
      logger.error('Failed to save statistics', error);
    }
  }

  /**
   * Load persisted statistics from disk
   */
  async loadPersistedStats(): Promise<Map<string, RequestStats>> {
    const stats = new Map<string, RequestStats>();
    
    try {
      const dataFile = path.join(this.dataDir, 'current-stats.json');
      
      if (!await fs.pathExists(dataFile)) {
        logger.info('No existing statistics file found, starting fresh');
        return stats;
      }

      const data = await fs.readJson(dataFile);
      
      if (data.stats && Array.isArray(data.stats)) {
        for (const serializedStat of data.stats) {
          try {
            const stat = this.deserializeStats(serializedStat);
            stats.set(stat.ip, stat);
          } catch (error) {
            logger.warn('Failed to deserialize stat entry', { error, stat: serializedStat });
          }
        }
        
        logger.info(`Loaded ${stats.size} statistics entries from disk`);
      }
    } catch (error) {
      logger.error('Failed to load persisted statistics', error);
    }
    
    return stats;
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDirectory(): Promise<void> {
    try {
      await fs.ensureDir(this.dataDir);
      logger.debug(`Statistics data directory ensured: ${this.dataDir}`);
    } catch (error) {
      logger.error('Failed to create statistics data directory', error);
    }
  }

  /**
   * Clean up old statistics data
   */
  async cleanupOldStats(): Promise<void> {
    try {
      const dataFile = path.join(this.dataDir, 'current-stats.json');
      
      if (!await fs.pathExists(dataFile)) {
        return;
      }

      const data = await fs.readJson(dataFile);
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      if (data.stats && Array.isArray(data.stats)) {
        const filteredStats = data.stats.filter((stat: any) => {
          const lastSeen = new Date(stat.lastSeen).getTime();
          return lastSeen > cutoffTime;
        });
        
        if (filteredStats.length < data.stats.length) {
          await fs.writeJson(dataFile, {
            timestamp: new Date().toISOString(),
            stats: filteredStats,
            totalEntries: filteredStats.length
          }, { spaces: 2 });
          
          const removedCount = data.stats.length - filteredStats.length;
          logger.info(`Cleaned up ${removedCount} old statistics entries`);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old statistics', error);
    }
  }

  /**
   * Save a report to disk
   */
  async saveReport(report: any): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportFile = path.join(this.reportDir, `statistics-report-${timestamp}.json`);
      
      await fs.writeJson(reportFile, report, { spaces: 2 });
      logger.info(`Statistics report saved: ${reportFile}`);
    } catch (error) {
      logger.error('Failed to save statistics report', error);
    }
  }

  /**
   * Ensure report directory exists
   */
  async ensureReportDirectory(): Promise<void> {
    try {
      await fs.ensureDir(this.reportDir);
      logger.debug(`Statistics report directory ensured: ${this.reportDir}`);
    } catch (error) {
      logger.error('Failed to create statistics report directory', error);
    }
  }

  /**
   * Get data file size for statistics
   */
  async getDataFileSize(): Promise<number | undefined> {
    try {
      const dataFile = path.join(this.dataDir, 'current-stats.json');
      
      if (await fs.pathExists(dataFile)) {
        const stats = await fs.stat(dataFile);
        return stats.size;
      }
    } catch (error) {
      logger.error('Failed to get data file size', error);
    }
    
    return undefined;
  }

  /**
   * Get last saved timestamp
   */
  async getLastSavedTimestamp(): Promise<string | undefined> {
    try {
      const dataFile = path.join(this.dataDir, 'current-stats.json');
      
      if (await fs.pathExists(dataFile)) {
        const data = await fs.readJson(dataFile);
        return data.timestamp;
      }
    } catch (error) {
      logger.error('Failed to get last saved timestamp', error);
    }
    
    return undefined;
  }
} 