import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { WebSocketMessage, Process, StatusData, LogLine } from '../types';

interface WebSocketContextType {
  isConnected: boolean;
  processes: Process[];
  status: StatusData | null;
  processLogs: { [key: string]: LogLine[] };
  sendMessage: (message: any) => void;
  requestLogs: (processId: string, lines: number | string) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [processLogs, setProcessLogs] = useState<{ [key: string]: LogLine[] }>({});

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    websocket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      // Attempt to reconnect after 2 seconds
      setTimeout(connectWebSocket, 2000);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);
  };

  const handleWebSocketMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'processes':
        setProcesses(Array.isArray(message.data) ? message.data : []);
        break;
      case 'status':
        setStatus(message.data || null);
        break;
      case 'logs':
        if (message.data && message.data.processId) {
          setProcessLogs(prev => ({
            ...prev,
            [message.data.processId]: message.data.logs || []
          }));
        }
        break;
      case 'error':
        console.error('WebSocket error:', message.data);
        break;
      case 'pong':
        // Handle ping/pong for connection health
        break;
      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  };

  const sendMessage = (message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const requestLogs = (processId: string, lines: number | string) => {
    sendMessage({
      type: 'request_logs',
      processId: processId,
      lines: lines
    });
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const contextValue: WebSocketContextType = {
    isConnected,
    processes,
    status,
    processLogs,
    sendMessage,
    requestLogs
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}; 