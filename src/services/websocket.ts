import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { parseAnsiToHtml } from '../utils/ansi';

export interface WebSocketMessage {
  type: 'processes' | 'processes_update' | 'status' | 'logs' | 'error' | 'pong';
  data: any;
  timestamp: string;
}

export interface WebSocketServiceInterface {
  getProcesses(): Promise<any[]>;
  getStatusData(): Promise<any>;
  getProcessLogs(processId: string, lines: number | string): Promise<string[]>;
}

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private proxyService: WebSocketServiceInterface;

  constructor(proxyService: WebSocketServiceInterface) {
    this.proxyService = proxyService;
  }

  initialize(server: any): void {
    try {
      if (!server) {
        logger.error('WebSocket initialization failed: server is null or undefined');
        return;
      }

      // Validate server object
      if (typeof server !== 'object' || !server.listen) {
        logger.error('WebSocket initialization failed: invalid server object');
        return;
      }

      // Check if server is listening
      if (!server.listening) {
        logger.error('WebSocket initialization failed: server is not listening');
        return;
      }

      this.wss = new WebSocketServer({ 
        server,
        path: '/ws'
      });

      this.wss.on('connection', (ws: WebSocket) => {
        logger.info('WebSocket client connected');
        this.clients.add(ws);

        // Send initial data
        this.sendInitialData(ws);

        ws.on('message', (message: Buffer | string) => {
          try {
            // Handle both Buffer and string message types
            const messageStr = typeof message === 'string' ? message : message.toString('utf8');
            const parsed = JSON.parse(messageStr);
            this.handleMessage(ws, parsed);
          } catch (error) {
            logger.error('Failed to parse WebSocket message', error);
            // Send error response to client
            this.sendToClient(ws, {
              type: 'error',
              data: { message: 'Invalid message format' },
              timestamp: new Date().toISOString()
            });
          }
        });

        ws.on('close', () => {
          logger.info('WebSocket client disconnected');
          this.clients.delete(ws);
        });

        ws.on('error', (error) => {
          logger.error('WebSocket error', error);
          this.clients.delete(ws);
        });
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error', error);
      });

      logger.info('WebSocket server initialized on /ws');
    } catch (error) {
      logger.error('Failed to initialize WebSocket server', error);
    }
  }

  private async sendInitialData(ws: WebSocket): Promise<void> {
    try {
      // Send initial processes data
      const processes = await this.proxyService.getProcesses();
      this.sendToClient(ws, {
        type: 'processes',
        data: processes,
        timestamp: new Date().toISOString()
      });

      // Send initial status data
      const status = await this.proxyService.getStatusData();
      this.sendToClient(ws, {
        type: 'status',
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to send initial data', error);
      // Only send error if connection is still open
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, {
          type: 'error',
          data: { message: 'Failed to load initial data' },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  private handleMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'request_logs':
        this.handleLogsRequest(ws, message.processId, message.lines);
        break;
      case 'ping':
        this.sendToClient(ws, { type: 'pong', data: {}, timestamp: new Date().toISOString() });
        break;
      default:
        logger.warn('Unknown WebSocket message type', message.type);
    }
  }

  private async handleLogsRequest(ws: WebSocket, processId: string, lines: number | 'all' = 100): Promise<void> {
    try {
      let maxLines: number;
      
      if (lines === 'all') {
        // For "all" logs, we'll use a very high number to get all available logs
        // We'll still apply a reasonable upper limit to prevent memory issues
        maxLines = 100000; // 100k lines as a reasonable upper limit for "all"
      } else {
        // For numeric values, limit to a reasonable maximum (10,000) to prevent memory issues
        maxLines = Math.min(lines || 100, 10000);
      }
      
      const logs = await this.proxyService.getProcessLogs(processId, maxLines);
      const parsedLogs = logs.map(log => parseAnsiToHtml(log));
      this.sendToClient(ws, {
        type: 'logs',
        data: { processId, logs: parsedLogs },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get logs for process', { processId, error });
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Failed to load logs', processId },
        timestamp: new Date().toISOString()
      });
    }
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const messageStr = JSON.stringify(message);
        ws.send(messageStr);
      }
    } catch (error) {
      logger.error('Failed to send message to WebSocket client', error);
    }
  }

  // Broadcast to all connected clients
  broadcast(message: WebSocketMessage): void {
    try {
      const messageStr = JSON.stringify(message);
      this.clients.forEach(client => {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
          }
        } catch (error) {
          logger.error('Failed to send broadcast message to client', error);
          // Remove problematic client
          this.clients.delete(client);
        }
      });
    } catch (error) {
      logger.error('Failed to broadcast message', error);
    }
  }

  // Broadcast process updates
  broadcastProcessUpdate(processes: any[]): void {
    this.broadcast({
      type: 'processes',
      data: processes,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast status updates
  broadcastStatusUpdate(status: any): void {
    this.broadcast({
      type: 'status',
      data: status,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast log updates
  broadcastLogUpdate(processId: string, logs: string[]): void {
    const parsedLogs = logs.map(log => parseAnsiToHtml(log));
    this.broadcast({
      type: 'logs',
      data: { processId, logs: parsedLogs },
      timestamp: new Date().toISOString()
    });
  }

  // Get number of connected clients
  getClientCount(): number {
    return this.clients.size;
  }

  // Close all connections
  close(): void {
    try {
      this.clients.forEach(client => {
        try {
          client.close();
        } catch (error) {
          logger.error('Error closing WebSocket client', error);
        }
      });
      this.clients.clear();
      
      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }
    } catch (error) {
      logger.error('Error closing WebSocket service', error);
    }
  }
} 