#!/usr/bin/env node

/**
 * Test script for local time display functionality
 * This script tests the new local time formatting features in the management UI
 */

const axios = require('axios');

const MANAGEMENT_URL = 'http://localhost:4481';

async function testLocalTimeDisplay() {
  console.log('🕐 Testing local time display functionality...\n');

  try {
    // Test 1: Check if processes are available
    console.log('1. Checking available processes...');
    const processesResponse = await axios.get(`${MANAGEMENT_URL}/api/processes`);
    const processes = processesResponse.data.data;

    if (processes.length === 0) {
      console.log('❌ No processes found. Please start some processes first.');
      return;
    }

    console.log(`✅ Found ${processes.length} processes`);

    // Test 2: Analyze timestamp formats
    console.log('\n2. Analyzing timestamp formats...');

    const runningProcess = processes.find(p => p.status === 'running');
    if (!runningProcess) {
      console.log('⚠️  No running processes found. Please start a process first.');
      return;
    }

    console.log(`\nProcess: ${runningProcess.name} (${runningProcess.id})`);

    if (runningProcess.startTime) {
      console.log(`   Start Time (ISO): ${runningProcess.startTime}`);
      const startDate = new Date(runningProcess.startTime);
      console.log(`   Start Time (Local): ${startDate.toLocaleString()}`);
      console.log(`   Start Time (UTC): ${startDate.toUTCString()}`);
      console.log(`   Timezone Offset: ${startDate.getTimezoneOffset()} minutes`);
    } else {
      console.log('   Start Time: Not available');
    }

    if (runningProcess.lastRestartTime) {
      console.log(`   Last Restart (ISO): ${runningProcess.lastRestartTime}`);
      const restartDate = new Date(runningProcess.lastRestartTime);
      console.log(`   Last Restart (Local): ${restartDate.toLocaleString()}`);
      console.log(`   Last Restart (UTC): ${restartDate.toUTCString()}`);
    } else {
      console.log('   Last Restart: Not available');
    }

    // Test 3: Check status endpoint timestamps
    console.log('\n3. Checking status endpoint timestamps...');

    const statusResponse = await axios.get(`${MANAGEMENT_URL}/api/status`);
    const status = statusResponse.data.data;

    if (status.timestamp) {
      console.log(`   Status Timestamp (ISO): ${status.timestamp}`);
      const statusDate = new Date(status.timestamp);
      console.log(`   Status Timestamp (Local): ${statusDate.toLocaleString()}`);
      console.log(`   Status Timestamp (UTC): ${statusDate.toUTCString()}`);
    }

    // Test 4: Test utility functions (simulate browser environment)
    console.log('\n4. Testing utility functions...');

    // Simulate the formatLocalTime function
    function formatLocalTime(timestamp) {
      if (!timestamp) return 'N/A';

      try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'Invalid Date';

        // Format the date in local region format
        const localDate = date.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });

        // Calculate elapsed time
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        let elapsedText = '';
        if (diffDays > 0) {
          elapsedText = ` (${diffDays} day${diffDays > 1 ? 's' : ''} ago)`;
        } else if (diffHours > 0) {
          elapsedText = ` (${diffHours} hour${diffHours > 1 ? 's' : ''} ago)`;
        } else if (diffMinutes > 0) {
          elapsedText = ` (${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago)`;
        } else {
          elapsedText = ' (just now)';
        }

        return `${localDate}${elapsedText}`;
      } catch (error) {
        return 'Invalid Date';
      }
    }

    function formatRelativeTime(timestamp) {
      if (!timestamp) return 'N/A';

      try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'Invalid Date';

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) {
          return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffHours > 0) {
          return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffMinutes > 0) {
          return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
        } else {
          return 'Just now';
        }
      } catch (error) {
        return 'Invalid Date';
      }
    }

    // Test with sample timestamps
    const testTimestamps = [
      new Date().toISOString(), // Now
      new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      runningProcess.startTime, // Process start time
      runningProcess.lastRestartTime // Process restart time
    ].filter(Boolean);

    console.log('\n   Testing formatLocalTime:');
    testTimestamps.forEach((timestamp, i) => {
      console.log(`   ${i + 1}. ${timestamp} -> ${formatLocalTime(timestamp)}`);
    });

    console.log('\n   Testing formatRelativeTime:');
    testTimestamps.forEach((timestamp, i) => {
      console.log(`   ${i + 1}. ${timestamp} -> ${formatRelativeTime(timestamp)}`);
    });

    // Test 5: Verify management UI accessibility
    console.log('\n5. Testing management UI...');

    try {
      const uiResponse = await axios.get(`${MANAGEMENT_URL}/`);
      if (uiResponse.status === 200) {
        console.log('✅ Management UI is accessible');
        console.log(`   - URL: ${MANAGEMENT_URL}`);
        console.log('   - Features to test manually:');
        console.log('     * Process start times in local timezone');
        console.log('     * Last restart times in local timezone');
        console.log('     * Status timestamps in local timezone');
        console.log('     * Time display formatting with monospace font');
        console.log('     * Elapsed time since start/restart');
        console.log('     * Local region date/time format');
      }
    } catch (error) {
      console.log('❌ Management UI not accessible');
    }

    console.log('\n🎉 Local time display test completed!');
    console.log('\n📋 Manual Testing Checklist:');
    console.log('1. Open the management UI in your browser');
    console.log('2. Navigate to the Processes section');
    console.log('3. Click on a process tab to view details');
    console.log('4. Verify that:');
    console.log('   - Start times show in your local timezone');
    console.log('   - Last restart times show in your local timezone');
    console.log('   - Times include elapsed time (e.g., "2 hours ago")');
    console.log('   - Time displays use monospace font with background');
    console.log('   - Times are formatted as "Jan 15, 2024, 14:30:25 (2 hours ago)"');
    console.log('5. Check the status section for local time formatting');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
  }
}

// Run the test
testLocalTimeDisplay().catch(console.error); 