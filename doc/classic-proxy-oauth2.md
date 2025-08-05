# OAuth2 Authentication for Any Route Type

This document explains how to configure and use OAuth2 authentication with any route type (static, proxy, redirect, cors-forwarder) in the proxy server.

## Overview

All route types now support OAuth2 authentication through centralized middleware processing, allowing you to protect any endpoint with industry-standard OAuth2 flows. The proxy server handles the OAuth2 authentication process automatically and forwards authenticated session data to your backend services.

## Features

- **Universal Route Support**: Works with static, proxy, redirect, and cors-forwarder routes
- **Multiple OAuth2 Providers**: Support for Google, GitHub, and custom OAuth2 providers
- **Session Management**: Automatic session handling with secure cookies
- **Unique Cookie Names**: Each route uses unique cookie names to maintain independent sessions
- **Route Protection**: Protect specific routes or entire domains
- **Public Paths**: Configure paths that don't require authentication
- **Centralized Middleware**: OAuth2 processing happens before route-specific handling
- **Session Data Forwarding**: OAuth session information is forwarded to target services
- **Subscription Keys**: Support for enterprise APIs requiring subscription keys
- **Custom Endpoints**: Configurable OAuth endpoint paths

## Configuration

### Basic OAuth2 Configuration

```yaml
routes:
  # Proxy route with OAuth2
  - domain: "api.example.com"
    type: "proxy"
    path: "/protected-api"
    target: "http://localhost:3000"
    ssl: true
    oauth2:
      enabled: true
      provider: "google"
      clientId: "${GOOGLE_CLIENT_ID}"
      clientSecret: "${GOOGLE_CLIENT_SECRET}"
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth"
      tokenEndpoint: "https://oauth2.googleapis.com/token"
      callbackUrl: "https://api.example.com/protected-api/oauth/callback"
      scopes: ["openid", "profile", "email"]
      pkce: true
      # Custom endpoint paths
      sessionEndpoint: "/auth/session"
      logoutEndpoint: "/auth/logout"
      loginPath: "/auth/login"
      callbackRedirectEndpoint: "/dashboard"
    publicPaths:
      - "/oauth/callback"
      - "/auth/session"
      - "/auth/logout"
      - "/auth/login"
      - "/health"

  # Static route with OAuth2
  - domain: "app.example.com"
    type: "static"
    path: "/app"
    staticPath: "/var/www/app"
    spaFallback: true
    oauth2:
      enabled: true
      provider: "github"
      clientId: "${GITHUB_CLIENT_ID}"
      clientSecret: "${GITHUB_CLIENT_SECRET}"
      authorizationEndpoint: "https://github.com/login/oauth/authorize"
      tokenEndpoint: "https://github.com/login/oauth/access_token"
      callbackUrl: "https://app.example.com/app/oauth/callback"
      scopes: ["read:user", "user:email"]
    publicPaths:
      - "/app/public"
      - "/app/assets"
```

### Configuration Options

#### OAuth2 Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | Enable OAuth2 authentication |
| `provider` | string | Yes | OAuth2 provider name (e.g., "google", "github", "custom") |
| `clientId` | string | Yes | OAuth2 client ID |
| `clientSecret` | string | Yes | OAuth2 client secret |
| `authorizationEndpoint` | string | Yes | OAuth2 authorization endpoint URL |
| `tokenEndpoint` | string | Yes | OAuth2 token endpoint URL |
| `callbackUrl` | string | Yes | OAuth2 callback URL |
| `scopes` | string[] | No | OAuth2 scopes to request |
| `pkce` | boolean | No | Enable PKCE (Proof Key for Code Exchange) |
| `additionalParams` | object | No | Additional OAuth2 parameters |
| `subscriptionKey` | string | No | API subscription key for enterprise APIs |
| `subscriptionKeyHeader` | string | No | Header name for subscription key |
| `sessionEndpoint` | string | No | Custom session endpoint path (default: `/oauth/session`) |
| `logoutEndpoint` | string | No | Custom logout endpoint path (default: `/oauth/logout`) |
| `loginPath` | string | No | Custom login path (default: `/oauth/login`) |
| `callbackRedirectEndpoint` | string | No | Endpoint to redirect after successful login (default: `/`) |

