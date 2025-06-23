#!/usr/bin/env bun

/**
 * Test script to check for JavaScript errors in frontend files
 */

import * as fs from 'fs-extra';

async function testFrontendJS() {
  console.log('🧪 Testing frontend JavaScript files...\n');

  // Test 1: Check config-editor.js for duplicate currentConfigType
  const configEditorFile = './src/static/management/config-editor.js';
  const configEditorContent = await fs.readFile(configEditorFile, 'utf8');

  const hasDuplicateCurrentConfigType = configEditorContent.includes('let currentConfigType =');
  console.log(`✅ No duplicate currentConfigType in config-editor.js: ${!hasDuplicateCurrentConfigType}`);

  // Test 2: Check for showTab reference issues
  const hasShowTabReference = configEditorContent.includes('const originalShowTab = showTab');
  console.log(`✅ No showTab reference issues in config-editor.js: ${!hasShowTabReference}`);

  // Test 3: Check HTML file for proper currentConfigType declaration
  const htmlFile = './src/static/management/index.html';
  const htmlContent = await fs.readFile(htmlFile, 'utf8');

  const hasCurrentConfigTypeInHTML = htmlContent.includes('let currentConfigType = \'proxy\'');
  console.log(`✅ currentConfigType properly declared in HTML: ${hasCurrentConfigTypeInHTML}`);

  // Test 4: Check for config tab handling in showTab function
  const hasConfigTabHandling = htmlContent.includes('else if (tab === \'config\')');
  console.log(`✅ Config tab handling in showTab function: ${hasConfigTabHandling}`);

  // Test 5: Check for duplicate showTab overrides
  const showTabOverrides = (htmlContent.match(/const originalShowTab = showTab/g) || []).length;
  console.log(`✅ No duplicate showTab overrides: ${showTabOverrides <= 1}`);

  // Test 6: Check for proper function references
  const hasLoadConfigFunction = htmlContent.includes('function loadConfig(');
  console.log(`✅ loadConfig function properly defined: ${hasLoadConfigFunction}`);

  console.log('\n🎉 Frontend JavaScript test completed!');

  if (!hasDuplicateCurrentConfigType && !hasShowTabReference && hasCurrentConfigTypeInHTML &&
    hasConfigTabHandling && showTabOverrides <= 1 && hasLoadConfigFunction) {
    console.log('✅ All frontend JavaScript issues have been resolved!');
  } else {
    console.log('❌ Some frontend JavaScript issues remain.');
  }
}

// Run the test
testFrontendJS().catch(console.error); 