import * as fs from 'fs-extra';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import Joi from 'joi';
import { ServerConfig } from '../types';
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
  }).default({
    rateLimitWindowMs: 900000,
    rateLimitMaxRequests: 100,
  }),
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

      // Merge with environment variables
      const config = this.mergeWithEnv(rawConfig);

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
    // Override with environment variables if present
    return {
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