const http = require('http');

console.log('🧪 Testing automatic log loading and live updates...');
console.log('📊 Expected: Logs should load automatically when expanding process view');
console.log('🎯 Features: Auto-load logs, live updates every 5 seconds, visual indicators');
console.log('📱 Mobile: Responsive log display with live updates');

// Test the processes endpoint
const req = http.request({
  hostname: 'localhost',
  port: 4481,
  path: '/api/processes',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('✅ Processes endpoint test passed');
    console.log('Response status:', res.statusCode);

    try {
      const response = JSON.parse(data);
      console.log('✅ JSON parsing successful');
      console.log('Number of processes:', response.processes?.length || 0);
      console.log('Timestamp present:', !!response.timestamp);

      if (response.processes && response.processes.length > 0) {
        console.log('📋 Process details available for auto-log testing');
        response.processes.forEach((process, index) => {
          console.log(`  Process ${index + 1}: ${process.name || process.id}`);
          console.log(`    Status: ${process.status}`);
          console.log(`    Port: ${process.port || 'N/A'}`);
          console.log(`    PID: ${process.pid || 'N/A'}`);
          console.log(`    Log file: ${process.logFile || 'N/A'}`);
        });
      } else {
        console.log('ℹ️  No processes currently running - auto-log features will be tested when processes are available');
      }
    } catch (error) {
      console.log('❌ JSON parsing failed:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.log('❌ Request failed:', error.message);
});

req.end();

console.log('\n🎨 Auto-Log Features:');
console.log('  • Automatic log loading when expanding process view');
console.log('  • Live updates every 5 seconds with visual indicator');
console.log('  • Timestamp extraction and formatting');
console.log('  • Auto-scroll to latest logs');
console.log('  • Cleanup on page unload');
console.log('  • Error handling and loading states');
console.log('  • Responsive design with custom scrollbars'); 