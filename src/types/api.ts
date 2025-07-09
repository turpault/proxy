// API Request and Response Types for Management Console
// This file contains all the types needed for frontend-backend API communication

import {
  ConfigSaveRequest,
  ConfigData,
  ConfigSaveResponse,
  BackupItem,
  BackupResponse,
  RestoreBackupRequest as SharedRestoreBackupRequest,
  ValidationStatus,
  StatisticsSummary,
  DetailedStatistics,
  StatisticsResponse,
  DetailedStatisticsResponse,
  Process,
  StatusData,
  CertificateInfo,
  CertificatesResponse,
  CacheData,
  CacheEntry,
  OAuthSessionResponse,
  LogLine
} from './shared';

// ============================================================================
// STATUS API
// ============================================================================

export interface StatusRequest {
  // No request body needed for GET /api/status
}

export interface StatusResponse {
  success: boolean;
  data: StatusData;
  error?: string;
}

// ============================================================================
// CONFIGURATION API
// ============================================================================

// GET /api/config/:type
export interface GetConfigRequest {
  type: 'proxy' | 'processes' | 'main';
}

export interface GetConfigResponse {
  success: boolean;
  data?: ConfigData;
  error?: string;
}

// POST /api/config/:type/save
export interface SaveConfigRequest extends ConfigSaveRequest {
  // Inherits from shared ConfigSaveRequest
}

export interface SaveConfigResponse extends ConfigSaveResponse {
  // Inherits from shared ConfigSaveResponse
}

// POST /api/config/:type/backup
export interface CreateBackupRequest {
  // No request body needed
}

export interface CreateBackupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// GET /api/config/:type/backups
export interface GetBackupsRequest {
  // No request body needed
}

export interface GetBackupsResponse {
  success: boolean;
  data?: BackupItem[];
  error?: string;
}

// POST /api/config/:type/restore
export interface RestoreBackupApiRequest extends SharedRestoreBackupRequest {
  // Inherits from shared RestoreBackupRequest
}

export interface RestoreBackupResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// POST /api/config/validate
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

// GET /api/statistics
export interface GetStatisticsRequest {
  // No request body needed
}

export interface GetStatisticsResponse extends StatisticsResponse {
  // Inherits from shared StatisticsResponse
}

// GET /api/statistics/detailed
export interface GetDetailedStatisticsRequest {
  period?: string; // Query parameter
}

export interface GetDetailedStatisticsResponse extends DetailedStatisticsResponse {
  // Inherits from shared DetailedStatisticsResponse
}

// GET /api/statistics/summary
export interface GetStatisticsSummaryRequest {
  // No request body needed
}

export interface GetStatisticsSummaryResponse extends StatisticsResponse {
  // Inherits from shared StatisticsResponse
}

// POST /api/statistics/generate-report
export interface GenerateReportRequest {
  // No request body needed
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

// GET /api/processes
export interface GetProcessesRequest {
  // No request body needed
}

export interface GetProcessesResponse {
  success: boolean;
  data?: Process[];
  error?: string;
}

// POST /api/processes/reload
export interface ReloadProcessesRequest {
  // No request body needed
}

export interface ReloadProcessesResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// POST /api/processes/:id/start
export interface StartProcessRequest {
  // No request body needed, process ID is in URL
}

export interface StartProcessResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// POST /api/processes/:id/stop
export interface StopProcessRequest {
  // No request body needed, process ID is in URL
}

export interface StopProcessResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// POST /api/processes/:id/restart
export interface RestartProcessRequest {
  // No request body needed, process ID is in URL
}

export interface RestartProcessResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// GET /api/processes/:id/logs
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

// GET /api/processes/config
export interface GetProcessConfigRequest {
  // No request body needed
}

export interface GetProcessConfigResponse {
  success: boolean;
  data?: any; // Process configuration object
  error?: string;
}

// PUT /api/processes/config
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

// GET /api/certificates
export interface GetCertificatesRequest {
  // No request body needed
}

export interface GetCertificatesResponse extends CertificatesResponse {
  // Inherits from shared CertificatesResponse
}

// ============================================================================
// CACHE API
// ============================================================================

// GET /api/cache/stats
export interface GetCacheStatsRequest {
  // No request body needed
}

export interface GetCacheStatsResponse {
  success: boolean;
  data?: CacheData;
  error?: string;
}

// GET /api/cache/entries
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

// POST /api/cache/clear
export interface ClearCacheRequest {
  // No request body needed
}

export interface ClearCacheResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// DELETE /api/cache/delete/:key
export interface DeleteCacheEntryRequest {
  // No request body needed, key is in URL
}

export interface DeleteCacheEntryResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// OAUTH API
// ============================================================================

// GET /oauth/session
export interface GetOAuthSessionRequest {
  // No request body needed
}

export interface GetOAuthSessionResponse extends OAuthSessionResponse {
  // Inherits from shared OAuthSessionResponse
}

// POST /oauth/logout
export interface LogoutRequest {
  // No request body needed
}

export interface LogoutResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// HEALTH API
// ============================================================================

// GET /health
export interface HealthRequest {
  // No request body needed
}

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

// WebSocket message types for client-server communication
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
// GENERIC API TYPES
// ============================================================================

// Generic error response for all endpoints
export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
}

