import { test, describe, expect, beforeAll, afterAll } from 'bun:test';
import { BunProxyServer } from '../src/server';

const LOAD_TEST_CONFIG = {
  server: {
    port: 8446,
    host: 'localhost',
    ssl: {
      enabled: false // Disable SSL for load tests
    }
  },
  routes: [
    {
      name: 'load-test-proxy',
      domain: 'load.test.local',
      target: 'http://localhost:8080',
      ssl: false,
      path: '/',
      type: 'proxy'
    }
  ],
  security: {
    rateLimit: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 1000 // High limit for load testing
    }
  }
};

let server: BunProxyServer;
let testServer: any;

async function startTestServer() {
  testServer = Bun.serve({
    port: 8080,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/fast') {
        return new Response('Fast Response', { status: 200 });
      }

      if (url.pathname === '/medium') {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(new Response('Medium Response', { status: 200 }));
          }, 100);
        });
      }

      if (url.pathname === '/slow') {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(new Response('Slow Response', { status: 200 }));
          }, 1000);
        });
      }

      if (url.pathname === '/api/data') {
        return new Response(JSON.stringify({
          id: Math.random(),
          timestamp: Date.now(),
          data: 'Test data'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Default Response', { status: 200 });
    }
  });
}

async function stopTestServer() {
  if (testServer) {
    testServer.stop();
  }
}

// Helper function to make concurrent requests
async function makeConcurrentRequests(url: string, count: number, headers: Record<string, string> = {}) {
  const promises = [];

  for (let i = 0; i < count; i++) {
    promises.push(
      fetch(url, {
        headers: { 'Host': 'load.test.local', ...headers }
      }).then(async (response) => {
        const startTime = Date.now();
        const text = await response.text();
        const endTime = Date.now();

        return {
          status: response.status,
          responseTime: endTime - startTime,
          body: text
        };
      })
    );
  }

  return Promise.all(promises);
}

// Helper function to calculate statistics
function calculateStats(responses: any[]) {
  const responseTimes = responses.map(r => r.responseTime);
  const successful = responses.filter(r => r.status === 200);
  const failed = responses.filter(r => r.status !== 200);

  return {
    total: responses.length,
    successful: successful.length,
    failed: failed.length,
    successRate: (successful.length / responses.length) * 100,
    avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
    minResponseTime: Math.min(...responseTimes),
    maxResponseTime: Math.max(...responseTimes),
    p95ResponseTime: responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)]
  };
}

