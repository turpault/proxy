import fs from 'fs';
import yaml from 'yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load and parse the proxy.yaml configuration
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '../config/proxy.yaml');
    const configContent = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(configContent);
  } catch (error) {
    console.error('❌ Error loading configuration:', error.message);
    return null;
  }
}

// Validation functions
function validateConfig(config) {
  console.log('🔍 Validating proxy.yaml configuration...\n');

  const issues = [];
  const warnings = [];

  // Check if config exists
  if (!config) {
    issues.push('Configuration file could not be loaded');
    return { issues, warnings };
  }

  // Validate routes
  if (!config.routes || !Array.isArray(config.routes)) {
    issues.push('Missing or invalid routes array');
  } else {
    config.routes.forEach((route, index) => {
      const routeIssues = validateRoute(route, index);
      issues.push(...routeIssues);
    });
  }

  // Validate CORS forwarder security
  const corsRoutes = config.routes?.filter(r => r.type === 'cors-forwarder') || [];
  corsRoutes.forEach((route, index) => {
    const securityIssues = validateCorsForwarderSecurity(route, index);
    issues.push(...securityIssues);
  });

  // Validate static routes
  const staticRoutes = config.routes?.filter(r => r.type === 'static') || [];
  staticRoutes.forEach((route, index) => {
    const staticIssues = validateStaticRoute(route, index);
    issues.push(...staticIssues);
  });

  // Validate OAuth2 configuration
  const oauthRoutes = config.routes?.filter(r => r.oauth2) || [];
  oauthRoutes.forEach((route, index) => {
    const oauthIssues = validateOAuth2Config(route, index);
    issues.push(...oauthIssues);
  });

  // Check for deprecated or invalid fields
  const deprecatedIssues = checkDeprecatedFields(config);
  warnings.push(...deprecatedIssues);

  return { issues, warnings };
}

function validateRoute(route, index) {
  const issues = [];

  // Required fields
  if (!route.domain) {
    issues.push(`Route ${index}: Missing required 'domain' field`);
  }

  if (!route.type) {
    issues.push(`Route ${index}: Missing required 'type' field`);
  } else if (!['proxy', 'static', 'redirect', 'cors-forwarder'].includes(route.type)) {
    issues.push(`Route ${index}: Invalid route type '${route.type}'. Must be one of: proxy, static, redirect, cors-forwarder`);
  }

  // Type-specific validations
  switch (route.type) {
    case 'proxy':
      if (!route.target) {
        issues.push(`Route ${index}: Proxy route missing required 'target' field`);
      }
      break;
    case 'static':
      if (!route.staticPath) {
        issues.push(`Route ${index}: Static route missing required 'staticPath' field`);
      }
      break;
    case 'redirect':
      if (!route.redirectTo) {
        issues.push(`Route ${index}: Redirect route missing required 'redirectTo' field`);
      }
      break;
    case 'cors-forwarder':
      // CORS forwarder doesn't need target as it gets it from URL parameter
      break;
  }

  return issues;
}

function validateCorsForwarderSecurity(route, index) {
  const issues = [];

  // Check if security is configured
  if (!route.corsForwarderSecurity) {
    console.log(`⚠️  Route ${index} (${route.name || route.path}): CORS forwarder has no security configuration`);
    console.log('   Consider adding corsForwarderSecurity for production use');
  } else {
    const security = route.corsForwarderSecurity;

    // Validate security options
    if (security.requireAuth && typeof security.requireAuth !== 'boolean') {
      issues.push(`Route ${index}: corsForwarderSecurity.requireAuth must be a boolean`);
    }

    if (security.allowedDomains && !Array.isArray(security.allowedDomains)) {
      issues.push(`Route ${index}: corsForwarderSecurity.allowedDomains must be an array`);
    }

    if (security.requireHTTPS !== undefined && typeof security.requireHTTPS !== 'boolean') {
      issues.push(`Route ${index}: corsForwarderSecurity.requireHTTPS must be a boolean`);
    }

    if (security.blockPrivateIPs !== undefined && typeof security.blockPrivateIPs !== 'boolean') {
      issues.push(`Route ${index}: corsForwarderSecurity.blockPrivateIPs must be a boolean`);
    }

    if (security.maxRequestsPerMinute !== undefined && typeof security.maxRequestsPerMinute !== 'number') {
      issues.push(`Route ${index}: corsForwarderSecurity.maxRequestsPerMinute must be a number`);
    }

    // Check for security best practices
    if (security.requireAuth === false && !security.allowedDomains?.length) {
      console.log(`⚠️  Route ${index} (${route.name || route.path}): No authentication and no domain whitelist - this is insecure for production`);
    }

    if (security.requireHTTPS === false) {
      console.log(`⚠️  Route ${index} (${route.name || route.path}): HTTPS requirement disabled - this is insecure for production`);
    }

    if (security.blockPrivateIPs === false) {
      console.log(`⚠️  Route ${index} (${route.name || route.path}): Private IP blocking disabled - this may allow SSRF attacks`);
    }
  }

  return issues;
}

