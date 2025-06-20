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

export class StatisticsService {
  private static instance: StatisticsService;
  private stats: Map<string, RequestStats> = new Map();
  private reportInterval: NodeJS.Timeout | null = null;
  private reportDir: string;
  private isShuttingDown = false;

  constructor() {
    this.reportDir = path.resolve(process.cwd(), 'logs', 'statistics');
    this.ensureReportDirectory();
    this.startPeriodicReporting();
  }

  public static getInstance(): StatisticsService {
    if (!StatisticsService.instance) {
      StatisticsService.instance = new StatisticsService();
    }
    return StatisticsService.instance;
  }

  /**
   * Record a request for statistics
   */
  public recordRequest(
    ip: string,
    geolocation: GeolocationInfo | null,
    route: string,
    method: string,
    userAgent: string
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
      
      // Clear stats for next period
      this.stats.clear();
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
  } {
    const statsArray = Array.from(this.stats.values());
    const totalRequests = statsArray.reduce((sum, stat) => sum + stat.count, 0);
    const uniqueCountries = new Set(statsArray.map(stat => stat.geolocation?.country).filter(Boolean)).size;

    return {
      totalRequests,
      uniqueIPs: statsArray.length,
      uniqueCountries,
      cacheSize: this.stats.size,
    };
  }

  /**
   * Shutdown the statistics service
   */
  public shutdown(): void {
    this.isShuttingDown = true;
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
    
    // Generate final report
    this.generateAndSaveReport();
    
    logger.info('Statistics service shutdown complete');
  }
}

export const statisticsService = StatisticsService.getInstance(); 