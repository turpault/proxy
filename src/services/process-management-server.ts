import { Server } from 'bun';
import { ProxyConfig, MainConfig } from '../types';
import { logger } from '../utils/logger';
import { configService } from './config-service';
import { processManager } from './process-manager';

export class ProcessManagementServer {
  private processServer: Server | null = null;
  private config: ProxyConfig;
  private mainConfig?: MainConfig;

  constructor(config: ProxyConfig, mainConfig?: MainConfig) {
    this.config = config;
    this.mainConfig = mainConfig;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing process management server...');

    // Initialize process manager
    processManager.initialize(this.config);

    // Start managed processes
    await processManager.startManagedProcesses();

    // Set up process configuration watching
    processManager.setupProcessConfigWatching();

    logger.info('Process management server initialization complete');
  }

  async start(): Promise<void> {
    logger.info('Starting process management server...');

    // Start process management server
    const processConfig = configService.getManagementConfig();
    const processPort = processConfig?.port || (this.config.port + 2000);
    const processHost = processConfig?.host || '0.0.0.0';

    this.processServer = Bun.serve({
      port: processPort,
      hostname: processHost,
      development: true,
      routes: {
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

        "/api/processes/config": async (req: Request) => {
          if (req.method === 'GET') {
            const processConfig = configService.getProcessConfig();
            return new Response(JSON.stringify(processConfig), {
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
        }
      }
    });

    logger.info(`Process management server started on ${processHost}:${processPort}`);
  }

  async stop(): Promise<void> {
    logger.info('Stopping process management server...');

    // Stop process management server
    if (this.processServer) {
      this.processServer.stop();
      this.processServer = null;
      logger.info('Process management server stopped');
    }

    // Shutdown process manager
    await processManager.shutdown();

    logger.info('Process management server stopped successfully');
  }

  async getProcesses(): Promise<any[]> {
    return processManager.getProcessStatus();
  }

  async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
    return processManager.getProcessLogs(processId, lines);
  }

  async handleProcessConfigUpdate(newConfig: any): Promise<void> {
    // TODO: Implement or make this method public in ProcessManager
    logger.info('Process config update not yet implemented for process management server');
  }

  getStatus(): any {
    return {
      processes: this.getProcessesSync(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  private getProcessesSync(): any[] {
    const processes = processManager.getProcessStatus();
    return Array.isArray(processes) ? processes : [];
  }
} 