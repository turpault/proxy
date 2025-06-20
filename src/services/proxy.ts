import express from 'express';
import http from 'http';
import https from 'https';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as url from 'url';
import helmet from 'helmet';
import cors from 'cors';
import mime from 'mime-types';
import cookieParser from 'cookie-parser';
import { ProxyRoute, ServerConfig, CertificateInfo, CSPConfig, CSPDirectives, GeolocationFilter, CorsConfig, ProcessConfig, ProcessManagementConfig } from '../types';
import { logger } from '../utils/logger';
import { LetsEncryptService } from './letsencrypt';
import { OAuth2Service } from './oauth2';
import { geolocationService, GeolocationInfo } from './geolocation';
import { processManager } from './process-manager';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { statisticsService } from './statistics';
import { WebSocketService } from './websocket';

export class ProxyServer {
  private app: express.Application;
  private managementApp: express.Application;
  private httpServer: http.Server | null = null;
  private httpsServer: https.Server | null = null;
  private managementServer: http.Server | null = null;
  private config: ServerConfig;
  private letsEncryptService: LetsEncryptService;
  private oauth2Service: OAuth2Service;
  private certificates: Map<string, CertificateInfo> = new Map();
  private webSocketService: WebSocketService;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.managementApp = express();
    this.letsEncryptService = new LetsEncryptService({
      email: config.letsEncrypt.email,
      staging: config.letsEncrypt.staging,
      certDir: config.letsEncrypt.certDir,
      domains: config.routes.map(route => route.domain),
    });
    this.oauth2Service = new OAuth2Service();
    this.webSocketService = new WebSocketService(this);
    
    // Set up process update callback for WebSocket broadcasts
    processManager.setProcessUpdateCallback(() => {
      this.broadcastProcessUpdates();
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupManagementServer();
  }

  private getClientIP(req: express.Request): string {
    // Get real IP address, considering proxies
    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    const xRealIP = req.headers['x-real-ip'] as string;
    const xClientIP = req.headers['x-client-ip'] as string;
    
    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, first one is the original client
      return xForwardedFor.split(',')[0].trim();
    }
    
    if (xRealIP) {
      return xRealIP;
    }
    
    if (xClientIP) {
      return xClientIP;
    }
    
    // Fall back to connection remote address or req.ip
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private setupMiddleware(): void {
    // Security middleware configuration
    const helmetConfig: any = {
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    };

    // Configure CSP if available in config
    const globalCSP = this.config.security?.csp;
    if (globalCSP && globalCSP.enabled) {
      // Use helmet's built-in CSP configuration
      const cspDirectives: any = {};
      const dirs = globalCSP.directives;
      
      if (dirs) {
        // Helmet expects camelCase directive names, just pass them through
        Object.entries(dirs).forEach(([key, value]) => {
          if (typeof value === 'boolean') {
            // Handle boolean directives for helmet config
            if (value) {
              cspDirectives[key] = value;
            }
          } else if (Array.isArray(value) && value.length > 0) {
            // Helmet expects camelCase keys, keep them as-is
            cspDirectives[key] = value;
          }
        });
      }

      helmetConfig.contentSecurityPolicy = {
        directives: cspDirectives,
        reportOnly: globalCSP.reportOnly || false,
      };
    } else {
      // Disable CSP if not configured
      helmetConfig.contentSecurityPolicy = false;
    }

    this.app.use(helmet(helmetConfig));

    // Cookie parser for OAuth2 sessions
    this.app.use(cookieParser());

    // JSON body parser for POST requests
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // CORS
    this.app.use(cors());

    // Trust proxy headers
    this.app.set('trust proxy', true);

    // Geolocation filtering middleware
    this.app.use((req, res, next) => {
      const filter = this.getGeolocationFilterForRequest(req);
      if (filter?.enabled) {
        const clientIP = this.getClientIP(req);
        const geolocation = geolocationService.getGeolocation(clientIP);
        
        if (this.shouldBlockRequest(geolocation, filter)) {
          if (filter.logBlocked !== false) {
            const locationString = this.formatLocationString(clientIP, geolocation);
            logger.warn(`[BLOCKED] [${locationString}] ${req.method} ${req.url}`, {
              reason: 'Geolocation filter',
              filter: {
                mode: filter.mode,
                countries: filter.countries,
                regions: filter.regions,
                cities: filter.cities,
              },
              geolocation: geolocation ? {
                country: geolocation.country,
                region: geolocation.region,
                city: geolocation.city,
              } : null,
              ip: clientIP,
              host: req.get('host'),
              userAgent: req.get('user-agent'),
            });
          }

          // Handle custom response
          if (filter.customResponse?.redirectUrl) {
            return res.redirect(302, filter.customResponse.redirectUrl);
          }

          const statusCode = filter.customResponse?.statusCode || 403;
          const message = filter.customResponse?.message || 'Access denied due to geographic restrictions';
          
          return res.status(statusCode).json({
            error: 'Access Denied',
            message,
            code: 'GEOLOCATION_BLOCKED',
          });
        }
      }
      next();
    });

    // Request logging with geolocation
    this.app.use((req, res, next) => {
      const clientIP = this.getClientIP(req);
      const geolocation = geolocationService.getGeolocation(clientIP);
      
      const logData: any = {
        host: req.get('host'),
        userAgent: req.get('user-agent'),
        ip: clientIP,
      };

      // Build location string for log message
      const locationString = this.formatLocationString(clientIP, geolocation);
      if (geolocation) {
        logData.geolocation = {
          country: geolocation.country,
          region: geolocation.region,
          city: geolocation.city,
          timezone: geolocation.timezone,
        };
        
        if (geolocation.latitude && geolocation.longitude) {
          logData.geolocation.coordinates = `${geolocation.latitude}, ${geolocation.longitude}`;
        }
      }

      logger.http(`[${locationString}] ${req.method} ${req.url}`, logData);

      // Record request for statistics
      const route = req.url || '/';
      const method = req.method;
      const userAgent = req.get('user-agent') || 'Unknown';
      
      statisticsService.recordRequest(clientIP, geolocation, route, method, userAgent);

      next();
    });

    // Let's Encrypt challenge endpoint with proper MIME types
    this.app.use('/.well-known/acme-challenge', express.static('.well-known/acme-challenge', {
      setHeaders: (res, filePath) => {
        // ACME challenge files are plain text
        res.set('Content-Type', 'text/plain');
      }
    }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const geoStats = geolocationService.getCacheStats();
      const processStats = processManager.getProcessStatus();
      const runningProcesses = processStats.filter(p => p.isRunning);
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        geolocation: {
          cacheSize: geoStats.size,
          maxCacheSize: geoStats.maxSize,
        },
        processes: {
          total: processStats.length,
          running: runningProcesses.length,
          details: processStats,
        },
      });
    });

    // Setup proxy routes - path-based routes first (more specific)
    const pathRoutes = this.config.routes.filter(route => route.path);
    const domainRoutes = this.config.routes.filter(route => !route.path);
    
    pathRoutes.forEach(route => {
      this.setupPathRoute(route);
    });
    
    domainRoutes.forEach(route => {
      this.setupProxyRoute(route);
    });

