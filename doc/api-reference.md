# API Reference

Complete API documentation for the Advanced Reverse Proxy Server management console.

## 📋 Base URL

All API endpoints are available at the management console URL:

```
http://localhost:4481/api
```

## 🔐 Authentication

Currently, the management console API does not require authentication. In production environments, consider implementing authentication or restricting access to localhost.

## 📊 Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid configuration",
    "details": {
      "field": "port",
      "value": -1,
      "expected": "number between 1 and 65535"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🔧 Configuration Management

### Get Configuration

Retrieve the current configuration.

```http
GET /api/config/:type
```

**Parameters:**
- `type` - Configuration type (`main`, `proxy`, `processes`)

**Response:**
```json
{
  "success": true,
  "data": {
    "config": {
      // Configuration object
    },
    "type": "proxy"
  }
}
```

**Example:**
```bash
curl http://localhost:4481/api/config/proxy
```

### Save Configuration

Save configuration changes.

```http
POST /api/config/:type
Content-Type: application/json
```

**Parameters:**
- `type` - Configuration type (`main`, `proxy`, `processes`)

**Request Body:**
```json
{
  "config": {
    // Configuration object
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Configuration saved successfully",
    "type": "proxy"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:4481/api/config/proxy \
  -H "Content-Type: application/json" \
  -d '{"config": {"port": 80, "httpsPort": 443}}'
```

### Validate Configuration

Validate configuration without saving.

```http
POST /api/config/:type/validate
Content-Type: application/json
```

**Parameters:**
- `type` - Configuration type (`main`, `proxy`, `processes`)

**Request Body:**
```json
{
  "config": {
    // Configuration object
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

## 💾 Backup Management

### Create Backup

Create a backup of the current configuration.

```http
POST /api/config/:type/backup
```

**Parameters:**
- `type` - Configuration type (`main`, `proxy`, `processes`)

**Response:**
```json
{
  "success": true,
  "data": {
    "backupFile": "main.backup-2024-01-01T00-00-00-000Z.yaml",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### List Backups

Get a list of available backups.

```http
GET /api/config/:type/backups
```

**Parameters:**
- `type` - Configuration type (`main`, `proxy`, `processes`)

**Response:**
```json
{
  "success": true,
  "data": {
    "backups": [
      {
        "filename": "main.backup-2024-01-01T00-00-00-000Z.yaml",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "size": 1024
      }
    ]
  }
}
```

### Restore Backup

Restore configuration from a backup.

```http
POST /api/config/:type/restore
Content-Type: application/json
```

**Parameters:**
- `type` - Configuration type (`main`, `proxy`, `processes`)

**Request Body:**
```json
{
  "backupFile": "main.backup-2024-01-01T00-00-00-000Z.yaml"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Configuration restored successfully",
    "backupFile": "main.backup-2024-01-01T00-00-00-000Z.yaml"
  }
}
```

## 🔄 Process Management

### Get All Processes

Retrieve the status of all managed processes.

```http
GET /api/processes
```

**Response:**
```json
{
  "success": true,
  "data": {
    "processes": [
      {
        "id": "my-app",
        "name": "My Application",
        "status": "running",
        "pid": 12345,
        "uptime": 3600000,
        "restarts": 0,
        "lastStart": "2024-01-01T00:00:00.000Z",
        "health": {
          "status": "healthy",
          "lastCheck": "2024-01-01T00:00:00.000Z",
          "responseTime": 150
        }
      }
    ]
  }
}
```

### Get Process Configuration

Get the configuration for a specific process.

```http
GET /api/processes/:id/config
```

**Parameters:**
- `id` - Process ID

**Response:**
```json
{
  "success": true,
  "data": {
    "config": {
      "name": "My Application",
      "command": "node",
      "args": ["app.js"],
      "cwd": "/path/to/app",
      "env": {
        "NODE_ENV": "production",
        "PORT": "3000"
      }
    }
  }
}
```

### Update Process Configuration

Update the configuration for a specific process.

```http
PUT /api/processes/:id/config
Content-Type: application/json
```

**Parameters:**
- `id` - Process ID

**Request Body:**
```json
{
  "config": {
    "name": "Updated Application",
    "command": "node",
    "args": ["app.js"],
    "env": {
      "NODE_ENV": "production",
      "PORT": "3000"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Process configuration updated successfully"
  }
}
```

### Start Process

Start a specific process.

```http
POST /api/processes/:id/start
```

**Parameters:**
- `id` - Process ID

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Process started successfully",
    "pid": 12345
  }
}
```

### Stop Process

Stop a specific process.

```http
POST /api/processes/:id/stop
```

**Parameters:**
- `id` - Process ID

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Process stopped successfully"
  }
}
```

### Restart Process

Restart a specific process.

```http
POST /api/processes/:id/restart
```

**Parameters:**
- `id` - Process ID

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Process restarted successfully",
    "pid": 12346
  }
}
```

### Get Process Logs

Get logs for a specific process.

```http
GET /api/processes/:id/logs
```

**Parameters:**
- `id` - Process ID

**Query Parameters:**
- `lines` - Number of lines to retrieve (default: 100)
- `follow` - Follow logs in real-time (default: false)

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "timestamp": "2024-01-01T00:00:00.000Z",
        "level": "info",
        "message": "Server started on port 3000"
      }
    ]
  }
}
```

