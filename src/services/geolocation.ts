import * as geoip from 'geoip-lite';
import { logger } from '../utils/logger';

export interface GeolocationInfo {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  range?: number[];
}

export class GeolocationService {
  private static instance: GeolocationService;
  private cache: Map<string, GeolocationInfo | null> = new Map();
  private readonly CACHE_SIZE = 1000;

  constructor() {
    // Load GeoIP database on startup
    try {
      geoip.startWatchingDataUpdate();
      logger.info('GeoIP database loaded successfully');
    } catch (error) {
      logger.warn('Failed to load GeoIP database', error);
    }
  }

  public static getInstance(): GeolocationService {
    if (!GeolocationService.instance) {
      GeolocationService.instance = new GeolocationService();
    }
    return GeolocationService.instance;
  }

  public getGeolocation(ip: string): GeolocationInfo | null {
    // Check cache first
    if (this.cache.has(ip)) {
      return this.cache.get(ip) || null;
    }

    // Skip private/local IPs
    if (this.isPrivateIP(ip) || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
      const localInfo: GeolocationInfo = {
        country: 'Local',
        region: 'Local',
        city: 'Local',
        timezone: 'Local',
        isp: 'Local Network',
      };
      this.addToCache(ip, localInfo);
      return localInfo;
    }

    try {
      const geoData = geoip.lookup(ip);
      if (geoData) {
        const geoInfo: GeolocationInfo = {
          country: geoData.country,
          region: geoData.region,
          city: geoData.city,
          timezone: geoData.timezone,
          latitude: geoData.ll?.[0],
          longitude: geoData.ll?.[1],
          range: geoData.range,
        };
        this.addToCache(ip, geoInfo);
        return geoInfo;
      }
    } catch (error) {
      logger.debug(`Failed to get geolocation for IP ${ip}`, error);
    }

    // Return null for unknown IPs
    this.addToCache(ip, null);
    return null;
  }

  private isPrivateIP(ip: string): boolean {
    // IPv4 private ranges
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length !== 4) return false;
      
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);
      
      return (
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        first === 127
      );
    }
    
    // IPv6 private ranges
    if (ip.includes(':')) {
      return (
        ip.startsWith('::1') ||
        ip.startsWith('fc00') ||
        ip.startsWith('fd00') ||
        ip.startsWith('fe80')
      );
    }
    
    return false;
  }

  private addToCache(ip: string, geoInfo: GeolocationInfo | null): void {
    // Simple LRU cache implementation
    if (this.cache.size >= this.CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(ip, geoInfo);
  }

  public getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.CACHE_SIZE,
    };
  }
}

export const geolocationService = GeolocationService.getInstance(); 