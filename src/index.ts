import 'dotenv/config';
import { BunProxyServer } from './server';
import { configService } from './services/config-service';
import { logger } from './utils/logger';

let currentServer: BunProxyServer | null = null;
let isRestarting = false;

async function startServer(): Promise<BunProxyServer> {
  logger.info('Starting Bun Proxy Server and Process Manager...');

  // Initialize configuration service
  await configService.initialize();

  // Get configurations from the service
  const serverConfig = configService.getServerConfig();
  const mainConfig = configService.getMainConfig();

  // Create and start proxy server with built-in management server
  const server = new BunProxyServer(serverConfig, mainConfig || undefined);
  await server.initialize();
  await server.start(); // Use built-in management server

  logger.info('Bun proxy server and management console started successfully');

  // Log server status
  const status = server.getStatus();
  logger.info('Server status', status);

  return server;
}

async function stopServer(): Promise<void> {
  if (currentServer) {
    logger.info('Stopping proxy server...');
    await currentServer.stop();
    currentServer = null;
    logger.info('Proxy server stopped');
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
    const isValid = await configService.validateConfig();
    if (!isValid) {
      throw new Error('Configuration validation failed');
    }
    logger.info('New configuration is valid');

    // Stop current server
    await stopServer();

    // Small delay to ensure clean shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start new server with the validated configuration
    currentServer = await startServer();

    logger.info('Server restarted successfully with new configuration');
  } catch (error: any) {
    logger.error('Failed to restart server with new configuration', error);

    // If we don't have a running server, try to start with the old configuration
    if (!currentServer) {
      logger.info('Attempting to start server with previous working configuration...');
      try {
        currentServer = await startServer();
        logger.warn('Server started with previous configuration after config validation failed');
      } catch (fallbackError: any) {
        logger.error('Failed to start server with fallback configuration', fallbackError);
        process.exit(1);
      }
    }
  } finally {
    isRestarting = false;
  }
}



async function main(): Promise<void> {
  try {
    // Start the server
    currentServer = await startServer();

    // Handle graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Stop configuration monitoring
        configService.stopConfigMonitoring();

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

  import('./config/loader').then(({ ConfigLoader }) => {
    ConfigLoader.createExampleConfig(configPath)
      .then(() => {
        console.log(`Example configuration created at ${configPath}`);
        console.log('Please edit the configuration file and restart the server.');
        process.exit(0);
      })
      .catch((error: any) => {
        console.error('Failed to create example configuration:', error.message);
        process.exit(1);
      });
  });
} else {
  // Start the main application
  main().catch((error: any) => {
    console.error('Application failed to start:', error.message);
    process.exit(1);
  });
} 