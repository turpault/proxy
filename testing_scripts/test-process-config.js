const path = require('path');
const fs = require('fs-extra');
const yaml = require('yaml');

async function testProcessConfig() {
  try {
    const configPath = path.resolve(process.cwd(), 'config', 'processes.yaml');
    console.log('Testing config path:', configPath);

    if (!await fs.pathExists(configPath)) {
      console.error('Config file does not exist');
      return;
    }

    const configContent = await fs.readFile(configPath, 'utf8');
    console.log('Config file content length:', configContent.length);

    const config = yaml.parse(configContent);
    console.log('Parsed config:', JSON.stringify(config, null, 2));

    if (config.processes) {
      console.log('Found processes:', Object.keys(config.processes));
    } else {
      console.log('No processes found in config');
    }
  } catch (error) {
    console.error('Error testing process config:', error);
  }
}

testProcessConfig(); 