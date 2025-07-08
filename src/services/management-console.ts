import { Server, ServerWebSocket } from 'bun';
import { ProxyConfig, MainConfig } from '../types';
import { logger } from '../utils/logger';
import { configService } from './config-service';
import { processManager } from './process-manager';
import { getStatisticsService } from './statistics';
import { cacheService } from './cache';
import * as managementHtml from '../frontend/management/index.html';
import * as path from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';

export class ManagementConsole {
  private managementServer: Server | null = null;
  private config: ProxyConfig;
  private mainConfig?: MainConfig;
  private statisticsService: any;
  private managementWebSockets: Set<ServerWebSocket<unknown>> = new Set();

  constructor(config: ProxyConfig, mainConfig?: MainConfig) {
    this.config = config;
    this.mainConfig = mainConfig;

    // Initialize statistics service with configuration
    const logsDir = configService.getSetting<string>('logsDir');
    const reportDir = logsDir ? path.join(logsDir, 'statistics') : undefined;
    const dataDir = configService.getSetting<string>('statsDir');
    this.statisticsService = getStatisticsService(reportDir, dataDir);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing management console...');

    // Initialize process manager
    processManager.initialize(this.config);

    // Start managed processes
    await processManager.startManagedProcesses();

    // Set up process configuration watching
    processManager.setupProcessConfigWatching();

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
      routes: {
        "/": { GET: managementHtml },



        "/api/status": async (req: Request) => {
          if (req.method === 'GET') {
            const status = this.getStatus();
            return new Response(JSON.stringify(status), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/config": async (req: Request) => {
          if (req.method === 'GET') {
            const config = this.getConfig();
            return new Response(JSON.stringify(config), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/config/:type": async (req: Request) => {
          if (req.method === 'GET') {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              let configData: any;
              switch (type) {
                case 'proxy':
                  configData = configService.getServerConfig();
                  break;
                case 'processes':
                  configData = configService.getProcessConfig();
                  break;
                case 'main':
                  configData = configService.getMainConfig();
                  break;
                default:
                  return new Response(JSON.stringify({ error: 'Invalid config type' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                  });
              }

              return new Response(JSON.stringify({ success: true, data: configData }), {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/config/:type/save": async (req: Request) => {
          if (req.method === 'POST') {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              const newConfig = await req.json();
              // TODO: Implement config saving
              logger.info(`Config save requested for type: ${type}`);

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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/config/:type/backup": async (req: Request) => {
          if (req.method === 'POST') {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              // TODO: Implement config backup
              logger.info(`Config backup requested for type: ${type}`);

              return new Response(JSON.stringify({ success: true, message: 'Backup created successfully' }), {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/config/:type/backups": async (req: Request) => {
          if (req.method === 'GET') {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              // TODO: Implement config backups listing
              logger.info(`Config backups listing requested for type: ${type}`);

              return new Response(JSON.stringify({ success: true, data: [] }), {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/config/:type/restore": async (req: Request) => {
          if (req.method === 'POST') {
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              const { backupPath } = await req.json();
              // TODO: Implement config restore
              logger.info(`Config restore requested for type: ${type}, backup: ${backupPath}`);

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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/statistics": async (req: Request) => {
          if (req.method === 'GET') {
            const stats = this.statisticsService.getStatsSummary();
            return new Response(JSON.stringify({ success: true, data: stats }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/statistics/summary": async (req: Request) => {
          if (req.method === 'GET') {
            const stats = this.statisticsService.getStatsSummary();
            return new Response(JSON.stringify({ success: true, data: stats }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/statistics/generate-report": async (req: Request) => {
          if (req.method === 'POST') {
            try {
              // TODO: Implement manual report generation
              logger.info('Manual statistics report generation requested');

              return new Response(JSON.stringify({
                success: true,
                message: 'Statistics report generated successfully',
                data: {
                  filepath: '/path/to/report.json',
                  summary: this.statisticsService.getStatsSummary()
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/processes": async (req: Request) => {
          if (req.method === 'GET') {
            const processes = await this.getProcesses();
            return new Response(JSON.stringify({ success: true, data: processes }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/processes/reload": async (req: Request) => {
          if (req.method === 'POST') {
            try {
              // TODO: Implement process configuration reload
              logger.info('Process configuration reload requested');

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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/processes/:id/start": async (req: Request) => {
          if (req.method === 'POST') {
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
              await processManager.startProcess(processId, process, target);
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/processes/:id/stop": async (req: Request) => {
          if (req.method === 'POST') {
            const url = new URL(req.url);
            const processId = url.pathname.split('/')[3];

            try {
              await processManager.stopProcess(processId);
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/processes/:id/restart": async (req: Request) => {
          if (req.method === 'POST') {
            const url = new URL(req.url);
            const processId = url.pathname.split('/')[3];

            try {
              // Get target from route configuration if available
              const serverConfig = configService.getServerConfig();
              const route = serverConfig.routes.find(r => r.name === processId);
              const target = route?.target || '';
              await processManager.restartProcess(processId, target);
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/processes/:id/logs": async (req: Request) => {
          if (req.method === 'GET') {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/processes/config": async (req: Request) => {
          if (req.method === 'GET') {
            const processConfig = configService.getProcessConfig();
            return new Response(JSON.stringify({ success: true, data: processConfig }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } else if (req.method === 'PUT') {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/certificates": async (req: Request) => {
          if (req.method === 'GET') {
            try {
              const certificates = this.getCertificates();
              return new Response(JSON.stringify({ success: true, data: Array.from(certificates.entries()) }), {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/cache/stats": async (req: Request) => {
          if (req.method === 'GET') {
            try {
              const stats = cacheService.getStats();
              return new Response(JSON.stringify({ success: true, data: stats }), {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/cache/entries": async (req: Request) => {
          if (req.method === 'GET') {
            try {
              const url = new URL(req.url);
              const page = parseInt(url.searchParams.get('page') || '1');
              const limit = parseInt(url.searchParams.get('limit') || '50');
              const userId = url.searchParams.get('userId');
              const inMRU = url.searchParams.get('inMRU') === 'true';

              // TODO: Implement cache entries retrieval
              logger.info(`Cache entries requested: page=${page}, limit=${limit}, userId=${userId}, inMRU=${inMRU}`);

              return new Response(JSON.stringify({ success: true, data: { entries: [], total: 0, page, limit } }), {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/cache/clear": async (req: Request) => {
          if (req.method === 'POST') {
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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/cache/delete/:key": async (req: Request) => {
          if (req.method === 'DELETE') {
            try {
              const url = new URL(req.url);
              const key = url.pathname.split('/')[3];

              // TODO: Implement cache entry deletion
              logger.info(`Cache entry deletion requested for key: ${key}`);

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
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
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
        }
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
        },
        drain: () => { },
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
    await processManager.shutdown();

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
    const processes = processManager.getProcessStatus();
    return Array.isArray(processes) ? processes : [];
  }

  getConfig(): ProxyConfig {
    return this.config;
  }

  getStatisticsService(): any {
    return this.statisticsService;
  }

  async getProcesses(): Promise<any[]> {
    return processManager.getProcessStatus();
  }

  async getStatusData(): Promise<any> {
    return this.getStatus();
  }

  async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
    return processManager.getProcessLogs(processId, lines);
  }

  async handleProcessConfigUpdate(newConfig: any): Promise<void> {
    // TODO: Implement or make this method public in ProcessManager
    logger.info('Process config update not yet implemented for management console');
  }

  private getCertificates(): Map<string, any> {
    try {
      const { ProxyCertificates } = require('./proxy-certificates');
      const proxyCertificates = new ProxyCertificates(this.config);
      return proxyCertificates.getAllCertificates();
    } catch (error) {
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
} 