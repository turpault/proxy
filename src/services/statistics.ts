import * as fs from 'fs-extra';
import * as path from 'path';
import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';
import { GeolocationInfo } from './geolocation';
import { configService } from './config-service';
import { ProxyRoute, BunRequestContext } from '../types';

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
  requestTypes: Set<string>; // Track request types
  routeDetails: Array<{
    domain: string;
    target: string;
    method: string;
    responseTime: number;
    timestamp: Date;
    requestType: string; // Add request type to route details
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
  requestTypes: string[]; // Track request types
  routeDetails: Array<{
    domain: string;
    target: string;
    method: string;
    responseTime: number;
    timestamp: string; // ISO string
    requestType: string; // Add request type to route details
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
    requestTypes: Array<{ type: string; count: number; percentage: number }>; // Add request type breakdown
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
      requestTypes: string[]; // Add request types to IP details
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
  requestType: string; // Add request type to route stats
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

  private reportDir: string;
  private dataDir: string;
  private isShuttingDown = false;
  private db!: Database; // SQLite database instance
  public readonly SCHEMA_VERSION = 3; // Current schema version

  constructor() {
    // Get directories from configService
    const logsDir = configService.getSetting<string>('logsDir');
    this.reportDir = logsDir ? path.join(logsDir, 'statistics') : path.resolve(process.cwd(), 'logs', 'statistics');
    this.dataDir = configService.getSetting<string>('statsDir') || path.resolve(process.cwd(), 'data', 'statistics');

    this.ensureReportDirectory();
    this.ensureDataDirectory();
    this.initializeDatabase();
  }

  public static getInstance(): StatisticsService {
    if (!StatisticsService.instance) {
      throw new Error('StatisticsService not initialized. Call StatisticsService.initialize() first.');
    }
    return StatisticsService.instance;
  }

  public static initialize(): StatisticsService {
    if (!StatisticsService.instance) {
      StatisticsService.instance = new StatisticsService();
    }
    return StatisticsService.instance;
  }

  /**
 * Initialize SQLite database with versioning
 */
  private initializeDatabase(): void {
    try {
      const dbPath = path.join(this.dataDir, 'statistics.sqlite');
      this.db = new Database(dbPath);

      // Check and handle database versioning
      this.handleDatabaseVersioning();

      // Create tables if they don't exist
      this.createTables();

      // Create indexes for better performance
      this.createIndexes();

      logger.info(`SQLite database initialized: ${dbPath}`);
    } catch (error) {
      logger.error('Failed to initialize SQLite database:', error);
      throw error;
    }
  }

  /**
   * Handle database versioning and migrations
   */
  private handleDatabaseVersioning(): void {
    // Create version table if it doesn't exist
    this.db.run(`
      CREATE TABLE IF NOT EXISTS db_version (
        id INTEGER PRIMARY KEY,
        version INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Check current version
    const versionResult = this.db.query('SELECT version FROM db_version ORDER BY id DESC LIMIT 1').get() as any;
    const currentVersion = versionResult ? versionResult.version : 0;

    if (currentVersion !== this.SCHEMA_VERSION) {
      logger.info(`Database schema version mismatch. Current: ${currentVersion}, Required: ${this.SCHEMA_VERSION}`);

      if (currentVersion > 0) {
        // Backup existing data if upgrading
        this.backupExistingData();
      }

      // Drop all existing tables and recreate them
      this.dropAllTables();
      this.createTables();
      this.createIndexes();

      // Update version
      this.db.run('DELETE FROM db_version');
      this.db.run('INSERT INTO db_version (version) VALUES (?)', [this.SCHEMA_VERSION]);

      logger.info(`Database schema upgraded to version ${this.SCHEMA_VERSION}`);
    } else {
      logger.debug(`Database schema is up to date (version ${this.SCHEMA_VERSION})`);
    }
  }

  /**
   * Backup existing data before schema migration
   */
  private backupExistingData(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.dataDir, `statistics_backup_${timestamp}.sqlite`);

      // Create a backup by copying the database file
      const currentDbPath = path.join(this.dataDir, 'statistics.sqlite');
      if (fs.existsSync(currentDbPath)) {
        fs.copyFileSync(currentDbPath, backupPath);
        logger.info(`Database backup created: ${backupPath}`);
      } else {
        logger.warn('No existing database file found to backup');
      }
    } catch (error) {
      logger.warn('Failed to create database backup:', error);
    }
  }

  /**
 * Drop all existing tables
 */
  private dropAllTables(): void {
    const tables = [
      'geolocation_cities',
      'geolocation_countries',
      'requests',
      'route_configs'
    ];

    // Drop tables in reverse dependency order
    for (const table of tables) {
      try {
        this.db.run(`DROP TABLE IF EXISTS ${table}`);
      } catch (error) {
        logger.warn(`Failed to drop table ${table}:`, error);
      }
    }

    logger.info('All existing tables dropped for schema migration');
  }

  /**
   * Create all tables
   */
  private createTables(): void {
    // Create requests table (unified for matched and unmatched requests)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        domain TEXT NOT NULL,
        path TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER DEFAULT 200,
        response_time REAL DEFAULT 0,
        timestamp TEXT NOT NULL,
        user_agent TEXT,
        request_type TEXT DEFAULT 'proxy',
        route_name TEXT,
        target_url TEXT,
        query_string TEXT,
        headers_json TEXT,
        geolocation_json TEXT,
        is_matched BOOLEAN DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);



    // Create geolocation_countries table (country-based aggregation)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS geolocation_countries (
        country TEXT PRIMARY KEY,
        total_requests INTEGER DEFAULT 0,
        unique_ips INTEGER DEFAULT 0,
        avg_response_time REAL DEFAULT 0,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create geolocation_cities table (city-based aggregation)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS geolocation_cities (
        city TEXT NOT NULL,
        country TEXT NOT NULL,
        total_requests INTEGER DEFAULT 0,
        unique_ips INTEGER DEFAULT 0,
        avg_response_time REAL DEFAULT 0,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (city, country)
      )
    `);

    // Create route_configs table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS route_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        domain TEXT NOT NULL,
        path TEXT NOT NULL,
        target TEXT,
        type TEXT DEFAULT 'proxy',
        ssl BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(domain, path)
      )
    `);

    logger.info('All tables created successfully');
  }

  /**
 * Create all indexes
 */
  private createIndexes(): void {
    // Indexes for requests table
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_ip ON requests(ip)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_domain ON requests(domain)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_path ON requests(path)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_method ON requests(method)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status_code)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_matched ON requests(is_matched)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_route_name ON requests(route_name)`);



    // Indexes for geolocation tables
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_geolocation_countries_last_seen ON geolocation_countries(last_seen)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_geolocation_cities_last_seen ON geolocation_cities(last_seen)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_geolocation_cities_country ON geolocation_cities(country)`);

    // Indexes for route configs
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_route_configs_domain ON route_configs(domain)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_route_configs_path ON route_configs(path)`);

    logger.info('All indexes created successfully');
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
      requestTypes: Array.from(stats.requestTypes),
      routeDetails: stats.routeDetails.map(detail => ({
        ...detail,
        timestamp: detail.timestamp.toISOString(),
        requestType: detail.requestType
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
      requestTypes: new Set(serialized.requestTypes),
      routeDetails: serialized.routeDetails.map(detail => ({
        ...detail,
        timestamp: new Date(detail.timestamp),
        requestType: detail.requestType
      }))
    };
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
   * Clean up old statistics data
   */
  private async cleanupOldStats(): Promise<void> {
    try {
      if (!this.db) {
        logger.error('Database not initialized');
        return;
      }

      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      const cutoffISO = cutoffDate.toISOString();

      // Delete old data from all tables
      const deletedRequests = this.db.query(
        'DELETE FROM requests WHERE timestamp < ?'
      ).run(cutoffISO).changes;

      const deletedCountries = this.db.query(
        'DELETE FROM geolocation_countries WHERE last_seen < ?'
      ).run(cutoffISO).changes;

      const deletedCities = this.db.query(
        'DELETE FROM geolocation_cities WHERE last_seen < ?'
      ).run(cutoffISO).changes;

      // Reload stats from database to sync memory
      await this.loadPersistedStats();

      const totalDeleted = deletedRequests + deletedCountries + deletedCities;
      if (totalDeleted > 0) {
        logger.info(`Cleaned up ${deletedRequests} old requests, ${deletedCountries} country entries, and ${deletedCities} city entries`);
      }
    } catch (error) {
      logger.error('Failed to cleanup old statistics:', error);
    }
  }

  /**
   * Sync route configurations to database
   */
  public syncRouteConfigs(routes: ProxyRoute[]): void {
    try {
      if (!this.db) return;

      // Clear existing route configs
      this.db.run('DELETE FROM route_configs');

      // Insert current route configs
      for (const route of routes) {
        this.db.run(`
          INSERT INTO route_configs (name, domain, path, target, type, ssl)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          route.name || null,
          route.domain,
          route.path || '/',
          route.target || null,
          route.type || 'proxy',
          route.ssl ? 1 : 0
        ]);
      }

      logger.info(`Synced ${routes.length} route configurations to database`);
    } catch (error) {
      logger.error('Failed to sync route configurations:', error);
    }
  }

  /**
   * Record a request for statistics
   */
  public recordRequest(
    requestContext: BunRequestContext,
    route: ProxyRoute | null,
    responseTime?: number,
    response?: Response
  ): void {
    if (this.isShuttingDown) return;

    // Extract additional request information
    const url = new URL(requestContext.url);
    const path = url.pathname;
    const queryStr = url.search;
    const statusCode = response?.status || 200;
    const headers = requestContext.headers;

    // Store detailed request information in database
    this.storeDetailedRequest(requestContext, route, responseTime, response, path, queryStr, statusCode, headers);
  }

  /**
   * Store detailed request information in database
   */
  private storeDetailedRequest(
    requestContext: BunRequestContext,
    route: ProxyRoute | null,
    responseTime: number | undefined,
    response: Response | undefined,
    path: string,
    queryString: string,
    statusCode: number,
    headers: Record<string, string>
  ): void {
    try {
      if (!this.db) return;

      const now = new Date().toISOString();
      const url = new URL(requestContext.url);
      const domain = url.hostname;
      const isMatched = route ? 1 : 0;

      // Store in unified requests table
      this.db.run(`
        INSERT INTO requests (
          ip, domain, path, method, status_code, response_time, timestamp,
          user_agent, request_type, route_name, target_url, query_string, headers_json, geolocation_json, is_matched
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        requestContext.ip,
        domain,
        path,
        requestContext.method,
        statusCode,
        responseTime || 0,
        now,
        requestContext.userAgent,
        route?.type || 'proxy',
        route?.name || null,
        route?.target || null,
        queryString,
        JSON.stringify(headers),
        JSON.stringify(requestContext.geolocation),
        isMatched
      ]);

      // Update geolocation aggregation tables
      this.updateGeolocationAggregation(requestContext, responseTime || 0, now);
    } catch (error) {
      logger.error('Failed to store detailed request in database:', error);
    }
  }

  /**
   * Update geolocation aggregation tables
   */
  private updateGeolocationAggregation(
    requestContext: BunRequestContext,
    responseTime: number,
    timestamp: string
  ): void {
    try {
      if (!requestContext.geolocation) return;

      const { country, city } = requestContext.geolocation;
      if (!country) return;

      // Update country aggregation
      this.db.run(`
        INSERT INTO geolocation_countries (country, total_requests, unique_ips, avg_response_time, first_seen, last_seen)
        VALUES (?, 1, 1, ?, ?, ?)
        ON CONFLICT(country) DO UPDATE SET
          total_requests = total_requests + 1,
          avg_response_time = (avg_response_time * total_requests + ?) / (total_requests + 1),
          last_seen = ?,
          updated_at = datetime('now')
      `, [country, responseTime, timestamp, timestamp, responseTime, timestamp]);

      // Update unique IPs for country
      this.db.run(`
        UPDATE geolocation_countries 
        SET unique_ips = (
          SELECT COUNT(DISTINCT ip) 
          FROM requests 
          WHERE json_extract(geolocation_json, '$.country') = ?
        )
        WHERE country = ?
      `, [country, country]);

      // Update city aggregation if city exists
      if (city) {
        this.db.run(`
          INSERT INTO geolocation_cities (city, country, total_requests, unique_ips, avg_response_time, first_seen, last_seen)
          VALUES (?, ?, 1, 1, ?, ?, ?)
          ON CONFLICT(city, country) DO UPDATE SET
            total_requests = total_requests + 1,
            avg_response_time = (avg_response_time * total_requests + ?) / (total_requests + 1),
            last_seen = ?,
            updated_at = datetime('now')
        `, [city, country, responseTime, timestamp, timestamp, responseTime, timestamp]);

        // Update unique IPs for city
        this.db.run(`
          UPDATE geolocation_cities 
          SET unique_ips = (
            SELECT COUNT(DISTINCT ip) 
            FROM requests 
            WHERE json_extract(geolocation_json, '$.city') = ? 
            AND json_extract(geolocation_json, '$.country') = ?
          )
          WHERE city = ? AND country = ?
        `, [city, country, city, country]);
      }
    } catch (error) {
      logger.error('Failed to update geolocation aggregation:', error);
    }
  }

  /**
   * Generate a statistics report for the current period
   */
  public generateReport(): StatisticsReport {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    try {
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      // Get total requests for today
      const totalRequestsResult = this.db.query(`
        SELECT COUNT(*) as total
        FROM requests 
        WHERE DATE(timestamp) = DATE(?)
      `).get(startOfDay.toISOString()) as any;
      const totalRequests = totalRequestsResult?.total || 0;

      // Get top countries
      const topCountries = this.db.query(`
        SELECT 
          json_extract(geolocation_json, '$.country') as country,
          COUNT(*) as count
        FROM requests 
        WHERE DATE(timestamp) = DATE(?)
        GROUP BY country
        ORDER BY count DESC
        LIMIT 10
      `).all(startOfDay.toISOString()) as any[];

      // Get top cities
      const topCities = this.db.query(`
        SELECT 
          json_extract(geolocation_json, '$.city') as city,
          json_extract(geolocation_json, '$.country') as country,
          COUNT(*) as count
        FROM requests 
        WHERE DATE(timestamp) = DATE(?)
        GROUP BY city, country
        ORDER BY count DESC
        LIMIT 10
      `).all(startOfDay.toISOString()) as any[];

      // Get top IPs
      const topIPs = this.db.query(`
        SELECT 
          ip,
          geolocation_json,
          COUNT(*) as count
        FROM requests 
        WHERE DATE(timestamp) = DATE(?)
        GROUP BY ip
        ORDER BY count DESC
        LIMIT 10
      `).all(startOfDay.toISOString()) as any[];

      // Get request types
      const requestTypes = this.db.query(`
        SELECT 
          request_type as type,
          COUNT(*) as count
        FROM requests 
        WHERE DATE(timestamp) = DATE(?)
        GROUP BY request_type
        ORDER BY count DESC
      `).all(startOfDay.toISOString()) as any[];

      // Generate hourly and daily breakdowns
      const requestsByHour = this.generateHourlyBreakdownFromDB(startOfDay);
      const requestsByDay = this.generateDailyBreakdownFromDB(startOfDay);

      return {
        period: {
          start: startOfDay,
          end: now,
        },
        summary: {
          totalRequests,
          uniqueIPs: topIPs.length,
          uniqueCountries: topCountries.length,
          uniqueCities: topCities.length,
          topCountries: topCountries.map(country => ({
            country: country.country || 'Unknown',
            count: country.count,
            percentage: (country.count / totalRequests) * 100,
          })),
          topCities: topCities.map(city => ({
            city: city.city || 'Unknown',
            country: city.country || 'Unknown',
            count: city.count,
            percentage: (city.count / totalRequests) * 100,
          })),
          topIPs: topIPs.map(ip => ({
            ip: ip.ip,
            location: this.formatLocation(JSON.parse(ip.geolocation_json || '{}')),
            count: ip.count,
            percentage: (ip.count / totalRequests) * 100,
          })),
          requestsByHour,
          requestsByDay,
        },
        requestTypes: requestTypes.map(type => ({
          type: type.type,
          count: type.count,
          percentage: (type.count / totalRequests) * 100,
        })),
        generatedAt: now.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to generate report from database:', error);
      return {
        period: {
          start: startOfDay.toISOString(),
          end: now.toISOString(),
        },
        summary: {
          totalRequests: 0,
          uniqueIPs: 0,
          uniqueCountries: 0,
          uniqueCities: 0,
        },
        topCountries: [],
        topCities: [],
        topIPs: [],
        requestTypes: [],
        requestsByHour: [],
        requestsByDay: [],
        generatedAt: now.toISOString(),
      };
    }
  }

  /**
   * Generate hourly breakdown of requests from database
   */
  private generateHourlyBreakdownFromDB(startDate: Date): Array<{ hour: number; count: number }> {
    try {
      if (!this.db) return [];

      const hourlyStats = new Map<number, number>();

      // Initialize all hours with 0
      for (let hour = 0; hour < 24; hour++) {
        hourlyStats.set(hour, 0);
      }

      // Get hourly breakdown from database
      const hourlyData = this.db.query(`
        SELECT 
          CAST(strftime('%H', timestamp) AS INTEGER) as hour,
          COUNT(*) as count
        FROM requests 
        WHERE DATE(timestamp) = DATE(?)
        GROUP BY hour
        ORDER BY hour
      `).all(startDate.toISOString()) as any[];

      // Update the map with actual data
      hourlyData.forEach(row => {
        hourlyStats.set(row.hour, row.count);
      });

      return Array.from(hourlyStats.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => a.hour - b.hour);
    } catch (error) {
      logger.error('Failed to generate hourly breakdown from database:', error);
      return [];
    }
  }

  /**
   * Generate daily breakdown of requests from database
   */
  private generateDailyBreakdownFromDB(startDate: Date): Array<{ day: string; count: number }> {
    try {
      if (!this.db) return [];

      const dailyData = this.db.query(`
        SELECT 
          DATE(timestamp) as day,
          COUNT(*) as count
        FROM requests 
        WHERE timestamp >= ?
        GROUP BY day
        ORDER BY day
      `).all(startDate.toISOString()) as any[];

      return dailyData.map(row => ({
        day: row.day,
        count: row.count
      }));
    } catch (error) {
      logger.error('Failed to generate daily breakdown from database:', error);
      return [];
    }
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
   * Get current database version
   */
  public getDatabaseVersion(): number {
    try {
      if (!this.db) return 0;

      const versionResult = this.db.query('SELECT version FROM db_version ORDER BY id DESC LIMIT 1').get() as any;
      return versionResult ? versionResult.version : 0;
    } catch (error) {
      logger.error('Failed to get database version:', error);
      return 0;
    }
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
    databaseVersion: number;
    schemaVersion: number;
  } {
    try {
      if (!this.db) {
        return {
          totalRequests: 0,
          uniqueIPs: 0,
          uniqueCountries: 0,
          cacheSize: 0,
          databaseVersion: this.getDatabaseVersion(),
          schemaVersion: this.SCHEMA_VERSION,
        };
      }

      // Get total requests
      const totalRequestsResult = this.db.query('SELECT COUNT(*) as total FROM requests').get() as any;
      const totalRequests = totalRequestsResult?.total || 0;

      // Get unique IPs
      const uniqueIPsResult = this.db.query('SELECT COUNT(DISTINCT ip) as unique_ips FROM requests').get() as any;
      const uniqueIPs = uniqueIPsResult?.unique_ips || 0;

      // Get unique countries
      const uniqueCountriesResult = this.db.query(`
        SELECT COUNT(DISTINCT json_extract(geolocation_json, '$.country')) as unique_countries 
        FROM requests 
        WHERE json_extract(geolocation_json, '$.country') IS NOT NULL
      `).get() as any;
      const uniqueCountries = uniqueCountriesResult?.unique_countries || 0;

      const summary: {
        totalRequests: number;
        uniqueIPs: number;
        uniqueCountries: number;
        cacheSize: number;
        lastSaved?: string;
        dataFileSize?: number;
        databaseVersion: number;
        schemaVersion: number;
      } = {
        totalRequests,
        uniqueIPs,
        uniqueCountries,
        cacheSize: 0, // No longer using in-memory cache
        databaseVersion: this.getDatabaseVersion(),
        schemaVersion: this.SCHEMA_VERSION,
      };

      // Try to get database file info
      try {
        const dbFile = path.join(this.dataDir, 'statistics.sqlite');
        if (fs.existsSync(dbFile)) {
          const stats = fs.statSync(dbFile);
          summary.lastSaved = stats.mtime.toISOString();
          summary.dataFileSize = stats.size;
        }
      } catch (error) {
        // Ignore file errors
      }

      return summary;
    } catch (error) {
      logger.error('Failed to get stats summary from database:', error);
      return {
        totalRequests: 0,
        uniqueIPs: 0,
        uniqueCountries: 0,
        cacheSize: 0,
        databaseVersion: this.getDatabaseVersion(),
        schemaVersion: this.SCHEMA_VERSION,
      };
    }
  }

  /**
   * Get per-route statistics using SQLite queries
   */
  public getPerRouteStats(period: string = '24h', limit: number = 50): Array<{
    routeName: string | null;
    domain: string;
    path: string;
    target: string | null;
    requestType: string;
    totalRequests: number;
    avgResponseTime: number;
    uniqueIPs: number;
    uniqueCountries: number;
    topCountries: Array<{ country: string; count: number; percentage: number }>;
    methods: string[];
    statusCodes: Array<{ code: number; count: number; percentage: number }>;
    topPaths: Array<{ path: string; count: number; percentage: number }>;
  }> {
    try {
      if (!this.db) return [];

      const startDate = this.getStartDateForPeriod(period);
      const startISO = startDate.toISOString();

      // Get route statistics
      const routeStats = this.db.query(`
        SELECT 
          route_name,
          domain,
          path,
          target_url,
          request_type,
          COUNT(*) as total_requests,
          AVG(response_time) as avg_response_time,
          COUNT(DISTINCT ip) as unique_ips,
          COUNT(DISTINCT json_extract(geolocation_json, '$.country')) as unique_countries
        FROM requests 
        WHERE timestamp >= ? AND route_name IS NOT NULL AND is_matched = 1
        GROUP BY route_name, domain, path, target_url, request_type
        ORDER BY total_requests DESC
        LIMIT ?
      `).all(startISO, limit) as any[];

      return routeStats.map(route => {
        // Get top countries for this route
        const topCountries = this.db.query(`
          SELECT 
            json_extract(geolocation_json, '$.country') as country,
            COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND route_name = ? AND domain = ? AND path = ? AND is_matched = 1
          GROUP BY country
          ORDER BY count DESC
          LIMIT 5
        `).all(startISO, route.route_name, route.domain, route.path) as any[];

        // Get methods for this route
        const methods = this.db.query(`
          SELECT DISTINCT method
          FROM requests 
          WHERE timestamp >= ? AND route_name = ? AND domain = ? AND path = ? AND is_matched = 1
        `).all(startISO, route.route_name, route.domain, route.path) as any[];

        // Get status codes for this route
        const statusCodes = this.db.query(`
          SELECT 
            status_code as code,
            COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND route_name = ? AND domain = ? AND path = ? AND is_matched = 1
          GROUP BY status_code
          ORDER BY count DESC
        `).all(startISO, route.route_name, route.domain, route.path) as any[];

        // Get top paths for this route
        const topPaths = this.db.query(`
          SELECT 
            path,
            COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND route_name = ? AND domain = ? AND is_matched = 1
          GROUP BY path
          ORDER BY count DESC
          LIMIT 10
        `).all(startISO, route.route_name, route.domain) as any[];

        const totalRequests = route.total_requests;

        return {
          routeName: route.route_name,
          domain: route.domain,
          path: route.path,
          target: route.target_url,
          requestType: route.request_type,
          totalRequests,
          avgResponseTime: route.avg_response_time || 0,
          uniqueIPs: route.unique_ips,
          uniqueCountries: route.unique_countries,
          topCountries: topCountries.map(c => ({
            country: c.country || 'Unknown',
            count: c.count,
            percentage: (c.count / totalRequests) * 100
          })),
          methods: methods.map(m => m.method),
          statusCodes: statusCodes.map(s => ({
            code: s.code,
            count: s.count,
            percentage: (s.count / totalRequests) * 100
          })),
          topPaths: topPaths.map(p => ({
            path: p.path,
            count: p.count,
            percentage: (p.count / totalRequests) * 100
          }))
        };
      });
    } catch (error) {
      logger.error('Failed to get per-route statistics:', error);
      return [];
    }
  }

  /**
   * Get unmatched route statistics using SQLite queries
   */
  public getUnmatchedRouteStats(period: string = '24h', limit: number = 50): Array<{
    domain: string;
    path: string;
    totalRequests: number;
    avgResponseTime: number;
    uniqueIPs: number;
    uniqueCountries: number;
    topCountries: Array<{ country: string; count: number; percentage: number }>;
    methods: string[];
    statusCodes: Array<{ code: number; count: number; percentage: number }>;
    topUserAgents: Array<{ userAgent: string; count: number; percentage: number }>;
    recentRequests: Array<{
      timestamp: string;
      ip: string;
      method: string;
      statusCode: number;
      userAgent: string;
      country: string;
    }>;
  }> {
    try {
      if (!this.db) return [];

      const startDate = this.getStartDateForPeriod(period);
      const startISO = startDate.toISOString();

      // Get unmatched route statistics
      const unmatchedStats = this.db.query(`
        SELECT 
          domain,
          path,
          COUNT(*) as total_requests,
          AVG(response_time) as avg_response_time,
          COUNT(DISTINCT ip) as unique_ips,
          COUNT(DISTINCT json_extract(geolocation_json, '$.country')) as unique_countries
        FROM requests 
        WHERE timestamp >= ? AND is_matched = 0
        GROUP BY domain, path
        ORDER BY total_requests DESC
        LIMIT ?
      `).all(startISO, limit) as any[];

      return unmatchedStats.map(route => {
        // Get top countries for this unmatched route
        const topCountries = this.db.query(`
          SELECT 
            json_extract(geolocation_json, '$.country') as country,
            COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND path = ? AND is_matched = 0
          GROUP BY country
          ORDER BY count DESC
          LIMIT 5
        `).all(startISO, route.domain, route.path) as any[];

        // Get methods for this unmatched route
        const methods = this.db.query(`
          SELECT DISTINCT method
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND path = ? AND is_matched = 0
        `).all(startISO, route.domain, route.path) as any[];

        // Get status codes for this unmatched route
        const statusCodes = this.db.query(`
          SELECT 
            status_code as code,
            COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND path = ? AND is_matched = 0
          GROUP BY status_code
          ORDER BY count DESC
        `).all(startISO, route.domain, route.path) as any[];

        // Get top user agents for this unmatched route
        const topUserAgents = this.db.query(`
          SELECT 
            user_agent,
            COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND path = ? AND is_matched = 0
          GROUP BY user_agent
          ORDER BY count DESC
          LIMIT 10
        `).all(startISO, route.domain, route.path) as any[];

        // Get recent requests for this unmatched route
        const recentRequests = this.db.query(`
          SELECT 
            timestamp,
            ip,
            method,
            status_code,
            user_agent,
            json_extract(geolocation_json, '$.country') as country
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND path = ? AND is_matched = 0
          ORDER BY timestamp DESC
          LIMIT 20
        `).all(startISO, route.domain, route.path) as any[];

        const totalRequests = route.total_requests;

        return {
          domain: route.domain,
          path: route.path,
          totalRequests,
          avgResponseTime: route.avg_response_time || 0,
          uniqueIPs: route.unique_ips,
          uniqueCountries: route.unique_countries,
          topCountries: topCountries.map(c => ({
            country: c.country || 'Unknown',
            count: c.count,
            percentage: (c.count / totalRequests) * 100
          })),
          methods: methods.map(m => m.method),
          statusCodes: statusCodes.map(s => ({
            code: s.code,
            count: s.count,
            percentage: (s.count / totalRequests) * 100
          })),
          topUserAgents: topUserAgents.map(ua => ({
            userAgent: ua.user_agent || 'Unknown',
            count: ua.count,
            percentage: (ua.count / totalRequests) * 100
          })),
          recentRequests: recentRequests.map(req => ({
            timestamp: req.timestamp,
            ip: req.ip,
            method: req.method,
            statusCode: req.status_code,
            userAgent: req.user_agent || 'Unknown',
            country: req.country || 'Unknown'
          }))
        };
      });
    } catch (error) {
      logger.error('Failed to get unmatched route statistics:', error);
      return [];
    }
  }

  /**
   * Get domain-based statistics
   */
  public getDomainStats(period: string = '24h'): Array<{
    domain: string;
    totalRequests: number;
    matchedRequests: number;
    unmatchedRequests: number;
    avgResponseTime: number;
    uniqueIPs: number;
    uniqueCountries: number;
    topRoutes: Array<{ routeName: string | null; path: string; count: number; percentage: number }>;
    topUnmatchedPaths: Array<{ path: string; count: number; percentage: number }>;
  }> {
    try {
      if (!this.db) return [];

      const startDate = this.getStartDateForPeriod(period);
      const startISO = startDate.toISOString();

      // Get domain statistics
      const domainStats = this.db.query(`
        SELECT 
          domain,
          COUNT(*) as total_requests,
          AVG(response_time) as avg_response_time,
          COUNT(DISTINCT ip) as unique_ips,
          COUNT(DISTINCT json_extract(geolocation_json, '$.country')) as unique_countries
        FROM requests 
        WHERE timestamp >= ?
        GROUP BY domain
        ORDER BY total_requests DESC
      `).all(startISO) as any[];

      return domainStats.map(domain => {
        // Get matched requests count
        const matchedRequests = this.db.query(`
          SELECT COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND is_matched = 1
        `).get(startISO, domain.domain) as any;

        // Get unmatched requests count
        const unmatchedRequests = this.db.query(`
          SELECT COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND is_matched = 0
        `).get(startISO, domain.domain) as any;

        // Get top routes for this domain
        const topRoutes = this.db.query(`
          SELECT 
            route_name,
            path,
            COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND is_matched = 1
          GROUP BY route_name, path
          ORDER BY count DESC
          LIMIT 10
        `).all(startISO, domain.domain) as any[];

        // Get top unmatched paths for this domain
        const topUnmatchedPaths = this.db.query(`
          SELECT 
            path,
            COUNT(*) as count
          FROM requests 
          WHERE timestamp >= ? AND domain = ? AND is_matched = 0
          GROUP BY path
          ORDER BY count DESC
          LIMIT 10
        `).all(startISO, domain.domain) as any[];

        const totalRequests = domain.total_requests;
        const matchedCount = matchedRequests?.count || 0;
        const unmatchedCount = unmatchedRequests?.count || 0;

        return {
          domain: domain.domain,
          totalRequests,
          matchedRequests: matchedCount,
          unmatchedRequests: unmatchedCount,
          avgResponseTime: domain.avg_response_time || 0,
          uniqueIPs: domain.unique_ips,
          uniqueCountries: domain.unique_countries,
          topRoutes: topRoutes.map(r => ({
            routeName: r.route_name,
            path: r.path,
            count: r.count,
            percentage: (r.count / totalRequests) * 100
          })),
          topUnmatchedPaths: topUnmatchedPaths.map(p => ({
            path: p.path,
            count: p.count,
            percentage: (p.count / totalRequests) * 100
          }))
        };
      });
    } catch (error) {
      logger.error('Failed to get domain statistics:', error);
      return [];
    }
  }

  /**
   * Get detailed request history for a specific route
   */
  public getRouteRequestHistory(
    routeName: string,
    domain: string,
    path: string,
    period: string = '24h',
    limit: number = 100
  ): Array<{
    timestamp: string;
    ip: string;
    method: string;
    statusCode: number;
    responseTime: number;
    userAgent: string;
    country: string;
    city: string;
    queryString: string;
    headers: Record<string, string>;
  }> {
    try {
      if (!this.db) return [];

      const startDate = this.getStartDateForPeriod(period);
      const startISO = startDate.toISOString();

      const requests = this.db.query(`
        SELECT 
          timestamp,
          ip,
          method,
          status_code,
          response_time,
          user_agent,
          json_extract(geolocation_json, '$.country') as country,
          json_extract(geolocation_json, '$.city') as city,
          query_string,
          headers_json
        FROM requests 
        WHERE timestamp >= ? AND route_name = ? AND domain = ? AND path = ? AND is_matched = 1
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(startISO, routeName, domain, path, limit) as any[];

      return requests.map(req => ({
        timestamp: req.timestamp,
        ip: req.ip,
        method: req.method,
        statusCode: req.status_code,
        responseTime: req.response_time,
        userAgent: req.user_agent || 'Unknown',
        country: req.country || 'Unknown',
        city: req.city || 'Unknown',
        queryString: req.query_string || '',
        headers: req.headers_json ? JSON.parse(req.headers_json) : {}
      }));
    } catch (error) {
      logger.error('Failed to get route request history:', error);
      return [];
    }
  }

  /**
   * Get detailed request history for unmatched requests
   */
  public getUnmatchedRequestHistory(
    domain: string,
    path: string,
    period: string = '24h',
    limit: number = 100
  ): Array<{
    timestamp: string;
    ip: string;
    method: string;
    statusCode: number;
    responseTime: number;
    userAgent: string;
    country: string;
    city: string;
    queryString: string;
    headers: Record<string, string>;
  }> {
    try {
      if (!this.db) return [];

      const startDate = this.getStartDateForPeriod(period);
      const startISO = startDate.toISOString();

      const requests = this.db.query(`
        SELECT 
          timestamp,
          ip,
          method,
          status_code,
          response_time,
          user_agent,
          json_extract(geolocation_json, '$.country') as country,
          json_extract(geolocation_json, '$.city') as city,
          query_string,
          headers_json
        FROM unmatched_requests 
        WHERE timestamp >= ? AND domain = ? AND path = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(startISO, domain, path, limit) as any[];

      return requests.map(req => ({
        timestamp: req.timestamp,
        ip: req.ip,
        method: req.method,
        statusCode: req.status_code,
        responseTime: req.response_time,
        userAgent: req.user_agent || 'Unknown',
        country: req.country || 'Unknown',
        city: req.city || 'Unknown',
        queryString: req.query_string || '',
        headers: req.headers_json ? JSON.parse(req.headers_json) : {}
      }));
    } catch (error) {
      logger.error('Failed to get unmatched request history:', error);
      return [];
    }
  }

  /**
   * Helper method to get start date for a given period
   */
  private getStartDateForPeriod(period: string): Date {
    const now = new Date();
    switch (period) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '6h':
        return new Date(now.getTime() - 6 * 60 * 60 * 1000);
      case '12h':
        return new Date(now.getTime() - 12 * 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
    }
  }

  /**
   * Shutdown the statistics service
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Close database connection
    if (this.db) {
      this.db.close();
    }

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
   * Get geolocation statistics by country
   */
  public getCountryStats(period: string = '24h', limit: number = 50): Array<{
    country: string;
    totalRequests: number;
    uniqueIPs: number;
    avgResponseTime: number;
    firstSeen: string;
    lastSeen: string;
    topCities: Array<{ city: string; count: number; percentage: number }>;
    topRoutes: Array<{ routeName: string | null; count: number; percentage: number }>;
  }> {
    try {
      if (!this.db) return [];

      const startDate = this.getStartDateForPeriod(period);
      const startISO = startDate.toISOString();

      // Get country statistics from aggregation table
      const countryStats = this.db.query(`
        SELECT 
          country,
          total_requests,
          unique_ips,
          avg_response_time,
          first_seen,
          last_seen
        FROM geolocation_countries 
        WHERE last_seen >= ?
        ORDER BY total_requests DESC
        LIMIT ?
      `).all(startISO, limit) as any[];

      return countryStats.map(country => {
        // Get top cities for this country
        const topCities = this.db.query(`
          SELECT 
            city,
            total_requests as count
          FROM geolocation_cities 
          WHERE country = ? AND last_seen >= ?
          ORDER BY total_requests DESC
          LIMIT 10
        `).all(country.country, startISO) as any[];

        // Get top routes for this country
        const topRoutes = this.db.query(`
          SELECT 
            route_name,
            COUNT(*) as count
          FROM requests 
          WHERE json_extract(geolocation_json, '$.country') = ? AND timestamp >= ?
          GROUP BY route_name
          ORDER BY count DESC
          LIMIT 10
        `).all(country.country, startISO) as any[];

        const totalRequests = country.total_requests;

        return {
          country: country.country,
          totalRequests,
          uniqueIPs: country.unique_ips,
          avgResponseTime: country.avg_response_time || 0,
          firstSeen: country.first_seen,
          lastSeen: country.last_seen,
          topCities: topCities.map(c => ({
            city: c.city,
            count: c.count,
            percentage: (c.count / totalRequests) * 100
          })),
          topRoutes: topRoutes.map(r => ({
            routeName: r.route_name,
            count: r.count,
            percentage: (r.count / totalRequests) * 100
          }))
        };
      });
    } catch (error) {
      logger.error('Failed to get country statistics:', error);
      return [];
    }
  }

  /**
   * Get geolocation statistics by city
   */
  public getCityStats(period: string = '24h', limit: number = 50): Array<{
    city: string;
    country: string;
    totalRequests: number;
    uniqueIPs: number;
    avgResponseTime: number;
    firstSeen: string;
    lastSeen: string;
    topRoutes: Array<{ routeName: string | null; count: number; percentage: number }>;
  }> {
    try {
      if (!this.db) return [];

      const startDate = this.getStartDateForPeriod(period);
      const startISO = startDate.toISOString();

      // Get city statistics from aggregation table
      const cityStats = this.db.query(`
        SELECT 
          city,
          country,
          total_requests,
          unique_ips,
          avg_response_time,
          first_seen,
          last_seen
        FROM geolocation_cities 
        WHERE last_seen >= ?
        ORDER BY total_requests DESC
        LIMIT ?
      `).all(startISO, limit) as any[];

      return cityStats.map(city => {
        // Get top routes for this city
        const topRoutes = this.db.query(`
          SELECT 
            route_name,
            COUNT(*) as count
          FROM requests 
          WHERE json_extract(geolocation_json, '$.city') = ? 
            AND json_extract(geolocation_json, '$.country') = ? 
            AND timestamp >= ?
          GROUP BY route_name
          ORDER BY count DESC
          LIMIT 10
        `).all(city.city, city.country, startISO) as any[];

        const totalRequests = city.total_requests;

        return {
          city: city.city,
          country: city.country,
          totalRequests,
          uniqueIPs: city.unique_ips,
          avgResponseTime: city.avg_response_time || 0,
          firstSeen: city.first_seen,
          lastSeen: city.last_seen,
          topRoutes: topRoutes.map(r => ({
            routeName: r.route_name,
            count: r.count,
            percentage: (r.count / totalRequests) * 100
          }))
        };
      });
    } catch (error) {
      logger.error('Failed to get city statistics:', error);
      return [];
    }
  }
}

// Export a function to get the statistics service instance
export function getStatisticsService(): StatisticsService {
  return StatisticsService.getInstance();
}