import { Server } from 'bun';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ProxyConfig } from '../types';
import { logger } from '../utils/logger';
import { BunMiddleware } from './bun-middleware';
import { BunRoutes } from './bun-routes';
import { cacheService, setCacheExpiration } from './cache';
import { configService } from './config-service';
import { ProxyCertificates } from './proxy-certificates';
import { ServiceContainer } from './service-container';
import { StatisticsService } from './statistics';

interface WebSocketProxyData {
  target: string;
  routeIdentifier: string;
  headers: Record<string, string>;
  targetWebSocket?: WebSocket;
  wsConfig?: {
    timeout: number;
    pingInterval: number;
    maxRetries: number;
    retryDelay: number;
  };
  retryCount?: number;
  pingTimer?: any;
  connectionTimeout?: any;
}

export class ProxyServer {
  private httpServer: Server | null = null;
  private httpsServer: Server | null = null;
  private config: ProxyConfig;
  private proxyRoutes: BunRoutes;
  private proxyMiddleware: BunMiddleware;
  private proxyCertificates: ProxyCertificates;
  private statisticsService: StatisticsService;

  constructor(config: ProxyConfig, serviceContainer: ServiceContainer) {
    this.config = config;

    // Get services from container
    this.statisticsService = serviceContainer.statisticsService;
    this.proxyCertificates = serviceContainer.proxyCertificates;

    // Initialize middleware and routes with service container
    this.proxyMiddleware = new BunMiddleware(this.config, serviceContainer);

    const tempDir = configService.getSetting<string>('tempDir') || path.join(process.cwd(), 'data', 'temp');
    this.proxyRoutes = new BunRoutes(tempDir, serviceContainer);

    // Set cache expiration from main config if available
    const cacheMaxAge = configService.getSetting('cache.maxAge');
    setCacheExpiration(typeof cacheMaxAge === 'number' ? cacheMaxAge : 24 * 60 * 60 * 1000);

    // Listen for configuration changes
    this.setupConfigChangeHandling();
  }

  /**
   * Create WebSocket handlers for proxy functionality
   */
  private createWebSocketHandlers() {
    return {
      open: (ws: any) => {
        const data = ws.data as WebSocketProxyData;
        logger.info(`[PROXY WS] Opening connection to ${data.target} for route ${data.routeIdentifier}`);

        data.retryCount = 0;
        this.connectToTarget(ws, data);
      },

      message: (ws: any, message: string | Buffer) => {
        const data = ws.data as WebSocketProxyData;
        try {
          // Forward message from client to target
          if (data.targetWebSocket && data.targetWebSocket.readyState === WebSocket.OPEN) {
            data.targetWebSocket.send(message);
          } else {
            logger.warn(`[PROXY WS] Target WebSocket not ready for ${data.routeIdentifier}, dropping message`);
          }
        } catch (error) {
          logger.error(`[PROXY WS] Error forwarding message from client to target for ${data.routeIdentifier}`, error);
        }
      },

      close: (ws: any, code: number, reason: string) => {
        const data = ws.data as WebSocketProxyData;
        logger.info(`[PROXY WS] Client connection closed for ${data.routeIdentifier} (${code}: ${reason})`);

        this.cleanupWebSocketConnection(data);
      },

      error: (ws: any, error: Error) => {
        const data = ws.data as WebSocketProxyData;
        logger.error(`[PROXY WS] Client connection error for ${data.routeIdentifier}`, error);

        this.cleanupWebSocketConnection(data);
      }
    };
  }

