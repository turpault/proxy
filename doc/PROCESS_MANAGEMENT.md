# Process Management

The proxy server includes a comprehensive process management system that can automatically launch, monitor, and restart backend processes for your applications.

## Features

- **🚀 Automatic Process Launching**: Start processes when the proxy starts
- **🔄 Auto-Restart**: Restart processes when they exit unexpectedly
- **❤️ Health Monitoring**: HTTP health checks with automatic restart on failure
- **📊 Process Monitoring**: Track process status, uptime, and restart counts
- **🔌 Output Proxying**: Capture and log stdout/stderr with process identification
- **🛑 Graceful Shutdown**: Proper process termination on proxy shutdown
- **⚙️ Environment Control**: Custom working directories and environment variables

## Configuration

Process management is configured in a separate `config/processes.yaml` file:

```yaml
# Process Management Configuration
# This file defines the processes that will be managed by the proxy server

processes:
  # Example Server 1
  example-server-1:
    enabled: true
    name: "Example Server 1"
    description: "First example application server"
    command: "node"
    args: ["index.ts","--config","/path/to/example-config-1"]
    cwd: "/path/to/example-app-1"
    env:
      NODE_ENV: "production"
      PORT: "3001"
    pidFile: "./pids/example-server-1.pid"
    logFile: "./logs/example-server-1.log"
    restartPolicy:
      maxAttempts: 3
      delay: 5000
    healthCheck:
      enabled: true
      url: "http://localhost:3001/health"
      interval: 30000
      timeout: 5000

  # Example Server 2
  example-server-2:
    enabled: true
    name: "Example Server 2"
    description: "Second example application server"
    command: "node"
    args: ["index.ts","--config","/path/to/example-config-2"]
    cwd: "/path/to/example-app-2"
    env:
      NODE_ENV: "production"
      PORT: "3002"
    pidFile: "./pids/example-server-2.pid"
    logFile: "./logs/example-server-2.log"
    restartPolicy:
      maxAttempts: 3
      delay: 5000
    healthCheck:
      enabled: true
      url: "http://localhost:3002/health"
      interval: 30000
      timeout: 5000

  # Example Server 3
  example-server-3:
    enabled: true
    name: "Example Server 3"
    description: "Third example application server"
    command: "node"
    args: ["index.ts","--config","/path/to/example-config-3"]
    cwd: "/path/to/example-app-3"
    env:
      NODE_ENV: "production"
      PORT: "3003"
    pidFile: "./pids/example-server-3.pid"
    logFile: "./logs/example-server-3.log"
    restartPolicy:
      maxAttempts: 3
      delay: 5000
    healthCheck:
      enabled: true
      url: "http://localhost:3003/health"
      interval: 30000
      timeout: 5000
```

## Process Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable process management |
| `name` | string | **required** | Human-readable process name |
| `description` | string | `""` | Process description |
| `command` | string | **required** | Command to execute |
| `args` | array | `[]` | Command line arguments |
| `cwd` | string | `process.cwd()` | Working directory |
| `env` | object | `{}` | Environment variables |
| `pidFile` | string | `./pids/{id}.pid` | PID file location |
| `logFile` | string | `./logs/{id}.log` | Log file location |
| `restartPolicy` | object | See below | Restart policy configuration |
| `healthCheck` | object | See below | Health check configuration |

### Restart Policy Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | number | `3` | Maximum restart attempts |
| `delay` | number | `5000` | Delay before restart (ms) |

### Health Check Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable health checks |
| `url` | string | `"/health"` | Health check endpoint URL |
| `interval` | number | `30000` | Check interval (ms) |
| `timeout` | number | `5000` | Request timeout (ms) |

## Integration with Proxy Routes

Processes can be referenced in proxy routes for automatic management:

