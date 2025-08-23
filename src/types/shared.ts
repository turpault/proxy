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
export type ConfigSaveResponse = DataResponse<ConfigData>;

// Backup item type
export interface BackupItem {
  name: string;
  path: string;
  size: number;
  lastModified: string;
}

// Backup response type
export type BackupResponse = DataResponse<BackupItem[]>;

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

// Detailed validation result type for configuration validation
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  line?: number;
  column?: number;
  details?: string;
  suggestions?: string[];
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
export type StatisticsResponse = DataResponse<StatisticsSummary>;
export type DetailedStatisticsResponse = DataResponse<DetailedStatistics>;

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
  isTerminated?: boolean;
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

// Generic response types
export interface SuccessResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Generic response with optional data
export interface DataResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// STATUS API
// ============================================================================

export type StatusResponse = DataResponse<StatusData>;

// ============================================================================
// CONFIGURATION API
// ============================================================================

export interface GetConfigRequest {
  type: 'proxy' | 'processes' | 'main';
}

export type GetConfigResponse = DataResponse<ConfigData>;

export type SaveConfigRequest = ConfigSaveRequest;
export type SaveConfigResponse = ConfigSaveResponse;

export type CreateBackupResponse = SuccessResponse;
export type GetBackupsResponse = DataResponse<BackupItem[]>;
export type RestoreBackupApiRequest = RestoreBackupRequest;
export type RestoreBackupResponse = SuccessResponse;

export interface ValidateConfigRequest {
  content: string;
  type?: 'proxy' | 'processes' | 'main';
}

export type ValidateConfigResponse = DataResponse<ValidationResult>;

// ============================================================================
// STATISTICS API
// ============================================================================

export type GetStatisticsResponse = StatisticsResponse;

export type GetDetailedStatisticsRequest = {
  period?: string; // Query parameter
};

export type GetDetailedStatisticsResponse = DetailedStatisticsResponse;





// ============================================================================
// PROCESSES API
// ============================================================================

export type GetProcessesResponse = DataResponse<Process[]>;
export type ReloadProcessesResponse = SuccessResponse;
export type StartProcessResponse = SuccessResponse;
export type KillProcessResponse = SuccessResponse;
export type DetachProcessResponse = SuccessResponse;
export type RestartProcessResponse = SuccessResponse;

export type GetProcessLogsRequest = {
  lines?: string; // Query parameter
};

export type GetProcessLogsResponse = DataResponse<{
  processId: string;
  logs: LogLine[];
}>;

export type GetProcessConfigResponse = DataResponse<any>;
export type UpdateProcessConfigRequest = Record<string, any>;
export type UpdateProcessConfigResponse = SuccessResponse;

// ============================================================================
// CERTIFICATES API
// ============================================================================

export type GetCertificatesResponse = CertificatesResponse;

// ============================================================================
// CACHE API
// ============================================================================

export type GetCacheStatsResponse = DataResponse<CacheData>;
export type GetCacheEntriesRequest = {
  page?: string; // Query parameter
  limit?: string; // Query parameter
  userId?: string; // Query parameter
  inMRU?: string; // Query parameter
};
export type GetCacheEntriesResponse = DataResponse<{
  entries: CacheEntry[];
  total: number;
  page: number;
  limit: number;
}>;
export type ClearCacheResponse = SuccessResponse;
export type DeleteCacheEntryResponse = SuccessResponse;

// ============================================================================
// OAUTH API
// ============================================================================

export type GetOAuthSessionResponse = OAuthSessionResponse;

export type LogoutResponse = SuccessResponse;

// ============================================================================
// AUTHENTICATION API
// ============================================================================

// Login request type
export interface LoginRequest {
  password: string;
}

// Login response type
export interface LoginResponse {
  success: boolean;
  session?: {
    id: string;
    userId: string;
    createdAt: string;
    expiresAt: string;
  };
  error?: string;
}

// Logout request type
export interface LogoutRequest {
  sessionId: string;
}



// Session validation response type
export interface SessionValidationResponse {
  success: boolean;
  authenticated: boolean;
  session?: {
    id: string;
    userId: string;
    createdAt: string;
    expiresAt: string;
  };
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

export type WebSocketResponse = WebSocketMessage;

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export type PaginatedResponse<T> = DataResponse<{
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}>;

// ============================================================================
// FRONTEND-SPECIFIC TYPES
// ============================================================================

export type TabType = 'processes' | 'statistics' | 'certificates' | 'cache' | 'config';
export type LogFilter = 'all' | 'stdout' | 'stderr';
export type NotificationType = 'success' | 'error' | 'warning' | 'info'; 