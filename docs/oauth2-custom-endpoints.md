# OAuth2 Custom Endpoints and Callback Redirects

This document describes the OAuth2 custom endpoint configuration features that allow you to customize the session, logout, and callback redirect paths.

## Overview

The OAuth2 service now supports custom endpoint paths for session management and logout, as well as custom callback redirect paths after successful authentication. This provides more flexibility in integrating OAuth2 authentication with your applications.

## Configuration Options

### Custom Endpoint Paths

You can customize the following endpoint paths in your OAuth2 configuration:

- `sessionEndpoint`: Custom path for the session endpoint (default: `/oauth/session`)
- `logoutEndpoint`: Custom path for the logout endpoint (default: `/oauth/logout`)
- `callbackRedirectPath`: Custom path to redirect after successful OAuth2 callback (default: `/`)

### Configuration Example

```yaml
routes:
  - domain: "app.example.com"
    path: "/my-app"
    type: "static"
    staticPath: "/var/www/my-app/build"
    requireAuth: true
    oauth2:
      enabled: true
      provider: "google"
      clientId: "${GOOGLE_CLIENT_ID}"
      clientSecret: "${GOOGLE_CLIENT_SECRET}"
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth"
      tokenEndpoint: "https://oauth2.googleapis.com/token"
      callbackUrl: "https://app.example.com/my-app/auth/callback"
      scopes: ["openid", "profile", "email"]
      pkce: true
      # Custom endpoint paths
      sessionEndpoint: "/auth/session"      # Custom session endpoint
      logoutEndpoint: "/auth/logout"        # Custom logout endpoint
      callbackRedirectPath: "/dashboard"    # Redirect to dashboard after login
    publicPaths:
      - "/auth/callback"
      - "/auth/session"
      - "/auth/logout"
      - "/login"
      - "/static"
```

## Endpoint Details

### Session Endpoint (`sessionEndpoint`)

**Default**: `/oauth/session`

This endpoint returns the current authentication status and session information.

**Response Format**:
```json
{
  "authenticated": true,
  "session": {
    "accessToken": "token_value",
    "tokenType": "Bearer",
    "scope": "openid profile email",
    "expiresAt": "2024-01-01T12:00:00.000Z",
    "isExpired": false,
    "expiresIn": 3600000,
    "sessionId": "session_id"
  },
  "provider": "google",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Logout Endpoint (`logoutEndpoint`)

**Default**: `/oauth/logout`

This endpoint clears the current session and logs the user out.

**Response Format**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Callback Redirect Path (`callbackRedirectPath`)

**Default**: `/`

This path determines where users are redirected after successful OAuth2 authentication. The path is relative to the route's base path.

**Examples**:
- `callbackRedirectPath: "/dashboard"` - Redirects to `/my-app/dashboard`
- `callbackRedirectPath: "/admin"` - Redirects to `/my-app/admin`
- `callbackRedirectPath: "/"` - Redirects to `/my-app/`

## Usage Examples

### Frontend Integration

```javascript
// Check authentication status
async function checkAuth() {
  const response = await fetch('/auth/session');
  const data = await response.json();
  
  if (data.authenticated) {
    console.log('User is authenticated');
    console.log('Access token:', data.session.accessToken);
  } else {
    console.log('User is not authenticated');
  }
}

// Logout user
async function logout() {
  const response = await fetch('/auth/logout', {
    method: 'POST'
  });
  const data = await response.json();
  
  if (data.success) {
    console.log('Logged out successfully');
    // Redirect to login page or home
    window.location.href = '/login';
  }
}

// Handle OAuth2 flow
function initiateOAuth() {
  // The middleware will automatically redirect to the OAuth provider
  window.location.href = '/protected-route';
}
```

### API Integration

```javascript
// Make authenticated API calls
async function makeAuthenticatedRequest(url, options = {}) {
  const sessionResponse = await fetch('/auth/session');
  const sessionData = await sessionResponse.json();
  
  if (!sessionData.authenticated) {
    throw new Error('User not authenticated');
  }
  
  const headers = {
    'Authorization': `${sessionData.session.tokenType} ${sessionData.session.accessToken}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  return fetch(url, {
    ...options,
    headers
  });
}
```

## Security Considerations

1. **Public Paths**: Always include your custom endpoint paths in the `publicPaths` array to ensure they're accessible without authentication.

2. **HTTPS**: Use HTTPS in production to secure OAuth2 flows and session cookies.

3. **Cookie Security**: The session cookie is automatically configured with secure settings:
   - `httpOnly: true` - Prevents XSS attacks
   - `secure: true` - Only sent over HTTPS
   - `sameSite: 'lax'` - Provides CSRF protection

4. **Token Storage**: Access tokens are stored server-side in memory. Consider implementing persistent storage for production use.

## Migration Guide

### From Default Endpoints

If you're currently using the default endpoints (`/oauth/session` and `/oauth/logout`), you can migrate to custom endpoints by:

1. Adding the custom endpoint configuration to your OAuth2 config
2. Updating your frontend code to use the new endpoints
3. Adding the new endpoints to your `publicPaths` array

**Before**:
```yaml
publicPaths:
  - "/oauth/callback"
  - "/oauth/session"
  - "/oauth/logout"
```

**After**:
```yaml
oauth2:
  sessionEndpoint: "/auth/session"
  logoutEndpoint: "/auth/logout"
publicPaths:
  - "/oauth/callback"
  - "/auth/session"
  - "/auth/logout"
```

## Troubleshooting

### Common Issues

1. **404 Errors on Custom Endpoints**: Ensure the custom endpoints are included in the `publicPaths` array.

2. **Redirect Loops**: Check that the `callbackRedirectPath` doesn't point to a protected route that requires authentication.

3. **Session Not Found**: Verify that the session endpoint path matches between your frontend requests and the OAuth2 configuration.

### Debug Logging

Enable debug logging to troubleshoot OAuth2 flows:

```yaml
logging:
  level: "debug"
```

The OAuth2 service logs detailed information about:
- Authorization URL generation
- Token exchange attempts
- Session management
- Middleware request handling 