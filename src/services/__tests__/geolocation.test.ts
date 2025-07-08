import { GeolocationService } from '../geolocation';
import { test, describe, expect, beforeEach, jest } from 'bun:test';

// Local mock for geoip-lite
const mockLookup = jest.fn();
const geoip = {
  lookup: mockLookup,
  startWatchingDataUpdate: jest.fn(),
};

describe('GeolocationService', () => {
  let geolocationService: GeolocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a new instance for each test to avoid cache interference
    geolocationService = new GeolocationService();
    // @ts-ignore - override the imported geoip-lite with our mock
    (geolocationService as any).geoip = geoip;
  });

  describe('getGeolocation', () => {
    test('should return geolocation data for valid public IP', () => {
      const mockGeoData = {
        range: [134744064, 134744319] as [number, number],
        country: 'US',
        region: 'CA',
        eu: '0' as '0' | '1',
        timezone: 'America/Los_Angeles',
        city: 'Los Angeles',
        ll: [34.0522, -118.2437] as [number, number],
        metro: 803,
        area: 1000,
      };

      mockLookup.mockReturnValue(mockGeoData);

      const result = geolocationService.getGeolocation('8.8.8.8');

      expect(result).toEqual({
        country: 'US',
        region: 'CA',
        city: 'Los Angeles',
        timezone: 'America/Los_Angeles',
        latitude: 34.0522,
        longitude: -118.2437,
        range: [134744064, 134744319],
      });
    });

    test('should return local info for private IP addresses', () => {
      const privateIPs = ['192.168.1.1', '10.0.0.1', '172.16.0.1', '127.0.0.1'];

      privateIPs.forEach(ip => {
        const result = geolocationService.getGeolocation(ip);
        expect(result).toEqual({
          country: 'Local',
          region: 'Local',
          city: 'Local',
          timezone: 'Local',
          isp: 'Local Network',
        });
      });

      // Should not call geoip lookup for private IPs
      expect(mockLookup).not.toHaveBeenCalled();
    });

    test('should return local info for IPv6 private addresses', () => {
      const privateIPv6s = ['::1', 'fc00::1', 'fd00::1', 'fe80::1'];

      privateIPv6s.forEach(ip => {
        const result = geolocationService.getGeolocation(ip);
        expect(result).toEqual({
          country: 'Local',
          region: 'Local',
          city: 'Local',
          timezone: 'Local',
          isp: 'Local Network',
        });
      });

      expect(mockLookup).not.toHaveBeenCalled();
    });

    test('should return local info for localhost and unknown IPs', () => {
      const localIPs = ['unknown', '127.0.0.1', '::1'];

      localIPs.forEach(ip => {
        const result = geolocationService.getGeolocation(ip);
        expect(result).toEqual({
          country: 'Local',
          region: 'Local',
          city: 'Local',
          timezone: 'Local',
          isp: 'Local Network',
        });
      });
    });

    test('should return null when geoip lookup returns null', () => {
      mockLookup.mockReturnValue(null);

      const result = geolocationService.getGeolocation('8.8.8.8');

      expect(result).toBeNull();
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    test('should handle geoip lookup errors gracefully', () => {
      mockLookup.mockImplementation(() => {
        throw new Error('GeoIP lookup failed');
      });

      const result = geolocationService.getGeolocation('8.8.8.8');

      expect(result).toBeNull();
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    test('should handle partial geoip data', () => {
      const partialGeoData = {
        range: [134744064, 134744319] as [number, number],
        country: 'US',
        region: 'CA',
        eu: '0' as '0' | '1',
        timezone: 'America/Los_Angeles',
        city: 'Los Angeles',
        ll: undefined as any, // Explicitly set ll as undefined
        metro: 803,
        area: 1000,
      };

      mockLookup.mockReturnValue(partialGeoData);

      const result = geolocationService.getGeolocation('8.8.8.8');

      expect(result).toEqual({
        country: 'US',
        region: 'CA',
        city: 'Los Angeles',
        timezone: 'America/Los_Angeles',
        latitude: undefined,
        longitude: undefined,
        range: [134744064, 134744319],
      });
    });
  });

  describe('caching', () => {
    test('should cache geolocation results', () => {
      const mockGeoData = {
        range: [134744064, 134744319] as [number, number],
        country: 'US',
        region: 'CA',
        eu: '0' as '0' | '1',
        timezone: 'America/Los_Angeles',
        city: 'Los Angeles',
        ll: [34.0522, -118.2437] as [number, number],
        metro: 803,
        area: 1000,
      };

      mockLookup.mockReturnValue(mockGeoData);

      // First call
      const result1 = geolocationService.getGeolocation('8.8.8.8');
      // Second call
      const result2 = geolocationService.getGeolocation('8.8.8.8');

      expect(result1).toEqual(result2);
      // Should only call lookup once due to caching
      expect(mockLookup).toHaveBeenCalledTimes(1);
    });

    test('should cache null results', () => {
      mockLookup.mockReturnValue(null);

      // First call
      const result1 = geolocationService.getGeolocation('8.8.8.8');
      // Second call
      const result2 = geolocationService.getGeolocation('8.8.8.8');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      // Should only call lookup once due to caching
      expect(mockLookup).toHaveBeenCalledTimes(1);
    });

    test('should return cache statistics', () => {
      const stats = geolocationService.getCacheStats();

      expect(stats).toEqual({
        size: expect.any(Number),
        maxSize: 1000,
      });
    });
  });

  describe('getInstance', () => {
    test('should return the same instance (singleton)', () => {
      const instance1 = GeolocationService.getInstance();
      const instance2 = GeolocationService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
}); 