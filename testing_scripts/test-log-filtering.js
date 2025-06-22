#!/usr/bin/env node

/**
 * Test script for stdout/stderr log filtering functionality
 * This script tests the new log filtering features in the management UI
 */

const axios = require('axios');

const MANAGEMENT_URL = 'http://localhost:4481';

async function testLogFiltering() {
  console.log('🧪 Testing stdout/stderr log filtering functionality...\n');

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
    processes.forEach(process => {
      console.log(`   - ${process.name} (${process.id}): ${process.status}`);
    });

    // Test 2: Get logs for the first running process
    const runningProcess = processes.find(p => p.status === 'running');
    if (!runningProcess) {
      console.log('❌ No running processes found. Please start a process first.');
      return;
    }

    console.log(`\n2. Testing log retrieval for process: ${runningProcess.name} (${runningProcess.id})`);

    const logsResponse = await axios.get(`${MANAGEMENT_URL}/api/processes/${runningProcess.id}/logs?lines=50`);
    const logs = logsResponse.data.data.logs;

    if (!logs || logs.length === 0) {
      console.log('⚠️  No logs available for this process');
      return;
    }

    console.log(`✅ Retrieved ${logs.length} log lines`);

    // Test 3: Analyze log streams
    console.log('\n3. Analyzing log streams...');

    let stdoutCount = 0;
    let stderrCount = 0;
    let unknownCount = 0;

    logs.forEach(log => {
      if (log.includes('[STDOUT]')) {
        stdoutCount++;
      } else if (log.includes('[STDERR]')) {
        stderrCount++;
      } else {
        unknownCount++;
      }
    });

    console.log(`   - STDOUT lines: ${stdoutCount}`);
    console.log(`   - STDERR lines: ${stderrCount}`);
    console.log(`   - Unknown/legacy lines: ${unknownCount}`);

    // Test 4: Show sample logs
    console.log('\n4. Sample log lines:');

    const stdoutSamples = logs.filter(log => log.includes('[STDOUT]')).slice(0, 3);
    const stderrSamples = logs.filter(log => log.includes('[STDERR]')).slice(0, 3);

    if (stdoutSamples.length > 0) {
      console.log('\n   STDOUT samples:');
      stdoutSamples.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.substring(0, 100)}${log.length > 100 ? '...' : ''}`);
      });
    }

    if (stderrSamples.length > 0) {
      console.log('\n   STDERR samples:');
      stderrSamples.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.substring(0, 100)}${log.length > 100 ? '...' : ''}`);
      });
    }

    // Test 5: Test WebSocket connection for live updates
    console.log('\n5. Testing WebSocket connection...');

    try {
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://localhost:4481`);

      ws.on('open', () => {
        console.log('✅ WebSocket connection established');
        ws.close();
      });

      ws.on('error', (error) => {
        console.log('⚠️  WebSocket connection failed (this is normal if no WebSocket support)');
      });

      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, 2000);

    } catch (error) {
      console.log('⚠️  WebSocket test skipped (ws module not available)');
    }

    // Test 6: Verify management UI accessibility
    console.log('\n6. Testing management UI...');

    try {
      const uiResponse = await axios.get(`${MANAGEMENT_URL}/`);
      if (uiResponse.status === 200) {
        console.log('✅ Management UI is accessible');
        console.log(`   - URL: ${MANAGEMENT_URL}`);
        console.log('   - Features to test manually:');
        console.log('     * Process tabs with stdout/stderr filtering');
        console.log('     * All/STDOUT/STDERR filter buttons');
        console.log('     * Log line count selector (100-10,000 lines)');
        console.log('     * Live log updates');
      }
    } catch (error) {
      console.log('❌ Management UI not accessible');
    }

    console.log('\n🎉 Log filtering test completed!');
    console.log('\n📋 Manual Testing Checklist:');
    console.log('1. Open the management UI in your browser');
    console.log('2. Navigate to the Processes section');
    console.log('3. Click on a process tab to load logs');
    console.log('4. Test the filter buttons: All, STDOUT, STDERR');
    console.log('5. Verify that:');
    console.log('   - STDOUT lines have blue left border');
    console.log('   - STDERR lines have red left border and background');
    console.log('   - Filter buttons show active state');
    console.log('   - Log count updates when filtering');
    console.log('   - Live updates work with current filter');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
  }
}

// Run the test
testLogFiltering().catch(console.error); 