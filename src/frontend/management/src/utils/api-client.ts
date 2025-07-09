// Typed API Client for Management Console
// Provides type-safe fetch functions for all API endpoints

import {
  ApiEndpointTypes,
  ApiRequest,
  ApiResponse,
  ApiErrorResponse,
  ApiSuccessResponse
} from '../types';

// Base API configuration
const API_BASE = ''; // Relative to current domain

// Generic typed fetch function
async function typedFetch<T extends keyof ApiEndpointTypes>(
  endpoint: T,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: ApiRequest<T>;
    query?: Record<string, string>;
  } = {}
): Promise<ApiResponse<T>> {
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
    return data as ApiResponse<T>;
  } catch (error) {
    console.error(`API call failed for ${endpoint}:`, error);
    throw error;
  }
}

// ============================================================================
// STATUS API
// ============================================================================

export const statusApi = {
  getStatus: () => typedFetch('GET /api/status'),
};

// ============================================================================
// CONFIGURATION API
// ============================================================================

export const configApi = {
  getConfig: (type: 'proxy' | 'processes' | 'main') =>
    typedFetch('GET /api/config/:type', { query: { type } }),

  saveConfig: (type: 'proxy' | 'processes' | 'main', data: ApiRequest<'POST /api/config/:type/save'>) =>
    typedFetch('POST /api/config/:type/save', {
      method: 'POST',
      body: data,
      query: { type }
    }),

  createBackup: (type: 'proxy' | 'processes' | 'main') =>
    typedFetch('POST /api/config/:type/backup', {
      method: 'POST',
      query: { type }
    }),

  getBackups: (type: 'proxy' | 'processes' | 'main') =>
    typedFetch('GET /api/config/:type/backups', { query: { type } }),

  restoreBackup: (type: 'proxy' | 'processes' | 'main', data: ApiRequest<'POST /api/config/:type/restore'>) =>
    typedFetch('POST /api/config/:type/restore', {
      method: 'POST',
      body: data,
      query: { type }
    }),

  validateConfig: (data: ApiRequest<'POST /api/config/validate'>) =>
    typedFetch('POST /api/config/validate', { method: 'POST', body: data }),
};

// ============================================================================
// STATISTICS API
// ============================================================================

export const statisticsApi = {
  getStatistics: () => typedFetch('GET /api/statistics'),

  getDetailedStatistics: (period?: string) =>
    typedFetch('GET /api/statistics/detailed', { query: period ? { period } : {} }),

  getStatisticsSummary: () => typedFetch('GET /api/statistics/summary'),

  generateReport: () => typedFetch('POST /api/statistics/generate-report', { method: 'POST' }),
};

// ============================================================================
// PROCESSES API
// ============================================================================

export const processesApi = {
  getProcesses: () => typedFetch('GET /api/processes'),

  reloadProcesses: () => typedFetch('POST /api/processes/reload', { method: 'POST' }),

  startProcess: (id: string) =>
    typedFetch('POST /api/processes/:id/start', {
      method: 'POST',
      query: { id }
    }),

  stopProcess: (id: string) =>
    typedFetch('POST /api/processes/:id/stop', {
      method: 'POST',
      query: { id }
    }),

  restartProcess: (id: string) =>
    typedFetch('POST /api/processes/:id/restart', {
      method: 'POST',
      query: { id }
    }),

  getProcessLogs: (id: string, lines?: string) =>
    typedFetch('GET /api/processes/:id/logs', {
      query: { id, ...(lines ? { lines } : {}) }
    }),

  getProcessConfig: () => typedFetch('GET /api/processes/config'),

  updateProcessConfig: (data: ApiRequest<'PUT /api/processes/config'>) =>
    typedFetch('PUT /api/processes/config', { method: 'PUT', body: data }),
};

// ============================================================================
// CERTIFICATES API
// ============================================================================

export const certificatesApi = {
  getCertificates: () => typedFetch('GET /api/certificates'),
};

// ============================================================================
// CACHE API
// ============================================================================

export const cacheApi = {
  getCacheStats: () => typedFetch('GET /api/cache/stats'),

  getCacheEntries: (params?: {
    page?: string;
    limit?: string;
    userId?: string;
    inMRU?: string;
  }) => typedFetch('GET /api/cache/entries', { query: params }),

  clearCache: () => typedFetch('POST /api/cache/clear', { method: 'POST' }),

  deleteCacheEntry: (key: string) =>
    typedFetch('DELETE /api/cache/delete/:key', {
      method: 'DELETE',
      query: { key }
    }),
};

// ============================================================================
// OAUTH API
// ============================================================================

export const oauthApi = {
  getSession: () => typedFetch('GET /oauth/session'),

  logout: () => typedFetch('POST /oauth/logout', { method: 'POST' }),
};

// ============================================================================
// HEALTH API
// ============================================================================

export const healthApi = {
  getHealth: () => typedFetch('GET /health'),
};

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

// Helper function to handle API responses with error checking
export async function handleApiResponse<T extends keyof ApiEndpointTypes>(
  apiCall: Promise<ApiResponse<T>>
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
export async function handleApiSuccess<T extends keyof ApiEndpointTypes>(
  apiCall: Promise<ApiResponse<T>>
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
  return function sendMessage<T extends keyof ApiEndpointTypes>(
    message: ApiRequest<T>
  ) {
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