# Configuration Overview

Understanding the configuration system and file structure of the Advanced Reverse Proxy Server.

## 📁 Configuration Structure

The proxy server uses a modular configuration system with multiple YAML files:

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

## 🔧 Configuration Files

### 1. Main Configuration (`main.yaml`)

The main configuration file serves as the entry point and defines:

- **Management Console**: Port, host, and CORS settings
- **File References**: Paths to other configuration files
- **Global Settings**: Directories, statistics, and cache settings
- **Development Settings**: Debug and verbose logging options

```yaml
management:
  port: 4481
  host: "0.0.0.0"
  cors:
    enabled: true
    origin: ["http://localhost:3000"]
    credentials: true

config:
  proxy: "./config/proxy.yaml"
  processes: "./config/processes.yaml"

settings:
  dataDir: "./data"
  logsDir: "./logs"
  certificatesDir: "./certificates"
  # ... other settings
```

### 2. Proxy Configuration (`proxy.yaml`)

Defines the reverse proxy behavior:

- **Server Settings**: Ports and SSL configuration
- **Routes**: Domain-based routing rules
- **Let's Encrypt**: SSL certificate management
- **Security**: Rate limiting and CSP settings

```yaml
port: 80
httpsPort: 443

letsEncrypt:
  email: "admin@example.com"
  staging: true
  certDir: "./certificates"

routes:
  - domain: "example.com"
    target: "http://localhost:3000"
    path: "/"
    type: "proxy"
    ssl: true
```

### 3. Process Configuration (`processes.yaml`)

Manages backend processes:

- **Process Definitions**: Commands, arguments, and environment
- **Health Checks**: Monitoring and restart policies
- **Environment Variables**: Process-specific configuration
- **Scheduling**: Cron-based process management

```yaml
processes:
  my-app:
    name: "My Application"
    command: "node"
    args: ["app.js"]
    env:
      NODE_ENV: "production"
      PORT: "3000"
    healthCheck:
      enabled: true
      path: "/health"
      interval: 30000
```

## 🔄 Configuration Loading

### Loading Order

1. **Environment Variables**: Override configuration values
2. **Command Line Arguments**: Specify configuration file path
3. **Main Configuration**: Load `main.yaml` and referenced files
4. **Validation**: Validate all configuration files
5. **Hot Reload**: Watch for configuration changes

### Environment Variable Overrides

```bash
# Override configuration file path
export MAIN_CONFIG_FILE="./config/custom-main.yaml"

# Override management console settings
export MANAGEMENT_PORT=4482
export MANAGEMENT_HOST="127.0.0.1"

# Override directory paths
export DATA_DIR="/var/lib/proxy"
export LOGS_DIR="/var/log/proxy"
export CERTIFICATES_DIR="/etc/proxy/certificates"
```

### Command Line Arguments

```bash
# Specify custom configuration file
bun run src/index.ts --config ./config/custom-main.yaml

# Create example configuration
bun run src/index.ts --create-config ./config/example.yaml

# Disable configuration watching
bun run src/index.ts --no-watch
```

## 📊 Configuration Validation

### Automatic Validation

Configuration files are validated on startup and when modified:

- **YAML Syntax**: Valid YAML structure
- **Required Fields**: All required fields are present
- **Data Types**: Correct data types for each field
- **Value Ranges**: Ports, timeouts, and other numeric values
- **File Paths**: Referenced files and directories exist

### Validation Errors

Common validation errors and solutions:

```yaml
# ❌ Invalid port number
port: -1  # Must be between 1 and 65535

# ✅ Valid port number
port: 80

# ❌ Missing required field
routes:
  - domain: "example.com"
    # Missing 'target' for proxy route

# ✅ Complete route configuration
routes:
  - domain: "example.com"
    target: "http://localhost:3000"
    path: "/"
    type: "proxy"
```

### Manual Validation

```bash
# Validate configuration via API
curl -X POST http://localhost:4481/api/config/proxy/validate \
  -H "Content-Type: application/json" \
  -d @./config/proxy.yaml

# Check configuration syntax
yamllint ./config/main.yaml
yamllint ./config/proxy.yaml
yamllint ./config/processes.yaml
```

## 🔄 Hot Reload

### Configuration Watching

The server automatically watches for configuration changes:

