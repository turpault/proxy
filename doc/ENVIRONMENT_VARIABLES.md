# Environment Variables

The Advanced Reverse Proxy Server provides comprehensive environment variable support for configuration, process management, and runtime customization.

## 🔧 Configuration Environment Variables

### Main Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MAIN_CONFIG_FILE` | Path to main configuration file | `./config/main.yaml` |
| `CONFIG_FILE` | Path to legacy configuration file | `./config/proxy.yaml` |
| `DISABLE_CONFIG_WATCH` | Disable configuration file watching | `false` |

### Management Console

| Variable | Description | Default |
|----------|-------------|---------|
| `MANAGEMENT_PORT` | Management console port | `4481` |
| `MANAGEMENT_HOST` | Management console host | `0.0.0.0` |

### Directory Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_DIR` | Base data directory | `./data` |
| `LOGS_DIR` | Log files directory | `./logs` |
| `CERTIFICATES_DIR` | SSL certificates directory | `./certificates` |
| `TEMP_DIR` | Temporary files directory | `./data/temp` |
| `STATS_DIR` | Statistics data directory | `./data/statistics` |
| `CACHE_DIR` | Cache files directory | `./data/cache` |
| `BACKUP_DIR` | Configuration backups directory | `./config/backup` |

## 🔄 Process Environment Variables

### Basic Environment Variable Assignment

```yaml
processes:
  my-app:
    name: "My Application"
    command: "node"
    args: ["app.js"]
    env:
      NODE_ENV: "production"
      PORT: "3000"
      APP_NAME: "My App"
```

### Environment Variable Inheritance

Processes automatically inherit environment variables from the parent process (proxy server), excluding proxy-specific variables like `PORT`, `HTTPS_PORT`, `CONFIG_FILE`, etc.

## Environment Variable Substitution

### Basic Substitution

Use `${VAR_NAME}` syntax to substitute environment variables:

```yaml
processes:
  my-app:
    name: "My Application"
    command: "node"
    args: ["app.js"]
    env:
      NODE_ENV: "production"
      PORT: "3000"
      # Substitute other environment variables
      DATABASE_URL: "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
      LOG_LEVEL: "${LOG_LEVEL:-info}"  # Use default value if not set
```

### Default Values

Use `${VAR_NAME:-default}` syntax to provide default values:

```yaml
env:
  FEATURE_FLAG: "${FEATURE_FLAG:-disabled}"
  CACHE_TTL: "${CACHE_TTL:-3600}"
  APP_VERSION: "${APP_VERSION:-1.0.0}"
```

### Special Variables

The following special variables are automatically available:

- `${PROCESS_ID}` or `${PROXY_PROCESS_ID}`: Process ID
- `${PROCESS_NAME}` or `${PROXY_PROCESS_NAME}`: Process name
- `${TIMESTAMP}`: Current timestamp in ISO format
- `${RANDOM}`: Random string (useful for secrets)

```yaml
env:
  PROCESS_INFO: "Process ${PROCESS_NAME} (ID: ${PROCESS_ID}) started at ${TIMESTAMP}"
  SESSION_SECRET: "${RANDOM}"
  INSTANCE_ID: "${PROCESS_ID}"
```

## Environment Variable Validation

### Required Environment Variables

Specify required environment variables that must be present:

```yaml
processes:
  my-app:
    name: "My Application"
    command: "node"
    args: ["app.js"]
    env:
      DATABASE_URL: "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    envValidation:
      required: ["DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME"]
      validateOnStart: true
      failOnMissing: true
```

### Optional Environment Variables

Validate optional environment variables if they are present:

```yaml
envValidation:
  required: ["NODE_ENV", "PORT"]
  optional: ["FEATURE_FLAG", "CACHE_TTL", "DEBUG"]
  validateOnStart: true
  failOnMissing: false  # Don't fail if optional vars are missing
```

### Validation Options

