import express from 'express';
import cors from 'cors';
import path from 'path';
import * as fs from 'fs-extra';
import { logger } from '../utils/logger';
import { WebSocketService } from './websocket';

// Types for config and proxyServer are imported from their respective modules
import { ServerConfig, MainConfig } from '../types';
import { configService } from './config-service';
import { processManager } from './process-manager';
import { statisticsService } from './statistics';
import { cacheService } from './cache';

export function registerManagementEndpoints(
  managementApp: express.Application,
  config: ServerConfig,
  proxyServer: any, // Use ProxyServer type if available
  statisticsService: any,
  mainConfig?: MainConfig
) {
  // Setup basic middleware for management app
  managementApp.use(express.json({ limit: '10mb' }));
  managementApp.use(express.urlencoded({ extended: true, limit: '10mb' }));
  managementApp.use(cors());

  // Trust proxy headers for management interface
  managementApp.set('trust proxy', true);

  // Serve static files for the management interface
  managementApp.use('/', express.static(path.join(__dirname, '../static/management')));

  // Store WebSocket service reference for later initialization
  (managementApp as any).webSocketService = new WebSocketService(proxyServer);

  // Set up process update callback for WebSocket broadcasts
  processManager.setProcessUpdateCallback(async () => {
    try {
      const processes = await proxyServer.getProcesses();
      (managementApp as any).webSocketService.broadcast({
        type: 'processes',
        data: processes,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error broadcasting process updates', error);
    }
  });

  // Set up configuration change handling for WebSocket broadcasts
  configService.on('configReloading', () => {
    logger.info('Management: Configuration reloading...');
    (managementApp as any).webSocketService.broadcast({
      type: 'configReloading',
      timestamp: new Date().toISOString()
    });
  });

  configService.on('configReloaded', (newConfigs: any) => {
    logger.info('Management: Configuration reloaded, broadcasting update...');
    (managementApp as any).webSocketService.broadcast({
      type: 'configReloaded',
      data: {
        routes: newConfigs.serverConfig?.routes?.length || 0,
        processes: Object.keys(newConfigs.processConfig?.processes || {}).length
      },
      timestamp: new Date().toISOString()
    });
  });

  configService.on('configReloadError', (error: any) => {
    logger.error('Management: Configuration reload failed', error);
    (managementApp as any).webSocketService.broadcast({
      type: 'configReloadError',
      error: error.message || 'Configuration reload failed',
      timestamp: new Date().toISOString()
    });
  });

  // Initialize WebSocket after server starts listening
  (managementApp as any).initializeWebSocket = (httpServer: any) => {
    try {
      (managementApp as any).webSocketService.initialize(httpServer);
      logger.info('WebSocket service initialized for management console');
    } catch (error) {
      logger.error('Failed to initialize WebSocket service', error);
    }
  };

  // Health endpoint for debugging
  managementApp.get('/health', (req, res) => {
    try {
      const certificates = proxyServer.proxyCertificates?.getAllCertificates() || new Map();
      const validCertificates = Array.from(certificates.values()).filter((cert: any) => cert.isValid);

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        certificates: {
          total: certificates.size,
          valid: validCertificates.length,
          domains: Array.from(certificates.keys()),
          validDomains: validCertificates.map((cert: any) => cert.domain),
        },
        servers: {
          http: !!proxyServer.httpServer,
          https: !!proxyServer.httpsServer,
          management: !!proxyServer.managementServer,
        },
        config: {
          httpPort: configService.getServerConfig().port,
          httpsPort: configService.getServerConfig().httpsPort,
          routes: configService.getServerConfig().routes.length,
        },
      });
    } catch (error) {
      logger.error('Health check failed', error);
      res.status(500).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // API endpoints for process management
  managementApp.get('/api/processes', (req, res) => {
    try {
      const processes = processManager.getProcessStatus();
      const availableProcesses = configService.getProcesses() || {};
      // Ensure processes is an array
      const processesArray = Array.isArray(processes) ? processes : [];
      // Create a set of all process IDs (both configured and managed)
      const allProcessIds = new Set([
        ...Object.keys(availableProcesses),
        ...processesArray.map(p => p.id)
      ]);
      const processList = Array.from(allProcessIds).map(processId => {
        const processConfig = availableProcesses[processId];
        const runningProcess = processesArray.find(p => p.id === processId);
        // If process is not in current config but exists in process manager, it's been removed
        const isRemoved = !processConfig && runningProcess;
        // Convert isRunning to status string for HTML compatibility
        let status = 'stopped';
        if (runningProcess?.isRunning) {
          status = 'running';
        } else if (runningProcess?.isStopped) {
          status = 'stopped';
        } else if (runningProcess?.isReconnected) {
          status = 'starting';
        }

        // Get scheduler information
        const scheduler = processManager.getScheduler();
        const scheduledProcess = scheduler.getScheduledProcess(processId);

        return {
          id: processId,
          name: processConfig?.name || runningProcess?.name || `proxy-${processId}`,
          description: `Process ${processId}`,
          status: status,
          enabled: processConfig?.enabled ?? true,
          command: processConfig?.command,
          args: processConfig?.args,
          cwd: processConfig?.cwd,
          env: processConfig?.env,
          isRunning: runningProcess?.isRunning || false,
          pid: runningProcess?.pid,
          restartCount: runningProcess?.restartCount || 0,
          startTime: runningProcess?.startTime,
          lastRestartTime: runningProcess?.lastRestartTime,
          uptime: runningProcess?.uptime,
          memoryUsage: 'N/A',
          healthCheckFailures: runningProcess?.healthCheckFailures || 0,
          pidFile: runningProcess?.pidFile,
          logFile: runningProcess?.logFile,
          isReconnected: runningProcess?.isReconnected || false,
          isStopped: runningProcess?.isStopped || false,
          isRemoved: isRemoved || runningProcess?.isRemoved || false,
          schedule: processConfig?.schedule,
          scheduledInfo: scheduledProcess ? {
            lastRun: scheduledProcess.lastRun,
            nextRun: scheduledProcess.nextRun,
            runCount: scheduledProcess.runCount,
            lastError: scheduledProcess.lastError
          } : null
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

  managementApp.get('/api/processes/:id', (req, res) => {
    try {
      const { id } = req.params;
      const availableProcesses = configService.getProcesses() || {};
      const processConfig = availableProcesses[id];
      const processes = processManager.getProcessStatus();
      const processesArray = Array.isArray(processes) ? processes : [];
      const runningProcess = processesArray.find(p => p.id === id);
      // If process is not in current config but exists in process manager, it's been removed
      const isRemoved = !processConfig && runningProcess;
      if (!processConfig && !runningProcess) {
        return res.status(404).json({ success: false, error: 'Process not found' });
      }
      const processInfo = {
        id,
        name: processConfig?.name || runningProcess?.name || `proxy-${id}`,
        enabled: processConfig?.enabled ?? true,
        command: processConfig?.command,
        args: processConfig?.args,
        cwd: processConfig?.cwd,
        env: processConfig?.env,
        restartOnExit: processConfig?.restartOnExit,
        restartDelay: processConfig?.restartDelay,
        maxRestarts: processConfig?.maxRestarts,
        healthCheck: processConfig?.healthCheck,
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
        isStopped: runningProcess?.isStopped || false,
        isRemoved: isRemoved || runningProcess?.isRemoved || false,
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

  managementApp.post('/api/processes/:id/start', async (req, res) => {
    try {
      const { id } = req.params;
      if (!config.processManagement?.processes[id]) {
        return res.status(404).json({ success: false, error: 'Process configuration not found' });
      }
      const processConfig = config.processManagement.processes[id];
      const target = proxyServer.getTargetForProcess(id, processConfig);
      await processManager.startProcess(id, processConfig, target);
      logger.info(`Process ${id} started via management interface`);
      return res.json({ success: true, message: `Process ${id} started successfully` });
    } catch (error) {
      logger.error(`Failed to start process ${req.params.id}`, error);
      return res.status(500).json({ success: false, error: `Failed to start process: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });

  managementApp.post('/api/processes/:id/stop', async (req, res) => {
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

  managementApp.post('/api/processes/:id/restart', async (req, res) => {
    try {
      const { id } = req.params;
      const processConfig = configService.getProcessById(id);
      if (!processConfig) {
        return res.status(404).json({ success: false, error: 'Process configuration not found' });
      }
      const target = proxyServer.getTargetForProcess(id, processConfig);
      await processManager.forceKillAndRestartProcess(id, target);
      logger.info(`Process ${id} restarted via management interface`);
      return res.json({ success: true, message: `Process ${id} restarted successfully` });
    } catch (error) {
      logger.error(`Failed to restart process ${req.params.id}`, error);
      return res.status(500).json({ success: false, error: `Failed to restart process: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });

  managementApp.post('/api/processes/reload', async (req, res) => {
    try {
      await configService.reload();
      logger.info('Process configuration reloaded via management interface');
      return res.json({ success: true, message: 'Process configuration reloaded successfully' });
    } catch (error) {
      logger.error('Failed to reload process configuration', error);
      return res.status(500).json({ success: false, error: `Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });

  managementApp.get('/api/processes/:id/logs', async (req, res) => {
    try {
      const { id } = req.params;
      const { lines = 100 } = req.query;
      const processes = processManager.getProcessStatus();
      const processesArray = Array.isArray(processes) ? processes : [];
      const process = processesArray.find(p => p.id === id);
      if (!process || !process.logFile) {
        return res.status(404).json({ success: false, error: 'Process or log file not found' });
      }
      if (!await fs.pathExists(process.logFile)) {
        return res.json({ success: true, data: { logs: [], message: 'Log file not found or empty' } });
      }
      const logContent = await fs.readFile(process.logFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim());
      const requestedLines = Math.min(parseInt(lines as string) || 100, 10000); // Increased limit to 10,000 lines
      const recentLogs = logLines.slice(-requestedLines);
      return res.json({
        success: true,
        data: { logs: recentLogs },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Failed to get logs for process ${req.params.id}`, error);
      return res.status(500).json({ success: false, error: 'Failed to read log file' });
    }
  });

  managementApp.get('/api/status', async (req, res) => {
    try {
      const status = await proxyServer.getStatusData();
      res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get status', error);
      res.status(500).json({ success: false, error: 'Failed to get status' });
    }
  });

  managementApp.get('/api/statistics', (req, res) => {
    try {
      const period = (req.query.period as string) || '24h';

      // Use getTimePeriodStats for better route data when period is specified
      if (period !== 'all') {
        // Pass route configs for name lookup
        const routeConfigs = configService.getRoutes().map(r => ({ domain: r.domain, path: r.path, target: r.target, name: r.name }));
        const timePeriodStats = statisticsService.getTimePeriodStats(period, routeConfigs);

        // Aggregate country data from routes for heatmap
        const countryCounts = new Map<string, number>();
        timePeriodStats.routes.forEach((route: any) => {
          route.topCountries.forEach((country: any) => {
            if (country.country && country.country !== 'Unknown') {
              countryCounts.set(country.country, (countryCounts.get(country.country) || 0) + country.count);
            }
          });
        });

        const topCountries = Array.from(countryCounts.entries())
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        // Calculate request type statistics from routes
        const requestTypeCounts = new Map<string, number>();
        timePeriodStats.routes.forEach((route: any) => {
          const requestType = route.requestType || 'proxy';
          requestTypeCounts.set(requestType, (requestTypeCounts.get(requestType) || 0) + route.requests);
        });

        const requestTypes = Array.from(requestTypeCounts.entries())
          .map(([type, count]) => ({
            type,
            count,
            percentage: (count / timePeriodStats.totalRequests) * 100
          }))
          .sort((a, b) => b.count - a.count);

        res.json({
          success: true,
          data: {
            summary: {
              totalRequests: timePeriodStats.totalRequests,
              uniqueIPs: timePeriodStats.totalRequests, // This is approximate
              uniqueCountries: timePeriodStats.uniqueCountries,
              uniqueCities: 0, // Not available in time period stats
              topCountries: topCountries,
              topCities: [], // Not available in time period stats
              topIPs: [], // Not available in time period stats
              requestsByHour: [], // Not available in time period stats
              requestsByDay: [], // Not available in time period stats
              requestTypes: requestTypes
            },
            routes: timePeriodStats.routes,
            avgResponseTime: timePeriodStats.avgResponseTime,
            period: timePeriodStats.period
          },
          timestamp: new Date().toISOString()
        });
      } else {
        // Use getCurrentStats for all-time data
        const stats = statisticsService.getCurrentStats();

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Failed to get statistics', error);
      res.status(500).json({ success: false, error: 'Failed to get statistics' });
    }
  });

  managementApp.get('/api/certificates', async (req, res) => {
    try {
      const status = proxyServer.getStatus();
      const certificatesMap = status.certificates;

      // Convert Map to array of certificate objects
      const certificates: any[] = [];
      certificatesMap.forEach((certInfo: any, domain: string) => {
        certificates.push({
          domain,
          ...certInfo,
          expiresAt: certInfo.expiresAt.toISOString(),
          createdAt: certInfo.createdAt?.toISOString()
        });
      });

      // Get Let's Encrypt status from the proxy server
      const serverConfig = configService.getServerConfig();
      const letsEncryptStatus = {
        email: serverConfig.letsEncrypt?.email || 'Not configured',
        staging: serverConfig.letsEncrypt?.staging || false,
        certDir: serverConfig.letsEncrypt?.certDir || 'Not configured',
        totalCertificates: certificates.length,
        validCertificates: certificates.filter((cert: any) => cert && cert.isValid).length,
        expired: certificates.filter((cert: any) => cert && !cert.isValid).length,
        expiringSoon: certificates.filter((cert: any) => {
          if (!cert || !cert.isValid) return false;
          const expiryDate = new Date(cert.expiresAt);
          const now = new Date();
          const daysUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return daysUntilExpiry <= 30;
        }).length
      };

      res.json({
        success: true,
        data: {
          certificates,
          letsEncryptStatus
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get certificates', error);
      res.status(500).json({ success: false, error: 'Failed to get certificates' });
    }
  });

  managementApp.get('/api/statistics/summary', (req, res) => {
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

  managementApp.post('/api/statistics/generate-report', async (req, res) => {
    try {
      const report = statisticsService.getCurrentStats();
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

  managementApp.post('/api/statistics/save', async (req, res) => {
    try {
      await statisticsService.forceSave();
      res.json({
        success: true,
        message: 'Statistics saved successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to save statistics', error);
      res.status(500).json({ success: false, error: 'Failed to save statistics' });
    }
  });

  managementApp.post('/api/statistics/backup', async (req, res) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.resolve(process.cwd(), 'data', 'statistics', 'backups');
      const backupFile = path.join(backupDir, `stats-backup-${timestamp}.json`);
      await fs.ensureDir(backupDir);
      await statisticsService.forceSave();
      const currentFile = path.resolve(process.cwd(), 'data', 'statistics', 'current-stats.json');
      if (await fs.pathExists(currentFile)) {
        await fs.copy(currentFile, backupFile);
        const stats = await fs.stat(backupFile);
        res.json({
          success: true,
          message: 'Statistics backup created successfully',
          data: {
            backupFile,
            size: stats.size,
            timestamp: stats.mtime.toISOString()
          }
        });
      } else {
        res.status(404).json({ success: false, error: 'No current statistics file found' });
      }
    } catch (error) {
      logger.error('Failed to create statistics backup', error);
      res.status(500).json({ success: false, error: 'Failed to create statistics backup' });
    }
  });

  // Cache management endpoints
  managementApp.get('/api/cache/stats', async (req, res) => {
    try {
      const stats = await cacheService.getStats();
      res.json({
        success: true,
        data: {
          ...stats,
          oldestEntry: stats.oldestEntry ? new Date(stats.oldestEntry).toISOString() : undefined,
          newestEntry: stats.newestEntry ? new Date(stats.newestEntry).toISOString() : undefined,
          maxAge: '24 hours',
          cacheDir: cacheService['cacheDir'] // Access private property for display
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get cache stats', error);
      res.status(500).json({ success: false, error: 'Failed to get cache stats' });
    }
  });

  managementApp.get('/api/cache/entries', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const userId = req.query.userId as string;
      const inMRU = req.query.inMRU as string;

      let entries = await cacheService.getAllEntries();

      // Filter by user if specified
      if (userId) {
        entries = entries.filter(entry => entry.userId === userId);
      }

      // Filter by MRU status if specified
      if (inMRU !== undefined) {
        const mruFilter = inMRU === 'true';
        entries = entries.filter(entry => entry.inMRU === mruFilter);
      }

      // Apply pagination
      const total = entries.length;
      const paginatedEntries = entries.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          entries: paginatedEntries.map(entry => ({
            ...entry,
            timestamp: new Date(entry.timestamp).toISOString(),
            lastAccessed: entry.lastAccessed ? new Date(entry.lastAccessed).toISOString() : undefined,
          })),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get cache entries', error);
      res.status(500).json({ success: false, error: 'Failed to get cache entries' });
    }
  });

  managementApp.get('/api/cache/users', async (req, res) => {
    try {
      const entries = await cacheService.getAllEntries();

      // Group entries by user
      const userStats = new Map<string, {
        userId: string;
        entryCount: number;
        mruCount: number;
        totalSize: number;
        lastActivity: number;
        userTypes: Set<string>;
      }>();

      for (const entry of entries) {
        const userId = entry.userId || 'anonymous';
        const userType = entry.userId ? entry.userId.split(':')[0] : 'ip';

        if (!userStats.has(userId)) {
          userStats.set(userId, {
            userId,
            entryCount: 0,
            mruCount: 0,
            totalSize: 0,
            lastActivity: 0,
            userTypes: new Set(),
          });
        }

        const stats = userStats.get(userId)!;
        stats.entryCount++;
        stats.totalSize += entry.bodySize;
        stats.userTypes.add(userType);

        if (entry.inMRU) {
          stats.mruCount++;
        }

        if (entry.lastAccessed && entry.lastAccessed > stats.lastActivity) {
          stats.lastActivity = entry.lastAccessed;
        } else if (entry.timestamp > stats.lastActivity) {
          stats.lastActivity = entry.timestamp;
        }
      }

      const users = Array.from(userStats.values()).map(stats => ({
        ...stats,
        userTypes: Array.from(stats.userTypes),
        lastActivity: new Date(stats.lastActivity).toISOString(),
      }));

      // Sort by last activity (most recent first)
      users.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

      res.json({
        success: true,
        data: users,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get cache users', error);
      res.status(500).json({ success: false, error: 'Failed to get cache users' });
    }
  });

  managementApp.get('/api/cache/users/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const entries = await cacheService.getUserEntries(userId);

      const userStats = {
        userId,
        entryCount: entries.length,
        mruCount: entries.filter(e => e.inMRU).length,
        totalSize: entries.reduce((sum, e) => sum + e.bodySize, 0),
        lastActivity: entries.length > 0 ? Math.max(...entries.map(e => e.lastAccessed || e.timestamp)) : 0,
        userTypes: new Set(entries.map(e => e.userId?.split(':')[0] || 'ip')),
      };

      res.json({
        success: true,
        data: {
          stats: {
            ...userStats,
            lastActivity: new Date(userStats.lastActivity).toISOString(),
            userTypes: Array.from(userStats.userTypes),
          },
          entries: entries.map(entry => ({
            ...entry,
            timestamp: new Date(entry.timestamp).toISOString(),
            lastAccessed: entry.lastAccessed ? new Date(entry.lastAccessed).toISOString() : undefined,
          }))
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get user cache entries', error);
      res.status(500).json({ success: false, error: 'Failed to get user cache entries' });
    }
  });

  managementApp.post('/api/cache/clear', async (req, res) => {
    try {
      await cacheService.clear();
      res.json({
        success: true,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to clear cache', error);
      res.status(500).json({ success: false, error: 'Failed to clear cache' });
    }
  });

  managementApp.post('/api/cache/cleanup', async (req, res) => {
    try {
      await cacheService.cleanup();
      res.json({
        success: true,
        message: 'Cache cleanup completed',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to cleanup cache', error);
      res.status(500).json({ success: false, error: 'Failed to cleanup cache' });
    }
  });

  managementApp.post('/api/cache/users/:userId/clear', async (req, res) => {
    try {
      const { userId } = req.params;
      await cacheService.clearUserCache(userId);
      res.json({
        success: true,
        message: `Cache cleared for user ${userId}`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to clear user cache', error);
      res.status(500).json({ success: false, error: 'Failed to clear user cache' });
    }
  });

  managementApp.delete('/api/cache/:target', async (req, res) => {
    try {
      const { target } = req.params;
      const method = req.query.method as string || 'GET';
      const userId = req.query.userId as string;
      const userIP = req.query.userIP as string;

      await cacheService.delete(target, method, userId, userIP);
      res.json({
        success: true,
        message: `Cache entry for ${method} ${target} deleted successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to delete cache entry', error);
      res.status(500).json({ success: false, error: 'Failed to delete cache entry' });
    }
  });

  managementApp.post('/api/statistics/clear', (req, res) => {
    try {
      statisticsService.clearAll();
      res.json({ success: true, message: 'Statistics cleared' });
    } catch (error) {
      logger.error('Failed to clear statistics', error);
      res.status(500).json({ success: false, error: 'Failed to clear statistics' });
    }
  });

  // Scheduler endpoints
  managementApp.get('/api/scheduler', (req, res) => {
    try {
      const scheduler = processManager.getScheduler();
      const scheduledProcesses = scheduler.getScheduledProcesses();

      const schedulerInfo = {
        totalScheduled: scheduledProcesses.length,
        processes: scheduledProcesses.map(sp => ({
          id: sp.id,
          cron: sp.config.schedule?.cron,
          timezone: sp.config.schedule?.timezone || 'UTC',
          lastRun: sp.lastRun,
          nextRun: sp.nextRun,
          runCount: sp.runCount,
          lastError: sp.lastError,
          isRunning: sp.isRunning
        }))
      };

      res.json({
        success: true,
        data: schedulerInfo,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get scheduler information', error);
      res.status(500).json({ success: false, error: 'Failed to get scheduler information' });
    }
  });

  managementApp.post('/api/scheduler/validate-cron', (req, res) => {
    try {
      const { cronExpression, timezone = 'UTC' } = req.body;

      if (!cronExpression) {
        return res.status(400).json({ success: false, error: 'Cron expression is required' });
      }

      const scheduler = processManager.getScheduler();
      const isValid = scheduler.validateCronExpression(cronExpression);
      const nextRun = isValid ? scheduler.getNextRunTime(cronExpression, timezone) : null;

      res.json({
        success: true,
        data: {
          isValid,
          nextRun,
          cronExpression,
          timezone
        }
      });
    } catch (error) {
      logger.error('Failed to validate cron expression', error);
      res.status(500).json({ success: false, error: 'Failed to validate cron expression' });
    }
  });

  // YAML validation endpoint
  managementApp.post('/api/config/:type/validate', async (req, res) => {
    try {
      const { type } = req.params;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ success: false, error: 'Configuration content is required' });
      }

      // Enhanced YAML validation with detailed error information
      const { validateYAML, validateProcessConfigYAML, formatYAMLError } = await import('../utils/yaml-validator');

      let validationResult;
      if (type === 'processes') {
        validationResult = validateProcessConfigYAML(content);
      } else {
        validationResult = validateYAML(content);
      }

      if (validationResult.isValid) {
        res.json({
          success: true,
          message: 'YAML is valid',
          data: { isValid: true }
        });
      } else {
        const formattedError = formatYAMLError(validationResult);
        res.json({
          success: false,
          error: 'YAML validation failed',
          details: formattedError,
          line: validationResult.line,
          column: validationResult.column,
          suggestions: validationResult.suggestions,
          data: validationResult
        });
      }
    } catch (error) {
      logger.error(`Failed to validate ${req.params.type} configuration`, error);
      res.status(500).json({ success: false, error: 'Failed to validate configuration' });
    }
  });

  // Configuration editor endpoints
  managementApp.get('/api/config/:type', async (req, res) => {
    try {
      const { type } = req.params;
      let configPath: string;
      let configData: any;

      switch (type) {
        case 'proxy':
          configPath = path.resolve(process.cwd(), 'config', 'main.yaml');
          break;
        case 'processes':
          configPath = path.resolve(process.cwd(), 'config', 'processes.yaml');
          break;
        default:
          return res.status(400).json({ success: false, error: 'Invalid config type' });
      }

      if (!await fs.pathExists(configPath)) {
        return res.status(404).json({ success: false, error: 'Configuration file not found' });
      }

      const configContent = await fs.readFile(configPath, 'utf8');
      const { parse } = await import('yaml');
      configData = parse(configContent);

      res.json({
        success: true,
        data: {
          content: configContent,
          parsed: configData,
          path: configPath,
          lastModified: (await fs.stat(configPath)).mtime
        }
      });
    } catch (error) {
      logger.error(`Failed to read ${req.params.type} configuration`, error);
      res.status(500).json({ success: false, error: 'Failed to read configuration' });
    }
  });

  managementApp.post('/api/config/:type/backup', async (req, res) => {
    try {
      const { type } = req.params;
      let configPath: string;

      switch (type) {
        case 'proxy':
          configPath = path.resolve(process.cwd(), 'config', 'main.yaml');
          break;
        case 'processes':
          configPath = path.resolve(process.cwd(), 'config', 'processes.yaml');
          break;
        default:
          return res.status(400).json({ success: false, error: 'Invalid config type' });
      }

      if (!await fs.pathExists(configPath)) {
        return res.status(404).json({ success: false, error: 'Configuration file not found' });
      }

      // Get backup directory from config service or use default
      const backupDir = configService.getSetting<string>('backupDir') || './config/backup';
      await fs.ensureDir(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const configName = path.basename(configPath, '.yaml');
      const backupPath = path.join(backupDir, `${configName}.backup-${timestamp}.yaml`);

      await fs.copyFile(configPath, backupPath);

      res.json({
        success: true,
        data: {
          backupPath,
          originalPath: configPath,
          timestamp
        },
        message: 'Configuration backed up successfully'
      });
    } catch (error) {
      logger.error(`Failed to backup ${req.params.type} configuration`, error);
      res.status(500).json({ success: false, error: 'Failed to backup configuration' });
    }
  });

  managementApp.post('/api/config/:type/save', async (req, res) => {
    try {
      const { type } = req.params;
      const { content, createBackup = true } = req.body;

      if (!content) {
        return res.status(400).json({ success: false, error: 'Configuration content is required' });
      }

      let configPath: string;

      switch (type) {
        case 'proxy':
          configPath = path.resolve(process.cwd(), 'config', 'main.yaml');
          break;
        case 'processes':
          configPath = path.resolve(process.cwd(), 'config', 'processes.yaml');
          break;
        default:
          return res.status(400).json({ success: false, error: 'Invalid config type' });
      }

      // Enhanced YAML validation with detailed error information
      const { validateYAML, validateProcessConfigYAML, formatYAMLError } = await import('../utils/yaml-validator');

      let validationResult;
      if (type === 'processes') {
        validationResult = validateProcessConfigYAML(content);
      } else {
        validationResult = validateYAML(content);
      }

      if (!validationResult.isValid) {
        const formattedError = formatYAMLError(validationResult);
        return res.status(400).json({
          success: false,
          error: 'YAML validation failed',
          details: formattedError,
          line: validationResult.line,
          column: validationResult.column,
          suggestions: validationResult.suggestions
        });
      }

      // Create backup if requested
      let backupPath: string | null = null;
      if (createBackup && await fs.pathExists(configPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = configService.getSetting<string>('backupDir') || './config/backup';
        await fs.ensureDir(backupDir);
        const configName = path.basename(configPath, '.yaml');
        backupPath = path.join(backupDir, `${configName}.backup-${timestamp}.yaml`);
        await fs.copyFile(configPath, backupPath);
      }

      // Write new configuration
      await fs.writeFile(configPath, content, 'utf8');

      res.json({
        success: true,
        data: {
          configPath,
          backupPath,
          lastModified: new Date().toISOString()
        },
        message: 'Configuration saved successfully'
      });
    } catch (error) {
      logger.error(`Failed to save ${req.params.type} configuration`, error);
      res.status(500).json({ success: false, error: 'Failed to save configuration' });
    }
  });

  managementApp.get('/api/config/:type/backups', async (req, res) => {
    try {
      const { type } = req.params;
      let configPath: string;

      switch (type) {
        case 'proxy':
          configPath = path.resolve(process.cwd(), 'config', 'main.yaml');
          break;
        case 'processes':
          configPath = path.resolve(process.cwd(), 'config', 'processes.yaml');
          break;
        default:
          return res.status(400).json({ success: false, error: 'Invalid config type' });
      }

      // Get backup directory from config service or use default
      const backupDir = configService.getSetting<string>('backupDir') || './config/backup';
      const configName = path.basename(configPath, '.yaml');
      const backupPattern = `${configName}.backup-*.yaml`;

      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.match(new RegExp(`${configName}\\.backup-.*\\.yaml`)))
        .map(file => {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            lastModified: stats.mtime,
            timestamp: file.match(/backup-(.+)\.yaml/)?.[1] || null
          };
        })
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      res.json({
        success: true,
        data: backupFiles
      });
    } catch (error) {
      logger.error(`Failed to list ${req.params.type} configuration backups`, error);
      res.status(500).json({ success: false, error: 'Failed to list configuration backups' });
    }
  });

  managementApp.post('/api/config/:type/restore', async (req, res) => {
    try {
      const { type } = req.params;
      const { backupPath } = req.body;

      if (!backupPath) {
        return res.status(400).json({ success: false, error: 'Backup path is required' });
      }

      let configPath: string;

      switch (type) {
        case 'proxy':
          configPath = path.resolve(process.cwd(), 'config', 'main.yaml');
          break;
        case 'processes':
          configPath = path.resolve(process.cwd(), 'config', 'processes.yaml');
          break;
        default:
          return res.status(400).json({ success: false, error: 'Invalid config type' });
      }

      if (!await fs.pathExists(backupPath)) {
        return res.status(404).json({ success: false, error: 'Backup file not found' });
      }

      // Create backup of current config before restoring
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = configService.getSetting<string>('backupDir') || './config/backup';
      await fs.ensureDir(backupDir);
      const configName = path.basename(configPath, '.yaml');
      const currentBackupPath = path.join(backupDir, `${configName}.backup-${timestamp}.yaml`);
      await fs.copyFile(configPath, currentBackupPath);

      // Restore from backup
      await fs.copyFile(backupPath, configPath);

      res.json({
        success: true,
        data: {
          configPath,
          restoredFrom: backupPath,
          currentBackup: currentBackupPath
        },
        message: 'Configuration restored successfully'
      });
    } catch (error) {
      logger.error(`Failed to restore ${req.params.type} configuration`, error);
      res.status(500).json({ success: false, error: 'Failed to restore configuration' });
    }
  });
} 