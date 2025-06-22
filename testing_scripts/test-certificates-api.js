const axios = require('axios');

const BASE_URL = 'http://localhost:4481';

async function testCertificatesAPI() {
  console.log('🔍 Testing Let\'s Encrypt Certificates API...\n');

  try {
    // Test the certificates endpoint
    console.log('Testing /api/certificates endpoint...');
    const response = await axios.get(`${BASE_URL}/api/certificates`);

    if (response.status === 200) {
      console.log('✓ Certificates API endpoint is accessible');

      const data = response.data;
      if (data.success) {
        console.log('✓ API returned success response');

        const { certificates, letsEncryptStatus } = data.data;

        console.log('\n📊 Let\'s Encrypt Status:');
        console.log(`  - Email: ${letsEncryptStatus.email}`);
        console.log(`  - Environment: ${letsEncryptStatus.staging ? 'Staging' : 'Production'}`);
        console.log(`  - Certificate Directory: ${letsEncryptStatus.certDir}`);
        console.log(`  - Total Certificates: ${letsEncryptStatus.totalCertificates}`);
        console.log(`  - Valid Certificates: ${letsEncryptStatus.validCertificates}`);
        console.log(`  - Expiring Soon: ${letsEncryptStatus.expiringSoon}`);
        console.log(`  - Expired: ${letsEncryptStatus.expired}`);

        console.log('\n🔐 Certificates:');
        if (certificates && certificates.length > 0) {
          certificates.forEach(cert => {
            const status = cert.isValid ? 'Valid' : 'Invalid';
            const expiryStatus = cert.daysUntilExpiry <= 0 ? 'Expired' :
              cert.daysUntilExpiry <= 30 ? 'Expiring Soon' : 'Good';
            console.log(`  - ${cert.domain}: ${status} (${expiryStatus}) - Expires: ${new Date(cert.expiresAt).toLocaleDateString()}`);
          });
        } else {
          console.log('  - No certificates found');
        }

        console.log('\n✅ Certificates API test completed successfully!');
        console.log('\n💡 Certificate information is now displayed on the Statistics page:');
        console.log('   - Main page: http://localhost:4481');
        console.log('   - Statistics page: http://localhost:4481/statistics.html');
        console.log('   - Click "📊 Statistics" button to view certificates');
      } else {
        console.log('❌ API returned error:', data.error);
      }
    } else {
      console.log('❌ Unexpected status code:', response.status);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

// Run the test
testCertificatesAPI(); 