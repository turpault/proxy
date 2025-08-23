# Enhanced SQLite Statistics System

The Advanced Reverse Proxy Server now includes a comprehensive SQLite-based statistics system that records all requests and provides detailed analytics for per-route and unmatched route data.

## 🗄️ Database Schema

The statistics system uses SQLite with the following tables:

### `request_stats` - IP-based Statistics
Stores aggregated statistics per IP address:
```sql
CREATE TABLE request_stats (
  ip TEXT PRIMARY KEY,
  geolocation_json TEXT,
  count INTEGER DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  user_agents_json TEXT,
  routes_json TEXT,
  methods_json TEXT,
  response_times_json TEXT,
  request_types_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
```

### `individual_requests` - Detailed Request Log
Stores every individual request with full details:
```sql
CREATE TABLE individual_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  domain TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER DEFAULT 200,
  response_time REAL DEFAULT 0,
  timestamp TEXT NOT NULL,
  user_agent TEXT,
  request_type TEXT DEFAULT 'proxy',
  route_name TEXT,
  target_url TEXT,
  query_string TEXT,
  headers_json TEXT,
  geolocation_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)
```

### `unmatched_requests` - Unmatched Route Tracking
Stores requests that don't match any configured routes:
```sql
CREATE TABLE unmatched_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  domain TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER DEFAULT 404,
  response_time REAL DEFAULT 0,
  timestamp TEXT NOT NULL,
  user_agent TEXT,
  query_string TEXT,
  headers_json TEXT,
  geolocation_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)
```

### `route_configs` - Route Configuration Cache
Stores current route configurations for matching:
```sql
CREATE TABLE route_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  domain TEXT NOT NULL,
  path TEXT NOT NULL,
  target TEXT,
  type TEXT DEFAULT 'proxy',
  ssl BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(domain, path)
)
```

### `db_version` - Database Version Tracking
Stores the current database schema version for migration management:
```sql
CREATE TABLE db_version (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
```

### `route_details` - Route-specific Details
Stores detailed information for matched routes:
```sql
CREATE TABLE route_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  domain TEXT NOT NULL,
  target TEXT NOT NULL,
  method TEXT NOT NULL,
  response_time REAL DEFAULT 0,
  timestamp TEXT NOT NULL,
  request_type TEXT DEFAULT 'proxy',
  status_code INTEGER DEFAULT 200,
  user_agent TEXT,
  path TEXT,
  query_string TEXT,
  headers_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ip) REFERENCES request_stats(ip) ON DELETE CASCADE
)
```

## 📊 API Endpoints

### Per-Route Statistics
```http
GET /api/statistics/per-route?period=24h&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "routeName": "API Gateway",
      "domain": "api.example.com",
      "path": "/api",
      "target": "http://localhost:3001",
      "requestType": "proxy",
      "totalRequests": 15420,
      "avgResponseTime": 45.2,
      "uniqueIPs": 342,
      "uniqueCountries": 15,
      "topCountries": [
        { "country": "United States", "count": 8500, "percentage": 55.1 },
        { "country": "Germany", "count": 3200, "percentage": 20.7 }
      ],
      "methods": ["GET", "POST", "PUT", "DELETE"],
      "statusCodes": [
        { "code": 200, "count": 14000, "percentage": 90.8 },
        { "code": 404, "count": 800, "percentage": 5.2 }
      ],
      "topPaths": [
        { "path": "/api/users", "count": 5000, "percentage": 32.4 },
        { "path": "/api/products", "count": 3200, "percentage": 20.7 }
      ]
    }
  ]
}
```

### Unmatched Route Statistics
```http
GET /api/statistics/unmatched?period=24h&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "domain": "example.com",
      "path": "/admin",
      "totalRequests": 1250,
      "avgResponseTime": 12.5,
      "uniqueIPs": 89,
      "uniqueCountries": 8,
      "topCountries": [
        { "country": "United States", "count": 800, "percentage": 64.0 },
        { "country": "Russia", "count": 200, "percentage": 16.0 }
      ],
      "methods": ["GET", "POST"],
      "statusCodes": [
        { "code": 404, "count": 1250, "percentage": 100.0 }
      ],
      "topUserAgents": [
        { "userAgent": "Mozilla/5.0 (compatible; Bot)", "count": 500, "percentage": 40.0 },
        { "userAgent": "curl/7.68.0", "count": 200, "percentage": 16.0 }
      ],
      "recentRequests": [
        {
          "timestamp": "2024-01-15T10:30:00.000Z",
          "ip": "192.168.1.100",
          "method": "GET",
          "statusCode": 404,
          "userAgent": "Mozilla/5.0...",
          "country": "United States"
        }
      ]
    }
  ]
}
```

