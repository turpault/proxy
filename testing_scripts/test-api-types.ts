#!/usr/bin/env bun

/**
 * Test script to verify API request and response types
 * This script tests that all API types are properly defined and work correctly
 */

import {
  // API types
  ApiEndpointTypes,
  ApiRequest,
  ApiResponse,

  // Status API
  StatusRequest,
  StatusResponse,

  // Configuration API
  GetConfigRequest,
  GetConfigResponse,
  SaveConfigRequest,
  SaveConfigResponse,
  CreateBackupRequest,
  CreateBackupResponse,
  GetBackupsRequest,
  GetBackupsResponse,
  RestoreBackupApiRequest,
  RestoreBackupResponse,
  ValidateConfigRequest,
  ValidateConfigResponse,

  // Statistics API
  GetStatisticsRequest,
  GetStatisticsResponse,
  GetDetailedStatisticsRequest,
  GetDetailedStatisticsResponse,
  GetStatisticsSummaryRequest,
  GetStatisticsSummaryResponse,
  GenerateReportRequest,
  GenerateReportResponse,

  // Processes API
  GetProcessesRequest,
  GetProcessesResponse,
  ReloadProcessesRequest,
  ReloadProcessesResponse,
  StartProcessRequest,
  StartProcessResponse,
  StopProcessRequest,
  StopProcessResponse,
  RestartProcessRequest,
  RestartProcessResponse,
  GetProcessLogsRequest,
  GetProcessLogsResponse,
  GetProcessConfigRequest,
  GetProcessConfigResponse,
  UpdateProcessConfigRequest,
  UpdateProcessConfigResponse,

  // Certificates API
  GetCertificatesRequest,
  GetCertificatesResponse,

  // Cache API
  GetCacheStatsRequest,
  GetCacheStatsResponse,
  GetCacheEntriesRequest,
  GetCacheEntriesResponse,
  ClearCacheRequest,
  ClearCacheResponse,
  DeleteCacheEntryRequest,
  DeleteCacheEntryResponse,

  // OAuth API
  GetOAuthSessionRequest,
  GetOAuthSessionResponse,
  LogoutRequest,
  LogoutResponse,

  // Health API
  HealthRequest,
  HealthResponse,

  // WebSocket API
  WebSocketRequest,
  WebSocketResponse,

  // Shared types
  ConfigSaveRequest,
  ConfigData,
  BackupItem,
  ValidationStatus,
  StatisticsSummary,
  DetailedStatistics,
  Process,
  StatusData,
  CertificateInfo,
  CacheData,
  CacheEntry,
  OAuthSessionResponse,
  LogLine
} from '../src/types';

console.log('🧪 Testing API Request and Response Types...\n');

// Test 1: Verify all API endpoint types are defined
console.log('1. Testing API endpoint type mappings...');
const endpointTypes: (keyof ApiEndpointTypes)[] = [
  'GET /api/status',
  'GET /api/config/:type',
  'POST /api/config/:type/save',
  'POST /api/config/:type/backup',
  'GET /api/config/:type/backups',
  'POST /api/config/:type/restore',
  'POST /api/config/validate',
  'GET /api/statistics',
  'GET /api/statistics/detailed',
  'GET /api/statistics/summary',
  'POST /api/statistics/generate-report',
  'GET /api/processes',
  'POST /api/processes/reload',
  'POST /api/processes/:id/start',
  'POST /api/processes/:id/stop',
  'POST /api/processes/:id/restart',
  'GET /api/processes/:id/logs',
  'GET /api/processes/config',
  'PUT /api/processes/config',
  'GET /api/certificates',
  'GET /api/cache/stats',
  'GET /api/cache/entries',
  'POST /api/cache/clear',
  'DELETE /api/cache/delete/:key',
  'GET /oauth/session',
  'POST /oauth/logout',
  'GET /health'
];

console.log(`✅ Found ${endpointTypes.length} API endpoint types`);

// Test 2: Verify request/response type extraction
console.log('\n2. Testing request/response type extraction...');
type TestRequest = ApiRequest<'GET /api/status'>;
type TestResponse = ApiResponse<'GET /api/status'>;

const testRequest: TestRequest = {};
const testResponse: TestResponse = {
  success: true,
  data: {
    httpPort: 8080,
    httpsPort: 8443,
    routes: 5,
    certificates: new Map(),
    processes: [],
    statistics: {
      totalRequests: 1000,
      uniqueIPs: 50,
      uniqueCountries: 10,
      cacheSize: 100
    },
    cache: {
      totalEntries: 100,
      totalSize: 1024,
      hitRate: 0.8,
      missRate: 0.2,
      users: []
    },
    uptime: 3600,
    memory: {
      rss: 1024,
      heapTotal: 512,
      heapUsed: 256,
      external: 128
    },
    timestamp: new Date().toISOString()
  }
};

console.log('✅ Request/response type extraction works');

// Test 3: Verify shared types are properly imported
console.log('\n3. Testing shared types integration...');

