# OAuth2 Integration for Any Route Type

The proxy now supports OAuth2 authentication for any type of route (static, proxy, redirect, cors-forwarder) through centralized middleware processing.

## How It Works

OAuth2 authentication is now handled centrally in the `BunMiddleware` class, which means:

1. **Automatic Route Detection**: The middleware automatically detects which route a request belongs to
2. **OAuth2 Processing**: If the route has OAuth2 enabled, authentication is processed before the request reaches the route handler
3. **Public Paths**: Routes can define public paths that don't require authentication
4. **Session Management**: OAuth2 sessions are managed automatically with secure cookies

## Configuration

### Basic OAuth2 Configuration

Add OAuth2 configuration to any route in your proxy configuration:

```json
{
  "routes": [
    {
      "name": "My Protected App",
      "domain": "example.com",
      "path": "/app",
      "type": "static",
      "staticPath": "/path/to/static/files",
      "oauth2": {
        "enabled": true,
        "provider": "google",
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authorizationEndpoint": "https://accounts.google.com/oauth/authorize",
        "tokenEndpoint": "https://oauth2.googleapis.com/token",
        "callbackUrl": "https://example.com/app/oauth/callback",
        "scopes": ["openid", "email", "profile"]
      },
      "publicPaths": ["/app/public", "/app/assets"]
    }
  ]
}
```

### OAuth2 Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | boolean | No | Enable OAuth2 for this route (default: false) |
| `provider` | string | Yes | OAuth2 provider name (e.g., "google", "github", "microsoft") |
| `clientId` | string | Yes | OAuth2 client ID |
| `clientSecret` | string | Yes | OAuth2 client secret |
| `authorizationEndpoint` | string | Yes | OAuth2 authorization endpoint URL |
| `tokenEndpoint` | string | Yes | OAuth2 token endpoint URL |
| `callbackUrl` | string | Yes | OAuth2 callback URL |
| `scopes` | string[] | No | OAuth2 scopes to request |
| `pkce` | boolean | No | Enable PKCE (Proof Key for Code Exchange) |
| `additionalParams` | object | No | Additional OAuth2 parameters |
| `subscriptionKey` | string | No | Subscription key for APIs that require it |
| `subscriptionKeyHeader` | string | No | Header name for subscription key |
| `sessionEndpoint` | string | No | Custom session endpoint (default: `/oauth/session`) |
| `logoutEndpoint` | string | No | Custom logout endpoint (default: `/oauth/logout`) |
| `loginPath` | string | No | Custom login path (default: `/oauth/login`) |
| `callbackRedirectEndpoint` | string | No | Redirect after successful callback (default: `/`) |

### Public Paths

Define paths that don't require authentication:

```json
{
  "publicPaths": [
    "/app/public",
    "/app/assets",
    "/app/api/public"
  ]
}
```

## Route Types with OAuth2

### Static Routes

```json
{
  "name": "Protected Static App",
  "type": "static",
  "staticPath": "/path/to/files",
  "oauth2": {
    "enabled": true,
    "provider": "google",
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "authorizationEndpoint": "https://accounts.google.com/oauth/authorize",
    "tokenEndpoint": "https://oauth2.googleapis.com/token",
    "callbackUrl": "https://example.com/app/oauth/callback"
  }
}
```

### Proxy Routes

```json
{
  "name": "Protected API Proxy",
  "type": "proxy",
  "target": "https://api.example.com",
  "oauth2": {
    "enabled": true,
    "provider": "github",
    "clientId": "your-github-client-id",
    "clientSecret": "your-github-client-secret",
    "authorizationEndpoint": "https://github.com/login/oauth/authorize",
    "tokenEndpoint": "https://github.com/login/oauth/access_token",
    "callbackUrl": "https://example.com/api/oauth/callback"
  }
}
```

### CORS Forwarder Routes

```json
{
  "name": "Protected CORS Proxy",
  "type": "cors-forwarder",
  "oauth2": {
    "enabled": true,
    "provider": "microsoft",
    "clientId": "your-ms-client-id",
    "clientSecret": "your-ms-client-secret",
    "authorizationEndpoint": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    "tokenEndpoint": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    "callbackUrl": "https://example.com/cors/oauth/callback"
  }
}
```

## OAuth2 Endpoints

The middleware automatically creates these endpoints for each OAuth2-enabled route:

- **Login**: `{route.path}/oauth/login` - Initiates OAuth2 flow
- **Callback**: `{route.path}/oauth/callback` - Handles OAuth2 callback
- **Session**: `{route.path}/oauth/session` - Returns current session status
- **Logout**: `{route.path}/oauth/logout` - Logs out and clears session

## Session Management

- Sessions are stored securely with unique cookie names per route
- Automatic token refresh when tokens expire
- Session cleanup for expired states
- Secure cookie handling with HttpOnly flags

## Security Features

- **PKCE Support**: Enable PKCE for enhanced security
- **State Validation**: Prevents CSRF attacks
- **Secure Cookies**: HttpOnly cookies for session management
- **Token Refresh**: Automatic token refresh before expiration
- **Public Paths**: Exclude specific paths from authentication

## Example Usage Flow

1. **User visits protected route**: `https://example.com/app/dashboard`
2. **Middleware checks authentication**: If not authenticated, redirects to `/app/oauth/login`
3. **OAuth2 flow**: User is redirected to OAuth2 provider
4. **Callback handling**: Provider redirects back to `/app/oauth/callback`
5. **Session creation**: Valid tokens are stored in secure session
6. **Access granted**: User can now access protected resources

## Troubleshooting

### Common Issues

1. **Callback URL mismatch**: Ensure the callback URL in your OAuth2 provider matches exactly
2. **CORS issues**: Make sure your OAuth2 provider allows your domain
3. **Session not persisting**: Check cookie settings and domain configuration
4. **Token refresh failures**: Verify refresh token configuration

### Debugging

Enable debug logging to see OAuth2 flow details:

```json
{
  "logging": {
    "level": "debug"
  }
}
```

## Migration from Previous OAuth2 Implementation

If you were using the previous OAuth2 implementation:

1. **Remove individual OAuth2 middleware**: The middleware is now handled centrally
2. **Update route configuration**: Add `oauth2.enabled: true` to your routes
3. **Test authentication flow**: Verify that OAuth2 still works as expected

The new implementation is backward compatible and should work with existing OAuth2 configurations. 