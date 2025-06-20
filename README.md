# Nginx-like Proxy Server with OAuth2 Authentication

A modern reverse proxy server built with Node.js and TypeScript that provides automatic SSL certificate management via Let's Encrypt and comprehensive OAuth2 authentication support.

## Features

- 🔄 **Reverse Proxy**: Route requests to different backend servers based on domain
- 🔒 **Automatic SSL**: Let's Encrypt certificate generation and auto-renewal
- 📁 **Enhanced Static File Serving**: Improved static file handling with proper MIME types and index.html support
- 📊 **Logging**: Comprehensive logging with Winston
- ⚡ **Performance**: Built on Express.js with http-proxy-middleware
- 🛡️ **Security**: Helmet security headers and rate limiting
- 🔧 **Configuration**: YAML-based configuration with environment variable support
- 📈 **Monitoring**: Health check endpoints and server status
- 🔄 **Auto-Reload**: Automatic server restart when configuration file changes
- 🌍 **Geolocation Filtering**: Filter requests based on country, region, and city
- 🚀 **Process Management**: Automatic subprocess launching, monitoring, and restarting
- 💻 **Output Proxying**: Capture and log stdout/stderr from managed processes
- 🔄 **Dynamic Process Management**: Hot reloading of process configurations with file watching
- 📁 **Independent Process Configuration**: Separate process management from route configuration
- 📊 **Request Statistics**: Comprehensive IP and geolocation tracking with daily reports

## Request Statistics and Geolocation Tracking

The proxy server automatically tracks all incoming requests and generates detailed statistics reports every 24 hours:

### 📊 **Automatic Data Collection**
- **IP Address Tracking**: Records all unique IP addresses making requests
- **Geolocation Data**: Maps IP addresses to countries, regions, and cities
- **Request Patterns**: Tracks request methods, routes, and user agents
- **Time-based Analysis**: Records when requests are made for temporal analysis

### 📈 **Comprehensive Reporting**
- **Daily Reports**: Automatically generated every 24 hours at midnight
- **JSON Format**: Structured data for easy analysis and processing
- **Multiple Views**: Country, city, and IP-level statistics
- **Percentage Calculations**: Relative distribution of traffic

### 🎛️ **Management API**
- **Real-time Statistics**: Get current statistics via API endpoints
- **Manual Reports**: Generate reports on-demand
- **Summary Data**: Quick overview of current traffic patterns

See [STATISTICS.md](./STATISTICS.md) for detailed documentation and examples.

## Dynamic Process Management

The proxy server now supports dynamic process management with hot reloading capabilities:

### 🔄 Hot Reloading Features
- **File Watching**: Automatically monitors `processes.yaml` for changes
- **Live Updates**: Processes are started, stopped, or restarted based on configuration changes
- **Debounced Updates**: Prevents rapid-fire updates with 2-second debouncing
- **Configuration Validation**: Validates changes before applying them

### 📁 Independent Configuration
- **Separate File**: Process configuration is loaded from `config/processes.yaml`
- **Dynamic Loading**: Configuration is loaded independently of the main proxy config
- **File Watching**: Real-time monitoring of configuration file changes
- **Error Handling**: Graceful handling of invalid configurations

### 🎛️ Management API
- **Manual Reload**: Force reload configuration via API endpoint
- **Process Status**: Real-time status of all managed processes
- **Individual Control**: Start, stop, restart individual processes
- **Log Access**: View process logs through the management interface

See [DYNAMIC_PROCESS_MANAGEMENT.md](./DYNAMIC_PROCESS_MANAGEMENT.md) for detailed documentation and examples.

## Process Naming

The proxy server supports descriptive names for managed processes, making it easier to identify processes in the management console and system monitoring tools:

### 🏷️ **Descriptive Process Names**
- **Human-Readable Identifiers**: Use descriptive names like "API Server" instead of generic IDs
- **Management Console**: Clear process identification in the web interface
- **System Monitoring**: Descriptive names in `ps` output and monitoring tools
- **Enhanced Logging**: Better log readability with process names

### 📝 **Configuration**
```yaml
processes:
  api-server:
    name: "API Server"  # Human-readable name
    enabled: true
    command: "node"
    args: ["server.js"]
    # ... other configuration
```

### 🔧 **Platform Support**
- **Node.js**: Automatic process title setting and command-line arguments
- **Python**: Unbuffered output and environment variable support
- **Java**: JVM arguments for process naming
- **Other Processes**: Environment variables and command-line modifications

