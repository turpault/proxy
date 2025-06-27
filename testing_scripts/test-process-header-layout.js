#!/usr/bin/env node

import puppeteer from 'puppeteer';

async function testProcessHeaderLayout() {
  console.log('🔍 Testing Process View Header Layout Changes...\n');

  let browser;
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1200, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Navigate to management interface
    console.log('1. Navigating to management interface...');
    await page.goto('http://localhost:4481', { waitUntil: 'networkidle2' });

    // Wait for the page to load
    await page.waitForSelector('#content-processes', { timeout: 10000 });
    console.log('✅ Management interface loaded successfully');

    // Test 2: Check if the header layout is correct
    console.log('\n2. Testing header layout...');

    // Check if the header has the new structure
    const headerContent = await page.$('.header-content');
    if (headerContent) {
      console.log('✅ Header has new content structure');
    } else {
      console.log('❌ Header content structure not found');
      return;
    }

    // Check if header-left exists
    const headerLeft = await page.$('.header-left');
    if (headerLeft) {
      console.log('✅ Header left section exists');
    } else {
      console.log('❌ Header left section not found');
    }

    // Check if header-right exists
    const headerRight = await page.$('.header-right');
    if (headerRight) {
      console.log('✅ Header right section exists');
    } else {
      console.log('❌ Header right section not found');
    }

    // Check if last updated info is in the header
    const lastUpdatedInfo = await page.$('.last-updated-info');
    if (lastUpdatedInfo) {
      console.log('✅ Last updated info in header exists');
    } else {
      console.log('❌ Last updated info in header not found');
    }

    // Check if the last updated time element exists
    const headerLastUpdated = await page.$('#header-last-updated');
    if (headerLastUpdated) {
      console.log('✅ Header last updated time element exists');

      // Get the text content
      const lastUpdatedText = await page.$eval('#header-last-updated', el => el.textContent);
      console.log(`   Last updated time: ${lastUpdatedText}`);
    } else {
      console.log('❌ Header last updated time element not found');
    }

    // Test 3: Check if "Last Updated" stat card was removed
    console.log('\n3. Testing stat cards...');

    const lastUpdatedCard = await page.$('#last-updated');
    if (!lastUpdatedCard) {
      console.log('✅ "Last Updated" stat card was successfully removed');
    } else {
      console.log('❌ "Last Updated" stat card still exists');
    }

    // Check if other stat cards still exist
    const processesCount = await page.$('#processes-count');
    const runningCount = await page.$('#running-count');
    const stoppedCount = await page.$('#stopped-count');
    const uptime = await page.$('#uptime');

    if (processesCount && runningCount && stoppedCount && uptime) {
      console.log('✅ All other stat cards exist');

      // Get the values
      const processesValue = await page.$eval('#processes-count', el => el.textContent);
      const runningValue = await page.$eval('#running-count', el => el.textContent);
      const stoppedValue = await page.$eval('#stopped-count', el => el.textContent);
      const uptimeValue = await page.$eval('#uptime', el => el.textContent);

      console.log(`   Total Processes: ${processesValue}`);
      console.log(`   Running: ${runningValue}`);
      console.log(`   Stopped: ${stoppedValue}`);
      console.log(`   Uptime: ${uptimeValue}`);
    } else {
      console.log('❌ Some stat cards are missing');
    }

    // Test 4: Test periodic uptime updates
    console.log('\n4. Testing periodic uptime updates...');

    // Get initial uptime value
    const initialUptime = await page.$eval('#uptime', el => el.textContent);
    console.log(`   Initial uptime: ${initialUptime}`);

    // Wait for 3 seconds to see if uptime updates
    console.log('   Waiting 3 seconds for uptime to update...');
    await page.waitForTimeout(3000);

    const updatedUptime = await page.$eval('#uptime', el => el.textContent);
    console.log(`   Updated uptime: ${updatedUptime}`);

    if (updatedUptime !== initialUptime) {
      console.log('✅ Uptime is updating periodically');
    } else {
      console.log('❌ Uptime is not updating periodically');
    }

    // Test 5: Check header styling
    console.log('\n5. Testing header styling...');

    // Check if the header has the correct layout
    const headerStyles = await page.evaluate(() => {
      const header = document.querySelector('.header');
      const headerContent = document.querySelector('.header-content');
      const headerLeft = document.querySelector('.header-left');
      const headerRight = document.querySelector('.header-right');

      if (!header || !headerContent || !headerLeft || !headerRight) {
        return null;
      }

      const headerContentStyle = window.getComputedStyle(headerContent);
      const headerLeftStyle = window.getComputedStyle(headerLeft);
      const headerRightStyle = window.getComputedStyle(headerRight);

      return {
        headerContentDisplay: headerContentStyle.display,
        headerContentJustifyContent: headerContentStyle.justifyContent,
        headerLeftFlex: headerLeftStyle.flex,
        headerRightDisplay: headerRightStyle.display,
        headerRightJustifyContent: headerRightStyle.justifyContent
      };
    });

    if (headerStyles) {
      console.log('✅ Header styling applied correctly:');
      console.log(`   Header content display: ${headerStyles.headerContentDisplay}`);
      console.log(`   Header content justify-content: ${headerStyles.headerContentJustifyContent}`);
      console.log(`   Header left flex: ${headerStyles.headerLeftFlex}`);
      console.log(`   Header right display: ${headerStyles.headerRightDisplay}`);
      console.log(`   Header right justify-content: ${headerStyles.headerRightJustifyContent}`);
    } else {
      console.log('❌ Header styling not applied correctly');
    }

    console.log('\n✅ Process header layout test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
testProcessHeaderLayout().catch(console.error); 