### Domain Statistics
```http
GET /api/statistics/domains?period=24h
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "domain": "example.com",
      "totalRequests": 25000,
      "matchedRequests": 23500,
      "unmatchedRequests": 1500,
      "avgResponseTime": 52.3,
      "uniqueIPs": 1200,
      "uniqueCountries": 25,
      "topRoutes": [
        { "routeName": "Web Application", "path": "/", "count": 15000, "percentage": 60.0 },
        { "routeName": "API Gateway", "path": "/api", "count": 8500, "percentage": 34.0 }
      ],
      "topUnmatchedPaths": [
        { "path": "/admin", "count": 800, "percentage": 3.2 },
        { "path": "/wp-admin", "count": 400, "percentage": 1.6 }
      ]
    }
  ]
}
```

### Route Request History
```http
GET /api/statistics/route-history?routeName=API Gateway&domain=api.example.com&path=/api&period=24h&limit=100
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "ip": "192.168.1.100",
      "method": "GET",
      "statusCode": 200,
      "responseTime": 45.2,
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "country": "United States",
      "city": "New York",
      "queryString": "?page=1&limit=10",
      "headers": {
        "accept": "application/json",
        "authorization": "Bearer token123",
        "user-agent": "Mozilla/5.0..."
      }
    }
  ]
}
```

### Unmatched Request History
```http
GET /api/statistics/unmatched-history?domain=example.com&path=/admin&period=24h&limit=100
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "ip": "192.168.1.100",
      "method": "GET",
      "statusCode": 404,
      "responseTime": 12.5,
      "userAgent": "Mozilla/5.0 (compatible; Bot)",
      "country": "United States",
      "city": "New York",
      "queryString": "",
      "headers": {
        "accept": "*/*",
        "user-agent": "Mozilla/5.0 (compatible; Bot)"
      }
    }
  ]
}
```

### Database Version Information
```http
GET /api/statistics/version
```

**Response:**
```json
{
  "success": true,
  "data": {
    "databaseVersion": 2,
    "schemaVersion": 2,
    "isUpToDate": true,
    "needsMigration": false
  }
}
```

## 🔧 Configuration

### Automatic Operation
The enhanced statistics system operates automatically:

1. **Request Recording**: Every request is automatically recorded in the database
2. **Route Matching**: Requests are categorized as matched or unmatched based on route configuration
3. **Data Retention**: Old data is automatically cleaned up after 90 days
4. **Route Sync**: Route configurations are automatically synced to the database
5. **Schema Versioning**: Database schema is automatically versioned and migrated when needed

### Manual Configuration
```yaml
# config/main.yaml
settings:
  statistics:
    enabled: true
    dataDir: "./data/statistics"
    retentionDays: 90
    cleanupInterval: 86400000  # 24 hours
    saveInterval: 300000       # 5 minutes
    schemaVersion: 2           # Current schema version
```

## 📈 Use Cases

### 1. Performance Monitoring
- Track response times per route
- Identify slow endpoints
- Monitor error rates
- Analyze traffic patterns

### 2. Security Analysis
- Monitor unmatched requests (potential attacks)
- Track suspicious user agents
- Analyze geographic patterns
- Identify scanning attempts

### 3. Traffic Analysis
- Understand user behavior
- Identify popular endpoints
- Track API usage patterns
- Monitor geographic distribution

### 4. Route Optimization
- Identify unused routes
- Optimize route configurations
- Balance traffic distribution
- Plan capacity requirements

## 🛠️ Implementation Details

