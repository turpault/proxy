import React from 'react';
import { useWebSocket } from './WebSocketProvider';
import { useNotifications } from './NotificationProvider';
import { useAuth } from './AuthProvider';
import { formatLocalTime } from '../utils';

export const Header: React.FC = () => {
  const { isConnected, status } = useWebSocket();
  const { showNotification } = useNotifications();
  const { logout } = useAuth();

  const handleRefresh = () => {
    showNotification('Refreshing data...', 'info');
    // Trigger a refresh by sending a ping message
    // This will be handled by the WebSocket provider
  };

  const handleLogout = () => {
    logout();
    showNotification('Logged out successfully', 'success');
  };

  return (
    <div className="header">
      <div className="header-content">
        <div className="header-left">
          <h1>Proxy Server Management</h1>
          <p>Monitor and manage your proxy server processes, certificates, and configuration</p>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>
        <div className="header-right">
          <div className="last-updated-info">
            <div className="last-updated-label">Last Updated</div>
            <div className="last-updated-time" id="last-updated-time">
              {status ? formatLocalTime(status.timestamp) : 'N/A'}
            </div>
          </div>
          <button className="refresh-btn" onClick={handleRefresh}>
            Refresh
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}; 