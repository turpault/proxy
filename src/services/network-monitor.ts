import { logger } from '../utils/logger';
import { StatisticsService } from './statistics';
import { configService } from './config-service';

export class NetworkMonitor {
  private static instance: NetworkMonitor;
  private statisticsService: StatisticsService;
  private monitoringInterval: Timer | null = null;
  private isShuttingDown = false;
  
  // Configuration with defaults
  private enabled: boolean = true;
  private interval: number = 30000; // 30 seconds
  private endpoint: string = '1.1.1.1';
  private timeout: number = 5000; // 5 seconds

  private constructor(statisticsService: StatisticsService) {
    this.statisticsService = statisticsService;
    this.loadConfiguration();
  }

  public static getInstance(statisticsService: StatisticsService): NetworkMonitor {
    if (!NetworkMonitor.instance) {
      NetworkMonitor.instance = new NetworkMonitor(statisticsService);
    }
    return NetworkMonitor.instance;
  }

  /**
   * Load configuration from config service
   */
  private loadConfiguration(): void {
    try {
      const mainConfig = configService.getMainConfig();
      if (mainConfig?.settings?.networkMonitoring) {
        const config = mainConfig.settings.networkMonitoring;
        this.enabled = config.enabled !== undefined ? config.enabled : true;
        this.interval = config.interval || 30000;
        this.endpoint = config.endpoint || '1.1.1.1';
        this.timeout = config.timeout || 5000;
        
        logger.info('Network monitoring configuration loaded', {
          enabled: this.enabled,
          interval: this.interval,
          endpoint: this.endpoint,
          timeout: this.timeout
        });
      }
    } catch (error) {
      logger.warn('Failed to load network monitoring configuration, using defaults:', error);
    }
  }

  /**
   * Start the network monitoring service
   */
  public start(): void {
    if (!this.enabled) {
      logger.info('Network monitoring is disabled');
      return;
    }

    if (this.monitoringInterval) {
      logger.warn('Network monitoring is already running');
      return;
    }

    logger.info(`Starting network monitoring service (endpoint: ${this.endpoint}, interval: ${this.interval}ms)`);

    // Run initial test immediately
    this.runConnectivityTest();

    // Schedule periodic tests
    this.monitoringInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.runConnectivityTest();
      }
    }, this.interval);
  }

  /**
   * Stop the network monitoring service
   */
  public async stop(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Network monitoring service stopped');
    }
  }

  /**
   * Run a connectivity test
   */
  private async runConnectivityTest(): Promise<void> {
    try {
      const startTime = performance.now();
      let connectionTime = 0;
      let responseTime = 0;
      let success = false;
      let errorMessage: string | undefined;

      try {
        // Test 1: DNS lookup to measure connection time
        const dnsStartTime = performance.now();
        await this.performDnsLookup(this.endpoint);
        connectionTime = performance.now() - dnsStartTime;

        // Test 2: HTTP request to Cloudflare's 1.1.1.1 to measure full response time
        const httpStartTime = performance.now();
        await this.performHttpRequest();
        responseTime = performance.now() - httpStartTime;

        success = true;
      } catch (error) {
        success = false;
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // If we have partial data (DNS worked but HTTP failed), use what we have
        const elapsed = performance.now() - startTime;
        if (connectionTime === 0) {
          connectionTime = elapsed;
        }
        if (responseTime === 0) {
          responseTime = elapsed;
        }
      }

      // Record the test result
      this.statisticsService.recordConnectivityTest(
        this.endpoint,
        connectionTime,
        responseTime,
        success,
        errorMessage
      );

      if (success) {
        logger.debug(`Connectivity test successful: connection=${connectionTime.toFixed(2)}ms, response=${responseTime.toFixed(2)}ms`);
      } else {
        logger.warn(`Connectivity test failed: ${errorMessage}`);
      }
    } catch (error) {
      logger.error('Failed to run connectivity test:', error);
    }
  }

  /**
   * Perform DNS lookup
   */
  private async performDnsLookup(hostname: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('DNS lookup timeout'));
      }, this.timeout);

      // Use Bun's native DNS lookup
      import('dns').then(dns => {
        dns.lookup(hostname, (err, address) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(new Error(`DNS lookup failed: ${err.message}`));
          } else {
            resolve();
          }
        });
      }).catch(reject);
    });
  }

  /**
   * Perform HTTP request to measure response time
   */
  private async performHttpRequest(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Make a simple HTTP request to Cloudflare DNS JSON API
      // This is more reliable than trying to ping or do raw TCP
      const response = await fetch(`https://${this.endpoint}/dns-query?name=cloudflare.com&type=A`, {
        method: 'GET',
        headers: {
          'Accept': 'application/dns-json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP request failed with status ${response.status}`);
      }

      // Consume the response to ensure the request completes
      await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get current status
   */
  public getStatus(): { enabled: boolean; running: boolean; endpoint: string; interval: number } {
    return {
      enabled: this.enabled,
      running: this.monitoringInterval !== null && !this.isShuttingDown,
      endpoint: this.endpoint,
      interval: this.interval
    };
  }
}

// Export singleton getter
export function getNetworkMonitor(statisticsService: StatisticsService): NetworkMonitor {
  return NetworkMonitor.getInstance(statisticsService);
}

