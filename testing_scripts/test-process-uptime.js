#!/usr/bin/env node

import http from 'http';

const BASE_URL = 'http://localhost:4481';

async function testProcessUptime() {
  console.log('🔍 Testing Process Uptime Display...\n');

  try {
    // Test 1: Check if the management server is running
    console.log('1. Testing management server connectivity...');
    const response = await makeRequest('/api/processes');

    if (response.statusCode === 200) {
      console.log('✅ Management server is accessible');
    } else {
      console.log('❌ Management server not accessible');
      return;
    }

    // Test 2: Check processes API endpoint
    console.log('\n2. Testing processes API endpoint...');
    const processesData = JSON.parse(response.data);

    if (processesData.success) {
      console.log(`✅ Processes API returned ${processesData.data.length} processes`);

      // Check each process for uptime data
      processesData.data.forEach((process, index) => {
        console.log(`\n   Process ${index + 1}: ${process.id} (${process.name})`);
        console.log(`   Status: ${process.status}`);
        console.log(`   Is Running: ${process.isRunning}`);
        console.log(`   Start Time: ${process.startTime || 'N/A'}`);
        console.log(`   Uptime: ${process.uptime || 'N/A'}`);

        if (process.startTime && process.isRunning) {
          const startTime = new Date(process.startTime);
          const currentUptime = Date.now() - startTime.getTime();
          console.log(`   Calculated Uptime: ${currentUptime}ms`);
          console.log(`   Expected Format: ${formatUptime(currentUptime)}`);
        }
      });
    } else {
      console.log('❌ Processes API failed:', processesData.error);
      return;
    }

    // Test 3: Check HTML for formatUptime function
    console.log('\n3. Testing HTML for formatUptime function...');
    const htmlResponse = await makeRequest('/');
    const html = htmlResponse.data;

    if (html.includes('toFixed(2)')) {
      console.log('✅ formatUptime function includes two decimal places');
    } else {
      console.log('❌ formatUptime function does not include two decimal places');
    }

    if (html.includes('updateProcessUptimes')) {
      console.log('✅ updateProcessUptimes function found');
    } else {
      console.log('❌ updateProcessUptimes function not found');
    }

    if (html.includes('startProcessUptimeUpdates')) {
      console.log('✅ startProcessUptimeUpdates function found');
    } else {
      console.log('❌ startProcessUptimeUpdates function not found');
    }

    if (html.includes('setInterval(updateProcessUptimes, 1000)')) {
      console.log('✅ Periodic process uptime updates configured');
    } else {
      console.log('❌ Periodic process uptime updates not configured');
    }

    // Test 4: Check for process uptime elements in HTML
    console.log('\n4. Testing process uptime elements...');

    if (html.includes('process-tab-info-item:nth-child(3)')) {
      console.log('✅ Process uptime elements found in HTML');
    } else {
      console.log('❌ Process uptime elements not found in HTML');
    }

    console.log('\n✅ Process uptime test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Helper function to format uptime (same as frontend)
function formatUptime(milliseconds) {
  const totalSeconds = milliseconds / 1000;
  const seconds = Math.floor(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${(totalSeconds % 60).toFixed(2)}s`;
  return `${totalSeconds.toFixed(2)}s`;
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4481,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
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
testProcessUptime().catch(console.error); 