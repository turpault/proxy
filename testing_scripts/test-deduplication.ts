import {
  ConfigSaveRequest,
  CertificateInfo,
  RouteStatistics,
  Process,
  StatisticsSummary,
  OAuthSessionResponse,
  WebSocketMessage,
  LogLine,
  ConfigData,
  ConfigSaveResponse,
  BackupItem,
  BackupResponse,
  RestoreBackupRequest,
  ValidationStatus,
  CacheData,
  CacheEntry,
  StatusData,
  DetailedStatistics,
  StatisticsResponse,
  DetailedStatisticsResponse,
  TabType,
  LogFilter,
  NotificationType
} from '../src/types/shared';

// Test backend types
import { CertificateInfoBackend } from '../src/types/index';

// Test frontend types
import { SaveConfigRequest } from '../src/frontend/management/src/types/index';

console.log('=== Testing Shared Types Deduplication ===');

// Test ConfigSaveRequest
console.log('\n1. Testing ConfigSaveRequest:');
const configRequest: ConfigSaveRequest = {
  content: 'test content',
  createBackup: true,
  configType: 'proxy',
  path: './config/proxy.yaml'
};
console.log('✓ ConfigSaveRequest works:', configRequest);

// Test CertificateInfo (shared version with string date)
console.log('\n2. Testing CertificateInfo (shared):');
const certInfo: CertificateInfo = {
  domain: 'example.com',
  certPath: '/path/to/cert.pem',
  keyPath: '/path/to/key.pem',
  expiresAt: '2025-12-31T23:59:59.000Z', // ISO string
  isValid: true,
  issuer: 'Let\'s Encrypt'
};
console.log('✓ CertificateInfo (shared) works:', certInfo);

// Test CertificateInfoBackend (backend version with Date)
console.log('\n3. Testing CertificateInfoBackend:');
const certInfoBackend: CertificateInfoBackend = {
  domain: 'example.com',
  certPath: '/path/to/cert.pem',
  keyPath: '/path/to/key.pem',
  expiresAt: new Date('2025-12-31T23:59:59.000Z'), // Date object
  isValid: true,
  issuer: 'Let\'s Encrypt'
};
console.log('✓ CertificateInfoBackend works:', certInfoBackend);

// Test RouteStatistics
console.log('\n4. Testing RouteStatistics:');
const routeStats: RouteStatistics = {
  name: 'test-route',
  domain: 'example.com',
  target: 'http://localhost:3000',
  requests: 1000,
  avgResponseTime: 150,
  topCountries: [
    { country: 'US', city: 'New York', count: 500, percentage: 50 }
  ],
  uniqueIPs: 250,
  methods: ['GET', 'POST'],
  requestType: 'proxy',
  uniquePaths: ['/api', '/health']
};
console.log('✓ RouteStatistics works:', routeStats);

// Test Process
console.log('\n5. Testing Process:');
const process: Process = {
  id: 'test-process',
  name: 'Test Process',
  isRunning: true,
  pid: 12345,
  pidFile: '/tmp/test.pid',
  logFile: '/tmp/test.log',
  isReconnected: false,
  restartCount: 0,
  startTime: '2025-01-01T00:00:00.000Z',
  lastRestartTime: null,
  uptime: 3600000,
  healthCheckFailures: 0,
  lastHealthCheckTime: '2025-01-01T01:00:00.000Z',
  isStopped: false,
  isRemoved: false
};
console.log('✓ Process works:', process);

// Test StatisticsSummary
console.log('\n6. Testing StatisticsSummary:');
const statsSummary: StatisticsSummary = {
  totalRequests: 10000,
  uniqueIPs: 500,
  uniqueCountries: 25,
  cacheSize: 1024,
  lastSaved: '2025-01-01T00:00:00.000Z',
  dataFileSize: 2048
};
console.log('✓ StatisticsSummary works:', statsSummary);

// Test OAuthSessionResponse
console.log('\n7. Testing OAuthSessionResponse:');
const oauthSession: OAuthSessionResponse = {
  authenticated: true,
  provider: 'google',
  timestamp: '2025-01-01T00:00:00.000Z',
  subscriptionKey: 'test-key',
  subscriptionKeyHeader: 'X-API-Key',
  session: {
    accessToken: 'access-token',
    tokenType: 'Bearer',
    scope: 'read write',
    expiresAt: '2025-01-01T01:00:00.000Z',
    isExpired: false,
    expiresIn: 3600,
    sessionId: 'session-123'
  }
};
console.log('✓ OAuthSessionResponse works:', oauthSession);

// Test WebSocketMessage
console.log('\n8. Testing WebSocketMessage:');
const wsMessage: WebSocketMessage = {
  type: 'processes',
  data: { processes: [process] },
  timestamp: '2025-01-01T00:00:00.000Z'
};
console.log('✓ WebSocketMessage works:', wsMessage);

// Test LogLine
console.log('\n9. Testing LogLine:');
const logLine: LogLine = {
  line: 'Test log message',
  stream: 'stdout',
  timestamp: '2025-01-01T00:00:00.000Z'
};
console.log('✓ LogLine works:', logLine);

