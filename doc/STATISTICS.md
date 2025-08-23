# Request Statistics and Geolocation Tracking

The proxy server now includes comprehensive request statistics and geolocation tracking capabilities. This feature automatically tracks all incoming requests and generates detailed reports every 24 hours.

## Features

### 📊 **Automatic Data Collection**
- **IP Address Tracking**: Records all unique IP addresses making requests
- **Geolocation Data**: Maps IP addresses to countries, regions, and cities
- **Request Patterns**: Tracks request methods, routes, and user agents
- **Time-based Analysis**: Records when requests are made for temporal analysis

### 📈 **Comprehensive Reporting**
- **Daily Reports**: Automatically generated every 24 hours at midnight
- **JSON Format**: Structured data for easy analysis and processing
- **Multiple Views**: Country, city, and IP-level statistics
- **Percentage Calculations**: Relative distribution of traffic

### 🎛️ **Management API**
- **Real-time Statistics**: Get current statistics via API endpoints
- **Manual Reports**: Generate reports on-demand
- **Summary Data**: Quick overview of current traffic patterns

## Data Collection

### What's Tracked
- **IP Address**: Client IP address (with proxy header support)
- **Geolocation**: Country, region, city, timezone, coordinates
- **Request Details**: HTTP method, route path, user agent
- **Timestamps**: First and last seen times for each IP
- **Request Count**: Number of requests from each IP

### Privacy Considerations
- **No Personal Data**: Only IP addresses and geolocation data are collected
- **Aggregated Reports**: Individual IP data is aggregated in reports
- **Configurable Retention**: Data is cleared after each 24-hour period
- **Local Storage**: All data is stored locally, not transmitted externally

## Report Structure

### Summary Section
```json
{
  "period": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-01-01T23:59:59.999Z"
  },
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
    ],
    "topIPs": [
      {
        "ip": "192.168.1.100",
        "location": "Local",
        "count": 1234,
        "percentage": 8.0
      }
    ],
    "requestsByHour": [
      {
        "hour": 0,
        "count": 234
      }
    ],
    "requestsByDay": [
      {
        "day": "2024-01-01",
        "count": 15420
      }
    ]
  }
}
```

### Detailed Data
```json
{
  "details": {
    "byIP": [
      {
        "ip": "192.168.1.100",
        "location": "Local",
        "count": 1234,
        "firstSeen": "2024-01-01T08:30:00.000Z",
        "lastSeen": "2024-01-01T23:45:00.000Z",
        "userAgents": ["Mozilla/5.0..."],
        "routes": ["/api/users", "/static/css"],
        "methods": ["GET", "POST"]
      }
    ],
    "byCountry": [
      {
        "country": "US",
        "count": 8234,
        "percentage": 53.4,
        "ips": ["192.168.1.100", "10.0.0.1"]
      }
    ],
    "byCity": [
      {
        "city": "New York",
        "country": "US",
        "count": 2341,
        "percentage": 15.2,
        "ips": ["192.168.1.100"]
      }
    ]
  }
}
```

## File Storage

### Report Location
Reports are automatically saved to:
```
logs/statistics/statistics-YYYY-MM-DD.json
```

### File Naming Convention
- **Automatic Reports**: `statistics-2024-01-01.json`
- **Manual Reports**: `statistics-manual-2024-01-01-1704067200000.json`

### Directory Structure
```
logs/
├── statistics/
│   ├── statistics-2024-01-01.json
│   ├── statistics-2024-01-02.json
│   ├── statistics-manual-2024-01-01-1704067200000.json
│   └── ...
└── proxy.log
```

## Management API

### Get Current Statistics
```http
GET /api/statistics
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": { ... },
    "summary": { ... },
    "details": { ... }
  }
}
```

### Get Statistics Summary
```http
GET /api/statistics/summary
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRequests": 15420,
    "uniqueIPs": 342,
    "uniqueCountries": 15,
    "cacheSize": 342
  }
}
```