### 📊 **Management Interface**
- Process names displayed prominently in the web interface
- API responses include both process ID and name
- Clear distinction between different managed processes

See [PROCESS_NAMING.md](./PROCESS_NAMING.md) for detailed documentation and examples.

## Enhanced Static File Features

The proxy server now includes enhanced static file serving capabilities:

- **Automatic Index.html Serving**: Directories automatically serve `index.html` files when accessed
- **Proper MIME Type Detection**: All files are served with correct Content-Type headers based on file extensions
- **Intelligent Caching**: Optimized cache headers for different file types:
  - Static assets (JS, CSS, images, fonts): 1 year cache
  - HTML files: 5 minutes cache
  - SPA fallback: No cache for dynamic routing
- **Directory Navigation**: Supports both `index.html` and `index.htm` files
- **SPA Support**: Enhanced Single Page Application routing with proper fallback handling
- **Content Security Policy**: Configurable CSP headers for OAuth and API integrations

## CORS Proxy Support

The proxy server includes powerful CORS (Cross-Origin Resource Sharing) proxy capabilities to bypass browser CORS restrictions when accessing external APIs:

- **🌐 CORS Bypass**: Route requests through the proxy to avoid browser CORS limitations
- **⚙️ Flexible Configuration**: Simple boolean or advanced configuration options
- **🔒 Security Controls**: Origin restrictions, credential handling, and method filtering
- **📋 Header Management**: Control allowed and exposed headers
- **⚡ Performance**: Configurable preflight request caching
- **🛠️ Development Support**: Permissive settings for development, restrictive for production

### Simple CORS Configuration
```yaml
routes:
  - domain: "yourdomain.com"
    type: "proxy"
    path: "/api/external"
    target: "https://external-api.com"
    cors: true  # Simple CORS - allows all origins
```

### Advanced CORS Configuration
```yaml
routes:
  - domain: "yourdomain.com"
    type: "proxy"
    path: "/api/secure"
    target: "https://secure-api.com"
    cors:
      enabled: true
      origin: ["https://yourdomain.com", "http://localhost:3000"]
      credentials: true
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
      exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"]
      maxAge: 3600  # 1 hour preflight cache
```

See [CORS_PROXY_GUIDE.md](./CORS_PROXY_GUIDE.md) for detailed configuration examples and best practices.

### OAuth Application Support

The proxy server includes specialized support for OAuth applications:

- **Blackbaud OAuth Integration**: Pre-configured CSP headers for Blackbaud API endpoints
- **Flexible CSP Configuration**: Route-specific Content Security Policy headers
- **OAuth Endpoint Whitelist**: Allows connections to:
  - `https://oauth2.sky.blackbaud.com` (Token endpoint)
  - `https://app.blackbaud.com` (Authorization endpoint)
  - `https://api.sky.blackbaud.com` (API endpoint)

### Content Security Policy (CSP) Configuration

The proxy server provides flexible CSP configuration at multiple levels:

#### Global CSP Configuration
Configure CSP for all routes in the `security.csp` section:

```yaml
security:
  csp:
    enabled: true
    reportOnly: false
    directives:
      defaultSrc: ["'self'"]
      scriptSrc: ["'self'", "'unsafe-inline'"]
      styleSrc: ["'self'", "'unsafe-inline'"]
      imgSrc: ["'self'", "data:", "https:"]
      connectSrc: ["'self'"]
      fontSrc: ["'self'", "data:"]
      objectSrc: ["'none'"]
```

#### Route-Specific CSP Configuration
Override CSP for specific routes directly in the route configuration:

```yaml
routes:
  - domain: "example.com"
    type: "static"
    path: "/app"
    staticPath: "./build"
    csp:
      enabled: true
      directives:
        connectSrc: 
          - "'self'"
          - "https://api.oauth-provider.com"
```

#### Route CSP Overrides
Alternative method using `security.routeCSP` for path-based CSP:

```yaml
security:
  routeCSP:
    - path: "/api"
      csp:
        enabled: true
        directives:
          connectSrc: ["'self'", "https://external-api.com"]
```