#### Route Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `requireAuth` | boolean | No | Require authentication (default: false) |
| `publicPaths` | string[] | No | Paths that don't require authentication |
| `oauth2` | OAuth2Config | No | OAuth2 configuration |

## OAuth2 Flow

1. **Initial Request**: User makes a request to a protected route
2. **Authentication Check**: Proxy checks for valid OAuth2 session
3. **Redirect to Login**: If not authenticated, redirect to OAuth2 login
4. **OAuth2 Authorization**: User authorizes with OAuth2 provider
5. **Callback Processing**: OAuth2 provider redirects back with authorization code
6. **Token Exchange**: Proxy exchanges code for access token
7. **Session Creation**: Proxy creates session and sets secure cookie
8. **Request Forwarding**: Authenticated request is forwarded to target service

## Session Data Forwarding

When a request is authenticated, the proxy forwards OAuth2 session information to the target service via HTTP headers:

- `X-OAuth2-Access-Token`: The OAuth2 access token
- `X-OAuth2-Token-Type`: The token type (usually "Bearer")
- `X-OAuth2-Scope`: The granted OAuth2 scopes
- `X-OAuth2-Expires-At`: Token expiration timestamp
- `X-{SubscriptionKeyHeader}`: Subscription key (if configured)

## Public Paths

Configure paths that don't require authentication:

```yaml
publicPaths:
  - "/oauth/callback"    # OAuth2 callback endpoint
  - "/oauth/session"     # Session status endpoint
  - "/oauth/logout"      # Logout endpoint
  - "/health"           # Health check endpoint
  - "/docs"             # API documentation
  - "/static"           # Static assets
```

## OAuth2 Endpoints

The proxy automatically provides these OAuth2 endpoints:

### Session Status
- **Path**: `/oauth/session` (or custom `sessionEndpoint`)
- **Method**: GET
- **Response**: JSON with authentication status and session data

### Logout
- **Path**: `/oauth/logout` (or custom `logoutEndpoint`)
- **Method**: GET
- **Response**: Clears session and returns success message

### Login
- **Path**: `/oauth/login` (or custom `loginPath`)
- **Method**: GET
- **Response**: Redirects to OAuth2 authorization URL

## Examples

### Google OAuth2

```yaml
oauth2:
  enabled: true
  provider: "google"
  clientId: "${GOOGLE_CLIENT_ID}"
  clientSecret: "${GOOGLE_CLIENT_SECRET}"
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth"
  tokenEndpoint: "https://oauth2.googleapis.com/token"
  callbackUrl: "https://api.example.com/oauth/callback"
  scopes: ["openid", "profile", "email"]
  pkce: true
```

### GitHub OAuth2

```yaml
oauth2:
  enabled: true
  provider: "github"
  clientId: "${GITHUB_CLIENT_ID}"
  clientSecret: "${GITHUB_CLIENT_SECRET}"
  authorizationEndpoint: "https://github.com/login/oauth/authorize"
  tokenEndpoint: "https://github.com/login/oauth/access_token"
  callbackUrl: "https://api.example.com/oauth/callback"
  scopes: ["read:user", "user:email"]
  pkce: false  # GitHub doesn't support PKCE
```

### Custom OAuth2 Provider

```yaml
oauth2:
  enabled: true
  provider: "custom"
  clientId: "${CUSTOM_CLIENT_ID}"
  clientSecret: "${CUSTOM_CLIENT_SECRET}"
  authorizationEndpoint: "https://auth.custom.com/oauth/authorize"
  tokenEndpoint: "https://auth.custom.com/oauth/token"
  callbackUrl: "https://api.example.com/oauth/callback"
  scopes: ["api:read", "api:write"]
  pkce: true
  additionalParams:
    response_mode: "form_post"
    prompt: "login"
```

### Enterprise API with Subscription Key

```yaml
oauth2:
  enabled: true
  provider: "enterprise"
  clientId: "${ENTERPRISE_CLIENT_ID}"
  clientSecret: "${ENTERPRISE_CLIENT_SECRET}"
  authorizationEndpoint: "https://auth.enterprise.com/oauth/authorize"
  tokenEndpoint: "https://auth.enterprise.com/oauth/token"
  callbackUrl: "https://api.example.com/oauth/callback"
  scopes: ["read", "write"]
  pkce: true
  subscriptionKey: "${ENTERPRISE_SUBSCRIPTION_KEY}"
  subscriptionKeyHeader: "X-Enterprise-Key"
```

