# Proxy Configuration (`proxy.yaml`)

The proxy configuration file (`proxy.yaml`) defines the reverse proxy routes, SSL certificate settings, and security configurations for the Advanced Reverse Proxy Server.

## 📋 Configuration Structure

```yaml
port: 80
httpsPort: 443
letsEncrypt:
  email: "your-email@example.com"
  staging: true
  certDir: "./certificates"

routes:
  - domain: "example.com"
    target: "http://localhost:3000"
    path: "/"
    type: "proxy"
    ssl: true
    cors: true
    oauth2:
      enabled: true
      provider: "google"
      # ... OAuth2 configuration

logging:
  level: "info"
  file: "./logs/proxy.log"

security:
  rateLimitWindowMs: 60000
  rateLimitMaxRequests: 100
  csp:
    enabled: true
    directives:
      defaultSrc: ["'self'"]
      scriptSrc: ["'self'", "'unsafe-inline'"]
```

## 🔧 Server Configuration

### `port`
- **Type**: `number`
- **Default**: `80`
- **Description**: HTTP port for the proxy server
- **Example**: `80`

### `httpsPort`
- **Type**: `number`
- **Default**: `443`
- **Description**: HTTPS port for the proxy server
- **Example**: `443`

## 🔐 Let's Encrypt Configuration

### `letsEncrypt.email`
- **Type**: `string`
- **Required**: `true`
- **Description**: Email address for Let's Encrypt account
- **Example**: `"admin@example.com"`

### `letsEncrypt.staging`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Use Let's Encrypt staging environment (recommended for testing)
- **Options**:
  - `true` - Use staging environment (no rate limits)
  - `false` - Use production environment

### `letsEncrypt.certDir`
- **Type**: `string`
- **Default**: `"./certificates"`
- **Description**: Directory to store SSL certificates
- **Example**: `"./certificates"`

## 🛣️ Route Configuration

Routes define how incoming requests are handled. Each route can have different types and configurations.

### Basic Route Structure

```yaml
routes:
  - domain: "example.com"
    target: "http://localhost:3000"
    path: "/"
    type: "proxy"
    ssl: true
    name: "My Application"
```

### Route Properties

#### `domain`
- **Type**: `string`
- **Required**: `true`
- **Description**: Domain name for the route
- **Examples**:
  ```yaml
  domain: "example.com"
  domain: "api.example.com"
  domain: "*.example.com"  # Wildcard domain
  ```

#### `target`
- **Type**: `string`
- **Required**: For proxy routes
- **Description**: Target URL for proxy routes
- **Examples**:
  ```yaml
  target: "http://localhost:3000"
  target: "https://api.example.com"
  target: "http://192.168.1.100:8080"
  ```

#### `path`
- **Type**: `string`
- **Default**: `"/"`
- **Description**: URL path for the route
- **Examples**:
  ```yaml
  path: "/"
  path: "/api"
  path: "/app/*"
  ```

#### `type`
- **Type**: `string`
- **Default**: `"proxy"`
- **Options**: `"proxy"`, `"static"`, `"redirect"`, `"cors-forwarder"`
- **Description**: Type of route handling

#### `ssl`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable SSL/TLS for this route
- **Example**: `true`

#### `name`
- **Type**: `string`
- **Description**: Human-readable name for the route (used in statistics)
- **Example**: `"My Application"`

## 🔄 Route Types

### 1. Proxy Routes (`type: "proxy"`)

Forward requests to a backend server.

```yaml
routes:
  - domain: "api.example.com"
    target: "http://localhost:3000"
    path: "/api"
    type: "proxy"
    ssl: true
    headers:
      X-API-Version: "v1"
    rewrite:
      "^/api": ""
```

#### Proxy-Specific Options

##### `headers`
- **Type**: `object`
- **Description**: Additional headers to send to the backend
- **Example**:
  ```yaml
  headers:
    X-API-Version: "v1"
    X-Forwarded-For: "${client_ip}"
    Authorization: "Bearer ${token}"
  ```

##### `rewrite`
- **Type**: `object`
- **Description**: URL path rewriting rules
- **Example**:
  ```yaml
  rewrite:
    "^/api": ""
    "^/v1": "/api/v1"
  ```

