#!/usr/bin/env bun

import { BunMiddleware, BunRequestContext } from '../src/services/bun-middleware';
import { ProxyRoute, ProxyConfig } from '../src/types';

// Mock logger for testing
const mockLogger = {
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.log(`[WARN] ${msg}`, data || ''),
  error: (msg: string, data?: any) => console.log(`[ERROR] ${msg}`, data || ''),
  debug: (msg: string, data?: any) => console.log(`[DEBUG] ${msg}`, data || '')
};

// Replace logger import
(global as any).logger = mockLogger;

// Test scenarios
interface TestScenario {
  name: string;
  requestHost: string;
  routeDomain: string;
  expectedStatus: number | null; // null means should pass (return null)
  description: string;
}

const testScenarios: TestScenario[] = [
  {
    name: 'Exact domain match',
    requestHost: 'api.example.com',
    routeDomain: 'api.example.com',
    expectedStatus: null,
    description: 'Should pass when host exactly matches route domain'
  },
  {
    name: 'WWW subdomain allowed',
    requestHost: 'www.api.example.com',
    routeDomain: 'api.example.com',
    expectedStatus: null,
    description: 'Should pass when host is www subdomain of route domain'
  },
  {
    name: 'Domain mismatch',
    requestHost: 'malicious.com',
    routeDomain: 'api.example.com',
    expectedStatus: 403,
    description: 'Should block when host does not match route domain'
  },
  {
    name: 'Subdomain attack',
    requestHost: 'api.example.com.malicious.com',
    routeDomain: 'api.example.com',
    expectedStatus: 403,
    description: 'Should block subdomain attacks'
  },
  {
    name: 'Missing host header',
    requestHost: '',
    routeDomain: 'api.example.com',
    expectedStatus: 400,
    description: 'Should block requests without host header'
  },
  {
    name: 'Host with port',
    requestHost: 'api.example.com:8080',
    routeDomain: 'api.example.com',
    expectedStatus: null,
    description: 'Should pass when host with port matches route domain'
  },
  {
    name: 'WWW with port',
    requestHost: 'www.api.example.com:8080',
    routeDomain: 'api.example.com',
    expectedStatus: null,
    description: 'Should pass when www host with port matches route domain'
  }
];

async function runTests() {
  console.log('🧪 Testing Domain Filtering Functionality\n');

  // Mock config with required properties
  const config: ProxyConfig = {
    port: 80,
    httpsPort: 443,
    routes: [],
    letsEncrypt: {
      email: 'test@example.com',
      staging: true,
      certDir: './certificates'
    }
  };
  const middleware = new BunMiddleware(config);

  let passed = 0;
  let failed = 0;

  for (const scenario of testScenarios) {
    console.log(`\n📋 Test: ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);
    console.log(`   Request Host: "${scenario.requestHost}"`);
    console.log(`   Route Domain: "${scenario.routeDomain}"`);

    // Create mock request context
    const requestContext: BunRequestContext = {
      method: 'GET',
      url: `https://${scenario.requestHost}/test`,
      pathname: '/test',
      headers: scenario.requestHost ? { 'host': scenario.requestHost } : {},
      body: null,
      query: {},
      ip: '192.168.1.100',
      originalUrl: `https://${scenario.requestHost}/test`,
      req: {} as any,
      server: {} as any
    };

    // Create mock route
    const route: ProxyRoute = {
      domain: scenario.routeDomain,
      path: '/test',
      target: 'http://backend.example.com'
    };

    try {
      // Test domain filtering directly
      const result = (middleware as any).processDomainFilter(requestContext, route);

      if (scenario.expectedStatus === null) {
        // Should pass (return null)
        if (result === null) {
          console.log(`   ✅ PASS: Request allowed as expected`);
          passed++;
        } else {
          console.log(`   ❌ FAIL: Expected to pass but got status ${result?.status}`);
          failed++;
        }
      } else {
        // Should be blocked with specific status
        if (result && result.status === scenario.expectedStatus) {
          const body = await result.json();
          console.log(`   ✅ PASS: Request blocked with status ${result.status}`);
          console.log(`   📝 Response: ${body.message}`);
          passed++;
        } else {
          console.log(`   ❌ FAIL: Expected status ${scenario.expectedStatus} but got ${result?.status || 'null'}`);
          failed++;
        }
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Exception thrown - ${error}`);
      failed++;
    }
  }

  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log(`\n🎉 All tests passed! Domain filtering is working correctly.`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  Some tests failed. Please review the implementation.`);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
}); 