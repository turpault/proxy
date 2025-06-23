#!/usr/bin/env node

/**
 * Test script for Configuration Editor functionality
 * This script tests all the configuration editor API endpoints
 */

import http from 'http';

const BASE_URL = 'http://localhost:4481';

// Test configuration
const testConfigs = {
  proxy: {
    name: 'Proxy Configuration',
    path: '/api/config/proxy'
  },
  processes: {
    name: 'Processes Configuration',
    path: '/api/config/processes'
  }
};

// Utility function to make HTTP requests
function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4481,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Test functions
async function testLoadConfig(type) {
  console.log(`\n🔍 Testing ${testConfigs[type].name} loading...`);

  try {
    const response = await makeRequest(testConfigs[type].path);

    if (response.status === 200 && response.data.success) {
      console.log(`✅ ${testConfigs[type].name} loaded successfully`);
      console.log(`   Path: ${response.data.data.path}`);
      console.log(`   Last Modified: ${response.data.data.lastModified}`);
      console.log(`   Content Length: ${response.data.data.content.length} characters`);
      return true;
    } else {
      console.log(`❌ Failed to load ${testConfigs[type].name}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${response.data.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error loading ${testConfigs[type].name}: ${error.message}`);
    return false;
  }
}

async function testBackupConfig(type) {
  console.log(`\n💾 Testing ${testConfigs[type].name} backup creation...`);

  try {
    const response = await makeRequest(`${testConfigs[type].path}/backup`, 'POST');

    if (response.status === 200 && response.data.success) {
      console.log(`✅ ${testConfigs[type].name} backup created successfully`);
      console.log(`   Backup Path: ${response.data.data.backupPath}`);
      console.log(`   Timestamp: ${response.data.data.timestamp}`);
      return true;
    } else {
      console.log(`❌ Failed to create backup for ${testConfigs[type].name}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${response.data.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error creating backup for ${testConfigs[type].name}: ${error.message}`);
    return false;
  }
}

async function testListBackups(type) {
  console.log(`\n📋 Testing ${testConfigs[type].name} backup listing...`);

  try {
    const response = await makeRequest(`${testConfigs[type].path}/backups`);

    if (response.status === 200 && response.data.success) {
      console.log(`✅ ${testConfigs[type].name} backups listed successfully`);
      console.log(`   Found ${response.data.data.length} backup(s)`);

      if (response.data.data.length > 0) {
        const latestBackup = response.data.data[0];
        console.log(`   Latest backup: ${latestBackup.name}`);
        console.log(`   Size: ${latestBackup.size} bytes`);
        console.log(`   Modified: ${latestBackup.lastModified}`);
      }
      return true;
    } else {
      console.log(`❌ Failed to list backups for ${testConfigs[type].name}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${response.data.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error listing backups for ${testConfigs[type].name}: ${error.message}`);
    return false;
  }
}

async function testSaveConfig(type) {
  console.log(`\n💾 Testing ${testConfigs[type].name} saving...`);

  try {
    // First, load the current config
    const loadResponse = await makeRequest(testConfigs[type].path);
    if (!loadResponse.data.success) {
      console.log(`❌ Cannot test save - failed to load current config`);
      return false;
    }

    const currentContent = loadResponse.data.data.content;
    const testContent = currentContent + '\n# Test comment added by configuration editor test\n';

    const response = await makeRequest(`${testConfigs[type].path}/save`, 'POST', {
      content: testContent,
      createBackup: true
    });

    if (response.status === 200 && response.data.success) {
      console.log(`✅ ${testConfigs[type].name} saved successfully`);
      console.log(`   Config Path: ${response.data.data.configPath}`);
      if (response.data.data.backupPath) {
        console.log(`   Backup Created: ${response.data.data.backupPath}`);
      }

      // Restore the original content
      const restoreResponse = await makeRequest(`${testConfigs[type].path}/save`, 'POST', {
        content: currentContent,
        createBackup: false
      });

      if (restoreResponse.data.success) {
        console.log(`✅ Original ${testConfigs[type].name} content restored`);
      } else {
        console.log(`⚠️  Warning: Failed to restore original content`);
      }

      return true;
    } else {
      console.log(`❌ Failed to save ${testConfigs[type].name}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${response.data.error || 'Unknown error'}`);
      if (response.data.details) {
        console.log(`   Details: ${response.data.details}`);
      }
      return false;
    }
  } catch (error) {
    console.log(`❌ Error saving ${testConfigs[type].name}: ${error.message}`);
    return false;
  }
}

async function testInvalidConfig(type) {
  console.log(`\n🚫 Testing ${testConfigs[type].name} invalid YAML validation...`);

  try {
    const invalidYaml = `invalid: yaml: content: [with: syntax: error`;

    const response = await makeRequest(`${testConfigs[type].path}/save`, 'POST', {
      content: invalidYaml,
      createBackup: false
    });

    if (response.status === 400 && !response.data.success) {
      console.log(`✅ ${testConfigs[type].name} YAML validation working correctly`);
      console.log(`   Error: ${response.data.error}`);
      if (response.data.details) {
        console.log(`   Details: ${response.data.details}`);
      }
      return true;
    } else {
      console.log(`❌ YAML validation failed for ${testConfigs[type].name}`);
      console.log(`   Expected 400 status, got ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error testing YAML validation for ${testConfigs[type].name}: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Configuration Editor Tests');
  console.log('=====================================');

  const results = {
    proxy: { load: false, backup: false, list: false, save: false, validation: false },
    processes: { load: false, backup: false, list: false, save: false, validation: false }
  };

  // Test each configuration type
  for (const [type, config] of Object.entries(testConfigs)) {
    console.log(`\n📁 Testing ${config.name}`);
    console.log('─'.repeat(50));

    results[type].load = await testLoadConfig(type);
    results[type].backup = await testBackupConfig(type);
    results[type].list = await testListBackups(type);
    results[type].save = await testSaveConfig(type);
    results[type].validation = await testInvalidConfig(type);
  }

  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('=======================');

  for (const [type, config] of Object.entries(testConfigs)) {
    const result = results[type];
    const passed = Object.values(result).filter(Boolean).length;
    const total = Object.keys(result).length;

    console.log(`\n${config.name}:`);
    console.log(`  Load Config: ${result.load ? '✅' : '❌'}`);
    console.log(`  Create Backup: ${result.backup ? '✅' : '❌'}`);
    console.log(`  List Backups: ${result.list ? '✅' : '❌'}`);
    console.log(`  Save Config: ${result.save ? '✅' : '❌'}`);
    console.log(`  YAML Validation: ${result.validation ? '✅' : '❌'}`);
    console.log(`  Overall: ${passed}/${total} tests passed`);
  }

  const totalPassed = Object.values(results).reduce((sum, result) => {
    return sum + Object.values(result).filter(Boolean).length;
  }, 0);
  const totalTests = Object.keys(results).length * 5;

  console.log(`\n🎯 Overall Results: ${totalPassed}/${totalTests} tests passed`);

  if (totalPassed === totalTests) {
    console.log('🎉 All configuration editor tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please check the configuration editor implementation.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error.message);
  process.exit(1);
}); 