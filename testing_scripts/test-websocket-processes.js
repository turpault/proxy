#!/usr/bin/env node

import WebSocket from 'ws';

console.log('Testing WebSocket connection to management console...');

const ws = new WebSocket('ws://localhost:4481/ws');

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received WebSocket message:');
    console.log('  Type:', message.type);
    console.log('  Timestamp:', message.timestamp);

    if (message.type === 'processes') {
      console.log('  📊 Processes data:');
      console.log('    Count:', message.data.length);
      message.data.forEach((process, index) => {
        console.log(`    ${index + 1}. ${process.id} (${process.name}) - ${process.status}`);
      });
    } else if (message.type === 'status') {
      console.log('  📈 Status data received');
    } else if (message.type === 'error') {
      console.log('  ❌ Error:', message.data.message);
    }
  } catch (error) {
    console.log('❌ Failed to parse WebSocket message:', error.message);
    console.log('Raw data:', data.toString());
  }
});

ws.on('error', (error) => {
  console.log('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed:', code, reason.toString());
});

// Close after 5 seconds
setTimeout(() => {
  console.log('🕐 Test completed, closing connection...');
  ws.close();
  process.exit(0);
}, 5000); 