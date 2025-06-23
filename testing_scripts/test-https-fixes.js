#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

async function testHttpsFixes() {
  console.log('🧪 Testing HTTPS fixes...\n');

  try {
    // Test 1: Check if openssl is available
    console.log('1. Testing openssl availability...');
    try {
      const { stdout } = await execAsync('openssl version');
      console.log(`✅ openssl available: ${stdout.trim()}`);
    } catch (error) {
      console.log('❌ openssl not available, certificate parsing will use fallback method');
    }

    // Test 2: Check certificate directory
    console.log('\n2. Checking certificate directory...');
    const certDir = path.join(process.cwd(), 'certificates');
    const certExists = await fs.pathExists(certDir);
    console.log(`Certificate directory exists: ${certExists ? '✅' : '❌'}`);

    if (certExists) {
      const certFiles = await fs.readdir(certDir);
      console.log(`Certificate files found: ${certFiles.length}`);
      for (const file of certFiles) {
        console.log(`  - ${file}`);
      }
    }

    // Test 3: Check specific domain certificates
    console.log('\n3. Checking domain certificates...');
    const domainDirs = certExists ? await fs.readdir(certDir) : [];
    for (const domainDir of domainDirs) {
      const domainPath = path.join(certDir, domainDir);
      const stat = await fs.stat(domainPath);
      if (stat.isDirectory()) {
        const certPath = path.join(domainPath, 'cert.pem');
        const keyPath = path.join(domainPath, 'key.pem');

        const [certExists, keyExists] = await Promise.all([
          fs.pathExists(certPath),
          fs.pathExists(keyPath)
        ]);

        console.log(`Domain: ${domainDir}`);
        console.log(`  Certificate: ${certExists ? '✅' : '❌'}`);
        console.log(`  Private key: ${keyExists ? '✅' : '❌'}`);

        if (certExists) {
          try {
            const cert = await fs.readFile(certPath, 'utf8');
            const { stdout } = await execAsync(`openssl x509 -in "${certPath}" -noout -enddate`);
            const match = stdout.match(/notAfter=(.+)/);
            if (match) {
              const expiresAt = new Date(match[1]);
              const now = new Date();
              const isValid = expiresAt > now;
              const daysUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

              console.log(`  Expires: ${expiresAt.toISOString()}`);
              console.log(`  Valid: ${isValid ? '✅' : '❌'}`);
              console.log(`  Days until expiry: ${daysUntilExpiry}`);
            }
          } catch (error) {
            console.log(`  Error parsing certificate: ${error.message}`);
          }
        }
      }
    }

    // Test 4: Check if proxy server is running
    console.log('\n4. Checking proxy server status...');
    try {
      const { stdout } = await execAsync('curl -s http://localhost:4481/health');
      const health = JSON.parse(stdout);
      console.log('✅ Management server is running');
      console.log('Health status:', JSON.stringify(health, null, 2));
    } catch (error) {
      console.log('❌ Management server not responding');
    }

    // Test 5: Test HTTPS connection
    console.log('\n5. Testing HTTPS connection...');
    try {
      const { stdout, stderr } = await execAsync('curl -k -s -I https://localhost:4443/');
      if (stderr.includes('SSL')) {
        console.log('❌ HTTPS server returning non-TLS content (SSL error)');
        console.log('Error:', stderr);
      } else {
        console.log('✅ HTTPS server responding correctly');
        console.log('Response headers:', stdout);
      }
    } catch (error) {
      console.log('❌ HTTPS connection failed');
      console.log('Error:', error.message);
    }

    // Test 6: Check proxy server logs
    console.log('\n6. Checking recent proxy logs...');
    const logFile = path.join(process.cwd(), 'logs', 'proxy.log');
    if (await fs.pathExists(logFile)) {
      const logs = await fs.readFile(logFile, 'utf8');
      const recentLogs = logs.split('\n').slice(-20).join('\n');
      console.log('Recent logs:');
      console.log(recentLogs);
    } else {
      console.log('No log file found');
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testHttpsFixes().then(() => {
  console.log('\n🏁 HTTPS fixes test completed');
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 