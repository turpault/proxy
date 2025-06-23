import axios from 'axios';

const BASE_URL = 'http://localhost:4481';

async function testCertificateStatus() {
  console.log('🔍 Testing Certificate Status...\n');

  try {
    // Test the status endpoint
    console.log('1. Getting server status...');
    const response = await axios.get(`${BASE_URL}/api/status`);

    if (response.status === 200) {
      console.log('✅ Status endpoint accessible');

      const data = response.data;
      console.log('\n2. Server Status:');
      console.log(`   HTTP Port: ${data.httpPort}`);
      console.log(`   HTTPS Port: ${data.httpsPort}`);
      console.log(`   Routes: ${data.routes?.length || 0}`);
      console.log(`   Certificates: ${data.certificates?.length || 0}`);

      if (data.certificates && data.certificates.length > 0) {
        console.log('\n3. Certificate Details:');
        data.certificates.forEach((cert, index) => {
          console.log(`   ${index + 1}. Domain: ${cert.domain}`);
          console.log(`      Expires: ${new Date(cert.expiresAt).toLocaleDateString()}`);
          console.log(`      Valid: ${cert.isValid}`);
        });
      } else {
        console.log('\n❌ No certificates found in status');
      }

      // Check routes with SSL
      console.log('\n4. Routes with SSL:');
      if (data.routes && data.routes.length > 0) {
        data.routes.forEach((route, index) => {
          console.log(`   ${index + 1}. ${route.domain}${route.target ? ` -> ${route.target}` : ''} (SSL: ${route.ssl})`);
        });
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
testCertificateStatus(); 