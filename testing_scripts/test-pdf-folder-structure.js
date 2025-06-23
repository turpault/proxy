#!/usr/bin/env bun

/**
 * Test script to demonstrate the folder structure created by PDF converter
 */

import * as fs from 'fs-extra';
import * as path from 'path';

async function testPdfFolderStructure() {
  console.log('🧪 Testing PDF converter folder structure...\n');

  // Create a test temp directory
  const testTempDir = './data/test-pdf-structure';
  await fs.ensureDir(testTempDir);

  console.log(`✅ Created test temp directory: ${testTempDir}`);

  // Simulate the folder structure that would be created
  const timestamp = Date.now();
  const extractedImagesDir = path.join(testTempDir, `extracted_${timestamp}`);

  console.log(`📁 Would create extracted images directory: ${extractedImagesDir}`);

  // Create the directory structure
  await fs.mkdir(extractedImagesDir, { recursive: true });

  // Create some sample image files to simulate what pdftoppm would create
  const sampleFiles = [
    'page-000001.jpeg',
    'page-000002.jpeg',
    'page-000003.jpeg',
    'page-000004.jpeg'
  ];

  for (const file of sampleFiles) {
    const filePath = path.join(extractedImagesDir, file);
    await fs.writeFile(filePath, 'sample image content');
    console.log(`📄 Created sample file: ${file}`);
  }

  // Demonstrate the readdir enumeration
  console.log('\n📂 Enumerating files using readdir:');
  const extractedFiles = await fs.readdir(extractedImagesDir);

  console.log(`Found ${extractedFiles.length} files: ${extractedFiles.join(', ')}`);

  // Filter for image files and sort them
  const imageFiles = extractedFiles
    .filter(file => file.endsWith('.jpeg'))
    .map(file => path.join(extractedImagesDir, file))
    .sort();

  console.log(`\n🖼️  Filtered image files (${imageFiles.length}):`);
  imageFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${path.basename(file)}`);
  });

  // Show the montage command that would be used
  console.log('\n🔧 Montage command that would be executed:');
  console.log(`montage -mode Concatenate -tile 1x -geometry +0+0 ${imageFiles.join(' ')} composite_${timestamp}.jpeg`);

  // Clean up
  await fs.remove(testTempDir);
  console.log(`\n✅ Cleaned up test directory: ${testTempDir}`);

  console.log('\n🎉 Folder structure test completed!');
  console.log('\n📋 Summary of improvements:');
  console.log('  ✅ Creates dedicated folder for extracted images');
  console.log('  ✅ Uses readdir to enumerate files instead of while loop');
  console.log('  ✅ Filters files by extension');
  console.log('  ✅ Sorts files to ensure correct page order');
  console.log('  ✅ More efficient cleanup (removes entire folder)');
}

testPdfFolderStructure().catch(console.error); 