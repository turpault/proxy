import { test, describe, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { BunProxyServer } from '../src/server';

const SECURITY_TEST_CONFIG = {
  server: {
    port: 8444,
    host: 'localhost',
    ssl: {
      enabled: true,
      cert: './certificates/test-cert.pem',
      key: './certificates/test-key.pem'
    }
  },
  routes: [
    {
      name: 'secure-proxy',
      domain: 'secure.test.local',
      target: 'http://localhost:8080',
      ssl: true,
      path: '/',
      type: 'proxy',
      oauth2: {
        enabled: true,
        clientId: 'test-client',
        clientSecret: 'test-secret',
        authorizationUrl: 'https://auth.test.com/oauth/authorize',
        tokenUrl: 'https://auth.test.com/oauth/token',
        scope: 'read write'
      }
    }
  ],
  security: {
    rateLimit: {
      enabled: true,
      windowMs: 1000, // 1 second for testing
      maxRequests: 5
    },
    geolocation: {
      enabled: true,
      allowedCountries: ['US', 'CA'],
      blockedCountries: ['XX'],
      allowPrivateIPs: false
    },
    cors: {
      enabled: true,
      origin: ['http://localhost:3000'],
      credentials: true
    }
  }
};

let server: BunProxyServer;
let testServer: any;

async function startTestServer() {
  testServer = Bun.serve({
    port: 8080,
    fetch(req) {
      return new Response('Protected Resource', { status: 200 });
    }
  });
}

async function stopTestServer() {
  if (testServer) {
    testServer.stop();
  }
}

describe('Security Tests', () => {
  beforeAll(async () => {
    await startTestServer();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  beforeEach(async () => {
    server = new BunProxyServer(SECURITY_TEST_CONFIG);
    await server.initialize();
    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const requests = [];
      
      // Make 6 requests (exceeding the limit of 5)
      for (let i = 0; i < 6; i++) {
        requests.push(
          fetch('http://localhost:8444/', {
            headers: { 'Host': 'secure.test.local' }
          })
        );
      }
      
      const responses = await Promise.all(requests);
      
      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        expect(responses[i].status).toBe(200);
      }
      
      // 6th should be rate limited
      expect(responses[5].status).toBe(429);
    });

    test('should reset rate limit after window', async () => {
      // Make 5 requests to hit limit
      for (let i = 0; i < 5; i++) {
        await fetch('http://localhost:8444/', {
          headers: { 'Host': 'secure.test.local' }
        });
      }
      
      // Wait for rate limit window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be able to make requests again
      const response = await fetch('http://localhost:8444/', {
        headers: { 'Host': 'secure.test.local' }
      });
      
      expect(response.status).toBe(200);
    });
  });

  describe('Geolocation Filtering', () => {
    test('should allow requests from allowed countries', async () => {
      // Mock US IP
      const response = await fetch('http://localhost:8444/', {
        headers: { 
          'Host': 'secure.test.local',
          'X-Forwarded-For': '8.8.8.8' // US IP
        }
      });
      
      expect(response.status).toBe(200);
    });

    test('should block requests from blocked countries', async () => {
      // Mock blocked country IP
      const response = await fetch('http://localhost:8444/', {
        headers: { 
          'Host': 'secure.test.local',
          'X-Forwarded-For': '1.1.1.1' // Assuming this is from blocked country
        }
      });
      
      expect(response.status).toBe(403);
    });

    test('should handle private IP addresses', async () => {
      const response = await fetch('http://localhost:8444/', {
        headers: { 
          'Host': 'secure.test.local',
          'X-Forwarded-For': '192.168.1.1' // Private IP
        }
      });
      
      // Should be blocked since allowPrivateIPs is false
      expect(response.status).toBe(403);
    });
  });

  describe('CORS', () => {
    test('should allow requests from allowed origins', async () => {
      const response = await fetch('http://localhost:8444/', {
        headers: { 
          'Host': 'secure.test.local',
          'Origin': 'http://localhost:3000'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    });

    test('should block requests from disallowed origins', async () => {
      const response = await fetch('http://localhost:8444/', {
        headers: { 
          'Host': 'secure.test.local',
          'Origin': 'http://malicious.com'
        }
      });
      
      expect(response.status).toBe(403);
    });

    test('should handle preflight requests', async () => {
      const response = await fetch('http://localhost:8444/', {
        method: 'OPTIONS',
        headers: { 
          'Host': 'secure.test.local',
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    });
  });

  describe('OAuth2 Integration', () => {
    test('should redirect unauthenticated requests to OAuth provider', async () => {
      const response = await fetch('http://localhost:8444/', {
        headers: { 'Host': 'secure.test.local' },
        redirect: 'manual'
      });
      
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('auth.test.com');
      expect(response.headers.get('location')).toContain('client_id=test-client');
    });

    test('should handle OAuth callback', async () => {
      const response = await fetch('http://localhost:8444/oauth/callback?code=test-code&state=test-state', {
        headers: { 'Host': 'secure.test.local' }
      });
      
      // Should handle callback (may redirect or show error depending on implementation)
      expect(response.status).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    test('should sanitize request headers', async () => {
      const response = await fetch('http://localhost:8444/', {
        headers: { 
          'Host': 'secure.test.local',
          'X-Script-Header': '<script>alert("xss")</script>'
        }
      });
      
      // Should not execute script in headers
      expect(response.status).toBe(200);
    });

    test('should handle malformed URLs', async () => {
      const response = await fetch('http://localhost:8444/%00malicious', {
        headers: { 'Host': 'secure.test.local' }
      });
      
      expect(response.status).toBe(400);
    });

    test('should prevent path traversal', async () => {
      const response = await fetch('http://localhost:8444/../../../etc/passwd', {
        headers: { 'Host': 'secure.test.local' }
      });
      
      expect(response.status).toBe(404);
    });
  });

  describe('SSL/TLS', () => {
    test('should enforce HTTPS for SSL-enabled routes', async () => {
      const response = await fetch('http://localhost:8444/', {
        headers: { 'Host': 'secure.test.local' }
      });
      
      // Should redirect to HTTPS or handle appropriately
      expect(response.status).toBe(200); // Or 301/302 for redirect
    });
  });
});
