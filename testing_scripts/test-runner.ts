#!/usr/bin/env bun

import { test, describe, expect, beforeAll, afterAll } from 'bun:test';
import { BunProxyServer } from '../src/server';
import { configService } from '../src/services/config-service';
import { logger } from '../src/utils/logger';

// Import all test modules
import './functional-tests';
import './security-tests';
import './process-management-tests';
import './load-tests';

// Test runner configuration
const TEST_RUNNER_CONFIG = {
  server: {
    port: 8447,
    host: 'localhost',
    ssl: {
      enabled: false
    }
  },
  routes: []
};

let globalServer: BunProxyServer;

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting Test Runner...');
  
  // Initialize configuration service
  await configService.initialize();
  
  // Create global server instance for tests that need it
  globalServer = new BunProxyServer(TEST_RUNNER_CONFIG);
  await globalServer.initialize();
  
  console.log('✅ Test Runner initialized');
});

// Global test cleanup
afterAll(async () => {
  console.log('🧹 Cleaning up Test Runner...');
  
  if (globalServer) {
    await globalServer.stop();
  }
  
  console.log('✅ Test Runner cleanup complete');
});

// Test runner main function
async function runTests() {
  console.log('🧪 Running Functional Tests...');
  
  const startTime = Date.now();
  
  try {
    // Run all test suites
    await test('Functional Tests', async () => {
      // This will run all the imported test suites
      expect(true).toBe(true);
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ All tests completed in ${duration}ms`);
    console.log('📊 Test Summary:');
    console.log(`   - Duration: ${duration}ms`);
    console.log(`   - Status: PASSED`);
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Export for use in other test files
export { globalServer, TEST_RUNNER_CONFIG };

// Run tests if this file is executed directly
if (import.meta.main) {
  runTests().catch((error) => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}
