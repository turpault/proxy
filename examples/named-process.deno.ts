#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Example Deno process that demonstrates process naming
 * This script can be used to test the proxy's process management with named processes
 */

// Set process title if provided as argument
const titleIndex = Deno.args.indexOf('--title');
if (titleIndex !== -1 && Deno.args[titleIndex + 1]) {
  const processTitle = Deno.args[titleIndex + 1];
  
  // Set the process title
  try {
    // Deno doesn't have process.title, but we can log it
    console.log(`Process title would be set to: ${processTitle}`);
  } catch (error) {
    console.warn(`Could not set process title: ${error.message}`);
  }
  
  // Remove the --title argument from args to avoid confusion
  Deno.args.splice(titleIndex, 2);
}

// Get process name from environment variables
const processName = Deno.env.get('PROCESS_NAME') || 
                   Deno.env.get('PROXY_PROCESS_NAME') || 
                   Deno.env.get('DENO_PROCESS_NAME') || 
                   'unnamed-deno-process';
const processId = Deno.env.get('PROXY_PROCESS_ID') || 'unknown';

console.log(`Starting ${processName} (ID: ${processId})`);
console.log(`Process ID: ${Deno.pid}`);
console.log(`Command line: ${Deno.execPath()} ${Deno.args.join(' ')}`);
console.log(`Deno version: ${Deno.version.deno}`);

// Simple HTTP server for health checks
const server = Deno.listen({ port: parseInt(Deno.env.get('PORT') || '3006') });

console.log(`${processName} listening on port ${parseInt(Deno.env.get('PORT') || '3006')}`);
console.log(`Health check available at: http://localhost:${Deno.env.get('PORT') || '3006'}/health`);

// Handle requests
for await (const conn of server) {
  serveHttp(conn);
}

async function serveHttp(conn: Deno.Conn) {
  const httpConn = Deno.serveHttp(conn);
  
  for await (const requestEvent of httpConn) {
    const url = new URL(requestEvent.request.url);
    
    if (url.pathname === '/health' || url.pathname === '/status') {
      const response = new Response(JSON.stringify({
        status: 'healthy',
        process: {
          name: processName,
          id: processId,
          pid: Deno.pid,
          uptime: performance.now() / 1000, // Deno doesn't have process.uptime()
          runtime: 'deno',
          denoVersion: Deno.version.deno,
        },
        timestamp: new Date().toISOString(),
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
      await requestEvent.respondWith(response);
    } else if (url.pathname === '/') {
      const response = new Response(`
        <html>
          <head><title>${processName}</title></head>
          <body>
            <h1>${processName}</h1>
            <p>Process ID: ${processId}</p>
            <p>PID: ${Deno.pid}</p>
            <p>Runtime: Deno</p>
            <p>Deno Version: ${Deno.version.deno}</p>
            <p><a href="/health">Health Check</a></p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
      
      await requestEvent.respondWith(response);
    } else {
      const response = new Response('Not Found', { status: 404 });
      await requestEvent.respondWith(response);
    }
  }
}

// Handle graceful shutdown
Deno.addSignalListener('SIGTERM', () => {
  console.log(`${processName} received SIGTERM, shutting down gracefully...`);
  server.close();
  console.log(`${processName} server closed`);
  Deno.exit(0);
});

Deno.addSignalListener('SIGINT', () => {
  console.log(`${processName} received SIGINT, shutting down...`);
  server.close();
  console.log(`${processName} server closed`);
  Deno.exit(0);
});

// Log periodic status
setInterval(() => {
  console.log(`${processName} status: uptime=${(performance.now() / 1000).toFixed(2)}s`);
}, 30000);

console.log(`${processName} started successfully`); 