// Core types for the management console

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

// Statistics API Types
export interface StatisticsSummary {
  totalRequests: number;
  uniqueIPs: number;
  uniqueCountries: number;
  cacheSize: number;
  lastSaved?: string;
  dataFileSize?: number;
}

export interface RouteStatistics {
  name?: string;
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
  requestType?: string;
  uniquePaths?: string[];
}

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

export interface StatisticsResponse {
  success: boolean;
  data: StatisticsSummary;
}

export interface DetailedStatisticsResponse {
  success: boolean;
  data: DetailedStatistics;
}

export interface WebSocketMessage {
  type: 'processes' | 'processes_update' | 'status' | 'logs' | 'logs_update' | 'error' | 'pong';
  data: any;
  timestamp: string;
}

export interface LogLine {
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp?: string;
}

export interface ConfigData {
  content: string;
  path: string;
  lastModified: string;
}

export interface ConfigResponse {
  success: boolean;
  data?: ConfigData;
  error?: string;
}

export interface BackupItem {
  name: string;
  path: string;
  size: number;
  lastModified: string;
}

export interface BackupResponse {
  success: boolean;
  data?: BackupItem[];
  error?: string;
}

export interface SaveConfigRequest {
  content: string;
  createBackup: boolean;
}

export interface RestoreBackupRequest {
  backupPath: string;
}

export interface ValidationStatus {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

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

export type TabType = 'processes' | 'statistics' | 'certificates' | 'cache' | 'config';
export type LogFilter = 'all' | 'stdout' | 'stderr';
export type NotificationType = 'success' | 'error' | 'warning' | 'info'; 