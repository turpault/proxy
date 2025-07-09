import { ConfigSaveRequest } from '../src/types/index';
import { ConfigSaveRequest as FrontendConfigSaveRequest } from '../src/frontend/management/src/types/shared';

// Test the backend type
console.log('=== Testing Backend ConfigSaveRequest ===');
const backendRequest: ConfigSaveRequest = {
  content: 'test content',
  createBackup: true,
  configType: 'proxy',
  path: './config/proxy.yaml'
};

console.log('Backend request:', backendRequest);

// Test the frontend type
console.log('\n=== Testing Frontend ConfigSaveRequest ===');
const frontendRequest: FrontendConfigSaveRequest = {
  content: 'test content',
  createBackup: false,
  configType: 'processes',
  path: './config/processes.yaml'
};

console.log('Frontend request:', frontendRequest);

// Test that they are compatible
console.log('\n=== Testing Type Compatibility ===');
const testFunction = (request: ConfigSaveRequest) => {
  console.log('Processing request:', request);
  return request.content.length;
};

const backendResult = testFunction(backendRequest);
const frontendResult = testFunction(frontendRequest);

console.log('Backend result:', backendResult);
console.log('Frontend result:', frontendResult);

// Test optional fields
console.log('\n=== Testing Optional Fields ===');
const minimalRequest: ConfigSaveRequest = {
  content: 'minimal content'
};

console.log('Minimal request:', minimalRequest);

console.log('\n=== All tests completed successfully ==='); 