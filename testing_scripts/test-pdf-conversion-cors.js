import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test the PDF conversion functionality through CORS proxy
async function testPdfConversionCors() {
  console.log('Testing PDF conversion through CORS proxy...');

  try {
    // Start the proxy server
    console.log('Starting proxy server...');
    const proxyProcess = spawn('bun', ['src/index.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Create a simple test PDF file
    const testPdfPath = path.join(__dirname, 'test-document.pdf');
    const testPdfContent = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n72 720 Td\n(Test Page) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000261 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n413\n%%EOF';

    fs.writeFileSync(testPdfPath, testPdfContent);

    console.log('Testing PDF to JPEG conversion...');

    // Test PDF to JPEG conversion
    try {
      const response = await fetch('http://localhost:3000/proxy?target=file://' + testPdfPath + '&convert=jpeg&width=800');

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        console.log('Conversion successful!');
        console.log('Content-Type:', contentType);

        if (contentType && contentType.includes('image/jpeg')) {
          console.log('✅ PDF to JPEG conversion working correctly');

          // Save the converted image
          const imageBuffer = await response.arrayBuffer();
          const outputPath = path.join(__dirname, 'converted-via-cors.jpeg');
          fs.writeFileSync(outputPath, Buffer.from(imageBuffer));
          console.log('Converted image saved to:', outputPath);
        } else {
          console.log('❌ Unexpected content type:', contentType);
        }
      } else {
        console.log('❌ Conversion failed with status:', response.status);
        const errorText = await response.text();
        console.log('Error response:', errorText);
      }
    } catch (error) {
      console.log('❌ Conversion request failed:', error.message);
    }

    console.log('\nTesting PDF to PNG conversion...');

    // Test PDF to PNG conversion
    try {
      const response = await fetch('http://localhost:3000/proxy?target=file://' + testPdfPath + '&convert=png&width=800');

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        console.log('Conversion successful!');
        console.log('Content-Type:', contentType);

        if (contentType && contentType.includes('image/png')) {
          console.log('✅ PDF to PNG conversion working correctly');

          // Save the converted image
          const imageBuffer = await response.arrayBuffer();
          const outputPath = path.join(__dirname, 'converted-via-cors.png');
          fs.writeFileSync(outputPath, Buffer.from(imageBuffer));
          console.log('Converted image saved to:', outputPath);
        } else {
          console.log('❌ Unexpected content type:', contentType);
        }
      } else {
        console.log('❌ Conversion failed with status:', response.status);
        const errorText = await response.text();
        console.log('Error response:', errorText);
      }
    } catch (error) {
      console.log('❌ Conversion request failed:', error.message);
    }

    console.log('\nTesting without conversion (should return PDF)...');

    // Test without conversion (should return PDF)
    try {
      const response = await fetch('http://localhost:3000/proxy?target=file://' + testPdfPath);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        console.log('Request successful!');
        console.log('Content-Type:', contentType);

        if (contentType && contentType.includes('application/pdf')) {
          console.log('✅ PDF returned correctly without conversion');
        } else {
          console.log('❌ Unexpected content type:', contentType);
        }
      } else {
        console.log('❌ Request failed with status:', response.status);
        const errorText = await response.text();
        console.log('Error response:', errorText);
      }
    } catch (error) {
      console.log('❌ Request failed:', error.message);
    }

    // Clean up
    try {
      fs.unlinkSync(testPdfPath);
    } catch (error) {
      console.log('Warning: Could not clean up test PDF file:', error.message);
    }

    // Stop the proxy server
    console.log('\nStopping proxy server...');
    proxyProcess.kill();

    console.log('\nPDF conversion CORS test completed!');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testPdfConversionCors(); 