#### CSP Directive Support
All standard CSP directives are supported:
- `defaultSrc`, `scriptSrc`, `styleSrc`, `imgSrc`
- `connectSrc`, `fontSrc`, `objectSrc`, `mediaSrc`
- `frameSrc`, `childSrc`, `workerSrc`, `manifestSrc`
- `prefetchSrc`, `navigateTo`, `formAction`, `frameAncestors`
- `baseUri`, `pluginTypes`, `sandbox`
- `upgradeInsecureRequests`, `blockAllMixedContent`

#### CSP Priority Order
1. Route-level `csp` configuration (highest priority)
2. `security.routeCSP` path-based configuration
3. Global `security.csp` configuration (fallback)

## OAuth2 Authentication Support

The proxy server provides comprehensive OAuth2 authentication support for static applications, eliminating the need for client-side OAuth implementations and securing sensitive credentials server-side.

### Features

- **🔐 Server-Side OAuth2 Flow**: Complete authorization code flow handling
- **🛡️ Secure Credential Storage**: Client secrets stored safely in server configuration
- **🍪 Session Management**: Cookie-based session handling with automatic expiration
- **🔄 Token Refresh**: Automatic access token refresh when supported
- **🎯 Route Protection**: Flexible path-based authentication requirements
- **🌐 Multi-Provider Support**: Support for any OAuth2-compliant provider
- **🔧 Environment Variable Support**: Secure credential injection via environment variables

### Configuration

#### Basic OAuth2 Setup

```yaml
routes:
  - domain: "example.com"
    type: "static"
    path: "/app"
    staticPath: "./build"
    requireAuth: true
    oauth2:
      enabled: true
      provider: "google"
      clientId: "${GOOGLE_CLIENT_ID}"
      clientSecret: "${GOOGLE_CLIENT_SECRET}"
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth"
      tokenEndpoint: "https://oauth2.googleapis.com/token"
      callbackUrl: "https://example.com/app/oauth/callback"
      scopes: ["openid", "profile", "email"]
      pkce: true
    publicPaths:
      - "/oauth/callback"
      - "/oauth/session"
      - "/login"
      - "/static"
```

#### Blackbaud OAuth2 Example

```yaml
routes:
  - domain: "home.turpault.me"
    type: "static"
    path: "/blackbaud"
    staticPath: "/path/to/blackbaud/build"
    requireAuth: true
    oauth2:
      enabled: true
      provider: "blackbaud"
      clientId: "${BLACKBAUD_CLIENT_ID}"
      clientSecret: "${BLACKBAUD_CLIENT_SECRET}"
      authorizationEndpoint: "https://app.blackbaud.com/oauth/authorize"
      tokenEndpoint: "https://oauth2.sky.blackbaud.com/token"
      callbackUrl: "https://home.turpault.me/blackbaud/oauth/callback"
      subscriptionKey: "${BLACKBAUD_SUBSCRIPTION_KEY}"  # Optional
      subscriptionKeyHeader: "Bb-Api-Subscription-Key"  # Optional, defaults to 'Bb-Api-Subscription-Key'
      scopes: ["read", "write"]
      pkce: false
    publicPaths:
      - "/oauth/callback"
      - "/oauth/session"
      - "/oauth/logout"
      - "/static"
```

### OAuth2 Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | boolean | No | Enable/disable OAuth2 (default: true) |
| `provider` | string | Yes | Provider name for logging |
| `clientId` | string | Yes | OAuth2 client ID |
| `clientSecret` | string | Yes | OAuth2 client secret |
| `authorizationEndpoint` | string | Yes | Authorization server URL |
| `tokenEndpoint` | string | Yes | Token exchange URL |
| `callbackUrl` | string | Yes | OAuth2 callback URL |
| `scopes` | string[] | No | Requested OAuth2 scopes |
| `pkce` | boolean | No | Enable PKCE (default: false) |
| `additionalParams` | object | No | Extra authorization parameters |
| `subscriptionKey` | string | No | API subscription key |
| `subscriptionKeyHeader` | string | No* | Header name for subscription key (auto-set to 'Bb-Api-Subscription-Key' if subscriptionKey is provided) |

**Note**: If `subscriptionKey` is provided, `subscriptionKeyHeader` will be automatically set to `'Bb-Api-Subscription-Key'` if not explicitly specified.

### Route Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `requireAuth` | boolean | Require authentication for this route |
| `publicPaths` | string[] | Paths that bypass authentication |
| `oauth2` | object | OAuth2 configuration |

### Built-in Endpoints

When OAuth2 is enabled for a route, the following endpoints are automatically created:

