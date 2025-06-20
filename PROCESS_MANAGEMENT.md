# Process Management

The proxy server now supports independent process management, allowing you to configure and manage backend processes separately from proxy routes.

## Configuration Structure

Process management is configured in a separate YAML file (`config/processes.yaml`) that is referenced in the main proxy configuration.

### Main Proxy Configuration

In your `config/proxy.yaml`, add a reference to the process management configuration:

```yaml
# Process management configuration file (independent of routes)
processConfigFile: "./config/processes.yaml"
```

### Process Management Configuration

The `config/processes.yaml` file contains:

```yaml
# Process Management Configuration
processes:
  # Process ID (used for management)
  bds-server:
    enabled: true
    command: "npm"
    args: ["start", "--", "--config", "/path/to/config"]
    cwd: "../bdreader-server"
    env:
      NODE_ENV: "production"
      PORT: "8888"
    restartOnExit: true
    restartDelay: 2000
    maxRestarts: 10
    pidDir: "./pids"
    cleanupPidOnExit: true
    healthCheck:
      enabled: true
      path: "http://localhost:8888/health"
      interval: 30000
      timeout: 5000
      retries: 3

# Global settings
settings:
  defaultHealthCheck:
    enabled: true
    interval: 30000
    timeout: 5000
    retries: 3
  defaultRestart:
    restartOnExit: true
    restartDelay: 2000
    maxRestarts: 10
  pidManagement:
    defaultPidDir: "./pids"
    cleanupPidOnExit: true
  logging:
    logProcessOutput: true
    logHealthChecks: false
    logRestarts: true
```

## Process Configuration Options

### Basic Configuration
- `enabled`: Whether the process should be started (default: true)
- `command`: The command to execute
- `args`: Array of command arguments
- `cwd`: Working directory for the process
- `env`: Environment variables for the process

### Restart Configuration
- `restartOnExit`: Whether to restart the process when it exits (default: true)
- `restartDelay`: Delay in milliseconds before restarting (default: 2000)
- `maxRestarts`: Maximum number of restart attempts (default: 10)

### PID File Management
- `pidFile`: Specific PID file path (optional)
- `pidDir`: Directory to store PID files (optional, defaults to `./pids`)
- `cleanupPidOnExit`: Whether to remove PID file when process exits (default: true)

### Health Check Configuration
- `healthCheck.enabled`: Whether to perform health checks (default: false)
- `healthCheck.path`: Health check endpoint URL or path (default: `/health`)
  - Can be a full URL: `"http://localhost:8888/health"`
  - Or a relative path: `"/health"` (will be appended to the process target URL)
- `healthCheck.interval`: Health check interval in milliseconds (default: 30000)
- `healthCheck.timeout`: Health check timeout in milliseconds (default: 5000)
- `healthCheck.retries`: Number of failed health checks before considering process unhealthy (default: 3)

## Management API

The proxy server provides a management API for controlling processes:

### List All Processes
```http
GET /api/processes
```

### Get Process Details
```http
GET /api/processes/{processId}
```

### Start Process
```http
POST /api/processes/{processId}/start
```

### Stop Process
```http
POST /api/processes/{processId}/stop
```

### Restart Process
```http
POST /api/processes/{processId}/restart
```

### Get Process Logs
```http
GET /api/processes/{processId}/logs?lines=100
```

### Get Server Status
```http
GET /api/status
```

## Process Lifecycle

1. **Startup**: When the proxy server starts, it reads the process management configuration and starts all enabled processes.

2. **Monitoring**: Each process is monitored for:
   - Process exit (with automatic restart if configured)
   - Health check failures (if health checks are enabled)
   - PID file management

3. **Reconnection**: If a process is already running (detected via PID file), the proxy will reconnect to it instead of starting a new one.

4. **Shutdown**: When the proxy server shuts down, it gracefully stops all managed processes.

## Benefits of Independent Process Management

1. **Separation of Concerns**: Process configuration is separate from route configuration
2. **Reusability**: Processes can be referenced by multiple routes
3. **Flexibility**: Process management can be enabled/disabled independently
4. **Maintainability**: Easier to manage and update process configurations
5. **Scalability**: Can easily add new processes without modifying route configurations

## Example: Multiple Routes Using Same Process

```yaml
# config/processes.yaml
processes:
  photos-server:
    enabled: true
    command: "npm"
    args: ["start", "--", "--config", "/path/to/photos-config"]
    cwd: "../bdreader-server"
    env:
      NODE_ENV: "production"
      PORT: "8892"

# config/proxy.yaml
routes:
  - domain: "home.turpault.me"
    type: "proxy"
    path: "/photos"
    target: "http://localhost:8892"
    ssl: true
    rewrite:
      "^/photos/": "/"

  - domain: "home.turpault.me"
    type: "proxy"
    path: "/app2"
    target: "http://localhost:8892"
    ssl: true
    rewrite:
      "^/app2/": "/"
```

Both routes use the same managed process (`photos-server`), demonstrating the reusability of the independent process management system. 