# Proxy Architecture: Bun-Based with Centralized Middleware

This document explains the architectural improvements made to the proxy system with Bun runtime and centralized middleware processing.

## Current Architecture

The proxy server has been rebuilt with a modern, high-performance architecture:

### 1. **Bun Runtime Foundation**
- **High Performance**: Built on Bun for faster startup and runtime performance
- **Native HTTP**: Uses Bun's native HTTP server instead of Express
- **TypeScript Native**: Full TypeScript support without transpilation overhead

### 2. **Centralized Middleware Processing**
- **Single Entry Point**: All requests processed through `BunMiddleware.processRequest()`
- **Universal OAuth2**: OAuth2 authentication works with any route type
- **Unified Statistics**: Centralized request statistics recording
- **Security Headers**: Consistent security headers across all routes

### 3. **Specialized Route Handlers**
- **Native Route Handling**: Direct route matching and processing
- **Type-Specific Proxies**: Dedicated proxy classes for each route type
- **Shared Utilities**: Common functionality extracted to utility classes

## Architecture Components

### Core Server (`ProxyServer`)
```typescript
export class ProxyServer {
  private proxyMiddleware: BunMiddleware;
  private proxyRoutes: BunRoutes;
  
  async handleRequest(req: Request, server: Server): Promise<Response> {
    // 1. Create request context
    // 2. Apply middleware (once)
    // 3. Route to appropriate handler
    // 4. Return response
  }
}
```

### Centralized Middleware (`BunMiddleware`)
```typescript
export class BunMiddleware {
  async processRequest(requestContext: BunRequestContext): Promise<Response | null> {
    // 1. Security headers
    // 2. CORS headers
    // 3. Geolocation filtering
    // 4. OAuth2 authentication (universal)
    // 5. Request logging
  }
  
  recordRequestStats(...): void {
    // Centralized statistics recording
  }
}
```

### Route Processing (`BunRoutes`)
```typescript
export class BunRoutes {
  handleRequest(req: Request, server: Server): Promise<Response | null> {
    // Route-specific processing after middleware
  }
}
```

### Specialized Proxy Classes
- **`BunStaticProxy`**: Static file serving with SPA fallback
- **`BunClassicProxy`**: HTTP proxy with request forwarding
- **`BunCorsProxy`**: CORS-enabled proxy for cross-origin requests

## Key Architectural Improvements

### 1. **Middleware-First Processing**

**Before (Express-based)**:
```typescript
// OAuth2 middleware applied per route
app.use(routePath, oauthMiddleware);
app.use(routePath, proxyHandler);
```

**After (Bun-based)**:
```typescript
// Centralized middleware processing
const middlewareResult = await this.proxyMiddleware.processRequest(requestContext);
if (middlewareResult) return middlewareResult;

// Then route-specific handling
return await this.routeHandler(requestContext);
```

### 2. **Universal OAuth2 Support**

OAuth2 now works with any route type through centralized processing:

```yaml
routes:
  # Static route with OAuth2
  - type: "static"
    staticPath: "/app"
    oauth2: { enabled: true, ... }
  
  # Proxy route with OAuth2  
  - type: "proxy"
    target: "http://api"
    oauth2: { enabled: true, ... }
    
  # CORS route with OAuth2
  - type: "cors-forwarder"
    oauth2: { enabled: true, ... }
```

### 3. **Eliminated Code Duplication**

**Centralized Utilities**:
- **`StaticFileUtils`**: Shared static file serving logic
- **Client IP extraction**: Single implementation in middleware
- **Statistics recording**: Unified across all route types
- **Error responses**: Consistent JSON error format

### 4. **Performance Optimizations**

**Native Route Handling**:
```typescript
// Fast route matching without Express overhead
const staticRoute = this.findStaticRoute(pathname);
if (staticRoute) {
  return this.handleStaticRoute(requestContext, staticRoute);
}
```

**Efficient Request Processing**:
- Single middleware pass per request
- Direct Response object creation
- Minimal object allocation
- Native Bun optimizations

## Request Flow

```
1. Request → ProxyServer.handleRequest()
2. Create BunRequestContext
3. BunMiddleware.processRequest()
   ├── Security headers
   ├── CORS headers  
   ├── Geolocation filtering
   ├── OAuth2 authentication
   └── Request logging
4. If middleware returns Response → send response
5. Otherwise → Route-specific handling
   ├── Static routes
   ├── Proxy routes
   ├── Redirect routes
   └── CORS routes
6. Record statistics via middleware
7. Return Response
```

## Benefits of Current Architecture

### 1. **Performance**
- **Faster startup**: Bun's quick initialization
- **Lower latency**: Native HTTP server
- **Memory efficient**: Reduced object allocation
- **Better throughput**: Optimized request handling

### 2. **Consistency**
- **Universal middleware**: Same processing for all routes
- **Unified OAuth2**: Works with any route type
- **Consistent errors**: Standardized error responses
- **Common utilities**: Shared functionality

### 3. **Maintainability**
- **Centralized logic**: Single place for cross-cutting concerns
- **Type safety**: Full TypeScript support
- **Clear separation**: Middleware vs route-specific logic
- **Reduced duplication**: Shared utilities and common patterns

### 4. **Extensibility**
- **Easy middleware addition**: Add to centralized processing
- **Route type flexibility**: OAuth2 works with any route
- **Simple utilities**: Reusable components
- **Plugin-friendly**: Clear extension points

## Security Improvements

### 1. **Centralized Security Headers**
All routes automatically get security headers:
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- And more...

### 2. **Universal OAuth2**
Any route can be protected with OAuth2:
- Centralized session management
- Consistent authentication flow
- Automatic redirect handling
- Public path support

### 3. **Request Validation**
Centralized validation and filtering:
- Geolocation-based blocking
- Request sanitization
- Header validation

## Migration Benefits

### 1. **Backward Compatibility**
- Configuration format unchanged
- All features preserved
- No breaking API changes

### 2. **Performance Gains**
- Faster request processing
- Lower memory usage
- Better concurrent handling

### 3. **Simplified Deployment**
- Single binary with Bun
- Faster startup times
- Reduced dependencies

## Future Enhancements

The current architecture enables:

1. **Enhanced Middleware**: Easy to add new middleware types
2. **Route Plugins**: Simple plugin system for route types
3. **Advanced Caching**: Better caching strategies
4. **Monitoring Integration**: Enhanced observability
5. **Load Balancing**: Built-in load balancing support

## Conclusion

The Bun-based architecture with centralized middleware provides:

- **Higher performance** through native Bun optimizations
- **Better consistency** with universal middleware processing
- **Enhanced security** through centralized security controls
- **Improved maintainability** with reduced code duplication
- **Future-ready design** for additional enhancements

This architecture maintains full compatibility while providing a solid foundation for future growth and performance improvements. 