### Server Status (includes statistics)
```http
GET /api/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "running",
    "uptime": 86400,
    "certificates": [...],
    "routes": [...],
    "processes": [...],
    "statistics": {
      "totalRequests": 15420,
      "uniqueIPs": 342,
      "uniqueCountries": 15,
      "cacheSize": 342
    }
  }
}
```

## Configuration

### Automatic Operation
The statistics service runs automatically with no additional configuration required. It:

1. **Starts automatically** when the proxy server starts
2. **Collects data** from all incoming requests
3. **Generates reports** every 24 hours at midnight
4. **Clears data** after each report to start fresh

### Report Timing
- **First Report**: Generated at the next midnight after server start
- **Subsequent Reports**: Generated every 24 hours at midnight

### Data Retention
- **In-Memory Data**: Cleared after each 24-hour period
- **Report Files**: Stored permanently in `logs/statistics/`
- **No Database**: All data is stored in memory and JSON files

## Use Cases

### Traffic Analysis
- **Geographic Distribution**: Understand where your users are located
- **Peak Usage Times**: Identify high-traffic periods
- **Route Popularity**: See which endpoints are most accessed
- **User Agent Analysis**: Understand client types and browsers

### Security Monitoring
- **Suspicious IPs**: Identify IPs making unusual numbers of requests
- **Geographic Anomalies**: Detect traffic from unexpected locations
- **Request Patterns**: Monitor for unusual request patterns
- **DDoS Detection**: Identify potential distributed attacks

### Performance Optimization
- **Load Distribution**: Understand traffic patterns across time
- **Regional Optimization**: Optimize for your most active regions
- **Capacity Planning**: Plan for peak usage periods
- **CDN Optimization**: Optimize content delivery based on user locations

## Example Analysis

### Geographic Distribution
```bash
# Find top countries
curl -s http://localhost:4481/api/statistics | jq '.data.summary.topCountries'

# Find top cities
curl -s http://localhost:4481/api/statistics | jq '.data.summary.topCities'
```

### Traffic Patterns
```bash
# Get hourly breakdown
curl -s http://localhost:4481/api/statistics | jq '.data.summary.requestsByHour'

# Get daily breakdown
curl -s http://localhost:4481/api/statistics | jq '.data.summary.requestsByDay'
```

### IP Analysis
```bash
# Find most active IPs
curl -s http://localhost:4481/api/statistics | jq '.data.summary.topIPs'

# Get detailed IP information
curl -s http://localhost:4481/api/statistics | jq '.data.details.byIP[0:5]'
```

## Best Practices

### Monitoring
- **Regular Review**: Check statistics regularly for insights
- **Anomaly Detection**: Look for unusual patterns or spikes
- **Geographic Trends**: Monitor changes in user distribution
- **Performance Correlation**: Correlate statistics with performance metrics

### Data Management
- **Backup Reports**: Regularly backup the statistics directory
- **Archive Old Reports**: Move old reports to long-term storage
- **Disk Space**: Monitor disk usage for the statistics directory
- **Data Analysis**: Use external tools to analyze historical data

### Security
- **Access Control**: Limit access to statistics API endpoints
- **Data Privacy**: Ensure compliance with data protection regulations
- **Network Security**: Protect the management interface
- **Log Monitoring**: Monitor access to statistics data

## Troubleshooting

### No Statistics Being Collected
- Check if the proxy server is receiving requests
- Verify the statistics service is running
- Check logs for any errors in the statistics service

### Reports Not Generated
- Verify the `logs/statistics` directory exists and is writable
- Check system time and timezone settings
- Look for errors in the proxy server logs

### High Memory Usage
- Statistics are stored in memory and cleared daily
- Monitor memory usage during peak traffic periods
- Consider reducing the frequency of manual reports

### Missing Geolocation Data
- Verify the GeoIP database is loaded correctly
- Check for network connectivity issues
- Some IPs may not have geolocation data available 