    // Default handler for unmatched routes
    this.app.use('*', (req, res) => {
      logger.warn(`No route found for ${req.method} ${req.originalUrl}`, {
        host: req.get('host'),
        ip: req.ip,
      });
      res.status(404).json({ error: 'Route not found' });
    });
  }

  private setupManagementServer(): void {
    // Setup basic middleware for management app
    this.managementApp.use(express.json({ limit: '10mb' }));
    this.managementApp.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.managementApp.use(cors());

    // Trust proxy headers for management interface
    this.managementApp.set('trust proxy', true);

    // Serve static files for the management interface
    this.managementApp.use('/', express.static(path.join(__dirname, '../static/management')));
    
    // API endpoints for process management
    this.managementApp.get('/api/processes', (req, res) => {
      try {
        const processes = processManager.getProcessStatus();
        const availableProcesses = this.config.processManagement?.processes || {};
        
        const processList = Object.keys(availableProcesses).map(processId => {
          const processConfig = availableProcesses[processId];
          const runningProcess = processes.find(p => p.id === processId);
          
          return {
            id: processId,
            name: processConfig.name || `proxy-${processId}`,
            enabled: processConfig.enabled,
            command: processConfig.command,
            args: processConfig.args,
            cwd: processConfig.cwd,
            env: processConfig.env,
            isRunning: runningProcess?.isRunning || false,
            pid: runningProcess?.pid,
            restartCount: runningProcess?.restartCount || 0,
            startTime: runningProcess?.startTime,
            lastRestartTime: runningProcess?.lastRestartTime,
            uptime: runningProcess?.uptime,
            healthCheckFailures: runningProcess?.healthCheckFailures || 0,
            pidFile: runningProcess?.pidFile,
            logFile: runningProcess?.logFile,
            isReconnected: runningProcess?.isReconnected || false,
          };
        });
        
        res.json({ 
          success: true, 
          data: processList,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Failed to get process list', error);
        res.status(500).json({ success: false, error: 'Failed to get process list' });
      }
    });

    this.managementApp.get('/api/processes/:id', (req, res) => {
      try {
        const { id } = req.params;
        const availableProcesses = this.config.processManagement?.processes || {};
        const processConfig = availableProcesses[id];
        
        if (!processConfig) {
          return res.status(404).json({ success: false, error: 'Process not found' });
        }
        
        const processes = processManager.getProcessStatus();
        const runningProcess = processes.find(p => p.id === id);
        
        const processInfo = {
          id,
          name: processConfig.name || `proxy-${id}`,
          enabled: processConfig.enabled,
          command: processConfig.command,
          args: processConfig.args,
          cwd: processConfig.cwd,
          env: processConfig.env,
          restartOnExit: processConfig.restartOnExit,
          restartDelay: processConfig.restartDelay,
          maxRestarts: processConfig.maxRestarts,
          healthCheck: processConfig.healthCheck,
          isRunning: runningProcess?.isRunning || false,
          pid: runningProcess?.pid,
          restartCount: runningProcess?.restartCount || 0,
          startTime: runningProcess?.startTime,
          lastRestartTime: runningProcess?.lastRestartTime,
          uptime: runningProcess?.uptime,
          healthCheckFailures: runningProcess?.healthCheckFailures || 0,
          pidFile: runningProcess?.pidFile,
          logFile: runningProcess?.logFile,
          isReconnected: runningProcess?.isReconnected || false,
        };
        
        return res.json({ 
          success: true, 
          data: processInfo,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error(`Failed to get process ${req.params.id}`, error);
        return res.status(500).json({ success: false, error: 'Failed to get process info' });
      }
    });

    this.managementApp.post('/api/processes/:id/start', async (req, res) => {
      try {
        const { id } = req.params;
        
        // Find the process configuration from the independent process management config
        if (!this.config.processManagement?.processes[id]) {
          return res.status(404).json({ success: false, error: 'Process configuration not found' });
        }

        const processConfig = this.config.processManagement.processes[id];
        const target = this.getTargetForProcess(id, processConfig);
        
        await processManager.startProcess(id, processConfig, target);
        logger.info(`Process ${id} started via management interface`);
        return res.json({ success: true, message: `Process ${id} started successfully` });
      } catch (error) {
        logger.error(`Failed to start process ${req.params.id}`, error);
        return res.status(500).json({ success: false, error: `Failed to start process: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });

    this.managementApp.post('/api/processes/:id/stop', async (req, res) => {
      try {
        const { id } = req.params;
        await processManager.stopProcess(id);
        logger.info(`Process ${id} stopped via management interface`);
        return res.json({ success: true, message: `Process ${id} stopped successfully` });
      } catch (error) {
        logger.error(`Failed to stop process ${req.params.id}`, error);
        return res.status(500).json({ success: false, error: `Failed to stop process: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });

    this.managementApp.post('/api/processes/:id/restart', async (req, res) => {
      try {
        const { id } = req.params;
        
        // Find the process configuration from the independent process management config
        if (!this.config.processManagement?.processes[id]) {
          return res.status(404).json({ success: false, error: 'Process configuration not found' });
        }

        const processConfig = this.config.processManagement.processes[id];
        const target = this.getTargetForProcess(id, processConfig);
        
        await processManager.restartProcess(id, target);
        logger.info(`Process ${id} restarted via management interface`);
        return res.json({ success: true, message: `Process ${id} restarted successfully` });
      } catch (error) {
        logger.error(`Failed to restart process ${req.params.id}`, error);
        return res.status(500).json({ success: false, error: `Failed to restart process: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });

    this.managementApp.post('/api/processes/reload', async (req, res) => {
      try {
        // Use the process config file from config or default to the standard location
        const configFilePath = this.config.processConfigFile 
          ? path.resolve(process.cwd(), this.config.processConfigFile)
          : path.resolve(process.cwd(), 'config', 'processes.yaml');
        
        // Try to load the configuration directly using the process manager
        const newConfig = await processManager.loadProcessConfig(configFilePath);
        
        if (!newConfig) {
          return res.status(500).json({ success: false, error: 'Failed to load process configuration file' });
        }

        // Trigger the configuration update handler
        await this.handleProcessConfigUpdate(newConfig);
        
        logger.info('Process configuration reloaded via management interface');
        return res.json({ success: true, message: 'Process configuration reloaded successfully' });
      } catch (error) {
        logger.error('Failed to reload process configuration', error);
        return res.status(500).json({ success: false, error: `Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });

    this.managementApp.get('/api/processes/:id/logs', async (req, res) => {
      try {
        const { id } = req.params;
        const { lines = 100 } = req.query;
        
        const processes = processManager.getProcessStatus();
        const process = processes.find(p => p.id === id);
        
        if (!process || !process.logFile) {
          return res.status(404).json({ success: false, error: 'Process or log file not found' });
        }

        // Check if log file exists
        if (!await fs.pathExists(process.logFile)) {
          return res.json({ success: true, data: { logs: [], message: 'Log file not found or empty' } });
        }

        // Use tail to get last N lines
        const { spawn } = require('child_process');
        
        // Wrap the tail process in a Promise
        const tailPromise = new Promise<{ success: boolean; data?: any; error?: string }>((resolve) => {
          const tailProcess = spawn('tail', ['-n', lines.toString(), process.logFile]);
          
          let logs = '';
          let errorOutput = '';

          tailProcess.stdout.on('data', (data: Buffer) => {
            logs += data.toString();
          });

          tailProcess.stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });

          tailProcess.on('close', (code: number) => {
            if (code === 0) {
              const logLines = logs.trim().split('\n').filter(line => line.length > 0);
              resolve({ 
                success: true, 
                data: { 
                  logs: logLines,
                  totalLines: logLines.length,
                  processId: id,
                  logFile: process.logFile
                }
              });
            } else {
              logger.error(`Failed to read logs for process ${id}`, { code, error: errorOutput });
              resolve({ success: false, error: 'Failed to read log file' });
            }
          });

          tailProcess.on('error', (error: Error) => {
            logger.error(`Error reading logs for process ${id}`, error);
            resolve({ success: false, error: 'Failed to read log file' });
          });
        });

        const result = await tailPromise;
        if (result.success) {
          return res.json(result);
        } else {
          return res.status(500).json(result);
        }
      } catch (error) {
        logger.error(`Failed to get logs for process ${req.params.id}`, error);
        return res.status(500).json({ success: false, error: `Failed to get logs: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });

    this.managementApp.get('/api/status', (req, res) => {
      try {
        const status = this.getStatus();
        res.json({ 
          success: true, 
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Failed to get server status', error);
        res.status(500).json({ success: false, error: 'Failed to get server status' });
      }
    });

    // Statistics endpoints
    this.managementApp.get('/api/statistics', (req, res) => {
      try {
        const stats = statisticsService.getCurrentStats();
        res.json({ 
          success: true, 
          data: stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Failed to get statistics', error);
        res.status(500).json({ success: false, error: 'Failed to get statistics' });
      }
    });

    this.managementApp.get('/api/statistics/summary', (req, res) => {
      try {
        const summary = statisticsService.getStatsSummary();
        res.json({ 
          success: true, 
          data: summary,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Failed to get statistics summary', error);
        res.status(500).json({ success: false, error: 'Failed to get statistics summary' });
      }
    });

    this.managementApp.post('/api/statistics/generate-report', async (req, res) => {
      try {
        const report = statisticsService.getCurrentStats();
        
        // Save the report immediately
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `statistics-manual-${timestamp}-${Date.now()}.json`;
        const reportDir = path.resolve(process.cwd(), 'logs', 'statistics');
        const filepath = path.join(reportDir, filename);
        
        await fs.ensureDir(reportDir);
        await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf8');
        
        logger.info(`Manual statistics report generated: ${filepath}`);
        res.json({ 
          success: true, 
          message: 'Statistics report generated successfully',
          data: {
            filepath,
            summary: {
              totalRequests: report.summary.totalRequests,
              uniqueIPs: report.summary.uniqueIPs,
              uniqueCountries: report.summary.uniqueCountries,
            }
          }
        });
      } catch (error) {
        logger.error('Failed to generate statistics report', error);
        res.status(500).json({ success: false, error: 'Failed to generate statistics report' });
      }
    });

    logger.info('Management server configured on port 4481');
  }

  private setupPathRoute(route: ProxyRoute): void {
    const routePath = route.path!;
    
    switch (route.type) {
      case 'static':
        this.setupStaticRoute(route, routePath);
        break;
      case 'redirect':
        this.setupRedirectRoute(route, routePath);
        break;
      case 'proxy':
      default:
        this.setupPathProxyRoute(route, routePath);
        break;
    }
  }

  private setupStaticRoute(route: ProxyRoute, routePath: string): void {
    if (!route.staticPath) {
      logger.error(`Static path not configured for route ${routePath}`);
      return;
    }

    // Add OAuth2 middleware if configured
    if (route.oauth2 && route.oauth2.enabled) {
      logger.info(`Setting up OAuth2 for route ${routePath}`, {
        provider: route.oauth2.provider,
        clientId: route.oauth2.clientId ? '***' + route.oauth2.clientId.slice(-4) : 'MISSING',
        clientSecret: route.oauth2.clientSecret ? '***' + route.oauth2.clientSecret.slice(-4) : 'MISSING',
        callbackUrl: route.oauth2.callbackUrl,
      });

      // Validate OAuth2 configuration before creating middleware
      if (!route.oauth2.clientId || route.oauth2.clientId.includes('${')) {
        throw new Error(`OAuth2 client_id is missing or unresolved for route ${routePath}. Current value: "${route.oauth2.clientId}"`);
      }
      
      if (!route.oauth2.clientSecret || route.oauth2.clientSecret.includes('${')) {
        throw new Error(`OAuth2 client_secret is missing or unresolved for route ${routePath}. Current value: "${route.oauth2.clientSecret}"`);
      }
      
      if (!route.oauth2.callbackUrl || route.oauth2.callbackUrl.includes('${')) {
        throw new Error(`OAuth2 callback_url is missing or unresolved for route ${routePath}. Current value: "${route.oauth2.callbackUrl}"`);
      }

      const oauth2Middleware = this.oauth2Service.createMiddleware(
        route.oauth2,
        route.publicPaths || ['/oauth/callback', '/login', '/logout']
      );

      this.app.use(routePath, oauth2Middleware);

      // Add OAuth2 endpoints
      this.app.get(`${routePath}/oauth/logout`, (req, res) => {
        const sessionId = req.cookies?.['oauth2-session'];
        if (sessionId) {
          this.oauth2Service.logout(sessionId);
        }
        res.clearCookie('oauth2-session');
        res.redirect(routePath);
      });

      // Add session info endpoint with access token and subscription key
      this.app.get(`${routePath}/oauth/session`, (req, res) => {
        const sessionId = req.cookies?.['oauth2-session'];
        if (sessionId && this.oauth2Service.isAuthenticated(sessionId)) {
          const session = this.oauth2Service.getSession(sessionId);
          res.json({
            authenticated: true,
            accessToken: session?.accessToken,
            subscriptionKey: route.oauth2?.subscriptionKey,
            tokenType: session?.tokenType,
            scope: session?.scope,
            expiresAt: session?.expiresAt,
          });
        } else {
          res.json({ authenticated: false });
        }
      });
    } else if (route.requireAuth) {
      logger.warn(`Route ${routePath} requires auth but no OAuth2 config provided`);
    }

    // Custom static file handler with proper MIME types and index.html support
    this.app.use(routePath, (req, res, next) => {
      const requestPath = req.path.replace(routePath, '') || '/';
      const filePath = path.join(route.staticPath!, requestPath);
      
      // Check if the path is a directory and should serve index.html
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          const indexPath = path.join(filePath, 'index.html');
          if (fs.existsSync(indexPath)) {
            const mimeType = mime.lookup('index.html') || 'text/html';
            res.set('Content-Type', mimeType);
            res.sendFile(path.resolve(indexPath));
            return;
          }
        } else if (stats.isFile()) {
          const mimeType = mime.lookup(filePath) || 'application/octet-stream';
          res.set('Content-Type', mimeType);
          
          // Set appropriate cache headers for static assets
          const extension = path.extname(filePath).toLowerCase();
          if (['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot'].includes(extension)) {
            res.set('Cache-Control', 'public, max-age=31536000'); // 1 year for assets
          } else if (['.html', '.htm'].includes(extension)) {
            res.set('Cache-Control', 'public, max-age=300'); // 5 minutes for HTML
            
            // Add route-specific CSP headers for HTML files
            const cspConfig = this.getCSPForRoute(routePath, route);
            if (cspConfig) {
              const cspHeader = this.buildCSPHeader(cspConfig);
              if (cspHeader) {
                const headerName = cspConfig.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
                res.set(headerName, cspHeader);
              }
            }
          }
          
          res.sendFile(path.resolve(filePath));
          return;
        }
      }
      
      // Fall back to express.static for other scenarios
      express.static(route.staticPath!, {
        index: ['index.html', 'index.htm'],
        fallthrough: true,
        setHeaders: (res, filePath) => {
          const mimeType = mime.lookup(filePath) || 'application/octet-stream';
          res.set('Content-Type', mimeType);
          
          // Set appropriate cache headers
          const extension = path.extname(filePath).toLowerCase();
          if (['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot'].includes(extension)) {
            res.set('Cache-Control', 'public, max-age=31536000'); // 1 year for assets
          } else if (['.html', '.htm'].includes(extension)) {
            res.set('Cache-Control', 'public, max-age=300'); // 5 minutes for HTML
            
            // Add route-specific CSP headers for HTML files
            const cspConfig = this.getCSPForRoute(routePath, route);
            if (cspConfig) {
              const cspHeader = this.buildCSPHeader(cspConfig);
              if (cspHeader) {
                const headerName = cspConfig.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
                res.set(headerName, cspHeader);
              }
            }
          }
        }
      })(req, res, next);
    });

    // Handle SPA routing if enabled
    if (route.spaFallback) {
      this.app.get(`${routePath}/*`, (req, res) => {
        const indexPath = path.join(route.staticPath!, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.set('Content-Type', 'text/html');
          res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          
          // Add route-specific CSP headers for SPA fallback
          const cspConfig = this.getCSPForRoute(routePath, route);
          if (cspConfig) {
            const cspHeader = this.buildCSPHeader(cspConfig);
            if (cspHeader) {
              const headerName = cspConfig.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
              res.set(headerName, cspHeader);
            }
          }
          
          res.sendFile(path.resolve(indexPath));
        } else {
          logger.warn(`Index file not found for SPA fallback: ${indexPath}`);
          res.status(404).json({ error: 'File not found' });
        }
      });
    }

    logger.info(`Static route configured: ${routePath} -> ${route.staticPath} (with enhanced MIME types and index.html support)`);
  }

  private setupRedirectRoute(route: ProxyRoute, routePath: string): void {
    if (!route.redirectTo) {
      logger.error(`Redirect target not configured for route ${routePath}`);
      return;
    }

    this.app.use(routePath, (req, res) => {
      const redirectUrl = route.redirectTo!;
      logger.debug(`Redirecting ${req.originalUrl} -> ${redirectUrl}`);
      res.redirect(301, redirectUrl);
    });

    logger.info(`Redirect route configured: ${routePath} -> ${route.redirectTo}`);
  }

  private setupPathProxyRoute(route: ProxyRoute, routePath: string): void {
    if (!route.target) {
      logger.error(`Target not configured for proxy route ${routePath}`);
      return;
    }

    // Check if dynamic target is enabled for this route
    if (route.dynamicTarget && route.dynamicTarget.enabled) {
      this.setupDynamicTargetRoute(route, routePath);
      return;
    }

    const proxy = this.createCustomProxy(route, route.target!, `path ${routePath}`);
    
    // Apply CORS middleware if enabled for this route
    if (route.cors) {
      this.app.use(routePath, this.createCorsMiddleware(route.cors));
    }
    
    this.app.use(routePath, proxy);

    const corsStatus = route.cors ? ' (with CORS)' : '';
    logger.info(`Path proxy route configured: ${routePath} -> ${route.target}${corsStatus}`);
  }

  private setupProxyRoute(route: ProxyRoute): void {
    const proxy = this.createCustomProxy(route, route.target!, route.domain);

    // Setup route with domain-based routing
    this.app.use((req, res, next) => {
      const host = req.get('host');
      if (host === route.domain || host === `www.${route.domain}`) {
        // Apply CORS middleware if enabled for this route
        if (route.cors) {
          return this.createCorsMiddleware(route.cors)(req, res, () => {
            proxy(req, res, next);
          });
        }
        return proxy(req, res, next);
      }
      next();
    });

    const corsStatus = route.cors ? ' (with CORS)' : '';
    logger.info(`Proxy route configured: ${route.domain} -> ${route.target}${corsStatus}`);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing proxy server...');

    try {
      // Initialize Let's Encrypt service
      await this.letsEncryptService.initialize();

      // Load or generate certificates for all domains
      await this.setupCertificates();

      // Start managed processes for routes that have process configuration
      await this.startManagedProcesses();

      logger.info('Proxy server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize proxy server', error);
      throw error;
    }
  }

  private async setupCertificates(): Promise<void> {
    const domains = this.config.routes.map(route => route.domain);
    const uniqueDomains = [...new Set(domains)];
    for (const domain of uniqueDomains) {
      try {
        let certInfo = await this.letsEncryptService.getCertificateInfo(domain);
        
        if (!certInfo || !certInfo.isValid) {
          logger.info(`Obtaining new certificate for ${domain}`);
          certInfo = await this.letsEncryptService.obtainCertificate(domain);
        } else if (await this.letsEncryptService.shouldRenewCertificate(certInfo)) {
          logger.info(`Renewing certificate for ${domain}`);
          certInfo = await this.letsEncryptService.renewCertificate(domain);
        }
        this.certificates.set(domain, certInfo);
        logger.info(`Certificate ready for ${domain}`, {
          expiresAt: certInfo.expiresAt,
        });
      } catch (error) {
        logger.error(`Failed to setup certificate for ${domain}`, error);
        // Continue with other domains
      }
    }
  }

  private async startManagedProcesses(): Promise<void> {
    logger.info('Starting managed processes...');
    
    // Check if process management configuration is available
    if (!this.config.processManagement) {
      logger.info('No process management configuration found in main config, attempting to load directly...');
      
      // Try to load process management configuration directly from default location
      const defaultProcessConfigPath = path.resolve(process.cwd(), 'config', 'processes.yaml');
      const processConfig = await processManager.loadProcessConfig(defaultProcessConfigPath);
      if (processConfig) {
        this.config.processManagement = processConfig;
        logger.info('Process management configuration loaded directly from default location');
      } else {
        logger.warn('Failed to load process management configuration, skipping managed processes');
        return;
      }
    }
    
    const processPromises: Promise<void>[] = [];
    
    // Start processes from the independent process management configuration
    for (const [processId, processConfig] of Object.entries(this.config.processManagement.processes)) {
      if (processConfig.enabled) {
        logger.info(`Starting managed process ${processId}`, {
          name: processConfig.name || `proxy-${processId}`,
          command: processConfig.command,
          args: processConfig.args,
        });
        
        try {
          // For independent process management, we need to determine the target
          // This could be based on the process configuration or a default
          const target = this.getTargetForProcess(processId, processConfig);
          const promise = processManager.startProcess(processId, processConfig, target);
          processPromises.push(promise);
        } catch (error) {
          logger.error(`Failed to start process ${processId}`, error);
        }
      }
    }
    
    // Wait for all processes to start
    await Promise.all(processPromises);
    
    const runningProcesses = processManager.getProcessStatus().filter(p => p.isRunning);
    logger.info(`Started ${runningProcesses.length} managed processes`);

    // Set up file watching for dynamic configuration updates
    this.setupProcessConfigWatching();
  }

  /**
   * Set up file watching for process configuration updates
   */
  private setupProcessConfigWatching(): void {
    // Use the process config file from config or default to the standard location
    const configFilePath = this.config.processConfigFile 
      ? path.resolve(process.cwd(), this.config.processConfigFile)
      : path.resolve(process.cwd(), 'config', 'processes.yaml');
    
    // Set up file watching with callback for configuration updates
    processManager.setupFileWatching(configFilePath, (newConfig) => {
      this.handleProcessConfigUpdate(newConfig);
    });
  }

  /**
   * Handle process configuration updates
   */
  private async handleProcessConfigUpdate(newConfig: ProcessManagementConfig): Promise<void> {
    logger.info('Processing configuration update for managed processes');
    
    const currentProcesses = this.config.processManagement?.processes || {};
    const newProcesses = newConfig.processes || {};
    
    // Stop processes that are no longer in the configuration
    for (const [processId, currentConfig] of Object.entries(currentProcesses)) {
      if (!newProcesses[processId] || !newProcesses[processId].enabled) {
        if (processManager.isProcessRunning(processId)) {
          logger.info(`Stopping process ${processId} (removed or disabled in configuration)`);
          await processManager.stopProcess(processId);
        }
      }
    }
    
    // Start or restart processes that are new or have changed
    for (const [processId, newProcessConfig] of Object.entries(newProcesses)) {
      if (newProcessConfig.enabled) {
        const currentConfig = currentProcesses[processId];
        const target = this.getTargetForProcess(processId, newProcessConfig);
        
        // Check if process configuration has changed
        const configChanged = !currentConfig || this.hasProcessConfigChanged(currentConfig, newProcessConfig);
        
        if (!processManager.isProcessRunning(processId)) {
          // Start new process
          logger.info(`Starting new process ${processId} from updated configuration`);
          try {
            await processManager.startProcess(processId, newProcessConfig, target);
          } catch (error) {
            logger.error(`Failed to start process ${processId} from updated configuration`, error);
          }
        } else if (configChanged) {
          // Restart process with new configuration
          logger.info(`Restarting process ${processId} with updated configuration`);
          try {
            await processManager.restartProcess(processId, target);
          } catch (error) {
            logger.error(`Failed to restart process ${processId} with updated configuration`, error);
          }
        }
      }
    }
    
    // Update the configuration in memory
    this.config.processManagement = newConfig;
    
    logger.info('Process configuration update completed');
  }

  /**
   * Check if process configuration has changed
   */
  private hasProcessConfigChanged(oldConfig: ProcessConfig, newConfig: ProcessConfig): boolean {
    // Compare key configuration properties
    const keysToCompare = [
      'command', 'args', 'cwd', 'env', 'restartOnExit', 
      'restartDelay', 'maxRestarts', 'pidFile', 'pidDir', 
      'cleanupPidOnExit', 'healthCheck'
    ];
    
    for (const key of keysToCompare) {
      const oldValue = JSON.stringify(oldConfig[key as keyof ProcessConfig]);
      const newValue = JSON.stringify(newConfig[key as keyof ProcessConfig]);
      
      if (oldValue !== newValue) {
        logger.debug(`Process configuration changed for key: ${key}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get the target URL for a process based on its configuration
   */
  private getTargetForProcess(processId: string, processConfig: ProcessConfig): string {
    // Try to extract port from environment variables or configuration
    const port = processConfig.env?.PORT || '3000';
    
    // Try to find a matching route for this process
    const matchingRoute = this.config.routes.find(route => {
      const routeProcessId = this.getProcessId(route);
      return routeProcessId === processId;
    });
    
    if (matchingRoute && matchingRoute.target) {
      return matchingRoute.target;
    }
    
    // Default to localhost with the port from the process configuration
    return `http://localhost:${port}`;
  }

  private getProcessId(route: ProxyRoute): string {
    // Create a unique process ID based on domain and path
    const pathPart = route.path ? route.path.replace(/\//g, '-') : '';
    return `${route.domain}${pathPart}`.replace(/[^a-zA-Z0-9-]/g, '-');
  }

  async start(): Promise<void> {
    await this.initialize();

    // Start HTTP server (for redirects and Let's Encrypt challenges)
    this.httpServer = http.createServer(this.app);
    this.httpServer.listen(this.config.port, () => {
      logger.info(`HTTP server listening on port ${this.config.port}`);
    });

    // Start management server on dedicated port
    this.managementServer = http.createServer(this.managementApp);
    this.managementServer.listen(4481, () => {
      logger.info(`Management server listening on port 4481`);
    });

    // Initialize WebSocket service
    this.webSocketService.initialize(this.managementServer);

    // Start HTTPS server if we have certificates
    if (this.certificates.size > 0) {
      await this.startHttpsServer();
    }

    // Setup certificate renewal checker
    this.setupCertificateRenewal();
  }

  private async startHttpsServer(): Promise<void> {
    try {
      // Use SNI (Server Name Indication) to serve different certificates per domain
      const httpsOptions: https.ServerOptions = {
        SNICallback: (servername, callback) => {
          const certInfo = this.certificates.get(servername);
          if (certInfo) {
            try {
              const cert = fs.readFileSync(certInfo.certPath, 'utf8');
              const key = fs.readFileSync(certInfo.keyPath, 'utf8');
              callback(null, require('tls').createSecureContext({ cert, key }));
            } catch (error) {
              logger.error(`Failed to load certificate for ${servername}`, error);
              callback(error as Error);
            }
          } else {
            callback(new Error(`No certificate found for ${servername}`));
          }
        },
      };

      // Use the first certificate as default
      const firstCert = Array.from(this.certificates.values())[0];
      if (firstCert) {
        httpsOptions.cert = fs.readFileSync(firstCert.certPath, 'utf8');
        httpsOptions.key = fs.readFileSync(firstCert.keyPath, 'utf8');
      }

      this.httpsServer = https.createServer(httpsOptions, this.app);
      this.httpsServer.listen(this.config.httpsPort, () => {
        logger.info(`HTTPS server listening on port ${this.config.httpsPort}`);
      });
    } catch (error) {
      logger.error('Failed to start HTTPS server', error);
      throw error;
    }
  }

  private setupCertificateRenewal(): void {
    // Check for certificate renewal every 24 hours
    setInterval(async () => {
      logger.info('Checking for certificate renewals...');
      
      for (const [domain, certInfo] of this.certificates) {
        try {
          if (await this.letsEncryptService.shouldRenewCertificate(certInfo)) {
            logger.info(`Renewing certificate for ${domain}`);
            const newCertInfo = await this.letsEncryptService.renewCertificate(domain);
            this.certificates.set(domain, newCertInfo);
            
            // Restart HTTPS server with new certificates
            if (this.httpsServer) {
              this.httpsServer.close(() => {
                this.startHttpsServer().catch(error => {
                  logger.error('Failed to restart HTTPS server after certificate renewal', error);
                });
              });
            }
          }
        } catch (error) {
          logger.error(`Failed to renew certificate for ${domain}`, error);
        }
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  async stop(): Promise<void> {
    logger.info('Stopping proxy server...');

    const promises: Promise<void>[] = [];

    // Stop managed processes first
    promises.push(processManager.shutdown());

    // Stop WebSocket service
    this.webSocketService.close();

    // Stop statistics service
    statisticsService.shutdown();

    if (this.httpServer) {
      promises.push(
        new Promise((resolve) => {
          this.httpServer!.close(() => {
            logger.info('HTTP server stopped');
            resolve();
          });
        })
      );
    }

    if (this.httpsServer) {
      promises.push(
        new Promise((resolve) => {
          this.httpsServer!.close(() => {
            logger.info('HTTPS server stopped');
            resolve();
          });
        })
      );
    }

    if (this.managementServer) {
      promises.push(
        new Promise((resolve) => {
          this.managementServer!.close(() => {
            logger.info('Management server stopped');
            resolve();
          });
        })
      );
    }

    await Promise.all(promises);
    logger.info('Proxy server stopped');
  }

  getStatus(): any {
    return {
      status: 'running',
      uptime: process.uptime(),
      certificates: Array.from(this.certificates.entries()).map(([domain, cert]) => ({
        domain,
        expiresAt: cert.expiresAt,
        isValid: cert.isValid,
      })),
      routes: this.config.routes.map(route => ({
        domain: route.domain,
        target: route.target,
        ssl: this.certificates.has(route.domain),
        processManaged: this.isRouteProcessManaged(route),
      })),
      processes: processManager.getProcessStatus(),
      statistics: statisticsService.getStatsSummary(),
    };
  }

  /**
   * Check if a route has a corresponding managed process
   */
  private isRouteProcessManaged(route: ProxyRoute): boolean {
    if (!this.config.processManagement) {
      return false;
    }
    
    const routeProcessId = this.getProcessId(route);
    return !!this.config.processManagement.processes[routeProcessId];
  }

  // Utility method to convert CSP configuration to header string
  private buildCSPHeader(cspConfig: CSPConfig): string {
    if (!cspConfig.enabled || !cspConfig.directives) {
      return '';
    }

    const directives: string[] = [];
    const dirs = cspConfig.directives;

    // Convert directive names from camelCase to kebab-case and build header
    const directiveMap: Record<keyof CSPDirectives, string> = {
      defaultSrc: 'default-src',
      scriptSrc: 'script-src',
      styleSrc: 'style-src',
      imgSrc: 'img-src',
      connectSrc: 'connect-src',
      fontSrc: 'font-src',
      objectSrc: 'object-src',
      mediaSrc: 'media-src',
      frameSrc: 'frame-src',
      childSrc: 'child-src',
      workerSrc: 'worker-src',
      manifestSrc: 'manifest-src',
      prefetchSrc: 'prefetch-src',
      navigateTo: 'navigate-to',
      formAction: 'form-action',
      frameAncestors: 'frame-ancestors',
      baseUri: 'base-uri',
      pluginTypes: 'plugin-types',
      sandbox: 'sandbox',
      upgradeInsecureRequests: 'upgrade-insecure-requests',
      blockAllMixedContent: 'block-all-mixed-content',
    };

    // Build directives array
    Object.entries(dirs).forEach(([key, value]) => {
      const directiveName = directiveMap[key as keyof CSPDirectives];
      if (directiveName && value !== undefined) {
        if (typeof value === 'boolean') {
          if (value) {
            directives.push(directiveName);
          }
        } else if (Array.isArray(value) && value.length > 0) {
          directives.push(`${directiveName} ${value.join(' ')}`);
        }
      }
    });

    // Add report-uri if specified
    if (cspConfig.reportUri) {
      directives.push(`report-uri ${cspConfig.reportUri}`);
    }

    return directives.join('; ');
  }

  // Get CSP configuration for a specific route path
  private getCSPForRoute(routePath: string, route?: ProxyRoute): CSPConfig | null {
    // Route-specific CSP takes precedence
    if (route?.csp) {
      return route.csp;
    }

    // Check security.routeCSP configuration
    if (this.config.security?.routeCSP) {
      const routeCSP = this.config.security.routeCSP.find(r => r.path === routePath);
      if (routeCSP?.csp) {
        return routeCSP.csp;
      }
    }

    // Fall back to global CSP configuration
    return this.config.security?.csp || null;
  }

  // Get geolocation filter for a specific request
  private getGeolocationFilterForRequest(req: express.Request): GeolocationFilter | null {
    const host = req.get('host');
    const requestPath = req.path;

    // Check if any route matches this request and has geolocation filtering
    for (const route of this.config.routes) {
      if (route.geolocationFilter?.enabled) {
        // Check domain match
        if (host === route.domain || host === `www.${route.domain}`) {
          // Check path match if route has a path
          if (route.path) {
            if (requestPath.startsWith(route.path)) {
              return route.geolocationFilter;
            }
          } else {
            // No path specified, domain match is enough
            return route.geolocationFilter;
          }
        }
      }
    }

    // No matching route with geolocation filter
    return null;
  }

  // Check if a request should be blocked based on geolocation
  private shouldBlockRequest(geolocation: GeolocationInfo | null, filter: GeolocationFilter): boolean {
    if (!filter.enabled) {
      return false;
    }

    // If no geolocation data available, allow by default (or configure differently if needed)
    if (!geolocation) {
      return false;
    }

    const mode = filter.mode || 'block';
    let matches = false;

    // Check country matches
    if (filter.countries && filter.countries.length > 0 && geolocation.country) {
      matches = matches || filter.countries.includes(geolocation.country);
    }

    // Check region matches
    if (filter.regions && filter.regions.length > 0 && geolocation.region) {
      matches = matches || filter.regions.includes(geolocation.region);
    }

    // Check city matches
    if (filter.cities && filter.cities.length > 0 && geolocation.city) {
      matches = matches || filter.cities.some((city: string) => 
        city.toLowerCase() === geolocation.city?.toLowerCase()
      );
    }

    // Return decision based on mode
    if (mode === 'allow') {
      // Allowlist mode: block if NOT in the list
      return !matches;
    } else {
      // Blocklist mode: block if in the list
      return matches;
    }
  }

  // Format location string for logging
  private formatLocationString(clientIP: string, geolocation: GeolocationInfo | null): string {
    let locationString = clientIP;
    
    if (geolocation) {
      // Format location string: "City, Region, Country" or fall back to components available
      const locationParts = [geolocation.city, geolocation.region, geolocation.country].filter(Boolean);
      if (locationParts.length > 0) {
        locationString = `${locationParts.join(', ')} (${clientIP})`;
      }
    }
    
    return locationString;
  }

  // Create CORS middleware for a specific route
  private createCorsMiddleware(corsConfig: boolean | any) {
    if (corsConfig === true) {
      // Simple CORS - allow all origins
      return cors({
        origin: true,
        credentials: false,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
        exposedHeaders: ['Content-Length', 'Content-Type'],
        maxAge: 86400, // 24 hours
        optionsSuccessStatus: 204,
      });
    }

    // Advanced CORS configuration
    const config = corsConfig.enabled !== false ? corsConfig : null;
    if (!config) {
      return (req: express.Request, res: express.Response, next: express.NextFunction) => next();
    }

    return cors({
      origin: config.origin ?? true,
      credentials: config.credentials ?? false,
      methods: config.methods ?? ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: config.allowedHeaders ?? ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
      exposedHeaders: config.exposedHeaders ?? ['Content-Length', 'Content-Type'],
      maxAge: config.maxAge ?? 86400,
      preflightContinue: config.preflightContinue ?? false,
      optionsSuccessStatus: config.optionsSuccessStatus ?? 204,
    });
  }

  // Handle CORS headers in proxy responses
  private handleCorsProxyResponse(proxyRes: any, req: express.Request, res: express.Response, corsConfig: boolean | any): void {
    if (corsConfig === true) {
      // Simple CORS - set permissive headers
      const origin = req.headers.origin;
      if (origin) {
        proxyRes.headers['access-control-allow-origin'] = origin;
      } else {
        proxyRes.headers['access-control-allow-origin'] = '*';
      }
      proxyRes.headers['access-control-allow-methods'] = 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS';
      proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin';
      proxyRes.headers['access-control-expose-headers'] = 'Content-Length, Content-Type';
      proxyRes.headers['access-control-max-age'] = '86400';
      return;
    }

    // Advanced CORS configuration
    const config = corsConfig.enabled !== false ? corsConfig : null;
    if (!config) return;

    // Handle origin
    if (config.origin !== undefined) {
      if (config.origin === true) {
        const origin = req.headers.origin;
        if (origin) {
          proxyRes.headers['access-control-allow-origin'] = origin;
        }
      } else if (typeof config.origin === 'string') {
        proxyRes.headers['access-control-allow-origin'] = config.origin;
      } else if (Array.isArray(config.origin)) {
        const origin = req.headers.origin;
        if (origin && config.origin.includes(origin)) {
          proxyRes.headers['access-control-allow-origin'] = origin;
        }
      }
    }

    // Handle credentials
    if (config.credentials) {
      proxyRes.headers['access-control-allow-credentials'] = 'true';
    }

    // Handle methods
    if (config.methods) {
      proxyRes.headers['access-control-allow-methods'] = config.methods.join(', ');
    }

    // Handle allowed headers
    if (config.allowedHeaders) {
      proxyRes.headers['access-control-allow-headers'] = config.allowedHeaders.join(', ');
    }

    // Handle exposed headers
    if (config.exposedHeaders) {
      proxyRes.headers['access-control-expose-headers'] = config.exposedHeaders.join(', ');
    }

    // Handle max age
    if (config.maxAge !== undefined) {
      proxyRes.headers['access-control-max-age'] = config.maxAge.toString();
    }
  }

  private setupDynamicTargetRoute(route: ProxyRoute, routePath: string): void {
    const dynamicConfig = route.dynamicTarget!;
    const allowedDomains = dynamicConfig.allowedDomains;
    const httpsOnly = dynamicConfig.httpsOnly !== false; // Default to true
    const urlParameter = dynamicConfig.urlParameter || 'url';
    const timeouts = dynamicConfig.timeouts || { request: 30000, proxy: 30000 };
    const logging = dynamicConfig.logging || { logRequests: true, logBlocked: true, logErrors: true };

    // Helper function to validate target URL
    const validateTargetUrl = (targetUrl: string): boolean => {
      try {
        const url = new URL(targetUrl);
        
        // Check if the domain is in the allowed list
        const isAllowed = allowedDomains.some(domain => {
          // Handle wildcard domains
          if (domain.startsWith('*.')) {
            const baseDomain = domain.substring(2);
            return url.hostname === baseDomain || url.hostname.endsWith(`.${baseDomain}`);
          }
          // Support exact match or subdomain match for non-wildcard domains
          return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
        });
        
        // Check protocol if httpsOnly is enabled
        const isSecure = !httpsOnly || url.protocol === 'https:';
        
        return isAllowed && isSecure;
      } catch (error) {
        return false;
      }
    };

    // Apply CORS middleware if enabled for this route
    if (route.cors) {
      this.app.use(routePath, this.createCorsMiddleware(route.cors));
    }

    // Add utility endpoint for encoding URLs to base64
    this.app.get(`${routePath}/encode`, (req, res) => {
      const urlToEncode = req.query.url as string;
      
      if (!urlToEncode) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing "url" query parameter',
          usage: `${routePath}/encode?url=https://example.com/api`,
          example: `${routePath}/encode?url=https://jsonplaceholder.typicode.com/posts`
        });
      }

      try {
        // Validate that it's a proper URL
        new URL(urlToEncode);
        
        // Encode to base64
        const encodedUrl = Buffer.from(urlToEncode, 'utf-8').toString('base64');
        
        return res.json({
          originalUrl: urlToEncode,
          encodedUrl,
          proxyUrl: `${req.protocol}://${req.get('host')}${routePath}?${urlParameter}=${encodedUrl}`,
          usage: `Use the encodedUrl as the ${urlParameter} parameter`
        });
      } catch (error) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid URL provided',
          url: urlToEncode
        });
      }
    });

    // Helper function to decode target URL (supports both plain and base64)
    const decodeTargetUrl = (rawUrl: string): { url: string; isBase64: boolean } => {
      if (!rawUrl) {
        return { url: '', isBase64: false };
      }

      // Check if the URL looks like base64 (no protocol, contains base64 characters)
      const base64Regex = /^[A-Za-z0-9+/=]+$/;
      
      if (!rawUrl.includes('://') && base64Regex.test(rawUrl)) {
        try {
          const decodedUrl = Buffer.from(rawUrl, 'base64').toString('utf-8');
          // Validate that the decoded string is a valid URL
          new URL(decodedUrl);
          return { url: decodedUrl, isBase64: true };
        } catch (error) {
          // If base64 decode fails or doesn't result in valid URL, treat as plain URL
          return { url: rawUrl, isBase64: false };
        }
      }
      
      return { url: rawUrl, isBase64: false };
    };

    // Dynamic target proxy endpoint
    this.app.use(routePath, (req: express.Request, res: express.Response) => {
      // Get target URL from query parameter
      const rawTargetUrl = req.query[urlParameter] as string;
      
      // If no URL parameter provided, fall back to default target
      if (!rawTargetUrl) {
        // Use the default target from route config
        const proxy = this.createCustomProxy(
          route, 
          route.target!, 
          `path ${routePath}`,
          {
            secure: false,
            timeouts: { request: timeouts.request || 30000, proxy: timeouts.proxy || 30000 },
            logRequests: logging.logRequests,
            logErrors: logging.logErrors
          }
        );

        return proxy(req, res, () => {});
      }

      // Decode the target URL (supports both plain and base64)
      const { url: targetUrl, isBase64 } = decodeTargetUrl(rawTargetUrl);
      
      // Validate the dynamic target URL
      if (!validateTargetUrl(targetUrl)) {
        if (logging.logBlocked) {
          logger.warn(`Dynamic target proxy: Blocked request to unauthorized domain`, {
            targetUrl,
            rawTargetUrl,
            isBase64Encoded: isBase64,
            allowedDomains,
            httpsOnly,
            route: routePath,
            clientIP: this.getClientIP(req),
            userAgent: req.get('user-agent')
          });
        }

        return res.status(403).json({
          error: 'Forbidden',
          message: httpsOnly ? 
            'Target domain is not allowed. Only HTTPS URLs from pre-approved domains are permitted.' :
            'Target domain is not allowed. Only URLs from pre-approved domains are permitted.',
          code: 'DOMAIN_NOT_ALLOWED',
          allowedDomains
        });
      }

      // Log the proxied request
      if (logging.logRequests) {
        logger.info(`Dynamic target proxy: Forwarding request`, {
          targetUrl,
          rawTargetUrl,
          isBase64Encoded: isBase64,
          route: routePath,
          method: req.method,
          clientIP: this.getClientIP(req),
          userAgent: req.get('user-agent')
        });
      }

      // Create dynamic proxy options
      const proxy = this.createCustomProxy(
        route, 
        targetUrl, 
        `dynamic target ${routePath}`,
        {
          secure: true,
          timeouts: { request: timeouts.request || 30000, proxy: timeouts.proxy || 30000 },
          logRequests: logging.logRequests,
          logErrors: logging.logErrors,
          customErrorResponse: { 
            code: 'PROXY_ERROR', 
            message: 'The target server is not responding' 
          }
        }
      );

      // Create and execute the proxy
      return proxy(req, res, () => {});
    });

    const corsStatus = route.cors ? ' (with CORS)' : '';
    logger.info(`Dynamic target proxy route configured: ${routePath} -> ${route.target} (dynamic)${corsStatus}`, {
      allowedDomains,
      httpsOnly,
      urlParameter,
      timeouts
    });
  }

  private buildProxyHeaders(route: ProxyRoute, req?: express.Request): Record<string, string> {
    const headers: Record<string, string> = { ...route.headers };
    
    // Forward authorization headers from the client request if available
    if (req) {
      // Forward Authorization header (Bearer tokens, Basic auth, etc.)
      if (req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization as string;
      }
      
      // Forward BlackBaud API subscription key
      if (req.headers['bb-api-subscription-key']) {
        headers['Bb-Api-Subscription-Key'] = req.headers['bb-api-subscription-key'] as string;
      }
      
      // Forward other common authentication headers
      if (req.headers['x-api-key']) {
        headers['X-API-Key'] = req.headers['x-api-key'] as string;
      }
      
      if (req.headers['x-auth-token']) {
        headers['X-Auth-Token'] = req.headers['x-auth-token'] as string;
      }
    }
    
    return headers;
  }

  private maskSensitiveHeaders(headers: any): Record<string, string> {
    const maskedHeaders: Record<string, string> = {};
    const sensitiveHeaderPatterns = [
      /^authorization$/i,
      /^cookie$/i,
      /^set-cookie$/i,
      /^x-api-key$/i,
      /^x-auth-token$/i,
      /^bb-api-subscription-key$/i,
      /^api-key$/i,
      /^apikey$/i,
      /^access-token$/i,
      /^refresh-token$/i,
      /^session-id$/i,
      /^session-token$/i,
    ];

    for (const [key, value] of Object.entries(headers)) {
      const stringValue = Array.isArray(value) ? value.join(', ') : String(value || '');
      
      // Check if this header should be masked
      const shouldMask = sensitiveHeaderPatterns.some(pattern => pattern.test(key));
      
      if (shouldMask && stringValue) {
        // Show only first 4 and last 4 characters for sensitive headers
        if (stringValue.length > 8) {
          maskedHeaders[key] = `${stringValue.substring(0, 4)}...${stringValue.substring(stringValue.length - 4)}`;
        } else {
          maskedHeaders[key] = '*'.repeat(stringValue.length);
        }
      } else {
        maskedHeaders[key] = stringValue;
      }
    }

    return maskedHeaders;
  }

  private createCustomProxy(
    route: ProxyRoute, 
    target: string, 
    routeIdentifier: string,
    options: {
      secure?: boolean;
      timeouts?: { request: number; proxy: number };
      logRequests?: boolean;
      logErrors?: boolean;
      customErrorResponse?: { code?: string; message?: string };
    } = {}
  ) {
    const {
      secure = false,
      timeouts = { request: 30000, proxy: 30000 },
      logRequests = true,
      logErrors = true,
      customErrorResponse
    } = options;

    return async (req: express.Request, res: express.Response, next?: express.NextFunction) => {
      try {
        await this.handleProxyRequest(req, res, {
          route,
          target,
          routeIdentifier,
          secure,
          timeouts,
          logRequests,
          logErrors,
          customErrorResponse
        });
      } catch (error) {
        if (next) {
          next(error);
        } else {
          this.handleProxyError(error as Error, req, res, routeIdentifier, target, route, logErrors, customErrorResponse);
        }
      }
    };
  }

  private async handleProxyRequest(
    req: express.Request,
    res: express.Response,
    config: {
      route: ProxyRoute;
      target: string;
      routeIdentifier: string;
      secure: boolean;
      timeouts: { request: number; proxy: number };
      logRequests: boolean;
      logErrors: boolean;
      customErrorResponse?: { code?: string; message?: string };
    }
  ): Promise<void> {
    const { route, target, routeIdentifier, secure, timeouts, logRequests, logErrors, customErrorResponse } = config;
    
    // Capture request body for potential error logging
    let requestBodyForLogging: string | null = null;
    if (logErrors) {
      try {
        // Limit request body size for logging (max 2KB)
        const maxBodySize = 2048;
        
        if (req.body) {
          // Body has been parsed by express middleware
          let bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
          
          if (bodyStr.length > maxBodySize) {
            bodyStr = bodyStr.substring(0, maxBodySize) + '... [truncated]';
          }
          requestBodyForLogging = bodyStr;
        } else if (req.readable) {
          // For requests with raw/unparsed bodies, indicate they exist
          const contentLength = req.headers['content-length'];
          const contentType = req.headers['content-type'];
          
          if (contentLength && parseInt(contentLength) > 0) {
            requestBodyForLogging = `[Raw body: ${contentLength} bytes, type: ${contentType || 'unknown'}]`;
          }
        }
      } catch (error) {
        requestBodyForLogging = '[unable to serialize request body]';
      }
    }
    
    // Store request body on request object for error logging
    (req as any).__requestBodyForLogging = requestBodyForLogging;
    
    // Parse target URL
    const targetUrl = new URL(target);
    const isHttps = targetUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    // Build request path with rewrite rules
    let requestPath = req.url;
    if (route.rewrite) {
      for (const [pattern, replacement] of Object.entries(route.rewrite)) {
        const regex = new RegExp(pattern);
        requestPath = requestPath.replace(regex, replacement);
      }
    }

    // Remove base path if this is a path-based route
    if (route.path && requestPath.startsWith(route.path)) {
      requestPath = requestPath.substring(route.path.length) || '/';
    }

    // Ensure path starts with /
    if (!requestPath.startsWith('/')) {
      requestPath = '/' + requestPath;
    }

    // Add target path if it exists
    if (targetUrl.pathname && targetUrl.pathname !== '/') {
      requestPath = targetUrl.pathname.replace(/\/$/, '') + requestPath;
    }

    // Add query parameters
    if (targetUrl.search) {
      const separator = requestPath.includes('?') ? '&' : '?';
      requestPath += separator + targetUrl.search.substring(1);
    }

    // Build headers
    const proxyHeaders = this.buildProxyHeaders(route, req);
    
    // Copy request headers, excluding hop-by-hop headers
    const hopByHopHeaders = new Set([
      'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
      'te', 'trailers', 'transfer-encoding', 'upgrade'
    ]);

    const requestHeaders: Record<string, string> = { ...proxyHeaders };
    for (const [key, value] of Object.entries(req.headers)) {
      if (!hopByHopHeaders.has(key.toLowerCase()) && !requestHeaders[key]) {
        requestHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }
    }

    // Set Host header to target host
    requestHeaders['host'] = targetUrl.host;

    // Log request headers being sent to the target server
    if (logRequests) {
      const maskedHeaders = this.maskSensitiveHeaders(requestHeaders);
      logger.debug('Proxy request headers', {
        url: `${targetUrl.protocol}//${targetUrl.host}${requestPath}`,
        method: req.method,
        headers: maskedHeaders,
        clientIP: this.getClientIP(req),
        originalUrl: req.originalUrl,
        routeIdentifier,
      });
    }

    // Create request options
    const requestOptions: http.RequestOptions & https.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: requestPath,
      method: req.method,
      headers: requestHeaders,
      timeout: timeouts.request,
      rejectUnauthorized: secure,
    };

    // Create the proxy request
    const proxyRequest = httpModule.request(requestOptions, (proxyResponse) => {
      this.handleProxyResponse(proxyResponse, req, res, route, routeIdentifier, target, logRequests);
    });

    // Set up error handling
    proxyRequest.on('error', (error) => {
      this.handleProxyError(error, req, res, routeIdentifier, target, route, logErrors, customErrorResponse);
    });

    // Set up timeout
    proxyRequest.on('timeout', () => {
      proxyRequest.destroy();
      const timeoutError = new Error(`Request timeout after ${timeouts.request}ms`);
      this.handleProxyError(timeoutError, req, res, routeIdentifier, target, route, logErrors, customErrorResponse);
    });

    // Pipe request body
    req.pipe(proxyRequest);

    // Handle client disconnect
    req.on('close', () => {
      proxyRequest.destroy();
    });
  }

  private handleProxyResponse(
    proxyResponse: http.IncomingMessage,
    req: express.Request,
    res: express.Response,
    route: ProxyRoute,
    routeIdentifier: string,
    target: string,
    logRequests: boolean
  ): void {
    // Handle CORS headers if CORS is enabled for this route
    if (route.cors) {
      this.handleCorsProxyResponse(proxyResponse, req, res, route.cors);
    }

    // Copy response headers, excluding hop-by-hop headers
    const hopByHopHeaders = new Set([
      'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
      'te', 'trailers', 'transfer-encoding', 'upgrade'
    ]);

    for (const [key, value] of Object.entries(proxyResponse.headers)) {
      if (!hopByHopHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value as string | string[]);
      }
    }

    // Set status code
    res.statusCode = proxyResponse.statusCode || 200;

    if (logRequests) {
      const responseDetails: any = {
        statusCode: proxyResponse.statusCode,
        target,
        url: req.url,
        method: req.method,
        responseHeaders: this.maskSensitiveHeaders(proxyResponse.headers),
        clientIP: this.getClientIP(req),
        routeIdentifier,
      };

      // Capture response body for error responses
      if (proxyResponse.statusCode && proxyResponse.statusCode >= 400) {
        let responseBody = '';
        const chunks: Buffer[] = [];

        proxyResponse.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        proxyResponse.on('end', () => {
          if (chunks.length > 0) {
            responseBody = Buffer.concat(chunks).toString('utf8');
            
            // Limit response body size for logging (max 2KB)
            const maxBodySize = 2048;
            if (responseBody.length > maxBodySize) {
              responseBody = responseBody.substring(0, maxBodySize) + '... [truncated]';
            }

            responseDetails.responseBody = responseBody;
          }

          logger.error(`Proxy error response for ${routeIdentifier}`, responseDetails);
        });
      } else {
        logger.debug(`Proxy response for ${routeIdentifier}`, responseDetails);
      }
    }

    // Pipe response body
    proxyResponse.pipe(res);
  }

  private handleProxyError(
    error: Error,
    req: express.Request,
    res: express.Response,
    routeIdentifier: string,
    target: string,
    route: ProxyRoute,
    logErrors: boolean,
    customErrorResponse?: { code?: string; message?: string }
  ): void {
    if (logErrors) {
      // Enhanced error logging with more details
      const errorDetails: any = {
        error: error.message,
        errorStack: error.stack,
        target,
        url: req.url,
        originalUrl: req.originalUrl,
        method: req.method,
        corsEnabled: !!route.cors,
        clientIP: this.getClientIP(req),
        userAgent: req.get('user-agent'),
        host: req.get('host'),
        routeIdentifier,
        request: {
          headers: this.maskSensitiveHeaders(req.headers),
          query: req.query,
          params: req.params,
        },
      };

      // Add request body if available (captured earlier)
      const requestBodyForLogging = (req as any).__requestBodyForLogging;
      if (requestBodyForLogging) {
        errorDetails.request.body = requestBodyForLogging;
      }

      // Add content type and length information
      if (req.headers['content-type']) {
        errorDetails.request.contentType = req.headers['content-type'];
      }
      if (req.headers['content-length']) {
        errorDetails.request.contentLength = req.headers['content-length'];
      }

      // Add error code if available
      if ('code' in error) {
        errorDetails.errorCode = (error as any).code;
      }

      // Add syscall info if available (for network errors)
      if ('syscall' in error) {
        errorDetails.syscall = (error as any).syscall;
      }

      // Add errno if available
      if ('errno' in error) {
        errorDetails.errno = (error as any).errno;
      }

      // Capture any upstream response data if available in the error
      if ('response' in error && (error as any).response) {
        const upstreamResponse = (error as any).response;
        errorDetails.upstreamResponse = {
          statusCode: upstreamResponse.statusCode,
          statusMessage: upstreamResponse.statusMessage,
          headers: this.maskSensitiveHeaders(upstreamResponse.headers || {}),
        };
        
        // Capture upstream response body if available
        if (upstreamResponse.data || upstreamResponse.body) {
          let responseBody = upstreamResponse.data || upstreamResponse.body;
          
          // Convert to string if it's not already
          if (typeof responseBody !== 'string') {
            try {
              responseBody = JSON.stringify(responseBody);
            } catch {
              responseBody = String(responseBody);
            }
          }
          
          // Limit response body size for logging (max 2KB)
          const maxBodySize = 2048;
          if (responseBody.length > maxBodySize) {
            responseBody = responseBody.substring(0, maxBodySize) + '... [truncated]';
          }
          
          errorDetails.upstreamResponse.body = responseBody;
        }
      }

      logger.error(`Proxy error for ${routeIdentifier}${route.cors ? ' (CORS enabled)' : ''}`, errorDetails);
    }
    
    if (!res.headersSent) {
      const errorResponse: any = {
        error: 'Bad Gateway',
        message: customErrorResponse?.message || 'The upstream server is not responding',
      };
      
      if (customErrorResponse?.code) {
        errorResponse.code = customErrorResponse.code;
      }
      
      // Log the response body we're sending back to the client
      if (logErrors) {
        logger.debug(`Sending error response to client for ${routeIdentifier}`, {
          statusCode: 502,
          responseBody: errorResponse,
          clientIP: this.getClientIP(req),
          url: req.url,
          method: req.method,
        });
      }
      
      res.status(502).json(errorResponse);
    }
  }

  // WebSocket service interface methods
  async getProcesses(): Promise<any[]> {
    const processes = processManager.getProcessStatus();
    return processes.map(process => ({
      id: process.id,
      name: process.name || process.id,
      status: process.isRunning ? 'running' : 'stopped',
      port: this.getProcessPort(process.id),
      pid: process.pid,
      restartAttempts: process.restartCount,
      lastRestartTime: process.lastRestartTime?.toISOString(),
      healthFailures: process.healthCheckFailures,
      startTime: process.startTime?.toISOString(),
      uptime: process.uptime,
      logFile: process.logFile,
      pidFile: process.pidFile,
      isReconnected: process.isReconnected
    }));
  }

  async getStatusData(): Promise<any> {
    const status = this.getStatus();
    return {
      processes: status.processes,
      uptime: status.uptime,
      timestamp: new Date().toISOString()
    };
  }

  async getProcessLogs(processId: string, lines: number): Promise<string[]> {
    try {
      const process = processManager.getProcessStatus().find(p => p.id === processId);
      if (!process?.logFile) {
        return [];
      }

      const logContent = await fs.readFile(process.logFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim());
      return logLines.slice(-lines);
    } catch (error) {
      logger.error('Failed to read process logs', { processId, error });
      return [];
    }
  }

  private getProcessPort(processId: string): number | null {
    // Extract port from process configuration if available
    // This is a simplified implementation - you might want to enhance this
    const process = processManager.getProcessStatus().find(p => p.id === processId);
    if (process?.name?.includes('8888')) return 8888;
    if (process?.name?.includes('8890')) return 8890;
    if (process?.name?.includes('8892')) return 8892;
    return null;
  }

  private async broadcastProcessUpdates(): Promise<void> {
    try {
      const processes = await this.getProcesses();
      this.webSocketService.broadcastProcessUpdate(processes);
      
      const status = await this.getStatusData();
      this.webSocketService.broadcastStatusUpdate(status);
    } catch (error) {
      logger.error('Failed to broadcast process updates', error);
    }
  }
} 