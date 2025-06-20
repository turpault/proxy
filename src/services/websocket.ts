import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { parseAnsiToHtml } from '../utils/ansi';

export interface WebSocketMessage {
  type: 'processes' | 'status' | 'logs' | 'error' | 'pong';
  data: any;
  timestamp: string;
}

export interface WebSocketServiceInterface {
  getProcesses(): Promise<any[]>;
  getStatusData(): Promise<any>;
  getProcessLogs(processId: string, lines: number): Promise<string[]>;
}

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private proxyService: WebSocketServiceInterface;

  constructor(proxyService: WebSocketServiceInterface) {
    this.proxyService = proxyService;
  }

  initialize(server: any): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/management'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('WebSocket client connected');
      this.clients.add(ws);

      // Send initial data
      this.sendInitialData(ws);

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message);
          this.handleMessage(ws, parsed);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', error);
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

    logger.info('WebSocket server initialized on /ws/management');
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
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Failed to load initial data' },
        timestamp: new Date().toISOString()
      });
    }
  }

  private handleMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'request_logs':
        this.handleLogsRequest(ws, message.processId);
        break;
      case 'ping':
        this.sendToClient(ws, { type: 'pong', data: {}, timestamp: new Date().toISOString() });
        break;
      default:
        logger.warn('Unknown WebSocket message type', message.type);
    }
  }

  private async handleLogsRequest(ws: WebSocket, processId: string): Promise<void> {
    try {
      const logs = await this.proxyService.getProcessLogs(processId, 50);
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
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Broadcast to all connected clients
  broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
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
    this.clients.forEach(client => {
      client.close();
    });
    this.clients.clear();
    
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
} 