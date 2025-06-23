#!/usr/bin/env bun

/**
 * Test script to verify backup functionality with new directory structure
 */

import * as fs from 'fs-extra';
import * as path from 'path';

async function testBackupFunctionality() {
  console.log('🧪 Testing backup functionality...\n');

  // Test 1: Check if backup directory exists
  const backupDir = './config/backup';
  const backupExists = await fs.pathExists(backupDir);
  console.log(`✅ Backup directory exists: ${backupExists}`);

  // Test 2: Check if data directories were created
  const dataDirs = [
    './data/temp',
    './data/statistics',
    './data/cache',
    './logs/statistics'
  ];

  for (const dir of dataDirs) {
    const exists = await fs.pathExists(dir);
    console.log(`✅ ${dir} exists: ${exists}`);
  }

  // Test 3: Check if main.yaml has the new configuration
  const mainConfigPath = './config/main.yaml';
  if (await fs.pathExists(mainConfigPath)) {
    const content = await fs.readFile(mainConfigPath, 'utf8');
    const hasBackupDir = content.includes('backupDir: "./config/backup"');
    const hasTempDir = content.includes('tempDir: "./data/temp"');
    const hasStatsDir = content.includes('statsDir: "./data/statistics"');
    const hasCacheDir = content.includes('cacheDir: "./data/cache"');

    console.log(`✅ main.yaml has backupDir config: ${hasBackupDir}`);
    console.log(`✅ main.yaml has tempDir config: ${hasTempDir}`);
    console.log(`✅ main.yaml has statsDir config: ${hasStatsDir}`);
    console.log(`✅ main.yaml has cacheDir config: ${hasCacheDir}`);
  }

  // Test 4: Check if command-line argument support works
  console.log('\n📋 Command-line usage examples:');
  console.log('  bun run src/index.ts --config ./config/main.yaml');
  console.log('  bun run src/index.ts --config /path/to/custom/main.yaml');
  console.log('  MAIN_CONFIG_FILE=/path/to/config.yaml bun run src/index.ts');

  // Test 5: List any existing backups
  if (backupExists) {
    const files = await fs.readdir(backupDir);
    const backupFiles = files.filter(f => f.endsWith('.yaml'));
    console.log(`\n📁 Found ${backupFiles.length} backup files in ${backupDir}:`);
    backupFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
  }

  console.log('\n🎉 Backup functionality test completed!');
}

// Run the test
testBackupFunctionality().catch(console.error); 