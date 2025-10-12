import { BunRequest, Server } from 'bun';
import { GeolocationInfo } from '../services/geolocation';

// Re-export API types
export * from './api';


export interface BunRequestContext {
  method: string;
  url: string;
  pathname: string;
  headers: Record<string, string>;
  userAgent: string;
  body: any;
  query: Record<string, string>;
  ip: string;
  originalUrl: string;
  req: BunRequest;
  server: Server;
  geolocation: GeolocationInfo | null;
}
export interface ProcessConfig {
  enabled?: boolean;
  name?: string; // Human-readable name for the process
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  requiredEnv?: string[]; // List of required environment variables (can be from parent or custom env)
  envValidation?: {
    required?: string[]; // Required environment variables for this process
    optional?: string[]; // Optional environment variables to validate if present
    validateOnStart?: boolean; // Whether to validate environment variables on process start
    failOnMissing?: boolean; // Whether to fail process start if required env vars are missing
  };
  restartOnExit?: boolean;
  restartDelay?: number; // milliseconds
  maxRestarts?: number;
  pidFile?: string; // Path to write PID file
  pidDir?: string; // Directory to write PID files (alternative to pidFile)
  cleanupPidOnExit?: boolean; // Whether to remove PID file on process exit
  healthCheck?: {
    enabled?: boolean;
    path?: string;
    interval?: number; // milliseconds
    timeout?: number; // milliseconds
    retries?: number;
  };
  schedule?: {
    enabled?: boolean;
    cron?: string; // Cron expression (e.g., "0 2 * * *" for daily at 2 AM)
    timezone?: string; // Timezone (e.g., "America/New_York")
    maxDuration?: number; // Maximum runtime in milliseconds
    autoStop?: boolean; // Whether to automatically stop after maxDuration
    skipIfRunning?: boolean; // Skip if process is already running
  };
}

// New types for independent process management
export interface ProcessManagementConfig {
  processes: Record<string, ProcessConfig>;
  settings?: {
    defaultHealthCheck?: {
      enabled?: boolean;
      interval?: number;
      timeout?: number;
      retries?: number;
    };
    defaultRestart?: {
      restartOnExit?: boolean;
      restartDelay?: number;
      maxRestarts?: number;
    };
    pidManagement?: {
      defaultPidDir?: string;
      cleanupPidOnExit?: boolean;
    };
    logging?: {
      logProcessOutput?: boolean;
      logHealthChecks?: boolean;
      logRestarts?: boolean;
    };
  };
}

export interface ProxyRoute {
  name?: string; // Human-readable name for the route (used for statistics grouping)
  domain: string;
  target?: string; // Optional since cors-forwarder routes get target from request
  ssl?: boolean;
  path: string;
  type?: 'proxy' | 'static' | 'redirect' | 'cors-forwarder';
  staticPath?: string;
  redirectTo?: string;
  rewrite?: Record<string, string>;
  replace?: Record<string, string>;
  headers?: Record<string, string>;
  cors?: CORSConfig;
  oauth2?: OAuth2Config;
  oauthMiddleware?: (requestContext: BunRequestContext) => Promise<Response | null>;
  requireAuth?: boolean;
  publicPaths?: string[];
  spaFallback?: boolean;
  geolocationFilter?: GeolocationFilter;
  csp?: CSPConfig;
  websocket?: WebSocketConfig;
}

export interface WebSocketConfig {
  enabled?: boolean; // Enable WebSocket proxying for this route
  timeout?: number; // Connection timeout in milliseconds (default: 30000)
  pingInterval?: number; // Ping interval in milliseconds (default: 0, uses proper WebSocket ping frames)
  maxRetries?: number; // Maximum retry attempts for failed connections (default: 3)
  retryDelay?: number; // Delay between retry attempts in milliseconds (default: 1000)
}

export interface GeolocationFilter {
  enabled?: boolean;
  mode?: 'allow' | 'block'; // 'allow' = allowlist, 'block' = blocklist
  countries?: string[]; // ISO country codes (e.g., ['US', 'CA', 'GB'])
  regions?: string[]; // Region codes
  cities?: string[]; // City names
  customResponse?: {
    statusCode?: number;
    message?: string;
    redirectUrl?: string;
  };
  logBlocked?: boolean; // Whether to log blocked requests
}

