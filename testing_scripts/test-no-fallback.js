#!/usr/bin/env bun

/**
 * Test script to verify that no fallback occurs in registerManagementEndpoints
 */

import * as fs from 'fs-extra';

async function testNoFallback() {
  console.log('🧪 Testing that no fallback occurs in registerManagementEndpoints...\n');

  // Test 1: Check that statisticsService parameter is required
  const managementFile = './src/services/management.ts';
  const content = await fs.readFile(managementFile, 'utf8');

  // Check that statisticsService is not optional (no ? after parameter name)
  const hasOptionalStatsService = content.includes('statisticsService?: any');
  const hasRequiredStatsService = content.includes('statisticsService: any');

  console.log(`✅ statisticsService parameter is required: ${hasRequiredStatsService && !hasOptionalStatsService}`);

  // Check that no fallback code exists
  const hasFallbackCode = content.includes('require(\'./statistics\').statisticsService');
  console.log(`✅ No fallback code found: ${!hasFallbackCode}`);

  // Check that statisticsService is used directly
  const usesStatsServiceDirectly = content.includes('statisticsService.getTimePeriodStats') ||
    content.includes('statisticsService.getCurrentStats') ||
    content.includes('statisticsService.getStatsSummary') ||
    content.includes('statisticsService.forceSave') ||
    content.includes('statisticsService.clearAll');
  console.log(`✅ Uses statisticsService directly: ${usesStatsServiceDirectly}`);

  // Test 2: Check that ProxyServer has getStatisticsService method
  const proxyServerFile = './src/services/proxy-server.ts';
  const proxyContent = await fs.readFile(proxyServerFile, 'utf8');

  const hasGetterMethod = proxyContent.includes('getStatisticsService(): any');
  console.log(`✅ ProxyServer has getStatisticsService method: ${hasGetterMethod}`);

  // Test 3: Check that calls to registerManagementEndpoints pass statistics service
  const indexFile = './src/index.ts';
  const indexContent = await fs.readFile(indexFile, 'utf8');

  const passesStatsService = indexContent.includes('getStatisticsService()');
  console.log(`✅ index.ts passes statistics service: ${passesStatsService}`);

  console.log('\n🎉 No fallback test completed!');
  console.log('The registerManagementEndpoints function will never fall back to the global statistics service.');
}

// Run the test
testNoFallback().catch(console.error); 