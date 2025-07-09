import {
  validateYAML,
  validateProcessConfigYAML,
  validateProxyConfigYAML,
  validateMainConfigYAML,
  formatYAMLError
} from '../src/utils/yaml-validator';

// Test basic YAML validation
console.log('=== Testing Basic YAML Validation ===');
const validYAML = `
name: test
value: 123
list:
  - item1
  - item2
`;

const invalidYAML = `
name: test
value: 123
list:
  - item1
  - item2
  - item3: invalid
    - item4
`;

console.log('Valid YAML:', validateYAML(validYAML).isValid);
console.log('Invalid YAML:', validateYAML(invalidYAML).isValid);
if (!validateYAML(invalidYAML).isValid) {
  console.log('Error details:', formatYAMLError(validateYAML(invalidYAML)));
}

// Test process config validation
console.log('\n=== Testing Process Config Validation ===');
const validProcessConfig = `
processes:
  my-process:
    command: "node"
    args: ["server.js"]
    env:
      NODE_ENV: production
    healthCheck:
      enabled: true
      path: "/health"
`;

const invalidProcessConfig = `
processes:
  my-process:
    # Missing required command field
    args: "not-an-array"
    healthCheck:
      enabled: "not-a-boolean"
`;

console.log('Valid Process Config:', validateProcessConfigYAML(validProcessConfig).isValid);
console.log('Invalid Process Config:', validateProcessConfigYAML(invalidProcessConfig).isValid);
if (!validateProcessConfigYAML(invalidProcessConfig).isValid) {
  console.log('Error details:', formatYAMLError(validateProcessConfigYAML(invalidProcessConfig)));
}

// Test proxy config validation
console.log('\n=== Testing Proxy Config Validation ===');
const validProxyConfig = `
port: 80
httpsPort: 443
routes:
  - domain: example.com
    target: http://localhost:3000
    ssl: true
letsEncrypt:
  email: admin@example.com
  staging: false
  certDir: ./certificates
logging:
  level: info
`;

const invalidProxyConfig = `
port: "not-a-number"
routes:
  - domain: example.com
    # Missing required target
letsEncrypt:
  email: "invalid-email"
`;

console.log('Valid Proxy Config:', validateProxyConfigYAML(validProxyConfig).isValid);
console.log('Invalid Proxy Config:', validateProxyConfigYAML(invalidProxyConfig).isValid);
if (!validateProxyConfigYAML(invalidProxyConfig).isValid) {
  console.log('Error details:', formatYAMLError(validateProxyConfigYAML(invalidProxyConfig)));
}

// Test main config validation
console.log('\n=== Testing Main Config Validation ===');
const validMainConfig = `
management:
  port: 8080
  host: 0.0.0.0
config:
  proxy: ./config/proxy.yaml
  processes: ./config/processes.yaml
settings:
  dataDir: ./data
  logsDir: ./logs
`;

const invalidMainConfig = `
management:
  port: "not-a-number"
  # Missing required host
config:
  # Missing required proxy and processes
`;

console.log('Valid Main Config:', validateMainConfigYAML(validMainConfig).isValid);
console.log('Invalid Main Config:', validateMainConfigYAML(invalidMainConfig).isValid);
if (!validateMainConfigYAML(invalidMainConfig).isValid) {
  console.log('Error details:', formatYAMLError(validateMainConfigYAML(invalidMainConfig)));
}

console.log('\n=== All tests completed ==='); 