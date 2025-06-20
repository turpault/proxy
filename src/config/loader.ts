import * as fs from 'fs-extra';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import Joi from 'joi';
import { ServerConfig, ProcessManagementConfig } from '../types';
import { logger } from '../utils/logger';

// CSP Directive validation schema
const cspDirectivesSchema = Joi.object({
  defaultSrc: Joi.array().items(Joi.string()).optional(),
  scriptSrc: Joi.array().items(Joi.string()).optional(),
  styleSrc: Joi.array().items(Joi.string()).optional(),
  imgSrc: Joi.array().items(Joi.string()).optional(),
  connectSrc: Joi.array().items(Joi.string()).optional(),
  fontSrc: Joi.array().items(Joi.string()).optional(),
  objectSrc: Joi.array().items(Joi.string()).optional(),
  mediaSrc: Joi.array().items(Joi.string()).optional(),
  frameSrc: Joi.array().items(Joi.string()).optional(),
  childSrc: Joi.array().items(Joi.string()).optional(),
  workerSrc: Joi.array().items(Joi.string()).optional(),
  manifestSrc: Joi.array().items(Joi.string()).optional(),
  prefetchSrc: Joi.array().items(Joi.string()).optional(),
  navigateTo: Joi.array().items(Joi.string()).optional(),
  formAction: Joi.array().items(Joi.string()).optional(),
  frameAncestors: Joi.array().items(Joi.string()).optional(),
  baseUri: Joi.array().items(Joi.string()).optional(),
  pluginTypes: Joi.array().items(Joi.string()).optional(),
  sandbox: Joi.array().items(Joi.string()).optional(),
  upgradeInsecureRequests: Joi.boolean().optional(),
  blockAllMixedContent: Joi.boolean().optional(),
});

// CSP Configuration schema
const cspConfigSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  reportOnly: Joi.boolean().default(false),
  directives: cspDirectivesSchema.optional(),
  reportUri: Joi.string().optional(),
});

// OAuth2 Configuration schema
const oauth2ConfigSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  provider: Joi.string().required(),
  clientId: Joi.string().required(),
  clientSecret: Joi.string().required(),
  authorizationEndpoint: Joi.string().uri().required(),
  tokenEndpoint: Joi.string().uri().required(),
  callbackUrl: Joi.string().uri().required(),
  scopes: Joi.array().items(Joi.string()).optional(),
  state: Joi.string().optional(),
  pkce: Joi.boolean().default(false),
  additionalParams: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
  subscriptionKey: Joi.string().optional(),
  subscriptionKeyHeader: Joi.string().optional(),
});

// Process Configuration schema
const processConfigSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  name: Joi.string().optional(),
  command: Joi.string().required(),
  args: Joi.array().items(Joi.string()).optional(),
  cwd: Joi.string().optional(),
  env: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
  restartOnExit: Joi.boolean().default(true),
  restartDelay: Joi.number().default(1000),
  maxRestarts: Joi.number().default(5),
  pidFile: Joi.string().optional(),
  pidDir: Joi.string().optional(),
  cleanupPidOnExit: Joi.boolean().default(true),
  healthCheck: Joi.object({
    enabled: Joi.boolean().default(false),
    path: Joi.string().default('/health'), // Can be a full URL (http://localhost:8888/health) or relative path (/health)
    interval: Joi.number().default(30000),
    timeout: Joi.number().default(5000),
    retries: Joi.number().default(3),
  }).optional(),
});

// Geolocation Filter Configuration schema
const geolocationFilterSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  mode: Joi.string().valid('allow', 'block').default('block'),
  countries: Joi.array().items(Joi.string()).optional(),
  regions: Joi.array().items(Joi.string()).optional(),
  cities: Joi.array().items(Joi.string()).optional(),
  customResponse: Joi.object({
    statusCode: Joi.number().min(100).max(599).optional(),
    message: Joi.string().optional(),
    redirectUrl: Joi.string().uri().optional(),
  }).optional(),
  logBlocked: Joi.boolean().default(true),
});

