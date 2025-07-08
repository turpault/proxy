import fetch from 'node-fetch';

// Test the YAML line highlighting functionality
async function testLineHighlighting() {
  console.log('🧪 Testing YAML Line Highlighting');
  console.log('==================================\n');

  const testCases = [
    {
      name: 'Missing colon on line 3',
      content: `processes:
  test-process:
    command "node"
    args: ["app.js"]`,
      expectedLine: 3,
      expectedError: 'incomplete explicit mapping pair'
    },
    {
      name: 'Unclosed quotes on line 4',
      content: `processes:
  test-process:
    command: "node
    args: ["app.js"]`,
      expectedLine: 4,
      expectedError: 'Missing closing "quote'
    },
    {
      name: 'Inconsistent indentation on line 5',
      content: `processes:
  test-process:
    command: "node"
args: ["app.js"]`,
      expectedLine: 5,
      expectedError: 'mapping values are not allowed'
    },
    {
      name: 'Duplicate key on line 4',
      content: `processes:
  test-process:
    command: "node"
    command: "python"
    args: ["app.js"]`,
      expectedLine: 4,
      expectedError: 'Map keys must be unique'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log('─'.repeat(50));

    try {
      // Test both proxy and processes validation endpoints
      const endpoints = ['proxy', 'processes'];

      for (const endpoint of endpoints) {
        const response = await fetch(`http://localhost:3001/api/config/${endpoint}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: testCase.content })
        });

        if (!response.ok) {
          console.log(`❌ HTTP Error for ${endpoint}: ${response.status} ${response.statusText}`);
          failed++;
          continue;
        }

        const data = await response.json();

        if (!data.success && data.line === testCase.expectedLine) {
          console.log(`✅ ${endpoint}: PASS - Line ${data.line} correctly identified`);
          passed++;
        } else if (!data.success && data.line !== testCase.expectedLine) {
          console.log(`❌ ${endpoint}: FAIL - Expected line ${testCase.expectedLine}, got ${data.line}`);
          console.log(`   Error: ${data.error}`);
          failed++;
        } else if (data.success) {
          console.log(`❌ ${endpoint}: FAIL - Expected validation to fail`);
          failed++;
        } else {
          console.log(`❌ ${endpoint}: FAIL - No line information provided`);
          console.log(`   Error: ${data.error}`);
          failed++;
        }
      }

      console.log('');
    } catch (error) {
      console.log('❌ FAIL - Exception thrown');
      console.log(`Error: ${error.message}`);
      failed++;
      console.log('');
    }
  }

  console.log('📊 Test Results');
  console.log('===============');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  return failed === 0;
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLineHighlighting()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed with error:', error);
      process.exit(1);
    });
}

export { testLineHighlighting }; 