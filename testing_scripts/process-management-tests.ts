import { test, describe, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { BunProxyServer } from '../src/server';
import { ProcessManager } from '../src/services/process-manager';

const PROCESS_TEST_CONFIG = {
  server: {
    port: 8445,
    host: 'localhost',
    ssl: {
      enabled: false // Disable SSL for process tests
    }
  },
  routes: []
};

const PROCESS_CONFIG = {
  processes: {
    'echo-process': {
      name: 'Echo Process',
      command: 'echo',
      args: ['Hello from echo process'],
      cwd: './testing_scripts',
      env: { PROCESS_ENV: 'test_value' },
      restartOnExit: false,
      healthCheck: {
        enabled: false
      }
    },
    'sleep-process': {
      name: 'Sleep Process',
      command: 'sleep',
      args: ['5'],
      cwd: './testing_scripts',
      restartOnExit: false,
      healthCheck: {
        enabled: false
      }
    },
    'failing-process': {
      name: 'Failing Process',
      command: 'nonexistent-command',
      args: [],
      cwd: './testing_scripts',
      restartOnExit: false,
      healthCheck: {
        enabled: false
      }
    },
    'restart-process': {
      name: 'Restart Process',
      command: 'echo',
      args: ['Restart test'],
      cwd: './testing_scripts',
      restartOnExit: true,
      restartDelay: 1000,
      maxRestarts: 3,
      healthCheck: {
        enabled: false
      }
    },
    'health-check-process': {
      name: 'Health Check Process',
      command: 'node',
      args: ['-e', 'console.log("Health check process started"); process.exit(0);'],
      cwd: './testing_scripts',
      restartOnExit: false,
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: 1000,
        timeout: 5000,
        retries: 3
      }
    }
  }
};

let server: BunProxyServer;
let processManager: ProcessManager;