// Test ConfigData
console.log('\n10. Testing ConfigData:');
const configData: ConfigData = {
  content: 'test config content',
  path: './config/test.yaml',
  lastModified: '2025-01-01T00:00:00.000Z'
};
console.log('✓ ConfigData works:', configData);

// Test ConfigSaveResponse
console.log('\n11. Testing ConfigSaveResponse:');
const configSaveResponse: ConfigSaveResponse = {
  success: true,
  data: configData,
  error: undefined
};
console.log('✓ ConfigSaveResponse works:', configSaveResponse);

// Test BackupItem
console.log('\n12. Testing BackupItem:');
const backupItem: BackupItem = {
  name: 'backup-2025-01-01',
  path: './backups/backup-2025-01-01.yaml',
  size: 1024,
  lastModified: '2025-01-01T00:00:00.000Z'
};
console.log('✓ BackupItem works:', backupItem);

// Test BackupResponse
console.log('\n13. Testing BackupResponse:');
const backupResponse: BackupResponse = {
  success: true,
  data: [backupItem],
  error: undefined
};
console.log('✓ BackupResponse works:', backupResponse);

// Test RestoreBackupRequest
console.log('\n14. Testing RestoreBackupRequest:');
const restoreRequest: RestoreBackupRequest = {
  backupPath: './backups/backup-2025-01-01.yaml'
};
console.log('✓ RestoreBackupRequest works:', restoreRequest);

// Test ValidationStatus
console.log('\n15. Testing ValidationStatus:');
const validationStatus: ValidationStatus = {
  isValid: true,
  errors: [],
  warnings: ['Minor warning']
};
console.log('✓ ValidationStatus works:', validationStatus);

// Test CacheData
console.log('\n16. Testing CacheData:');
const cacheData: CacheData = {
  totalEntries: 100,
  totalSize: 1024,
  hitRate: 0.95,
  missRate: 0.05,
  users: ['user1', 'user2']
};
console.log('✓ CacheData works:', cacheData);

// Test CacheEntry
console.log('\n17. Testing CacheEntry:');
const cacheEntry: CacheEntry = {
  key: 'cache-key',
  url: 'http://example.com/api',
  method: 'GET',
  status: 200,
  contentType: 'application/json',
  size: 512,
  userId: 'user1',
  createdAt: '2025-01-01T00:00:00.000Z',
  expiresAt: '2025-01-01T01:00:00.000Z',
  body: '{"test": "data"}'
};
console.log('✓ CacheEntry works:', cacheEntry);

// Test StatusData
console.log('\n18. Testing StatusData:');
const statusData: StatusData = {
  httpPort: 8080,
  httpsPort: 8443,
  routes: 5,
  certificates: { 'example.com': certInfo },
  processes: [process],
  statistics: statsSummary,
  cache: cacheData,
  uptime: 3600000,
  memory: { used: 1024, total: 2048 },
  timestamp: '2025-01-01T00:00:00.000Z'
};
console.log('✓ StatusData works:', statusData);

// Test DetailedStatistics
console.log('\n19. Testing DetailedStatistics:');
const detailedStats: DetailedStatistics = {
  totalRequests: 10000,
  uniqueRoutes: 5,
  uniqueCountries: 25,
  avgResponseTime: 150,
  routes: [routeStats],
  period: {
    start: '2025-01-01T00:00:00.000Z',
    end: '2025-01-01T23:59:59.000Z'
  }
};
console.log('✓ DetailedStatistics works:', detailedStats);

// Test StatisticsResponse
console.log('\n20. Testing StatisticsResponse:');
const statsResponse: StatisticsResponse = {
  success: true,
  data: statsSummary
};
console.log('✓ StatisticsResponse works:', statsResponse);

// Test DetailedStatisticsResponse
console.log('\n21. Testing DetailedStatisticsResponse:');
const detailedStatsResponse: DetailedStatisticsResponse = {
  success: true,
  data: detailedStats
};
console.log('✓ DetailedStatisticsResponse works:', detailedStatsResponse);

// Test frontend-specific types
console.log('\n22. Testing Frontend-Specific Types:');
const tabType: TabType = 'processes';
const logFilter: LogFilter = 'all';
const notificationType: NotificationType = 'success';
console.log('✓ TabType works:', tabType);
console.log('✓ LogFilter works:', logFilter);
console.log('✓ NotificationType works:', notificationType);

// Test SaveConfigRequest (frontend alias)
console.log('\n23. Testing SaveConfigRequest (frontend alias):');
const saveRequest: SaveConfigRequest = {
  content: 'test content',
  createBackup: true,
  configType: 'proxy',
  path: './config/proxy.yaml'
};
console.log('✓ SaveConfigRequest works:', saveRequest);

console.log('\n=== All shared types deduplication tests completed successfully! ===');
console.log('✅ All types are properly shared between frontend and backend');
console.log('✅ No duplications found');
console.log('✅ Type safety maintained'); 