##### `replace`
- **Type**: `object`
- **Description**: Content replacement rules
- **Example**:
  ```yaml
  replace:
    "localhost:3000": "api.example.com"
    "http://": "https://"
  ```

### 2. Static Routes (`type: "static"`)

Serve static files from a local directory.

```yaml
routes:
  - domain: "static.example.com"
    path: "/"
    type: "static"
    staticPath: "./public"
    ssl: true
    spaFallback: true
```

#### Static-Specific Options

##### `staticPath`
- **Type**: `string`
- **Required**: For static routes
- **Description**: Local directory path for static files
- **Example**: `"./public"`

##### `spaFallback`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable SPA fallback (serve index.html for missing routes)
- **Example**: `true`

### 3. Redirect Routes (`type: "redirect"`)

Redirect requests to another URL.

```yaml
routes:
  - domain: "old.example.com"
    path: "/"
    type: "redirect"
    redirectTo: "https://new.example.com"
    ssl: true
```

#### Redirect-Specific Options

##### `redirectTo`
- **Type**: `string`
- **Required**: For redirect routes
- **Description**: URL to redirect to
- **Example**: `"https://new.example.com"`

### 4. CORS Forwarder Routes (`type: "cors-forwarder"`)

Forward requests to external APIs with CORS support.

```yaml
routes:
  - domain: "cors.example.com"
    path: "/api"
    type: "cors-forwarder"
    ssl: true
    cors:
      enabled: true
      origin: ["https://app.example.com"]
      credentials: true
```

## 🔐 OAuth2 Configuration

Add OAuth2 authentication to any route type.

```yaml
routes:
  - domain: "app.example.com"
    target: "http://localhost:3000"
    path: "/app"
    type: "proxy"
    ssl: true
    oauth2:
      enabled: true
      provider: "google"
      clientId: "${GOOGLE_CLIENT_ID}"
      clientSecret: "${GOOGLE_CLIENT_SECRET}"
      authorizationEndpoint: "https://accounts.google.com/oauth/authorize"
      tokenEndpoint: "https://oauth2.googleapis.com/token"
      callbackUrl: "https://app.example.com/oauth/callback"
      scopes: ["openid", "email", "profile"]
    publicPaths: ["/app/public", "/app/assets"]
```

### OAuth2 Options

#### `oauth2.enabled`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable OAuth2 authentication

#### `oauth2.provider`
- **Type**: `string`
- **Description**: OAuth2 provider name
- **Examples**: `"google"`, `"github"`, `"microsoft"`

#### `oauth2.clientId`
- **Type**: `string`
- **Required**: `true`
- **Description**: OAuth2 client ID
- **Example**: `"${GOOGLE_CLIENT_ID}"`

#### `oauth2.clientSecret`
- **Type**: `string`
- **Required**: `true`
- **Description**: OAuth2 client secret
- **Example**: `"${GOOGLE_CLIENT_SECRET}"`

#### `oauth2.authorizationEndpoint`
- **Type**: `string`
- **Required**: `true`
- **Description**: OAuth2 authorization endpoint
- **Example**: `"https://accounts.google.com/oauth/authorize"`

#### `oauth2.tokenEndpoint`
- **Type**: `string`
- **Required**: `true`
- **Description**: OAuth2 token endpoint
- **Example**: `"https://oauth2.googleapis.com/token"`

#### `oauth2.callbackUrl`
- **Type**: `string`
- **Required**: `true`
- **Description**: OAuth2 callback URL
- **Example**: `"https://app.example.com/oauth/callback"`

#### `oauth2.scopes`
- **Type**: `string[]`
- **Description**: OAuth2 scopes
- **Example**: `["openid", "email", "profile"]`

#### `publicPaths`
- **Type**: `string[]`
- **Description**: Public paths that don't require authentication
- **Example**: `["/app/public", "/app/assets", "/app/health"]`

## 🌐 CORS Configuration

Configure Cross-Origin Resource Sharing for routes.

```yaml
routes:
  - domain: "api.example.com"
    target: "http://localhost:3000"
    path: "/api"
    type: "proxy"
    ssl: true
    cors:
      enabled: true
      origin: ["https://app.example.com", "https://admin.example.com"]
      credentials: true
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
      exposedHeaders: ["X-Total-Count", "X-Page-Count"]
      maxAge: 86400
```

