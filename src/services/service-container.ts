import { ProxyConfig, MainConfig } from '../types';
import { ConfigService } from './config-service';
import { StatisticsService } from './statistics';
import { SessionManager } from './session-manager';
import { GeolocationService } from './geolocation';
import { OAuth2Service } from './oauth2';
import { CacheService } from './cache';
import { ProxyCertificates } from './proxy-certificates';
import { LocalAdminAuthService } from './local-admin-auth-service';
import { ProcessManager } from './process-manager';
import { ProcessScheduler } from './process-scheduler';
import { logger } from '../utils/logger';

export interface ServiceContainer {
  configService: ConfigService;
  statisticsService: StatisticsService;
  sessionManager: SessionManager;
  geolocationService: GeolocationService;
  oauth2Service: OAuth2Service;
  cacheService: CacheService;
  proxyCertificates: ProxyCertificates;
  authService: LocalAdminAuthService;
  processManager: ProcessManager;
  processScheduler: ProcessScheduler;
}

export class ServiceContainerImpl implements ServiceContainer {
  private _configService: ConfigService;
  private _statisticsService: StatisticsService;
  private _sessionManager: SessionManager;
  private _geolocationService: GeolocationService;
  private _oauth2Service: OAuth2Service;
  private _cacheService: CacheService;
  private _proxyCertificates: ProxyCertificates;
  private _authService: LocalAdminAuthService;
  private _processManager: ProcessManager;
  private _processScheduler: ProcessScheduler;

  constructor(config: ProxyConfig, mainConfig?: MainConfig) {
    // Initialize core services
    this._configService = ConfigService.getInstance();
    this._statisticsService = StatisticsService.initialize();
    this._sessionManager = SessionManager.getManagementInstance();
    this._geolocationService = GeolocationService.getInstance();
    this._oauth2Service = new OAuth2Service();
    this._cacheService = new CacheService();
    this._proxyCertificates = ProxyCertificates.getInstance(config);
    this._authService = LocalAdminAuthService.getInstance();
    this._processScheduler = new ProcessScheduler();
    this._processManager = new ProcessManager();
  }

  // Getters for all services
  get configService(): ConfigService {
    return this._configService;
  }

  get statisticsService(): StatisticsService {
    return this._statisticsService;
  }

  get sessionManager(): SessionManager {
    return this._sessionManager;
  }

  get geolocationService(): GeolocationService {
    return this._geolocationService;
  }

  get oauth2Service(): OAuth2Service {
    return this._oauth2Service;
  }

  get cacheService(): CacheService {
    return this._cacheService;
  }

  get proxyCertificates(): ProxyCertificates {
    return this._proxyCertificates;
  }

  get authService(): LocalAdminAuthService {
    return this._authService;
  }

  get processManager(): ProcessManager {
    return this._processManager;
  }

  get processScheduler(): ProcessScheduler {
    return this._processScheduler;
  }

  /**
   * Initialize all services that require initialization
   */
  async initialize(): Promise<void> {
    logger.info('Initializing service container...');

    // Initialize process manager with scheduler
    this._processManager.initialize();

    // Set up scheduler callbacks
    this._processScheduler.setProcessStartCallback(async (id: string, config: any) => {
      await this._processManager.startProcess(id, config, 'scheduled');
    });

    this._processScheduler.setProcessStopCallback(async (id: string) => {
      await this._processManager.detachProcess(id);
    });

    this._processScheduler.setProcessStatusChangeCallback((id: string, isRunning: boolean) => {
      this._processManager.updateSchedulerProcessStatus(id, isRunning);
    });

    logger.info('Service container initialization complete');
  }

  /**
   * Shutdown all services
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down service container...');

    // Shutdown services in reverse dependency order
    await this._statisticsService.shutdown();
    SessionManager.shutdownAll();
    this._configService.stopConfigMonitoring();
    this._geolocationService.clearCache();
    this._oauth2Service.shutdown();
    this._processScheduler.shutdown();

    logger.info('Service container shutdown complete');
  }
}

// Global service container instance
let globalServiceContainer: ServiceContainerImpl | null = null;

/**
 * Get the global service container instance
 */
export function getServiceContainer(): ServiceContainerImpl {
  if (!globalServiceContainer) {
    throw new Error('Service container not initialized. Call initializeServiceContainer() first.');
  }
  return globalServiceContainer;
}

/**
 * Initialize the global service container
 */
export function initializeServiceContainer(config: ProxyConfig, mainConfig?: MainConfig): ServiceContainerImpl {
  if (globalServiceContainer) {
    logger.warn('Service container already initialized, returning existing instance');
    return globalServiceContainer;
  }

  globalServiceContainer = new ServiceContainerImpl(config, mainConfig);
  return globalServiceContainer;
}

/**
 * Shutdown the global service container
 */
export async function shutdownServiceContainer(): Promise<void> {
  if (globalServiceContainer) {
    await globalServiceContainer.shutdown();
    globalServiceContainer = null;
  }
}
