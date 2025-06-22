# Response Cache Feature

The proxy server now includes a disk-based response cache with in-memory MRU (Most Recently Used) cache that stores GET request responses for 24 hours to improve performance and reduce load on upstream servers. The cache is user-specific, ensuring that different users get their own cached responses.

## Features

- **Disk-based caching**: Responses are stored in JSON files in the `data/cache` directory
- **In-memory MRU cache**: 100 most recently used items cached in memory for faster access
- **User-specific caching**: Cache entries are tied to specific users for personalized responses
- **24-hour expiration**: Cache entries automatically expire after 24 hours
- **Query parameter exclusion**: Cache keys are generated from the target URL without query parameters
- **Automatic cleanup**: Expired cache entries are cleaned up every 6 hours
- **Management API**: Cache can be managed through REST API endpoints

## How It Works

### Cache Key Generation
Cache keys are generated using SHA-256 hash of the HTTP method, target URL (without query parameters), and user information:
```
Key = SHA256(method + ":" + protocol + "//" + host + pathname + ":user:" + userId + ":ip:" + userIP)
```

### User Identification
The system identifies users through multiple methods in order of preference:
1. **OAuth2 session cookie** (`oauth2-session`)
2. **Authorization header** (Bearer tokens or API keys)
3. **Custom user headers** (`x-user-id`, `x-user`)
4. **Session cookies** (`sessionid`, `sid`)
5. **IP address** (fallback for anonymous users)

### Caching Logic
- Only GET requests are cached
- Only successful responses (status 200) are cached
- Cache entries include:
  - Response status code
  - Response headers
  - Response body
  - Content type
  - Timestamp
  - User ID and IP address

### MRU Cache Behavior
- **100-item limit**: Only the 100 most recently accessed items are kept in memory
- **LRU eviction**: Least recently used items are evicted when the limit is reached
- **Automatic promotion**: Accessed items are moved to the front of the MRU list
- **Dual storage**: Items are stored both in memory (MRU) and on disk

### Cache Storage
Cache files are stored as JSON in `data/cache/` with the filename format:
```
{hash}.json
```

## Management API Endpoints

### Get Cache Statistics
```http
GET /api/cache/stats
```

Response:
```json
{
  "success": true,
  "data": {
    "totalEntries": 5,
    "totalSize": 1024,
    "oldestEntry": "2025-06-21T03:45:03.974Z",
    "newestEntry": "2025-06-21T03:45:03.974Z",
    "maxAge": "24 hours",
    "cacheDir": "/path/to/data/cache",
    "mruSize": 100,
    "mruEntries": 95
  }
}
```

### Get All Cache Entries
```http
GET /api/cache/entries?limit=50&offset=0&userId=user123&inMRU=true
```

Response:
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "key": "abc123...",
        "target": "https://api.example.com/data",
        "method": "GET",
        "userId": "user:123",
        "userIP": "192.168.1.100",
        "status": 200,
        "contentType": "application/json",
        "bodySize": 1024,
        "timestamp": "2025-06-21T03:45:03.974Z",
        "lastAccessed": "2025-06-21T03:45:03.974Z",
        "inMRU": true
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 50,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### Get Cache Users
```http
GET /api/cache/users
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "userId": "user:123",
      "entryCount": 25,
      "mruCount": 20,
      "totalSize": 51200,
      "lastActivity": "2025-06-21T03:45:03.974Z",
      "userTypes": ["user", "oauth"]
    }
  ]
}
```

### Get User Cache Entries
```http
GET /api/cache/users/user:123
```

### Clear All Cache
```http
POST /api/cache/clear
```

### Clean Up Expired Entries
```http
POST /api/cache/cleanup
```

### Clear User Cache
```http
POST /api/cache/users/user:123/clear
```

### Delete Specific Cache Entry
```http
DELETE /api/cache/{target}?method=GET&userId=user123&userIP=192.168.1.100
```

## Configuration

The cache service can be configured with the following options:

```typescript
interface CacheOptions {
  maxAge?: number; // in milliseconds, default 24 hours
  cacheDir?: string; // default: data/cache
  mruSize?: number; // MRU cache size, default 100
}
```

## Automatic Cleanup

- **Initial cleanup**: Runs when the server starts
- **Scheduled cleanup**: Runs every 6 hours
- **Expiration check**: Each cache read checks if the entry has expired
- **MRU maintenance**: Automatically maintains the 100-item limit

## Cache File Format

```json
{
  "status": 200,
  "headers": {
    "content-type": "application/json",
    "cache-control": "public, max-age=3600"
  },
  "body": "{\"data\": \"cached response\"}",
  "contentType": "application/json",
  "timestamp": 1750477522008,
  "userId": "user:123",
  "userIP": "192.168.1.100"
}
```

## Performance Benefits

- **Reduced latency**: MRU cache provides instant access to frequently used items
- **User isolation**: Different users get their own cached responses
- **Reduced bandwidth**: Fewer requests to upstream servers
- **Improved reliability**: Cached responses available even if upstream is down
- **Load reduction**: Less load on upstream servers
- **Memory efficiency**: Only 100 most recent items kept in memory

## User-Specific Benefits

- **Personalized caching**: Each user's requests are cached separately
- **Privacy protection**: User data is isolated in cache entries
- **Session persistence**: OAuth2 and session-based caching
- **API token support**: Bearer token and API key-based user identification
- **IP fallback**: Anonymous users identified by IP address

## Monitoring

Cache performance can be monitored through:
- Management API statistics with MRU information
- User-specific cache analytics
- Log messages with `[CACHE]` prefix
- Cache file inspection in `data/cache/` directory
- MRU vs disk cache hit rates

## Limitations

- Only GET requests are cached
- Only successful responses (200 status) are cached
- Cache keys exclude query parameters (all requests to same path share cache)
- MRU cache limited to 100 items in memory
- Cache is stored on disk (not all in memory)
- Maximum cache size depends on available disk space
- User identification depends on request headers/cookies 