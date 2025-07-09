// Shared types between frontend and backend
// This file contains types that are used by both frontend and backend

// ============================================================================
// BASE RESPONSE TYPES
// ============================================================================

// Base success response type
export interface ApiSuccessResponse {
  success: true;
  message?: string;
}

// Base error response type
export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
}

// Base response type with optional data
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// CERTIFICATES
// ============================================================================

// Certificate information (with serialized date for frontend compatibility)
export interface CertificateInfo {
  domain: string;
  certPath: string;
  keyPath: string;
  expiresAt: string; // ISO string format for JSON serialization
  isValid: boolean;
  issuer?: string;
}

// API response type for certificates endpoint
export interface CertificatesResponse {
  [domain: string]: CertificateInfo;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Configuration save request type
export interface ConfigSaveRequest {
  content: string;
  createBackup?: boolean;
  configType?: 'proxy' | 'processes' | 'main';
  path?: string;
}

// Configuration data type
export interface ConfigData {
  content: string;
  path: string;
  lastModified: string;
}

// Configuration save response type
export interface ConfigSaveResponse {
  success: boolean;
  data?: ConfigData;
  error?: string;
}

// Backup item type
export interface BackupItem {
  name: string;
  path: string;
  size: number;
  lastModified: string;
}

// Backup response type
export interface BackupResponse {
  success: boolean;
  data?: BackupItem[];
  error?: string;
}

// Restore backup request type
export interface RestoreBackupRequest {
  backupPath: string;
}

// Validation status type
export interface ValidationStatus {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// STATISTICS
// ============================================================================

// Route statistics type (shared between frontend and backend)
export interface RouteStatistics {
  name?: string; // Route name from configuration
  domain: string;
  target: string;
  requests: number;
  avgResponseTime: number;
  topCountries: Array<{
    country: string;
    city?: string;
    count: number;
    percentage: number;
  }>;
  uniqueIPs: number;
  methods: string[];
  requestType?: string; // Frontend-specific
  uniquePaths?: string[]; // Frontend-specific
}

// Statistics summary type
export interface StatisticsSummary {
  totalRequests: number;
  uniqueIPs: number;
  uniqueCountries: number;
  cacheSize: number;
  lastSaved?: string;
  dataFileSize?: number;
}

// Detailed statistics type
export interface DetailedStatistics {
  totalRequests: number;
  uniqueRoutes: number;
  uniqueCountries: number;
  avgResponseTime: number;
  routes: RouteStatistics[];
  period: {
    start: string;
    end: string;
  };
}

// Statistics response types
export interface StatisticsResponse {
  success: boolean;
  data: StatisticsSummary;
}

export interface DetailedStatisticsResponse {
  success: boolean;
  data: DetailedStatistics;
}

// ============================================================================
// CACHE
// ============================================================================

// Cache data types
export interface CacheData {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  users: string[];
}

export interface CacheEntry {
  key: string;
  url: string;
  method: string;
  status: number;
  contentType: string;
  size: number;
  userId: string;
  createdAt: string;
  expiresAt: string;
  body: string;
}

// ============================================================================
// OAUTH
// ============================================================================

// OAuth session response type
export interface OAuthSessionResponse {
  authenticated: boolean;
  provider: string;
  timestamp: string;
  subscriptionKey?: string;
  subscriptionKeyHeader?: string;
  session?: {
    accessToken: string;
    tokenType?: string;
    scope?: string;
    expiresAt: string;
    isExpired?: boolean;
    expiresIn?: number | null;
    sessionId?: string;
  };
}

// ============================================================================
// WEBSOCKET
// ============================================================================

// WebSocket message type
export interface WebSocketMessage {
  type: 'processes' | 'processes_update' | 'status' | 'logs' | 'logs_update' | 'error' | 'pong';
  data: any;
  timestamp: string;
}

// ============================================================================
// PROCESSES
// ============================================================================

// Log line type
export interface LogLine {
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp?: string;
}

// Process type (frontend-specific, but shared structure)
export interface Process {
  id: string;
  name: string;
  isRunning: boolean;
  pid?: number;
  pidFile?: string;
  logFile?: string;
  isReconnected?: boolean;
  restartCount?: number;
  startTime?: string;
  lastRestartTime?: string | null;
  uptime?: number;
  healthCheckFailures?: number;
  lastHealthCheckTime?: string | null;
  isStopped?: boolean;
  isRemoved?: boolean;
}

// ============================================================================
// STATUS
// ============================================================================

// Status data type
export interface StatusData {
  httpPort: number;
  httpsPort: number;
  routes: number;
  certificates: any;
  processes: Process[];
  cache: any;
  uptime: number;
  memory: any;
  timestamp: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Empty request types (for endpoints that don't need request bodies)
export interface EmptyRequest {
  // No request body needed
}

// Generic success response for simple operations
export interface SuccessResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// STATUS API
// ============================================================================

export interface StatusResponse {
  success: boolean;
  data: StatusData;
  error?: string;
}

// ============================================================================
// CONFIGURATION API
// ============================================================================

export interface GetConfigRequest {
  type: 'proxy' | 'processes' | 'main';
}

export interface GetConfigResponse {
  success: boolean;
  data?: ConfigData;
  error?: string;
}

export interface SaveConfigRequest extends ConfigSaveRequest {
  // Inherits from shared ConfigSaveRequest
}

export interface SaveConfigResponse extends ConfigSaveResponse {
  // Inherits from shared ConfigSaveResponse
}

export interface CreateBackupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface GetBackupsResponse {
  success: boolean;
  data?: BackupItem[];
  error?: string;
}

export interface RestoreBackupApiRequest extends RestoreBackupRequest {
  // Inherits from shared RestoreBackupRequest
}

export interface RestoreBackupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ValidateConfigRequest {
  content: string;
  type?: 'proxy' | 'processes' | 'main';
}

export interface ValidateConfigResponse {
  success: boolean;
  data?: ValidationStatus;
  error?: string;
}

// ============================================================================
// STATISTICS API
// ============================================================================

export interface GetStatisticsResponse extends StatisticsResponse {
  // Inherits from shared StatisticsResponse
}

export interface GetDetailedStatisticsRequest {
  period?: string; // Query parameter
}

export interface GetDetailedStatisticsResponse extends DetailedStatisticsResponse {
  // Inherits from shared DetailedStatisticsResponse
}

export interface GetStatisticsSummaryResponse extends StatisticsResponse {
  // Inherits from shared StatisticsResponse
}

export interface GenerateReportResponse {
  success: boolean;
  message?: string;
  data?: {
    filepath: string;
    summary: StatisticsSummary;
  };
  error?: string;
}

// ============================================================================
// PROCESSES API
// ============================================================================

export interface GetProcessesResponse {
  success: boolean;
  data?: Process[];
  error?: string;
}

export interface ReloadProcessesResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface StartProcessResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface StopProcessResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface RestartProcessResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface GetProcessLogsRequest {
  lines?: string; // Query parameter
}

export interface GetProcessLogsResponse {
  success: boolean;
  data?: {
    processId: string;
    logs: LogLine[];
  };
  error?: string;
}

export interface GetProcessConfigResponse {
  success: boolean;
  data?: any; // Process configuration object
  error?: string;
}

export interface UpdateProcessConfigRequest {
  // Process configuration object
  [key: string]: any;
}

export interface UpdateProcessConfigResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// CERTIFICATES API
// ============================================================================

export interface GetCertificatesResponse extends CertificatesResponse {
  // Inherits from shared CertificatesResponse
}

// ============================================================================
// CACHE API
// ============================================================================

export interface GetCacheStatsResponse {
  success: boolean;
  data?: CacheData;
  error?: string;
}

export interface GetCacheEntriesRequest {
  page?: string; // Query parameter
  limit?: string; // Query parameter
  userId?: string; // Query parameter
  inMRU?: string; // Query parameter
}

export interface GetCacheEntriesResponse {
  success: boolean;
  data?: {
    entries: CacheEntry[];
    total: number;
    page: number;
    limit: number;
  };
  error?: string;
}

export interface ClearCacheResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface DeleteCacheEntryResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// OAUTH API
// ============================================================================

export interface GetOAuthSessionResponse extends OAuthSessionResponse {
  // Inherits from shared OAuthSessionResponse
}

export interface LogoutResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// HEALTH API
// ============================================================================

export interface HealthResponse {
  status: 'healthy' | 'error';
  timestamp: string;
  certificates?: {
    total: number;
    valid: number;
    domains: string[];
    validDomains: string[];
  };
  servers?: {
    management: boolean;
  };
  config?: {
    httpPort: number;
    httpsPort: number;
    routes: number;
  };
  error?: string;
}

// ============================================================================
// WEBSOCKET API
// ============================================================================

export interface WebSocketRequest {
  type: 'request_logs' | 'ping';
  processId?: string;
  lines?: number | string;
}

export interface WebSocketResponse {
  type: 'processes' | 'processes_update' | 'status' | 'logs' | 'logs_update' | 'error' | 'pong';
  data: any;
  timestamp: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
  error?: string;
}

// ============================================================================
// FRONTEND-SPECIFIC TYPES
// ============================================================================

export type TabType = 'processes' | 'statistics' | 'certificates' | 'cache' | 'config';
export type LogFilter = 'all' | 'stdout' | 'stderr';
export type NotificationType = 'success' | 'error' | 'warning' | 'info'; 