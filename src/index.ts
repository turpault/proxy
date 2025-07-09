import 'dotenv/config';
import { BunProxyServer } from './server';
import { configService } from './services/config-service';
import { logger } from './utils/logger';

let currentServer: BunProxyServer | null = null;

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

  return server;
}

async function stopServer(): Promise<void> {
  if (currentServer) {
    logger.info('Stopping server...');
    await currentServer.stop();
    currentServer = null;
    logger.info('Stopped Server');
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
  const configPath = process.argv[process.argv.indexOf('--create-config') + 1] || './config/main.yaml';

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