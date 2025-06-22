import express from 'express';
import cors from 'cors';
import path from 'path';
import * as fs from 'fs-extra';
import { logger } from '../utils/logger';

// Types for config and proxyServer are imported from their respective modules
import { ServerConfig } from '../types';
import { processManager } from './process-manager';
import { statisticsService } from './statistics';
import { cacheService } from './cache';

export function registerManagementEndpoints(
  managementApp: express.Application,
  config: ServerConfig,
  proxyServer: any // Use ProxyServer type if available
) {
  // Setup basic middleware for management app
  managementApp.use(express.json({ limit: '10mb' }));
  managementApp.use(express.urlencoded({ extended: true, limit: '10mb' }));
  managementApp.use(cors());

  // Trust proxy headers for management interface
  managementApp.set('trust proxy', true);

  // Serve static files for the management interface
  managementApp.use('/', express.static(path.join(__dirname, '../static/management')));

  // API endpoints for process management
  managementApp.get('/api/processes', (req, res) => {
    try {
      const processes = processManager.getProcessStatus();
      const availableProcesses = config.processManagement?.processes || {};
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
      const availableProcesses = config.processManagement?.processes || {};
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
      if (!config.processManagement?.processes[id]) {
        return res.status(404).json({ success: false, error: 'Process configuration not found' });
      }
      const processConfig = config.processManagement.processes[id];
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
      const configFilePath = config.processConfigFile 
        ? path.resolve(process.cwd(), config.processConfigFile)
        : path.resolve(process.cwd(), 'config', 'processes.yaml');
      const newConfig = await processManager.loadProcessConfig(configFilePath);
      if (!newConfig) {
        return res.status(500).json({ success: false, error: 'Failed to load process configuration file' });
      }
      await proxyServer.handleProcessConfigUpdate(newConfig);
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

  managementApp.get('/api/status', (req, res) => {
    try {
      const status = proxyServer.getStatus();
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
      const period = req.query.period || '24h';
      const stats = statisticsService.getCurrentStats();
      
      // Filter data based on period
      let filteredStats = stats;
      if (period !== 'all') {
        const now = Date.now();
        let cutoffTime = now;
        
        switch (period) {
          case '1h':
            cutoffTime = now - (60 * 60 * 1000);
            break;
          case '24h':
            cutoffTime = now - (24 * 60 * 60 * 1000);
            break;
          case '7d':
            cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            cutoffTime = now - (30 * 24 * 60 * 60 * 1000);
            break;
          default:
            cutoffTime = now - (24 * 60 * 60 * 1000); // Default to 24h
        }
        
        // Filter details by timestamp - we'll filter the byIP details
        if (stats.details && stats.details.byIP) {
          const filteredByIP = stats.details.byIP.filter((ipStat: any) => {
            const lastSeen = new Date(ipStat.lastSeen).getTime();
            return lastSeen >= cutoffTime;
          });
          
          filteredStats = {
            ...stats,
            details: {
              ...stats.details,
              byIP: filteredByIP
            }
          };
        }
      }
      
      res.json({ 
        success: true, 
        data: filteredStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get statistics', error);
      res.status(500).json({ success: false, error: 'Failed to get statistics' });
    }
  });

  managementApp.get('/api/certificates', async (req, res) => {
    try {
      const status = proxyServer.getStatus();
      const certificates = Array.isArray(status.certificates) ? status.certificates : [];
      
      // Get Let's Encrypt status from the proxy server
      const letsEncryptStatus = {
        email: config.letsEncrypt?.email || 'Not configured',
        staging: config.letsEncrypt?.staging || false,
        certDir: config.letsEncrypt?.certDir || 'Not configured',
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
} 