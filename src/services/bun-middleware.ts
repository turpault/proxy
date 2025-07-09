import { CSPConfig, CSPDirectives, GeolocationFilter, ProxyConfig } from '../types';
import { logger } from '../utils/logger';
import { geolocationService, GeolocationInfo } from './geolocation';
import { BunRequest, Server } from 'bun';

export interface BunRequestContext {
  method: string;
  url: string;
  pathname: string;
  headers: Record<string, string>;
  body: any;
  query: Record<string, string>;
  ip: string;
  originalUrl: string;
  req: BunRequest;
  server: Server;
}

export class BunMiddleware {
  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  async processRequest(requestContext: BunRequestContext): Promise<Response | null> {
    // Apply security headers
    const securityHeaders = this.buildSecurityHeaders();

    // Apply CORS headers
    const corsHeaders = this.buildCorsHeaders();

    // Apply geolocation filtering
    const geolocationResult = await this.processGeolocation(requestContext);
    if (geolocationResult) {
      return geolocationResult;
    }

    // Log request
    logger.info(`[REQUEST] ${requestContext.method} ${requestContext.originalUrl}`);

    // Return null to continue processing (no early response)
    return null;
  }

  private buildSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
  }

  private buildCorsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    };
  }

  private async processGeolocation(requestContext: BunRequestContext): Promise<Response | null> {
    try {
      const clientIP = this.getClientIP(requestContext);
      const geolocation = await geolocationService.getGeolocation(clientIP);

      // Attach geolocation to request context for later use
      (requestContext as any).geolocation = geolocation;

      // Check geolocation filters
      const filter = this.getGeolocationFilterForRequest(requestContext);
      if (filter && this.shouldBlockRequest(geolocation, filter)) {
        const locationString = this.formatLocationString(clientIP, geolocation);
        logger.warn(`[GEOBLOCK] Request blocked from ${locationString}`, {
          ip: clientIP,
          geolocation,
          filter
        });

        return new Response(JSON.stringify({
          error: 'Access Denied',
          message: 'Access denied based on your location'
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return null;
    } catch (error) {
      logger.error('Error in geolocation middleware', error);
      return null; // Continue without geolocation
    }
  }

  private getClientIP(requestContext: BunRequestContext): string {
    const headers = requestContext.headers;
    const xForwardedFor = headers['x-forwarded-for'];
    const xRealIP = headers['x-real-ip'];
    const xClientIP = headers['x-client-ip'];

    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, first one is the original client
      const firstIP = xForwardedFor.split(',')[0];
      return firstIP ? firstIP.trim() : 'unknown';
    }

    if (xRealIP) {
      return xRealIP;
    }

    if (xClientIP) {
      return xClientIP;
    }

    return requestContext.ip || 'unknown';
  }

  private getGeolocationFilterForRequest(requestContext: BunRequestContext): GeolocationFilter | null {
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