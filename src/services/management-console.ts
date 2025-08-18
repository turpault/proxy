import { Server, ServerWebSocket } from 'bun';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import managementHtml from '../frontend/management/index.html';
import { ConfigSaveRequest, ProxyConfig } from '../types';
import { logger } from '../utils/logger';
import { cacheService } from './cache';
import { configService } from './config-service';
import { ProcessManager } from './process-manager';
import { ProxyCertificates } from './proxy-certificates';
import { getStatisticsService, StatisticsService } from './statistics';
import { authService } from './local-admin-auth-service';
import { sessionManager, SessionManager } from './session-manager';
import { stringify as yamlStringify } from 'yaml';
import * as fs from 'fs-extra';
import {
  StatusResponse,
  GetConfigResponse,
  SaveConfigResponse,
  CreateBackupResponse,
  GetBackupsResponse,
  RestoreBackupResponse,
  ValidateConfigResponse,
  GetStatisticsResponse,
  GetDetailedStatisticsResponse,
  GetStatisticsSummaryResponse,
  GenerateReportResponse,
  GetProcessesResponse,
  ReloadProcessesResponse,
  StartProcessResponse,
  KillProcessResponse,
  RestartProcessResponse,
  GetProcessLogsResponse,
  GetProcessConfigResponse,
  UpdateProcessConfigResponse,
  GetCertificatesResponse,
  GetCacheStatsResponse,
  GetCacheEntriesResponse,
  ClearCacheResponse,
  DeleteCacheEntryResponse,
  HealthResponse,
  ApiErrorResponse,
  ApiSuccessResponse,
  LogLine,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  LogoutResponse,
  SessionValidationResponse
} from '../types/shared';
import { validateYAML, validateProcessConfigYAML, validateProxyConfigYAML, validateMainConfigYAML } from '../utils/yaml-validator';

export class ManagementConsole {
  private managementServer: Server | null = null;
  private config: ProxyConfig;
  private statisticsService: StatisticsService;
  private managementWebSockets: Set<ServerWebSocket<unknown>> = new Set();
  private logWatchers: Map<string, Set<ServerWebSocket<unknown>>> = new Map(); // processId -> Set of WebSocket clients
  private processManager: ProcessManager;
  private lastLogTimestampMs: Map<string, number> = new Map();

  constructor(config: ProxyConfig, processManager: ProcessManager) {
    this.config = config;
    this.processManager = processManager;

    // Get the statistics service singleton
    this.statisticsService = getStatisticsService();
  }

  /**
   * Extract session ID from request cookies
   */
  private getSessionIdFromCookies(req: Request): string | null {
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    return cookies['sessionId'] || null;
  }

  /**
   * Check if request is authenticated
   */
  private isAuthenticated(req: Request): boolean {
    const sessionId = this.getSessionIdFromCookies(req);
    if (!sessionId) return false;

    const session = authService.validateSession(sessionId);
    return session !== null;
  }

