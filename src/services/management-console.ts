import { Server, ServerWebSocket } from 'bun';
import { ProxyConfig, MainConfig } from '../types';
import { logger } from '../utils/logger';
import { configService } from './config-service';
import { processManager } from './process-manager';
import { getStatisticsService } from './statistics';
import { cacheService } from './cache';
import managementHtml from '../frontend/management/index.html';
import path from 'path';

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

  async start(): Promise<void> {
    logger.info('Starting management console...');

    const managementConfig = configService.getManagementConfig();
    const managementPort = managementConfig?.port || (this.config.port + 1000);
    const managementHost = managementConfig?.host || '0.0.0.0';

    this.managementServer = Bun.serve({
      port: managementPort,
      hostname: managementHost,
      development: true,
      routes: {
        "/": managementHtml,

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

        "/api/statistics": async (req: Request) => {
          if (req.method === 'GET') {
            const stats = this.statisticsService.getStatsSummary();
            return new Response(JSON.stringify(stats), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
          });
        },

        "/api/processes": async (req: Request) => {
          if (req.method === 'GET') {
            const processes = await this.getProcesses();
            return new Response(JSON.stringify(processes), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
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
              return new Response(JSON.stringify({ processId, logs }), {
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

        "/health": () => this.handleHealthRequest()
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
    for (const ws of this.managementWebSockets) {
      try {
        ws.send(msg);
      } catch (error) {
        logger.error('Failed to send message to WebSocket client', error);
        this.managementWebSockets.delete(ws);
      }
    }
  }
} 