// CORS Configuration schema
const corsConfigSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  origin: Joi.alternatives().try(
    Joi.boolean(),
    Joi.string(),
    Joi.array().items(Joi.string())
  ).default(true),
  methods: Joi.array().items(Joi.string()).default(['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']),
  allowedHeaders: Joi.array().items(Joi.string()).optional(),
  exposedHeaders: Joi.array().items(Joi.string()).optional(),
  credentials: Joi.boolean().default(false),
  maxAge: Joi.number().optional(),
  preflightContinue: Joi.boolean().default(false),
  optionsSuccessStatus: Joi.number().default(204),
});

// Dynamic CORS Proxy Configuration schema
const dynamicTargetSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  allowedDomains: Joi.array().items(Joi.string()).required(),
  httpsOnly: Joi.boolean().default(true),
  urlParameter: Joi.string().default('url'),
  timeouts: Joi.object({
    request: Joi.number().default(30000),
    proxy: Joi.number().default(30000),
  }).optional(),
  logging: Joi.object({
    logRequests: Joi.boolean().default(true),
    logBlocked: Joi.boolean().default(true),
    logErrors: Joi.boolean().default(true),
  }).optional(),
});

// Process Management Configuration schema
const processManagementConfigSchema = Joi.object({
  processes: Joi.object().pattern(Joi.string(), processConfigSchema).required(),
  settings: Joi.object({
    defaultHealthCheck: Joi.object({
      enabled: Joi.boolean().default(true),
      interval: Joi.number().default(30000),
      timeout: Joi.number().default(5000),
      retries: Joi.number().default(3),
    }).optional(),
    defaultRestart: Joi.object({
      restartOnExit: Joi.boolean().default(true),
      restartDelay: Joi.number().default(2000),
      maxRestarts: Joi.number().default(10),
    }).optional(),
    pidManagement: Joi.object({
      defaultPidDir: Joi.string().default('./pids'),
      cleanupPidOnExit: Joi.boolean().default(true),
    }).optional(),
    logging: Joi.object({
      logProcessOutput: Joi.boolean().default(true),
      logHealthChecks: Joi.boolean().default(false),
      logRestarts: Joi.boolean().default(true),
    }).optional(),
  }).optional(),
});

const configSchema = Joi.object({
  port: Joi.number().default(80),
  httpsPort: Joi.number().default(443),
  routes: Joi.array().items(
    Joi.object({
      domain: Joi.string().required(),
      target: Joi.string().when('type', {
        is: Joi.valid('proxy'),
        then: Joi.string().uri().required(),
        otherwise: Joi.string().optional()
      }),
      ssl: Joi.boolean().default(true),
      headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      rewrite: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      path: Joi.string().optional(),
      type: Joi.string().valid('proxy', 'static', 'redirect').default('proxy'),
      staticPath: Joi.string().when('type', {
        is: 'static',
        then: Joi.string().required(),
        otherwise: Joi.string().optional()
      }),
      redirectTo: Joi.string().when('type', {
        is: 'redirect',
        then: Joi.string().required(),
        otherwise: Joi.string().optional()
      }),
      spaFallback: Joi.boolean().default(false),
      csp: cspConfigSchema.optional(),
      oauth2: oauth2ConfigSchema.optional(),
      requireAuth: Joi.boolean().default(false),
      publicPaths: Joi.array().items(Joi.string()).optional(),
      geolocationFilter: geolocationFilterSchema.optional(),
      cors: Joi.alternatives().try(
        Joi.boolean(),
        corsConfigSchema
      ).optional(),
      dynamicTarget: dynamicTargetSchema.optional(),
    })
  ).required(),
  letsEncrypt: Joi.object({
    email: Joi.string().email().required(),
    staging: Joi.boolean().default(false),
    certDir: Joi.string().default('./certificates'),
  }).required(),
  logging: Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'http', 'debug').default('info'),
    file: Joi.string().optional(),
  }).default({
    level: 'info',
  }),
  security: Joi.object({
    rateLimitWindowMs: Joi.number().default(900000), // 15 minutes
    rateLimitMaxRequests: Joi.number().default(100),
    csp: cspConfigSchema.optional(),
    routeCSP: Joi.array().items(
      Joi.object({
        path: Joi.string().optional(),
        csp: cspConfigSchema.required(),
      })
    ).optional(),
    geolocationFilter: geolocationFilterSchema.optional(),
  }).default({
    rateLimitWindowMs: 900000,
    rateLimitMaxRequests: 100,
  }),
  dynamicTarget: dynamicTargetSchema.optional(),
});

