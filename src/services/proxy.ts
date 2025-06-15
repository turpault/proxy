import express from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs-extra';
import * as path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import mime from 'mime-types';
import { ProxyRoute, ServerConfig, CertificateInfo, CSPConfig, CSPDirectives } from '../types';
import { logger } from '../utils/logger';
import { LetsEncryptService } from './letsencrypt';

export class ProxyServer {
  private app: express.Application;
  private httpServer: http.Server | null = null;
  private httpsServer: https.Server | null = null;
  private config: ServerConfig;
  private letsEncryptService: LetsEncryptService;
  private certificates: Map<string, CertificateInfo> = new Map();

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.letsEncryptService = new LetsEncryptService({
      email: config.letsEncrypt.email,
      staging: config.letsEncrypt.staging,
      certDir: config.letsEncrypt.certDir,
      domains: config.routes.map(route => route.domain),
    });
    
    this.setupMiddleware();
    this.setupRoutes();
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
        // Convert camelCase to helmet's expected format
        Object.entries(dirs).forEach(([key, value]) => {
          if (typeof value === 'boolean') {
            // Skip boolean directives for helmet config
            return;
          } else if (Array.isArray(value) && value.length > 0) {
            // Convert camelCase key to helmet format
            const helmetKey = key.replace(/([A-Z])/g, (match, p1) => p1.toLowerCase());
            cspDirectives[helmetKey] = value;
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

    // CORS
    this.app.use(cors());

    // Trust proxy headers
    this.app.set('trust proxy', true);

    // Request logging
    this.app.use((req, res, next) => {
      logger.http(`${req.method} ${req.url}`, {
        host: req.get('host'),
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
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
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
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

    const proxyOptions: Options = {
      target: route.target,
      changeOrigin: true,
      secure: false,
      timeout: 30000,
      proxyTimeout: 30000,
      headers: route.headers || {},
      pathRewrite: route.rewrite || {},
      onError: (err, req, res) => {
        logger.error(`Proxy error for path ${routePath}`, {
          error: err.message,
          target: route.target,
          url: req.url,
        });
        
        if (!res.headersSent) {
          res.status(502).json({
            error: 'Bad Gateway',
            message: 'The upstream server is not responding',
          });
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        logger.debug(`Proxy response for path ${routePath}`, {
          statusCode: proxyRes.statusCode,
          target: route.target,
          url: req.url,
        });
      },
    };

    const proxy = createProxyMiddleware(proxyOptions);
    this.app.use(routePath, proxy);

    logger.info(`Path proxy route configured: ${routePath} -> ${route.target}`);
  }

  private setupProxyRoute(route: ProxyRoute): void {
    const proxyOptions: Options = {
      target: route.target,
      changeOrigin: true,
      secure: false, // Allow self-signed certificates on target
      timeout: 30000,
      proxyTimeout: 30000,
      headers: route.headers || {},
      pathRewrite: route.rewrite || {},
      onError: (err, req, res) => {
        logger.error(`Proxy error for ${route.domain}`, {
          error: err.message,
          target: route.target,
          url: req.url,
        });
        
        if (!res.headersSent) {
          res.status(502).json({
            error: 'Bad Gateway',
            message: 'The upstream server is not responding',
          });
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        logger.debug(`Proxy response for ${route.domain}`, {
          statusCode: proxyRes.statusCode,
          target: route.target,
          url: req.url,
        });
      },
    };

    // Create proxy middleware
    const proxy = createProxyMiddleware(proxyOptions);

    // Setup route with domain-based routing
    this.app.use((req, res, next) => {
      const host = req.get('host');
      if (host === route.domain || host === `www.${route.domain}`) {
        return proxy(req, res, next);
      }
      next();
    });

    logger.info(`Proxy route configured: ${route.domain} -> ${route.target}`);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing proxy server...');

    try {
      // Initialize Let's Encrypt service
      await this.letsEncryptService.initialize();

      // Load or generate certificates for all domains
      await this.setupCertificates();

      logger.info('Proxy server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize proxy server', error);
      throw error;
    }
  }

  private async setupCertificates(): Promise<void> {
    const domains = this.config.routes.map(route => route.domain);
    
    for (const domain of domains) {
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

  async start(): Promise<void> {
    await this.initialize();

    // Start HTTP server (for redirects and Let's Encrypt challenges)
    this.httpServer = http.createServer(this.app);
    this.httpServer.listen(this.config.port, () => {
      logger.info(`HTTP server listening on port ${this.config.port}`);
    });

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

    await Promise.all(promises);
    logger.info('Proxy server stopped');
  }

  getStatus(): any {
    return {
      status: 'running',
      certificates: Array.from(this.certificates.entries()).map(([domain, cert]) => ({
        domain,
        expiresAt: cert.expiresAt,
        isValid: cert.isValid,
      })),
      routes: this.config.routes.map(route => ({
        domain: route.domain,
        target: route.target,
        ssl: this.certificates.has(route.domain),
      })),
    };
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
} 