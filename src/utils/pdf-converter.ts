import { logger } from './logger';

export interface ConversionOptions {
  format: 'jpeg' | 'png';
  width?: number;
  height?: number;
  quality?: number;
}

export interface ConversionResult {
  body: string;
  contentType: string;
}

/**
 * Converts PDF content to image format
 * @param body - The PDF content as binary string
 * @param contentType - The original content type
 * @param format - The desired output format ('jpeg' or 'png')
 * @param width - Optional width for the output image
 * @param height - Optional height for the output image
 * @returns Promise<ConversionResult> - The converted image data and content type
 */
export async function convertToImage(
  body: string,
  contentType: string,
  format?: string,
  width?: string | number,
  height?: string | number
): Promise<ConversionResult> {
  // Check if input is PDF
  if (!contentType.includes('application/pdf')) {
    throw new Error('Input content type must be application/pdf');
  }

  // Validate format
  const outputFormat = format?.toLowerCase() as 'jpeg' | 'png';
  if (!outputFormat || !['jpeg', 'png'].includes(outputFormat)) {
    throw new Error('Output format must be either "jpeg" or "png"');
  }

  try {
    // Convert string parameters to numbers
    const widthNum = width ? Number(width) : undefined;
    const heightNum = height ? Number(height) : undefined;

    // Validate dimensions
    if (widthNum && (widthNum <= 0 || widthNum > 10000)) {
      throw new Error('Width must be between 1 and 10000');
    }
    if (heightNum && (heightNum <= 0 || heightNum > 10000)) {
      throw new Error('Height must be between 1 and 10000');
    }

    // Convert binary string to Buffer
    const pdfBuffer = Buffer.from(body, 'binary');

    // Use pdf2pic for conversion
    const { fromPath } = await import('pdf2pic');
    
    const options = {
      density: 100, // DPI
      saveFilename: "converted",
      savePath: "/tmp", // Temporary directory
      format: outputFormat,
      width: widthNum,
      height: heightNum,
      quality: 100
    };

    // Create a temporary file for the PDF
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    
    const tempDir = os.tmpdir();
    const tempPdfPath = path.join(tempDir, `temp_${Date.now()}.pdf`);
    const tempImagePath = path.join(tempDir, `converted_${Date.now()}.${outputFormat}`);

    try {
      // Write PDF to temporary file
      await fs.writeFile(tempPdfPath, pdfBuffer);

      // Convert PDF to image
      const convert = fromPath(tempPdfPath, options);
      const pageData = await convert(1); // Convert first page

      if (!pageData || !pageData.path) {
        throw new Error('Failed to convert PDF to image');
      }

      // Read the converted image
      const imageBuffer = await fs.readFile(pageData.path);
      const imageBase64 = imageBuffer.toString('base64');

      // Clean up temporary files
      try {
        await fs.unlink(tempPdfPath);
        await fs.unlink(pageData.path);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temporary files', { error: cleanupError });
      }

      // Return the converted image
      return {
        body: imageBase64,
        contentType: `image/${outputFormat}`
      };

    } catch (conversionError) {
      // Clean up temporary files on error
      try {
        await fs.unlink(tempPdfPath);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temporary PDF file', { error: cleanupError });
      }
      throw conversionError;
    }

  } catch (error) {
    logger.error('PDF conversion failed', { error, format, width, height });
    throw new Error(`PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validates if the given content type and format combination is supported
 * @param contentType - The input content type
 * @param format - The desired output format
 * @returns boolean - Whether the conversion is supported
 */
export function isConversionSupported(contentType: string, format?: string): boolean {
  if (!contentType.includes('application/pdf')) {
    return false;
  }

  const outputFormat = format?.toLowerCase();
  return outputFormat === 'jpeg' || outputFormat === 'png';
} 