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
 * Converts PDF content to image format using pdftoppm and ImageMagick
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

    // Import required modules
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempPdfPath = path.join(tempDir, `temp_${timestamp}.pdf`);
    const tempImagePrefix = path.join(tempDir, `page_${timestamp}`);
    const outputImagePath = path.join(tempDir, `composite_${timestamp}.${outputFormat}`);

    try {
      // Write PDF to temporary file
      await fs.writeFile(tempPdfPath, pdfBuffer);

      // Step 1: Convert PDF to individual page images using pdftoppm
      const pdftoppmArgs = [
        '-f', '1', // Start from page 1
        '-l', '999', // Convert up to 999 pages (effectively all pages)
        '-singlefile', // Output single file per page
        '-scale-to', widthNum ? widthNum.toString() : '800', // Scale to width if specified
        '-jpegopt', 'quality=100', // High quality for JPEG
        tempPdfPath,
        tempImagePrefix
      ];

      if (outputFormat === 'png') {
        pdftoppmArgs.splice(-2, 0, '-png'); // Add PNG format option
      }

      // Execute pdftoppm
      const pdftoppmResult = await new Promise<void>((resolve, reject) => {
        const pdftoppmProcess = spawn('pdftoppm', pdftoppmArgs);
        
        let stderr = '';
        pdftoppmProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pdftoppmProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`pdftoppm failed with code ${code}: ${stderr}`));
          }
        });

        pdftoppmProcess.on('error', (error) => {
          reject(new Error(`Failed to execute pdftoppm: ${error.message}`));
        });
      });

      // Step 2: Find all generated page images
      const pageFiles = [];
      let pageNum = 1;
      while (true) {
        const pageFile = `${tempImagePrefix}-${pageNum.toString().padStart(6, '0')}.${outputFormat}`;
        try {
          await fs.access(pageFile);
          pageFiles.push(pageFile);
          pageNum++;
        } catch {
          break; // No more pages
        }
      }

      if (pageFiles.length === 0) {
        throw new Error('No pages were converted from the PDF');
      }

      logger.info(`Converted ${pageFiles.length} pages from PDF`);

      // Step 3: Composite pages vertically using ImageMagick montage
      const montageArgs = [
        '-mode', 'Concatenate',
        '-tile', '1x', // 1 column, multiple rows (vertical composition)
        '-geometry', '+0+0', // No spacing between images
        ...pageFiles,
        outputImagePath
      ];

      const montageResult = await new Promise<void>((resolve, reject) => {
        const montageProcess = spawn('montage', montageArgs);
        
        let stderr = '';
        montageProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        montageProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`montage failed with code ${code}: ${stderr}`));
          }
        });

        montageProcess.on('error', (error) => {
          reject(new Error(`Failed to execute montage: ${error.message}`));
        });
      });

      // Step 4: Read the composite image
      const imageBuffer = await fs.readFile(outputImagePath);
      const imageBase64 = imageBuffer.toString('base64');

      // Clean up temporary files
      try {
        await fs.unlink(tempPdfPath);
        for (const pageFile of pageFiles) {
          await fs.unlink(pageFile);
        }
        await fs.unlink(outputImagePath);
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
        // Try to clean up any page files that might have been created
        let pageNum = 1;
        while (true) {
          const pageFile = `${tempImagePrefix}-${pageNum.toString().padStart(6, '0')}.${outputFormat}`;
          try {
            await fs.unlink(pageFile);
            pageNum++;
          } catch {
            break;
          }
        }
        await fs.unlink(outputImagePath);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temporary files on error', { error: cleanupError });
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