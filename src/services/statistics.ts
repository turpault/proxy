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
  private stats: Map<string, RequestStats> = new Map();
  private reportInterval: NodeJS.Timeout | null = null;
  private reportDir: string;
  private dataDir: string;
  private isShuttingDown = false;
  private saveInterval: NodeJS.Timeout | null = null;
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
    this.loadPersistedStats();
    this.startPeriodicReporting();
    this.startPeriodicSaving();
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
   * Save current statistics to SQLite database
   */
  private async saveStats(): Promise<void> {
    try {
      if (!this.db) {
        logger.error('Database not initialized');
        return;
      }

      // Note: With the new schema, we don't need to save aggregated stats
      // since they are calculated on-demand from the requests table
      // and geolocation data is updated in real-time
      logger.debug('Statistics aggregation is now handled in real-time from requests table');
    } catch (error) {
      logger.error('Failed to save statistics to SQLite:', error);
    }
  }

  /**
   * Load persisted statistics from SQLite database
   */
  private async loadPersistedStats(): Promise<void> {
    try {
      if (!this.db) {
        logger.error('Database not initialized');
        return;
      }

      // Load aggregated stats from requests table
      const statsRows = this.db.query(`
        SELECT 
          ip,
          COUNT(*) as count,
          MIN(timestamp) as first_seen,
          MAX(timestamp) as last_seen,
          GROUP_CONCAT(DISTINCT user_agent) as user_agents,
          GROUP_CONCAT(DISTINCT route_name) as routes,
          GROUP_CONCAT(DISTINCT method) as methods,
          GROUP_CONCAT(response_time) as response_times,
          GROUP_CONCAT(DISTINCT request_type) as request_types,
          json_extract(geolocation_json, '$.country') as country,
          json_extract(geolocation_json, '$.city') as city,
          json_extract(geolocation_json, '$.latitude') as latitude,
          json_extract(geolocation_json, '$.longitude') as longitude
        FROM requests 
        GROUP BY ip
      `).all() as any[];

      this.stats.clear();

      for (const row of statsRows) {
        // Load route details for this IP
        const routeDetailsRows = this.db.query(`
          SELECT 
            domain,
            target_url as target,
            method,
            response_time,
            timestamp,
            request_type
          FROM requests 
          WHERE ip = ? AND is_matched = 1
          ORDER BY timestamp
        `).all(row.ip) as any[];

        const routeDetails = routeDetailsRows.map((detailRow: any) => ({
          domain: detailRow.domain,
          target: detailRow.target,
          method: detailRow.method,
          responseTime: detailRow.response_time,
          timestamp: new Date(detailRow.timestamp),
          requestType: detailRow.request_type
        }));

        // Reconstruct RequestStats object
        const stat: RequestStats = {
          ip: row.ip,
          geolocation: {
            country: row.country,
            city: row.city,
            latitude: row.latitude,
            longitude: row.longitude
          },
          count: row.count,
          firstSeen: new Date(row.first_seen),
          lastSeen: new Date(row.last_seen),
          userAgents: new Set(row.user_agents ? row.user_agents.split(',') : []),
          routes: new Set(row.routes ? row.routes.split(',') : []),
          methods: new Set(row.methods ? row.methods.split(',') : []),
          responseTimes: row.response_times ? row.response_times.split(',').map(Number) : [],
          requestTypes: new Set(row.request_types ? row.request_types.split(',') : []),
          routeDetails
        };

        this.stats.set(row.ip, stat);
      }

      logger.info(`Statistics loaded from SQLite: ${this.stats.size} entries`);
    } catch (error) {
      logger.error('Failed to load persisted statistics from SQLite:', error);
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

    const now = new Date();
    const existing = this.stats.get(requestContext.ip);

    // Extract additional request information
    const url = new URL(requestContext.url);
    const path = url.pathname;
    const queryStr = url.search;
    const statusCode = response?.status || 200;
    const headers = requestContext.headers;

    if (existing) {
      // Update existing stats
      existing.count++;
      existing.lastSeen = now;
      existing.userAgents.add(requestContext.userAgent);
      existing.routes.add(route?.name || 'unknown');
      existing.methods.add(requestContext.method);
      existing.requestTypes.add(route?.type || 'proxy');

      if (responseTime !== undefined) {
        existing.responseTimes.push(responseTime);
        // Keep only last 1000 response times to prevent memory issues
        if (existing.responseTimes.length > 1000) {
          existing.responseTimes = existing.responseTimes.slice(-1000);
        }
      }

      if (route) {
        existing.routeDetails.push({
          domain: route.domain,
          target: route.target || 'unknown',
          method: requestContext.method,
          responseTime: responseTime || 0,
          timestamp: now,
          requestType: route.type || 'proxy',
        });
        // Keep only last 1000 route details
        if (existing.routeDetails.length > 1000) {
          existing.routeDetails = existing.routeDetails.slice(-1000);
        }
      }
    } else {
      // Create new stats entry
      this.stats.set(requestContext.ip, {
        ip: requestContext.ip,
        geolocation: requestContext.geolocation,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        userAgents: new Set([requestContext.userAgent]),
        routes: new Set([route?.name || 'unknown']),
        methods: new Set([requestContext.method]),
        responseTimes: responseTime !== undefined ? [responseTime] : [],
        requestTypes: new Set([route?.type || 'proxy']),
        routeDetails: route ? [{
          domain: route.domain,
          target: route.target || 'unknown',
          method: requestContext.method,
          responseTime: responseTime || 0,
          timestamp: now,
          requestType: route.type || 'proxy',
        }] : [],
      });
    }

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
          city: city || 'Unknown',
          country: country || 'Unknown',
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

    // Calculate request type statistics
    const requestTypeStats = new Map<string, number>();
    statsArray.forEach(stat => {
      stat.requestTypes.forEach(type => {
        requestTypeStats.set(type, (requestTypeStats.get(type) || 0) + stat.count);
      });
    });

    const requestTypes = Array.from(requestTypeStats.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: (count / totalRequests) * 100,
      }))
      .sort((a, b) => b.count - a.count);

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
        requestTypes,
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
          requestTypes: Array.from(stat.requestTypes),
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
            city: city || 'Unknown',
            country: country || 'Unknown',
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
      if (day) {
        const current = dailyStats.get(day) || 0;
        dailyStats.set(day, current + stat.count);
      }
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
      databaseVersion: number;
      schemaVersion: number;
    } = {
      totalRequests,
      uniqueIPs: statsArray.length,
      uniqueCountries,
      cacheSize: this.stats.size,
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
      requestTypes: Set<string>; // Track request types for each route
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
        existing.requestTypes.add(detail.requestType);

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
        const requestTypes = new Set<string>([detail.requestType]);

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
          requestTypes,
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
        requestType: Array.from(route.requestTypes)[0] || 'proxy',
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
        uniquePaths: Array.from(unmatchedPaths).slice(-200), // Limit to last 200 unique paths
        requestType: 'unmatched',
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