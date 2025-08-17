# Installation Guide

Complete installation instructions for the Advanced Reverse Proxy Server.

## 🚀 Prerequisites

### System Requirements

- **Operating System**: Linux, macOS, or Windows (WSL recommended for Windows)
- **Memory**: Minimum 512MB RAM, recommended 2GB+
- **Disk Space**: Minimum 100MB, recommended 1GB+
- **Network**: Ports 80, 443, and 4481 accessible

### Required Software

- **Bun Runtime**: v1.1.30 or higher
- **Node.js**: v18 or higher (for some dependencies)
- **Git**: For cloning the repository

## 📦 Installation Methods

### Method 1: Git Clone (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd proxy

# Install dependencies
bun install

# Create configuration directories
mkdir -p config data logs certificates pids

# Set up permissions
chmod 755 config data logs certificates pids
```

### Method 2: Download Release

```bash
# Download the latest release
wget https://github.com/your-repo/proxy/releases/latest/download/proxy.tar.gz

# Extract
tar -xzf proxy.tar.gz
cd proxy

# Install dependencies
bun install
```

### Method 3: Docker (Coming Soon)

```bash
# Pull the Docker image
docker pull your-repo/proxy:latest

# Run the container
docker run -d \
  --name proxy \
  -p 80:80 \
  -p 443:443 \
  -p 4481:4481 \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/certificates:/app/certificates \
  your-repo/proxy:latest
```

## 🔧 Platform-Specific Instructions

### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install Node.js (if not using Bun)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Reload shell
source ~/.bashrc

# Clone and install
git clone <repository-url>
cd proxy
bun install
```

### CentOS/RHEL/Fedora

```bash
# Install Node.js
sudo dnf install nodejs npm

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Reload shell
source ~/.bashrc

# Clone and install
git clone <repository-url>
cd proxy
bun install
```

### macOS

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Bun
brew tap oven-sh/bun
brew install bun

# Clone and install
git clone <repository-url>
cd proxy
bun install
```

### Windows (WSL)

```bash
# Install WSL2 (if not already installed)
wsl --install

# Install Ubuntu on WSL
wsl --install -d Ubuntu

# Follow Ubuntu instructions above
```

## 🔐 SSL Certificate Setup

### Let's Encrypt Requirements

For automatic SSL certificates:

1. **Domain Name**: A registered domain name
2. **DNS Configuration**: Domain must point to your server's IP
3. **Port Access**: Ports 80 and 443 must be accessible from the internet
4. **Email Address**: Valid email for Let's Encrypt notifications

### Manual SSL Certificates

If you have existing SSL certificates:

```bash
# Create certificates directory
mkdir -p certificates

# Copy your certificates
cp your-certificate.crt certificates/example.com.crt
cp your-private-key.key certificates/example.com.key

# Set proper permissions
chmod 644 certificates/*.crt
chmod 600 certificates/*.key
```

## ⚙️ Initial Configuration

### 1. Create Basic Configuration

```bash
# Create example configuration
bun run src/index.ts --create-config ./config/main.yaml
```

### 2. Edit Configuration

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

### 3. Configure Proxy Routes

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
    name: "My Application"
```

## 🚀 First Run

### 1. Start the Server

```bash
# Start with default configuration
bun run src/index.ts

# Or with custom configuration
bun run src/index.ts --config ./config/main.yaml
```

### 2. Verify Installation

```bash
# Check if server is running
curl http://localhost:4481/api/health

# Check management console
curl http://localhost:4481

# Check proxy (if domain is configured)
curl http://example.com
```

### 3. Access Management Console

Open your browser and navigate to:
```
http://localhost:4481
```

## 🔧 Production Setup

### 1. System Service

Create a systemd service for automatic startup:

```bash
# Create service file
sudo nano /etc/systemd/system/proxy.service
```

```ini
[Unit]
Description=Advanced Reverse Proxy Server
After=network.target

[Service]
Type=simple
User=proxy
WorkingDirectory=/opt/proxy
ExecStart=/usr/local/bin/bun run src/index.ts --config ./config/main.yaml
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable proxy
sudo systemctl start proxy

# Check status
sudo systemctl status proxy
```

### 2. Firewall Configuration

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 4481/tcp

# CentOS/RHEL/Fedora
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=4481/tcp
sudo firewall-cmd --reload
```

### 3. SSL Certificate Setup

```yaml
# config/proxy.yaml
letsEncrypt:
  email: "admin@example.com"
  staging: false  # Use production environment
  certDir: "./certificates"
```

### 4. Security Considerations

```bash
# Create dedicated user
sudo useradd -r -s /bin/false proxy

# Set proper ownership
sudo chown -R proxy:proxy /opt/proxy

# Restrict management console access
# config/main.yaml
management:
  host: "127.0.0.1"  # Only localhost access
  port: 4481
```

## 🔍 Verification

### 1. Health Check

```bash
# Check server health
curl http://localhost:4481/api/health

# Expected response:
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 86400000
  }
}
```

### 2. Configuration Validation

```bash
# Validate configuration
curl -X POST http://localhost:4481/api/config/proxy/validate \
  -H "Content-Type: application/json" \
  -d @./config/proxy.yaml
```

### 3. Process Management

```bash
# Check process status
curl http://localhost:4481/api/processes

# Start a test process
curl -X POST http://localhost:4481/api/processes/test/start
```

## 🚨 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   sudo lsof -i :80
   sudo lsof -i :443
   sudo lsof -i :4481
   ```

2. **Permission Denied**
   ```bash
   # Fix permissions
   sudo chown -R $USER:$USER ./certificates
   chmod 755 ./certificates
   ```

3. **SSL Certificate Issues**
   ```bash
   # Check certificate status
   curl http://localhost:4481/api/certificates
   
   # Renew certificate
   curl -X POST http://localhost:4481/api/certificates/example.com/renew
   ```

### Logs

```bash
# Check server logs
tail -f ./logs/proxy.log

# Check system logs
sudo journalctl -u proxy -f
```

## 📚 Next Steps

After successful installation:

1. **[Quick Start Guide](quick-start.md)** - Get up and running quickly
2. **[Configuration Overview](configuration.md)** - Learn about configuration options
3. **[OAuth2 Integration](oauth2-integration.md)** - Add authentication to your routes
4. **[Process Management](process-management.md)** - Manage backend processes
5. **[Troubleshooting](troubleshooting.md)** - Common issues and solutions

## 🆘 Support

If you encounter issues during installation:

1. Check the [Troubleshooting Guide](troubleshooting.md)
2. Verify system requirements
3. Check logs for error messages
4. Create an issue on GitHub with detailed information

---

**Note**: This installation guide assumes a Linux/macOS environment. For Windows-specific instructions, see the Windows section above.
