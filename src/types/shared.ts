// Shared types between frontend and backend
// This file contains types that are used by both frontend and backend

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

// WebSocket message type
export interface WebSocketMessage {
  type: 'processes' | 'processes_update' | 'status' | 'logs' | 'logs_update' | 'error' | 'pong';
  data: any;
  timestamp: string;
}

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

// Status data type
export interface StatusData {
  httpPort: number;
  httpsPort: number;
  routes: number;
  certificates: any;
  processes: Process[];
  statistics: any;
  cache: any;
  uptime: number;
  memory: any;
  timestamp: string;
}

// Frontend-specific types
export type TabType = 'processes' | 'statistics' | 'certificates' | 'cache' | 'config';
export type LogFilter = 'all' | 'stdout' | 'stderr';
export type NotificationType = 'success' | 'error' | 'warning' | 'info'; 