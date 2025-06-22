import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { CSPConfig, CSPDirectives, GeolocationFilter, ServerConfig } from '../types';
import { logger } from '../utils/logger';
import { geolocationService, GeolocationInfo } from './geolocation';

export class ProxyMiddleware {
  setupMiddleware(app: express.Application, config: ServerConfig): void {
    // Basic middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(cookieParser());
    
    // Trust proxy headers
    app.set('trust proxy', true);
    
    // Security middleware
    this.setupSecurityMiddleware(app, config);
    
    // CORS middleware
    this.setupCorsMiddleware(app, config);
    
    // Request logging middleware
    this.setupRequestLogging(app);
    
    // Geolocation middleware
    this.setupGeolocationMiddleware(app, config);
  }

  private setupSecurityMiddleware(app: express.Application, config: ServerConfig): void {
    // Helmet for security headers
    app.use(helmet({
      contentSecurityPolicy: false, // We'll handle CSP per-route
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      dnsPrefetchControl: false,
      frameguard: false,
      hidePoweredBy: true,
      hsts: false, // We'll handle HSTS per-route
      ieNoOpen: true,
      noSniff: true,
      permittedCrossDomainPolicies: false,
      referrerPolicy: false,
      xssFilter: true
    }));

    // Custom security headers
    app.use((req, res, next) => {
      // Remove X-Powered-By header
      res.removeHeader('X-Powered-By');
      
      // Add custom security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      next();
    });
  }

  private setupCorsMiddleware(app: express.Application, config: ServerConfig): void {
    // Global CORS configuration - use default values since ServerConfig doesn't have global CORS
    const globalCorsOptions = {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: [],
      maxAge: 86400
    };

    app.use(cors(globalCorsOptions));
  }

  private setupRequestLogging(app: express.Application): void {
    app.use((req, res, next) => {
      logger.info(`[REQUEST] ${req.method} ${req.originalUrl}`);
      next();
    });
  }

  private setupGeolocationMiddleware(app: express.Application, config: ServerConfig): void {
    app.use(async (req, res, next) => {
      try {
        const clientIP = this.getClientIP(req);
        const geolocation = await geolocationService.getGeolocation(clientIP);
        
        // Attach geolocation to request for later use
        (req as any).geolocation = geolocation;
        
        // Check geolocation filters
        const filter = this.getGeolocationFilterForRequest(req);
        if (filter && this.shouldBlockRequest(geolocation, filter)) {
          const locationString = this.formatLocationString(clientIP, geolocation);
          logger.warn(`[GEOBLOCK] Request blocked from ${locationString}`, {
            ip: clientIP,
            geolocation,
            filter
          });
          return res.status(403).json({
            error: 'Access Denied',
            message: 'Access denied based on your location'
          });
        }
        
        next();
      } catch (error) {
        logger.error('Error in geolocation middleware', error);
        next(); // Continue without geolocation
      }
    });
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

  private getGeolocationFilterForRequest(req: express.Request): GeolocationFilter | null {
    // This would be implemented based on your specific filtering logic
    // For now, return null to indicate no filtering
    return null;
  }

  private shouldBlockRequest(geolocation: GeolocationInfo | null, filter: GeolocationFilter): boolean {
    // This would be implemented based on your specific filtering logic
    // For now, return false to allow all requests
    return false;
  }

  private formatLocationString(clientIP: string, geolocation: GeolocationInfo | null): string {
    if (!geolocation) {
      return clientIP;
    }
    
    const parts = [];
    if (geolocation.city) parts.push(geolocation.city);
    if (geolocation.region) parts.push(geolocation.region);
    if (geolocation.country) parts.push(geolocation.country);
    
    return parts.length > 0 ? `${clientIP} (${parts.join(', ')})` : clientIP;
  }

  buildCSPHeader(cspConfig: CSPConfig): string {
    const directives: CSPDirectives = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https:'],
      connectSrc: ["'self'", 'https:'],
      mediaSrc: ["'self'", 'https:'],
      objectSrc: ["'none'"],
      frameSrc: ["'self'"],
      workerSrc: ["'self'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: true,
      ...cspConfig.directives
    };

    const cspParts: string[] = [];
    
    for (const [directive, sources] of Object.entries(directives)) {
      if (sources && Array.isArray(sources) && sources.length > 0) {
        cspParts.push(`${directive} ${sources.join(' ')}`);
      } else if (sources === true) {
        cspParts.push(directive);
      }
    }

    return cspParts.join('; ');
  }

  getCSPForRoute(routePath: string, route?: any): CSPConfig | null {
    // This would be implemented based on your specific CSP logic
    // For now, return null to indicate no CSP
    return null;
  }
} 