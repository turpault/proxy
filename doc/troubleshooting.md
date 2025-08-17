# Troubleshooting Guide

Common issues and solutions for the Advanced Reverse Proxy Server.

## 🚨 Quick Diagnosis

### Check Server Status

```bash
# Check if the server is running
ps aux | grep "bun.*src/index.ts"

# Check listening ports
netstat -tlnp | grep -E ":(80|443|4481)"

# Check server logs
tail -f ./logs/proxy.log
```

### Check Configuration

```bash
# Validate main configuration
bun run src/index.ts --config ./config/main.yaml

# Check configuration syntax
yamllint ./config/main.yaml
yamllint ./config/proxy.yaml
yamllint ./config/processes.yaml
```

## 🔧 Common Issues

### Port Already in Use

**Symptoms:**
- Server fails to start with "EADDRINUSE" error
- "Port 80/443/4481 is already in use" message

**Solutions:**

1. **Find the process using the port:**
   ```bash
   # Check what's using port 80
   sudo lsof -i :80
   
   # Check what's using port 443
   sudo lsof -i :443
   
   # Check what's using port 4481
   lsof -i :4481
   ```

2. **Stop the conflicting service:**
   ```bash
   # Stop nginx (if running)
   sudo systemctl stop nginx
   
   # Stop apache (if running)
   sudo systemctl stop apache2
   
   # Kill process by PID
   sudo kill -9 <PID>
   ```

3. **Change ports in configuration:**
   ```yaml
   # config/proxy.yaml
   port: 8080  # Instead of 80
   httpsPort: 8443  # Instead of 443
   
   # config/main.yaml
   management:
     port: 4482  # Instead of 4481
   ```

### SSL Certificate Issues

**Symptoms:**
- SSL certificate errors
- "Certificate not found" messages
- Let's Encrypt rate limit errors

**Solutions:**

1. **Check certificate directory permissions:**
   ```bash
   # Ensure proper permissions
   sudo chown -R $USER:$USER ./certificates
   chmod 755 ./certificates
   chmod 600 ./certificates/*.key
   chmod 644 ./certificates/*.crt
   ```

2. **Verify domain DNS:**
   ```bash
   # Check if domain resolves to your server
   nslookup example.com
   dig example.com
   
   # Check if ports are accessible
   telnet example.com 80
   telnet example.com 443
   ```

3. **Use staging environment for testing:**
   ```yaml
   # config/proxy.yaml
   letsEncrypt:
     email: "your-email@example.com"
     staging: true  # Use staging for testing
     certDir: "./certificates"
   ```

4. **Manual certificate renewal:**
   ```bash
   # Via API
   curl -X POST http://localhost:4481/api/certificates/example.com/renew
   
   # Check certificate status
   curl http://localhost:4481/api/certificates
   ```

### Process Management Issues

**Symptoms:**
- Processes not starting
- Processes crashing repeatedly
- Health checks failing

**Solutions:**

1. **Check process configuration:**
   ```bash
   # Get process status
   curl http://localhost:4481/api/processes
   
   # Get process logs
   curl http://localhost:4481/api/processes/my-app/logs?lines=100
   ```

2. **Verify environment variables:**
   ```yaml
   # config/processes.yaml
   processes:
     my-app:
       name: "My Application"
       command: "node"
       args: ["app.js"]
       env:
         NODE_ENV: "production"
         PORT: "3000"
       envValidation:
         required: ["NODE_ENV", "PORT"]
         validateOnStart: true
         failOnMissing: true
   ```

3. **Check working directory:**
   ```yaml
   processes:
     my-app:
       command: "node"
       args: ["app.js"]
       cwd: "/absolute/path/to/app"  # Use absolute path
   ```

4. **Enable health checks:**
   ```yaml
   processes:
     my-app:
       healthCheck:
         enabled: true
         path: "/health"
         interval: 30000
         timeout: 5000
         retries: 3
   ```

### Configuration Issues

**Symptoms:**
- Configuration validation errors
- Routes not working
- OAuth2 authentication failures

**Solutions:**

1. **Validate configuration:**
   ```bash
   # Validate without saving
   curl -X POST http://localhost:4481/api/config/proxy/validate \
     -H "Content-Type: application/json" \
     -d @./config/proxy.yaml
   ```

2. **Check YAML syntax:**
   ```bash
   # Install yamllint if not available
   pip install yamllint
   
   # Validate YAML files
   yamllint ./config/main.yaml
   yamllint ./config/proxy.yaml
   yamllint ./config/processes.yaml
   ```

3. **Common YAML issues:**
   ```yaml
   # ❌ Wrong - missing quotes
   cors: true
   
   # ✅ Correct - with quotes
   cors: "true"
   
   # ❌ Wrong - invalid indentation
   routes:
   - domain: "example.com"
   
   # ✅ Correct - proper indentation
   routes:
     - domain: "example.com"
   ```

### OAuth2 Authentication Issues

**Symptoms:**
- OAuth2 redirect loops
- "Invalid client" errors
- Callback URL mismatches

**Solutions:**

