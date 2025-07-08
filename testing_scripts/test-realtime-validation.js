import fetch from 'node-fetch';

// Test the real-time validation endpoint
async function testRealTimeValidation() {
  console.log('🧪 Testing Real-time YAML Validation');
  console.log('=====================================\n');

  const testCases = [
    {
      name: 'Valid YAML',
      content: `
processes:
  test-process:
    command: "node"
    args: ["app.js"]
    env:
      NODE_ENV: "production"
`,
      expectedValid: true
    },
    {
      name: 'Invalid YAML - Missing colon',
      content: `
processes:
  test-process:
    command "node"
    args: ["app.js"]
`,
      expectedValid: false
    },
    {
      name: 'Invalid YAML - Unclosed quotes',
      content: `
processes:
  test-process:
    command: "node
    args: ["app.js"]
`,
      expectedValid: false
    },
    {
      name: 'Invalid Process Config - Missing command',
      content: `
processes:
  test-process:
    args: ["app.js"]
    env:
      NODE_ENV: "production"
`,
      expectedValid: false
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

        if (data.success === testCase.expectedValid) {
          console.log(`✅ ${endpoint}: PASS`);
          passed++;
        } else {
          console.log(`❌ ${endpoint}: FAIL`);
          console.log(`   Expected: ${testCase.expectedValid}, Got: ${data.success}`);
          if (!data.success) {
            console.log(`   Error: ${data.error}`);
            if (data.line) {
              console.log(`   Line: ${data.line}`);
            }
            if (data.suggestions) {
              console.log(`   Suggestions: ${data.suggestions.join(', ')}`);
            }
          }
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

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const success = testRealTimeValidation();
  process.exit(success ? 0 : 1);
}

export { testRealTimeValidation }; 