### Database Versioning and Migration
1. **Version Check**: On startup, system checks current database version
2. **Migration Detection**: If version mismatch is detected, migration is triggered
3. **Backup Creation**: Existing database is backed up before migration
4. **Schema Recreation**: All tables are dropped and recreated with new schema
5. **Version Update**: Database version is updated to current schema version

### Request Recording Flow
1. **Request Arrives**: Every request is processed by the proxy
2. **Route Matching**: System attempts to match request to configured routes
3. **Database Storage**: Request details are stored in appropriate tables
4. **Statistics Update**: Aggregated statistics are updated in memory
5. **Periodic Persistence**: Data is saved to SQLite every 5 minutes

### Data Cleanup
- **Automatic Cleanup**: Old data is removed after 90 days
- **Memory Management**: Response times and route details are limited to 1000 entries per IP
- **Database Optimization**: Indexes ensure fast query performance

### Schema Versioning
- **Version Tracking**: Database schema version is stored in `db_version` table
- **Automatic Migration**: Schema changes trigger automatic migration
- **Backup Protection**: Existing data is backed up before migration
- **Version API**: Version information available via API endpoints

### Performance Considerations
- **Indexed Queries**: All queries use database indexes for optimal performance
- **Batch Operations**: Statistics are updated in memory and persisted periodically
- **Connection Pooling**: SQLite connections are managed efficiently
- **Query Optimization**: Complex queries are optimized for large datasets

## 🔍 Troubleshooting

### Common Issues

1. **Database Lock Errors**
   ```bash
   # Check if database is locked
   ls -la data/statistics/statistics.sqlite
   
   # Restart the service if needed
   sudo systemctl restart proxy
   ```

2. **High Memory Usage**
   ```bash
   # Check memory usage
   ps aux | grep proxy
   
   # Reduce retention period if needed
   # Edit config/main.yaml
   statistics:
     retentionDays: 30
   ```

3. **Slow Queries**
   ```bash
   # Check database size
   du -h data/statistics/statistics.sqlite
   
   # Rebuild indexes if needed
   sqlite3 data/statistics/statistics.sqlite "REINDEX;"
   ```

### Monitoring Commands

```bash
# Check statistics summary
curl http://localhost:4481/api/statistics/summary

# Get per-route statistics
curl http://localhost:4481/api/statistics/per-route?period=24h

# Get unmatched requests
curl http://localhost:4481/api/statistics/unmatched?period=24h

# Check database size
du -h data/statistics/statistics.sqlite

# View recent requests
sqlite3 data/statistics/statistics.sqlite "SELECT COUNT(*) FROM individual_requests WHERE timestamp > datetime('now', '-1 hour');"

# Check database version
curl http://localhost:4481/api/statistics/version

# Check for backup files
ls -la data/statistics/statistics_backup_*
```

## 📚 Examples

### Monitoring API Performance
```bash
# Get API route statistics
curl "http://localhost:4481/api/statistics/per-route?period=24h" | jq '.data[] | select(.routeName == "API Gateway")'

# Check for slow endpoints
curl "http://localhost:4481/api/statistics/per-route?period=1h" | jq '.data[] | select(.avgResponseTime > 1000)'
```

### Security Monitoring
```bash
# Check for suspicious unmatched requests
curl "http://localhost:4481/api/statistics/unmatched?period=1h" | jq '.data[] | select(.totalRequests > 100)'

# Monitor specific paths for attacks
curl "http://localhost:4481/api/statistics/unmatched-history?domain=example.com&path=/admin&period=1h&limit=50"
```

### Geographic Analysis
```bash
# Get traffic by country
curl "http://localhost:4481/api/statistics/per-route?period=24h" | jq '.data[].topCountries'

# Check for unusual geographic patterns
curl "http://localhost:4481/api/statistics/unmatched?period=24h" | jq '.data[].topCountries'
```

### Database Versioning
```bash
# Check current database version
curl http://localhost:4481/api/statistics/version

# Monitor for version mismatches
curl http://localhost:4481/api/statistics/version | jq '.data.needsMigration'

# Check backup files after migration
ls -la data/statistics/statistics_backup_*
```

The enhanced SQLite statistics system provides comprehensive insights into your proxy traffic, enabling better monitoring, security analysis, and performance optimization. The database versioning system ensures smooth schema migrations and data protection during updates.