1. **Verify OAuth2 configuration:**
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
         callbackUrl: "https://app.example.com/oauth/callback"  # Must match OAuth provider
         scopes: ["openid", "email", "profile"]
   ```

2. **Check environment variables:**
   ```bash
   # Verify environment variables are set
   echo $GOOGLE_CLIENT_ID
   echo $GOOGLE_CLIENT_SECRET
   
   # Set if missing
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   ```

3. **Verify callback URL:**
   - Must match exactly what's configured in your OAuth provider
   - Must use HTTPS in production
   - Must include the full path

### CORS Issues

**Symptoms:**
- CORS errors in browser console
- Preflight requests failing
- Cross-origin requests blocked

**Solutions:**

1. **Check CORS configuration:**
   ```yaml
   routes:
     - domain: "api.example.com"
       target: "http://localhost:3000"
       path: "/api"
       type: "proxy"
       ssl: true
       cors:
         enabled: true
         origin: ["https://app.example.com"]  # Specify exact origins
         credentials: true
         methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
         allowedHeaders: ["Content-Type", "Authorization"]
   ```

2. **Enable CORS debugging:**
   ```yaml
   # config/main.yaml
   development:
     debug: true
     verbose: true
   ```

3. **Check browser console:**
   - Look for CORS error messages
   - Verify request headers
   - Check response headers

### Performance Issues

**Symptoms:**
- Slow response times
- High memory usage
- Cache not working

**Solutions:**

1. **Check cache configuration:**
   ```yaml
   # config/main.yaml
   settings:
     cache:
       enabled: true
       maxAge: 86400000  # 24 hours
       maxSize: "100MB"
       cleanupInterval: 3600000  # 1 hour
   ```

2. **Monitor system resources:**
   ```bash
   # Check memory usage
   free -h
   
   # Check disk usage
   df -h
   
   # Check process resources
   top -p $(pgrep -f "bun.*src/index.ts")
   ```

3. **Optimize configuration:**
   ```yaml
   # Reduce logging verbosity
   logging:
     level: "warn"  # Instead of "debug"
   
   # Adjust cache settings
   settings:
     cache:
       maxSize: "50MB"  # Reduce if memory is limited
       cleanupInterval: 1800000  # More frequent cleanup
   ```

## 🔍 Debugging Tools

### Enable Debug Mode

```bash
# Start with debug logging
NODE_ENV=development bun run src/index.ts --config ./config/main.yaml

# Or enable in configuration
# config/main.yaml
development:
  debug: true
  verbose: true
```

### Log Analysis

```bash
# Follow logs in real-time
tail -f ./logs/proxy.log

# Search for errors
grep -i error ./logs/proxy.log

# Search for specific domain
grep "example.com" ./logs/proxy.log

# Count requests by IP
awk '{print $1}' ./logs/proxy.log | sort | uniq -c | sort -nr
```

### Network Debugging

```bash
# Test HTTP connectivity
curl -v http://example.com

# Test HTTPS connectivity
curl -v https://example.com

# Test management API
curl -v http://localhost:4481/api/health

# Check SSL certificate
openssl s_client -connect example.com:443 -servername example.com
```

### Process Debugging

```bash
# Get process status
curl http://localhost:4481/api/processes

# Get process logs
curl http://localhost:4481/api/processes/my-app/logs?lines=50

# Start process manually
curl -X POST http://localhost:4481/api/processes/my-app/start

# Check process health
curl http://localhost:4481/api/health
```

## 📊 Monitoring and Alerts

### Health Monitoring

```bash
# Check overall health
curl http://localhost:4481/api/health

# Monitor specific metrics
curl http://localhost:4481/api/statistics/summary?period=1h

# Check certificate status
curl http://localhost:4481/api/certificates
```

### Automated Monitoring

```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:4481/api/health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $STATUS -ne 200 ]; then
    echo "Health check failed: $STATUS"
    # Send alert (email, Slack, etc.)
    exit 1
else
    echo "Health check passed"
    exit 0
fi
```

### Log Rotation

```bash
# /etc/logrotate.d/proxy
/path/to/proxy/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        kill -HUP $(cat /path/to/proxy/pids/proxy.pid)
    endscript
}
```

## 🆘 Getting Help

### Information to Collect

When reporting issues, include:

1. **Server information:**
   ```bash
   # System info
   uname -a
   cat /etc/os-release
   
   # Bun version
   bun --version
   
   # Node version
   node --version
   ```

2. **Configuration files:**
   ```bash
   # Configuration (remove sensitive data)
   cat ./config/main.yaml
   cat ./config/proxy.yaml
   cat ./config/processes.yaml
   ```

3. **Logs:**
   ```bash
   # Recent logs
   tail -n 100 ./logs/proxy.log
   
   # Error logs
   grep -i error ./logs/proxy.log | tail -n 50
   ```

4. **Network information:**
   ```bash
   # Port status
   netstat -tlnp | grep -E ":(80|443|4481)"
   
   # DNS resolution
   nslookup example.com
   ```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `EADDRINUSE` | Port already in use | Stop conflicting service or change port |
| `EACCES` | Permission denied | Check file permissions and ownership |
| `ENOENT` | File not found | Verify file paths and existence |
| `EINVAL` | Invalid argument | Check configuration syntax |
| `ECONNREFUSED` | Connection refused | Check if target service is running |
| `CERT_HAS_EXPIRED` | SSL certificate expired | Renew certificate |
| `ENOTFOUND` | DNS resolution failed | Check domain configuration |

## 📚 Related Documentation

- **[Quick Start Guide](quick-start.md)** - Basic setup and configuration
- **[Configuration Overview](configuration.md)** - Understanding configuration options
- **[API Reference](api-reference.md)** - Management API documentation
- **[Process Management](process-management.md)** - Process configuration and management