  /**
   * Create unauthorized response
   */
  private createUnauthorizedResponse(): Response {
    return new Response(JSON.stringify({
      success: false,
      error: 'Authentication required'
    } as ApiErrorResponse), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Ensure log line timestamps are monotonically increasing per process.
   * Adjusts any non-increasing timestamps by bumping to previous + 1ms.
   * Updates the per-process cursor to the last emitted timestamp.
   */
  private normalizeLogLines(processId: string, lines: LogLine[]): LogLine[] {
    let previousMs = this.lastLogTimestampMs.get(processId) ?? 0;
    const normalized: LogLine[] = [];

    for (const entry of lines) {
      const parsedMs = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
      let currentMs = Number.isFinite(parsedMs) ? parsedMs : Date.now();

      if (currentMs <= previousMs) {
        currentMs = previousMs + 1;
      }

      normalized.push({
        ...entry,
        timestamp: new Date(currentMs).toISOString(),
      });

      previousMs = currentMs;
    }

    this.lastLogTimestampMs.set(processId, previousMs);
    return normalized;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing management console...');

    // Initialize authentication service
    const mainConfig = configService.getMainConfig();
    if (mainConfig?.management?.adminPassword) {
      authService.initialize(
        mainConfig.management.adminPassword,
        mainConfig.management.sessionTimeout
      );
      logger.info('Authentication service initialized');
    } else {
      logger.warn('No admin password configured, authentication disabled');
    }

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
        "/frontend": managementHtml,
        "/frontend/*": managementHtml,

        // Authentication endpoints
        "/api/auth/login": {
          POST: async (req: Request) => {
            try {
              const body = await req.json() as LoginRequest;
              const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
              const userAgent = req.headers.get('user-agent') || 'unknown';

              const result = authService.login(body.password, ipAddress, userAgent);

              if (result.success && result.session) {
                const response = new Response(JSON.stringify({
                  success: true,
                  session: {
                    id: result.session.id,
                    userId: result.session.userId,
                    createdAt: new Date(result.session.createdAt).toISOString(),
                    expiresAt: new Date(result.session.expiresAt).toISOString()
                  }
                } as LoginResponse), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });

                // Set session cookie
                response.headers.set('Set-Cookie', `sessionId=${result.session.id}; HttpOnly; Path=/; Max-Age=${Math.floor(result.session.expiresAt / 1000)}; SameSite=Strict`);

                return response;
              } else {
                return new Response(JSON.stringify({
                  success: false,
                  error: result.error || 'Authentication failed'
                } as LoginResponse), {
                  status: 401,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            } catch (error) {
              return new Response(JSON.stringify({
                success: false,
                error: 'Internal server error'
              } as LoginResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/auth/logout": {
          POST: async (req: Request) => {
            try {
              const sessionId = this.getSessionIdFromCookies(req);
              if (sessionId) {
                authService.logout(sessionId);
              }

              const response = new Response(JSON.stringify({
                success: true,
                message: 'Logged out successfully'
              } as LogoutResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });

              // Clear session cookie
              response.headers.set('Set-Cookie', 'sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');

              return response;
            } catch (error) {
              return new Response(JSON.stringify({
                success: false,
                error: 'Internal server error'
              } as LogoutResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/auth/session": {
          GET: async (req: Request) => {
            try {
              const sessionId = this.getSessionIdFromCookies(req);

              if (!sessionId) {
                return new Response(JSON.stringify({
                  success: true,
                  authenticated: false
                } as SessionValidationResponse), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }

              const session = authService.validateSession(sessionId);

              if (session) {
                return new Response(JSON.stringify({
                  success: true,
                  authenticated: true,
                  session: {
                    id: session.id,
                    userId: session.userId,
                    createdAt: new Date(session.createdAt).toISOString(),
                    expiresAt: new Date(session.expiresAt).toISOString()
                  }
                } as SessionValidationResponse), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              } else {
                return new Response(JSON.stringify({
                  success: true,
                  authenticated: false
                } as SessionValidationResponse), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            } catch (error) {
              return new Response(JSON.stringify({
                success: false,
                error: 'Internal server error'
              } as SessionValidationResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/status": {
          GET: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }

            const status = this.getStatus();
            return new Response(JSON.stringify({ ...status } as StatusResponse), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        },

        "/api/config": {
          GET: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }

            const config = this.getConfig();
            return new Response(JSON.stringify({ ...config } as any), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        },

        "/api/config/:type": {
          GET: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              let configData: any;
              let configPath: string;

              switch (type) {
                case 'proxy':
                  configData = configService.getServerConfig();
                  const mainConfigProxy = configService.getMainConfig();
                  if (!mainConfigProxy) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigProxy.config.proxy;
                  break;
                case 'processes':
                  configData = configService.getProcessConfig();
                  const mainConfigProcesses = configService.getMainConfig();
                  if (!mainConfigProcesses) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigProcesses.config.processes;
                  break;
                case 'main':
                  configData = configService.getMainConfig();
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ success: false, error: 'Invalid config type' } as ApiErrorResponse), {
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

              return new Response(JSON.stringify({ success: true, data: responseData } as GetConfigResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to get config', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/config/:type/save": {
          POST: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];

            try {
              const newConfig = await req.json() as ConfigSaveRequest;
              let configPath: string;


              switch (type) {
                case 'proxy':
                  const mainConfigSaveProxy = configService.getMainConfig();
                  if (!mainConfigSaveProxy) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  if (!validateProxyConfigYAML(newConfig.content).isValid) {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid proxy configuration' } as ApiErrorResponse), {
                      status: 400,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigSaveProxy.config.proxy;
                  break;
                case 'processes':
                  const mainConfigSaveProcesses = configService.getMainConfig();
                  if (!mainConfigSaveProcesses) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  if (!validateProcessConfigYAML(newConfig.content).isValid) {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid process configuration' } as ApiErrorResponse), {
                      status: 400,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigSaveProcesses.config.processes;
                  break;
                case 'main':
                  if (!validateMainConfigYAML(newConfig.content).isValid) {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid main configuration' } as ApiErrorResponse), {
                      status: 400,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ success: false, error: 'Invalid config type' } as ApiErrorResponse), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                  });
              }
              if (newConfig.createBackup) {
                const backupDir = path.join(path.dirname(configPath), 'backup');
                await fs.ensureDir(backupDir);
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupFile = path.join(backupDir, `${type}.backup-${timestamp}.yaml`);
                await fs.copyFile(configPath, backupFile);
              }

              const yamlContent = yamlStringify(newConfig.content);

              debugger;
              // Convert to YAML and write to file
              await fs.writeFile(configPath, yamlContent);
              logger.info(`Config saved for type: ${type} at ${configPath}`);

              // Reload config after saving
              await configService.reload();

              return new Response(JSON.stringify({ success: true, message: 'Configuration saved' } as SaveConfigResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to save config', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/config/:type/backup": {
          POST: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }
            const url = new URL(req.url);
            const type = url.pathname.split('/')[3];
            try {
              let configPath: string;
              switch (type) {
                case 'proxy':
                  const mainConfigBackupProxy = configService.getMainConfig();
                  if (!mainConfigBackupProxy) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigBackupProxy.config.proxy;
                  break;
                case 'processes':
                  const mainConfigBackupProcesses = configService.getMainConfig();
                  if (!mainConfigBackupProcesses) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigBackupProcesses.config.processes;
                  break;
                case 'main':
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ success: false, error: 'Invalid config type' } as ApiErrorResponse), {
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
              return new Response(JSON.stringify({ success: true, message: 'Backup created successfully', backupPath: backupFile } as CreateBackupResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to create backup', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
                  const mainConfigBackupsProxy = configService.getMainConfig();
                  if (!mainConfigBackupsProxy) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigBackupsProxy.config.proxy;
                  break;
                case 'processes':
                  const mainConfigBackupsProcesses = configService.getMainConfig();
                  if (!mainConfigBackupsProcesses) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigBackupsProcesses.config.processes;
                  break;
                case 'main':
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ success: false, error: 'Invalid config type' } as ApiErrorResponse), {
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
                        lastModified: stats.mtime.toISOString()
                      };
                    } catch {
                      return {
                        path: filePath,
                        name: f,
                        size: 0,
                        lastModified: new Date().toISOString()
                      };
                    }
                  })
              );
              return new Response(JSON.stringify({ success: true, data: backups } as GetBackupsResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to list backups', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
                  const mainConfigRestoreProxy = configService.getMainConfig();
                  if (!mainConfigRestoreProxy) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigRestoreProxy.config.proxy;
                  break;
                case 'processes':
                  const mainConfigRestoreProcesses = configService.getMainConfig();
                  if (!mainConfigRestoreProcesses) {
                    return new Response(JSON.stringify({ success: false, error: 'Main configuration not available' } as ApiErrorResponse), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                  configPath = mainConfigRestoreProcesses.config.processes;
                  break;
                case 'main':
                  configPath = configService.getMainConfigPath();
                  break;
                default:
                  return new Response(JSON.stringify({ success: false, error: 'Invalid config type' } as ApiErrorResponse), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                  });
              }
              await fs.copyFile(backupPath, configPath);
              logger.info(`Config restored for type: ${type} from ${backupPath}`);
              await configService.reload();
              return new Response(JSON.stringify({ success: true, message: 'Configuration restored successfully' } as RestoreBackupResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to restore config', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/config/validate": {
          POST: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }
            try {
              const body = await req.json() as { content?: string; type?: string };
              const content = body?.content;
              const type = body?.type;

              if (!content || typeof content !== 'string') {
                return new Response(JSON.stringify({
                  success: false,
                  error: 'Invalid content provided'
                } as ApiErrorResponse), {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' }
                });
              }

              // Use the imported YAML validator functions

              let validationResult;

              // Use specific validation based on config type
              switch (type) {
                case 'processes':
                  validationResult = validateProcessConfigYAML(content);
                  break;
                case 'proxy':
                  validationResult = validateProxyConfigYAML(content);
                  break;
                case 'main':
                  validationResult = validateMainConfigYAML(content);
                  break;
                default:
                  validationResult = validateYAML(content);
              }

              return new Response(JSON.stringify({
                success: true,
                data: validationResult
              } as ValidateConfigResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({
                success: false,
                error: 'Validation failed',
                details: error instanceof Error ? error.message : 'Unknown error'
              } as ApiErrorResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/statistics": {
          GET: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }
            const stats = this.statisticsService.getStatsSummary();
            return new Response(JSON.stringify({ success: true, data: stats } as GetStatisticsResponse), {
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

              return new Response(JSON.stringify({ success: true, data: serializedStats } as GetDetailedStatisticsResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({
                success: false,
                error: 'Failed to get detailed statistics',
                details: error instanceof Error ? error.message : 'Unknown error'
              } as ApiErrorResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/statistics/summary": {
          GET: async (req: Request) => {
            const stats = this.statisticsService.getStatsSummary();
            return new Response(JSON.stringify({ success: true, data: stats } as GetStatisticsSummaryResponse), {
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
              } as GenerateReportResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to generate report', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes": {
          GET: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }
            const processes = await this.getProcesses();
            return new Response(JSON.stringify({ success: true, data: processes } as GetProcessesResponse), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        },

        "/api/processes/reload": {
          POST: async (req: Request) => {
            if (!this.isAuthenticated(req)) {
              return this.createUnauthorizedResponse();
            }
            try {
              await configService.reload();
              await this.processManager.startManagedProcesses();
              logger.info('Process configuration reloaded and processes restarted');
              return new Response(JSON.stringify({ success: true, message: 'Process configuration reloaded' } as ReloadProcessesResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to reload process configuration', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
                return new Response(JSON.stringify({ success: false, error: 'Process not found' } as ApiErrorResponse), {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
              // Get target from route configuration if available
              const serverConfig = configService.getServerConfig();
              const route = serverConfig.routes.find(r => r.name === processId);
              const target = route?.target || '';
              await this.processManager.startProcess(processId, process, target);
              return new Response(JSON.stringify({ success: true, message: `Process ${processId} started` } as StartProcessResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to start process', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
              await this.processManager.killProcess(processId);
              return new Response(JSON.stringify({ success: true, message: `Process ${processId} killed` } as KillProcessResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to kill process', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes/:id/detach": {
          POST: async (req: Request) => {
            const url = new URL(req.url);
            const processId = url.pathname.split('/')[3];

            try {
              await this.processManager.detachProcess(processId);
              return new Response(JSON.stringify({ success: true, message: `Process ${processId} detached` }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to detach process', details: error instanceof Error ? error.message : 'Unknown error' }), {
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
              return new Response(JSON.stringify({ success: true, message: `Process ${processId} restarted` } as RestartProcessResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to restart process', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
              return new Response(JSON.stringify({ success: true, data: { processId, logs } } as GetProcessLogsResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to get logs', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        },

        "/api/processes/config": {
          GET: async (req: Request) => {
            const processConfig = configService.getProcessConfig();
            return new Response(JSON.stringify({ success: true, data: processConfig } as GetProcessConfigResponse), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          },
          PUT: async (req: Request) => {
            try {
              const newConfig = await req.json();
              await this.handleProcessConfigUpdate(newConfig);
              return new Response(JSON.stringify({ success: true, message: 'Process configuration updated' } as UpdateProcessConfigResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to update process configuration', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
              return new Response(JSON.stringify(Object.fromEntries(certificates) as GetCertificatesResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to get certificates', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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

              return new Response(JSON.stringify({ success: true, data: cacheData } as GetCacheStatsResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to get cache stats', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
              } as GetCacheEntriesResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to get cache entries', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
              return new Response(JSON.stringify({ success: true, message: 'Cache cleared successfully' } as ClearCacheResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to clear cache', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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

              return new Response(JSON.stringify({ success: true, message: 'Cache entry deleted successfully' } as DeleteCacheEntryResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: 'Failed to delete cache entry', details: error instanceof Error ? error.message : 'Unknown error' } as ApiErrorResponse), {
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
          return Response.redirect(new URL('/frontend/', req.url), 302);
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

    // Save sessions before shutdown
    SessionManager.shutdownAll();

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
      } as HealthResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      logger.error('Health check failed', error);
      return new Response(JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      } as HealthResponse), {
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
    const transformed: LogLine[] = rawLogs.map((logLine: string) => {
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

    // Enforce monotonic timestamps
    return this.normalizeLogLines(processId, transformed);
  }

  async handleProcessConfigUpdate(newConfig: any): Promise<void> {
    // Save the new process config and reload processes
    const mainConfig = configService.getMainConfig();
    if (!mainConfig) {
      throw new Error('Main configuration not available');
    }
    const configPath = mainConfig.config.processes;
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
    const transformed: LogLine[] = newLogs.map((logLine: string) => {
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

    // Enforce monotonic timestamps for streaming updates
    const logLines = this.normalizeLogLines(processId, transformed);

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