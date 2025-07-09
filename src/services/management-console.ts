import { Server, ServerWebSocket } from 'bun';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import managementHtml from '../frontend/management/index.html';
import { ProxyConfig } from '../types';
import { logger } from '../utils/logger';
import { cacheService } from './cache';
import { configService } from './config-service';
import { ProcessManager } from './process-manager';
import { ProxyCertificates } from './proxy-certificates';
import { getStatisticsService, StatisticsService } from './statistics';
import { stringify as yamlStringify } from 'yaml';
import * as fs from 'fs-extra';

export class ManagementConsole {
  private managementServer: Server | null = null;
  private config: ProxyConfig;
  private statisticsService: StatisticsService;
  private managementWebSockets: Set<ServerWebSocket<unknown>> = new Set();
  private logWatchers: Map<string, Set<ServerWebSocket<unknown>>> = new Map(); // processId -> Set of WebSocket clients
  private processManager: ProcessManager;

  constructor(config: ProxyConfig, processManager: ProcessManager) {
    this.config = config;
    this.processManager = processManager;

    // Get the statistics service singleton
    this.statisticsService = getStatisticsService();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing management console...');


    // Set up process update callback
    this.processManager.setProcessUpdateCallback(() => {
      this.broadcastToManagementWebSockets({
        type: 'processes_update',
        data: this.processManager.getProcessStatus(),
        timestamp: new Date().toISOString()
      });
    });

    // Set up log update callback
    this.processManager.setLogUpdateCallback((processId: string, newLogs: string[]) => {
      this.broadcastLogUpdates(processId, newLogs);
    });

    logger.info('Management console initialization complete');
  }

