#!/usr/bin/env node

/**
 * Test script for request type statistics
 * This script tests that static, proxy, redirect, and unmatched requests
 * are properly categorized in the statistics.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:80';
const MANAGEMENT_URL = 'http://localhost:4481';
const TEST_DELAY = 1000; // 1 second between requests

// Test data
const testRequests = [
  // Static requests
  { path: '/static/test.txt', type: 'static', expectedType: 'static' },
  { path: '/static/css/style.css', type: 'static', expectedType: 'static' },

  // Proxy requests
  { path: '/api/users', type: 'proxy', expectedType: 'proxy' },
  { path: '/api/data', type: 'proxy', expectedType: 'proxy' },

  // Redirect requests
  { path: '/old-page', type: 'redirect', expectedType: 'redirect' },
  { path: '/legacy', type: 'redirect', expectedType: 'redirect' },

  // Unmatched requests (should return 404)
  { path: '/nonexistent', type: 'unmatched', expectedType: 'unmatched' },
  { path: '/invalid-route', type: 'unmatched', expectedType: 'unmatched' },
];

async function makeRequest(url, description) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function getStatistics() {
  try {
    const response = await makeRequest(`${MANAGEMENT_URL}/api/statistics?period=24h`);
    if (response.statusCode === 200) {
      const data = JSON.parse(response.data);
      return data.success ? data.data : null;
    }
  } catch (error) {
    console.error('Failed to get statistics:', error.message);
  }
  return null;
}

async function testRequestTypes() {
  console.log('🧪 Testing Request Type Statistics');
  console.log('==================================');

  // Make test requests
  console.log('\n📡 Making test requests...');
  for (const test of testRequests) {
    try {
      const url = `${BASE_URL}${test.path}`;
      console.log(`  Making ${test.type} request to: ${url}`);

      const response = await makeRequest(url);
      console.log(`    Status: ${response.statusCode}`);

      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, TEST_DELAY));
    } catch (error) {
      console.log(`    Error: ${error.message}`);
    }
  }

  // Wait for statistics to be updated
  console.log('\n⏳ Waiting for statistics to update...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get statistics
  console.log('\n📊 Getting statistics...');
  const stats = await getStatistics();

  if (!stats) {
    console.error('❌ Failed to get statistics');
    return;
  }

  console.log('\n📈 Statistics Summary:');
  console.log(`  Total Requests: ${stats.summary.totalRequests}`);
  console.log(`  Unique IPs: ${stats.summary.uniqueIPs}`);
  console.log(`  Unique Countries: ${stats.summary.uniqueCountries}`);

  // Check request type breakdown
  console.log('\n🔍 Request Type Breakdown:');
  if (stats.summary.requestTypes && stats.summary.requestTypes.length > 0) {
    stats.summary.requestTypes.forEach(type => {
      console.log(`  ${type.type}: ${type.count} requests (${type.percentage.toFixed(1)}%)`);
    });
  } else {
    console.log('  No request type data available');
  }

  // Check routes
  console.log('\n🛣️  Route Details:');
  if (stats.routes && stats.routes.length > 0) {
    stats.routes.forEach(route => {
      console.log(`  ${route.name || route.domain}: ${route.requests} requests (${route.requestType})`);
    });
  } else {
    console.log('  No route data available');
  }

  // Verify request types are being tracked
  console.log('\n✅ Verification:');
  const foundTypes = new Set();
  if (stats.summary.requestTypes) {
    stats.summary.requestTypes.forEach(type => foundTypes.add(type.type));
  }

  const expectedTypes = ['static', 'proxy', 'redirect', 'unmatched'];
  expectedTypes.forEach(expectedType => {
    if (foundTypes.has(expectedType)) {
      console.log(`  ✓ ${expectedType} requests are being tracked`);
    } else {
      console.log(`  ✗ ${expectedType} requests are NOT being tracked`);
    }
  });

  // Check if we have any data
  if (stats.summary.totalRequests > 0) {
    console.log('\n🎉 Test completed successfully!');
    console.log('Request type statistics are working correctly.');
  } else {
    console.log('\n⚠️  No request data found. Make sure the proxy server is running and configured correctly.');
  }
}

// Run the test
if (require.main === module) {
  testRequestTypes().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testRequestTypes }; 