## Security Considerations

1. **HTTPS Only**: Always use HTTPS in production for secure cookie transmission
2. **Secure Cookies**: OAuth2 session cookies are set with secure flags
3. **PKCE**: Enable PKCE for enhanced security when supported by the OAuth2 provider
4. **Scope Limitation**: Request only the minimum required OAuth2 scopes
5. **Token Expiration**: Respect OAuth2 token expiration times
6. **Public Paths**: Carefully configure public paths to avoid security vulnerabilities

## Environment Variables

Set the required environment variables for your OAuth2 providers:

```bash
# Google OAuth2
export GOOGLE_CLIENT_ID="your_google_client_id"
export GOOGLE_CLIENT_SECRET="your_google_client_secret"

# GitHub OAuth2
export GITHUB_CLIENT_ID="your_github_client_id"
export GITHUB_CLIENT_SECRET="your_github_client_secret"

# Custom OAuth2
export CUSTOM_CLIENT_ID="your_custom_client_id"
export CUSTOM_CLIENT_SECRET="your_custom_client_secret"

# Enterprise API
export ENTERPRISE_CLIENT_ID="your_enterprise_client_id"
export ENTERPRISE_CLIENT_SECRET="your_enterprise_client_secret"
export ENTERPRISE_SUBSCRIPTION_KEY="your_enterprise_subscription_key"
```

## Troubleshooting

### Common Issues

1. **Invalid Callback URL**: Ensure the callback URL matches exactly what's configured in your OAuth2 provider
2. **Missing Scopes**: Verify that the requested scopes are available in your OAuth2 provider
3. **HTTPS Required**: OAuth2 providers typically require HTTPS for production use
4. **Session Expiration**: Check if sessions are expiring too quickly

### Debugging

Enable debug logging to troubleshoot OAuth2 issues:

```yaml
logging:
  level: "debug"
  file: "./logs/oauth2-debug.log"
```

### Testing

Use the session endpoint to verify authentication status:

```bash
curl -H "Cookie: oauth2-session=your_session_id" \
     https://api.example.com/oauth/session
```

## Migration from Static Routes

If you're migrating from static routes with OAuth2 to classic proxy routes:

1. Change `type` from `"static"` to `"proxy"`
2. Add `target` pointing to your backend service
3. Remove `staticPath` and `spaFallback` if present
4. Keep the same OAuth2 configuration
5. Update public paths if needed

The OAuth2 authentication flow remains the same, but requests are now proxied to your backend service instead of serving static files.

## Unique Cookie Names

Each OAuth2-protected route uses a unique cookie name to maintain independent sessions. This allows multiple OAuth2 routes to coexist without session conflicts.

### Cookie Name Format

Cookie names follow this pattern:
```
oauth2_{provider}_{routeIdentifier}_{clientIdHash}
```

Where:
- `{provider}`: The OAuth2 provider name (e.g., "google", "github", "custom")
- `{routeIdentifier}`: The route path or "default" for domain-based routes
- `{clientIdHash}`: First 8 characters of the SHA-256 hash of the client ID

### Examples

```yaml
# Route: /api/google
# Provider: google
# Cookie: oauth2_google_api_google_a1b2c3d4

# Route: /app
# Provider: google  
# Cookie: oauth2_google_app_e5f6g7h8

# Route: /api/github
# Provider: github
# Cookie: oauth2_github_api_github_i9j0k1l2

# Domain: admin.example.com (no path)
# Provider: enterprise
# Cookie: oauth2_enterprise_default_m3n4o5p6
```

### Benefits

1. **Independent Sessions**: Each route maintains its own OAuth2 session
2. **Multiple Providers**: Can use different OAuth2 providers on different routes
3. **Same Provider, Different Apps**: Can use the same OAuth2 provider with different client IDs
4. **No Session Conflicts**: Users can be authenticated to multiple routes simultaneously
5. **Security**: Cookie names are unique and don't expose sensitive information

### Session Independence

With unique cookie names, users can:
- Be logged into `/api/google` with Google OAuth2
- Be logged into `/api/github` with GitHub OAuth2  
- Be logged into `/app` with a different Google OAuth2 client
- All sessions remain independent and don't interfere with each other 