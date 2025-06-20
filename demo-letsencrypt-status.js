#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');

const BASE_URL = 'http://localhost:4481';

async function demoLetsEncryptStatus() {
  console.log(chalk.blue.bold('🔒 Let\'s Encrypt Status Demo\n'));

  try {
    // Fetch certificate status
    console.log(chalk.yellow('Fetching certificate status...'));
    const response = await axios.get(`${BASE_URL}/api/certificates`);

    if (!response.data.success) {
      console.log(chalk.red('❌ Failed to fetch certificate status:', response.data.error));
      return;
    }

    const { certificates, letsEncryptStatus } = response.data.data;

    // Display Let's Encrypt configuration
    console.log(chalk.green.bold('📋 Let\'s Encrypt Configuration:'));
    console.log(chalk.white(`  Email: ${letsEncryptStatus.email}`));
    console.log(chalk.white(`  Environment: ${letsEncryptStatus.staging ? chalk.yellow('Staging') : chalk.green('Production')}`));
    console.log(chalk.white(`  Certificate Directory: ${letsEncryptStatus.certDir}`));
    console.log();

    // Display summary statistics
    console.log(chalk.green.bold('📊 Certificate Summary:'));
    console.log(chalk.white(`  Total Certificates: ${letsEncryptStatus.totalCertificates}`));
    console.log(chalk.green(`  Valid: ${letsEncryptStatus.validCertificates}`));
    console.log(chalk.yellow(`  Expiring Soon: ${letsEncryptStatus.expiringSoon}`));
    console.log(chalk.red(`  Expired: ${letsEncryptStatus.expired}`));
    console.log();

    // Display individual certificates
    if (certificates && certificates.length > 0) {
      console.log(chalk.green.bold('🔐 Individual Certificates:'));
      console.log(chalk.gray('─'.repeat(80)));

      certificates.forEach((cert, index) => {
        const statusColor = cert.isValid ?
          (cert.daysUntilExpiry <= 0 ? chalk.red :
            cert.daysUntilExpiry <= 30 ? chalk.yellow : chalk.green) : chalk.red;

        const statusText = cert.isValid ?
          (cert.daysUntilExpiry <= 0 ? 'EXPIRED' :
            cert.daysUntilExpiry <= 30 ? 'EXPIRING SOON' : 'VALID') : 'INVALID';

        console.log(chalk.white.bold(`${index + 1}. ${cert.domain}`));
        console.log(chalk.gray(`   Status: ${statusColor(statusText)}`));
        console.log(chalk.gray(`   Expires: ${new Date(cert.expiresAt).toLocaleDateString()}`));
        console.log(chalk.gray(`   Days Until Expiry: ${statusColor(formatDaysUntilExpiry(cert.daysUntilExpiry))}`));
        console.log(chalk.gray(`   Certificate Path: ${cert.certPath}`));
        console.log();
      });
    } else {
      console.log(chalk.yellow('⚠️  No certificates found'));
      console.log(chalk.gray('   Make sure you have domains configured with ssl: true in your config'));
    }

    // Display health assessment
    console.log(chalk.green.bold('🏥 Health Assessment:'));
    if (letsEncryptStatus.expired > 0) {
      console.log(chalk.red('   ❌ CRITICAL: Some certificates are expired!'));
    } else if (letsEncryptStatus.expiringSoon > 0) {
      console.log(chalk.yellow('   ⚠️  WARNING: Some certificates are expiring soon'));
    } else if (letsEncryptStatus.validCertificates > 0) {
      console.log(chalk.green('   ✅ GOOD: All certificates are valid'));
    } else {
      console.log(chalk.yellow('   ℹ️  INFO: No certificates configured'));
    }

    console.log();
    console.log(chalk.blue('💡 Tip: Visit http://localhost:4481/statistics.html to see the full management interface'));
    console.log(chalk.gray('   Certificate information has been moved to the Statistics page'));

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log(chalk.red('❌ Connection refused. Make sure the proxy server is running on port 4481'));
      console.log(chalk.gray('   Start the server with: bun start'));
    } else {
      console.log(chalk.red('❌ Error:', error.message));
    }
  }
}

function formatDaysUntilExpiry(days) {
  if (days <= 0) return 'Expired';
  if (days === 1) return '1 day';
  return `${days} days`;
}

// Run the demo
demoLetsEncryptStatus(); 