- **`/oauth/callback`** - OAuth2 callback handler
- **`/oauth/logout`** - Logout and clear session
- **`/oauth/session`** - Get current session info (JSON API)

### Environment Variables

Use environment variables to securely inject OAuth2 credentials:

```bash
# Blackbaud OAuth2 credentials
export BLACKBAUD_CLIENT_ID="your_blackbaud_client_id"
export BLACKBAUD_CLIENT_SECRET="your_blackbaud_client_secret"  
export BLACKBAUD_APP_REDIRECT_URI="https://your-domain.com/blackbaud/oauth/callback"

# Optional: Blackbaud API Subscription Key
export BLACKBAUD_SUBSCRIPTION_KEY="your_api_subscription_key"

# Google OAuth2 credentials  
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

**⚠️ Important**: The proxy server will fail to start if these environment variables are not set when OAuth2 is enabled in your configuration.

### Authentication Flow

1. **Access Protected Route**: User accesses a protected path
2. **Check Authentication**: Server checks for valid session cookie
3. **Redirect to Authorization**: If not authenticated, redirect to OAuth2 provider
4. **User Authorization**: User grants permissions on provider's site
5. **Callback Handling**: Provider redirects to callback URL with authorization code
6. **Token Exchange**: Server exchanges code for access token (server-side)
7. **Session Creation**: Server creates secure session and sets cookie
8. **Access Granted**: User can now access protected resources

### Session Management

- **Cookie-based**: Uses secure, HTTP-only cookies
- **Automatic Expiration**: Sessions expire based on token lifetime
- **Token Refresh**: Automatic refresh when refresh tokens are available
- **Logout Support**: Built-in logout endpoint for session cleanup

### Security Features

- **Server-Side Secrets**: Client secrets never exposed to browsers
- **PKCE Support**: Proof Key for Code Exchange for enhanced security
- **State Validation**: CSRF protection via state parameter
- **Secure Cookies**: HTTP-only, secure, SameSite cookie attributes
- **Session Cleanup**: Automatic cleanup of expired sessions and states

### Public Paths

Configure paths that don't require authentication:

```yaml
publicPaths:
  - "/oauth/callback"    # OAuth2 callback (required)
  - "/oauth/session"     # Session info API
  - "/oauth/logout"      # Logout endpoint
  - "/login"             # Custom login page
  - "/static"            # Static assets
```

### JavaScript Integration

Access session information from your static app:

```javascript
// Check authentication status
fetch('/oauth/session')
  .then(response => response.json())
  .then(session => {
    if (session.authenticated) {
      console.log('User is authenticated');
      console.log('Token expires:', session.expiresAt);
    } else {
      console.log('User not authenticated');
    }
  });

// Logout
function logout() {
  window.location.href = '/oauth/logout';
}
```

### Multiple OAuth2 Providers

Support multiple OAuth2 providers on different routes:

```yaml
routes:
  - domain: "example.com"
    path: "/google-app"
    oauth2:
      provider: "google"
      clientId: "${GOOGLE_CLIENT_ID}"
      # ... Google OAuth2 config
      
  - domain: "example.com"  
    path: "/github-app"
    oauth2:
      provider: "github"
      clientId: "${GITHUB_CLIENT_ID}"
      # ... GitHub OAuth2 config
```

## 🚀 Quick Start

### Environment Variables Setup

Before starting the server, you need to set up the required environment variables for OAuth2 authentication:

```bash
# Create a .env file or export these variables
export BLACKBAUD_CLIENT_ID="your_blackbaud_client_id"
export BLACKBAUD_CLIENT_SECRET="your_blackbaud_client_secret"  
export BLACKBAUD_APP_REDIRECT_URI="https://your-domain.com/blackbaud/oauth/callback"

# Optional: Blackbaud API Subscription Key
export BLACKBAUD_SUBSCRIPTION_KEY="your_api_subscription_key"
```

**⚠️ Important**: The proxy server will fail to start if these environment variables are not set when OAuth2 is enabled in your configuration.

### Installation and Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables** (see above)

3. **Configure the proxy** by editing `config/proxy.yaml`

4. **Start the server:**
   ```bash
   npm start
   ```

### Development Mode

```bash
# With environment variables from .env file
npm install -g dotenv-cli
dotenv npm start