  async start(): Promise<void> {
    logger.info('Starting management console...');

    const managementConfig = configService.getManagementConfig();
    const managementPort = managementConfig?.port || (this.config.port + 1000);
    const managementHost = managementConfig?.host || '0.0.0.0';

    this.managementServer = Bun.serve({
      port: managementPort,
      hostname: managementHost,
      development: process.env.NODE_ENV !== 'production',
      routes: {
        "/frontend/*": managementHtml,

        "/api/status": {
          GET: async (req: Request) => {
            const status = this.getStatus();
            return new Response(JSON.stringify(status), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        },

        "/api/config": {
          GET: async (req: Request) => {
            const config = this.getConfig();
            return new Response(JSON.stringify(config), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        },

        "/api/config/:type": {
          GET: async (req: Request) => {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              let configData: any;
              let configPath: string;

              switch (type) {
                case 'proxy':
                  configData = configService.getServerConfig();
                  configPath = configService.getMainConfig().config.proxy;
                  break;
                case 'processes':
                  configData = configService.getProcessConfig();
                  configPath = configService.getMainConfig().config.processes;
                  break;
                case 'main':
                  configData = configService.getMainConfig();
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ error: 'Invalid config type' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                  });
              }

              // Read the actual file content
              let content = '';
              let lastModified = new Date().toISOString();


              if (existsSync(configPath)) {
                content = readFileSync(configPath, 'utf-8');
                const stats = require('fs').statSync(configPath);
                lastModified = stats.mtime.toISOString();
              } else {
                // If file doesn't exist, stringify the config object
                content = JSON.stringify(configData, null, 2);
              }

              const responseData = {
                content,
                path: configPath,
                lastModified
              };

              return new Response(JSON.stringify({ success: true, data: responseData }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to get config', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/config/:type/save": {
          POST: async (req: Request) => {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              const newConfig = await req.json();
              let configPath: string;

              switch (type) {
                case 'proxy':
                  configPath = configService.getMainConfig().config.proxy;
                  break;
                case 'processes':
                  configPath = configService.getMainConfig().config.processes;
                  break;
                case 'main':
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ error: 'Invalid config type' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                  });
              }

              // Convert to YAML and write to file
              const yamlContent = yamlStringify(newConfig);
              await import('fs-extra').then(fs => fs.writeFile(configPath, yamlContent));
              logger.info(`Config saved for type: ${type} at ${configPath}`);

              // Reload config after saving
              await configService.reload();

              return new Response(JSON.stringify({ success: true, message: 'Configuration saved' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to save config', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/config/:type/backup": {
          POST: async (req: Request) => {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];
            try {
              let configPath: string;
              switch (type) {
                case 'proxy':
                  configPath = configService.getMainConfig().config.proxy;
                  break;
                case 'processes':
                  configPath = configService.getMainConfig().config.processes;
                  break;
                case 'main':
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ error: 'Invalid config type' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                  });
              }
              const backupDir = path.join(path.dirname(configPath), 'backup');
              await fs.ensureDir(backupDir);
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const backupFile = path.join(backupDir, `${type}.backup-${timestamp}.yaml`);
              await fs.copyFile(configPath, backupFile);
              logger.info(`Config backup created for type: ${type} at ${backupFile}`);
              return new Response(JSON.stringify({ success: true, message: 'Backup created successfully', backupPath: backupFile }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to create backup', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/config/:type/backups": {
          GET: async (req: Request) => {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];
            try {
              let configPath: string;
              switch (type) {
                case 'proxy':
                  configPath = configService.getMainConfig().config.proxy;
                  break;
                case 'processes':
                  configPath = configService.getMainConfig().config.processes;
                  break;
                case 'main':
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ error: 'Invalid config type' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                  });
              }
              const backupDir = path.join(path.dirname(configPath), 'backup');
              await fs.ensureDir(backupDir);
              const files = await fs.readdir(backupDir);
              const backups = await Promise.all(
                files
                  .filter(f => f.startsWith(`${type}.backup-`) && f.endsWith('.yaml'))
                  .map(async f => {
                    const filePath = path.join(backupDir, f);
                    try {
                      const stats = await fs.stat(filePath);
                      return {
                        path: filePath,
                        name: f,
                        size: stats.size,
                        modified: stats.mtime.toISOString()
                      };
                    } catch {
                      return {
                        path: filePath,
                        name: f,
                        size: null,
                        modified: null
                      };
                    }
                  })
              );
              return new Response(JSON.stringify({ success: true, data: backups }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to list backups', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/config/:type/restore": {
          POST: async (req: Request) => {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];
            try {
              const { backupPath } = await req.json() as { backupPath: string };
              let configPath: string;
              switch (type) {
                case 'proxy':
                  configPath = configService.getMainConfig().config.proxy;
                  break;
                case 'processes':
                  configPath = configService.getMainConfig().config.processes;
                  break;
                case 'main':
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ error: 'Invalid config type' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                  });
              }
              await fs.copyFile(backupPath, configPath);
              logger.info(`Config restored for type: ${type} from ${backupPath}`);
              await configService.reload();
              return new Response(JSON.stringify({ success: true, message: 'Configuration restored successfully' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to restore config', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/config/validate": {
          POST: async (req: Request) => {
            try {
              const body = await req.json() as { content?: string; type?: string };
              const content = body?.content;
              const type = body?.type;

              if (!content || typeof content !== 'string') {
                return new Response(JSON.stringify({
                  success: false,
                  error: 'Invalid content provided'
                }), {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' }
                });
              }

              // Import the YAML validator
              const { validateYAML, validateProcessConfigYAML } = await import('../utils/yaml-validator');

              let validationResult;

              // Use specific validation for process configs
              if (type === 'processes') {
                validationResult = validateProcessConfigYAML(content);
              } else {
                validationResult = validateYAML(content);
              }

              return new Response(JSON.stringify({
                success: true,
                data: validationResult
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({
                success: false,
                error: 'Validation failed',
                details: error instanceof Error ? error.message : 'Unknown error'
              }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/statistics": {
          GET: async (req: Request) => {
            const stats = this.statisticsService.getStatsSummary();
            return new Response(JSON.stringify({ success: true, data: stats }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        },

        "/api/statistics/detailed": {
          GET: async (req: Request) => {
            try {
              const url = new URL(req.url);
              const period = url.searchParams.get('period') || '24h';

              // Get route configurations for naming
              const serverConfig = configService.getServerConfig();
              const routeConfigs = serverConfig.routes.map(route => ({
                domain: route.domain,
                path: route.path,
                target: route.target,
                name: route.name
              }));

              const detailedStats = this.statisticsService.getTimePeriodStats(period, routeConfigs);

              // Convert dates to ISO strings for JSON serialization
              const serializedStats = {
                ...detailedStats,
                period: {
                  start: detailedStats.period.start.toISOString(),
                  end: detailedStats.period.end.toISOString()
                }
              };

              return new Response(JSON.stringify({ success: true, data: serializedStats }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({
                error: 'Failed to get detailed statistics',
                details: error instanceof Error ? error.message : 'Unknown error'
              }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/statistics/summary": {
          GET: async (req: Request) => {
            const stats = this.statisticsService.getStatsSummary();
            return new Response(JSON.stringify({ success: true, data: stats }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        },

        "/api/statistics/generate-report": {
          POST: async (req: Request) => {
            try {
              const stats = this.statisticsService.getStatsSummary();
              const reportDir = path.join(process.cwd(), 'logs', 'statistics');
              await fs.ensureDir(reportDir);
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const reportPath = path.join(reportDir, `manual-report-${timestamp}.json`);
              await fs.writeFile(reportPath, JSON.stringify(stats, null, 2));
              logger.info(`Manual statistics report generated at ${reportPath}`);
              return new Response(JSON.stringify({
                success: true,
                message: 'Statistics report generated successfully',
                data: {
                  filepath: reportPath,
                  summary: stats
                }
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to generate report', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes": {
          GET: async (req: Request) => {
            const processes = await this.getProcesses();
            return new Response(JSON.stringify({ success: true, data: processes }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        },

        "/api/processes/reload": {
          POST: async (req: Request) => {
            try {
              await configService.reload();
              await this.processManager.startManagedProcesses();
              logger.info('Process configuration reloaded and processes restarted');
              return new Response(JSON.stringify({ success: true, message: 'Process configuration reloaded' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to reload process configuration', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes/:id/start": {
          POST: async (req: Request) => {
            const url = new URL(req.url);
            const processId = url.pathname.split('/')[3];

            try {
              const processConfig = configService.getProcessConfig();
              const process = processConfig?.processes?.[processId];
              if (!process) {
                return new Response(JSON.stringify({ error: 'Process not found' }), {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
              // Get target from route configuration if available
              const serverConfig = configService.getServerConfig();
              const route = serverConfig.routes.find(r => r.name === processId);
              const target = route?.target || '';
              await this.processManager.startProcess(processId, process, target);
              return new Response(JSON.stringify({ success: true, message: `Process ${processId} started` }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to start process', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes/:id/stop": {
          POST: async (req: Request) => {
            const url = new URL(req.url);
            const processId = url.pathname.split('/')[3];

            try {
              await this.processManager.stopProcess(processId);
              return new Response(JSON.stringify({ success: true, message: `Process ${processId} stopped` }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to stop process', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes/:id/restart": {
          POST: async (req: Request) => {
            const url = new URL(req.url);
            const processId = url.pathname.split('/')[3];

            try {
              // Get target from route configuration if available
              const serverConfig = configService.getServerConfig();
              const route = serverConfig.routes.find(r => r.name === processId);
              const target = route?.target || '';
              await this.processManager.restartProcess(processId, target);
              return new Response(JSON.stringify({ success: true, message: `Process ${processId} restarted` }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to restart process', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes/:id/logs": {
          GET: async (req: Request) => {
            const url = new URL(req.url);
            const processId = url.pathname.split('/')[3];
            const lines = url.searchParams.get('lines') || '100';

            try {
              const logs = await this.getProcessLogs(processId, lines);
              return new Response(JSON.stringify({ success: true, data: { processId, logs } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to get logs', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes/config": {
          GET: async (req: Request) => {
            const processConfig = configService.getProcessConfig();
            return new Response(JSON.stringify({ success: true, data: processConfig }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          },
          PUT: async (req: Request) => {
            try {
              const newConfig = await req.json();
              await this.handleProcessConfigUpdate(newConfig);
              return new Response(JSON.stringify({ success: true, message: 'Process configuration updated' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to update process configuration', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/certificates": {
          GET: async (req: Request) => {
            try {
              const certificates = this.getCertificates();
              return new Response(JSON.stringify(Object.fromEntries(certificates)), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to get certificates', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/cache/stats": {
          GET: async (req: Request) => {
            try {
              const stats = await cacheService.getStats();

              // Transform stats to match frontend expectations
              const cacheData = {
                totalEntries: stats.totalEntries || 0,
                totalSize: stats.totalSize || 0,
                hitRate: stats.mruHitRate || 0,
                missRate: stats.mruHitRate ? (1 - stats.mruHitRate) : 0,
                users: [] // TODO: Implement user tracking if needed
              };

              return new Response(JSON.stringify({ success: true, data: cacheData }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to get cache stats', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/cache/entries": {
          GET: async (req: Request) => {
            try {
              const url = new URL(req.url);
              const page = parseInt(url.searchParams.get('page') || '1');
              const limit = parseInt(url.searchParams.get('limit') || '50');
              const userId = url.searchParams.get('userId');
              const inMRU = url.searchParams.get('inMRU') === 'true';

              // Get all cache entries
              const allEntries = await cacheService.getAllEntries();

              // Apply filters
              let filteredEntries = allEntries;
              if (userId) {
                filteredEntries = filteredEntries.filter(entry => entry.userId === userId);
              }
              if (inMRU !== null) {
                filteredEntries = filteredEntries.filter(entry => entry.inMRU === inMRU);
              }

              // Apply pagination
              const startIndex = (page - 1) * limit;
              const endIndex = startIndex + limit;
              const paginatedEntries = filteredEntries.slice(startIndex, endIndex);

              // Transform entries to match frontend expectations
              const entries = paginatedEntries.map(entry => ({
                key: entry.key,
                url: entry.target,
                method: entry.method,
                status: entry.status,
                contentType: entry.contentType,
                size: entry.bodySize,
                userId: entry.userId || '',
                createdAt: new Date(entry.timestamp).toISOString(),
                expiresAt: new Date(entry.timestamp + (24 * 60 * 60 * 1000)).toISOString(), // 24 hours from creation
                body: '' // Don't include body content in list view
              }));

              return new Response(JSON.stringify({
                success: true,
                data: {
                  entries,
                  total: filteredEntries.length,
                  page,
                  limit
                }
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to get cache entries', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/cache/clear": {
          POST: async (req: Request) => {
            try {
              await cacheService.cleanup();
              return new Response(JSON.stringify({ success: true, message: 'Cache cleared successfully' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to clear cache', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/cache/delete/:key": {
          DELETE: async (req: Request) => {
            try {
              const url = new URL(req.url);
              const key = url.pathname.split('/')[3];

              // Get the entry to find its details for deletion
              const allEntries = await cacheService.getAllEntries();
              const entry = allEntries.find(e => e.key === key);

              if (entry) {
                // Delete the entry using the cache service
                await cacheService.delete(entry.target, entry.method, entry.userId, entry.userIP);
                logger.info(`Cache entry deleted: ${key}`);
              } else {
                logger.warn(`Cache entry not found for deletion: ${key}`);
              }

              return new Response(JSON.stringify({ success: true, message: 'Cache entry deleted successfully' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ error: 'Failed to delete cache entry', details: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/health": () => this.handleHealthRequest(),

        "/ws": async (req: Request) => {
          const url = new URL(req.url);
          if (url.pathname === '/ws') {
            const upgraded = this.managementServer?.upgrade(req);
            if (upgraded) {
              return new Response(null, { status: 101 });
            }
          }
          return new Response('Not Found', { status: 404 });
        },
        "/": (req: Request) => {
          return Response.redirect(new URL('/frontend', req.url), 302);
        },
      },
      websocket: {
        open: (ws: ServerWebSocket<unknown>) => {
          logger.info('WebSocket client connected');
          this.managementWebSockets.add(ws);
          this.sendInitialWebSocketData(ws);
        },
        message: (ws: ServerWebSocket<unknown>, message: string | Buffer) => {
          try {
            const parsed = JSON.parse(typeof message === 'string' ? message : message.toString());
            this.handleWebSocketMessage(ws, parsed);
          } catch (error) {
            logger.error('Failed to parse WebSocket message', error);
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Invalid message format' },
              timestamp: new Date().toISOString()
            }));
          }
        },
        close: (ws: ServerWebSocket<unknown>) => {
          logger.info('WebSocket client disconnected');
          this.managementWebSockets.delete(ws);

          // Remove from all log watchers
          this.logWatchers.forEach((watchers, processId) => {
            if (watchers.has(ws)) {
              watchers.delete(ws);
              if (watchers.size === 0) {
                this.logWatchers.delete(processId);
              }
            }
          });
        },
        drain: () => { },
      },
      fetch: async (req: Request) => {
        console.warn(`Unknown management route: ${req.url}`);
        return new Response('Not Found', { status: 404 });
      },
    });

    logger.info(`Management console started on ${managementHost}:${managementPort}`);
  }

  async stop(): Promise<void> {
    logger.info('Stopping management console...');

    // Stop management server
    if (this.managementServer) {
      this.managementServer.stop();
      this.managementServer = null;
      logger.info('Management console stopped');
    }

    // Shutdown process manager
    await this.processManager.shutdown();

    logger.info('Management console stopped successfully');
  }

  private async sendInitialWebSocketData(ws: ServerWebSocket<unknown>): Promise<void> {
    try {
      const processes = await this.getProcesses();
      ws.send(JSON.stringify({
        type: 'processes',
        data: processes,
        timestamp: new Date().toISOString()
      }));
      const status = await this.getStatusData();
      ws.send(JSON.stringify({
        type: 'status',
        data: status,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      logger.error('Failed to send initial data', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Failed to load initial data' },
        timestamp: new Date().toISOString()
      }));
    }
  }

  private async handleWebSocketMessage(ws: ServerWebSocket<unknown>, message: any): Promise<void> {
    switch (message.type) {
      case 'request_logs':
        await this.handleWebSocketLogsRequest(ws, message.processId, message.lines);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', data: {}, timestamp: new Date().toISOString() }));
        break;
      default:
        logger.warn('Unknown WebSocket message type', message.type);
    }
  }

  private async handleWebSocketLogsRequest(ws: ServerWebSocket<unknown>, processId: string, lines: number | 'all' = 100): Promise<void> {
    try {
      let maxLines: number;
      if (lines === 'all') {
        maxLines = 100000;
      } else {
        maxLines = Math.min(lines || 100, 10000);
      }
      const logs = await this.getProcessLogs(processId, maxLines);
      ws.send(JSON.stringify({
        type: 'logs',
        data: { processId, logs },
        timestamp: new Date().toISOString()
      }));

      // Add this WebSocket to the watchers for this process
      if (!this.logWatchers.has(processId)) {
        this.logWatchers.set(processId, new Set());
      }
      this.logWatchers.get(processId)!.add(ws);
    } catch (error) {
      logger.error('Failed to get logs for process', { processId, error });
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Failed to load logs', processId },
        timestamp: new Date().toISOString()
      }));
    }
  }

  private handleHealthRequest(): Response {
    try {
      const certificates = this.getCertificates();
      const validCertificates = Array.from(certificates.values()).filter((cert: any) => cert.isValid);

      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        certificates: {
          total: certificates.size,
          valid: validCertificates.length,
          domains: Array.from(certificates.keys()),
          validDomains: validCertificates.map((cert: any) => cert.domain),
        },
        servers: {
          management: !!this.managementServer,
        },
        config: {
          httpPort: configService.getServerConfig().port,
          httpsPort: configService.getServerConfig().httpsPort,
          routes: configService.getServerConfig().routes.length,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      logger.error('Health check failed', error);
      return new Response(JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  getStatus(): any {
    return {
      httpPort: this.config.port,
      httpsPort: this.config.httpsPort,
      routes: this.config.routes.length,
      certificates: this.getCertificates(),
      processes: this.getProcessesSync(),
      statistics: this.statisticsService.getStatsSummary(),
      cache: cacheService.getStats(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  private getProcessesSync(): any[] {
    const processes = this.processManager.getProcessStatus();
    return Array.isArray(processes) ? processes : [];
  }

  getConfig(): ProxyConfig {
    return this.config;
  }

  getStatisticsService(): any {
    return this.statisticsService;
  }

  async getProcesses(): Promise<any[]> {
    return this.processManager.getProcessStatus();
  }

  async getStatusData(): Promise<any> {
    return this.getStatus();
  }

  async getProcessLogs(processId: string, lines: number | string): Promise<any[]> {
    const rawLogs = await this.processManager.getProcessLogs(processId, lines);

    // Transform string logs into LogLine objects
    return rawLogs.map((logLine: string) => {
      // Parse log line format: [timestamp] [STREAM] content
      const timestampMatch = logLine.match(/^\[([^\]]+)\]\s+\[(STDOUT|STDERR)\]\s+(.*)$/);

      if (timestampMatch) {
        return {
          line: timestampMatch[3],
          stream: timestampMatch[2].toLowerCase() as 'stdout' | 'stderr',
          timestamp: timestampMatch[1]
        };
      } else {
        // Fallback for lines that don't match the expected format
        return {
          line: logLine,
          stream: 'stdout' as const,
          timestamp: new Date().toISOString()
        };
      }
    });
  }

  async handleProcessConfigUpdate(newConfig: any): Promise<void> {
    // Save the new process config and reload processes
    const configPath = configService.getMainConfig().config.processes;
    const yamlContent = yamlStringify(newConfig);
    await fs.writeFile(configPath, yamlContent);
    logger.info('Process config updated and saved, reloading processes');
    await configService.reload();
    await this.processManager.startManagedProcesses();
  }

  private getCertificates(): Map<string, any> {
    try {
      if (ProxyCertificates.hasInstance()) {
        return ProxyCertificates.getInstance().getAllCertificates();
      } else {
        // Fallback if singleton hasn't been initialized yet
        return new Map();
      }
    } catch (error) {
      logger.error('Failed to get certificates', error);
      return new Map();
    }
  }

  // Add broadcast helpers if needed for process/status/logs updates
  broadcastToManagementWebSockets(message: any): void {
    const msg = JSON.stringify(message);
    this.managementWebSockets.forEach((ws) => {
      try {
        ws.send(msg);
      } catch (error) {
        logger.error('Failed to send message to WebSocket client', error);
        this.managementWebSockets.delete(ws);
      }
    });
  }

  private broadcastLogUpdates(processId: string, newLogs: string[]): void {
    const watchers = this.logWatchers.get(processId);
    if (!watchers || watchers.size === 0) {
      return; // No clients watching this process
    }

    // Transform logs to LogLine format
    const logLines = newLogs.map((logLine: string) => {
      // Parse log line format: [timestamp] [STREAM] content
      const timestampMatch = logLine.match(/^\[([^\]]+)\]\s+\[(STDOUT|STDERR)\]\s+(.*)$/);

      if (timestampMatch) {
        return {
          line: timestampMatch[3],
          stream: timestampMatch[2].toLowerCase() as 'stdout' | 'stderr',
          timestamp: timestampMatch[1]
        };
      } else {
        // Fallback for lines that don't match the expected format
        return {
          line: logLine,
          stream: 'stdout' as const,
          timestamp: new Date().toISOString()
        };
      }
    });

    const message = JSON.stringify({
      type: 'logs_update',
      data: { processId, logs: logLines },
      timestamp: new Date().toISOString()
    });

    // Send to all watchers of this process
    watchers.forEach((ws) => {
      try {
        ws.send(message);
      } catch (error) {
        logger.error('Failed to send log update to WebSocket client', error);
        watchers.delete(ws);
        this.managementWebSockets.delete(ws);
      }
    });
  }
} 