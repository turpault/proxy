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
- **💾 Configuration Backups**: Automatic backup system with organized storage
- **⚙️ Flexible Configuration**: Command-line and environment variable support

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

3. **Start the server**
   ```bash
   # Using default configuration
   bun run src/index.ts
   
   # Using custom configuration
   bun run src/index.ts --config ./config/main.yaml
   ```

## 📋 Configuration

### Configuration Structure

The application supports two configuration modes:

1. **Main Configuration** (recommended): Uses `main.yaml` as entry point
2. **Legacy Configuration**: Single `proxy.yaml` file

#### Main Configuration Structure

```
config/
├── main.yaml              # Main configuration entry point
├── proxy.yaml             # Proxy routes and settings
├── processes.yaml         # Process management configuration
└── backup/                # Configuration backups
    ├── main.backup-*.yaml
    ├── proxy.backup-*.yaml
    └── processes.backup-*.yaml
```

#### Directory Structure

```
data/
├── temp/                  # Temporary files
├── statistics/            # Statistics data
└── cache/                # Cache files

logs/
└── statistics/           # Statistics reports

certificates/             # SSL certificates
```

### Main Configuration (`main.yaml`)

```yaml
# Management Console Configuration
management:
  port: 4481
  host: "0.0.0.0"
  cors:
    enabled: true
    origin: ["http://localhost:3000"]
    credentials: true

# Configuration File References
config:
  proxy: "./config/proxy.yaml"
  processes: "./config/processes.yaml"

# Global Settings
settings:
  dataDir: "./data"
  logsDir: "./logs"
  certificatesDir: "./certificates"
  tempDir: "./data/temp"
  statsDir: "./data/statistics"
  cacheDir: "./data/cache"
  backupDir: "./config/backup"
  
  statistics:
    enabled: true
    backupInterval: 86400000  # 24 hours
    retentionDays: 30
  
  cache:
    enabled: true
    maxAge: 86400000  # 24 hours
    maxSize: "100MB"
    cleanupInterval: 3600000  # 1 hour

# Development Settings
development:
  debug: false
  verbose: false
  hotReload: false
```

### Command Line Arguments

- `--config <path>`: Specify the main configuration file path
- `--no-watch`: Disable configuration file watching
- `--create-config <path>`: Create an example configuration file

### Environment Variables

- `MAIN_CONFIG_FILE`: Path to main configuration file
- `CONFIG_FILE`: Path to legacy configuration file
- `DISABLE_CONFIG_WATCH`: Set to 'true' to disable config watching

## 💾 Backup System

Configuration files are automatically backed up when modified through the management console. Backups are stored in the `config/backup/` directory with timestamps:

- `main.backup-YYYY-MM-DDTHH-MM-SS-sssZ.yaml`
- `proxy.backup-YYYY-MM-DDTHH-MM-SS-sssZ.yaml`
- `processes.backup-YYYY-MM-DDTHH-MM-SS-sssZ.yaml`

Backups can be managed through the management console API:
- `POST /api/config/:type/backup` - Create backup
- `GET /api/config/:type/backups` - List backups
- `POST /api/config/:type/restore` - Restore from backup

## 📊 Management Interface

Access the management console at `http://localhost:4481` (or the configured port) to:

- View and edit configurations
- Monitor processes
- View statistics
- Manage backups
- Monitor system status

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

### Configuration Management

```bash
# Create backup
POST /api/config/:type/backup

# List backups
GET /api/config/:type/backups

# Restore from backup
POST /api/config/:type/restore
```

## 🧪 Testing

Run the test suite to verify functionality:

```bash
# Run all tests
bun run test

# Test backup functionality
bun run testing_scripts/test-backup-functionality.js
```

## 🚀 Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run start

# Run tests
bun run test

# Create example configuration
bun run src/index.ts --create-config ./config/example.yaml
```

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Support

For support and questions:

- Create an issue on GitHub
- Check the documentation
- Review the example configurations

---

**Note**: This is a production-ready reverse proxy server with enterprise-grade features. Make sure to properly configure security settings and monitor the server in production environments.

## CORS Configuration

The `cors` option allows you to configure Cross-Origin Resource Sharing (CORS) for your proxy routes. You can enable CORS with default settings or provide a detailed configuration.

### Simple CORS (Boolean)

```yaml
routes:
  - domain: api.example.com
    target: http://localhost:3000
    cors: true  # Enable CORS with default settings
```

### Advanced CORS Configuration

```yaml
routes:
  - domain: api.example.com
    target: http://localhost:3000
    cors:
      enabled: true
      origin: ["https://app.example.com", "https://admin.example.com"]
      credentials: true
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
      exposedHeaders: ["X-Total-Count", "X-Page-Count"]
      maxAge: 86400
```

### CORS Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Whether CORS is enabled |
| `origin` | boolean/string/string[] | true | Allowed origins (true = all origins) |
| `credentials` | boolean | false | Allow credentials (cookies, authorization headers) |
| `methods` | string[] | See below | Allowed HTTP methods |
| `allowedHeaders` | string[] | See below | Headers allowed in requests |
| `exposedHeaders` | string[] | See below | Headers exposed to client |
| `maxAge` | number | 86400 | Preflight cache duration in seconds |
| `preflightContinue` | boolean | false | Continue preflight requests |
| `optionsSuccessStatus` | number | 204 | Status code for OPTIONS requests |

### Default Values

If not specified, the following defaults are used:

- **Methods**: `["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"]`
- **Allowed Headers**: `["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]`
- **Exposed Headers**: `["Content-Length", "Content-Type"]`

### Examples

**Allow specific origins:**
```yaml
cors:
  origin: ["https://app.example.com", "https://admin.example.com"]
```

**Allow all origins:**
```yaml
cors:
  origin: true
```

**Disable CORS:**
```yaml
cors:
  enabled: false
```

**Custom headers:**
```yaml
cors:
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Custom-Header"]
  exposedHeaders: ["X-Total-Count", "X-Page-Count"]
```

## Configuration Backups

The proxy server includes an automatic backup system to ensure configuration files are not lost. Backups are stored in the `config/backup/` directory with timestamps.

### Backup System

Configuration files are automatically backed up when modified through the management console. Backups are stored in the `config/backup/` directory with timestamps:

- `main.backup-YYYY-MM-DDTHH-MM-SS-sssZ.yaml`
- `proxy.backup-YYYY-MM-DDTHH-MM-SS-sssZ.yaml`
- `processes.backup-YYYY-MM-DDTHH-MM-SS-sssZ.yaml`

Backups can be managed through the management console API:
- `POST /api/config/:type/backup` - Create backup
- `GET /api/config/:type/backups` - List backups
- `POST /api/config/:type/restore` - Restore from backup

## Management Console

Access the management console at `http://localhost:4481` (or the configured port) to:

- View and edit configurations
- Monitor processes
- View statistics
- Manage backups
- Monitor system status

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run start

# Run tests
bun run test

# Create example configuration
bun run src/index.ts --create-config ./config/example.yaml
```

## Cache Expiration for CORS Proxy

The disk cache for CORS proxy responses expires after a configurable time. By default, cached responses expire after 24 hours.

To change the expiration, set the `maxAge` option (in milliseconds) under the `settings.cache` block in your `main.yaml`:

```yaml
settings:
  cache:
    maxAge: 43200000  # 12 hours (in milliseconds)
```

If not set, the default is 24 hours (86400000 ms). 