# Or export them manually
export BLACKBAUD_CLIENT_ID="your_client_id"
export BLACKBAUD_CLIENT_SECRET="your_client_secret"
export BLACKBAUD_APP_REDIRECT_URI="https://your-domain.com/blackbaud/oauth/callback"
npm start
```

## Installation

1. Clone or create the project:
```bash
cd proxy
npm install
```

2. Create your configuration file:
```bash
npm run dev -- --create-config ./config/proxy.yaml
```

3. Edit the configuration file with your domains and settings.

4. Build the project:
```bash
npm run build
```

## Configuration Auto-Reload

The proxy server automatically monitors the configuration file (`proxy.yaml`) for changes and restarts the server when modifications are detected. This feature allows for zero-downtime configuration updates in development and production environments.

### How It Works

- **File Watching**: Uses Node.js `fs.watchFile()` to monitor configuration file changes
- **Validation First**: New configuration is validated before stopping the current server
- **Graceful Restart**: Server stops gracefully, then starts with the new configuration
- **Fallback Protection**: If new configuration is invalid, server continues with previous working configuration
- **Debouncing**: Small delay prevents multiple restarts during rapid file changes

### Configuration

The auto-reload feature is **enabled by default**. You can disable it using:

**Environment Variable:**
```bash
export DISABLE_CONFIG_WATCH=true
npm start
```

**Command Line Flag:**
```bash
npm start -- --no-watch
```

### Example Usage

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Edit your `config/proxy.yaml` file** - the server will automatically restart

3. **Monitor the logs** to see restart activity:
   ```
   [2024-01-01T12:00:00.000Z] info: Configuration file changed: /path/to/config/proxy.yaml
   [2024-01-01T12:00:00.500Z] info: Validating new configuration...
   [2024-01-01T12:00:00.600Z] info: New configuration is valid
   [2024-01-01T12:00:00.700Z] info: Stopping proxy server...
   [2024-01-01T12:00:01.800Z] info: Server restarted successfully with new configuration
   ```

### Error Handling

- **Invalid Configuration**: Server continues running with the previous working configuration
- **Validation Errors**: Detailed error messages help identify configuration issues
- **Startup Failures**: Process exits if fallback configuration also fails

## Subprocess Management

The proxy server can automatically launch, monitor, and restart backend processes for your applications. This eliminates the need for external process managers like PM2 or systemd for simple deployments.

### Key Features

- **🚀 Automatic Process Launching**: Start processes when the proxy starts
- **🔄 Auto-Restart**: Restart processes when they exit unexpectedly
- **❤️ Health Monitoring**: HTTP health checks with automatic restart on failure
- **📊 Process Monitoring**: Track process status, uptime, and restart counts
- **🔌 Output Proxying**: Capture and log stdout/stderr with process identification
- **🛑 Graceful Shutdown**: Proper process termination on proxy shutdown
- **⚙️ Environment Control**: Custom working directories and environment variables

### Configuration

Add a `process` configuration block to any proxy route:

```yaml
routes:
  - domain: "api.example.com"
    type: "proxy"
    target: "http://localhost:3001"
    ssl: true
    process:
      enabled: true
      command: "node"
      args: ["index.js"]
      cwd: "./api-server"
      env:
        NODE_ENV: "production"
        PORT: "3001"
      restartOnExit: true
      restartDelay: 2000
      maxRestarts: 10
      healthCheck:
        enabled: true
        path: "/health"  # Can also be a full URL like "http://localhost:3001/health"
```

### Process Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable process management |
| `command` | string | **required** | Command to execute |
| `args` | array | `[]` | Command line arguments |
| `cwd` | string | `process.cwd()` | Working directory |
| `env` | object | `{}` | Environment variables |
| `restartOnExit` | boolean | `true` | Auto-restart when process exits |
| `restartDelay` | number | `1000` | Delay before restart (ms) |
| `maxRestarts` | number | `5` | Maximum restart attempts |

### Health Check Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable health checks |
| `path` | string | `"/health"` | Health check endpoint (full URL or relative path) |
| `interval` | number | `30000` | Check interval (ms) |
| `timeout` | number | `5000` | Request timeout (ms) |
| `retries` | number | `3` | Failed checks before restart |

### Example Use Cases

#### Node.js API Server
```yaml
- domain: "api.example.com"
  type: "proxy"
  target: "http://localhost:3001"
  process:
    enabled: true
    command: "node"
    args: ["index.js"]
    cwd: "./api-server"
    env:
      NODE_ENV: "production"
      PORT: "3001"
    healthCheck:
      enabled: true
      path: "/health"  # Can also be a full URL like "http://localhost:3001/health"