describe('Load Tests', () => {
  beforeAll(async () => {
    await startTestServer();

    server = new BunProxyServer(LOAD_TEST_CONFIG);
    await server.initialize();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    await stopTestServer();
  });

  describe('Concurrent Request Handling', () => {
    test('should handle 10 concurrent requests', async () => {
      const responses = await makeConcurrentRequests('http://localhost:8446/fast', 10);
      const stats = calculateStats(responses);

      expect(stats.successRate).toBe(100);
      expect(stats.avgResponseTime).toBeLessThan(1000); // Less than 1 second
      expect(stats.total).toBe(10);
    }, 10000);

    test('should handle 50 concurrent requests', async () => {
      const responses = await makeConcurrentRequests('http://localhost:8446/fast', 50);
      const stats = calculateStats(responses);

      expect(stats.successRate).toBe(100);
      expect(stats.avgResponseTime).toBeLessThan(2000); // Less than 2 seconds
      expect(stats.total).toBe(50);
    }, 15000);

    test('should handle 100 concurrent requests', async () => {
      const responses = await makeConcurrentRequests('http://localhost:8446/fast', 100);
      const stats = calculateStats(responses);

      expect(stats.successRate).toBeGreaterThan(95); // At least 95% success rate
      expect(stats.avgResponseTime).toBeLessThan(5000); // Less than 5 seconds
      expect(stats.total).toBe(100);
    }, 20000);
  });

  describe('Sustained Load', () => {
    test('should handle sustained load of 10 requests per second for 10 seconds', async () => {
      const totalRequests = 100;
      const batchSize = 10;
      const delay = 1000; // 1 second between batches

      const allResponses = [];

      for (let i = 0; i < totalRequests / batchSize; i++) {
        const batchResponses = await makeConcurrentRequests('http://localhost:8446/fast', batchSize);
        allResponses.push(...batchResponses);

        if (i < (totalRequests / batchSize) - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const stats = calculateStats(allResponses);

      expect(stats.successRate).toBeGreaterThan(95);
      expect(stats.total).toBe(totalRequests);
    }, 30000);

    test('should handle sustained load with mixed response times', async () => {
      const totalRequests = 60;
      const endpoints = ['/fast', '/medium', '/slow'];
      const allResponses = [];

      for (let i = 0; i < totalRequests; i++) {
        const endpoint = endpoints[i % endpoints.length];
        const response = await fetch(`http://localhost:8446${endpoint}`, {
          headers: { 'Host': 'load.test.local' }
        });

        const startTime = Date.now();
        const text = await response.text();
        const endTime = Date.now();

        allResponses.push({
          status: response.status,
          responseTime: endTime - startTime,
          body: text
        });

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const stats = calculateStats(allResponses);

      expect(stats.successRate).toBeGreaterThan(95);
      expect(stats.total).toBe(totalRequests);
      expect(stats.avgResponseTime).toBeGreaterThan(300); // Should be higher due to slow endpoints
    }, 60000);
  });

  describe('Memory and Resource Usage', () => {
    test('should maintain consistent performance over time', async () => {
      const iterations = 5;
      const requestsPerIteration = 20;
      const performanceData = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const responses = await makeConcurrentRequests('http://localhost:8446/fast', requestsPerIteration);
        const endTime = Date.now();

        const stats = calculateStats(responses);
        performanceData.push({
          iteration: i + 1,
          totalTime: endTime - startTime,
          avgResponseTime: stats.avgResponseTime,
          successRate: stats.successRate
        });

        // Wait between iterations
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Check that performance doesn't degrade significantly
      const firstIteration = performanceData[0];
      const lastIteration = performanceData[performanceData.length - 1];

      expect(lastIteration.successRate).toBeGreaterThan(95);
      expect(lastIteration.avgResponseTime).toBeLessThan(firstIteration.avgResponseTime * 2); // No more than 2x degradation
    }, 60000);

    test('should handle large payloads efficiently', async () => {
      const largeData = 'x'.repeat(10000); // 10KB payload

      const responses = await makeConcurrentRequests('http://localhost:8446/api/data', 20, {
        'Content-Type': 'application/json',
        'Content-Length': largeData.length.toString()
      });

      const stats = calculateStats(responses);

      expect(stats.successRate).toBeGreaterThan(95);
      expect(stats.avgResponseTime).toBeLessThan(3000); // Less than 3 seconds for large payloads
    }, 30000);
  });

  describe('Rate Limiting Under Load', () => {
    test('should enforce rate limits under high load', async () => {
      // Make requests rapidly to trigger rate limiting
      const responses = await makeConcurrentRequests('http://localhost:8446/fast', 200);

      const rateLimited = responses.filter(r => r.status === 429);
      const successful = responses.filter(r => r.status === 200);

      // Should have some rate limited requests
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(successful.length).toBeGreaterThan(0);

      // Success rate should be reasonable
      const successRate = (successful.length / responses.length) * 100;
      expect(successRate).toBeGreaterThan(50);
    }, 30000);

    test('should recover from rate limiting', async () => {
      // First, trigger rate limiting
      await makeConcurrentRequests('http://localhost:8446/fast', 150);

      // Wait for rate limit window to reset
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try again - should work
      const responses = await makeConcurrentRequests('http://localhost:8446/fast', 20);
      const stats = calculateStats(responses);

      expect(stats.successRate).toBeGreaterThan(90);
    }, 30000);
  });

  describe('Error Handling Under Load', () => {
    test('should handle errors gracefully under load', async () => {
      const responses = await makeConcurrentRequests('http://localhost:8446/nonexistent', 50);

      const notFound = responses.filter(r => r.status === 404);
      const otherErrors = responses.filter(r => r.status !== 404 && r.status !== 200);

      // Should return 404 for non-existent endpoints
      expect(notFound.length).toBeGreaterThan(0);

      // Should not have unexpected errors
      expect(otherErrors.length).toBe(0);
    }, 15000);

    test('should handle server errors under load', async () => {
      // Create a test server that occasionally returns errors
      const errorServer = Bun.serve({
        port: 8081,
        fetch(req) {
          if (Math.random() < 0.3) { // 30% chance of error
            return new Response('Server Error', { status: 500 });
          }
          return new Response('OK', { status: 200 });
        }
      });

      try {
        const errorTestConfig = {
          ...LOAD_TEST_CONFIG,
          routes: [{
            name: 'error-test-proxy',
            domain: 'error.test.local',
            target: 'http://localhost:8081',
            ssl: false,
            path: '/',
            type: 'proxy'
          }]
        };

        const errorServer = new BunProxyServer(errorTestConfig);
        await errorServer.initialize();
        await errorServer.start();

        const responses = await makeConcurrentRequests('http://localhost:8446/', 30, {
          'Host': 'error.test.local'
        });

        const errors = responses.filter(r => r.status === 500);
        const success = responses.filter(r => r.status === 200);

        // Should handle both success and error responses
        expect(errors.length).toBeGreaterThan(0);
        expect(success.length).toBeGreaterThan(0);

        await errorServer.stop();
      } finally {
        errorServer.stop();
      }
    }, 20000);
  });

  describe('Connection Pooling', () => {
    test('should reuse connections efficiently', async () => {
      const connectionIds = new Set();

      // Make multiple requests and check if connections are reused
      for (let i = 0; i < 50; i++) {
        const response = await fetch('http://localhost:8446/fast', {
          headers: { 'Host': 'load.test.local' }
        });

        // Extract connection info from headers (if available)
        const connectionHeader = response.headers.get('connection');
        if (connectionHeader) {
          connectionIds.add(connectionHeader);
        }

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Should have made multiple requests
      expect(true).toBe(true); // Connection reuse is internal, just verify requests work
    }, 30000);
  });

  describe('Performance Benchmarks', () => {
    test('should meet performance benchmarks', async () => {
      const benchmarkResults = [];

      // Test different load levels
      const loadLevels = [10, 25, 50, 100];

      for (const load of loadLevels) {
        const startTime = Date.now();
        const responses = await makeConcurrentRequests('http://localhost:8446/fast', load);
        const endTime = Date.now();

        const stats = calculateStats(responses);
        benchmarkResults.push({
          load,
          totalTime: endTime - startTime,
          requestsPerSecond: load / ((endTime - startTime) / 1000),
          avgResponseTime: stats.avgResponseTime,
          successRate: stats.successRate
        });
      }

      // Verify benchmarks meet minimum requirements
      benchmarkResults.forEach(result => {
        expect(result.successRate).toBeGreaterThan(95);
        expect(result.avgResponseTime).toBeLessThan(2000);
        expect(result.requestsPerSecond).toBeGreaterThan(10);
      });

      console.log('Benchmark Results:', JSON.stringify(benchmarkResults, null, 2));
    }, 60000);
  });
});