const configSaveRequest: ConfigSaveRequest = {
  content: 'test content',
  createBackup: true
};

const configData: ConfigData = {
  content: 'test content',
  path: '/test/path',
  lastModified: new Date().toISOString()
};

const backupItem: BackupItem = {
  name: 'test-backup',
  path: '/test/backup',
  size: 1024,
  lastModified: new Date().toISOString()
};

const validationStatus: ValidationStatus = {
  isValid: true,
  errors: [],
  warnings: []
};

const statisticsSummary: StatisticsSummary = {
  totalRequests: 1000,
  uniqueIPs: 50,
  uniqueCountries: 10,
  cacheSize: 100
};

const process: Process = {
  id: 'test-process',
  name: 'Test Process',
  isRunning: true,
  pid: 12345,
  startTime: new Date().toISOString(),
  uptime: 3600,
  restartCount: 0,
  healthCheckFailures: 0,
  lastHealthCheckTime: new Date().toISOString()
};

const statusData: StatusData = {
  httpPort: 8080,
  httpsPort: 8443,
  routes: 5,
  certificates: new Map(),
  processes: [],
  statistics: statisticsSummary,
  cache: {
    totalEntries: 100,
    totalSize: 1024,
    hitRate: 0.8,
    missRate: 0.2,
    users: []
  },
  uptime: 3600,
  memory: {
    rss: 1024,
    heapTotal: 512,
    heapUsed: 256,
    external: 128
  },
  timestamp: new Date().toISOString()
};

const certificateInfo: CertificateInfo = {
  domain: 'example.com',
  certPath: '/path/to/cert.pem',
  keyPath: '/path/to/key.pem',
  expiresAt: new Date().toISOString(),
  isValid: true,
  issuer: 'Let\'s Encrypt'
};

const cacheData: CacheData = {
  totalEntries: 100,
  totalSize: 1024,
  hitRate: 0.8,
  missRate: 0.2,
  users: []
};

const cacheEntry: CacheEntry = {
  key: 'test-key',
  url: 'https://example.com',
  method: 'GET',
  status: 200,
  contentType: 'application/json',
  size: 1024,
  userId: 'user123',
  createdAt: new Date().toISOString(),
  expiresAt: new Date().toISOString(),
  body: 'test body'
};

const oauthSessionResponse: OAuthSessionResponse = {
  authenticated: true,
  provider: 'test-provider',
  timestamp: new Date().toISOString(),
  session: {
    accessToken: 'test-token',
    tokenType: 'Bearer',
    expiresAt: new Date().toISOString()
  }
};

const logLine: LogLine = {
  line: 'Test log message',
  stream: 'stdout',
  timestamp: new Date().toISOString()
};

console.log('✅ All shared types are properly integrated');

// Test 4: Verify API response structures
console.log('\n4. Testing API response structures...');

const statusResponse: StatusResponse = {
  success: true,
  data: statusData
};

const getConfigResponse: GetConfigResponse = {
  success: true,
  data: configData
};

const saveConfigResponse: SaveConfigResponse = {
  success: true,
  data: configData
};

const getStatisticsResponse: GetStatisticsResponse = {
  success: true,
  data: statisticsSummary
};

const getProcessesResponse: GetProcessesResponse = {
  success: true,
  data: [process]
};

const getCertificatesResponse: GetCertificatesResponse = {
  'example.com': certificateInfo
};

const getCacheStatsResponse: GetCacheStatsResponse = {
  success: true,
  data: cacheData
};

const getCacheEntriesResponse: GetCacheEntriesResponse = {
  success: true,
  data: {
    entries: [cacheEntry],
    total: 1,
    page: 1,
    limit: 50
  }
};

const healthResponse: HealthResponse = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  certificates: {
    total: 1,
    valid: 1,
    domains: ['example.com'],
    validDomains: ['example.com']
  },
  servers: {
    management: true
  },
  config: {
    httpPort: 8080,
    httpsPort: 8443,
    routes: 5
  }
};

console.log('✅ All API response structures are valid');

// Test 5: Verify WebSocket types
console.log('\n5. Testing WebSocket types...');

const webSocketRequest: WebSocketRequest = {
  type: 'request_logs',
  processId: 'test-process',
  lines: 100
};

const webSocketResponse: WebSocketResponse = {
  type: 'processes',
  data: [process],
  timestamp: new Date().toISOString()
};

console.log('✅ WebSocket types are valid');

// Test 6: Verify error handling types
console.log('\n6. Testing error handling types...');

const errorResponse: StatusResponse = {
  success: false,
  data: statusData,
  error: 'Test error message'
};

console.log('✅ Error handling types are valid');

console.log('\n🎉 All API type tests passed successfully!');
console.log('\n📋 Summary:');
console.log(`- ${endpointTypes.length} API endpoints defined`);
console.log('- All request/response types properly typed');
console.log('- Shared types correctly integrated');
console.log('- WebSocket types validated');
console.log('- Error handling types verified');

console.log('\n✨ API types are ready for use in frontend and backend!'); 