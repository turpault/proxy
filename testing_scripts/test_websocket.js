import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:4481/ws');

ws.on('open', function open() {
  console.log('WebSocket connected');
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data.toString());
    console.log('Received message:', JSON.stringify(parsed, null, 2));
  } catch (error) {
    console.error('Failed to parse message:', error);
    console.log('Raw message:', data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('WebSocket disconnected');
});

// Keep the script running for a few seconds
setTimeout(() => {
  ws.close();
  process.exit(0);
}, 5000); 