```

#### Python Flask Application
```yaml
- domain: "app.example.com"
  type: "proxy"
  target: "http://localhost:5000"
  process:
    enabled: true
    command: "python"
    args: ["-m", "flask", "run", "--host=0.0.0.0"]
    cwd: "./flask-app"
    env:
      FLASK_APP: "app.py"
      FLASK_ENV: "production"
```

#### Static Site Build Process
```yaml
- domain: "blog.example.com"
  type: "static"
  staticPath: "./blog/dist"
  process:
    enabled: true
    command: "npm"
    args: ["run", "build:watch"]
    cwd: "./blog"
    restartOnExit: true
    maxRestarts: 3
```

### Process Monitoring

#### Health Check Endpoint

The `/health` endpoint includes process information:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600,
  "processes": {
    "total": 3,
    "running": 2,
    "details": [
      {
        "id": "api-example-com",
        "isRunning": true,
        "pid": 12345,
        "restartCount": 0,
        "startTime": "2024-01-01T11:00:00.000Z",
        "uptime": 3600000,
        "healthCheckFailures": 0
      }
    ]
  }
}
```

#### Log Output

Process output is automatically captured and logged:

```
[2024-01-01T12:00:00.000Z] info: [api-example-com] STDOUT: Server listening on port 3001
[2024-01-01T12:00:01.000Z] warn: [api-example-com] STDERR: Warning: Deprecated API usage
[2024-01-01T12:00:02.000Z] info: Process api-example-com started successfully {"pid":12345,"command":"node"}
```

### Best Practices

1. **Health Checks**: Enable health checks for critical services
2. **Restart Limits**: Set appropriate `maxRestarts` for production environments
3. **Working Directories**: Use `cwd` for applications with relative paths
4. **Environment Variables**: Use `env` for configuration instead of hardcoding
5. **Process Identification**: Process IDs are auto-generated from domain + path
6. **Graceful Shutdown**: Processes receive SIGTERM with 5-second grace period

### Limitations

- Process management is designed for simple applications
- For complex deployments, consider dedicated process managers (PM2, systemd)
- Health checks require HTTP endpoints (not suitable for all applications)
- No support for process clustering or load balancing

## Configuration

### YAML Configuration File

Create a `config/proxy.yaml` file:

```yaml
# Server ports
port: 80
httpsPort: 443

# Proxy routes
routes:
  - domain: "example.com"
    target: "http://localhost:3000"
    ssl: true
    headers:
      "X-Forwarded-Proto": "https"
    rewrite:
      "^/api/": "/v1/"

# Let's Encrypt settings
letsEncrypt:
  email: "admin@example.com"
  staging: false
  certDir: "./certificates"

# Logging configuration
logging:
  level: "info"
  file: "./logs/proxy.log"

# Security settings
security:
  rateLimitWindowMs: 900000
  rateLimitMaxRequests: 100
```

### Environment Variables

You can override configuration with environment variables:

```bash
PORT=8080
HTTPS_PORT=8443
LETSENCRYPT_EMAIL=your-email@domain.com
LETSENCRYPT_STAGING=true
CERT_DIR=/path/to/certificates
LOG_LEVEL=debug
CONFIG_FILE=/path/to/config.yaml
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Create Example Configuration

```bash
npm run dev -- --create-config
```

## Route Configuration

Each route in the configuration supports:

- **domain**: The domain name to match
- **target**: The backend server URL
- **ssl**: Enable SSL certificate generation (default: true)
- **headers**: Additional headers to add to proxied requests
- **rewrite**: URL rewriting rules (regex patterns)

## Let's Encrypt

The server automatically:
- Generates SSL certificates for configured domains
- Handles ACME challenges via HTTP-01 method
- Renews certificates automatically (30 days before expiry)
- Supports both staging and production Let's Encrypt environments

### Important Notes

- Ensure your server is accessible on ports 80 and 443
- DNS records must point to your server before certificate generation
- Use staging environment for testing to avoid rate limits

## Logging

Logs are written to:
- Console (with colors)
- File specified in configuration
- Separate error log file

Log levels: `error`, `warn`, `info`, `http`, `debug`

## Security Features

- **Helmet**: Security headers protection
- **CORS**: Cross-origin resource sharing support
- **Rate Limiting**: Configurable request rate limits
- **Proxy Headers**: Proper forwarding of client information

## Health Check

The server provides a health check endpoint:

```
GET /health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2023-...",
  "uptime": 3600
}
```

## SSL Certificate Management

Certificates are stored in the configured `certDir` with the following structure:

```
certificates/
├── accounts/
│   └── account.key
├── example.com/
│   ├── cert.pem
│   └── key.pem
└── api.example.com/
    ├── cert.pem
    └── key.pem
