# Domain-Specific Session Management

The proxy now supports domain-specific session management, allowing different routes to have isolated session storage. This feature provides better security isolation and supports complex multi-domain architectures.

## Overview

Previously, all sessions were stored in a single global session manager. With domain-specific sessions, each route can have its own isolated session storage, preventing session conflicts and improving security.

## How It Works

### Session Manager Instances

The `SessionManager` class now supports multiple instances, each associated with a specific domain:

- **Management Console**: Always uses `"_management_"` domain
- **Routes**: Use route domain by default, or custom domain via configuration
- **Isolation**: Sessions are completely isolated between domains

### Domain Assignment

1. **Management Console**: Automatically uses `"_management_"` domain
2. **Routes with OAuth2**: 
   - Default: Uses route domain name
   - Custom: Use `sessionDomain` in OAuth2 configuration
3. **Routes without OAuth2**: Use route domain name

## Configuration

### Basic Usage

Routes automatically use their domain name as the session domain:

```yaml
routes:
  - domain: "app.example.com"
    type: "proxy"
    target: "http://localhost:3000"
    oauth2:
      enabled: true
      provider: "google"
      # ... other OAuth2 config
      # Uses "app.example.com" as session domain
```

### Custom Session Domain

Specify a custom session domain in the OAuth2 configuration:

```yaml
routes:
  - domain: "app.example.com"
    type: "proxy"
    target: "http://localhost:3000"
    oauth2:
      enabled: true
      provider: "google"
      # ... other OAuth2 config
      sessionDomain: "custom-session-domain"  # Custom session domain
```

### Shared Sessions

Multiple routes can share sessions by using the same session domain:

```yaml
routes:
  # API v1
  - domain: "api.example.com"
    path: "/api/v1"
    oauth2:
      enabled: true
      sessionDomain: "shared-api-sessions"
  
  # API v2 - shares sessions with v1
  - domain: "api.example.com"
    path: "/api/v2"
    oauth2:
      enabled: true
      sessionDomain: "shared-api-sessions"  # Same session domain
```

## API Usage

### Getting Session Managers

```typescript
import { SessionManager } from './services/session-manager';
import { getSessionManagerForRoute } from './utils/session-utils';

// Management console session manager
const managementSessionManager = SessionManager.getManagementInstance();

// Route-specific session manager
const routeSessionManager = SessionManager.getInstance('app.example.com');

// Using utility function
const sessionManager = getSessionManagerForRoute(routeConfig);
```

### Session Operations

All session operations are domain-isolated:

```typescript
// Create session in specific domain
const session = sessionManager.createSession('user123', '127.0.0.1', 'user-agent');

// Get session (only works within same domain)
const retrievedSession = sessionManager.getSession(sessionId);

// Delete session (only affects current domain)
sessionManager.deleteSession(sessionId);

// Get session count for domain
const count = sessionManager.getSessionCount();
```

## Database Schema

The sessions table now includes a `domain` column:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  domain TEXT NOT NULL,           -- New column
  createdAt INTEGER NOT NULL,
  lastActivity INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT NOT NULL,
  userAgent TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_sessions_domain ON sessions(domain);
CREATE INDEX idx_sessions_expiresAt ON sessions(expiresAt);
CREATE INDEX idx_sessions_userId ON sessions(userId);
```

## Migration

Existing sessions are automatically migrated:

- Existing sessions get `domain = "_default_"` 
- New sessions use proper domain isolation
- No data loss during migration

## Benefits

### Security
- **Session Isolation**: Sessions cannot be accessed across domains
- **Reduced Attack Surface**: Compromised session in one domain doesn't affect others
- **Better Access Control**: Fine-grained session management per domain

### Architecture
- **Multi-Tenant Support**: Perfect for SaaS applications
- **Microservices**: Independent session management per service
- **Domain Separation**: Clear boundaries between different applications

### Management
- **Independent Timeouts**: Each domain can have different session timeouts
- **Easier Cleanup**: Domain-specific session cleanup
- **Better Monitoring**: Session statistics per domain

## Examples

### Multi-Tenant Application

```yaml
routes:
  # Tenant A
  - domain: "tenant-a.example.com"
    oauth2:
      enabled: true
      sessionDomain: "tenant-a-sessions"
  
  # Tenant B
  - domain: "tenant-b.example.com"
    oauth2:
      enabled: true
      sessionDomain: "tenant-b-sessions"
```

### Microservices Architecture

```yaml
routes:
  # User Service
  - domain: "users.example.com"
    oauth2:
      enabled: true
      sessionDomain: "user-service-sessions"
  
  # Order Service
  - domain: "orders.example.com"
    oauth2:
      enabled: true
      sessionDomain: "order-service-sessions"
  
  # Shared API Gateway
  - domain: "api.example.com"
    oauth2:
      enabled: true
      sessionDomain: "shared-api-sessions"
```

### Legacy Migration

```yaml
routes:
  # Legacy app (uses default domain)
  - domain: "legacy.example.com"
    oauth2:
      enabled: true
      # Uses "legacy.example.com" as session domain
  
  # New app (custom domain)
  - domain: "new.example.com"
    oauth2:
      enabled: true
      sessionDomain: "new-app-sessions"
```

## Troubleshooting

### Common Issues

1. **Session Not Found**: Ensure you're using the correct session manager for the domain
2. **Migration Errors**: Check database permissions and ensure SQLite is properly initialized
3. **Performance**: Monitor session counts per domain and adjust cache sizes if needed

### Debugging

Enable debug logging to see session domain operations:

```typescript
// Session manager logs include domain information
logger.debug(`Session operation for domain: ${this.domain}`);
```

### Monitoring

Track session usage per domain:

```typescript
// Get session count per domain
const managementCount = SessionManager.getManagementInstance().getSessionCount();
const routeCount = SessionManager.getInstance('app.example.com').getSessionCount();
```

## Best Practices

1. **Use Descriptive Domain Names**: Choose meaningful session domain names
2. **Limit Shared Sessions**: Only share sessions when necessary
3. **Monitor Session Counts**: Track session usage per domain
4. **Regular Cleanup**: Implement domain-specific cleanup strategies
5. **Security Review**: Regularly audit session isolation

## Backward Compatibility

- Existing code continues to work without changes
- Management console automatically uses the correct session manager
- Database migration is automatic and safe
- No breaking changes to existing APIs
