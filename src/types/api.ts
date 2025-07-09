// API Request and Response Types for Management Console
// This file re-exports types from shared.ts and provides the ApiEndpointTypes mapping

// Import types from shared
import {
  EmptyRequest,
  StatusResponse,
  GetConfigRequest,
  GetConfigResponse,
  SaveConfigRequest,
  SaveConfigResponse,
  CreateBackupResponse,
  GetBackupsResponse,
  RestoreBackupApiRequest,
  RestoreBackupResponse,
  ValidateConfigRequest,
  ValidateConfigResponse,
  GetStatisticsResponse,
  GetDetailedStatisticsRequest,
  GetDetailedStatisticsResponse,
  GetStatisticsSummaryResponse,
  GenerateReportResponse,
  GetProcessesResponse,
  ReloadProcessesResponse,
  StartProcessResponse,
  StopProcessResponse,
  RestartProcessResponse,
  GetProcessLogsRequest,
  GetProcessLogsResponse,
  GetProcessConfigResponse,
  UpdateProcessConfigRequest,
  UpdateProcessConfigResponse,
  GetCertificatesResponse,
  GetCacheStatsResponse,
  GetCacheEntriesRequest,
  GetCacheEntriesResponse,
  ClearCacheResponse,
  DeleteCacheEntryResponse,
  GetOAuthSessionResponse,
  LogoutResponse,
  HealthResponse
} from './shared';

// Re-export all types from shared
export * from './shared';

// ============================================================================
// API ENDPOINT TYPES MAPPING (for backward compatibility)
// ============================================================================

export interface ApiEndpointTypes {
  // Status
  'GET /api/status': {
    request: EmptyRequest;
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
    request: EmptyRequest;
    response: CreateBackupResponse;
  };
  'GET /api/config/:type/backups': {
    request: EmptyRequest;
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
    request: EmptyRequest;
    response: GetStatisticsResponse;
  };
  'GET /api/statistics/detailed': {
    request: GetDetailedStatisticsRequest;
    response: GetDetailedStatisticsResponse;
  };
  'GET /api/statistics/summary': {
    request: EmptyRequest;
    response: GetStatisticsSummaryResponse;
  };
  'POST /api/statistics/generate-report': {
    request: EmptyRequest;
    response: GenerateReportResponse;
  };

  // Processes
  'GET /api/processes': {
    request: EmptyRequest;
    response: GetProcessesResponse;
  };
  'POST /api/processes/reload': {
    request: EmptyRequest;
    response: ReloadProcessesResponse;
  };
  'POST /api/processes/:id/start': {
    request: EmptyRequest;
    response: StartProcessResponse;
  };
  'POST /api/processes/:id/stop': {
    request: EmptyRequest;
    response: StopProcessResponse;
  };
  'POST /api/processes/:id/restart': {
    request: EmptyRequest;
    response: RestartProcessResponse;
  };
  'GET /api/processes/:id/logs': {
    request: GetProcessLogsRequest;
    response: GetProcessLogsResponse;
  };
  'GET /api/processes/config': {
    request: EmptyRequest;
    response: GetProcessConfigResponse;
  };
  'PUT /api/processes/config': {
    request: UpdateProcessConfigRequest;
    response: UpdateProcessConfigResponse;
  };

  // Certificates
  'GET /api/certificates': {
    request: EmptyRequest;
    response: GetCertificatesResponse;
  };

  // Cache
  'GET /api/cache/stats': {
    request: EmptyRequest;
    response: GetCacheStatsResponse;
  };
  'GET /api/cache/entries': {
    request: GetCacheEntriesRequest;
    response: GetCacheEntriesResponse;
  };
  'POST /api/cache/clear': {
    request: EmptyRequest;
    response: ClearCacheResponse;
  };
  'DELETE /api/cache/delete/:key': {
    request: EmptyRequest;
    response: DeleteCacheEntryResponse;
  };

  // OAuth
  'GET /oauth/session': {
    request: EmptyRequest;
    response: GetOAuthSessionResponse;
  };
  'POST /oauth/logout': {
    request: EmptyRequest;
    response: LogoutResponse;
  };

  // Health
  'GET /health': {
    request: EmptyRequest;
    response: HealthResponse;
  };
}

// ============================================================================
// UTILITY TYPES (for backward compatibility)
// ============================================================================

export type ApiRequest<T extends keyof ApiEndpointTypes> = ApiEndpointTypes[T]['request'];
export type ApiResponse<T extends keyof ApiEndpointTypes> = ApiEndpointTypes[T]['response']; 