### Reload Process Configuration

Reload the process configuration file.

```http
POST /api/processes/reload
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Process configuration reloaded successfully",
    "processes": [
      {
        "id": "my-app",
        "status": "running"
      }
    ]
  }
}
```

## 📊 Statistics

### Get Statistics Summary

Get a summary of request statistics.

```http
GET /api/statistics/summary
```

**Query Parameters:**
- `period` - Time period (`1h`, `24h`, `7d`, `30d`)

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRequests": 15420,
      "uniqueIPs": 342,
      "uniqueCountries": 15,
      "uniqueCities": 89,
      "topCountries": [
        {
          "country": "US",
          "count": 8234,
          "percentage": 53.4
        }
      ],
      "topCities": [
        {
          "city": "New York",
          "country": "US",
          "count": 2341,
          "percentage": 15.2
        }
      ]
    }
  }
}
```

### Get Detailed Statistics

Get detailed statistics data.

```http
GET /api/statistics/detailed
```

**Query Parameters:**
- `period` - Time period (`1h`, `24h`, `7d`, `30d`)
- `groupBy` - Grouping (`country`, `city`, `ip`)

**Response:**
```json
{
  "success": true,
  "data": {
    "statistics": {
      "byCountry": [
        {
          "country": "US",
          "count": 8234,
          "percentage": 53.4,
          "ips": 156
        }
      ],
      "byCity": [
        {
          "city": "New York",
          "country": "US",
          "count": 2341,
          "percentage": 15.2
        }
      ],
      "byIP": [
        {
          "ip": "192.168.1.100",
          "location": "Local",
          "count": 1234,
          "percentage": 8.0
        }
      ]
    }
  }
}
```

### Generate Report

Generate a statistics report.

```http
POST /api/statistics/report
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Report generated successfully",
    "reportFile": "statistics-2024-01-01.json",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## 🔐 SSL Certificates

### Get Certificate Status

Get the status of SSL certificates.

```http
GET /api/certificates
```

**Response:**
```json
{
  "success": true,
  "data": {
    "certificates": [
      {
        "domain": "example.com",
        "certPath": "./certificates/example.com.crt",
        "keyPath": "./certificates/example.com.key",
        "expiresAt": "2024-02-01T00:00:00.000Z",
        "isValid": true,
        "issuer": "Let's Encrypt",
        "daysUntilExpiry": 30
      }
    ]
  }
}
```

### Renew Certificate

Manually renew an SSL certificate.

```http
POST /api/certificates/:domain/renew
```

**Parameters:**
- `domain` - Domain name

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Certificate renewed successfully",
    "domain": "example.com",
    "expiresAt": "2024-03-01T00:00:00.000Z"
  }
}
```

## 💾 Cache Management

### Get Cache Statistics

Get cache usage statistics.

```http
GET /api/cache/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalEntries": 150,
      "totalSize": "50MB",
      "hitRate": 0.85,
      "missRate": 0.15,
      "evictions": 10
    }
  }
}
```

### Get Cache Entries

Get a list of cached entries.

```http
GET /api/cache/entries
```

**Query Parameters:**
- `limit` - Maximum number of entries (default: 100)
- `offset` - Offset for pagination (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "key": "/api/users",
        "size": "2KB",
        "created": "2024-01-01T00:00:00.000Z",
        "expires": "2024-01-02T00:00:00.000Z",
        "hits": 25
      }
    ],
    "total": 150,
    "limit": 100,
    "offset": 0
  }
}
```

