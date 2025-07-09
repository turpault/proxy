// Typed API Client for Management Console
// Provides type-safe fetch functions for all API endpoints

import {
  // Status API types
  StatusResponse,

  // Configuration API types
  GetConfigRequest, GetConfigResponse,
  SaveConfigRequest, SaveConfigResponse,
  CreateBackupResponse,
  GetBackupsResponse,
  RestoreBackupApiRequest, RestoreBackupResponse,
  ValidateConfigRequest, ValidateConfigResponse,

  // Statistics API types
  GetStatisticsResponse,
  GetDetailedStatisticsRequest, GetDetailedStatisticsResponse,
  GetStatisticsSummaryResponse,
  GenerateReportResponse,

  // Processes API types
  GetProcessesResponse,
  ReloadProcessesResponse,
  StartProcessResponse,
  StopProcessResponse,
  RestartProcessResponse,
  GetProcessLogsRequest, GetProcessLogsResponse,
  GetProcessConfigResponse,
  UpdateProcessConfigRequest, UpdateProcessConfigResponse,

  // Certificates API types
  GetCertificatesResponse,

  // Cache API types
  GetCacheStatsResponse,
  GetCacheEntriesRequest, GetCacheEntriesResponse,
  ClearCacheResponse,
  DeleteCacheEntryResponse,

  // OAuth API types
  GetOAuthSessionResponse,
  LogoutResponse,

  // Health API types
  HealthResponse,

  // Error types
  ApiErrorResponse,
  ApiSuccessResponse
} from '../types';

// Base API configuration
const API_BASE = ''; // Relative to current domain

// Generic fetch function for internal use
async function fetchApi<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    query?: Record<string, string>;
  } = {}
): Promise<T> {
  const { method = 'GET', body, query } = options;

  // Build URL with query parameters
  let url = `${API_BASE}${endpoint}`;
  if (query) {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value);
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Prepare fetch options
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Add body for non-GET requests
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error(`API call failed for ${endpoint}:`, error);
    throw error;
  }
}

// ============================================================================
// STATUS API
// ============================================================================

export const statusApi = {
  getStatus: (): Promise<StatusResponse> =>
    fetchApi<StatusResponse>('/api/status'),
};

// ============================================================================
// CONFIGURATION API
// ============================================================================

export const configApi = {
  getConfig: (type: 'proxy' | 'processes' | 'main'): Promise<GetConfigResponse> =>
    fetchApi<GetConfigResponse>('/api/config/:type', { query: { type } }),

  saveConfig: (type: 'proxy' | 'processes' | 'main', data: SaveConfigRequest): Promise<SaveConfigResponse> =>
    fetchApi<SaveConfigResponse>('/api/config/:type/save', {
      method: 'POST',
      body: data,
      query: { type }
    }),

  createBackup: (type: 'proxy' | 'processes' | 'main'): Promise<CreateBackupResponse> =>
    fetchApi<CreateBackupResponse>('/api/config/:type/backup', {
      method: 'POST',
      query: { type }
    }),

  getBackups: (type: 'proxy' | 'processes' | 'main'): Promise<GetBackupsResponse> =>
    fetchApi<GetBackupsResponse>('/api/config/:type/backups', { query: { type } }),

  restoreBackup: (type: 'proxy' | 'processes' | 'main', data: RestoreBackupApiRequest): Promise<RestoreBackupResponse> =>
    fetchApi<RestoreBackupResponse>('/api/config/:type/restore', {
      method: 'POST',
      body: data,
      query: { type }
    }),

  validateConfig: (data: ValidateConfigRequest): Promise<ValidateConfigResponse> =>
    fetchApi<ValidateConfigResponse>('/api/config/validate', { method: 'POST', body: data }),
};

// ============================================================================
// STATISTICS API
// ============================================================================

export const statisticsApi = {
  getStatistics: (): Promise<GetStatisticsResponse> =>
    fetchApi<GetStatisticsResponse>('/api/statistics'),

  getDetailedStatistics: (period?: string): Promise<GetDetailedStatisticsResponse> =>
    fetchApi<GetDetailedStatisticsResponse>('/api/statistics/detailed', {
      query: period ? { period } : {}
    }),

  getStatisticsSummary: (): Promise<GetStatisticsSummaryResponse> =>
    fetchApi<GetStatisticsSummaryResponse>('/api/statistics/summary'),

  generateReport: (): Promise<GenerateReportResponse> =>
    fetchApi<GenerateReportResponse>('/api/statistics/generate-report', { method: 'POST' }),
};

