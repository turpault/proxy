import 'dotenv/config';
import { ProxyServer } from './services/proxy';
import { ConfigLoader } from './config/loader';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  try {
    logger.info('Starting Nginx-like Proxy Server...');

    // Load configuration
    const config = await ConfigLoader.load();
    
    // Create and start proxy server
    const server = new ProxyServer(config);
    
    // Handle graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await server.stop();
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

    // Start the server
    await server.start();
    
    logger.info('Proxy server started successfully');
    
    // Log server status
    const status = server.getStatus();
    logger.info('Server status', status);
    
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