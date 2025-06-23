import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

async function testCertificateParsing() {
  console.log('🔍 Testing Certificate Parsing...\n');

  try {
    // Read the certificate file
    const certPath = path.join(process.cwd(), '..', 'certificates', 'home.turpault.me', 'cert.pem');
    const cert = await fs.readFile(certPath, 'utf8');

    console.log('1. Certificate file read successfully');
    console.log(`   Size: ${cert.length} characters`);

    // Test the openssl parsing
    console.log('\n2. Testing openssl parsing...');

    return new Promise((resolve, reject) => {
      const openssl = spawn('openssl', ['x509', '-noout', '-dates'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      openssl.stdout.on('data', (data) => {
        output += data.toString();
      });

      openssl.stderr.on('data', (data) => {
        error += data.toString();
      });

      openssl.on('close', (code) => {
        if (code === 0) {
          console.log('✅ openssl command successful');
          console.log('   Output:', output.trim());

          // Parse the output
          const lines = output.trim().split('\n');
          let notBefore = '';
          let notAfter = '';

          for (const line of lines) {
            if (line.startsWith('notBefore=')) {
              notBefore = line.replace('notBefore=', '');
            } else if (line.startsWith('notAfter=')) {
              notAfter = line.replace('notAfter=', '');
            }
          }

          if (notAfter) {
            const expiresAt = new Date(notAfter);
            const now = new Date();
            const isValid = expiresAt > now;

            console.log('\n3. Parsed certificate info:');
            console.log(`   Valid from: ${notBefore}`);
            console.log(`   Valid until: ${notAfter}`);
            console.log(`   Expires at: ${expiresAt.toISOString()}`);
            console.log(`   Is valid: ${isValid}`);
            console.log(`   Days until expiry: ${Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))}`);

            resolve({
              expiresAt,
              isValid,
              notBefore,
              notAfter
            });
          } else {
            reject(new Error('Could not find expiration date in certificate'));
          }
        } else {
          console.log('❌ openssl command failed');
          console.log('   Error:', error);
          reject(new Error(`openssl command failed: ${error}`));
        }
      });

      // Send the certificate to openssl
      openssl.stdin.write(cert);
      openssl.stdin.end();
    });

  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test
testCertificateParsing(); 