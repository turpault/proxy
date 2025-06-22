# PDF Conversion with pdftoppm and ImageMagick

This proxy server now supports converting PDF files to images (JPEG or PNG) using `pdftoppm` and `ImageMagick` for vertical composition of all pages.

## Dependencies

The PDF conversion feature requires the following system dependencies:

### 1. pdftoppm (from Poppler)
`pdftoppm` is used to convert PDF pages to individual images.

**Installation:**
- **macOS:** `brew install poppler`
- **Ubuntu/Debian:** `sudo apt-get install poppler-utils`
- **CentOS/RHEL:** `sudo yum install poppler-utils`
- **Windows:** Download from [Poppler for Windows](http://blog.alivate.com.au/poppler-windows/)

### 2. ImageMagick
`ImageMagick` is used to composite multiple page images vertically into a single image.

**Installation:**
- **macOS:** `brew install imagemagick`
- **Ubuntu/Debian:** `sudo apt-get install imagemagick`
- **CentOS/RHEL:** `sudo yum install ImageMagick`
- **Windows:** Download from [ImageMagick](https://imagemagick.org/script/download.php#windows)

## Usage

The PDF conversion is available through the CORS proxy when the `convert` query parameter is specified:

```
GET /proxy?target=https://example.com/document.pdf&convert=jpeg&width=800
```

### Query Parameters

- `convert`: Output format (`jpeg` or `png`)
- `width`: Optional width for the output image (default: 800px)
- `height`: Optional height for individual pages (not used for composition)

### Features

1. **Multi-page Support**: Converts all pages of the PDF
2. **Vertical Composition**: All pages are composited vertically into a single image
3. **Format Support**: Output as JPEG or PNG
4. **Quality Control**: High-quality conversion with configurable dimensions
5. **Error Handling**: Comprehensive error handling and cleanup

### Example

```bash
# Convert a PDF to JPEG with 800px width
curl "http://localhost:3000/proxy?target=https://example.com/document.pdf&convert=jpeg&width=800"

# Convert a PDF to PNG with 1200px width
curl "http://localhost:3000/proxy?target=https://example.com/document.pdf&convert=png&width=1200"
```

## Technical Details

### Conversion Process

1. **PDF to Images**: `pdftoppm` converts each PDF page to a separate image file
2. **Page Discovery**: The system finds all generated page images
3. **Vertical Composition**: `ImageMagick montage` composites all pages vertically
4. **Base64 Encoding**: The final composite image is encoded as base64
5. **Cleanup**: All temporary files are removed

### File Naming Convention

- Temporary PDF: `temp_{timestamp}.pdf`
- Page images: `page_{timestamp}-{pagenum}.{format}`
- Composite image: `composite_{timestamp}.{format}`

### Error Handling

- Validates input content type (must be `application/pdf`)
- Validates output format (`jpeg` or `png`)
- Validates dimensions (1-10000px)
- Handles `pdftoppm` and `montage` command failures
- Cleans up temporary files on errors

## Testing

Use the test script to verify the conversion functionality:

```bash
node testing_scripts/test-pdf-conversion.js
```

Note: The test script uses a simple PDF content that may not convert properly. For real testing, use an actual PDF file with multiple pages.

## Troubleshooting

### Common Issues

1. **"pdftoppm not found"**: Install Poppler utilities
2. **"montage not found"**: Install ImageMagick
3. **Permission errors**: Ensure the temp directory is writable
4. **Conversion failures**: Check if the PDF is valid and readable

### Debugging

Enable debug logging to see detailed conversion information:

```typescript
logger.info(`Converted ${pageFiles.length} pages from PDF`);
```

The system logs the number of pages converted and any errors during the process. 