import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from '../utils/logger';
import { GeolocationInfo } from './geolocation';

export interface RequestStats {
  ip: string;
  geolocation: GeolocationInfo | null;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  userAgents: Set<string>;
  routes: Set<string>;
  methods: Set<string>;
  responseTimes: number[];
  routeDetails: Array<{
    domain: string;
    target: string;
    method: string;
    responseTime: number;
    timestamp: Date;
  }>;
}

// Serializable version of RequestStats for JSON persistence
export interface SerializableRequestStats {
  ip: string;
  geolocation: GeolocationInfo | null;
  count: number;
  firstSeen: string; // ISO string
  lastSeen: string; // ISO string
  userAgents: string[];
  routes: string[];
  methods: string[];
  responseTimes: number[];
  routeDetails: Array<{
    domain: string;
    target: string;
    method: string;
    responseTime: number;
    timestamp: string; // ISO string
  }>;
}

export interface StatisticsReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalRequests: number;
    uniqueIPs: number;
    uniqueCountries: number;
    uniqueCities: number;
    topCountries: Array<{ country: string; count: number; percentage: number }>;
    topCities: Array<{ city: string; country: string; count: number; percentage: number }>;
    topIPs: Array<{ ip: string; location: string; count: number; percentage: number }>;
    requestsByHour: Array<{ hour: number; count: number }>;
    requestsByDay: Array<{ day: string; count: number }>;
  };
  details: {
    byIP: Array<{
      ip: string;
      location: string;
      count: number;
      firstSeen: Date;
      lastSeen: Date;
      userAgents: string[];
      routes: string[];
      methods: string[];
      latitude: number | null;
      longitude: number | null;
    }>;
    byCountry: Array<{
      country: string;
      count: number;
      percentage: number;
      ips: string[];
    }>;
    byCity: Array<{
      city: string;
      country: string;
      count: number;
      percentage: number;
      ips: string[];
    }>;
  };
}

export interface RouteStats {
  name?: string; // Route name from configuration
  domain: string;
  target: string;
  requests: number;
  avgResponseTime: number;
  topCountries: Array<{
    country: string;
    city?: string;
    count: number;
    percentage: number;
  }>;
  uniqueIPs: number;
  methods: string[];
  uniquePaths?: string[];
}

export interface TimePeriodStats {
  totalRequests: number;
  uniqueRoutes: number;
  uniqueCountries: number;
  avgResponseTime: number;
  routes: RouteStats[];
  period: {
    start: Date;
    end: Date;
  };
}

export class StatisticsService {
  private static instance: StatisticsService;
  private stats: Map<string, RequestStats> = new Map();
  private reportInterval: NodeJS.Timeout | null = null;
  private reportDir: string;
  private dataDir: string;
  private isShuttingDown = false;
  private saveInterval: NodeJS.Timeout | null = null;

  constructor(reportDir?: string, dataDir?: string) {
    this.reportDir = reportDir || path.resolve(process.cwd(), 'logs', 'statistics');
    this.dataDir = dataDir || path.resolve(process.cwd(), 'data', 'statistics');
    this.ensureReportDirectory();
    this.ensureDataDirectory();
    this.loadPersistedStats();
    this.startPeriodicReporting();
    this.startPeriodicSaving();
  }

  public static getInstance(reportDir?: string, dataDir?: string): StatisticsService {
    if (!StatisticsService.instance) {
      StatisticsService.instance = new StatisticsService(reportDir, dataDir);
    }
    return StatisticsService.instance;
  }

