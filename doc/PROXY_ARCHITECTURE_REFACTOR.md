# Proxy Architecture Refactoring

This document explains the architectural improvements made to the proxy system for better consistency and isolation.

## Problem Statement

The original architecture had several inconsistencies:

1. **Inconsistent Service Instantiation**: 
   - `OAuth2Service` was instantiated per route (each route got its own OAuth2 middleware)
   - But `ClassicProxy` and `CorsProxy` were shared instances across all routes
   - This created architectural inconsistency and potential state conflicts

2. **Missing StaticProxy Type**: 
   - Static file serving was handled inline in `setupStaticRoute()` 
   - It lacked a dedicated proxy class for consistency with other proxy types

3. **Shared State Concerns**: 
   - Shared proxy instances could potentially have route-specific state conflicts
   - Each route should have its own isolated proxy instance

## Solution

### 1. Created StaticProxy Class

**File**: `src/services/static-proxy.ts`

- Extends `BaseProxy` for consistency with other proxy types
- Handles static file serving with SPA fallback support
- Supports OAuth2 authentication checks
- Includes comprehensive error handling and logging
- Provides statistics recording integration

```typescript
export class StaticProxy extends BaseProxy {
  constructor(config: StaticProxyConfig, tempDir?: string)
  
  async handleProxyRequest(
    req: express.Request,
    res: express.Response,
    config: ProxyRequestConfig
  ): Promise<void>
}
```

### 2. Per-Route Proxy Instances

**File**: `src/services/proxy-routes.ts`

Refactored to create isolated proxy instances for each route:

```typescript
// Before: Shared instances
private classicProxy: ClassicProxy;
private corsProxy: CorsProxy;
private oauth2Service: OAuth2Service;

// After: Per-route instances
private setupClassicProxyRoute(app: express.Application, route: ProxyRoute, routePath: string): void {
  const oauth2Service = new OAuth2Service();
  const classicProxy = new ClassicProxy();
  // ... route-specific logic
}
```

### 3. Architectural Benefits

#### Consistency
- All proxy types now follow the same pattern: per-route instantiation
- Each route has its own isolated proxy instances
- Consistent OAuth2 service usage across all route types

#### Isolation
- No shared state between routes
- Each route's proxy instances are completely independent
- Reduced risk of cross-route interference

#### Maintainability
- Clear separation of concerns
- Easier to test individual route configurations
- More predictable behavior

#### Extensibility
- Easy to add route-specific proxy configurations
- Simple to implement route-specific middleware
- Clean architecture for future enhancements

## Implementation Details

### StaticProxy Features

1. **Static File Serving**: Uses Express static middleware
2. **SPA Fallback**: Serves `index.html` for client-side routing
3. **OAuth2 Integration**: Supports authentication checks
4. **Error Handling**: Comprehensive error responses
5. **Statistics**: Integrated request statistics recording
6. **Logging**: Detailed request/response logging

### Per-Route Instantiation Pattern

Each route setup method now follows this pattern:

```typescript
private setupXxxRoute(app: express.Application, route: ProxyRoute, routePath: string): void {
  // Create per-route proxy instances
  const oauth2Service = new OAuth2Service();
  const xxxProxy = new XxxProxy(this.tempDir);
  
  // Apply OAuth2 middleware if configured
  if (route.oauth2 && route.oauth2.enabled) {
    const oauthMiddleware = oauth2Service.createMiddleware(route.oauth2, route.publicPaths || []);
    app.use(routePath, oauthMiddleware);
  }
  
  // Set up proxy handling
  const proxy = async (req, res, next) => {
    const config: ProxyRequestConfig = { /* ... */ };
    await xxxProxy.handleProxyRequest(req, res, config);
  };
  
  app.use(routePath, proxy);
}
```

## Migration Impact

### Backward Compatibility
- All existing functionality preserved
- No changes to configuration format
- No breaking changes to API

### Performance
- Minimal performance impact
- Per-route instances are lightweight
- Memory usage scales linearly with route count

### Testing
- Easier to test individual route configurations
- Isolated proxy instances simplify unit testing
- Better separation of concerns for integration tests

## Future Enhancements

The new architecture enables several future improvements:

1. **Route-Specific Configuration**: Each proxy instance can have route-specific settings
2. **Custom Middleware**: Easy to add route-specific middleware
3. **Plugin System**: Simple to implement proxy plugins per route
4. **Monitoring**: Better isolation for route-specific monitoring
5. **Rate Limiting**: Per-route rate limiting configurations

## Conclusion

This refactoring significantly improves the proxy architecture by:

- Creating consistent patterns across all proxy types
- Eliminating shared state concerns
- Improving code maintainability and testability
- Providing a solid foundation for future enhancements

The changes maintain full backward compatibility while providing a much cleaner and more predictable architecture. 