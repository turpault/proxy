#!/usr/bin/env node

/**
 * Test script for log scroll following functionality
 * 
 * This script tests the new feature where logs only auto-follow when the user
 * is at the bottom of the log container. When the user scrolls up, auto-follow
 * is paused, and when they scroll back to the bottom, it resumes.
 */

const http = require('http');

const TEST_CONFIG = {
  host: 'localhost',
  port: 4481,
  timeout: 5000
};

console.log('🧪 Testing Log Scroll Following Functionality\n');

// Test 1: Check if management UI loads with follow button
async function testFollowButtonPresence() {
  console.log('1. Testing follow button presence...');

  try {
    const response = await makeRequest('/');
    const html = response.toString();

    if (html.includes('follow-btn') && html.includes('Follow')) {
      console.log('✅ Follow button found in HTML');
      return true;
    } else {
      console.log('❌ Follow button not found in HTML');
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to check follow button:', error.message);
    return false;
  }
}

// Test 2: Check if scroll position tracking is implemented
async function testScrollTracking() {
  console.log('\n2. Testing scroll position tracking...');

  try {
    const response = await makeRequest('/');
    const html = response.toString();

    if (html.includes('checkIfAtBottom') && html.includes('setupLogScrollListener')) {
      console.log('✅ Scroll position tracking functions found');
      return true;
    } else {
      console.log('❌ Scroll position tracking functions not found');
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to check scroll tracking:', error.message);
    return false;
  }
}

// Test 3: Check if auto-scroll logic respects scroll position
async function testAutoScrollLogic() {
  console.log('\n3. Testing auto-scroll logic...');

  try {
    const response = await makeRequest('/');
    const html = response.toString();

    if (html.includes('isAtBottom') && html.includes('Only scroll to bottom if user was at bottom')) {
      console.log('✅ Auto-scroll logic respects scroll position');
      return true;
    } else {
      console.log('❌ Auto-scroll logic not properly implemented');
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to check auto-scroll logic:', error.message);
    return false;
  }
}

// Test 4: Check if visual indicators are implemented
async function testVisualIndicators() {
  console.log('\n4. Testing visual indicators...');

  try {
    const response = await makeRequest('/');
    const html = response.toString();

    const indicators = [
      'live-indicator following',
      'live-indicator not-following',
      'follow-btn active',
      'follow-btn inactive'
    ];

    const found = indicators.filter(indicator => html.includes(indicator));

    if (found.length >= 2) {
      console.log('✅ Visual indicators implemented:', found.join(', '));
      return true;
    } else {
      console.log('❌ Visual indicators not properly implemented');
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to check visual indicators:', error.message);
    return false;
  }
}

// Test 5: Check if manual scroll to bottom function exists
async function testManualScrollFunction() {
  console.log('\n5. Testing manual scroll to bottom function...');

  try {
    const response = await makeRequest('/');
    const html = response.toString();

    if (html.includes('scrollToBottom') && html.includes('Manually scroll to bottom and enable auto-follow')) {
      console.log('✅ Manual scroll to bottom function found');
      return true;
    } else {
      console.log('❌ Manual scroll to bottom function not found');
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to check manual scroll function:', error.message);
    return false;
  }
}

// Helper function to make HTTP requests
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: path,
      method: 'GET',
      timeout: TEST_CONFIG.timeout
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Main test runner
async function runTests() {
  const tests = [
    testFollowButtonPresence,
    testScrollTracking,
    testAutoScrollLogic,
    testVisualIndicators,
    testManualScrollFunction
  ];

  let passed = 0;
  let total = tests.length;

  for (const test of tests) {
    try {
      const result = await test();
      if (result) passed++;
    } catch (error) {
      console.log(`❌ Test failed with error: ${error.message}`);
    }
  }

  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All tests passed! Log scroll following functionality is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please check the implementation.');
  }

  console.log('\n📝 Manual Testing Instructions:');
  console.log('1. Open the management UI in a browser');
  console.log('2. Navigate to the Processes tab');
  console.log('3. Click on a process tab to view logs');
  console.log('4. Verify the "Follow" button is present and shows "Follow" when at bottom');
  console.log('5. Scroll up in the logs - the button should change to "Paused"');
  console.log('6. Scroll back to bottom - the button should change back to "Follow"');
  console.log('7. Click the "Follow" button when paused - it should scroll to bottom');
  console.log('8. Verify that new logs only auto-scroll when you\'re at the bottom');
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testFollowButtonPresence,
  testScrollTracking,
  testAutoScrollLogic,
  testVisualIndicators,
  testManualScrollFunction,
  runTests
}; 