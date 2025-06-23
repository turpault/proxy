#!/usr/bin/env node

import WebSocket from 'ws';

async function testWebSocketProcesses() {
  console.log('🧪 Testing WebSocket process updates...\n');

  const wsUrl = 'ws://localhost:5480/ws';
  console.log(`Connecting to WebSocket: ${wsUrl}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('✅ WebSocket connected successfully');

      // Wait a bit for any initial messages
      setTimeout(() => {
        console.log('📡 WebSocket connection established, waiting for process updates...');
        console.log('💡 Try refreshing the management console or restarting a process to see updates');

        // Keep connection open for 10 seconds to see if we get any messages
        setTimeout(() => {
          console.log('⏰ Test completed, closing connection');
          ws.close();
          resolve();
        }, 10000);
      }, 1000);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Received WebSocket message:', JSON.stringify(message, null, 2));

        if (message.type === 'processes') {
          console.log(`✅ Process update received with ${message.data.length} processes`);
          message.data.forEach(process => {
            console.log(`  - ${process.name} (${process.id}): ${process.status}`);
          });
        }
      } catch (error) {
        console.log('❌ Failed to parse WebSocket message:', error.message);
        console.log('Raw message:', data.toString());
      }
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      reject(error);
    });

    // Handle process exit
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, closing WebSocket connection');
      ws.close();
      resolve();
    });
  });
}

// Run the test
testWebSocketProcesses().then(() => {
  console.log('\n🏁 WebSocket test completed');
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 