function validateStaticRoute(route, index) {
  const issues = [];

  // Validate staticPath
  if (route.staticPath) {
    if (typeof route.staticPath === 'string') {
      // Single path - check if it exists
      if (!fs.existsSync(route.staticPath)) {
        issues.push(`Route ${index}: Static path '${route.staticPath}' does not exist`);
      }
    } else if (Array.isArray(route.staticPath)) {
      // Multiple paths or configured paths
      route.staticPath.forEach((pathConfig, pathIndex) => {
        if (typeof pathConfig === 'string') {
          if (!fs.existsSync(pathConfig)) {
            issues.push(`Route ${index}: Static path ${pathIndex} '${pathConfig}' does not exist`);
          }
        } else if (pathConfig.path) {
          if (!fs.existsSync(pathConfig.path)) {
            issues.push(`Route ${index}: Static path ${pathIndex} '${pathConfig.path}' does not exist`);
          }
        } else {
          issues.push(`Route ${index}: Static path ${pathIndex} has invalid configuration`);
        }
      });
    } else {
      issues.push(`Route ${index}: staticPath must be a string, array of strings, or array of StaticPathConfig objects`);
    }
  }

  return issues;
}

function validateOAuth2Config(route, index) {
  const issues = [];

  if (route.oauth2) {
    const oauth2 = route.oauth2;

    // Required OAuth2 fields
    if (!oauth2.clientId) {
      issues.push(`Route ${index}: OAuth2 configuration missing required 'clientId' field`);
    }

    if (!oauth2.clientSecret) {
      issues.push(`Route ${index}: OAuth2 configuration missing required 'clientSecret' field`);
    }

    if (!oauth2.authorizationEndpoint) {
      issues.push(`Route ${index}: OAuth2 configuration missing required 'authorizationEndpoint' field`);
    }

    if (!oauth2.tokenEndpoint) {
      issues.push(`Route ${index}: OAuth2 configuration missing required 'tokenEndpoint' field`);
    }

    if (!oauth2.callbackUrl) {
      issues.push(`Route ${index}: OAuth2 configuration missing required 'callbackUrl' field`);
    }

    // Validate boolean fields
    if (oauth2.enabled !== undefined && typeof oauth2.enabled !== 'boolean') {
      issues.push(`Route ${index}: OAuth2.enabled must be a boolean`);
    }

    if (oauth2.pkce !== undefined && typeof oauth2.pkce !== 'boolean') {
      issues.push(`Route ${index}: OAuth2.pkce must be a boolean`);
    }

    // Validate custom endpoint paths (optional string fields)
    if (oauth2.sessionEndpoint !== undefined && typeof oauth2.sessionEndpoint !== 'string') {
      issues.push(`Route ${index}: OAuth2.sessionEndpoint must be a string`);
    }

    if (oauth2.logoutEndpoint !== undefined && typeof oauth2.logoutEndpoint !== 'string') {
      issues.push(`Route ${index}: OAuth2.logoutEndpoint must be a string`);
    }

    if (oauth2.callbackRedirectPath !== undefined && typeof oauth2.callbackRedirectPath !== 'string') {
      issues.push(`Route ${index}: OAuth2.callbackRedirectPath must be a string`);
    }
  }

  return issues;
}

function checkDeprecatedFields(config) {
  const warnings = [];

  // Check for deprecated port configuration
  if (config.port || config.httpsPort) {
    warnings.push('Using deprecated port configuration. Consider using main.yaml with server configuration instead.');
  }

  // Check for deprecated security configuration
  if (config.security) {
    warnings.push('Using deprecated security configuration. Consider using route-level security settings instead.');
  }

  return warnings;
}

// Main validation function
function main() {
  console.log('🔍 Proxy Configuration Validator\n');

  const config = loadConfig();
  if (!config) {
    process.exit(1);
  }

  const { issues, warnings } = validateConfig(config);

  // Report results
  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ Configuration is valid!');
  } else {
    if (issues.length > 0) {
      console.log('\n❌ Validation Issues:');
      issues.forEach(issue => console.log(`  - ${issue}`));
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      warnings.forEach(warning => console.log(`  - ${warning}`));
    }
  }

  // Summary
  console.log('\n📊 Configuration Summary:');
  console.log(`  - Total routes: ${config.routes?.length || 0}`);
  console.log(`  - Proxy routes: ${config.routes?.filter(r => r.type === 'proxy').length || 0}`);
  console.log(`  - Static routes: ${config.routes?.filter(r => r.type === 'static').length || 0}`);
  console.log(`  - CORS forwarder routes: ${config.routes?.filter(r => r.type === 'cors-forwarder').length || 0}`);
  console.log(`  - Redirect routes: ${config.routes?.filter(r => r.type === 'redirect').length || 0}`);
  console.log(`  - Routes with OAuth2: ${config.routes?.filter(r => r.oauth2).length || 0}`);
  console.log(`  - Routes with security: ${config.routes?.filter(r => r.corsForwarderSecurity).length || 0}`);

  // Exit with error code if there are issues
  if (issues.length > 0) {
    process.exit(1);
  }
}

// Run validation
main(); 