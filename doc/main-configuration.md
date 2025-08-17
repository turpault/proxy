# Main Configuration (`main.yaml`)

The main configuration file (`main.yaml`) serves as the entry point for the Advanced Reverse Proxy Server. It defines the management console settings, references to other configuration files, and global application settings.

## 📋 Configuration Structure

```yaml
management:
  # Management console configuration
  port: 4481
  host: "0.0.0.0"
  cors:
    enabled: true
    origin: ["http://localhost:3000"]
    credentials: true

config:
  # References to other configuration files
  proxy: "./config/proxy.yaml"
  processes: "./config/processes.yaml"

settings:
  # Global application settings
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

development:
  # Development-specific settings
  debug: false
  verbose: false
  hotReload: false
```

## 🔧 Management Console Configuration

### `management.port`
- **Type**: `number`
- **Default**: `4481`
- **Description**: Port for the management console web interface
- **Example**: `4481`

### `management.host`
- **Type**: `string`
- **Default**: `"0.0.0.0"`
- **Description**: Host address to bind the management console to
- **Options**:
  - `"0.0.0.0"` - Bind to all interfaces (default)
  - `"127.0.0.1"` - Bind to localhost only
  - `"192.168.1.100"` - Bind to specific IP

### `management.cors`
CORS configuration for the management console API endpoints.

#### `management.cors.enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable CORS for management console

#### `management.cors.origin`
- **Type**: `string | string[]`
- **Default**: `["http://localhost:3000"]`
- **Description**: Allowed origins for CORS requests
- **Examples**:
  ```yaml
  origin: "https://admin.example.com"  # Single origin
  origin: ["https://admin.example.com", "https://dashboard.example.com"]  # Multiple origins
  origin: true  # Allow all origins (not recommended for production)
  ```

#### `management.cors.credentials`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Allow credentials (cookies, authorization headers) in CORS requests

## 📁 Configuration File References

### `config.proxy`
- **Type**: `string`
- **Default**: `"./config/proxy.yaml"`
- **Description**: Path to the proxy configuration file
- **Example**: `"./config/proxy.yaml"`

### `config.processes`
- **Type**: `string`
- **Default**: `"./config/processes.yaml"`
- **Description**: Path to the process management configuration file
- **Example**: `"./config/processes.yaml"`

## ⚙️ Global Settings

### Directory Configuration

#### `settings.dataDir`
- **Type**: `string`
- **Default**: `"./data"`
- **Description**: Base directory for application data
- **Example**: `"./data"`

#### `settings.logsDir`
- **Type**: `string`
- **Default**: `"./logs"`
- **Description**: Directory for log files
- **Example**: `"./logs"`

#### `settings.certificatesDir`
- **Type**: `string`
- **Default**: `"./certificates"`
- **Description**: Directory for SSL certificates
- **Example**: `"./certificates"`

#### `settings.tempDir`
- **Type**: `string`
- **Default**: `"./data/temp"`
- **Description**: Directory for temporary files
- **Example**: `"./data/temp"`

#### `settings.statsDir`
- **Type**: `string`
- **Default**: `"./data/statistics"`
- **Description**: Directory for statistics data
- **Example**: `"./data/statistics"`

#### `settings.cacheDir`
- **Type**: `string`
- **Default**: `"./data/cache"`
- **Description**: Directory for cache files
- **Example**: `"./data/cache"`

#### `settings.backupDir`
- **Type**: `string`
- **Default**: `"./config/backup"`
- **Description**: Directory for configuration backups
- **Example**: `"./config/backup"`

### Statistics Configuration

#### `settings.statistics.enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable request statistics and geolocation tracking

#### `settings.statistics.backupInterval`
- **Type**: `number`
- **Default**: `86400000` (24 hours)
- **Description**: Interval in milliseconds for automatic statistics backup
- **Examples**:
  ```yaml
  backupInterval: 3600000   # 1 hour
  backupInterval: 86400000  # 24 hours
  backupInterval: 604800000 # 1 week
  ```

#### `settings.statistics.retentionDays`
- **Type**: `number`
- **Default**: `30`
- **Description**: Number of days to retain statistics data
- **Example**: `30`

### Cache Configuration

#### `settings.cache.enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable response caching

#### `settings.cache.maxAge`
- **Type**: `number`
- **Default**: `86400000` (24 hours)
- **Description**: Maximum age of cached responses in milliseconds
- **Examples**:
  ```yaml
  maxAge: 3600000   # 1 hour
  maxAge: 86400000  # 24 hours
  maxAge: 604800000 # 1 week
  ```

#### `settings.cache.maxSize`
- **Type**: `string`
- **Default**: `"100MB"`
- **Description**: Maximum cache size
- **Examples**:
  ```yaml
  maxSize: "50MB"
  maxSize: "100MB"
  maxSize: "1GB"
  ```

#### `settings.cache.cleanupInterval`
- **Type**: `number`
- **Default**: `3600000` (1 hour)
- **Description**: Interval in milliseconds for cache cleanup
- **Examples**:
  ```yaml
  cleanupInterval: 1800000  # 30 minutes
  cleanupInterval: 3600000  # 1 hour
  cleanupInterval: 7200000  # 2 hours
  ```

## 🛠️ Development Settings

### `development.debug`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable debug logging
- **Example**: `true`

### `development.verbose`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable verbose logging
- **Example**: `true`

### `development.hotReload`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable hot reload for development
- **Example**: `true`

## 📝 Complete Example

```yaml
# Management Console Configuration
management:
  port: 4481
  host: "0.0.0.0"
  cors:
    enabled: true
    origin: ["http://localhost:3000", "https://admin.example.com"]
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

## 🔄 Environment Variables

You can override configuration values using environment variables:

- `MAIN_CONFIG_FILE`: Path to main configuration file
- `MANAGEMENT_PORT`: Override management console port
- `MANAGEMENT_HOST`: Override management console host
- `DATA_DIR`: Override data directory
- `LOGS_DIR`: Override logs directory
- `CERTIFICATES_DIR`: Override certificates directory

## 📊 Command Line Arguments

```bash
# Specify custom configuration file
bun run src/index.ts --config ./config/custom-main.yaml

# Create example configuration
bun run src/index.ts --create-config ./config/example-main.yaml

# Disable configuration file watching
bun run src/index.ts --no-watch
```

## 🔍 Validation

The configuration is validated on startup. Common validation errors:

- **Invalid port numbers**: Must be between 1 and 65535
- **Invalid file paths**: Referenced configuration files must exist
- **Invalid directory paths**: Data directories must be writable
- **Invalid cache size**: Must be a valid size string (e.g., "100MB")

## 📚 Related Documentation

- **[Proxy Configuration](proxy-configuration.md)** - Configure proxy routes and SSL
- **[Process Management](process-management.md)** - Configure backend processes
- **[Environment Variables](environment-variables.md)** - Environment variable support
- **[Management Console](management-console.md)** - Web-based administration interface
