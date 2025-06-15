# Nginx-like Proxy Server

A TypeScript-based reverse proxy server that mimics nginx functionality with automatic Let's Encrypt SSL certificate generation and renewal.

## Features

- 🔄 **Reverse Proxy**: Route requests to different backend servers based on domain
- 🔒 **Automatic SSL**: Let's Encrypt certificate generation and auto-renewal
- 📁 **Enhanced Static File Serving**: Improved static file handling with proper MIME types and index.html support
- 📊 **Logging**: Comprehensive logging with Winston
- ⚡ **Performance**: Built on Express.js with http-proxy-middleware
- 🛡️ **Security**: Helmet security headers and rate limiting
- 🔧 **Configuration**: YAML-based configuration with environment variable support
- 📈 **Monitoring**: Health check endpoints and server status

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