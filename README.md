# 🚀 Advanced Reverse Proxy Server

A powerful, feature-rich reverse proxy server built with TypeScript and Bun, featuring automatic SSL certificate management, OAuth2 integration, process management, and comprehensive monitoring capabilities.

## ✨ Features

- **🔒 Automatic SSL/TLS**: Let's Encrypt certificate generation and renewal
- **🔄 Reverse Proxy**: Route traffic to multiple backend services
- **🔐 OAuth2 Integration**: Built-in OAuth2 provider support with session management
- **⚙️ Process Management**: Monitor and control backend processes
- **📊 Real-time Statistics**: Request tracking, geolocation, and performance metrics
- **🌍 CORS Support**: Configurable Cross-Origin Resource Sharing
- **🛡️ Security Headers**: CSP, HSTS, and other security configurations
- **📱 Management Interface**: Web-based dashboard for monitoring and control
- **🌐 Geolocation Filtering**: Block/allow requests based on geographic location
- **📈 Health Monitoring**: Automatic health checks and process recovery
- **🔍 Dynamic Routing**: Path-based and domain-based routing with regex support

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client        │    │   Proxy Server  │    │   Backend       │
│   Browser       │───▶│   (Port 80/443) │───▶│   Services      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Management    │
                       │   Interface     │
                       │   (Port 4481)   │
                       └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Bun Runtime** (v1.0.0 or higher)