export class ConfigLoader {
  static async load(configPath?: string): Promise<ServerConfig> {
    const configFile = configPath || process.env.CONFIG_FILE || './config/proxy.yaml';
    
    try {
      logger.info(`Loading configuration from ${configFile}`);
      
      // Check if config file exists
      const configExists = await fs.pathExists(configFile);
      if (!configExists) {
        throw new Error(`Configuration file not found: ${configFile}`);
      }

      // Read and parse YAML config
      const configContent = await fs.readFile(configFile, 'utf8');
      const rawConfig = parseYaml(configContent);

      // Load process management configuration if specified
      if (rawConfig.processConfigFile) {
        // Resolve the process config file path more robustly
        let processConfigPath: string;
        if (path.isAbsolute(rawConfig.processConfigFile)) {
          processConfigPath = rawConfig.processConfigFile;
        } else {
          // Resolve relative to the main config file directory
          processConfigPath = path.resolve(path.dirname(configFile), rawConfig.processConfigFile);
        }
        
        try {
          const processConfigContent = await fs.readFile(processConfigPath, 'utf8');
          const processConfig = parseYaml(processConfigContent);
          
          // Validate process management configuration
          const { error: processError } = processManagementConfigSchema.validate(processConfig);
          if (processError) {
            throw new Error(`Process management configuration validation failed: ${processError.message}`);
          }
          
          // Store process configuration in the main config for access by the process manager
          rawConfig.processManagement = processConfig;
          logger.info(`Loaded process management configuration from ${processConfigPath}`);
        } catch (error) {
          logger.warn(`Failed to load process management configuration from ${processConfigPath}: ${error}`);
          // Continue without process management if the file doesn't exist or is invalid
        }
      }

      // Merge with environment variables
      const config = this.mergeWithEnv(rawConfig);

      // Check for unresolved environment variables in OAuth2 configs
      this.validateOAuth2EnvironmentVariables(config);

      // Validate configuration
      const { error, value } = configSchema.validate(config, {
        abortEarly: false,
        allowUnknown: false,
      });

      if (error) {
        const errorMessages = error.details.map(detail => detail.message).join(', ');
        throw new Error(`Configuration validation failed: ${errorMessages}`);
      }

      logger.info('Configuration loaded successfully', {
        routes: value.routes.length,
        letsEncryptStaging: value.letsEncrypt.staging,
      });

      return value as ServerConfig;
    } catch (error) {
      logger.error(`Failed to load configuration from ${configFile}`, error);
      throw error;
    }
  }