// ============================================================================
// PROCESSES API
// ============================================================================

export const processesApi = {
  getProcesses: (): Promise<GetProcessesResponse> =>
    fetchApi<GetProcessesResponse>('/api/processes'),

  reloadProcesses: (): Promise<ReloadProcessesResponse> =>
    fetchApi<ReloadProcessesResponse>('/api/processes/reload', { method: 'POST' }),

  startProcess: (id: string): Promise<StartProcessResponse> =>
    fetchApi<StartProcessResponse>('/api/processes/:id/start', {
      method: 'POST',
      query: { id }
    }),

  stopProcess: (id: string): Promise<StopProcessResponse> =>
    fetchApi<StopProcessResponse>('/api/processes/:id/stop', {
      method: 'POST',
      query: { id }
    }),

  restartProcess: (id: string): Promise<RestartProcessResponse> =>
    fetchApi<RestartProcessResponse>('/api/processes/:id/restart', {
      method: 'POST',
      query: { id }
    }),

  getProcessLogs: (id: string, lines?: string): Promise<GetProcessLogsResponse> =>
    fetchApi<GetProcessLogsResponse>('/api/processes/:id/logs', {
      query: { id, ...(lines ? { lines } : {}) }
    }),

  getProcessConfig: (): Promise<GetProcessConfigResponse> =>
    fetchApi<GetProcessConfigResponse>('/api/processes/config'),

  updateProcessConfig: (data: UpdateProcessConfigRequest): Promise<UpdateProcessConfigResponse> =>
    fetchApi<UpdateProcessConfigResponse>('/api/processes/config', { method: 'PUT', body: data }),
};

// ============================================================================
// CERTIFICATES API
// ============================================================================

export const certificatesApi = {
  getCertificates: (): Promise<GetCertificatesResponse> =>
    fetchApi<GetCertificatesResponse>('/api/certificates'),
};

// ============================================================================
// CACHE API
// ============================================================================

export const cacheApi = {
  getCacheStats: (): Promise<GetCacheStatsResponse> =>
    fetchApi<GetCacheStatsResponse>('/api/cache/stats'),

  getCacheEntries: (params?: {
    page?: string;
    limit?: string;
    userId?: string;
    inMRU?: string;
  }): Promise<GetCacheEntriesResponse> =>
    fetchApi<GetCacheEntriesResponse>('/api/cache/entries', { query: params }),

  clearCache: (): Promise<ClearCacheResponse> =>
    fetchApi<ClearCacheResponse>('/api/cache/clear', { method: 'POST' }),

  deleteCacheEntry: (key: string): Promise<DeleteCacheEntryResponse> =>
    fetchApi<DeleteCacheEntryResponse>('/api/cache/delete/:key', {
      method: 'DELETE',
      query: { key }
    }),
};

// ============================================================================
// OAUTH API
// ============================================================================

export const oauthApi = {
  getSession: (): Promise<GetOAuthSessionResponse> =>
    fetchApi<GetOAuthSessionResponse>('/oauth/session'),

  logout: (): Promise<LogoutResponse> =>
    fetchApi<LogoutResponse>('/oauth/logout', { method: 'POST' }),
};

// ============================================================================
// HEALTH API
// ============================================================================

export const healthApi = {
  getHealth: (): Promise<HealthResponse> =>
    fetchApi<HealthResponse>('/health'),
};

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

// Helper function to handle API responses with error checking
export async function handleApiResponse<T extends Record<string, any>>(
  apiCall: Promise<T>
): Promise<any> {
  try {
    const response = await apiCall;
    if ('success' in response && response.success && 'data' in response) {
      return response.data;
    } else if ('error' in response && typeof response.error === 'string') {
      throw new Error(response.error);
    } else {
      return response;
    }
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Helper function for simple success/failure operations
export async function handleApiSuccess<T extends Record<string, any>>(
  apiCall: Promise<T>
): Promise<boolean> {
  try {
    const response = await apiCall;
    return 'success' in response && typeof response.success === 'boolean' ? response.success : true;
  } catch (error) {
    console.error('API call failed:', error);
    return false;
  }
}

// ============================================================================
// WEBSOCKET UTILITIES
// ============================================================================

// WebSocket message sender with type safety
export function createWebSocketSender(ws: WebSocket) {
  return function sendMessage<T>(message: T) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not open');
    }
  };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Enhanced error handler for API calls
export function createApiErrorHandler() {
  return function handleApiError(error: any): never {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new ApiError(error.message);
    }

    throw new ApiError('Unknown API error');
  };
} 