export interface ProxyRoute {
  domain: string;
  target: string;
  ssl?: boolean;
  headers?: Record<string, string>;
  rewrite?: Record<string, string>;
  path?: string;
  type?: 'proxy' | 'static' | 'redirect';
  staticPath?: string;
  redirectTo?: string;
  spaFallback?: boolean;
  csp?: CSPConfig;
}

export interface ServerConfig {
  port: number;
  httpsPort: number;
  routes: ProxyRoute[];
  letsEncrypt: {
    email: string;
    staging: boolean;
    certDir: string;
  };
  logging: {
    level: string;
    file?: string;
  };
  security: {
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    csp?: CSPConfig;
    routeCSP?: RouteCSPConfig[];
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