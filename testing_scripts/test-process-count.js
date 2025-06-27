#!/usr/bin/env node

import http from 'http';
import WebSocket from 'ws';

const BASE_URL = 'http://localhost:4481';

async function testProcessCount() {
  console.log('🔍 Testing Process Count in Management Interface...\n');

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
      processesData.data.forEach((process, index) => {
        console.log(`   ${index + 1}. ${process.id} (${process.name}) - ${process.status}`);
      });
    } else {
      console.log('❌ Processes API failed:', processesData.error);
      return;
    }

    // Test 3: Check status API endpoint
    console.log('\n3. Testing status API endpoint...');
    const statusResponse = await makeRequest('/api/status');

    if (statusResponse.statusCode === 200) {
      const statusData = JSON.parse(statusResponse.data);

      if (statusData.success) {
        console.log('✅ Status API returned successfully');
        console.log(`   Processes in status: ${Array.isArray(statusData.data.processes) ? statusData.data.processes.length : 'Not an array'}`);

        if (Array.isArray(statusData.data.processes)) {
          console.log('   Process details from status:');
          statusData.data.processes.forEach((process, index) => {
            console.log(`     ${index + 1}. ${process.id} (${process.name}) - ${process.status}`);
          });
        } else {
          console.log('   ❌ Status processes is not an array:', typeof statusData.data.processes);
        }
      } else {
        console.log('❌ Status API failed:', statusData.error);
      }
    } else {
      console.log('❌ Status API not accessible');
    }

    // Test 4: Check WebSocket status message
    console.log('\n4. Testing WebSocket status message...');
    await testWebSocketStatus();

    console.log('\n✅ Process count test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testWebSocketStatus() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:4481/ws');

    let statusReceived = false;
    let processesReceived = false;

    const timeout = setTimeout(() => {
      console.log('   ⏰ WebSocket timeout - no messages received');
      ws.close();
      resolve();
    }, 5000);

    ws.on('open', () => {
      console.log('   🔌 WebSocket connected');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'status') {
          statusReceived = true;
          console.log('   📊 Status message received');
          console.log(`      Processes in status: ${Array.isArray(message.data.processes) ? message.data.processes.length : 'Not an array'}`);

          if (Array.isArray(message.data.processes)) {
            console.log('      Process details from WebSocket status:');
            message.data.processes.forEach((process, index) => {
              console.log(`        ${index + 1}. ${process.id} (${process.name}) - ${process.status}`);
            });
          } else {
            console.log('      ❌ WebSocket status processes is not an array:', typeof message.data.processes);
          }
        } else if (message.type === 'processes') {
          processesReceived = true;
          console.log('   📋 Processes message received');
          console.log(`      Processes count: ${message.data.length}`);
        }

        if (statusReceived && processesReceived) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch (error) {
        console.log('   ❌ Failed to parse WebSocket message:', error.message);
      }
    });

    ws.on('error', (error) => {
      console.log('   ❌ WebSocket error:', error.message);
      clearTimeout(timeout);
      resolve();
    });

    ws.on('close', () => {
      console.log('   🔌 WebSocket closed');
      clearTimeout(timeout);
      resolve();
    });
  });
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
testProcessCount().catch(console.error); 