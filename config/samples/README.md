# Configuration Samples

This directory contains sample configuration files demonstrating different use cases and features of the proxy server.

## Available Samples

### 1. `basic-proxy.yaml`
**Basic reverse proxy functionality**
- Simple reverse proxy routing
- SSL certificate management
- Basic CORS configuration
- Static file serving
- Rate limiting and security headers

**Best for:** Getting started, simple applications, learning the basics

### 2. `advanced-cors.yaml`
**Advanced CORS proxy functionality**
- Custom header forwarding
- Multiple API endpoints with different CORS policies
- URL rewriting
- Dynamic target support
- File upload proxies
- WebSocket proxying

**Best for:** API gateways, microservices, complex CORS requirements

### 3. `oauth2-authentication.yaml`
**OAuth2 authentication integration**
- Multiple OAuth2 providers (Google, GitHub, custom)
- Session management
- Route protection
- Public path configuration
- CSP headers for OAuth flows
- Subscription key support

**Best for:** Applications requiring authentication, enterprise integrations

### 4. `process-management.yaml`
**Process management and monitoring**
- Process monitoring and control
- Health checks
- Auto-restart policies
- Environment variable management
- Multiple process types (Node.js, Python, React)
- Shared processes across routes

**Best for:** Full-stack applications, microservices, development workflows

### 5. `development.yaml`
**Development environment optimization**
- Development-friendly settings
- Hot reloading
- Debug logging
- Local development servers
- Relaxed security for development
- Staging Let's Encrypt

**Best for:** Local development, debugging, testing

## How to Use These Samples

### 1. Copy and Customize
```bash
# Copy a sample configuration
cp config/samples/basic-proxy.yaml config/proxy.yaml

# Edit the configuration for your needs
nano config/proxy.yaml
```

### 2. Set Environment Variables
Most samples require environment variables. Create a `.env` file:
```bash
# Example environment variables
export DATABASE_URL="postgresql://user:pass@localhost/dbname"
export JWT_SECRET="your-secret-key"
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### 3. Start the Server
```bash
# Start with the configuration
bun start

# Or specify a custom config file
bun start --config config/samples/development.yaml
```

## Configuration Structure

Each sample follows this general structure:

```yaml
# Server configuration
port: 80
httpsPort: 443
managementPort: 4481

# Let's Encrypt SSL certificates
letsEncrypt:
  email: "admin@example.com"
  staging: false
  certDir: "./certificates"

# Proxy routes
routes:
  - domain: "example.com"
    target: "http://localhost:3000"
    ssl: true
    cors: true

# Security settings
security:
  rateLimitWindowMs: 900000
  rateLimitMaxRequests: 100
  csp:
    enabled: true
    directives:
      defaultSrc: ["'self'"]

# Logging
logging:
  level: "info"
  file: "./logs/proxy.log"

# Statistics
statistics:
  enabled: true
  saveInterval: 300000
  maxEntries: 10000
  geolocation: true
```

## Common Customizations

### Domain Names
Replace `example.com` with your actual domain:
```yaml
- domain: "yourdomain.com"
```

### Ports
Adjust ports for your environment:
```yaml
port: 8080        # Custom HTTP port
httpsPort: 8443   # Custom HTTPS port
```

### Environment Variables
Use environment variables for sensitive data:
```yaml
oauth2:
  clientId: "${OAUTH_CLIENT_ID}"
  clientSecret: "${OAUTH_CLIENT_SECRET}"
```

### CORS Configuration
Customize CORS for your needs:
```yaml
cors:
  enabled: true
  origin: ["https://app.example.com"]
  credentials: true
  methods: ["GET", "POST", "PUT", "DELETE"]
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
  exposedHeaders: ["X-Total-Count", "X-Page-Count"]
  maxAge: 3600
```

## Testing Your Configuration

### 1. Validate Configuration
```bash
# The server will validate configuration on startup
bun start --config your-config.yaml
```

### 2. Check Management Interface
Access the management interface at `http://localhost:4481` to:
- Monitor processes
- View statistics
- Check SSL certificates
- View logs

### 3. Test Routes
```bash
# Test a route
curl -I https://yourdomain.com/api/health

# Test CORS
curl -H "Origin: https://yourdomain.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS https://yourdomain.com/api
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   lsof -i :80
   lsof -i :443
   ```

2. **SSL Certificate Issues**
   ```yaml
   letsEncrypt:
     staging: true  # Use staging for testing
   ```

3. **CORS Issues**
   ```yaml
   cors:
     origin: true  # Allow all origins for testing
   ```

4. **Process Management Issues**
   ```bash
   # Check process logs
   tail -f logs/process-name.log
   
   # Check process status
   curl http://localhost:4481/api/processes
   ```

### Debug Mode
Enable debug logging for troubleshooting:
```yaml
logging:
  level: "debug"
```

## Security Considerations

### Production Checklist
- [ ] Use production Let's Encrypt (`staging: false`)
- [ ] Set restrictive CORS origins
- [ ] Configure proper CSP headers
- [ ] Set appropriate rate limits
- [ ] Use environment variables for secrets
- [ ] Enable geolocation filtering if needed
- [ ] Configure proper logging levels

### Development Checklist
- [ ] Use staging Let's Encrypt (`staging: true`)
- [ ] Enable debug logging
- [ ] Relax CORS for local development
- [ ] Use localhost domains
- [ ] Enable hot reloading

## Getting Help

- Check the main [README.md](../../README.md) for detailed documentation
- Review the [CORS_PROXY_GUIDE.md](../../CORS_PROXY_GUIDE.md) for CORS-specific help
- Check the [PROCESS_MANAGEMENT.md](../../PROCESS_MANAGEMENT.md) for process management
- Look at the logs in the `logs/` directory for error messages
- Use the management interface at `http://localhost:4481` for monitoring 