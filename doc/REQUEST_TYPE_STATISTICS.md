# Request Type Statistics

The proxy server now includes comprehensive request type statistics to distinguish between different types of requests: **static**, **proxy**, **redirect**, and **unmatched** requests.

## Overview

Request type statistics provide detailed insights into how your proxy server is being used, allowing you to:

- **Monitor traffic patterns** by request type
- **Identify performance bottlenecks** for specific request types
- **Track usage trends** over time
- **Optimize resource allocation** based on request type distribution

## Request Types

### 1. Static Requests (`static`)
- **Description**: Requests for static files served directly from the filesystem
- **Examples**: CSS files, JavaScript files, images, HTML files
- **Configuration**: Routes with `type: "static"` and `staticPath` configured
- **Statistics**: Tracks file serving performance and usage patterns

### 2. Proxy Requests (`proxy`)
- **Description**: Requests that are forwarded to backend servers
- **Examples**: API calls, dynamic content, database queries
- **Configuration**: Routes with `type: "proxy"` or classic proxy routes
- **Statistics**: Tracks proxy performance, response times, and backend health

### 3. Redirect Requests (`redirect`)
- **Description**: Requests that result in HTTP redirects
- **Examples**: URL redirects, domain redirects, legacy URL handling
- **Configuration**: Routes with `type: "redirect"` and `redirectTo` configured
- **Statistics**: Tracks redirect patterns and user navigation flows

### 4. Unmatched Requests (`unmatched`)
- **Description**: Requests that don't match any configured routes (404 errors)
- **Examples**: Invalid URLs, missing resources, broken links
- **Configuration**: Automatically tracked for all unmatched requests
- **Statistics**: Helps identify broken links and potential security issues

## API Endpoints

### Get Request Type Statistics

```http
GET /api/statistics?period=24h
```

**Response Example:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRequests": 1250,
      "uniqueIPs": 45,
      "uniqueCountries": 12,
      "requestTypes": [
        {
          "type": "proxy",
          "count": 800,
          "percentage": 64.0
        },
        {
          "type": "static",
          "count": 300,
          "percentage": 24.0
        },
        {
          "type": "unmatched",
          "count": 100,
          "percentage": 8.0
        },
        {
          "type": "redirect",
          "count": 50,
          "percentage": 4.0
        }
      ]
    },
    "routes": [
      {
        "name": "API Server",
        "domain": "api.example.com",
        "target": "http://localhost:3000",
        "requests": 800,
        "avgResponseTime": 150,
        "requestType": "proxy",
        "uniqueIPs": 35,
        "methods": ["GET", "POST", "PUT", "DELETE"]
      },
      {
        "name": "Static Files",
        "domain": "static.example.com",
        "target": "/var/www/static",
        "requests": 300,
        "avgResponseTime": 25,
        "requestType": "static",
        "uniqueIPs": 25,
        "methods": ["GET", "HEAD"]
      }
    ]
  }
}
```

## Configuration Examples

### Static File Serving
```yaml
routes:
  - domain: "static.example.com"
    type: "static"
    path: "/"
    staticPath: "/var/www/static"
    ssl: true
```

### Proxy Forwarding
```yaml
routes:
  - domain: "api.example.com"
    type: "proxy"
    target: "http://localhost:3000"
    ssl: true
    cors: true
```

### URL Redirects
```yaml
routes:
  - domain: "old.example.com"
    type: "redirect"
    redirectTo: "https://new.example.com"
    ssl: true
```

## Management Interface

The management interface displays request type statistics in several ways:

### 1. Summary Dashboard
- **Request Type Breakdown**: Pie chart showing distribution of request types
- **Total Requests**: Overall request count with type breakdown
- **Performance Metrics**: Average response times by request type

### 2. Route Details
- **Individual Route Stats**: Each route shows its request type
- **Performance Analysis**: Response times and error rates by type
- **Usage Patterns**: Request frequency and user distribution

### 3. Time-based Analysis
- **Historical Trends**: How request type distribution changes over time
- **Peak Usage**: Identify when different request types are most active
- **Seasonal Patterns**: Long-term usage trends

## Benefits

### Performance Monitoring
- **Identify bottlenecks**: See which request types are slowest
- **Resource optimization**: Allocate resources based on usage patterns
- **Capacity planning**: Understand traffic patterns for scaling

### Security Analysis
- **Unmatched requests**: Identify potential security scans or broken links
- **Traffic patterns**: Detect unusual activity by request type
- **Access patterns**: Monitor who is accessing what types of resources

### Operational Insights
- **User behavior**: Understand how users interact with your services
- **Service health**: Monitor the health of different service types
- **Maintenance planning**: Plan maintenance based on usage patterns

## Testing

Use the provided test script to verify request type statistics:

```bash
node testing_scripts/test-request-type-statistics.js
```

This script will:
1. Make requests of each type
2. Wait for statistics to update
3. Verify that all request types are being tracked
4. Display the results

## Data Retention

Request type statistics follow the same retention policies as other statistics:

- **Real-time data**: Available immediately via API
- **Daily reports**: Generated automatically every 24 hours
- **Persistence**: Saved to disk for historical analysis
- **Cleanup**: Old data is automatically cleaned up to prevent disk space issues

## Troubleshooting

### No Request Type Data
- Ensure the proxy server is running
- Check that routes are properly configured
- Verify that the statistics service is enabled
- Check logs for any errors in statistics recording

### Missing Request Types
- Verify route configurations include proper `type` fields
- Check that static routes have `staticPath` configured
- Ensure redirect routes have `redirectTo` configured
- Confirm that proxy routes are properly set up

### Performance Issues
- Monitor response times by request type
- Check for bottlenecks in specific request types
- Review resource allocation for different services
- Consider caching strategies for static content 