### CORS Options

#### `cors.enabled`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable CORS for this route

#### `cors.origin`
- **Type**: `boolean | string | string[]`
- **Default**: `true`
- **Description**: Allowed origins
- **Examples**:
  ```yaml
  origin: true  # Allow all origins
  origin: "https://app.example.com"  # Single origin
  origin: ["https://app.example.com", "https://admin.example.com"]  # Multiple origins
  ```

#### `cors.credentials`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Allow credentials (cookies, authorization headers)

#### `cors.methods`
- **Type**: `string[]`
- **Default**: `["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"]`
- **Description**: Allowed HTTP methods

#### `cors.allowedHeaders`
- **Type**: `string[]`
- **Default**: `["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]`
- **Description**: Allowed request headers

#### `cors.exposedHeaders`
- **Type**: `string[]`
- **Default**: `["Content-Length", "Content-Type"]`
- **Description**: Headers exposed to the client

#### `cors.maxAge`
- **Type**: `number`
- **Default**: `86400`
- **Description**: Preflight cache duration in seconds

## 🛡️ Security Configuration

### Rate Limiting

```yaml
security:
  rateLimitWindowMs: 60000  # 1 minute
  rateLimitMaxRequests: 100
```

#### `security.rateLimitWindowMs`
- **Type**: `number`
- **Default**: `60000` (1 minute)
- **Description**: Rate limiting window in milliseconds

#### `security.rateLimitMaxRequests`
- **Type**: `number`
- **Default**: `100`
- **Description**: Maximum requests per window

### Content Security Policy

```yaml
security:
  csp:
    enabled: true
    directives:
      defaultSrc: ["'self'"]
      scriptSrc: ["'self'", "'unsafe-inline'"]
      styleSrc: ["'self'", "'unsafe-inline'"]
      connectSrc: ["'self'", "https://api.example.com"]
      imgSrc: ["'self'", "data:", "https:"]
```

#### `security.csp.enabled`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable Content Security Policy

#### `security.csp.directives`
- **Type**: `object`
- **Description**: CSP directives
- **Common directives**:
  - `defaultSrc`: Default source policy
  - `scriptSrc`: Script source policy
  - `styleSrc`: Style source policy
  - `connectSrc`: Connect source policy
  - `imgSrc`: Image source policy
  - `fontSrc`: Font source policy
  - `objectSrc`: Object source policy
  - `mediaSrc`: Media source policy
  - `frameSrc`: Frame source policy

## 🌍 Geolocation Filtering

Filter requests based on geographic location.

```yaml
routes:
  - domain: "restricted.example.com"
    target: "http://localhost:3000"
    path: "/"
    type: "proxy"
    ssl: true
    geolocationFilter:
      enabled: true
      mode: "allow"  # or "block"
      countries: ["US", "CA", "GB"]
      regions: ["CA", "NY", "TX"]
      cities: ["New York", "Los Angeles"]
      customResponse:
        statusCode: 403
        message: "Access denied from your location"
      logBlocked: true
```

### Geolocation Filter Options

#### `geolocationFilter.enabled`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable geolocation filtering

#### `geolocationFilter.mode`
- **Type**: `string`
- **Options**: `"allow"`, `"block"`
- **Description**: Filtering mode
- **Examples**:
  - `"allow"` - Allow only specified locations
  - `"block"` - Block specified locations

#### `geolocationFilter.countries`
- **Type**: `string[]`
- **Description**: ISO country codes
- **Example**: `["US", "CA", "GB"]`

#### `geolocationFilter.regions`
- **Type**: `string[]`
- **Description**: Region codes
- **Example**: `["CA", "NY", "TX"]`

#### `geolocationFilter.cities`
- **Type**: `string[]`
- **Description**: City names
- **Example**: `["New York", "Los Angeles"]`

#### `geolocationFilter.customResponse`
- **Type**: `object`
- **Description**: Custom response for blocked requests
- **Options**:
  - `statusCode`: HTTP status code (default: 403)
  - `message`: Response message
  - `redirectUrl`: Redirect URL