  /**
   * Convert RequestStats to serializable format
   */
  private serializeStats(stats: RequestStats): SerializableRequestStats {
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
  private deserializeStats(serialized: SerializableRequestStats): RequestStats {
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
  private async saveStats(): Promise<void> {
    try {
      const statsData: SerializableRequestStats[] = Array.from(this.stats.values()).map(stat => 
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
      logger.error('Failed to save statistics:', error);
    }
  }

  /**
   * Load persisted statistics from disk
   */
  private async loadPersistedStats(): Promise<void> {
    try {
      const dataFile = path.join(this.dataDir, 'current-stats.json');
      
      if (await fs.pathExists(dataFile)) {
        const data = await fs.readJson(dataFile);
        
        if (data.stats && Array.isArray(data.stats)) {
          this.stats.clear();
          
          data.stats.forEach((serializedStat: SerializableRequestStats) => {
            const stat = this.deserializeStats(serializedStat);
            this.stats.set(stat.ip, stat);
          });
          
          logger.info(`Statistics loaded: ${data.stats.length} entries from ${data.timestamp}`);
        }
      }
    } catch (error) {
      logger.error('Failed to load persisted statistics:', error);
    }
  }

  /**
   * Ensure data directory exists
   */
  private async ensureDataDirectory(): Promise<void> {
    try {
      await fs.ensureDir(this.dataDir);
      logger.debug(`Statistics data directory ensured: ${this.dataDir}`);
    } catch (error) {
      logger.error('Failed to create statistics data directory:', error);
    }
  }

  /**
   * Start periodic saving of statistics
   */
  private startPeriodicSaving(): void {
    // Save every 5 minutes
    this.saveInterval = setInterval(() => {
      this.saveStats();
    }, 5 * 60 * 1000);
    
    logger.info('Periodic statistics saving started (every 5 minutes)');
  }

  /**
   * Clean up old statistics data
   */
  private async cleanupOldStats(): Promise<void> {
    try {
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      
      let cleanedCount = 0;
      for (const [ip, stat] of this.stats.entries()) {
        if (stat.lastSeen < cutoffDate) {
          this.stats.delete(ip);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} old statistics entries`);
        await this.saveStats();
      }
    } catch (error) {
      logger.error('Failed to cleanup old statistics:', error);
    }
  }

  /**
   * Record a request for statistics
   */
  public recordRequest(
    ip: string,
    geolocation: GeolocationInfo | null,
    route: string,
    method: string,
    userAgent: string,
    responseTime?: number,
    domain?: string,
    target?: string
  ): void {
    if (this.isShuttingDown) return;

    const now = new Date();
    const existing = this.stats.get(ip);

    if (existing) {
      // Update existing stats
      existing.count++;
      existing.lastSeen = now;
      existing.userAgents.add(userAgent);
      existing.routes.add(route);
      existing.methods.add(method);
      
      if (responseTime !== undefined) {
        existing.responseTimes.push(responseTime);
        // Keep only last 1000 response times to prevent memory issues
        if (existing.responseTimes.length > 1000) {
          existing.responseTimes = existing.responseTimes.slice(-1000);
        }
      }
      
      if (domain && target) {
        existing.routeDetails.push({
          domain,
          target,
          method,
          responseTime: responseTime || 0,
          timestamp: now,
        });
        // Keep only last 1000 route details
        if (existing.routeDetails.length > 1000) {
          existing.routeDetails = existing.routeDetails.slice(-1000);
        }
      }
    } else {
      // Create new stats entry
      this.stats.set(ip, {
        ip,
        geolocation,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        userAgents: new Set([userAgent]),
        routes: new Set([route]),
        methods: new Set([method]),
        responseTimes: responseTime !== undefined ? [responseTime] : [],
        routeDetails: domain && target ? [{
          domain,
          target,
          method,
          responseTime: responseTime || 0,
          timestamp: now,
        }] : [],
      });
    }
  }

  /**
   * Generate a statistics report for the current period
   */
  public generateReport(): StatisticsReport {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const statsArray = Array.from(this.stats.values());
    const totalRequests = statsArray.reduce((sum, stat) => sum + stat.count, 0);

    // Group by country
    const countryStats = new Map<string, { count: number; ips: Set<string> }>();
    statsArray.forEach(stat => {
      const country = stat.geolocation?.country || 'Unknown';
      const existing = countryStats.get(country);
      if (existing) {
        existing.count += stat.count;
        existing.ips.add(stat.ip);
      } else {
        countryStats.set(country, { count: stat.count, ips: new Set([stat.ip]) });
      }
    });

    // Group by city
    const cityStats = new Map<string, { count: number; country: string; ips: Set<string> }>();
    statsArray.forEach(stat => {
      const city = stat.geolocation?.city || 'Unknown';
      const country = stat.geolocation?.country || 'Unknown';
      const cityKey = `${city}, ${country}`;
      const existing = cityStats.get(cityKey);
      if (existing) {
        existing.count += stat.count;
        existing.ips.add(stat.ip);
      } else {
        cityStats.set(cityKey, { count: stat.count, country, ips: new Set([stat.ip]) });
      }
    });

    // Calculate top countries
    const topCountries = Array.from(countryStats.entries())
      .map(([country, data]) => ({
        country,
        count: data.count,
        percentage: (data.count / totalRequests) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate top cities
    const topCities = Array.from(cityStats.entries())
      .map(([cityKey, data]) => {
        const [city, country] = cityKey.split(', ');
        return {
          city,
          country,
          count: data.count,
          percentage: (data.count / totalRequests) * 100,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate top IPs
    const topIPs = statsArray
      .map(stat => ({
        ip: stat.ip,
        location: this.formatLocation(stat.geolocation),
        count: stat.count,
        percentage: (stat.count / totalRequests) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Generate hourly and daily breakdowns
    const requestsByHour = this.generateHourlyBreakdown(statsArray);
    const requestsByDay = this.generateDailyBreakdown(statsArray);

    return {
      period: {
        start: startOfDay,
        end: now,
      },
      summary: {
        totalRequests,
        uniqueIPs: statsArray.length,
        uniqueCountries: countryStats.size,
        uniqueCities: cityStats.size,
        topCountries,
        topCities,
        topIPs,
        requestsByHour,
        requestsByDay,
      },
      details: {
        byIP: statsArray.map(stat => ({
          ip: stat.ip,
          location: this.formatLocation(stat.geolocation),
          count: stat.count,
          firstSeen: stat.firstSeen,
          lastSeen: stat.lastSeen,
          userAgents: Array.from(stat.userAgents),
          routes: Array.from(stat.routes),
          methods: Array.from(stat.methods),
          latitude: stat.geolocation?.latitude ?? null,
          longitude: stat.geolocation?.longitude ?? null,
        })),
        byCountry: Array.from(countryStats.entries()).map(([country, data]) => ({
          country,
          count: data.count,
          percentage: (data.count / totalRequests) * 100,
          ips: Array.from(data.ips),
        })),
        byCity: Array.from(cityStats.entries()).map(([cityKey, data]) => {
          const [city, country] = cityKey.split(', ');
          return {
            city,
            country,
            count: data.count,
            percentage: (data.count / totalRequests) * 100,
            ips: Array.from(data.ips),
          };
        }),
      },
    };
  }

  /**
   * Generate hourly breakdown of requests
   */
  private generateHourlyBreakdown(statsArray: RequestStats[]): Array<{ hour: number; count: number }> {
    const hourlyStats = new Map<number, number>();
    
    // Initialize all hours with 0
    for (let hour = 0; hour < 24; hour++) {
      hourlyStats.set(hour, 0);
    }

    // Count requests by hour
    statsArray.forEach(stat => {
      const hour = stat.lastSeen.getHours();
      const current = hourlyStats.get(hour) || 0;
      hourlyStats.set(hour, current + stat.count);
    });

    return Array.from(hourlyStats.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);
  }

  /**
   * Generate daily breakdown of requests
   */
  private generateDailyBreakdown(statsArray: RequestStats[]): Array<{ day: string; count: number }> {
    const dailyStats = new Map<string, number>();
    
    statsArray.forEach(stat => {
      const day = stat.lastSeen.toISOString().split('T')[0]; // YYYY-MM-DD format
      const current = dailyStats.get(day) || 0;
      dailyStats.set(day, current + stat.count);
    });

    return Array.from(dailyStats.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }

  /**
   * Format location string for display
   */
  private formatLocation(geolocation: GeolocationInfo | null): string {
    if (!geolocation) return 'Unknown';
    
    const parts = [];
    if (geolocation.city) parts.push(geolocation.city);
    if (geolocation.region) parts.push(geolocation.region);
    if (geolocation.country) parts.push(geolocation.country);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown';
  }

  /**
   * Save report to file
   */
  private async saveReport(report: StatisticsReport): Promise<void> {
    try {
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `statistics-${timestamp}.json`;
      const filepath = path.join(this.reportDir, filename);

      await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf8');
      logger.info(`Statistics report saved: ${filepath}`);
    } catch (error) {
      logger.error('Failed to save statistics report', error);
    }
  }

  /**
   * Ensure report directory exists
   */
  private async ensureReportDirectory(): Promise<void> {
    try {
      await fs.ensureDir(this.reportDir);
      logger.info(`Statistics reports directory: ${this.reportDir}`);
    } catch (error) {
      logger.error('Failed to create statistics reports directory', error);
    }
  }

  /**
   * Start periodic reporting
   */
  private startPeriodicReporting(): void {
    // Calculate time until next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    // Schedule first report at midnight
    setTimeout(() => {
      this.generateAndSaveReport();
      
      // Then schedule daily reports
      this.reportInterval = setInterval(() => {
        this.generateAndSaveReport();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, timeUntilMidnight);

    logger.info(`Statistics reporting scheduled to start at ${tomorrow.toISOString()}`);
  }

  /**
   * Generate and save a report
   */
  private async generateAndSaveReport(): Promise<void> {
    try {
      const report = this.generateReport();
      await this.saveReport(report);
      
      // Log summary
      logger.info('Daily statistics report generated', {
        totalRequests: report.summary.totalRequests,
        uniqueIPs: report.summary.uniqueIPs,
        uniqueCountries: report.summary.uniqueCountries,
        topCountry: report.summary.topCountries[0]?.country || 'None',
        topCity: report.summary.topCities[0]?.city || 'None',
      });
      
      // Clean up old stats instead of clearing all
      await this.cleanupOldStats();
    } catch (error) {
      logger.error('Failed to generate statistics report', error);
    }
  }

  /**
   * Get current statistics (for API endpoints)
   */
  public getCurrentStats(): StatisticsReport {
    return this.generateReport();
  }

  /**
   * Get statistics summary
   */
  public getStatsSummary(): {
    totalRequests: number;
    uniqueIPs: number;
    uniqueCountries: number;
    cacheSize: number;
    lastSaved?: string;
    dataFileSize?: number;
  } {
    const statsArray = Array.from(this.stats.values());
    const totalRequests = statsArray.reduce((sum, stat) => sum + stat.count, 0);
    const uniqueCountries = new Set(statsArray.map(stat => stat.geolocation?.country).filter(Boolean)).size;

    const summary: {
      totalRequests: number;
      uniqueIPs: number;
      uniqueCountries: number;
      cacheSize: number;
      lastSaved?: string;
      dataFileSize?: number;
    } = {
      totalRequests,
      uniqueIPs: statsArray.length,
      uniqueCountries,
      cacheSize: this.stats.size,
    };

    // Try to get file info
    try {
      const dataFile = path.join(this.dataDir, 'current-stats.json');
      if (fs.existsSync(dataFile)) {
        const stats = fs.statSync(dataFile);
        summary.lastSaved = stats.mtime.toISOString();
        summary.dataFileSize = stats.size;
      }
    } catch (error) {
      // Ignore file errors
    }

    return summary;
  }

  /**
   * Shutdown the statistics service
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
    
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    
    // Save current statistics before shutting down
    await this.saveStats();
    
    // Generate final report
    await this.generateAndSaveReport();
    
    logger.info('Statistics service shutdown complete');
  }

  /**
   * Force save current statistics (for manual backup)
   */
  public async forceSave(): Promise<void> {
    await this.saveStats();
    logger.info('Statistics force saved');
  }

  /**
   * Generate statistics for a specific time period
   */
  public getTimePeriodStats(period: string, routeConfigs?: { domain: string; path?: string; target?: string; name?: string }[]): TimePeriodStats {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
    }

    // Filter stats for the time period
    const periodStats = Array.from(this.stats.values()).filter(stat => 
      stat.lastSeen >= startDate
    );

    // Collect all route details from the period
    const allRouteDetails = periodStats.flatMap(stat => 
      stat.routeDetails.filter(detail => detail.timestamp >= startDate)
    );

    // Group by domain and target
    const routeGroups = new Map<string, {
      domain: string;
      target: string;
      requests: number;
      responseTimes: number[];
      countries: Map<string, { count: number; cities: Set<string> }>;
      ips: Set<string>;
      methods: Set<string>;
      paths: Set<string>;
    }>();

    // Track unmatched requests
    const unmatchedPaths = new Set<string>();
    let unmatchedCount = 0;
    let unmatchedResponseTimes: number[] = [];
    let unmatchedIPs = new Set<string>();
    let unmatchedMethods = new Set<string>();
    let unmatchedCountries = new Map<string, { count: number; cities: Set<string> }>();

    allRouteDetails.forEach(detail => {
      // Try to match with routeConfigs
      let matched = false;
      if (routeConfigs) {
        matched = routeConfigs.some(cfg =>
          (cfg.domain === detail.domain && (cfg.target === detail.target || cfg.path === detail.target))
        );
      }
      if (!matched) {
        unmatchedCount++;
        unmatchedPaths.add(detail.target);
        unmatchedResponseTimes.push(detail.responseTime);
        unmatchedMethods.add(detail.method);
        // Find the IP and country
        const stat = periodStats.find(s =>
          s.routeDetails.some(rd =>
            rd.domain === detail.domain &&
            rd.target === detail.target &&
            rd.timestamp.getTime() === detail.timestamp.getTime()
          )
        );
        if (stat) {
          unmatchedIPs.add(stat.ip);
          if (stat.geolocation) {
            const country = stat.geolocation.country || 'Unknown';
            const city = stat.geolocation.city;
            const countryData = unmatchedCountries.get(country);
            if (countryData) {
              countryData.count++;
              if (city) countryData.cities.add(city);
            } else {
              unmatchedCountries.set(country, {
                count: 1,
                cities: city ? new Set([city]) : new Set()
              });
            }
          }
        }
        return;
      }
      const key = `${detail.domain}:${detail.target}`;
      const existing = routeGroups.get(key);
      
      if (existing) {
        existing.requests++;
        existing.responseTimes.push(detail.responseTime);
        existing.methods.add(detail.method);
        
        // Find the IP that made this request
        const stat = periodStats.find(s => 
          s.routeDetails.some(rd => 
            rd.domain === detail.domain && 
            rd.target === detail.target && 
            rd.timestamp.getTime() === detail.timestamp.getTime()
          )
        );
        
        if (stat) {
          existing.ips.add(stat.ip);
          
          if (stat.geolocation) {
            const country = stat.geolocation.country || 'Unknown';
            const city = stat.geolocation.city;
            
            const countryData = existing.countries.get(country);
            if (countryData) {
              countryData.count++;
              if (city) countryData.cities.add(city);
            } else {
              existing.countries.set(country, {
                count: 1,
                cities: city ? new Set([city]) : new Set()
              });
            }
          }
        }
      } else {
        const countries = new Map<string, { count: number; cities: Set<string> }>();
        const ips = new Set<string>();
        const methods = new Set<string>([detail.method]);
        
        // Find the IP that made this request
        const stat = periodStats.find(s => 
          s.routeDetails.some(rd => 
            rd.domain === detail.domain && 
            rd.target === detail.target && 
            rd.timestamp.getTime() === detail.timestamp.getTime()
          )
        );
        
        if (stat) {
          ips.add(stat.ip);
          
          if (stat.geolocation) {
            const country = stat.geolocation.country || 'Unknown';
            const city = stat.geolocation.city;
            
            countries.set(country, {
              count: 1,
              cities: city ? new Set([city]) : new Set()
            });
          }
        }
        
        routeGroups.set(key, {
          domain: detail.domain,
          target: detail.target,
          requests: 1,
          responseTimes: [detail.responseTime],
          countries,
          ips,
          methods,
          paths: new Set(),
        });
      }
    });

    // Convert to RouteStats format
    const routes: RouteStats[] = Array.from(routeGroups.values()).map(route => {
      const avgResponseTime = route.responseTimes.length > 0 
        ? route.responseTimes.reduce((sum, time) => sum + time, 0) / route.responseTimes.length 
        : 0;

      const topCountries = Array.from(route.countries.entries())
        .map(([country, data]) => ({
          country,
          count: data.count,
          percentage: (data.count / route.requests) * 100,
          city: data.cities.size > 0 ? Array.from(data.cities)[0] : undefined
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Find the route name from the config if available
      let routeName: string | undefined = undefined;
      if (routeConfigs) {
        const match = routeConfigs.find(cfg => cfg.domain === route.domain && (cfg.target === route.target || cfg.path === route.target));
        if (match) routeName = match.name;
      }

      return {
        name: routeName,
        domain: route.domain,
        target: route.target,
        requests: route.requests,
        avgResponseTime,
        topCountries,
        uniqueIPs: route.ips.size,
        methods: Array.from(route.methods),
      };
    });

    // Add unmatched requests as a special route card if any
    if (unmatchedCount > 0) {
      const unmatchedTopCountries = Array.from(unmatchedCountries.entries())
        .map(([country, data]) => ({
          country,
          count: data.count,
          percentage: (data.count / unmatchedCount) * 100,
          city: data.cities.size > 0 ? Array.from(data.cities)[0] : undefined
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      routes.push({
        name: 'Unmatched',
        domain: 'Unmatched',
        target: '',
        requests: unmatchedCount,
        avgResponseTime: unmatchedResponseTimes.length > 0 ? unmatchedResponseTimes.reduce((a, b) => a + b, 0) / unmatchedResponseTimes.length : 0,
        topCountries: unmatchedTopCountries,
        uniqueIPs: unmatchedIPs.size,
        methods: Array.from(unmatchedMethods),
        uniquePaths: Array.from(unmatchedPaths),
      });
    }

    // Sort routes by request count
    routes.sort((a, b) => b.requests - a.requests);

    // Calculate overall statistics
    const totalRequests = routes.reduce((sum, route) => sum + route.requests, 0);
    const uniqueCountries = new Set(
      periodStats
        .map(stat => stat.geolocation?.country)
        .filter(Boolean)
    ).size;
    
    const avgResponseTime = routes.length > 0 
      ? routes.reduce((sum, route) => sum + route.avgResponseTime, 0) / routes.length 
      : 0;

    return {
      totalRequests,
      uniqueRoutes: routes.length,
      uniqueCountries,
      avgResponseTime,
      routes,
      period: {
        start: startDate,
        end: now
      }
    };
  }

  public clearAll(): void {
    this.stats.clear();
    this.saveStats();
    logger.info('All statistics cleared');
  }
}

// Export a function to get the statistics service instance with configuration
export function getStatisticsService(reportDir?: string, dataDir?: string): StatisticsService {
  return StatisticsService.getInstance(reportDir, dataDir);
}

// For backward compatibility, export the default instance
export const statisticsService = StatisticsService.getInstance(); 