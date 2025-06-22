import 'dotenv/config';
import { ProxyServer } from './services/proxy-server';
import { ConfigLoader } from './config/loader';
import { logger } from './utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';
import express from 'express';
import { registerManagementEndpoints } from './services/management';
import { MainConfig } from './types';

let currentServer: ProxyServer | null = null;
let managementServer: express.Application | null = null;
let isWatchingConfig = false;
let isRestarting = false;
let mainConfig: MainConfig | null = null;

async function startManagementConsole(proxyServer: ProxyServer, config: MainConfig): Promise<void> {
  const managementApp = express();
  
  // Register management endpoints
  registerManagementEndpoints(managementApp, proxyServer.getConfig(), proxyServer);
  
  // Start management server
  const port = config.management.port;
  const host = config.management.host || '0.0.0.0';
  
  return new Promise((resolve, reject) => {
    const server = managementApp.listen(port, host, () => {
      logger.info(`Management console started on http://${host}:${port}`);
      managementServer = managementApp;
      resolve();
    });
    
    server.on('error', (error) => {
      logger.error(`Failed to start management console on port ${port}`, error);
      reject(error);
    });
  });
}

async function startServer(): Promise<ProxyServer> {
  logger.info('Starting Proxy Server and Process Manager...');
  
  // Try to load main configuration first
  try {
    mainConfig = await ConfigLoader.loadMainConfig();
    logger.info('Using main configuration structure');
    
    // Load proxy configuration
    const proxyConfig = await ConfigLoader.loadProxyConfig(mainConfig.config.proxy);
    
    // Load process management configuration if it exists
    try {
      const processConfig = await ConfigLoader.loadProcessConfig(mainConfig.config.processes);
      proxyConfig.processManagement = processConfig;
    } catch (error) {
      logger.warn('Failed to load process management configuration, continuing without it');
    }
    
    // Create and start proxy server
    const server = new ProxyServer(proxyConfig);
    await server.initialize();
    await server.start();
    
    // Start management console
    await startManagementConsole(server, mainConfig);
    
    logger.info('Proxy server and management console started successfully');
    
    // Log server status
    const status = server.getStatus();
    logger.info('Server status', status);
    
    return server;
  } catch (error) {
    logger.info('Main configuration not found, falling back to legacy configuration');
    
    // Fall back to legacy configuration
    const config = await ConfigLoader.load();
    
    // Create and start proxy server
    const server = new ProxyServer(config);
    await server.initialize();
    await server.start();
    
    logger.info('Proxy server started successfully (legacy mode)');
    
    // Log server status
    const status = server.getStatus();
    logger.info('Server status', status);
    
    return server;
  }
}

async function stopServer(): Promise<void> {
  if (currentServer) {
    logger.info('Stopping proxy server...');
    await currentServer.stop();
    currentServer = null;
    logger.info('Proxy server stopped');
  }
  
  if (managementServer) {
    logger.info('Stopping management console...');
    // Note: Express doesn't have a built-in stop method, so we'll just clear the reference
    managementServer = null;
    logger.info('Management console stopped');
  }
}

async function restartServer(): Promise<void> {
  if (isRestarting) {
    logger.debug('Restart already in progress, ignoring additional restart request');
    return;
  }

  isRestarting = true;
  logger.info('Configuration file changed, restarting server...');

  try {
    // First, validate the new configuration without stopping the server
    logger.info('Validating new configuration...');
    await ConfigLoader.load();
    logger.info('New configuration is valid');
    
    // Stop current server
    await stopServer();
    
    // Small delay to ensure clean shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start new server with the validated configuration
    currentServer = await startServer();
    
    logger.info('Server restarted successfully with new configuration');
  } catch (error) {
    logger.error('Failed to restart server with new configuration', error);
    
    // If we don't have a running server, try to start with the old configuration
    if (!currentServer) {
      logger.info('Attempting to start server with previous working configuration...');
      try {
        currentServer = await startServer();
        logger.warn('Server started with previous configuration after config validation failed');
      } catch (fallbackError) {
        logger.error('Failed to start server with fallback configuration', fallbackError);
        process.exit(1);
      }
    }
  } finally {
    isRestarting = false;
  }
}

function setupConfigWatcher(): void {
  // Check if config watching is disabled
  const watchDisabled = process.env.DISABLE_CONFIG_WATCH === 'true' || 
                       process.argv.includes('--no-watch');
                       
  if (watchDisabled) {
    logger.info('Configuration file watching disabled');
    return;
  }

  // Watch main config file if it exists, otherwise watch legacy config
  const mainConfigFile = process.env.MAIN_CONFIG_FILE || './config/main.yaml';
  const legacyConfigFile = process.env.CONFIG_FILE || './config/proxy.yaml';
  
  let configFile: string;
  if (fs.existsSync(path.resolve(mainConfigFile))) {
    configFile = mainConfigFile;
  } else {
    configFile = legacyConfigFile;
  }
  
  const absoluteConfigPath = path.resolve(configFile);
  
  // Check if config file exists
  if (!fs.existsSync(absoluteConfigPath)) {
    logger.warn(`Configuration file not found for watching: ${absoluteConfigPath}`);
    return;
  }

  logger.info(`Setting up file watcher for configuration: ${absoluteConfigPath}`);

  // Use fs.watchFile for more reliable file watching
  // Note: fs.watch can be unreliable on some filesystems
  fs.watchFile(absoluteConfigPath, {
    persistent: true,
    interval: 1000, // Check every second
  }, (curr, prev) => {
    // Check if file was actually modified (not just accessed)
    if (curr.mtime > prev.mtime) {
      logger.info(`Configuration file changed: ${absoluteConfigPath}`);
      // Add small delay to ensure file write is complete
      setTimeout(() => {
        restartServer().catch(error => {
          logger.error('Failed to restart server after config change', error);
          process.exit(1);
        });
      }, 500);
    }
  });

  isWatchingConfig = true;
  logger.info('Configuration file watcher enabled');
}

function stopConfigWatcher(): void {
  if (isWatchingConfig) {
    const configFile = process.env.CONFIG_FILE || './config/proxy.yaml';
    const absoluteConfigPath = path.resolve(configFile);
    fs.unwatchFile(absoluteConfigPath);
    isWatchingConfig = false;
    logger.info('Configuration file watcher stopped');
  }
}

async function main(): Promise<void> {
  try {
    // Start the server
    currentServer = await startServer();
    
    // Setup configuration file watcher
    setupConfigWatcher();
    
    // Handle graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop config watcher
        stopConfigWatcher();
        
        // Stop server
        await stopServer();
        
        logger.info('Server stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
      process.exit(1);
    });
    
  } catch (error) {
    logger.error('Failed to start proxy server', error);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--create-config')) {
  const configPath = process.argv[process.argv.indexOf('--create-config') + 1] || './config/proxy.yaml';
  
  ConfigLoader.createExampleConfig(configPath)
    .then(() => {
      console.log(`Example configuration created at ${configPath}`);
      console.log('Please edit the configuration file and restart the server.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to create example configuration:', error.message);
      process.exit(1);
    });
} else {
  // Start the main application
  main().catch((error) => {
    console.error('Application failed to start:', error.message);
    process.exit(1);
  });
} 