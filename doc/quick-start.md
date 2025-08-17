# Quick Start Guide

Get the Advanced Reverse Proxy Server up and running in minutes with this quick start guide.

## 🚀 Prerequisites

- **Bun Runtime** (v1.1.30 or higher)
- **Domain name** with DNS pointing to your server
- **Port 80 and 443** accessible (for Let's Encrypt)
- **Port 4481** accessible (for management console)

## ⚡ Quick Installation

### 1. Clone and Install

```bash
git clone <repository-url>
cd proxy
bun install
```

### 2. Create Basic Configuration

```bash
# Create example configuration
bun run src/index.ts --create-config ./config/main.yaml
```

### 3. Start the Server

```bash
# Start with default configuration
bun run src/index.ts

# Or with custom configuration
bun run src/index.ts --config ./config/main.yaml
```

## 📋 Basic Configuration

The server uses a main configuration file (`main.yaml`) that references other configuration files:

```yaml
# config/main.yaml
management:
  port: 4481
  host: "0.0.0.0"
  cors:
    enabled: true
    origin: ["http://localhost:3000"]
    credentials: true

config:
  proxy: "./config/proxy.yaml"
  processes: "./config/processes.yaml"

settings:
  dataDir: "./data"
  logsDir: "./logs"
  certificatesDir: "./certificates"
  tempDir: "./data/temp"
  statsDir: "./data/statistics"
  cacheDir: "./data/cache"
  backupDir: "./config/backup"
  
  statistics:
    enabled: true
    backupInterval: 86400000  # 24 hours
    retentionDays: 30
  
  cache:
    enabled: true
    maxAge: 86400000  # 24 hours
    maxSize: "100MB"
    cleanupInterval: 3600000  # 1 hour
```

## 🔧 Basic Proxy Configuration

Create a simple proxy configuration:

```yaml
# config/proxy.yaml
port: 80
httpsPort: 443
letsEncrypt:
  email: "your-email@example.com"
  staging: true  # Set to false for production
  certDir: "./certificates"

routes:
  - domain: "example.com"
    target: "http://localhost:3000"
    path: "/"
    type: "proxy"
    ssl: true
```

## 🌐 Access Points

Once started, you can access:

- **Proxy Server**: `http://example.com` (port 80) or `https://example.com` (port 443)
- **Management Console**: `http://localhost:4481`

## 🔐 SSL Certificate Setup

For automatic SSL certificates:

1. **Set your email** in the configuration
2. **Point your domain** to your server's IP
3. **Set `staging: false`** in production
4. **Ensure ports 80 and 443** are accessible

## 📊 Management Console

Access the web-based management console at `http://localhost:4481` to:

- View and edit configurations
- Monitor processes
- View statistics
- Manage SSL certificates
- Monitor system status

## 🔄 Process Management

Add backend processes to manage:

```yaml
# config/processes.yaml
processes:
  my-app:
    name: "My Application"
    command: "node"
    args: ["app.js"]
    cwd: "/path/to/app"
    env:
      NODE_ENV: "production"
      PORT: "3000"
    restartOnExit: true
    healthCheck:
      enabled: true
      path: "/health"
      interval: 30000
```

## 🚨 Common Issues

### Port Already in Use
```bash
# Check what's using the port
lsof -i :80
lsof -i :443
lsof -i :4481

# Kill the process or change ports in configuration
```

### SSL Certificate Issues
- Ensure domain DNS is properly configured
- Check that ports 80 and 443 are accessible
- Verify email address in configuration
- Use staging mode first for testing

### Permission Issues
```bash
# Ensure proper permissions for certificate directory
sudo chown -R $USER:$USER ./certificates
chmod 755 ./certificates
```

## 📚 Next Steps

- **[Configuration Overview](configuration.md)** - Learn about all configuration options
- **[OAuth2 Integration](oauth2-integration.md)** - Add authentication to your routes
- **[Process Management](process-management.md)** - Manage backend processes
- **[Security Features](security.md)** - Configure security headers and policies

## 🆘 Need Help?

- Check the [Troubleshooting Guide](troubleshooting.md)
- Review example configurations in `config/samples/`
- Create an issue on GitHub with detailed information

---

**Pro Tip**: Start with `staging: true` in your Let's Encrypt configuration to test SSL certificate generation without hitting rate limits.
