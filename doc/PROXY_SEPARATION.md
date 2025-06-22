# Proxy Separation: Classic Proxy vs CORS Proxy

This document explains the separation of proxy functionality into two distinct types: **Classic Proxy** and **CORS Proxy**.

## Overview

The proxy server now supports two distinct proxy types to handle different use cases:

1. **Classic Proxy**: Traditional reverse proxy functionality without CORS modifications
2. **CORS Proxy**: Specialized proxy for CORS bypass with enhanced CORS header management

## Architecture

### Base Proxy Class
- `BaseProxy` (`src/services/base-proxy.ts`): Abstract base class containing common functionality
  - User identification (OAuth2, tokens, headers, IP-based)
  - Request logging and error handling
  - Header masking for sensitive data
  - Cache integration

### Specialized Proxy Classes

#### Classic Proxy (`src/services/classic-proxy.ts`)
- **Purpose**: Traditional reverse proxy functionality
- **Features**:
  - Preserves original response headers from target
  - No CORS header modifications
  - Full caching support with user-specific keys
  - Comprehensive error handling and logging
  - Support for all HTTP methods

#### CORS Proxy (`src/services/cors-proxy.ts`)
- **Purpose**: CORS bypass and header management
- **Features**:
  - Enhanced CORS header handling
  - Automatic CORS middleware injection
  - Configurable CORS policies
  - Full caching support with user-specific keys
  - Comprehensive error handling and logging
  - Support for all HTTP methods

## Configuration

### Route Types

Routes can be configured with specific proxy types:

```yaml
routes:
  # Classic proxy (no CORS modifications)
  - domain: "api.example.com"
    type: "classic-proxy"
    target: "http://backend-service:8080"
    
  # CORS proxy (with CORS bypass)
  - domain: "api.example.com"
    type: "cors-proxy"
    target: "https://external-api.com"
    cors:
      enabled: true
      origin: "*"
      credentials: true
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
      
  # Auto-detection based on CORS config
  - domain: "api.example.com"
    type: "proxy"  # Will auto-detect based on CORS config
    target: "http://backend-service:8080"
    cors: true  # Will use CORS proxy
```

### Auto-Detection Logic

When `type: "proxy"` is used, the system automatically determines the proxy type:

- **CORS Proxy**: If `cors` configuration is present and enabled
- **Classic Proxy**: If no `cors` configuration or `cors.enabled: false`

## Implementation Details

### Proxy Selection Logic

```typescript
// In setupPathProxyRoute and setupProxyRoute
const proxyType = route.type || 'proxy';
const useCorsProxy = proxyType === 'cors-proxy' || (proxyType === 'proxy' && route.cors);
const useClassicProxy = proxyType === 'classic-proxy' || (proxyType === 'proxy' && !route.cors);
```

### Routing Support

Both proxy types support:
- **Path-based routing**: `route.path` specified
- **Domain-based routing**: No `route.path`, uses `route.domain`

### CORS Middleware Integration

CORS Proxy automatically injects CORS middleware:
- **Path-based**: Middleware applied at route path
- **Domain-based**: Middleware applied per request based on host header

## Features Comparison

| Feature | Classic Proxy | CORS Proxy |
|---------|---------------|------------|
| **CORS Headers** | Preserves original | Modifies/Adds CORS headers |
| **Caching** | ✅ Full support | ✅ Full support |
| **User Identification** | ✅ OAuth2, tokens, IP | ✅ OAuth2, tokens, IP |
| **Error Handling** | ✅ Comprehensive | ✅ Comprehensive |
| **Logging** | ✅ Detailed | ✅ Detailed |
| **Header Forwarding** | ✅ All headers | ✅ All headers |
| **CORS Middleware** | ❌ None | ✅ Automatic injection |
| **CORS Configuration** | ❌ Not applicable | ✅ Configurable policies |

## Use Cases

### Classic Proxy
- **Internal services**: Backend APIs, microservices
- **Load balancing**: Multiple backend instances
- **SSL termination**: HTTPS to HTTP conversion
- **Authentication**: OAuth2, API key forwarding
- **Monitoring**: Request/response logging

### CORS Proxy
- **External APIs**: Third-party services with CORS restrictions
- **Frontend development**: Local development with external APIs
- **Cross-origin requests**: Bypassing browser CORS policies
- **API aggregation**: Combining multiple external APIs
- **Testing**: Cross-origin API testing

## Configuration Examples

### Classic Proxy Configuration

```yaml
routes:
  - domain: "api.internal.com"
    type: "classic-proxy"
    target: "http://backend-service:8080"
    headers:
      X-API-Version: "v1"
      X-Service-Name: "backend"
    oauth2:
      enabled: true
      provider: "google"
      # ... OAuth2 configuration
```

### CORS Proxy Configuration

```yaml
routes:
  - domain: "api.external.com"
    type: "cors-proxy"
    target: "https://external-api.com"
    cors:
      enabled: true
      origin: ["https://myapp.com", "https://dev.myapp.com"]
      credentials: true
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
      exposedHeaders: ["X-Total-Count", "X-Page-Count"]
      maxAge: 86400
```

### Dynamic Target with CORS

```yaml
routes:
  - domain: "proxy.example.com"
    type: "cors-proxy"
    target: "http://localhost:3000"
    dynamicTarget:
      enabled: true
      allowedDomains: ["api.github.com", "jsonplaceholder.typicode.com"]
      httpsOnly: true
      urlParameter: "url"
    cors:
      enabled: true
      origin: "*"
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
```

## Management Console

The management console provides unified monitoring for both proxy types:

- **Cache Management**: View cache statistics for both proxy types
- **Request Logging**: Detailed logs with proxy type identification
- **Error Monitoring**: Error tracking for both proxy types
- **Performance Metrics**: Response times and throughput

## Migration Guide

### From Unified Proxy to Separated Proxies

1. **Identify proxy usage patterns**:
   - Routes with CORS configuration → CORS Proxy
   - Routes without CORS → Classic Proxy

2. **Update route configurations**:
   ```yaml
   # Before
   - domain: "api.example.com"
     target: "http://backend:8080"
     cors: true
   
   # After
   - domain: "api.example.com"
     type: "cors-proxy"  # Explicit type
     target: "http://backend:8080"
     cors: true
   ```

3. **Test functionality**:
   - Verify CORS headers are properly handled
   - Check caching behavior
   - Validate error handling

## Benefits of Separation

1. **Clear Responsibilities**: Each proxy type has a specific purpose
2. **Performance**: No unnecessary CORS processing for internal routes
3. **Security**: Explicit control over CORS policies
4. **Maintainability**: Easier to debug and extend specific functionality
5. **Flexibility**: Choose the right proxy type for each use case

## Future Enhancements

- **Rate Limiting**: Different policies per proxy type
- **Authentication**: Proxy-specific authentication methods
- **Monitoring**: Separate metrics for each proxy type
- **Caching**: Different cache policies per proxy type
- **Load Balancing**: Proxy-specific load balancing strategies 