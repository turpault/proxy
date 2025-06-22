#!/usr/bin/env node

import { ConfigLoader } from '../src/config/loader.js';

async function testMainConfig() {
  console.log('🔍 Testing Main Configuration Loading...\n');

  try {
    // Test loading main configuration
    console.log('Testing main configuration loading...');
    const mainConfig = await ConfigLoader.loadMainConfig();
    console.log('✓ Main configuration loaded successfully');
    console.log('Management port:', mainConfig.management.port);
    console.log('Proxy config path:', mainConfig.config.proxy);
    console.log('Process config path:', mainConfig.config.processes);

    // Test loading proxy configuration
    console.log('\nTesting proxy configuration loading...');
    const proxyConfig = await ConfigLoader.loadProxyConfig(mainConfig.config.proxy);
    console.log('✓ Proxy configuration loaded successfully');
    console.log('Routes count:', proxyConfig.routes.length);

    // Test loading process configuration
    console.log('\nTesting process configuration loading...');
    const processConfig = await ConfigLoader.loadProcessConfig(mainConfig.config.processes);
    console.log('✓ Process configuration loaded successfully');
    console.log('Processes count:', Object.keys(processConfig.processes).length);

    console.log('\n✅ All configuration files loaded successfully!');
    console.log('\n💡 The main configuration structure is working correctly.');
    console.log('   Management console will be available on port', mainConfig.management.port);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the test
testMainConfig(); 