```

## Troubleshooting

### Common Issues

1. **Certificate Generation Failed**
   - Check DNS records point to your server
   - Ensure ports 80 and 443 are accessible
   - Try staging environment first

2. **Proxy Errors**
   - Verify backend servers are running
   - Check target URLs in configuration
   - Review proxy logs for detailed errors

3. **Permission Issues**
   - Ensure write permissions for certificate directory
   - Run with appropriate privileges for ports 80/443

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
npm start
```

## Production Deployment

### Using PM2

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name nginx-proxy
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY config ./config
EXPOSE 80 443
CMD ["npm", "start"]
```

### Systemd Service

Create `/etc/systemd/system/nginx-proxy.service`:

```ini
[Unit]
Description=Nginx-like Proxy Server
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/nginx-proxy
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## License

MIT License 

# Nginx-like Proxy Server Configuration

This document describes the configuration format for the `proxy.yaml` file used by the reverse proxy server with automatic Let's Encrypt SSL certificates.

## Overview

The proxy server acts as a reverse proxy that can:
- Route requests to static files or backend services
- Handle OAuth2 authentication flows
- Automatically provision SSL certificates via Let's Encrypt
- Apply security headers and Content Security Policy (CSP)
- Rate limit requests
- Redirect requests

## Configuration Structure

### Basic Server Settings

```yaml
# HTTP and HTTPS ports
port: 4480        # HTTP port (default: 80)
httpsPort: 4443   # HTTPS port (default: 443)
```

### Routes Configuration

The `routes` section defines how different paths and domains are handled:

```yaml
routes:
  - domain: "example.com"    # Domain to match
    type: "static"           # Route type: static, proxy, or redirect
    path: "/app"             # Path prefix to match
    # ... additional route-specific configuration
```

#### Route Types

##### 1. Static Routes (`type: "static"`)

Serves static files from the filesystem:

```yaml
- domain: "home.turpault.me"
  type: "static"
  path: "/blackbaud"                                    # URL path
  staticPath: "/Users/turpault/dev/blackbaud/build"     # Local filesystem path
  spaFallback: true                                     # Enable SPA routing (serve index.html for 404s)
  ssl: true                                             # Enable HTTPS
  requireAuth: true                                     # Require OAuth2 authentication
```

##### 2. Proxy Routes (`type: "proxy"`)

Forwards requests to backend services:

```yaml
- domain: "home.turpault.me"
  type: "proxy"
  path: "/photos"                    # URL path prefix
  target: "http://localhost:8892"    # Backend service URL
  ssl: true                          # Enable HTTPS
  rewrite:                           # Optional path rewriting
    "^/photos/": "/"                 # Regex pattern: replacement
```

##### 3. Redirect Routes (`type: "redirect"`)

Redirects requests to other paths:

```yaml
- domain: "home.turpault.me"
  type: "redirect"
  path: "/app2"           # Source path
  redirectTo: "/photos"   # Destination path
  ssl: true               # Enable HTTPS
```

### OAuth2 Authentication

Routes can be protected with OAuth2 authentication:

```yaml
oauth2:
  enabled: true
  provider: "blackbaud"                                           # OAuth provider name
  clientId: "${BLACKBAUD_CLIENT_ID}"                             # Environment variable
  clientSecret: "${BLACKBAUD_CLIENT_SECRET}"                     # Environment variable
  authorizationEndpoint: "https://app.blackbaud.com/oauth/authorize"
  tokenEndpoint: "https://oauth2.sky.blackbaud.com/token"
  callbackUrl: "${BLACKBAUD_APP_REDIRECT_URI}"                   # Callback URL
  subscriptionKey: "${BLACKBAUD_SUBSCRIPTION_KEY}"               # API subscription key
  subscriptionKeyHeader: "Bb-Api-Subscription-Key"               # Header name for subscription key
  scopes: ["read", "write"]                                      # OAuth scopes
  pkce: false                                                    # PKCE support
```

#### Public Paths

