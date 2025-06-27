#!/usr/bin/env node

import http from 'http';

const BASE_URL = 'http://localhost:4481';

async function testProcessHeaderSimple() {
  console.log('🔍 Testing Process View Header Layout Changes (Simple)...\n');

  try {
    // Test 1: Check if the management server is running
    console.log('1. Testing management server connectivity...');
    const response = await makeRequest('/');

    if (response.statusCode === 200) {
      console.log('✅ Management server is accessible');
    } else {
      console.log('❌ Management server not accessible');
      return;
    }

    // Test 2: Check if the HTML contains the new header structure
    console.log('\n2. Testing HTML structure...');

    const html = response.data;

    // Check for new header structure
    if (html.includes('header-content')) {
      console.log('✅ Header content structure found in HTML');
    } else {
      console.log('❌ Header content structure not found in HTML');
    }

    if (html.includes('header-left')) {
      console.log('✅ Header left section found in HTML');
    } else {
      console.log('❌ Header left section not found in HTML');
    }

    if (html.includes('header-right')) {
      console.log('✅ Header right section found in HTML');
    } else {
      console.log('❌ Header right section not found in HTML');
    }

    if (html.includes('last-updated-info')) {
      console.log('✅ Last updated info found in HTML');
    } else {
      console.log('❌ Last updated info not found in HTML');
    }

    if (html.includes('header-last-updated')) {
      console.log('✅ Header last updated element found in HTML');
    } else {
      console.log('❌ Header last updated element not found in HTML');
    }

    // Test 3: Check if "Last Updated" stat card was removed
    console.log('\n3. Testing stat cards...');

    if (html.includes('id="last-updated"')) {
      console.log('❌ "Last Updated" stat card still exists in HTML');
    } else {
      console.log('✅ "Last Updated" stat card was successfully removed');
    }

    // Check if other stat cards still exist
    if (html.includes('id="processes-count"')) {
      console.log('✅ Processes count stat card exists');
    } else {
      console.log('❌ Processes count stat card missing');
    }

    if (html.includes('id="running-count"')) {
      console.log('✅ Running count stat card exists');
    } else {
      console.log('❌ Running count stat card missing');
    }

    if (html.includes('id="stopped-count"')) {
      console.log('✅ Stopped count stat card exists');
    } else {
      console.log('❌ Stopped count stat card missing');
    }

    if (html.includes('id="uptime"')) {
      console.log('✅ Uptime stat card exists');
    } else {
      console.log('❌ Uptime stat card missing');
    }

    // Test 4: Check for JavaScript functions
    console.log('\n4. Testing JavaScript functions...');

    if (html.includes('updateUptimePeriodically')) {
      console.log('✅ updateUptimePeriodically function found');
    } else {
      console.log('❌ updateUptimePeriodically function not found');
    }

    if (html.includes('startUptimeUpdates')) {
      console.log('✅ startUptimeUpdates function found');
    } else {
      console.log('❌ startUptimeUpdates function not found');
    }

    if (html.includes('setInterval(updateUptimePeriodically, 1000)')) {
      console.log('✅ Periodic uptime update interval found');
    } else {
      console.log('❌ Periodic uptime update interval not found');
    }

    // Test 5: Check for CSS styles
    console.log('\n5. Testing CSS styles...');

    if (html.includes('.header-content')) {
      console.log('✅ Header content CSS found');
    } else {
      console.log('❌ Header content CSS not found');
    }

    if (html.includes('.header-left')) {
      console.log('✅ Header left CSS found');
    } else {
      console.log('❌ Header left CSS not found');
    }

    if (html.includes('.header-right')) {
      console.log('✅ Header right CSS found');
    } else {
      console.log('❌ Header right CSS not found');
    }

    if (html.includes('.last-updated-info')) {
      console.log('✅ Last updated info CSS found');
    } else {
      console.log('❌ Last updated info CSS not found');
    }

    console.log('\n✅ Process header layout test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4481,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'text/html'
      }
    };

    const req = http.request(options, (res) => {
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

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Run the test
testProcessHeaderSimple().catch(console.error); 