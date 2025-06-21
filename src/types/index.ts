export interface ProcessConfig {
  enabled?: boolean;
  name?: string; // Human-readable name for the process
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
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
  domain: string;
  target?: string; // Optional since cors-forwarder routes get target from request
  ssl?: boolean;
  path?: string;
  type?: 'proxy' | 'static' | 'redirect' | 'cors-forwarder';
  staticPath?: string;
  redirectTo?: string;
  rewrite?: Record<string, string>;
  headers?: Record<string, string>;
  cors?: CORSConfig;
  oauth2?: OAuth2Config;
  requireAuth?: boolean;
  publicPaths?: string[];
  spaFallback?: boolean;
  geolocationFilter?: GeolocationFilter;
  csp?: CSPConfig;
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

export interface ServerConfig {
  port: number;
  httpsPort: number;
  routes: ProxyRoute[];
  processConfigFile?: string;
  processManagement?: ProcessManagementConfig;
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
  };
}

export interface CertificateInfo {
  domain: string;
  certPath: string;
  keyPath: string;
  expiresAt: Date;
  isValid: boolean;
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
  tokenEndpoint: string;
  callbackUrl: string;
  scopes?: string[];
  state?: string;
  pkce?: boolean;
  additionalParams?: Record<string, string>;
  subscriptionKey?: string;
  subscriptionKeyHeader?: string; // Required if subscriptionKey is provided
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
  expiresAt?: Date;
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