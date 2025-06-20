# Let's Encrypt Status in Proxy Management Interface

## Overview

The proxy management interface now includes comprehensive Let's Encrypt certificate status monitoring in the **Statistics page**. This feature provides real-time visibility into SSL certificate health, expiration dates, and Let's Encrypt service configuration.

## Features

### Status Cards (Statistics Page)
The statistics dashboard displays additional status cards for SSL certificates:

- **SSL Certificates**: Total number of certificates managed
- **Valid Certificates**: Number of currently valid certificates
- **Expiring Soon**: Certificates expiring within 30 days
- **Expired**: Number of expired certificates
- **Let's Encrypt**: Environment status (Staging/Production)

### Certificates Section (Statistics Page)
A dedicated section provides detailed certificate information:

#### Let's Encrypt Configuration
- Email address used for registration
- Environment (Staging/Production)
- Certificate directory path
- Summary statistics

#### Certificates Table
For each certificate, the interface displays:
- **Domain**: The domain name
- **Status**: Visual indicator and text status (Valid, Expiring Soon, Expired, Invalid)
- **Expires**: Expiration date
- **Days Until Expiry**: Time remaining with color coding
- **Certificate Path**: File system location

### Status Indicators
- 🟢 **Green**: Valid certificates with >30 days until expiry
- 🟡 **Yellow**: Certificates expiring within 30 days
- 🔴 **Red**: Expired or invalid certificates

## Accessing the Interface

### Main Management Page
- Navigate to `http://localhost:4481` for process management
- Click the "📊 Statistics" button to access certificate information

### Statistics Page
- Direct access: `http://localhost:4481/statistics.html`
- Contains both route statistics and SSL certificate information
- Click "🔄 Refresh Certificates" to update certificate data

## API Endpoint

### GET /api/certificates

Returns comprehensive certificate status information:

```json
{
  "success": true,
  "data": {
    "certificates": [
      {
        "domain": "example.com",
        "expiresAt": "2024-01-15T00:00:00.000Z",
        "isValid": true,
        "daysUntilExpiry": 45,
        "certPath": "/path/to/cert.pem",
        "keyPath": "/path/to/key.pem"
      }
    ],
    "letsEncryptStatus": {
      "email": "admin@example.com",
      "staging": false,
      "certDir": "./certs",
      "totalCertificates": 3,
      "validCertificates": 2,
      "expiringSoon": 1,
      "expired": 0
    }
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Usage

### Accessing Certificate Information
1. Navigate to the proxy management interface (`http://localhost:4481`)
2. Click the "📊 Statistics" button in the header
3. The SSL certificates section appears between the status cards and routes section
4. Click "🔄 Refresh Certificates" to update the data

### Monitoring Certificate Health
- **Green status**: Certificates are healthy and don't require attention
- **Yellow status**: Certificates will expire soon - monitor closely
- **Red status**: Certificates are expired or invalid - immediate action required

### Automatic Renewal
The proxy server automatically:
- Checks certificate expiration daily
- Renews certificates when they're within 30 days of expiry
- Logs renewal attempts and results

## Configuration

The Let's Encrypt status feature uses the existing configuration:

```yaml
letsEncrypt:
  email: "admin@example.com"
  staging: false  # Set to true for testing
  certDir: "./certs"
```

## Troubleshooting

### No Certificates Displayed
- Verify that domains are configured with `ssl: true`
- Check that the certificate directory exists and is writable
- Ensure Let's Encrypt service is properly initialized

### Certificate Renewal Issues
- Check logs for ACME challenge failures
- Verify domain DNS resolution
- Ensure HTTP port 80 is accessible for domain validation

### API Errors
- Verify the management server is running on port 4481
- Check that the proxy server has access to certificate files
- Review server logs for detailed error messages

## Security Considerations

- Certificate private keys are stored securely in the configured directory
- The management interface only displays certificate metadata, not private keys
- API responses include file paths but not certificate contents
- Staging environment should be used for testing to avoid rate limits

## Integration

The Let's Encrypt status integrates with:
- **Process Management**: Certificate health affects overall system status
- **Statistics**: Certificate events are logged for monitoring
- **WebSocket Updates**: Real-time status updates via WebSocket connection
- **Health Checks**: Certificate validity is included in health check responses

## Page Organization

### Main Management Page (`/`)
- Process management and control
- Process status and logs
- Server uptime and basic metrics

### Statistics Page (`/statistics.html`)
- Route usage statistics
- Geolocation data
- **SSL Certificate status and monitoring**
- Let's Encrypt configuration details 