- **Node.js** (v18 or higher) - for some dependencies
- **Domain name** with DNS pointing to your server
- **Port 80 and 443** accessible (for Let's Encrypt)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd proxy
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Configure your domain**
   ```bash
   # Edit config/proxy.yaml
   # Replace 'example.com' with your actual domain
   ```

4. **Set up environment variables**
   ```bash
   # Copy and edit the example environment file
   cp .env.example .env
   ```

5. **Start the server**
   ```bash
   bun start
   ```

## 📋 Configuration

### Basic Configuration (`config/proxy.yaml`)

```yaml
# Server configuration
server:
  port: 80
  httpsPort: 443
  managementPort: 4481

# Let's Encrypt configuration
letsEncrypt:
  email: "admin@example.com"
  staging: false
  certDir: "./certificates"

# Routes configuration
routes:
  - domain: "example.com"
    path: "/app"
    target: "http://localhost:3000"
    ssl: true
    cors: true
```

### Environment Variables

Create a `.env` file with your configuration:

```bash
# Server configuration
NODE_ENV=production
LOG_LEVEL=info

# OAuth2 credentials (if using OAuth2)
EXAMPLE_CLIENT_ID=your_client_id
EXAMPLE_CLIENT_SECRET=your_client_secret
EXAMPLE_APP_REDIRECT_URI=https://example.com/oauth/callback
EXAMPLE_SUBSCRIPTION_KEY=your_api_key
```

## 🔧 Advanced Features

### OAuth2 Integration

The proxy server includes built-in OAuth2 support for various providers:

```yaml
routes:
  - domain: "example.com"
    path: "/oauth"
    oauth2:
      provider: "example"
      clientId: "${EXAMPLE_CLIENT_ID}"
      clientSecret: "${EXAMPLE_CLIENT_SECRET}"
      authorizationEndpoint: "https://oauth.example.com/authorize"
      tokenEndpoint: "https://oauth.example.com/token"
      callbackUrl: "https://example.com/oauth/callback"
```

### Process Management

Monitor and control backend processes:

```yaml
processManagement:
  enabled: true
  processConfigFile: "config/processes.yaml"
  autoStart: true
  healthCheckInterval: 30000
  restartAttempts: 3
```

### Security Configuration

Configure Content Security Policy and other security headers:

```yaml
security:
  csp:
    enabled: true
    directives:
      defaultSrc: ["'self'"]
      scriptSrc: ["'self'", "'unsafe-inline'"]
      styleSrc: ["'self'", "'unsafe-inline'"]
      connectSrc: ["'self'", "https://api.example.com"]
```

## 📊 Management Interface

Access the web-based management interface at `http://your-server:4481`:

- **Process Monitoring**: View and control backend processes
- **Statistics Dashboard**: Real-time request statistics and geolocation data
- **SSL Certificate Management**: Monitor certificate status and expiration
- **Log Viewer**: Real-time log streaming from managed processes

## 🔍 API Endpoints

### Process Management

```bash
# Get all processes
GET /api/processes

# Start a process
POST /api/processes/{id}/start

# Stop a process
POST /api/processes/{id}/stop

# Restart a process
POST /api/processes/{id}/restart

# Get process logs
GET /api/processes/{id}/logs
```

### Statistics

```bash
# Get request statistics
GET /api/statistics?period=24h

# Get SSL certificate status
GET /api/certificates
```

## 🛠️ Development

### Running in Development Mode

```bash
# Start with file watching
bun --watch src/index.ts

# Start with debug logging
LOG_LEVEL=debug bun start
```

### Testing

```bash
# Run tests
bun test

# Run specific test file
bun test src/services/__tests__/proxy.test.ts
```

## 📝 Examples

### Static File Serving

```yaml
routes:
  - domain: "static.example.com"
    path: "/files"
    staticPath: "/path/to/static/files"
    cors: true
    ssl: true
```

### API Proxy with CORS

```yaml
routes:
  - domain: "api.example.com"
    target: "http://localhost:3001"
    cors:
      origin: ["https://example.com", "http://localhost:3000"]
      credentials: true
      methods: ["GET", "POST", "PUT", "DELETE"]
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
      # Configure which headers to forward from client to target
      forwardHeaders: ["authorization", "x-api-key", "x-auth-token", "x-custom-header"]
    ssl: true
```

### Path-based Routing

```yaml
routes:
  - domain: "app.example.com"
    path: "/app1"
    target: "http://localhost:3001"
    ssl: true

  - domain: "app.example.com"
    path: "/app2"
    target: "http://localhost:3002"
    ssl: true
```

### OAuth2 Protected Route

```yaml
routes:
  - domain: "example.com"
    path: "/protected"
    target: "http://localhost:3000"
    oauth2:
      provider: "example"
      clientId: "${EXAMPLE_CLIENT_ID}"
      clientSecret: "${EXAMPLE_CLIENT_SECRET}"
      authorizationEndpoint: "https://oauth.example.com/authorize"
      tokenEndpoint: "https://oauth.example.com/token"
      callbackUrl: "https://example.com/oauth/callback"
    ssl: true
```

## 🔒 Security Considerations

### SSL/TLS Configuration

- Automatic Let's Encrypt certificate generation
- Certificate renewal monitoring
- HSTS headers for HTTPS enforcement
- Secure cipher configuration

### OAuth2 Security

- Secure session management
- CSRF protection
- Secure cookie configuration
- Environment variable protection

### Process Security

- Isolated process execution
- Health check monitoring
- Automatic restart on failure
- Log file rotation

## 📈 Monitoring and Logging

### Log Levels

- `error`: Critical errors and failures
- `warn`: Warning conditions
- `info`: General information
- `debug`: Detailed debugging information

### Statistics Collection

- Request count and response times
- Geographic location tracking
- Error rate monitoring
- Process health metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- Create an issue on GitHub
- Check the documentation
- Review the example configurations

## 🔄 Changelog

### v1.0.0
- Initial release
- Basic reverse proxy functionality
- Let's Encrypt integration
- OAuth2 support
- Process management
- Web-based management interface

---

**Note**: This is a production-ready reverse proxy server with enterprise-grade features. Make sure to properly configure security settings and monitor the server in production environments.

### CORS Configuration Options

The `cors` configuration supports the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable CORS |
| `origin` | string/array/boolean | `true` | Allowed origins |
| `credentials` | boolean | `false` | Allow credentials |
| `methods` | string[] | `["GET", "POST", "PUT", "DELETE", "OPTIONS"]` | Allowed HTTP methods |
| `allowedHeaders` | string[] | `["Content-Type", "Authorization"]` | Headers allowed in requests |
| `exposedHeaders` | string[] | `[]` | Headers exposed in responses |
| `maxAge` | number | `86400` | Preflight cache duration |
| `forwardHeaders` | string[] | See below | Headers to forward from client to target |

#### Header Forwarding

The `forwardHeaders` option allows you to specify which headers from the client request should be forwarded to the target server. If not specified, the following headers are forwarded by default:

- `authorization` - Bearer tokens, Basic auth, etc.

**Example configurations:**

```yaml
# Forward only authorization header
cors:
  forwardHeaders: ["authorization"]

# Forward custom headers
cors:
  forwardHeaders: ["authorization", "x-api-key", "x-custom-auth", "x-user-id"]

# Forward no headers (empty array)
cors:
  forwardHeaders: []
```

### Testing Header Forwarding

You can test the header forwarding functionality using the included test script:

```bash
# Run the test script
node test-header-forwarding.js
```

The test script will:
1. Make a request with various test headers
2. Verify the proxy server receives the request
3. Check that headers are properly forwarded to the target server

Make sure you have a test route configured in your `proxy.yaml`:

```yaml
# Test route for header forwarding
- domain: "localhost"
  path: "/api/test-headers"
  target: "http://localhost:3006"
  cors:
    enabled: true
    origin: true
    forwardHeaders: ["authorization", "x-api-key", "x-custom-auth", "x-user-id"]
  ssl: false
``` 