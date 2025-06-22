const fs = require('fs');
const path = require('path');

// Test the PDF conversion functionality
async function testPdfConversion() {
  console.log('Testing PDF conversion functionality...');

  try {
    // Create a simple test PDF (this is just a placeholder - in real usage you'd have actual PDF content)
    const testPdfContent = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n72 720 Td\n(Hello World) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000204 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n297\n%%EOF';

    // Import the conversion function
    const { convertToImage, isConversionSupported } = await import('../src/utils/pdf-converter.ts');

    console.log('Testing conversion support validation...');

    // Test support validation
    console.log('PDF to JPEG supported:', isConversionSupported('application/pdf', 'jpeg'));
    console.log('PDF to PNG supported:', isConversionSupported('application/pdf', 'png'));
    console.log('Non-PDF to JPEG supported:', isConversionSupported('text/plain', 'jpeg'));

    console.log('\nTesting PDF conversion...');

    // Test conversion (this will fail with the simple PDF content, but shows the interface works)
    try {
      const result = await convertToImage(
        testPdfContent,
        'application/pdf',
        'jpeg',
        800,
        600
      );

      console.log('Conversion successful!');
      console.log('Content type:', result.contentType);
      console.log('Body length:', result.body.length);

      // Save the converted image for inspection
      const outputPath = path.join(__dirname, 'converted-test.jpeg');
      fs.writeFileSync(outputPath, Buffer.from(result.body, 'base64'));
      console.log('Converted image saved to:', outputPath);

    } catch (conversionError) {
      console.log('Conversion failed as expected (simple PDF content):', conversionError.message);
    }

    console.log('\nTesting error handling...');

    // Test invalid format
    try {
      await convertToImage(testPdfContent, 'application/pdf', 'gif', 800, 600);
    } catch (error) {
      console.log('Invalid format error caught:', error.message);
    }

    // Test invalid content type
    try {
      await convertToImage(testPdfContent, 'text/plain', 'jpeg', 800, 600);
    } catch (error) {
      console.log('Invalid content type error caught:', error.message);
    }

    // Test invalid dimensions
    try {
      await convertToImage(testPdfContent, 'application/pdf', 'jpeg', -100, 600);
    } catch (error) {
      console.log('Invalid dimensions error caught:', error.message);
    }

    console.log('\nPDF conversion test completed!');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testPdfConversion(); 