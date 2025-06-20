# Dynamic Process Management

The proxy server supports dynamic process management with hot reloading capabilities, allowing you to modify process configurations without restarting the entire server.

## Features

- **🔄 Hot Reloading**: Automatically reload process configurations when files change
- **📁 File Watching**: Real-time monitoring of `processes.yaml` for changes
- **⚡ Live Updates**: Processes are started, stopped, or restarted based on configuration changes
- **🛡️ Validation**: Configuration changes are validated before applying
- **⏱️ Debouncing**: Prevents rapid-fire updates with configurable debouncing
- **🎛️ Manual Control**: Force reload configuration via API endpoint

## How It Works

### File Watching

The system uses Node.js `fs.watchFile()` to monitor the `processes.yaml` file for changes:

```typescript
// Automatic file watching
fs.watchFile(processConfigPath, { interval: 1000 }, (curr, prev) => {
  if (curr.mtime > prev.mtime) {
    // Configuration file changed
    handleConfigChange();
  }
});
```

### Configuration Validation

Before applying changes, the new configuration is validated:

```typescript
try {
  const newConfig = loadProcessConfig();
  validateProcessConfig(newConfig);
  applyProcessChanges(newConfig);
} catch (error) {
  logger.error('Invalid process configuration:', error);
  // Continue with existing configuration
}
```

### Debounced Updates

To prevent multiple rapid updates, changes are debounced:

```typescript
let reloadTimeout: NodeJS.Timeout | null = null;

function handleConfigChange() {
  if (reloadTimeout) {
    clearTimeout(reloadTimeout);
  }
  
  reloadTimeout = setTimeout(() => {
    reloadProcessConfiguration();
    reloadTimeout = null;
  }, 2000); // 2-second debounce
}
```

## Configuration

### Enable Dynamic Process Management

In your `config/proxy.yaml`:

```yaml
# Process management configuration
processManagement:
  enabled: true
  processConfigFile: "config/processes.yaml"
  autoStart: true
  healthCheckInterval: 30000
  restartAttempts: 3
  # Dynamic reloading settings
  watchConfig: true           # Enable file watching (default: true)
  reloadDebounceMs: 2000      # Debounce time in milliseconds (default: 2000)
  validateOnReload: true      # Validate configuration before applying (default: true)
```

### Process Configuration File

The `config/processes.yaml` file is monitored for changes:

```yaml
# Process Management Configuration
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

## API Endpoints

### Manual Configuration Reload

Force a configuration reload:

```bash
POST /api/processes/reload
```

Response:
```json
{
  "success": true,
  "message": "Process configuration reloaded successfully",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "changes": {
    "added": ["example-server-4"],
    "removed": ["example-server-3"],
    "modified": ["example-server-1"]
  }
}
```

### Get Configuration Status

Check the current configuration status:

```bash
GET /api/processes/config/status
```

Response:
```json
{
  "configFile": "/path/to/config/processes.yaml",
  "lastModified": "2024-01-01T12:00:00.000Z",
  "lastReloaded": "2024-01-01T12:00:00.000Z",
  "watching": true,
  "valid": true,
  "processes": {
    "total": 3,
    "enabled": 2,
    "running": 2
  }
}
```

## Logging

Dynamic process management provides detailed logging:

```
[2024-01-01T12:00:00.000Z] info: Process configuration file changed: /path/to/config/processes.yaml
[2024-01-01T12:00:00.500Z] info: Validating new process configuration...
[2024-01-01T12:00:00.600Z] info: New configuration is valid
[2024-01-01T12:00:00.700Z] info: Stopping process: example-server-3
[2024-01-01T12:00:01.800Z] info: Starting process: example-server-4
[2024-01-01T12:00:02.900Z] info: Process configuration reloaded successfully
```

## Error Handling

### Invalid Configuration

If the new configuration is invalid, the system continues with the existing configuration:

```
[2024-01-01T12:00:00.000Z] error: Invalid process configuration: Missing required field 'command' for process 'example-server-4'
[2024-01-01T12:00:00.100Z] warn: Keeping existing process configuration due to validation errors
```

### File Access Errors

If the configuration file cannot be read:

```
[2024-01-01T12:00:00.000Z] error: Failed to read process configuration file: ENOENT: no such file or directory
[2024-01-01T12:00:00.100Z] warn: Process configuration file not found, using default configuration
```

## Best Practices

### 1. Configuration Validation

Always validate your configuration before saving:

```yaml
# Good: Complete configuration
example-server:
  enabled: true
  name: "Example Server"
  command: "node"
  args: ["index.js"]
  cwd: "./app"
  env:
    NODE_ENV: "production"
  healthCheck:
    enabled: true
    url: "http://localhost:3000/health"

# Bad: Missing required fields
example-server:
  enabled: true
  # Missing 'command' field
  args: ["index.js"]
```

### 2. Gradual Changes

Make changes incrementally to avoid disrupting running services:

```yaml
# Step 1: Add new process
example-server-4:
  enabled: false  # Start disabled
  name: "Example Server 4"
  command: "node"
  args: ["index.js"]

# Step 2: Enable after testing
example-server-4:
  enabled: true   # Enable after validation
  name: "Example Server 4"
  command: "node"
  args: ["index.js"]
```

### 3. Backup Configuration

Keep a backup of your working configuration:

```bash
# Create backup before making changes
cp config/processes.yaml config/processes.yaml.backup

# Restore if needed
cp config/processes.yaml.backup config/processes.yaml
```

## Example Workflows

### Adding a New Process

1. **Edit the configuration file:**
   ```yaml
   example-server-4:
     enabled: true
     name: "Example Server 4"
     command: "node"
     args: ["index.js"]
     cwd: "./app4"
   ```

2. **Save the file** - the process will be automatically started

3. **Monitor the logs** to ensure successful startup

### Modifying an Existing Process

1. **Edit the configuration file:**
   ```yaml
   example-server-1:
     # ... existing configuration
     env:
       NODE_ENV: "production"
       PORT: "3001"
       DEBUG: "true"  # Add new environment variable
   ```

2. **Save the file** - the process will be restarted with new configuration

### Removing a Process

1. **Edit the configuration file** and remove the process entry
2. **Save the file** - the process will be automatically stopped

## Troubleshooting

### Configuration Not Reloading

1. **Check file permissions:**
   ```bash
   ls -la config/processes.yaml
   ```

2. **Verify file watching is enabled:**
   ```bash
   GET /api/processes/config/status
   ```

3. **Check logs for errors:**
   ```bash
   tail -f logs/proxy.log | grep "process"
   ```

### Processes Not Starting

1. **Validate configuration:**
   ```bash
   POST /api/processes/reload
   ```

2. **Check process logs:**
   ```bash
   GET /api/processes/{id}/logs
   ```

3. **Verify dependencies and paths**

### Performance Issues

1. **Increase debounce time:**
   ```yaml
   processManagement:
     reloadDebounceMs: 5000  # 5 seconds
   ```

2. **Disable validation for development:**
   ```yaml
   processManagement:
     validateOnReload: false
   ```

## Limitations

- **File System Events**: Relies on file system events which may not be 100% reliable on all systems
- **Configuration Validation**: Invalid configurations will not be applied
- **Process Dependencies**: No support for process dependencies or startup order
- **Rollback**: No automatic rollback to previous configuration on failure

## Security Considerations

- **File Permissions**: Ensure the configuration file has appropriate permissions
- **Validation**: Always validate configuration changes before applying
- **Backup**: Keep backups of working configurations
- **Monitoring**: Monitor process behavior after configuration changes 