export interface ProxyConfig {
  port: number;
  httpsPort: number;
  routes: ProxyRoute[];
  processConfigFile?: string;
  letsEncrypt: {
    email: string;
    staging: boolean;
    certDir: string;
  };
  logging?: {
    level: string;
    file?: string;
  };
  security?: {
    rateLimitWindowMs?: number;
    rateLimitMaxRequests?: number;
    csp?: CSPConfig;
    routeCSP?: Array<{
      path: string;
      csp: CSPConfig;
    }>;
    geolocationFilter?: GeolocationFilter;
  };
}

// Re-export shared types
export * from './shared';

// Backend-specific CertificateInfo with Date type
export interface CertificateInfoBackend {
  domain: string;
  certPath: string;
  keyPath: string;
  expiresAt: Date;
  isValid: boolean;
  issuer?: string;
}

export interface ProxyOptions {
  target: string;
  changeOrigin: boolean;
  secure: boolean;
  headers?: Record<string, string>;
  onError?: (err: Error, req: any, res: any) => void;
  onProxyRes?: (proxyRes: any, req: any, res: any) => void;
  pathRewrite?: Record<string, string>;
}

export interface LetsEncryptOptions {
  email: string;
  staging: boolean;
  certDir: string;
  domains: string[];
}

export interface CSPDirectives {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  connectSrc?: string[];
  fontSrc?: string[];
  objectSrc?: string[];
  mediaSrc?: string[];
  frameSrc?: string[];
  childSrc?: string[];
  workerSrc?: string[];
  manifestSrc?: string[];
  prefetchSrc?: string[];
  navigateTo?: string[];
  formAction?: string[];
  frameAncestors?: string[];
  baseUri?: string[];
  pluginTypes?: string[];
  sandbox?: string[];
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
}

export interface CSPConfig {
  enabled?: boolean;
  reportOnly?: boolean;
  directives?: CSPDirectives;
  reportUri?: string;
}

export interface RouteCSPConfig {
  path?: string;
  csp?: CSPConfig;
}

export interface OAuth2Config {
  enabled?: boolean;
  provider: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  relativePath?: string;
  tokenEndpoint: string;
  callbackUrl: string;
  scopes?: string[];
  state?: string;
  pkce?: boolean;
  additionalParams?: Record<string, string>;
  subscriptionKey?: string;
  subscriptionKeyHeader?: string; // Required if subscriptionKey is provided
  // Custom endpoint paths
  callbackRedirectEndpoint?: string; // Endpoint to redirect after successful callback (default: /)
  // Session management
  sessionDomain?: string; // Custom session domain (defaults to route domain)
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuth2Session {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO string for serialization
  tokenType: string;
  scope?: string;
  user?: any;
}

export interface CORSConfig {
  enabled?: boolean;
  origin?: boolean | string | string[];
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

export interface DynamicCorsProxyConfig {
  enabled: boolean;
  path: string;
  allowedDomains: string[];
  httpsOnly?: boolean;
  cors?: CORSConfig;
  timeouts?: {
    request?: number;
    proxy?: number;
  };
  logging?: {
    logRequests?: boolean;
    logBlocked?: boolean;
    logErrors?: boolean;
  };
}

export interface MainConfig {
  management: ManagementConfig;
  config: ConfigReferences;
  settings: GlobalSettings;
  development?: DevelopmentSettings;
}

export interface ManagementConfig {
  port: number;
  host?: string;
  adminPassword?: string;
  sessionTimeout?: number;
  cors?: {
    enabled?: boolean;
    origin?: string | string[];
    credentials?: boolean;
  };
}

export interface ConfigReferences {
  proxy: string;
  processes: string;
}

export interface GlobalSettings {
  dataDir?: string;
  logsDir?: string;
  certificatesDir?: string;
  tempDir?: string;
  statsDir?: string;
  cacheDir?: string;
  backupDir?: string;
  statistics?: {
    enabled?: boolean;
    backupInterval?: number;
    retentionDays?: number;
  };
  cache?: {
    enabled?: boolean;
    maxAge?: number;
    maxSize?: string;
    cleanupInterval?: number;
  };
  networkMonitoring?: {
    enabled?: boolean; // default: true
    interval?: number; // default: 30000ms (30 seconds)
    endpoint?: string; // default: "1.1.1.1"
    timeout?: number; // default: 5000ms
  };
}

export interface DevelopmentSettings {
  debug?: boolean;
  verbose?: boolean;
  hotReload?: boolean;
}