// Generic success response for simple operations
export interface ApiSuccessResponse {
  success: true;
  message?: string;
}

// Pagination types for endpoints that support it
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
// API ENDPOINT MAPPINGS
// ============================================================================

// Type mapping for easy lookup of request/response types by endpoint
export interface ApiEndpointTypes {
  // Status
  'GET /api/status': {
    request: StatusRequest;
    response: StatusResponse;
  };

  // Configuration
  'GET /api/config/:type': {
    request: GetConfigRequest;
    response: GetConfigResponse;
  };
  'POST /api/config/:type/save': {
    request: SaveConfigRequest;
    response: SaveConfigResponse;
  };
  'POST /api/config/:type/backup': {
    request: CreateBackupRequest;
    response: CreateBackupResponse;
  };
  'GET /api/config/:type/backups': {
    request: GetBackupsRequest;
    response: GetBackupsResponse;
  };
  'POST /api/config/:type/restore': {
    request: RestoreBackupApiRequest;
    response: RestoreBackupResponse;
  };
  'POST /api/config/validate': {
    request: ValidateConfigRequest;
    response: ValidateConfigResponse;
  };

  // Statistics
  'GET /api/statistics': {
    request: GetStatisticsRequest;
    response: GetStatisticsResponse;
  };
  'GET /api/statistics/detailed': {
    request: GetDetailedStatisticsRequest;
    response: GetDetailedStatisticsResponse;
  };
  'GET /api/statistics/summary': {
    request: GetStatisticsSummaryRequest;
    response: GetStatisticsSummaryResponse;
  };
  'POST /api/statistics/generate-report': {
    request: GenerateReportRequest;
    response: GenerateReportResponse;
  };

  // Processes
  'GET /api/processes': {
    request: GetProcessesRequest;
    response: GetProcessesResponse;
  };
  'POST /api/processes/reload': {
    request: ReloadProcessesRequest;
    response: ReloadProcessesResponse;
  };
  'POST /api/processes/:id/start': {
    request: StartProcessRequest;
    response: StartProcessResponse;
  };
  'POST /api/processes/:id/stop': {
    request: StopProcessRequest;
    response: StopProcessResponse;
  };
  'POST /api/processes/:id/restart': {
    request: RestartProcessRequest;
    response: RestartProcessResponse;
  };
  'GET /api/processes/:id/logs': {
    request: GetProcessLogsRequest;
    response: GetProcessLogsResponse;
  };
  'GET /api/processes/config': {
    request: GetProcessConfigRequest;
    response: GetProcessConfigResponse;
  };
  'PUT /api/processes/config': {
    request: UpdateProcessConfigRequest;
    response: UpdateProcessConfigResponse;
  };

  // Certificates
  'GET /api/certificates': {
    request: GetCertificatesRequest;
    response: GetCertificatesResponse;
  };

  // Cache
  'GET /api/cache/stats': {
    request: GetCacheStatsRequest;
    response: GetCacheStatsResponse;
  };
  'GET /api/cache/entries': {
    request: GetCacheEntriesRequest;
    response: GetCacheEntriesResponse;
  };
  'POST /api/cache/clear': {
    request: ClearCacheRequest;
    response: ClearCacheResponse;
  };
  'DELETE /api/cache/delete/:key': {
    request: DeleteCacheEntryRequest;
    response: DeleteCacheEntryResponse;
  };

  // OAuth
  'GET /oauth/session': {
    request: GetOAuthSessionRequest;
    response: GetOAuthSessionResponse;
  };
  'POST /oauth/logout': {
    request: LogoutRequest;
    response: LogoutResponse;
  };

  // Health
  'GET /health': {
    request: HealthRequest;
    response: HealthResponse;
  };
}

// Helper type to extract request/response types for a given endpoint
export type ApiRequest<T extends keyof ApiEndpointTypes> = ApiEndpointTypes[T]['request'];
export type ApiResponse<T extends keyof ApiEndpointTypes> = ApiEndpointTypes[T]['response']; 