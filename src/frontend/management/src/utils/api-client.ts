// API Types for Management Console
// Provides type definitions for all API endpoints

// Re-export all API types for easy access
export type {
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

  // Processes API types
  GetProcessesResponse,
  ReloadProcessesResponse,
  StartProcessResponse,
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
export const API_BASE = ''; // Relative to current domain

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