  /**
   * Connect to target WebSocket server with retry logic
   */
  private connectToTarget(clientWs: any, data: WebSocketProxyData) {
    const wsConfig = data.wsConfig || { timeout: 30000, pingInterval: 0, maxRetries: 3, retryDelay: 1000 };

    try {
      // Set connection timeout
      data.connectionTimeout = setTimeout(() => {
        logger.error(`[PROXY WS] Connection timeout for ${data.routeIdentifier}`);
        try {
          clientWs.close(1011, 'Connection timeout');
        } catch (error) {
          logger.error(`[PROXY WS] Error closing client connection on timeout for ${data.routeIdentifier}`, error);
        }
      }, wsConfig.timeout);

      // Create WebSocket connection to target server (using Bun's WebSocket implementation)
      const targetWs = new WebSocket(data.target) as any;
      data.targetWebSocket = targetWs;

      targetWs.onopen = () => {
        logger.info(`[PROXY WS] Connected to target ${data.target}`);

        // Clear connection timeout
        if (data.connectionTimeout) {
          clearTimeout(data.connectionTimeout);
          data.connectionTimeout = null;
        }

        // Reset retry count on successful connection
        data.retryCount = 0;

        // Set up ping interval if configured (using proper WebSocket ping frames)
        if (wsConfig.pingInterval > 0) {
          data.pingTimer = setInterval(() => {
            try {
              if (targetWs.readyState === WebSocket.OPEN) {
                // Send proper WebSocket ping frame for keep-alive
                targetWs.ping();
              }
            } catch (error) {
              logger.error(`[PROXY WS] Error sending ping to target for ${data.routeIdentifier}`, error);
            }
          }, wsConfig.pingInterval);
        }
      };

      targetWs.onmessage = (event: any) => {
        try {
          // Forward message from target to client
          if (clientWs.readyState === 1) { // WebSocket.OPEN
            clientWs.send(event.data);
          }
        } catch (error) {
          logger.error(`[PROXY WS] Error forwarding message from target to client for ${data.routeIdentifier}`, error);
        }
      };

      targetWs.onclose = (event: any) => {
        logger.info(`[PROXY WS] Target connection closed for ${data.routeIdentifier} (${event.code}: ${event.reason})`);

        // Clear timers
        this.cleanupTimers(data);

        // Attempt to reconnect if not a normal closure and retries available
        if (event.code !== 1000 && data.retryCount! < wsConfig.maxRetries) {
          data.retryCount = (data.retryCount || 0) + 1;
          logger.info(`[PROXY WS] Attempting reconnection ${data.retryCount}/${wsConfig.maxRetries} for ${data.routeIdentifier}`);

          setTimeout(() => {
            this.connectToTarget(clientWs, data);
          }, wsConfig.retryDelay);
        } else {
          // Close client connection
          try {
            clientWs.close(event.code, event.reason);
          } catch (error) {
            logger.error(`[PROXY WS] Error closing client connection for ${data.routeIdentifier}`, error);
          }
        }
      };

      targetWs.onerror = (error: any) => {
        logger.error(`[PROXY WS] Target connection error for ${data.routeIdentifier}`, error);

        // Clear connection timeout
        if (data.connectionTimeout) {
          clearTimeout(data.connectionTimeout);
          data.connectionTimeout = null;
        }

        // Attempt to reconnect if retries available
        if (data.retryCount! < wsConfig.maxRetries) {
          data.retryCount = (data.retryCount || 0) + 1;
          logger.info(`[PROXY WS] Attempting reconnection ${data.retryCount}/${wsConfig.maxRetries} after error for ${data.routeIdentifier}`);

          setTimeout(() => {
            this.connectToTarget(clientWs, data);
          }, wsConfig.retryDelay);
        } else {
          // Close client connection
          try {
            clientWs.close(1011, 'Target connection failed');
          } catch (err) {
            logger.error(`[PROXY WS] Error closing client connection after target error for ${data.routeIdentifier}`, err);
          }
        }
      };

    } catch (error) {
      logger.error(`[PROXY WS] Error creating target connection for ${data.routeIdentifier}`, error);

      // Clear connection timeout
      if (data.connectionTimeout) {
        clearTimeout(data.connectionTimeout);
        data.connectionTimeout = null;
      }

      // Attempt to reconnect if retries available
      if (data.retryCount! < wsConfig.maxRetries) {
        data.retryCount = (data.retryCount || 0) + 1;
        logger.info(`[PROXY WS] Attempting reconnection ${data.retryCount}/${wsConfig.maxRetries} after creation error for ${data.routeIdentifier}`);

        setTimeout(() => {
          this.connectToTarget(clientWs, data);
        }, wsConfig.retryDelay);
      } else {
        // Close client connection
        try {
          clientWs.close(1011, 'Failed to connect to target');
        } catch (err) {
          logger.error(`[PROXY WS] Error closing client connection after target creation error for ${data.routeIdentifier}`, err);
        }
      }
    }
  }

  /**
   * Clean up timers for WebSocket connection
   */
  private cleanupTimers(data: WebSocketProxyData) {
    if (data.pingTimer) {
      clearInterval(data.pingTimer);
      data.pingTimer = null;
    }

    if (data.connectionTimeout) {
      clearTimeout(data.connectionTimeout);
      data.connectionTimeout = null;
    }
  }

  /**
   * Clean up WebSocket connection and resources
   */
  private cleanupWebSocketConnection(data: WebSocketProxyData) {
    // Clean up timers
    this.cleanupTimers(data);

    // Close target connection
    try {
      if (data.targetWebSocket && data.targetWebSocket.readyState === WebSocket.OPEN) {
        data.targetWebSocket.close();
      }
    } catch (error) {
      logger.error(`[PROXY WS] Error closing target connection for ${data.routeIdentifier}`, error);
    }
  }

  async initialize(): Promise<void> {
    logger.info('Initializing proxy server...');

    // Start HTTP server (for ACME challenges)
    await this.startHttpServer();

    // Set up SSL certificates
    await this.proxyCertificates.setupCertificates();

    // Set up routes (for complex routes that need the full routing system)
    this.proxyRoutes.setupRoutes(this.config);

    // Sync route configurations to statistics database
    this.statisticsService.syncRouteConfigs(this.config.routes);

    // Set up cache cleanup
    this.setupCacheCleanup();

    logger.info('Proxy server initialization complete');
  }


  private setupCacheCleanup(): void {
    // Set up periodic cache cleanup
    setInterval(() => {
      cacheService.cleanup();
    }, 60 * 60 * 1000); // Clean up every hour

    logger.info('Cache cleanup scheduled (every hour)');
  }