- **File Modifications**: Detect when configuration files are modified
- **Automatic Reload**: Reload configuration without restart
- **Validation**: Validate changes before applying
- **Rollback**: Revert to previous configuration on errors

### Reload Triggers

Configuration is reloaded when:

1. **File Modified**: Any configuration file is saved
2. **API Request**: Manual reload via management API
3. **File System Events**: File creation, deletion, or modification

### Reload Process

```bash
# Manual reload via API
curl -X POST http://localhost:4481/api/config/reload

# Check reload status
curl http://localhost:4481/api/config/status
```

## 💾 Configuration Backups

### Automatic Backups

Configuration files are automatically backed up when modified:

- **Timestamped Files**: Backups include ISO timestamps
- **Organized Storage**: Backups stored in `config/backup/` directory
- **Version History**: Maintain history of configuration changes
- **Easy Restoration**: Restore from any backup point

### Backup Management

```bash
# Create manual backup
curl -X POST http://localhost:4481/api/config/proxy/backup

# List available backups
curl http://localhost:4481/api/config/proxy/backups

# Restore from backup
curl -X POST http://localhost:4481/api/config/proxy/restore \
  -H "Content-Type: application/json" \
  -d '{"backupFile": "proxy.backup-2024-01-01T00-00-00-000Z.yaml"}'
```

### Backup File Naming

```
config/backup/
├── main.backup-2024-01-01T00-00-00-000Z.yaml
├── proxy.backup-2024-01-01T00-00-00-000Z.yaml
└── processes.backup-2024-01-01T00-00-00-000Z.yaml
```

## 🔐 Security Considerations

### Configuration Security

- **File Permissions**: Restrict access to configuration files
- **Sensitive Data**: Use environment variables for secrets
- **Backup Security**: Secure backup directory access
- **Validation**: Prevent invalid configurations

### Best Practices

```bash
# Set proper file permissions
chmod 600 ./config/*.yaml
chmod 700 ./config/backup

# Use environment variables for secrets
export GOOGLE_CLIENT_SECRET="your-secret"
export DATABASE_PASSWORD="your-password"

# Restrict management console access
management:
  host: "127.0.0.1"  # Only localhost
  port: 4481
```

## 📝 Configuration Examples

### Development Configuration

```yaml
# config/main.yaml
management:
  port: 4481
  host: "0.0.0.0"
  cors:
    enabled: true
    origin: ["http://localhost:3000"]

development:
  debug: true
  verbose: true
  hotReload: true

settings:
  statistics:
    enabled: false  # Disable in development
  cache:
    enabled: false  # Disable in development
```

### Production Configuration

```yaml
# config/main.yaml
management:
  port: 4481
  host: "127.0.0.1"  # Restrict access
  cors:
    enabled: true
    origin: ["https://admin.example.com"]

development:
  debug: false
  verbose: false
  hotReload: false

settings:
  statistics:
    enabled: true
    backupInterval: 86400000
    retentionDays: 30
  cache:
    enabled: true
    maxAge: 86400000
    maxSize: "100MB"
```

### Multi-Environment Setup

```bash
# Development
cp config/main.yaml config/main-dev.yaml
cp config/proxy.yaml config/proxy-dev.yaml

# Staging
cp config/main.yaml config/main-staging.yaml
cp config/proxy.yaml config/proxy-staging.yaml

# Production
cp config/main.yaml config/main-prod.yaml
cp config/proxy.yaml config/proxy-prod.yaml
```

## 🔍 Configuration Debugging

### Debug Mode

Enable debug logging for configuration issues:

```yaml
# config/main.yaml
development:
  debug: true
  verbose: true
```

### Configuration Logs

```bash
# Check configuration loading logs
tail -f ./logs/proxy.log | grep -i config

# Check validation errors
tail -f ./logs/proxy.log | grep -i validation

# Check reload events
tail -f ./logs/proxy.log | grep -i reload
```

### Configuration Status

```bash
# Get current configuration status
curl http://localhost:4481/api/config/status

# Get configuration file info
curl http://localhost:4481/api/config/info
```

## 📚 Related Documentation

- **[Main Configuration](main-configuration.md)** - Detailed main configuration options
- **[Proxy Configuration](proxy-configuration.md)** - Proxy routes and settings
- **[Process Management](process-management.md)** - Process configuration
- **[Environment Variables](environment-variables.md)** - Environment variable support
- **[Backup System](backup-system.md)** - Configuration backup and restore