#### `geolocationFilter.logBlocked`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Log blocked requests

## 🔌 WebSocket Support

Enable WebSocket proxying for routes.

```yaml
routes:
  - domain: "ws.example.com"
    target: "http://localhost:3000"
    path: "/ws"
    type: "proxy"
    ssl: true
    websocket:
      enabled: true
      timeout: 30000
      pingInterval: 30000
      maxRetries: 3
      retryDelay: 1000
```

### WebSocket Options

#### `websocket.enabled`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable WebSocket proxying

#### `websocket.timeout`
- **Type**: `number`
- **Default**: `30000`
- **Description**: Connection timeout in milliseconds

#### `websocket.pingInterval`
- **Type**: `number`
- **Default**: `30000`
- **Description**: Ping interval in milliseconds (0 to disable)

#### `websocket.maxRetries`
- **Type**: `number`
- **Default**: `3`
- **Description**: Maximum retry attempts for failed connections

#### `websocket.retryDelay`
- **Type**: `number`
- **Default**: `1000`
- **Description**: Delay between retry attempts in milliseconds

## 📝 Complete Example

```yaml
port: 80
httpsPort: 443

letsEncrypt:
  email: "admin@example.com"
  staging: true
  certDir: "./certificates"

routes:
  # API Proxy
  - domain: "api.example.com"
    target: "http://localhost:3000"
    path: "/api"
    type: "proxy"
    ssl: true
    name: "API Server"
    cors:
      enabled: true
      origin: ["https://app.example.com"]
      credentials: true
    headers:
      X-API-Version: "v1"

  # Static File Server
  - domain: "static.example.com"
    path: "/"
    type: "static"
    staticPath: "./public"
    ssl: true
    name: "Static Files"
    spaFallback: true

  # OAuth2 Protected App
  - domain: "app.example.com"
    target: "http://localhost:3001"
    path: "/app"
    type: "proxy"
    ssl: true
    name: "Protected App"
    oauth2:
      enabled: true
      provider: "google"
      clientId: "${GOOGLE_CLIENT_ID}"
      clientSecret: "${GOOGLE_CLIENT_SECRET}"
      authorizationEndpoint: "https://accounts.google.com/oauth/authorize"
      tokenEndpoint: "https://oauth2.googleapis.com/token"
      callbackUrl: "https://app.example.com/oauth/callback"
      scopes: ["openid", "email", "profile"]
    publicPaths: ["/app/public", "/app/assets", "/app/health"]

  # CORS Forwarder
  - domain: "cors.example.com"
    path: "/api"
    type: "cors-forwarder"
    ssl: true
    name: "CORS Proxy"
    cors:
      enabled: true
      origin: ["https://app.example.com"]
      credentials: true

  # Redirect
  - domain: "old.example.com"
    path: "/"
    type: "redirect"
    redirectTo: "https://new.example.com"
    ssl: true
    name: "Redirect"

logging:
  level: "info"
  file: "./logs/proxy.log"

security:
  rateLimitWindowMs: 60000
  rateLimitMaxRequests: 100
  csp:
    enabled: true
    directives:
      defaultSrc: ["'self'"]
      scriptSrc: ["'self'", "'unsafe-inline'"]
      styleSrc: ["'self'", "'unsafe-inline'"]
      connectSrc: ["'self'", "https://api.example.com"]
      imgSrc: ["'self'", "data:", "https:"]
```

## 🔍 Validation

The proxy configuration is validated on startup. Common validation errors:

- **Invalid ports**: Must be between 1 and 65535
- **Missing required fields**: OAuth2 routes require clientId, clientSecret, etc.
- **Invalid URLs**: Target URLs must be valid HTTP/HTTPS URLs
- **Invalid file paths**: Static paths must exist and be readable

## 📚 Related Documentation

- **[OAuth2 Integration](oauth2-integration.md)** - Detailed OAuth2 configuration
- **[CORS Configuration](cors-configuration.md)** - CORS setup and options
- **[Security Features](security.md)** - Security headers and policies
- **[Geolocation Filtering](geolocation-filtering.md)** - IP-based filtering
- **[WebSocket Support](websocket-support.md)** - WebSocket proxy configuration
