# Dynamic Process Management

The proxy server now supports dynamic process management with file watching and hot reloading capabilities. This allows you to modify process configurations without restarting the entire proxy server.

## Features

### 🔄 Hot Reloading
- **File Watching**: Automatically monitors `processes.yaml` for changes
- **Live Updates**: Processes are started, stopped, or restarted based on configuration changes
- **Debounced Updates**: Prevents rapid-fire updates with 2-second debouncing
- **Configuration Validation**: Validates changes before applying them

### 📁 Independent Configuration Loading
- **Separate File**: Process configuration is loaded from `config/processes.yaml`
- **Dynamic Loading**: Configuration is loaded independently of the main proxy config
- **File Watching**: Real-time monitoring of configuration file changes
- **Error Handling**: Graceful handling of invalid configurations

### 🎛️ Management API
- **Manual Reload**: Force reload configuration via API endpoint
- **Process Status**: Real-time status of all managed processes
- **Individual Control**: Start, stop, restart individual processes
- **Log Access**: View process logs through the management interface

## Configuration

### Main Proxy Configuration

In your `config/proxy.yaml`, specify the process configuration file:

```yaml
# Process management configuration file (independent of routes)
processConfigFile: "./config/processes.yaml"
```

### Process Configuration File

The `config/processes.yaml` file is watched for changes:

```yaml
# Process Management Configuration
processes:
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
    healthCheck:
      enabled: true
      path: "http://localhost:8888/health"
      interval: 30000
      timeout: 5000
      retries: 3

  photos-server:
    enabled: true
    command: "npm"
    args: ["start", "--", "--config", "/path/to/photos-config"]
    cwd: "../bdreader-server"
    env:
      NODE_ENV: "production"
      PORT: "8892"
    restartOnExit: true
    restartDelay: 2000
    maxRestarts: 10

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

## Dynamic Updates

### Automatic File Watching

The proxy server automatically watches the `processes.yaml` file for changes:

1. **File Change Detection**: Uses Node.js `fs.watch()` to monitor the file
2. **Debounced Updates**: Waits 2 seconds after the last change before processing
3. **Configuration Validation**: Validates the new configuration before applying
4. **Process Management**: Starts, stops, or restarts processes as needed

### Update Scenarios

#### Adding a New Process
```yaml
# Add to processes.yaml
processes:
  new-service:
    enabled: true
    command: "node"
    args: ["server.js"]
    cwd: "./new-service"
    env:
      PORT: "3000"
```

**Result**: The new process is automatically started.

#### Removing a Process
```yaml
# Remove from processes.yaml or set enabled: false
processes:
  old-service:
    enabled: false  # or remove entirely
```

**Result**: The process is automatically stopped.

#### Modifying Process Configuration
```yaml
# Change any configuration
processes:
  existing-service:
    command: "npm"  # Changed from "node"
    args: ["start"]  # Changed arguments
    env:
      PORT: "3001"  # Changed port
```

**Result**: The process is automatically restarted with the new configuration.

#### Disabling Process Management
```yaml
# Set enabled: false for a process
processes:
  some-service:
    enabled: false
```

**Result**: The process is stopped and won't be restarted.

## Management API

### Manual Configuration Reload

Force a reload of the process configuration:

```http
POST /api/processes/reload
```

**Response:**
```json
{
  "success": true,
  "message": "Process configuration reloaded successfully"
}
```

### Process Status

Get the current status of all processes:

```http
GET /api/processes
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "bds-server",
      "enabled": true,
      "command": "npm",
      "args": ["start", "--", "--config", "/path/to/config"],
      "isRunning": true,
      "pid": 12345,
      "restartCount": 0,
      "startTime": "2024-01-01T12:00:00.000Z",
      "uptime": 3600000,
      "healthCheckFailures": 0,
      "pidFile": "./pids/bds-server.pid",
      "logFile": "./pids/bds-server.log"
    }
  ]
}
```

### Individual Process Control

Start, stop, or restart individual processes:

```http
POST /api/processes/{processId}/start
POST /api/processes/{processId}/stop
POST /api/processes/{processId}/restart
```

## File Watching Behavior

### Debouncing
- **Purpose**: Prevents multiple rapid updates when editing files
- **Delay**: 2 seconds after the last file change
- **Benefit**: Ensures stable configuration updates

### Error Handling
- **Invalid Configuration**: Changes are ignored, error logged
- **File Access Issues**: Watcher continues, error logged
- **Process Failures**: Individual process failures don't affect others

### Logging
- **File Changes**: Logged when configuration file is modified
- **Update Processing**: Logged when applying configuration changes
- **Process Actions**: Logged when starting, stopping, or restarting processes

## Example Workflow

### 1. Initial Setup
```bash
# Start the proxy server
npm start
```

### 2. Add a New Process
Edit `config/processes.yaml`:
```yaml
processes:
  new-api:
    enabled: true
    command: "node"
    args: ["api-server.js"]
    cwd: "./api"
    env:
      PORT: "3000"
```

**Result**: The new API process is automatically started.

### 3. Modify Process Configuration
Edit `config/processes.yaml`:
```yaml
processes:
  new-api:
    enabled: true
    command: "node"
    args: ["api-server.js"]
    cwd: "./api"
    env:
      PORT: "3001"  # Changed port
    healthCheck:
      enabled: true
      path: "/health"
```

**Result**: The API process is automatically restarted with the new configuration.

### 4. Disable a Process
Edit `config/processes.yaml`:
```yaml
processes:
  new-api:
    enabled: false  # Disabled
```

**Result**: The API process is automatically stopped.

### 5. Manual Reload
```bash
curl -X POST http://localhost:4481/api/processes/reload
```

**Result**: Configuration is manually reloaded and processes updated.

## Best Practices

### 1. Configuration Management
- **Version Control**: Keep `processes.yaml` in version control
- **Backup**: Maintain backup configurations
- **Testing**: Test configuration changes in development first

### 2. Process Design
- **Health Checks**: Implement health check endpoints in your applications
- **Graceful Shutdown**: Handle SIGTERM signals properly
- **Logging**: Use structured logging for better monitoring

### 3. Monitoring
- **Process Status**: Regularly check process status via API
- **Log Monitoring**: Monitor process logs for issues
- **Health Checks**: Ensure health check endpoints are working

### 4. Security
- **File Permissions**: Restrict access to `processes.yaml`
- **Network Access**: Limit access to management API
- **Process Isolation**: Run processes with appropriate permissions

## Troubleshooting

### Process Won't Start
- Check command and arguments
- Verify working directory exists
- Ensure environment variables are set
- Check process logs

### Configuration Not Updating
- Verify file path is correct
- Check file permissions
- Look for configuration validation errors
- Use manual reload endpoint

### File Watching Issues
- Check if file system supports watching
- Verify file path is absolute
- Look for file system errors in logs
- Restart proxy server if needed

### Process Restart Loops
- Check health check configuration
- Verify target service is responding
- Review restart limits and delays
- Check process logs for errors 