### Clear Cache

Clear all cached entries.

```http
POST /api/cache/clear
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Cache cleared successfully",
    "clearedEntries": 150
  }
}
```

### Delete Cache Entry

Delete a specific cache entry.

```http
DELETE /api/cache/entries/:key
```

**Parameters:**
- `key` - Cache entry key

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Cache entry deleted successfully",
    "key": "/api/users"
  }
}
```

## 🏥 Health Check

### Get System Health

Get the overall system health status.

```http
GET /api/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 86400000,
    "memory": {
      "used": "256MB",
      "total": "1GB",
      "percentage": 25
    },
    "processes": {
      "total": 5,
      "running": 5,
      "healthy": 5
    },
    "certificates": {
      "total": 3,
      "valid": 3,
      "expiringSoon": 0
    }
  }
}
```

## 🔌 WebSocket API

### Real-time Updates

Connect to the WebSocket endpoint for real-time updates.

```javascript
const ws = new WebSocket('ws://localhost:4481/api/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'processes_update':
      console.log('Process status updated:', data.data);
      break;
    case 'statistics_update':
      console.log('Statistics updated:', data.data);
      break;
    case 'config_update':
      console.log('Configuration updated:', data.data);
      break;
  }
};
```

### WebSocket Message Types

#### Process Updates
```json
{
  "type": "processes_update",
  "data": {
    "processes": [
      {
        "id": "my-app",
        "status": "running",
        "pid": 12345
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Statistics Updates
```json
{
  "type": "statistics_update",
  "data": {
    "totalRequests": 15420,
    "uniqueIPs": 342
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Configuration Updates
```json
{
  "type": "config_update",
  "data": {
    "type": "proxy",
    "message": "Configuration reloaded"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🚨 Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Configuration validation failed |
| `PROCESS_NOT_FOUND` | Process not found |
| `PROCESS_ALREADY_RUNNING` | Process is already running |
| `PROCESS_NOT_RUNNING` | Process is not running |
| `BACKUP_NOT_FOUND` | Backup file not found |
| `CERTIFICATE_ERROR` | SSL certificate error |
| `CACHE_ERROR` | Cache operation failed |
| `INTERNAL_ERROR` | Internal server error |

## 📝 Examples

### Complete Process Management Workflow

```bash
# 1. Get all processes
curl http://localhost:4481/api/processes

# 2. Start a process
curl -X POST http://localhost:4481/api/processes/my-app/start

# 3. Get process logs
curl http://localhost:4481/api/processes/my-app/logs?lines=50

# 4. Stop the process
curl -X POST http://localhost:4481/api/processes/my-app/stop
```

### Configuration Management Workflow

```bash
# 1. Get current configuration
curl http://localhost:4481/api/config/proxy

# 2. Create backup
curl -X POST http://localhost:4481/api/config/proxy/backup

# 3. Update configuration
curl -X POST http://localhost:4481/api/config/proxy \
  -H "Content-Type: application/json" \
  -d '{"config": {"port": 8080}}'

# 4. List backups
curl http://localhost:4481/api/config/proxy/backups
```

### Statistics Monitoring

```bash
# 1. Get summary statistics
curl http://localhost:4481/api/statistics/summary?period=24h

# 2. Get detailed statistics
curl http://localhost:4481/api/statistics/detailed?period=7d&groupBy=country

# 3. Generate report
curl -X POST http://localhost:4481/api/statistics/report
```

## 📚 Related Documentation

- **[Management Console](management-console.md)** - Web-based administration interface
- **[Process Management](process-management.md)** - Process configuration and management
- **[Statistics & Analytics](statistics.md)** - Request tracking and analytics
- **[Backup System](backup-system.md)** - Configuration backup and restore