describe('Process Management Tests', () => {
  beforeAll(async () => {
    // Create test directory if it doesn't exist
    const fs = await import('fs-extra');
    await fs.ensureDir('./testing_scripts');
  });

  beforeEach(async () => {
    server = new BunProxyServer(PROCESS_TEST_CONFIG, { processes: PROCESS_CONFIG });
    await server.initialize();
    
    // Get process manager instance
    processManager = (server as any).processManager;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Process Lifecycle', () => {
    test('should start a process successfully', async () => {
      await processManager.startProcess('echo-process');
      
      const processes = await server.getProcesses();
      const echoProcess = processes.find((p: any) => p.name === 'Echo Process');
      
      expect(echoProcess).toBeDefined();
      expect(echoProcess?.status).toBe('running');
    });

    test('should stop a running process', async () => {
      await processManager.startProcess('sleep-process');
      
      // Wait a bit for process to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await processManager.stopProcess('sleep-process');
      
      const processes = await server.getProcesses();
      const sleepProcess = processes.find((p: any) => p.name === 'Sleep Process');
      
      expect(sleepProcess?.status).toBe('stopped');
    });

    test('should handle process that fails to start', async () => {
      await processManager.startProcess('failing-process');
      
      const processes = await server.getProcesses();
      const failingProcess = processes.find((p: any) => p.name === 'Failing Process');
      
      expect(failingProcess).toBeDefined();
      expect(failingProcess?.status).toBe('error');
    });

    test('should restart process on exit when configured', async () => {
      await processManager.startProcess('restart-process');
      
      // Wait for process to complete and restart
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const processes = await server.getProcesses();
      const restartProcess = processes.find((p: any) => p.name === 'Restart Process');
      
      expect(restartProcess).toBeDefined();
      // Process should have restarted at least once
      expect(restartProcess?.restartCount).toBeGreaterThan(0);
    });

    test('should respect max restart limit', async () => {
      await processManager.startProcess('restart-process');
      
      // Wait for multiple restart cycles
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const processes = await server.getProcesses();
      const restartProcess = processes.find((p: any) => p.name === 'Restart Process');
      
      expect(restartProcess?.restartCount).toBeLessThanOrEqual(3);
    });
  });

  describe('Process Configuration', () => {
    test('should load process configuration correctly', async () => {
      const processes = await server.getProcesses();
      
      expect(processes.length).toBeGreaterThan(0);
      
      const echoProcess = processes.find((p: any) => p.name === 'Echo Process');
      expect(echoProcess?.command).toBe('echo');
      expect(echoProcess?.args).toEqual(['Hello from echo process']);
      expect(echoProcess?.env?.PROCESS_ENV).toBe('test_value');
    });

    test('should update process configuration', async () => {
      const newConfig = {
        ...PROCESS_CONFIG,
        processes: {
          ...PROCESS_CONFIG.processes,
          'echo-process': {
            ...PROCESS_CONFIG.processes['echo-process'],
            args: ['Updated echo message']
          }
        }
      };
      
      await server.handleProcessConfigUpdate(newConfig);
      
      const processes = await server.getProcesses();
      const echoProcess = processes.find((p: any) => p.name === 'Echo Process');
      
      expect(echoProcess?.args).toEqual(['Updated echo message']);
    });

    test('should handle environment variable validation', async () => {
      const configWithEnvValidation = {
        ...PROCESS_CONFIG,
        processes: {
          ...PROCESS_CONFIG.processes,
          'env-test-process': {
            name: 'Environment Test Process',
            command: 'echo',
            args: ['$REQUIRED_ENV'],
            env: { REQUIRED_ENV: 'test_value' },
            envValidation: {
              required: ['REQUIRED_ENV'],
              validateOnStart: true,
              failOnMissing: true
            },
            restartOnExit: false,
            healthCheck: { enabled: false }
          }
        }
      };
      
      await server.handleProcessConfigUpdate(configWithEnvValidation);
      
      const processes = await server.getProcesses();
      const envTestProcess = processes.find((p: any) => p.name === 'Environment Test Process');
      
      expect(envTestProcess).toBeDefined();
    });
  });

  describe('Process Logs', () => {
    test('should capture process output', async () => {
      await processManager.startProcess('echo-process');
      
      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const logs = await server.getProcessLogs('echo-process', 10);
      
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((log: string) => log.includes('Hello from echo process'))).toBe(true);
    });

    test('should handle log retrieval for non-existent process', async () => {
      const logs = await server.getProcessLogs('non-existent-process', 10);
      
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(0);
    });

    test('should limit log lines', async () => {
      await processManager.startProcess('echo-process');
      
      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const logs = await server.getProcessLogs('echo-process', 5);
      
      expect(logs.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Process Status and Monitoring', () => {
    test('should provide process status information', async () => {
      await processManager.startProcess('sleep-process');
      
      const processes = await server.getProcesses();
      const sleepProcess = processes.find((p: any) => p.name === 'Sleep Process');
      
      expect(sleepProcess).toBeDefined();
      expect(sleepProcess?.pid).toBeDefined();
      expect(sleepProcess?.startTime).toBeDefined();
      expect(sleepProcess?.status).toBe('running');
    });

    test('should track process uptime', async () => {
      await processManager.startProcess('sleep-process');
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const processes = await server.getProcesses();
      const sleepProcess = processes.find((p: any) => p.name === 'Sleep Process');
      
      expect(sleepProcess?.uptime).toBeGreaterThan(0);
    });

    test('should handle process exit events', async () => {
      await processManager.startProcess('echo-process');
      
      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const processes = await server.getProcesses();
      const echoProcess = processes.find((p: any) => p.name === 'Echo Process');
      
      expect(echoProcess?.status).toBe('stopped');
      expect(echoProcess?.exitCode).toBe(0);
    });
  });

  describe('Process Scheduling', () => {
    test('should handle scheduled processes', async () => {
      const scheduledConfig = {
        ...PROCESS_CONFIG,
        processes: {
          ...PROCESS_CONFIG.processes,
          'scheduled-process': {
            name: 'Scheduled Process',
            command: 'echo',
            args: ['Scheduled execution'],
            schedule: {
              enabled: true,
              cron: '* * * * *', // Every minute
              timezone: 'UTC',
              maxDuration: 30000, // 30 seconds
              autoStop: true
            },
            restartOnExit: false,
            healthCheck: { enabled: false }
          }
        }
      };
      
      await server.handleProcessConfigUpdate(scheduledConfig);
      
      const processes = await server.getProcesses();
      const scheduledProcess = processes.find((p: any) => p.name === 'Scheduled Process');
      
      expect(scheduledProcess).toBeDefined();
      expect(scheduledProcess?.schedule?.enabled).toBe(true);
    });
  });

  describe('Process Health Checks', () => {
    test('should perform health checks on configured processes', async () => {
      await processManager.startProcess('health-check-process');
      
      // Wait for health check to run
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const processes = await server.getProcesses();
      const healthProcess = processes.find((p: any) => p.name === 'Health Check Process');
      
      expect(healthProcess?.healthCheck?.lastCheck).toBeDefined();
    });
  });

  describe('Process Management API', () => {
    test('should list all processes', async () => {
      const processes = await server.getProcesses();
      
      expect(Array.isArray(processes)).toBe(true);
      expect(processes.length).toBeGreaterThan(0);
      
      // Check that all configured processes are present
      const processNames = processes.map((p: any) => p.name);
      expect(processNames).toContain('Echo Process');
      expect(processNames).toContain('Sleep Process');
    });

    test('should get process by ID', async () => {
      const processes = await server.getProcesses();
      const echoProcess = processes.find((p: any) => p.name === 'Echo Process');
      
      expect(echoProcess?.id).toBeDefined();
      expect(echoProcess?.name).toBe('Echo Process');
    });

    test('should handle bulk process operations', async () => {
      // Start multiple processes
      await processManager.startProcess('echo-process');
      await processManager.startProcess('sleep-process');
      
      const processes = await server.getProcesses();
      const runningProcesses = processes.filter((p: any) => p.status === 'running');
      
      expect(runningProcesses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle process start failures gracefully', async () => {
      await processManager.startProcess('failing-process');
      
      const processes = await server.getProcesses();
      const failingProcess = processes.find((p: any) => p.name === 'Failing Process');
      
      expect(failingProcess?.status).toBe('error');
      expect(failingProcess?.error).toBeDefined();
    });

    test('should handle process stop failures', async () => {
      // Start a process that might be difficult to stop
      await processManager.startProcess('sleep-process');
      
      // Try to stop it multiple times
      await processManager.stopProcess('sleep-process');
      await processManager.stopProcess('sleep-process');
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    test('should handle configuration errors', async () => {
      const invalidConfig = {
        ...PROCESS_CONFIG,
        processes: {
          ...PROCESS_CONFIG.processes,
          'invalid-process': {
            name: 'Invalid Process',
            // Missing required command
            args: [],
            restartOnExit: false,
            healthCheck: { enabled: false }
          }
        }
      };
      
      await server.handleProcessConfigUpdate(invalidConfig);
      
      const processes = await server.getProcesses();
      const invalidProcess = processes.find((p: any) => p.name === 'Invalid Process');
      
      expect(invalidProcess?.status).toBe('error');
    });
  });
});
