# CORS Proxy Configuration Guide

This guide explains how to configure CORS (Cross-Origin Resource Sharing) support in the proxy server to bypass browser CORS restrictions when accessing external APIs.

## What is CORS and Why Use a Proxy?

CORS is a security feature implemented by web browsers that restricts how web pages can access resources from different origins (domains, protocols, or ports). When your frontend application tries to make requests to external APIs, browsers may block these requests due to CORS policies.

A CORS proxy solves this by:
- Acting as an intermediary between your frontend and external APIs
- Adding proper CORS headers to responses
- Handling preflight OPTIONS requests
- Allowing your frontend to make requests to the proxy, which then forwards them to the external API

## Configuration Options

### Simple CORS Configuration

For basic CORS support that allows all origins:

```yaml
routes:
  - domain: "yourdomain.com"
    type: "proxy"
    path: "/api/external"
    target: "https://external-api.com"
    cors: true  # Simple CORS - allows all origins
    rewrite:
      "^/api/external/": "/"
```

This configuration:
- Allows requests from any origin
- Supports standard HTTP methods (GET, POST, PUT, DELETE, etc.)
- Includes common headers like `Content-Type` and `Authorization`
- Sets a 24-hour cache for preflight requests

### Advanced CORS Configuration

For fine-grained control over CORS behavior:

```yaml
routes:
  - domain: "yourdomain.com"
    type: "proxy"
    path: "/api/restricted"
    target: "https://external-api.com"
    cors:
      enabled: true
      origin: ["https://yourdomain.com", "http://localhost:3000"]
      credentials: true
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
      exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"]
      maxAge: 3600  # 1 hour
    rewrite:
      "^/api/restricted/": "/"
```

### CORS Configuration Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable CORS |
| `origin` | boolean \| string \| string[] | `true` | Allowed origins |
| `credentials` | boolean | `false` | Allow credentials (cookies, auth headers) |
| `methods` | string[] | `['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS']` | Allowed HTTP methods |
| `allowedHeaders` | string[] | `['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']` | Headers clients can send |
| `exposedHeaders` | string[] | `['Content-Length', 'Content-Type']` | Headers clients can access |
| `maxAge` | number | `86400` | Preflight cache time (seconds) |
| `preflightContinue` | boolean | `false` | Pass control to next handler for OPTIONS |
| `optionsSuccessStatus` | number | `204` | Status code for successful OPTIONS requests |
| `forwardHeaders` | string[] | See below | Headers to forward from client to target |

#### Header Forwarding Configuration

The `forwardHeaders` option allows you to specify which headers from the client request should be forwarded to the target server. This is useful for authentication and API keys that need to be passed through the proxy.

**Default Headers Forwarded:**
If `forwardHeaders` is not specified, the following headers are automatically forwarded:
- `authorization` - Bearer tokens, Basic auth, etc.

**Example Configurations:**

```yaml
# Forward only authorization header
cors:
  forwardHeaders: ["authorization"]

# Forward custom headers for specific API
cors:
  forwardHeaders: ["authorization", "x-api-key", "x-custom-auth", "x-user-id"]

# Forward no headers (empty array)
cors:
  forwardHeaders: []

# Use default headers (don't specify forwardHeaders)
cors:
  enabled: true
  origin: ["https://yourdomain.com"]
```

## Usage Examples

### 1. Proxying a REST API

```yaml
# Proxy JSONPlaceholder API
- domain: "localhost"
  type: "proxy"
  path: "/api/posts"
  target: "https://jsonplaceholder.typicode.com"
  cors: true
  rewrite:
    "^/api/posts/": "/"
```

Frontend usage:
```javascript
// Instead of: https://jsonplaceholder.typicode.com/posts/1
// Use: http://localhost/api/posts/posts/1
fetch('/api/posts/posts/1')
  .then(response => response.json())
  .then(data => console.log(data));
```

### 2. Proxying with Authentication

```yaml
# Proxy API that requires specific headers
- domain: "yourdomain.com"
  type: "proxy"
  path: "/api/secure"
  target: "https://secure-api.com"
  cors:
    enabled: true
    origin: ["https://yourdomain.com"]
    credentials: true
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
    exposedHeaders: ["X-RateLimit-Limit"]
  headers:
    "X-API-Key": "${API_KEY}"  # Add API key to all requests
```

Frontend usage:
```javascript
fetch('/api/secure/users', {
  method: 'GET',
  credentials: 'include',  // Include cookies
  headers: {
    'Authorization': 'Bearer your-token'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

### 3. Proxying with URL Rewriting

```yaml
# Proxy GitHub API with path rewriting
- domain: "yourdomain.com"
  type: "proxy"
  path: "/github"
  target: "https://api.github.com"
  cors:
    enabled: true
    origin: ["https://yourdomain.com"]
    allowedHeaders: ["Content-Type", "Authorization", "User-Agent"]
  rewrite:
    "^/github/": "/"
  headers:
    "User-Agent": "YourApp/1.0"