- `required`: Array of required environment variable names
- `optional`: Array of optional environment variable names to validate if present
- `validateOnStart`: Whether to validate on process start (default: true)
- `failOnMissing`: Whether to fail process start if required variables are missing (default: true)

### Legacy Support

For backward compatibility, you can also use the `requiredEnv` property:

```yaml
processes:
  my-app:
    name: "My Application"
    command: "node"
    args: ["app.js"]
    requiredEnv: ["DB_USER", "DB_PASSWORD"]  # Legacy syntax
```

## Security Features

### Automatic Sensitive Variable Detection

The system automatically detects and masks sensitive environment variables in logs:

```yaml
env:
  # These will be automatically detected as sensitive
  JWT_SECRET: "${JWT_SECRET}"
  API_KEY: "${API_KEY}"
  DATABASE_PASSWORD: "${DB_PASSWORD}"
  OAUTH_CLIENT_SECRET: "${OAUTH_SECRET}"
  ACCESS_TOKEN: "${ACCESS_TOKEN}"
  REFRESH_TOKEN: "${REFRESH_TOKEN}"
```

Sensitive variables are detected by keywords in their names:
- `PASSWORD`, `SECRET`, `KEY`, `TOKEN`, `AUTH`, `CREDENTIAL`, `PRIVATE`
- `API_KEY`, `API_SECRET`, `DATABASE_URL`, `DB_PASSWORD`, `JWT_SECRET`
- `OAUTH_SECRET`, `CLIENT_SECRET`, `ACCESS_TOKEN`, `REFRESH_TOKEN`

### Secure Logging

Sensitive environment variables are never logged with their values. Instead, the system logs:
- Total number of environment variables
- Number of custom environment variables
- Number of sensitive environment variables detected
- Names of non-sensitive custom environment variables

## Advanced Examples

### Multi-Language Environment Setup

#### Node.js Application

```yaml
node-app:
  name: "Node.js Application"
  command: "node"
  args: ["app.js"]
  env:
    NODE_ENV: "production"
    PORT: "3000"
    NODE_OPTIONS: "--max-old-space-size=4096"
    PROCESS_NAME: "${PROCESS_NAME}"
  envValidation:
    required: ["NODE_ENV", "PORT"]
    validateOnStart: true
```

#### Python Application

```yaml
python-app:
  name: "Python Application"
  command: "python"
  args: ["app.py"]
  env:
    PYTHONPATH: "${PYTHONPATH}:/app"
    PYTHONUNBUFFERED: "1"
    FLASK_ENV: "production"
    FLASK_APP: "app.py"
  envValidation:
    required: ["PYTHONPATH"]
    validateOnStart: true
```

#### Java Application

```yaml
java-app:
  name: "Java Application"
  command: "java"
  args: ["-jar", "app.jar"]
  env:
    JAVA_OPTS: "-Xmx2g -Xms1g -Dprocess.name=${PROCESS_NAME}"
    SPRING_PROFILES_ACTIVE: "production"
    SERVER_PORT: "8080"
    SPRING_DATASOURCE_URL: "jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}"
    SPRING_DATASOURCE_USERNAME: "${DB_USER}"
    SPRING_DATASOURCE_PASSWORD: "${DB_PASSWORD}"
  envValidation:
    required: ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]
    validateOnStart: true
    failOnMissing: true
```

### Conditional Configuration

```yaml
conditional-app:
  name: "Conditional App"
  command: "node"
  args: ["app.js"]
  env:
    NODE_ENV: "production"
    PORT: "3000"
    # Use environment-specific configuration
    FEATURE_FLAG: "${FEATURE_FLAG:-disabled}"
    CACHE_TTL: "${CACHE_TTL:-3600}"
    DEBUG: "${DEBUG:-false}"
    # Use process-specific variables
    INSTANCE_ID: "${PROCESS_ID}"
    START_TIME: "${TIMESTAMP}"
  envValidation:
    required: ["NODE_ENV", "PORT"]
    optional: ["FEATURE_FLAG", "CACHE_TTL", "DEBUG"]
    validateOnStart: true
    failOnMissing: false
```