```yaml
# In config/proxy.yaml
routes:
  - domain: "example.com"
    path: "/app1"
    target: "http://localhost:3001"
    process: "example-server-1"  # Reference to process in processes.yaml
    ssl: true

  - domain: "example.com"
    path: "/app2"
    target: "http://localhost:3002"
    process: "example-server-2"
    ssl: true

  # Both routes use the same managed process, demonstrating the reusability of the independent process management system.
  - domain: "example.com"
    path: "/app3"
    target: "http://localhost:3003"
    process: "example-server-3"
    ssl: true

  - domain: "api.example.com"
    path: "/api"
    target: "http://localhost:3003"
    process: "example-server-3"
    ssl: true
```

Both routes use the same managed process (`example-server-3`), demonstrating the reusability of the independent process management system.

## Management API

The process management system provides a REST API for monitoring and controlling processes:

### Get All Processes

```bash
GET /api/processes
```

Response:
```json
{
  "processes": [
    {
      "id": "example-server-1",
      "name": "Example Server 1",
      "description": "First example application server",
      "isRunning": true,
      "pid": 12345,
      "startTime": "2024-01-01T12:00:00.000Z",
      "uptime": 3600000,
      "restartCount": 0,
      "healthCheckFailures": 0,
      "lastHealthCheck": "2024-01-01T12:30:00.000Z"
    }
  ]
}
```

### Start a Process

```bash
POST /api/processes/{id}/start
```

### Stop a Process

```bash
POST /api/processes/{id}/stop
```

### Restart a Process

```bash
POST /api/processes/{id}/restart
```

### Get Process Logs

```bash
GET /api/processes/{id}/logs?lines=100
```

### Reload Process Configuration

```bash
POST /api/processes/reload
```

## Health Check Endpoint

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
        "id": "example-server-1",
        "name": "Example Server 1",
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

## Log Output

Process output is automatically captured and logged:

```
[2024-01-01T12:00:00.000Z] info: [example-server-1] STDOUT: Server listening on port 3001
[2024-01-01T12:00:01.000Z] warn: [example-server-1] STDERR: Warning: Deprecated API usage
[2024-01-01T12:00:02.000Z] info: Process example-server-1 started successfully {"pid":12345,"command":"node"}
```

## Best Practices

1. **Health Checks**: Enable health checks for critical services
2. **Restart Limits**: Set appropriate `maxAttempts` for production environments
3. **Working Directories**: Use `cwd` for applications with relative paths
4. **Environment Variables**: Use `env` for configuration instead of hardcoding
5. **Process Identification**: Process IDs are auto-generated from the configuration key
6. **Graceful Shutdown**: Processes receive SIGTERM with 5-second grace period

## Limitations

- Process management is designed for simple applications
- For complex deployments, consider dedicated process managers (PM2, systemd)
- Health checks require HTTP endpoints (not suitable for all applications)
- No support for process clustering or load balancing

## Example Use Cases

### Node.js API Server

```yaml
example-api-server:
  enabled: true
  name: "Example API Server"
  description: "REST API server for example application"
  command: "node"
  args: ["index.js"]
  cwd: "./api-server"
  env:
    NODE_ENV: "production"
    PORT: "3001"
  healthCheck:
    enabled: true
    url: "http://localhost:3001/health"
```

### Python Flask Application

```yaml
example-flask-app:
  enabled: true
  name: "Example Flask App"
  description: "Python Flask web application"
  command: "python"
  args: ["-m", "flask", "run", "--host=0.0.0.0"]
  cwd: "./flask-app"
  env:
    FLASK_APP: "app.py"
    FLASK_ENV: "production"
  healthCheck:
    enabled: true
    url: "http://localhost:5000/health"
```

### Static Site Build Process

```yaml
example-static-builder:
  enabled: true
  name: "Example Static Builder"
  description: "Build process for static site"
  command: "npm"
  args: ["run", "build:watch"]
  cwd: "./static-site"
  restartPolicy:
    maxAttempts: 3
    delay: 10000
``` 