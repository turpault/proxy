import https from 'https';
import fs from 'fs-extra';
import path from 'path';

async function testHttpsServer() {
  console.log('🔍 Testing HTTPS Server Setup...\n');

  try {
    // Check if certificate files exist
    const certPath = path.join(process.cwd(), '..', 'certificates', 'home.turpault.me', 'cert.pem');
    const keyPath = path.join(process.cwd(), '..', 'certificates', 'home.turpault.me', 'key.pem');

    console.log('1. Checking certificate files...');
    console.log(`   Certificate path: ${certPath}`);
    console.log(`   Key path: ${keyPath}`);

    const certExists = await fs.pathExists(certPath);
    const keyExists = await fs.pathExists(keyPath);

    console.log(`   Certificate exists: ${certExists}`);
    console.log(`   Key exists: ${keyExists}`);

    if (!certExists || !keyExists) {
      console.log('❌ Certificate files not found');
      return;
    }

    // Try to read certificate files
    console.log('\n2. Reading certificate files...');
    const cert = await fs.readFile(certPath, 'utf8');
    const key = await fs.readFile(keyPath, 'utf8');

    console.log(`   Certificate size: ${cert.length} characters`);
    console.log(`   Key size: ${key.length} characters`);

    // Check certificate format
    const certValid = cert.includes('-----BEGIN CERTIFICATE-----') && cert.includes('-----END CERTIFICATE-----');
    const keyValid = key.includes('-----BEGIN RSA PRIVATE KEY-----') && key.includes('-----END RSA PRIVATE KEY-----');

    console.log(`   Certificate format valid: ${certValid}`);
    console.log(`   Key format valid: ${keyValid}`);

    if (!certValid || !keyValid) {
      console.log('❌ Certificate or key format is invalid');
      return;
    }

    // Try to create HTTPS server
    console.log('\n3. Creating HTTPS server...');
    const httpsOptions = {
      cert: cert,
      key: key
    };

    const server = https.createServer(httpsOptions, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('HTTPS Server Test - Working!\n');
    });

    // Start server on test port
    const testPort = 4445;
    server.listen(testPort, () => {
      console.log(`✅ HTTPS server started successfully on port ${testPort}`);
      console.log(`   Test URL: https://localhost:${testPort}/`);

      // Stop server after 5 seconds
      setTimeout(() => {
        server.close(() => {
          console.log('✅ HTTPS server test completed successfully');
        });
      }, 5000);
    });

    server.on('error', (error) => {
      console.log('❌ HTTPS server error:', error.message);
    });

  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test
testHttpsServer(); 