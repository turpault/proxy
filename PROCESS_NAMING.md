# Process Naming Feature

The proxy server now supports descriptive names for managed processes, making it easier to identify processes in the management console and when using system tools like `ps`.

## Overview

Process names provide human-readable identifiers for managed processes, improving:
- **Management Console**: Clear identification of processes in the web interface
- **System Monitoring**: Descriptive names in `ps` output and system monitoring tools
- **Logging**: Better log readability with process names instead of just IDs
- **Debugging**: Easier process identification during troubleshooting

## Configuration

### Adding Process Names

Add a `name` field to your process configuration:

```yaml
processes:
  api-server:
    name: "API Server"  # Human-readable name
    enabled: true
    command: "node"
    args: ["server.js"]
    # ... other configuration
```

### Example Configuration

```yaml
processes:
  # Node.js application with descriptive name
  api-server:
    name: "API Server"
    enabled: true
    command: "node"
    args: ["server.js"]
    cwd: "/app/api"
    env:
      NODE_ENV: "production"
      PORT: "3000"
    healthCheck:
      enabled: true
      path: "/health"

  # Python application with descriptive name
  data-processor:
    name: "Data Processing Service"
    enabled: true
    command: "python"
    args: ["processor.py"]
    cwd: "/app/processor"
    healthCheck:
      enabled: true
      path: "/status"

  # Process without explicit name (will use proxy-{id})
  legacy-app:
    enabled: true
    command: "node"
    args: ["legacy.js"]
    # No name field - will use "proxy-legacy-app"
```

## How It Works

### Process Name Generation

1. **Explicit Name**: If `name` is provided in configuration, it's used directly
2. **Fallback Name**: If no name is provided, uses `proxy-{id}` format
3. **Environment Variables**: Process name is available in child processes via:
   - `PROCESS_NAME`
   - `PROXY_PROCESS_NAME`
   - `PROXY_PROCESS_ID`

### Platform-Specific Process Naming

The system automatically handles process naming for different platforms and languages:

#### Node.js Processes
- Adds `--title` argument to command line
- Sets `process.title` in the child process
- Available in `ps` output as part of command line

#### Python Processes
- Adds `-u` flag for unbuffered output
- Sets `PYTHONUNBUFFERED=1` environment variable

#### Java Processes
- Adds `-Dprocess.name` JVM argument
- Sets process name via system properties

#### Other Processes
- Sets environment variables for process identification
- Command line arguments may be modified for better visibility

## Management Interface

### API Endpoints

Process names are included in all management API responses:

```json
{
  "success": true,
  "data": [
    {
      "id": "api-server",
      "name": "API Server",
      "isRunning": true,
      "pid": 12345,
      "command": "node",
      "args": ["server.js"],
      // ... other fields
    }
  ]
}
```

### Web Interface

The management console displays:
- Process name as the primary identifier
- Process ID as secondary information
- Clear distinction between different processes

## System Integration

### ps Output

Processes will appear in `ps` output with descriptive names:

```bash
# Before (generic names)
12345 node server.js
12346 python processor.py

# After (descriptive names)
12345 node --title "API Server" server.js
12346 python -u processor.py  # "Data Processing Service"
```

### Environment Variables

Child processes receive these environment variables:

```bash
PROCESS_NAME="API Server"
PROXY_PROCESS_NAME="API Server"
PROXY_PROCESS_ID="api-server"
```

### Logging

All log messages use process names:

```
[API Server] Process started successfully
[Data Processing Service] Health check passed
[API Server] Process exited normally
```

## Testing

### Example Process Script

Use the provided example script to test process naming:

```bash
# Start the example process
node examples/named-process.js

# Or with process management
# In your process configuration:
test-process:
  name: "Test Process"
  enabled: true
  command: "node"
  args: ["examples/named-process.js"]
  env:
    PORT: "3001"
```

### Verification

1. **Check Management Console**: Visit `http://localhost:4481` to see named processes
2. **Check ps Output**: Run `ps aux | grep node` to see process names
3. **Check Logs**: Look for process names in log output
4. **Check Health Endpoint**: Visit `http://localhost:3001/health` to see process info

## Best Practices

### Naming Conventions

- Use descriptive, human-readable names
- Include service type or function (e.g., "API Server", "Database", "Cache")
- Keep names concise but informative
- Use consistent naming patterns across your infrastructure

### Configuration Examples

```yaml
# Good examples
name: "User Authentication Service"
name: "Payment Processing API"
name: "Redis Cache Server"
name: "PostgreSQL Database"

# Avoid
name: "service1"
name: "app"
name: "backend"
```

### Environment-Specific Names

You can use environment variables for dynamic naming:

```yaml
processes:
  api-server:
    name: "${ENV}-API-Server"  # prod-API-Server, staging-API-Server
    enabled: true
    command: "node"
    args: ["server.js"]
```

## Troubleshooting

### Process Names Not Showing in ps

1. **Check Platform**: Process naming works best on Unix-like systems
2. **Check Command**: Ensure the process supports title setting
3. **Check Permissions**: Some systems restrict process title changes
4. **Check Logs**: Look for warnings about process title setting

### Management Console Issues

1. **Check Configuration**: Ensure `name` field is properly set
2. **Check API Response**: Verify process name is in API response
3. **Check Browser Console**: Look for JavaScript errors
4. **Check Network**: Verify API requests are successful

### Environment Variables Not Set

1. **Check Process Spawning**: Verify environment variables are passed
2. **Check Process Type**: Different process types handle environment differently
3. **Check Logs**: Look for environment variable warnings

## Migration

### From Unnamed Processes

Existing configurations without names will continue to work:

```yaml
# Old configuration (still works)
legacy-app:
  enabled: true
  command: "node"
  args: ["app.js"]

# New configuration (recommended)
legacy-app:
  name: "Legacy Application"  # Add this line
  enabled: true
  command: "node"
  args: ["app.js"]
```

### Backward Compatibility

- All existing configurations continue to work
- Process names are optional
- Fallback naming ensures all processes have identifiers
- No breaking changes to existing functionality 