Paths that don't require authentication:

```yaml
publicPaths:
  - "/oauth/callback"    # OAuth callback endpoint
  - "/oauth/session"     # Session info endpoint
  - "/oauth/logout"      # Logout endpoint
  - "/login"             # Login page
  - "/static"            # Static assets
```

### Let's Encrypt Configuration

Automatic SSL certificate provisioning:

```yaml
letsEncrypt:
  email: "your-email@example.com"    # Contact email for Let's Encrypt
  staging: false                     # Use staging environment (for testing)
  certDir: "./certificates"          # Directory to store certificates
```

### Logging Configuration

```yaml
logging:
  level: "info"              # Log level: debug, info, warn, error
  file: "./logs/proxy.log"   # Log file path
```

### Security Configuration

#### Rate Limiting

```yaml
security:
  rateLimitWindowMs: 900000      # Rate limit window in milliseconds (15 minutes)
  rateLimitMaxRequests: 100      # Maximum requests per window
```

#### Content Security Policy (CSP)

Global CSP configuration (applies to all routes unless overridden):

```yaml
security:
  csp:
    enabled: true          # Enable CSP
    reportOnly: false      # Set to true for report-only mode
    directives:
      defaultSrc: ["'self'"]
      scriptSrc: ["'self'", "'unsafe-inline'"]
      styleSrc: ["'self'", "'unsafe-inline'"]
      imgSrc: ["'self'", "data:", "https:"]
      connectSrc: ["'self'"]
      fontSrc: ["'self'", "data:"]
      objectSrc: ["'none'"]
      mediaSrc: ["'self'"]
      frameSrc: ["'self'"]
```

#### Route-Specific CSP

CSP can be overridden per route:

```yaml
routes:
  - domain: "example.com"
    path: "/api"
    csp:
      enabled: true
      directives:
        defaultSrc: ["'self'"]
        connectSrc: ["'self'", "https://api.external.com"]
```

Or using the global `routeCSP` configuration:

```yaml
security:
  routeCSP:
    - path: "/api"
      csp:
        enabled: true
        directives:
          defaultSrc: ["'self'"]
          connectSrc: ["'self'", "https://api.example.com"]
```

## Environment Variables

The configuration supports environment variable substitution using `${VARIABLE_NAME}` syntax:

- `${BLACKBAUD_CLIENT_ID}` - OAuth2 client ID
- `${BLACKBAUD_CLIENT_SECRET}` - OAuth2 client secret
- `${BLACKBAUD_APP_REDIRECT_URI}` - OAuth2 callback URL
- `${BLACKBAUD_SUBSCRIPTION_KEY}` - API subscription key

## CSP Directives Reference

Common CSP directives and their purposes:

- `defaultSrc`: Default source for all resource types
- `scriptSrc`: Sources for JavaScript
- `styleSrc`: Sources for CSS stylesheets
- `imgSrc`: Sources for images
- `connectSrc`: Sources for fetch, XMLHttpRequest, WebSocket
- `fontSrc`: Sources for fonts
- `objectSrc`: Sources for plugins (object, embed, applet)
- `mediaSrc`: Sources for audio and video
- `frameSrc`: Sources for frames (iframe, frame)

Common CSP values:
- `'self'`: Same origin as the document
- `'unsafe-inline'`: Allow inline scripts/styles (use with caution)
- `'unsafe-eval'`: Allow eval() and similar (use with caution)
- `'none'`: Block all sources
- `data:`: Allow data: URIs
- `https:`: Allow any HTTPS source
- `blob:`: Allow blob: URIs

## Example Usage

1. **Static React App with OAuth**: Serves a React application with Blackbaud OAuth2 authentication
2. **Proxy to Backend**: Forwards API requests to a backend service with path rewriting
3. **Simple Redirect**: Redirects legacy URLs to new paths

## Security Best Practices

1. **Use HTTPS**: Always set `ssl: true` for production routes
2. **Restrict CSP**: Use the most restrictive CSP policies possible
3. **Environment Variables**: Store sensitive values in environment variables
4. **Rate Limiting**: Configure appropriate rate limits for your use case
5. **Public Paths**: Minimize the number of public paths that bypass authentication

## Troubleshooting

- Check logs in the configured log file for errors
- Verify environment variables are set correctly
- Test CSP policies in report-only mode first
- Ensure Let's Encrypt can reach your server on port 80 for certificate challenges 