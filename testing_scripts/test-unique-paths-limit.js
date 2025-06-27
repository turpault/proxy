#!/usr/bin/env node

/**
 * Test script for unique paths limit
 * This script tests that the unique paths are limited to the last 200 paths
 * to prevent the route list from becoming too large.
 */

const http = require('http');

// Configuration
const MANAGEMENT_URL = 'http://localhost:4481';

async function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
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

async function testUniquePathsLimit() {
  console.log('🧪 Testing Unique Paths Limit');
  console.log('==============================');

  // Get statistics
  console.log('\n📊 Getting statistics...');
  const stats = await getStatistics();

  if (!stats) {
    console.error('❌ Failed to get statistics');
    return;
  }

  // Check for unmatched routes
  const unmatchedRoute = stats.routes.find(route => route.name === 'Unmatched');

  if (!unmatchedRoute) {
    console.log('\n✅ No unmatched routes found - no unique paths to limit');
    return;
  }

  console.log('\n📈 Unmatched Route Statistics:');
  console.log(`  Total Requests: ${unmatchedRoute.requests}`);
  console.log(`  Unique IPs: ${unmatchedRoute.uniqueIPs}`);
  console.log(`  Methods: ${unmatchedRoute.methods.join(', ')}`);

  // Check unique paths
  if (unmatchedRoute.uniquePaths) {
    console.log(`\n🔍 Unique Paths Analysis:`);
    console.log(`  Number of unique paths returned: ${unmatchedRoute.uniquePaths.length}`);

    if (unmatchedRoute.uniquePaths.length > 200) {
      console.log(`  ❌ FAIL: More than 200 unique paths returned (${unmatchedRoute.uniquePaths.length})`);
      console.log(`  Expected: Maximum 200 paths`);
    } else {
      console.log(`  ✅ PASS: Unique paths limited to ${unmatchedRoute.uniquePaths.length} paths`);
      console.log(`  Expected: Maximum 200 paths`);
    }

    // Show some sample paths
    console.log(`\n📋 Sample Unique Paths (first 10):`);
    unmatchedRoute.uniquePaths.slice(0, 10).forEach((path, index) => {
      console.log(`  ${index + 1}. ${path}`);
    });

    if (unmatchedRoute.uniquePaths.length > 10) {
      console.log(`  ... and ${unmatchedRoute.uniquePaths.length - 10} more paths`);
    }

    // Check if paths are sorted (should be most recent first due to slice(-200))
    console.log(`\n📊 Path Order Analysis:`);
    if (unmatchedRoute.uniquePaths.length > 1) {
      const firstPath = unmatchedRoute.uniquePaths[0];
      const lastPath = unmatchedRoute.uniquePaths[unmatchedRoute.uniquePaths.length - 1];
      console.log(`  First path: ${firstPath}`);
      console.log(`  Last path: ${lastPath}`);
      console.log(`  Note: Paths should be the most recent 200 unique paths`);
    }

  } else {
    console.log(`\n📋 No unique paths data available`);
  }

  // Summary
  console.log(`\n🎯 Test Summary:`);
  if (unmatchedRoute.uniquePaths && unmatchedRoute.uniquePaths.length <= 200) {
    console.log(`  ✅ Unique paths are properly limited to ${unmatchedRoute.uniquePaths.length} paths`);
    console.log(`  ✅ Performance optimization is working correctly`);
  } else if (unmatchedRoute.uniquePaths && unmatchedRoute.uniquePaths.length > 200) {
    console.log(`  ❌ Unique paths are NOT limited (${unmatchedRoute.uniquePaths.length} paths)`);
    console.log(`  ❌ Performance optimization is NOT working`);
  } else {
    console.log(`  ℹ️  No unique paths data to test`);
  }
}

// Run the test
if (require.main === module) {
  testUniquePathsLimit().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testUniquePathsLimit }; 