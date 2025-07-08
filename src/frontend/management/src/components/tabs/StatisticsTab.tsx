import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../WebSocketProvider';
import { StatisticsSummary, DetailedStatistics, RouteStatistics } from '../../types';

export const StatisticsTab: React.FC = () => {
  const { status } = useWebSocket();
  const [statistics, setStatistics] = useState<StatisticsSummary | null>(null);
  const [detailedStatistics, setDetailedStatistics] = useState<DetailedStatistics | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('24h');

  useEffect(() => {
    const loadStatistics = async () => {
      try {
        const response = await fetch('/api/statistics');
        if (response.ok) {
          const data = await response.json();
          setStatistics(data.data);
        }
      } catch (error) {
        console.error('Failed to load statistics:', error);
      }
    };

    const loadDetailedStatistics = async () => {
      try {
        const response = await fetch(`/api/statistics/detailed?period=${selectedPeriod}`);
        if (response.ok) {
          const data = await response.json();
          setDetailedStatistics(data.data);
        }
      } catch (error) {
        console.error('Failed to load detailed statistics:', error);
      }
    };

    loadStatistics();
    loadDetailedStatistics();

    const interval = setInterval(() => {
      loadStatistics();
      loadDetailedStatistics();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [selectedPeriod]);

  const formatResponseTime = (time: number): string => {
    if (time < 1000) {
      return `${time.toFixed(2)}ms`;
    } else {
      return `${(time / 1000).toFixed(2)}s`;
    }
  };

  const getRouteDisplayName = (route: RouteStatistics): string => {
    if (route.name) return route.name;
    if (route.domain === 'Unmatched') return 'Unmatched Requests';
    return `${route.domain} → ${route.target}`;
  };

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
            {statistics?.uniqueIPs?.toString() || '0'}
          </div>
        </div>
        <div className="stat-card">
          <h4>Average Response Time</h4>
          <div className="value" id="avg-response-time">
            {detailedStatistics?.avgResponseTime ? formatResponseTime(detailedStatistics.avgResponseTime) : '0ms'}
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
            {detailedStatistics?.uniqueRoutes || status?.routes || '0'}
          </div>
        </div>
      </div>

      <div className="period-selector">
        <h3>Statistics Period</h3>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="period-select"
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      <div className="routes-statistics">
        <h3>Route Statistics</h3>
        <div className="routes-grid">
          {detailedStatistics?.routes.map((route, index) => (
            <div key={`${route.domain}-${route.target}-${index}`} className="route-card">
              <div className="route-header">
                <h4>{getRouteDisplayName(route)}</h4>
                <span className="route-type">{route.requestType || 'proxy'}</span>
              </div>
              <div className="route-stats">
                <div className="stat-row">
                  <span className="label">Requests:</span>
                  <span className="value">{route.requests.toLocaleString()}</span>
                </div>
                <div className="stat-row">
                  <span className="label">Avg Response:</span>
                  <span className="value">{formatResponseTime(route.avgResponseTime)}</span>
                </div>
                <div className="stat-row">
                  <span className="label">Unique IPs:</span>
                  <span className="value">{route.uniqueIPs}</span>
                </div>
                <div className="stat-row">
                  <span className="label">Methods:</span>
                  <span className="value">{route.methods.join(', ')}</span>
                </div>
              </div>
              {route.topCountries && route.topCountries.length > 0 && (
                <div className="route-countries">
                  <h5>Top Countries</h5>
                  <div className="countries-list">
                    {route.topCountries.slice(0, 3).map((country, idx) => (
                      <div key={idx} className="country-item">
                        <span className="country-name">{country.country}</span>
                        <span className="country-count">{country.count}</span>
                        <span className="country-percentage">({country.percentage.toFixed(1)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {route.uniquePaths && route.uniquePaths.length > 0 && (
                <div className="route-paths">
                  <h5>Recent Paths ({route.uniquePaths.length})</h5>
                  <div className="paths-list">
                    {route.uniquePaths.slice(-5).map((path, idx) => (
                      <div key={idx} className="path-item">
                        <code>{path}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
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