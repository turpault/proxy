import { validateYAML, validateProcessConfigYAML, formatYAMLError } from '../src/utils/yaml-validator.js';

// Test cases for YAML validation
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
    name: 'Missing colon',
    content: `
processes:
  test-process:
    command "node"
    args: ["app.js"]
`,
    expectedValid: false,
    expectedError: 'incomplete explicit mapping pair'
  },
  {
    name: 'Inconsistent indentation',
    content: `
processes:
  test-process:
    command: "node"
args: ["app.js"]
`,
    expectedValid: false,
    expectedError: 'mapping values are not allowed'
  },
  {
    name: 'Unclosed quotes',
    content: `
processes:
  test-process:
    command: "node
    args: ["app.js"]
`,
    expectedValid: false,
    expectedError: 'Missing closing "quote'
  },
  {
    name: 'Duplicate key',
    content: `
processes:
  test-process:
    command: "node"
    command: "python"
    args: ["app.js"]
`,
    expectedValid: false,
    expectedError: 'Map keys must be unique'
  },
  {
    name: 'Missing required section',
    content: `
# Missing processes section
server:
  port: 3000
`,
    expectedValid: false,
    expectedError: 'Missing required section'
  },
  {
    name: 'Invalid process config - missing command',
    content: `
processes:
  test-process:
    args: ["app.js"]
    env:
      NODE_ENV: "production"
`,
    expectedValid: false,
    expectedError: 'missing required field "command"'
  },
  {
    name: 'Invalid process config - args not array',
    content: `
processes:
  test-process:
    command: "node"
    args: "app.js"
`,
    expectedValid: false,
    expectedError: '"args" must be an array'
  }
];

function runTests() {
  console.log('🧪 Testing YAML Validation');
  console.log('==========================\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log('─'.repeat(50));

    try {
      let result;
      if (testCase.name.includes('process config')) {
        result = validateProcessConfigYAML(testCase.content);
      } else {
        result = validateYAML(testCase.content);
      }

      if (result.isValid === testCase.expectedValid) {
        console.log('✅ PASS');
        passed++;
      } else {
        console.log('❌ FAIL');
        console.log(`Expected: ${testCase.expectedValid}, Got: ${result.isValid}`);
        failed++;
      }

      if (!result.isValid) {
        console.log('Error Details:');
        console.log(formatYAMLError(result));

        if (testCase.expectedError && !result.details?.includes(testCase.expectedError)) {
          console.log(`⚠️  Expected error to contain: "${testCase.expectedError}"`);
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
  const success = runTests();
  process.exit(success ? 0 : 1);
}

export { runTests }; 