  private static mergeWithEnv(config: any): any {
    // Helper function to substitute environment variables in strings
    const substituteEnvVars = (value: any): any => {
      if (typeof value === 'string') {
        return value.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
          const envValue = process.env[envVar];
          if (envValue === undefined) {
            logger.warn(`Environment variable ${envVar} is not set, keeping placeholder: ${match}`);
            return match;
          }
          logger.debug(`Substituted environment variable ${envVar}`);
          return envValue;
        });
      } else if (Array.isArray(value)) {
        return value.map(substituteEnvVars);
      } else if (typeof value === 'object' && value !== null) {
        const result: any = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = substituteEnvVars(val);
        }
        return result;
      }
      return value;
    };

    // Override with environment variables if present
    const result = {
      ...config,
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : config.port,
      httpsPort: process.env.HTTPS_PORT ? parseInt(process.env.HTTPS_PORT, 10) : config.httpsPort,
      letsEncrypt: {
        ...config.letsEncrypt,
        email: process.env.LETSENCRYPT_EMAIL || config.letsEncrypt?.email,
        staging: process.env.LETSENCRYPT_STAGING === 'true' || config.letsEncrypt?.staging,
        certDir: process.env.CERT_DIR || config.letsEncrypt?.certDir,
      },
      logging: {
        ...config.logging,
        level: process.env.LOG_LEVEL || config.logging?.level,
        file: process.env.LOG_FILE || config.logging?.file,
      },
      security: {
        ...config.security,
        rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS 
          ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) 
          : config.security?.rateLimitWindowMs,
        rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS 
          ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) 
          : config.security?.rateLimitMaxRequests,
      },
    };

    // Apply environment variable substitution to the entire config
    return substituteEnvVars(result);
  }

  private static validateOAuth2EnvironmentVariables(config: any): void {
    if (!config.routes) return;

    for (const route of config.routes) {
      if (route.oauth2 && route.oauth2.enabled) {
        const oauth2 = route.oauth2;
        const missingVars: string[] = [];

        // Check for unresolved placeholders
        if (typeof oauth2.clientId === 'string' && oauth2.clientId.includes('${')) {
          const match = oauth2.clientId.match(/\$\{([^}]+)\}/);
          if (match) missingVars.push(match[1]);
        }

        if (typeof oauth2.clientSecret === 'string' && oauth2.clientSecret.includes('${')) {
          const match = oauth2.clientSecret.match(/\$\{([^}]+)\}/);
          if (match) missingVars.push(match[1]);
        }

        if (typeof oauth2.callbackUrl === 'string' && oauth2.callbackUrl.includes('${')) {
          const match = oauth2.callbackUrl.match(/\$\{([^}]+)\}/);
          if (match) missingVars.push(match[1]);
        }

        if (missingVars.length > 0) {
          throw new Error(
            `OAuth2 configuration for route ${route.path || route.domain} contains unresolved environment variables: ${missingVars.join(', ')}. ` +
            `Please set these environment variables before starting the server:\n` +
            missingVars.map(v => `export ${v}="your_value_here"`).join('\n')
          );
        }
      }
    }
  }

  static async createExampleConfig(configPath: string): Promise<void> {
    const exampleConfig = {
      port: 80,
      httpsPort: 443,
      routes: [
        {
          domain: 'example.com',
          target: 'http://localhost:3000',
          ssl: true,
          headers: {
            'X-Forwarded-Proto': 'https',
          },
          rewrite: {
            '^/api/': '/v1/',
          },
        },
        {
          domain: 'api.example.com',
          target: 'http://localhost:4000',
          ssl: true,
        },
      ],
      letsEncrypt: {
        email: 'admin@example.com',
        staging: false,
        certDir: './certificates',
      },
      logging: {
        level: 'info',
        file: './logs/proxy.log',
      },
      security: {
        rateLimitWindowMs: 900000,
        rateLimitMaxRequests: 100,
      },
    };

        const yamlContent = `# Nginx-like Proxy Server Configuration
# This file configures the reverse proxy server with automatic Let's Encrypt SSL certificates

# HTTP and HTTPS ports
port: ${exampleConfig.port}
httpsPort: ${exampleConfig.httpsPort}

# Proxy routes configuration
routes:
${exampleConfig.routes.map(route => `  - domain: "${route.domain}"
    target: "${route.target}"
    ssl: ${route.ssl}${route.headers ? `
    headers:
${Object.entries(route.headers).map(([key, value]) => `      "${key}": "${value}"`).join('\n')}` : ''}${route.rewrite ? `
    rewrite:
${Object.entries(route.rewrite).map(([key, value]) => `      "${key}": "${value}"`).join('\n')}` : ''}`).join('\n')}

# Let's Encrypt configuration
letsEncrypt:
  email: "${exampleConfig.letsEncrypt.email}"
  staging: ${exampleConfig.letsEncrypt.staging}
  certDir: "${exampleConfig.letsEncrypt.certDir}"

# Logging configuration
logging:
  level: "${exampleConfig.logging.level}"
  file: "${exampleConfig.logging.file}"

# Security configuration
security:
  rateLimitWindowMs: ${exampleConfig.security.rateLimitWindowMs}
  rateLimitMaxRequests: ${exampleConfig.security.rateLimitMaxRequests}
`;

    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, yamlContent);
    
    logger.info(`Example configuration created at ${configPath}`);
  }
} 