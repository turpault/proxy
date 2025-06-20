#!/usr/bin/env bun

/**
 * Example Bun process that demonstrates process naming
 * This script can be used to test the proxy's process management with named processes
 */

// Set process title if provided as argument
const titleIndex = process.argv.indexOf('--title');
if (titleIndex !== -1 && process.argv[titleIndex + 1]) {
  const processTitle = process.argv[titleIndex + 1];

  // Set the process title
  try {
    process.title = processTitle;
    console.log(`Process title set to: ${processTitle}`);
  } catch (error) {
    console.warn(`Could not set process title: ${error.message}`);
  }

  // Remove the --title argument from argv to avoid confusion
  process.argv.splice(titleIndex, 2);
}

// Get process name from environment variables
const processName = process.env.PROCESS_NAME || process.env.PROXY_PROCESS_NAME || process.env.BUN_PROCESS_NAME || 'unnamed-bun-process';
const processId = process.env.PROXY_PROCESS_ID || 'unknown';

console.log(`Starting ${processName} (ID: ${processId})`);
console.log(`Process ID: ${process.pid}`);
console.log(`Process title: ${process.title}`);
console.log(`Command line: ${process.argv.join(' ')}`);
console.log(`Bun runtime version: ${process.versions.bun}`);

// Simple HTTP server for health checks
const server = Bun.serve({
  port: process.env.PORT || 3005,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/health' || url.pathname === '/status') {
      return new Response(JSON.stringify({
        status: 'healthy',
        process: {
          name: processName,
          id: processId,
          pid: process.pid,
          title: process.title,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          runtime: 'bun',
          bunVersion: process.versions.bun,
        },
        timestamp: new Date().toISOString(),
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (url.pathname === '/') {
      return new Response(`
        <html>
          <head><title>${processName}</title></head>
          <body>
            <h1>${processName}</h1>
            <p>Process ID: ${processId}</p>
            <p>PID: ${process.pid}</p>
            <p>Runtime: Bun</p>
            <p>Bun Version: ${process.versions.bun}</p>
            <p>Uptime: ${process.uptime().toFixed(2)} seconds</p>
            <p><a href="/health">Health Check</a></p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    } else {
      return new Response('Not Found', { status: 404 });
    }
  },
});

console.log(`${processName} listening on port ${server.port}`);
console.log(`Health check available at: http://localhost:${server.port}/health`);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log(`${processName} received SIGTERM, shutting down gracefully...`);
  server.stop();
  console.log(`${processName} server closed`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`${processName} received SIGINT, shutting down...`);
  server.stop();
  console.log(`${processName} server closed`);
  process.exit(0);
});

// Log periodic status
setInterval(() => {
  console.log(`${processName} status: uptime=${process.uptime().toFixed(2)}s, memory=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
}, 30000);

console.log(`${processName} started successfully`); 