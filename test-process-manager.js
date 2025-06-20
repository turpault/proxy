const path = require('path');

// Mock the logger and other dependencies
const logger = {
  info: console.log,
  error: console.error,
  debug: console.log,
  warn: console.warn
};

// Mock the yaml import
const yaml = require('yaml');

// Mock the fs-extra module
const fs = require('fs-extra');

// Create a simplified version of the loadProcessConfig method
async function loadProcessConfig(configFilePath) {
  try {
    const configContent = await fs.readFile(configFilePath, 'utf8');
    const config = yaml.parse(configContent);

    // Basic validation
    if (!config.processes) {
      throw new Error('Invalid process configuration: missing processes section');
    }

    logger.info(`Process management configuration loaded from ${configFilePath}`, {
      processCount: Object.keys(config.processes).length,
      processes: Object.keys(config.processes)
    });

    return config;
  } catch (error) {
    logger.error(`Failed to load process management configuration from ${configFilePath}`, error);
    return null;
  }
}

async function testProcessManager() {
  try {
    const configPath = path.resolve(process.cwd(), 'config', 'processes.yaml');
    console.log('Testing process manager with config path:', configPath);

    const config = await loadProcessConfig(configPath);

    if (config) {
      console.log('Successfully loaded config with processes:', Object.keys(config.processes));
    } else {
      console.log('Failed to load config');
    }
  } catch (error) {
    console.error('Error testing process manager:', error);
  }
}

testProcessManager(); 