```

Frontend usage:
```javascript
// Access GitHub API through your proxy
// Instead of: https://api.github.com/users/octocat
// Use: https://yourdomain.com/github/users/octocat
fetch('/github/users/octocat')
  .then(response => response.json())
  .then(user => console.log(user));
```

### 4. Development vs Production Configuration

```yaml
# Development configuration (permissive)
- domain: "localhost"
  type: "proxy"
  path: "/api/dev"
  target: "https://dev-api.com"
  cors: true  # Allow all origins for development

# Production configuration (restrictive)
- domain: "yourdomain.com"
  type: "proxy"
  path: "/api/prod"
  target: "https://prod-api.com"
  cors:
    enabled: true
    origin: ["https://yourdomain.com"]
    credentials: true
    methods: ["GET", "POST", "PUT", "DELETE"]
    maxAge: 3600
```

### 5. Custom Header Forwarding

```yaml
# Proxy API with custom authentication headers
- domain: "yourdomain.com"
  type: "proxy"
  path: "/api/custom-auth"
  target: "https://custom-api.com"
  cors:
    enabled: true
    origin: ["https://yourdomain.com"]
    credentials: true
    allowedHeaders: ["Content-Type", "Authorization", "X-Custom-Auth", "X-User-ID"]
    # Forward specific headers from client to target
    forwardHeaders: ["authorization", "x-custom-auth", "x-user-id"]
  rewrite:
    "^/api/custom-auth/": "/"
```

Frontend usage:
```javascript
fetch('/api/custom-auth/users', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Authorization': 'Bearer your-token',
    'X-Custom-Auth': 'custom-auth-value',
    'X-User-ID': 'user123'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

In this example, the `Authorization`, `X-Custom-Auth`, and `X-User-ID` headers from the client request will be forwarded to the target server at `https://custom-api.com`.

## Security Considerations

### 1. Origin Restrictions

Always specify allowed origins in production:

```yaml
cors:
  origin: ["https://yourdomain.com", "https://app.yourdomain.com"]
  # Don't use: origin: true (allows all origins)
```

### 2. Credentials Handling

Only enable credentials when necessary:

```yaml
cors:
  credentials: true  # Only if you need to send cookies/auth headers
  origin: ["https://yourdomain.com"]  # Must specify origins when using credentials
```

### 3. Header Filtering

Limit allowed headers to what's actually needed:

```yaml
cors:
  allowedHeaders: ["Content-Type", "Authorization"]
  # Don't include unnecessary headers
```

### 4. Method Restrictions

Restrict HTTP methods if possible:

```yaml
cors:
  methods: ["GET", "POST"]  # Only allow safe methods if appropriate
```

## Troubleshooting

### Common Issues

1. **CORS preflight failures**
   - Ensure `OPTIONS` method is included in `methods` array
   - Check that all required headers are in `allowedHeaders`

2. **Credentials not working**
   - Set `credentials: true` in CORS config
   - Specify exact origins (not `true`) when using credentials
   - Use `credentials: 'include'` in frontend fetch requests

3. **Headers not accessible in frontend**
   - Add headers to `exposedHeaders` array
   - Check browser's network tab for actual response headers

### Debug Mode

Enable debug logging to see CORS behavior:

```yaml
logging:
  level: "debug"  # Shows detailed CORS processing
```

## Performance Considerations

1. **Preflight Caching**: Set appropriate `maxAge` to reduce preflight requests
2. **Path Specificity**: Use specific paths to avoid unnecessary CORS processing
3. **Origin Lists**: Keep origin lists concise for better performance

## Best Practices

1. **Use specific origins** in production, not wildcard (`*`)
2. **Enable credentials only when needed** to avoid security issues
3. **Limit exposed headers** to reduce response size
4. **Use appropriate cache times** for preflight requests
5. **Monitor logs** for CORS-related errors
6. **Test with multiple browsers** as CORS behavior can vary

## Example Frontend Integration

```javascript
// API utility with CORS proxy
class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/api/external${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      credentials: 'include',  // If credentials are enabled
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Example methods
  getUsers() {
    return this.request('/users');
  }

  createUser(userData) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }
}

// Usage
const api = new ApiClient();
api.getUsers().then(users => console.log(users));
```

This CORS proxy feature enables seamless integration with external APIs while maintaining security and providing flexibility for different use cases.