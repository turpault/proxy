import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../WebSocketProvider';

export const StatisticsTab: React.FC = () => {
  const { status } = useWebSocket();
  const [statistics, setStatistics] = useState<any>(null);

  useEffect(() => {
    const loadStatistics = async () => {
      try {
        const response = await fetch('/api/statistics');
        if (response.ok) {
          const data = await response.json();
          setStatistics(data);
        }
      } catch (error) {
        console.error('Failed to load statistics:', error);
      }
    };

    loadStatistics();
    const interval = setInterval(loadStatistics, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="statistics-tab">
      <div className="stats-overview">
        <div className="stat-card">
          <h4>Total Requests</h4>
          <div className="value" id="total-requests">
            {statistics?.totalRequests?.toLocaleString() || '0'}
          </div>
        </div>
        <div className="stat-card">
          <h4>Active Connections</h4>
          <div className="value" id="active-connections">
            {statistics?.activeConnections?.toString() || '0'}
          </div>
        </div>
        <div className="stat-card">
          <h4>Average Response Time</h4>
          <div className="value" id="avg-response-time">
            {statistics?.avgResponseTime ? `${statistics.avgResponseTime.toFixed(2)}ms` : '0ms'}
          </div>
        </div>
        <div className="stat-card">
          <h4>HTTP Port</h4>
          <div className="value" id="http-port">
            {status?.httpPort || 'N/A'}
          </div>
        </div>
        <div className="stat-card">
          <h4>HTTPS Port</h4>
          <div className="value" id="https-port">
            {status?.httpsPort || 'N/A'}
          </div>
        </div>
        <div className="stat-card">
          <h4>Routes</h4>
          <div className="value" id="routes-count">
            {status?.routes || '0'}
          </div>
        </div>
      </div>

      <div className="charts-container">
        <div className="chart-section">
          <h3>Request Distribution</h3>
          <div id="geo-heatmap-chart" className="chart">
            <p>Geographic heatmap chart will be rendered here</p>
          </div>
        </div>

        <div className="chart-section">
          <h3>Response Time Distribution</h3>
          <div className="chart">
            <p>Response time chart will be rendered here</p>
          </div>
        </div>
      </div>
    </div>
  );
}; 