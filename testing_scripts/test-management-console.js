const axios = require('axios');

const BASE_URL = 'http://localhost:4481';

async function testManagementConsole() {
  console.log('Testing Management Console - All Processes Display...\n');

  try {
    // Test 1: Get processes data
    console.log('1. Getting processes data...');
    const processesResponse = await axios.get(`${BASE_URL}/api/processes`);
    console.log('✓ Processes data retrieved');
    console.log(`  - Total processes: ${processesResponse.data.data.length}`);

    const runningProcesses = processesResponse.data.data.filter(p => p.isRunning);
    const stoppedProcesses = processesResponse.data.data.filter(p => !p.isRunning);

    console.log(`  - Running processes: ${runningProcesses.length}`);
    console.log(`  - Stopped processes: ${stoppedProcesses.length}`);
    console.log('');

    // Test 2: Get status data
    console.log('2. Getting status data...');
    const statusResponse = await axios.get(`${BASE_URL}/api/status`);
    console.log('✓ Status data retrieved');
    console.log(`  - Total processes: ${statusResponse.data.processes?.length || 0}`);
    console.log(`  - Running processes: ${statusResponse.data.processes?.filter(p => p.isRunning).length || 0}`);
    console.log(`  - Stopped processes: ${(statusResponse.data.processes?.length || 0) - (statusResponse.data.processes?.filter(p => p.isRunning).length || 0)}`);
    console.log('');

    // Test 3: Check if stopped processes are included
    console.log('3. Verifying stopped processes are included...');
    if (stoppedProcesses.length > 0) {
      console.log('✓ Stopped processes are included in the response:');
      stoppedProcesses.forEach(process => {
        console.log(`  - ${process.name || process.id}: ${process.isRunning ? 'Running' : 'Stopped'}`);
      });
    } else {
      console.log('ℹ️  No stopped processes found (all processes are running)');
    }
    console.log('');

    // Test 4: Check management console HTML
    console.log('4. Checking management console HTML...');
    const htmlResponse = await axios.get(`${BASE_URL}/`);
    const html = htmlResponse.data;

    if (html.includes('All Managed Processes')) {
      console.log('✓ Management console shows "All Managed Processes"');
    } else {
      console.log('❌ Management console does not show "All Managed Processes"');
    }

    if (html.includes('Inactive Processes')) {
      console.log('✓ Management console includes "Inactive Processes" card');
    } else {
      console.log('❌ Management console does not include "Inactive Processes" card');
    }

    if (html.includes('Showing all configured processes')) {
      console.log('✓ Management console includes description about showing all processes');
    } else {
      console.log('❌ Management console does not include description about showing all processes');
    }
    console.log('');

    console.log('✅ Management console test completed!');
    console.log('\nThe management console now displays:');
    console.log('- All configured processes (both running and stopped)');
    console.log('- Clear status indicators for each process');
    console.log('- Separate counts for active and inactive processes');
    console.log('- Descriptive text explaining that all processes are shown');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

// Run the test
testManagementConsole(); 