  async startHttpServer(): Promise<void> {
    logger.info('Starting proxy server...');

    // Start HTTP server
    this.httpServer = Bun.serve({
      port: this.config.port,
      fetch: this.handleRequest.bind(this),
      error: this.handleError.bind(this),
      websocket: this.createWebSocketHandlers()
    });

    logger.info(`HTTP server started on port ${this.config.port}`);
  }
  async startHttpsServer(): Promise<void> {
    // Start HTTPS server only if we have valid certificates
    try {
      const certificates = this.proxyCertificates.getAllCertificates();
      const validCertificates = Array.from(certificates.values()).filter((cert: any) => cert.isValid);

      if (validCertificates.length > 0) {
        // Use the first valid certificate as default for HTTPS server
        const tlsOptions = this.proxyCertificates.getBunTLSOptionsSNI();

        if (tlsOptions.length > 0) {
          this.httpsServer = Bun.serve({
            port: this.config.httpsPort || 4443,
            fetch: this.handleRequest.bind(this),
            error: this.handleError.bind(this),
            tls: tlsOptions,
            websocket: this.createWebSocketHandlers(),
            routes: {
              "/robots.txt": () => new Response("User-agent: *\nDisallow: /", { status: 200 })
            }
          });

          logger.info(`HTTPS server started on port ${this.config.httpsPort || 4443} with ${tlsOptions.length} certificates`);
        } else {
          logger.warn('Failed to get TLS options for HTTPS server');
          this.httpsServer = null;
        }
      } else {
        logger.warn('No valid certificates available, HTTPS server will not start');
        this.httpsServer = null;
      }
    } catch (error) {
      logger.warn('HTTPS server initialization failed', error);
      this.httpsServer = null;
    }

    logger.info('Proxy server started successfully');
  }

  async stop(): Promise<void> {
    logger.info('Stopping proxy server...');

    // Stop HTTP server
    if (this.httpServer) {
      this.httpServer.stop();
      this.httpServer = null;
      logger.info('HTTP server stopped');
    }

    // Stop HTTPS server
    if (this.httpsServer) {
      this.httpsServer.stop();
      this.httpsServer = null;
      logger.info('HTTPS server stopped');
    }

    // Shutdown statistics service
    await this.statisticsService.shutdown();

    // Shutdown cache service (no shutdown method, just cleanup)
    await cacheService.cleanup();


    logger.info('Proxy server stopped successfully');
  }

  async handleRequest(req: Request, server: Server): Promise<Response> {
    logger.info(`[PROXY] Handling request: ${req.url}`);
    const url = new URL(req.url);

    // Handle ACME challenge files for Let's Encrypt
    if (url.pathname.startsWith('/.well-known/acme-challenge/')) {
      return this.handleAcmeChallenge(url.pathname);
    }

    // Try to handle the request through the routes
    const routeResponse = await this.proxyRoutes.handleRequest(req, server, this.proxyMiddleware);
    if (routeResponse) {
      return routeResponse;
    }

    // If no route handled the request, return 404
    return new Response('Not Found', { status: 404 });
  }

  private async handleAcmeChallenge(pathname: string): Promise<Response> {
    try {
      const challengeFilePath = path.join(process.cwd(), pathname);

      // Check if the challenge file exists
      if (await fs.pathExists(challengeFilePath)) {
        const challengeContent = await fs.readFile(challengeFilePath, 'utf8');
        logger.info(`[ACME] Serving challenge file: ${pathname}`);

        return new Response(challengeContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache',
          }
        });
      } else {
        logger.warn(`[ACME] Challenge file not found: ${pathname}`);
        return new Response('Challenge file not found', { status: 404 });
      }
    } catch (error) {
      logger.error(`[ACME] Error serving challenge file ${pathname}:`, error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  private handleError(error: Error): Response {
    logger.error('Server error', error);
    return new Response('Internal Server Error', { status: 500 });
  }



  getStatus(): any {
    return {
      httpPort: this.config.port,
      httpsPort: this.config.httpsPort,
      routes: this.config.routes.length,
      certificates: this.proxyCertificates.getAllCertificates(),
      statistics: this.statisticsService.getStatsSummary(),
      cache: cacheService.getStats(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  getConfig(): ProxyConfig {
    return this.config;
  }

  getStatisticsService(): any {
    return this.statisticsService;
  }

  private setupConfigChangeHandling(): void {
    configService.on('configReloading', () => {
      logger.info('Configuration reloading...');
    });

    configService.on('configReloaded', async (newConfigs: any) => {
      logger.info('Configuration reloaded, updating server...');
      await this.handleConfigUpdate(newConfigs);
    });

    configService.on('configReloadError', (error: any) => {
      logger.error('Configuration reload failed', error);
    });
  }

  private async handleConfigUpdate(newConfigs: any): Promise<void> {
    try {
      // Update server configuration
      if (newConfigs.serverConfig) {
        this.config = newConfigs.serverConfig;

        // Update routes with new configuration
        this.proxyRoutes.setupRoutes(this.config);
        logger.info('Routes updated with new configuration');
      }
      logger.info('Proxy server configuration updated successfully');
    } catch (error) {
      logger.error('Failed to update proxy server configuration', error);
    }
  }
} 