#!/usr/bin/env node

import http from 'http';

const BASE_URL = 'http://localhost:4480';

function b64(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

// Test cases for cors-forwarder
const testCases = [
  {
    name: 'Path-based CORS forwarder with valid URL',
    url: `${BASE_URL}/api?url=${b64('https://httpbin.org/get')}`,
    expectedStatus: 200
  },
  {
    name: 'Path-based CORS forwarder with JSON endpoint',
    url: `${BASE_URL}/api?url=${b64('https://httpbin.org/json')}`,
    expectedStatus: 200
  },
  {
    name: 'Blackbaud proxy CORS forwarder',
    url: `${BASE_URL}/blackbaud-proxy?url=${b64('https://httpbin.org/headers')}`,
    expectedStatus: 200
  },
  {
    name: 'Invalid URL format',
    url: `${BASE_URL}/api?url=${b64('invalid-url')}`,
    expectedStatus: 400
  },
  {
    name: 'Empty target URL',
    url: `${BASE_URL}/api`,
    expectedStatus: 400
  },
  {
    name: 'Invalid base64 encoding',
    url: `${BASE_URL}/api?url=not_base64!`,
    expectedStatus: 400
  }
];

async function runTest(testCase) {
  return new Promise((resolve) => {
    const req = http.get(testCase.url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const success = res.statusCode === testCase.expectedStatus;
        console.log(`${success ? '✅' : '❌'} ${testCase.name}`);
        console.log(`   Status: ${res.statusCode} (expected: ${testCase.expectedStatus})`);

        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            console.log(`   Response: ${JSON.stringify(json).substring(0, 100)}...`);
          } catch {
            console.log(`   Response: ${data.substring(0, 100)}...`);
          }
        } else {
          console.log(`   Error: ${data}`);
        }
        console.log('');
        resolve(success);
      });
    });

    req.on('error', (error) => {
      console.log(`❌ ${testCase.name} - Network error: ${error.message}`);
      console.log('');
      resolve(false);
    });

    req.setTimeout(5000, () => {
      console.log(`❌ ${testCase.name} - Timeout`);
      console.log('');
      req.destroy();
      resolve(false);
    });
  });
}

async function runAllTests() {
  console.log('🧪 Testing CORS Forwarder Functionality\n');

  let passed = 0;
  let total = testCases.length;

  for (const testCase of testCases) {
    const success = await runTest(testCase);
    if (success) passed++;
  }

  console.log(`📊 Test Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All tests passed! CORS forwarder is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please check the configuration.');
  }
}

// Run the tests
runAllTests().catch(console.error); 