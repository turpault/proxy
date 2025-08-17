# Functional Tests for Bun Proxy Server

This directory contains comprehensive functional tests for the Bun Proxy Server using the Bun test runner. These tests are designed to test the actual functionality without mocking the existing code.

## Test Structure

### 1. `functional-tests.ts` - Core Functionality Tests
Tests the main proxy server functionality including:
- Server initialization and startup/shutdown
- Proxy routing (proxy, static, redirect)
- Process management
- Statistics and monitoring
- Configuration management
- Error handling
- Performance and load testing
- Integration tests

### 2. `security-tests.ts` - Security Feature Tests
Tests security-related functionality:
- Rate limiting
- Geolocation filtering
- CORS handling
- OAuth2 integration
- Input validation
- SSL/TLS enforcement

### 3. `process-management-tests.ts` - Process Management Tests
Tests the process management system:
- Process lifecycle (start, stop, restart)
- Process configuration
- Process logs
- Health checks
- Process scheduling
- Error handling

### 4. `load-tests.ts` - Performance and Load Tests
Tests performance under various load conditions:
- Concurrent request handling
- Sustained load testing
- Memory and resource usage
- Rate limiting under load
- Error handling under load
- Performance benchmarks

### 5. `test-runner.ts` - Test Runner
Main test runner that orchestrates all test suites.

## Running the Tests

### Prerequisites
- Bun runtime installed
- All dependencies installed (`bun install`)
- Test certificates (if testing SSL features)

### Run All Tests
```bash
# Run all functional tests
bun test testing_scripts/

# Run specific test file
bun test testing_scripts/functional-tests.ts

# Run with verbose output
bun test testing_scripts/ --verbose

# Run with coverage
bun test testing_scripts/ --coverage
```

### Run Individual Test Suites
```bash
# Core functionality tests
bun test testing_scripts/functional-tests.ts

# Security tests
bun test testing_scripts/security-tests.ts

# Process management tests
bun test testing_scripts/process-management-tests.ts

# Load tests
bun test testing_scripts/load-tests.ts
```

### Run Tests with Specific Configuration
```bash
# Run tests with custom environment
NODE_ENV=test bun test testing_scripts/

# Run tests with debug logging
DEBUG=true bun test testing_scripts/
```

## Test Configuration

The tests use isolated configurations to avoid conflicts:

- **Ports**: Tests use ports 8443-8447 to avoid conflicts
- **SSL**: Most tests disable SSL for simplicity
- **Processes**: Tests use simple echo/sleep commands
- **Static Files**: Tests create temporary static files

## Test Categories

### Functional Tests
- **Server Lifecycle**: Startup, shutdown, initialization
- **Proxy Routing**: Forward requests to target servers
- **Static File Serving**: Serve static content
- **Redirects**: Handle HTTP redirects
- **Error Handling**: 404, 500, malformed requests
- **Performance**: Response times, concurrent requests

### Security Tests
- **Rate Limiting**: Request frequency limits
- **Geolocation**: Country-based access control
- **CORS**: Cross-origin resource sharing
- **OAuth2**: Authentication flows
- **Input Validation**: Malicious input handling

### Process Management Tests
- **Process Control**: Start, stop, restart processes
- **Configuration**: Load and update process configs
- **Logging**: Capture and retrieve process logs
- **Health Checks**: Monitor process health
- **Scheduling**: Cron-based process execution

### Load Tests
- **Concurrency**: Handle multiple simultaneous requests
- **Sustained Load**: Long-running high-traffic scenarios
- **Resource Usage**: Memory and CPU monitoring
- **Rate Limiting**: Performance under rate limits
- **Error Recovery**: Handle failures under load

## Test Data and Fixtures

### Static Files
Tests create temporary static files in `./testing_scripts/test-static/`:
- `test.html` - Simple HTML file
- `test.json` - JSON data file

### Test Servers
Tests start temporary HTTP servers on various ports:
- Port 8080: Main test server
- Port 8081: Error simulation server

### Process Commands
Tests use simple system commands:
- `echo` - For quick output
- `sleep` - For timing tests
- `node -e` - For JavaScript execution

## Expected Test Results

### Success Criteria
- All tests should pass
- Response times under acceptable thresholds
- No memory leaks or resource exhaustion
- Proper error handling and recovery

### Performance Benchmarks
- **Response Time**: < 2 seconds for most requests
- **Concurrency**: Handle 100+ concurrent requests
- **Success Rate**: > 95% for normal operations
- **Memory Usage**: Stable over time

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```
   Error: Address already in use
   ```
   Solution: Ensure no other services are using test ports (8443-8447, 8080-8081)

2. **Permission Errors**
   ```
   Error: EACCES: permission denied
   ```
   Solution: Check file permissions for test directories

3. **Process Timeout**
   ```
   Error: Test timeout
   ```
   Solution: Increase timeout values or check for hanging processes

4. **SSL Certificate Errors**
   ```
   Error: SSL certificate not found
   ```
   Solution: Generate test certificates or disable SSL in tests

### Debug Mode
Run tests with debug logging:
```bash
DEBUG=true bun test testing_scripts/ --verbose
```

### Cleanup
If tests leave behind processes or files:
```bash
# Kill any remaining test processes
pkill -f "testing_scripts"

# Clean up test files
rm -rf testing_scripts/test-static/
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Functional Tests
  run: |
    bun install
    bun test testing_scripts/
```

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Use isolated configurations
3. Clean up resources after tests
4. Add appropriate timeouts
5. Document new test categories

## Test Maintenance

- Update test configurations when server config changes
- Monitor test performance and adjust timeouts
- Keep test data and fixtures up to date
- Review and update security test scenarios