### Database Connection with Substitution

```yaml
database-app:
  name: "Database Application"
  command: "node"
  args: ["db-app.js"]
  env:
    NODE_ENV: "production"
    PORT: "3000"
    # Build database URL from components
    DATABASE_URL: "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSL_MODE:-require}"
    # Redis connection
    REDIS_URL: "redis://${REDIS_HOST:-localhost}:${REDIS_PORT:-6379}"
    # Application configuration
    SESSION_SECRET: "${SESSION_SECRET:-${RANDOM}}"
    API_KEY: "${API_KEY}"
  envValidation:
    required: ["DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME", "API_KEY"]
    optional: ["DB_SSL_MODE", "REDIS_HOST", "REDIS_PORT", "SESSION_SECRET"]
    validateOnStart: true
    failOnMissing: true
```

## Best Practices

### 1. Use Environment Variable Substitution

Instead of hardcoding values, use substitution to reference other environment variables:

```yaml
# Good
DATABASE_URL: "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Avoid
DATABASE_URL: "postgresql://user:pass@localhost:5432/mydb"
```

### 2. Provide Default Values

Use default values for optional configuration:

```yaml
env:
  LOG_LEVEL: "${LOG_LEVEL:-info}"
  CACHE_TTL: "${CACHE_TTL:-3600}"
  FEATURE_FLAG: "${FEATURE_FLAG:-disabled}"
```

### 3. Validate Required Variables

Always validate required environment variables:

```yaml
envValidation:
  required: ["DB_USER", "DB_PASSWORD", "API_KEY"]
  validateOnStart: true
  failOnMissing: true
```

### 4. Use Sensitive Variable Detection

Let the system automatically detect and mask sensitive variables:

```yaml
env:
  JWT_SECRET: "${JWT_SECRET}"
  API_KEY: "${API_KEY}"
  DATABASE_PASSWORD: "${DB_PASSWORD}"
```

### 5. Use Process-Specific Variables

Leverage process-specific variables for dynamic configuration:

```yaml
env:
  PROCESS_INFO: "Process ${PROCESS_NAME} (ID: ${PROCESS_ID})"
  INSTANCE_ID: "${PROCESS_ID}"
  START_TIME: "${TIMESTAMP}"
```

## Troubleshooting

### Missing Environment Variables

If a process fails to start due to missing environment variables, check:

1. The `envValidation.required` list
2. Whether the variables are set in the parent environment
3. The `failOnMissing` setting

### Substitution Issues

If environment variable substitution isn't working:

1. Check that the referenced variables exist
2. Verify the syntax: `${VAR_NAME}` or `${VAR_NAME:-default}`
3. Check the logs for substitution warnings

### Sensitive Variable Logging

If sensitive variables appear in logs:

1. Check that the variable name contains sensitive keywords
2. Verify that the variable is being set through the `env` configuration
3. Check the log level (sensitive variable detection is at debug level)

## API Reference

### ProcessConfig Environment Properties

```typescript
interface ProcessConfig {
  env?: Record<string, string>;
  requiredEnv?: string[]; // Legacy support
  envValidation?: {
    required?: string[];
    optional?: string[];
    validateOnStart?: boolean;
    failOnMissing?: boolean;
  };
}
```

### Special Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `${PROCESS_ID}` | Process ID | `my-app` |
| `${PROCESS_NAME}` | Process name | `My Application` |
| `${TIMESTAMP}` | Current timestamp | `2024-01-15T10:30:00.000Z` |
| `${RANDOM}` | Random string | `a1b2c3d4e5f6` |

### Default Value Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `${VAR:-default}` | Use default if variable not set | `${LOG_LEVEL:-info}` |
| `${VAR}` | Use variable value or empty string | `${PORT}` | 