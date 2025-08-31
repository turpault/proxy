import { BunRequestContext, CSPConfig, CSPDirectives, GeolocationFilter, ProxyConfig, ProxyRoute } from '../types';
import { logger } from '../utils/logger';
import { GeolocationInfo } from './geolocation';
import { OAuth2Service } from './oauth2';
import { StatisticsService } from './statistics';
import { ServiceContainer } from './service-container';


export class BunMiddleware {
  private oauth2Service: OAuth2Service;
  private statisticsService: StatisticsService;
  private geolocationService: any;
  private config: ProxyConfig;

  constructor(config: ProxyConfig, serviceContainer: ServiceContainer) {
    this.oauth2Service = serviceContainer.oauth2Service;
    this.statisticsService = serviceContainer.statisticsService;
    this.geolocationService = serviceContainer.geolocationService;
    this.config = config;
  }

  async processRequest(requestContext: BunRequestContext, route: ProxyRoute): Promise<Response | null> {
    // Apply security headers
    const securityHeaders = this.buildSecurityHeaders();

    // Apply CORS headers
    const corsHeaders = this.buildCorsHeaders();

    // Apply geolocation filtering
    const geolocationResult = await this.processGeolocation(requestContext, route);
    if (geolocationResult) {
      return geolocationResult;
    }

    // Apply OAuth2 authentication
    const oauth2Result = await this.processOAuth2(requestContext, route);
    if (oauth2Result) {
      return oauth2Result;
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

  private async processGeolocation(requestContext: BunRequestContext, route: ProxyRoute): Promise<Response | null> {
    try {
      // Check geolocation filters
      const filter = this.getGeolocationFilterForRequest(requestContext, route);
      if (filter && this.shouldBlockRequest(requestContext.geolocation, filter)) {
        const locationString = this.formatLocationString(requestContext.ip, requestContext.geolocation);
        logger.warn(`[GEOBLOCK] Request blocked from ${locationString}`, {
          ip: requestContext.ip,
          geolocation: requestContext.geolocation,
          filter
        });

        // Use custom response if provided, otherwise use default
        const statusCode = filter.customResponse?.statusCode || 403;
        const message = filter.customResponse?.message || 'Access denied based on your location';

        if (filter.customResponse?.redirectUrl) {
          return new Response(null, {
            status: 302,
            headers: { 'Location': filter.customResponse.redirectUrl }
          });
        }

        return new Response(JSON.stringify({
          error: 'Access Denied',
          message: message
        }), {
          status: statusCode,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return null;
    } catch (error) {
      logger.error('Error in geolocation middleware', error);
      return null; // Continue without geolocation
    }
  }

  private async processOAuth2(requestContext: BunRequestContext, route: ProxyRoute): Promise<Response | null> {
    try {
      // Check if OAuth2 is enabled for this route
      if (!route.oauth2?.enabled) {
        return null; // OAuth2 not enabled for this route
      }

      // Check if this is a public path that doesn't require authentication
      const isPublicPath = this.isPublicPath(requestContext.pathname, route);
      logger.info(`[OAUTH2] ${requestContext.method} ${requestContext.pathname} - isPublicPath: ${isPublicPath}`);
      if (isPublicPath) {
        return null; // Public path, no authentication required
      }

      // Use the existing OAuth2 middleware if it's already created
      if (!route.oauthMiddleware) {

        // Create OAuth2 middleware for this route
        const oauth2Middleware = this.oauth2Service.createBunMiddleware(
          route.oauth2,
          route.publicPaths || [],
          route.path || '',
          route
        );

        // Store the middleware for future use
        route.oauthMiddleware = oauth2Middleware;
      }

      // Process the request with OAuth2 middleware
      return await route.oauthMiddleware(requestContext);

    } catch (error) {
      logger.error('Error in OAuth2 middleware', error);
      return null; // Continue without OAuth2
    }
  }

  private getGeolocationFilterForRequest(requestContext: BunRequestContext, route: ProxyRoute): GeolocationFilter | null {
    // Priority order: route-specific filter > global filter > no filter

    // Check route-specific filter first
    if (route.geolocationFilter?.enabled) {
      return route.geolocationFilter;
    }

    // Check global filter from config
    if (this.config.security?.geolocationFilter?.enabled) {
      return this.config.security.geolocationFilter;
    }

    return null;
  }

  private shouldBlockRequest(geolocation: GeolocationInfo | null, filter: GeolocationFilter): boolean {
    if (!geolocation) {
      // If we can't determine location, allow the request by default
      // You might want to change this behavior based on your security requirements
      return false;
    }

    const { mode = 'block', countries = [], regions = [], cities = [] } = filter;

    // Check if the location matches any of the specified criteria
    // Empty arrays mean "no restrictions" for that field
    const matchesCountry = countries.length === 0 || countries.includes(geolocation.country || '');
    const matchesRegion = regions.length === 0 || regions.includes(geolocation.region || '');
    const matchesCity = cities.length === 0 || cities.includes(geolocation.city || '');

    // For allow mode: block if NOT in the allowlist
    // For block mode: block if IN the blocklist
    if (mode === 'allow') {
      // Allow mode: block if location doesn't match any criteria
      // All criteria must match (country AND region AND city)
      return !(matchesCountry && matchesRegion && matchesCity);
    } else {
      // Block mode: block if location matches any criteria
      // Any criteria match (country OR region OR city)
      // But only if that field has restrictions (non-empty array)
      const hasCountryRestriction = countries.length > 0 && countries.includes(geolocation.country || '');
      const hasRegionRestriction = regions.length > 0 && regions.includes(geolocation.region || '');
      const hasCityRestriction = cities.length > 0 && cities.includes(geolocation.city || '');

      return hasCountryRestriction || hasRegionRestriction || hasCityRestriction;
    }
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

  private isPublicPath(pathname: string, route: ProxyRoute): boolean {
    // Check if the path is in the public paths list
    if (route.publicPaths) {
      logger.info(`[OAUTH2] ${pathname} - publicPaths: ${route.publicPaths}`);

      return route.publicPaths.some(publicPath =>
        pathname.startsWith(`${route.path}${publicPath}`)
      );
    }

    return false;
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