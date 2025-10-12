import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  ConnectivityTestResult, 
  ConnectivityHistoryEntry, 
  ConnectivityStats 
} from '../../types';
import { API_BASE } from '../../utils/api-client';

export const ConnectivityTab: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [current, setCurrent] = useState<ConnectivityTestResult | null>(null);
  const [history, setHistory] = useState<ConnectivityHistoryEntry[]>([]);
  const [stats, setStats] = useState<ConnectivityStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Get period from URL params, default to '24h'
  const selectedPeriod = searchParams.get('period') || '24h';

  useEffect(() => {
    loadConnectivityData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadConnectivityData();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedPeriod]);

  const loadConnectivityData = async () => {
    try {
      // Load current status
      const currentResponse = await fetch(`${API_BASE}/api/connectivity/current`);
      if (currentResponse.ok) {
        const data = await currentResponse.json();
        if (data.success && data.data) {
          setCurrent(data.data);
        }
      }

      // Load history
      const historyResponse = await fetch(`${API_BASE}/api/connectivity/history?period=${selectedPeriod}`);
      if (historyResponse.ok) {
        const data = await historyResponse.json();
        if (data.success && data.data) {
          setHistory(data.data);
        }
      }

      // Load statistics
      const statsResponse = await fetch(`${API_BASE}/api/connectivity/stats?period=${selectedPeriod}`);
      if (statsResponse.ok) {
        const data = await statsResponse.json();
        if (data.success && data.data) {
          setStats(data.data);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load connectivity data:', error);
      setLoading(false);
    }
  };

  const formatTime = (ms: number): string => {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusColor = (success: boolean): string => {
    return success ? '#4caf50' : '#f44336';
  };

  const getStatusText = (success: boolean): string => {
    return success ? 'Healthy' : 'Degraded';
  };

  const getMetricColor = (value: number, threshold: { warning: number; critical: number }): string => {
    if (value > threshold.critical) return '#f44336'; // red
    if (value > threshold.warning) return '#ff9800'; // orange
    return '#4caf50'; // green
  };

  if (loading) {
    return (
      <div className="connectivity-tab">
        <div className="loading">Loading connectivity data...</div>
      </div>
    );
  }

  return (
    <div className="connectivity-tab">
      <div className="period-selector">
        <h3>Monitoring Period</h3>
        <select
          value={selectedPeriod}
          onChange={(e) => setSearchParams({ period: e.target.value })}
          className="period-select"
        >
          <option value="1h">Last Hour</option>
          <option value="6h">Last 6 Hours</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      {/* Current Status */}
      {current && (
        <div className="current-status">
          <h3>Current Status</h3>
          <div className="status-card">
            <div className="status-indicator" style={{ backgroundColor: getStatusColor(current.success) }}>
              <span className="status-text">{getStatusText(current.success)}</span>
            </div>
            <div className="status-details">
              <div className="status-detail">
                <span className="label">Endpoint:</span>
                <span className="value">{current.endpoint}</span>
              </div>
              <div className="status-detail">
                <span className="label">Last Check:</span>
                <span className="value">{new Date(current.timestamp).toLocaleTimeString()}</span>
              </div>
              {current.errorMessage && (
                <div className="status-detail error">
                  <span className="label">Error:</span>
                  <span className="value">{current.errorMessage}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Statistics Summary */}
      {stats && (
        <div className="stats-overview">
          <div className="stat-card">
            <h4>Average Connection Time</h4>
            <div className="value" style={{ color: getMetricColor(stats.avgConnectionTime, { warning: 100, critical: 500 }) }}>
              {formatTime(stats.avgConnectionTime)}
            </div>
            <div className="range">
              Min: {formatTime(stats.minConnectionTime)} | Max: {formatTime(stats.maxConnectionTime)}
            </div>
          </div>
          <div className="stat-card">
            <h4>Average Response Time</h4>
            <div className="value" style={{ color: getMetricColor(stats.avgResponseTime, { warning: 200, critical: 1000 }) }}>
              {formatTime(stats.avgResponseTime)}
            </div>
            <div className="range">
              Min: {formatTime(stats.minResponseTime)} | Max: {formatTime(stats.maxResponseTime)}
            </div>
          </div>
          <div className="stat-card">
            <h4>Error Rate</h4>
            <div className="value" style={{ color: getMetricColor(stats.errorRate, { warning: 5, critical: 10 }) }}>
              {stats.errorRate.toFixed(2)}%
            </div>
            <div className="range">
              {stats.successfulTests} / {stats.totalTests} successful
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="charts-container">
        {/* Connection Time Chart */}
        <div className="chart-card">
          <h3>Connection Time</h3>
          <div className="chart">
            {history.length > 0 ? (
              <SimpleLineChart
                data={history.map(h => ({ x: h.timestamp, y: h.connectionTime }))}
                color="#2196f3"
                label="Connection Time (ms)"
              />
            ) : (
              <div className="no-data">No data available</div>
            )}
          </div>
        </div>

        {/* Response Time Chart */}
        <div className="chart-card">
          <h3>Response Time</h3>
          <div className="chart">
            {history.length > 0 ? (
              <SimpleLineChart
                data={history.map(h => ({ x: h.timestamp, y: h.responseTime }))}
                color="#4caf50"
                label="Response Time (ms)"
              />
            ) : (
              <div className="no-data">No data available</div>
            )}
          </div>
        </div>

        {/* Error Rate Chart */}
        <div className="chart-card">
          <h3>Success Rate</h3>
          <div className="chart">
            {history.length > 0 ? (
              <SimpleBarChart
                data={history}
                color="#ff9800"
              />
            ) : (
              <div className="no-data">No data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Simple Line Chart Component
interface LineChartProps {
  data: Array<{ x: string; y: number }>;
  color: string;
  label: string;
}

const SimpleLineChart: React.FC<LineChartProps> = ({ data, color, label }) => {
  if (data.length === 0) return <div className="no-data">No data</div>;

  const maxValue = Math.max(...data.map(d => d.y));
  const minValue = Math.min(...data.map(d => d.y));
  const range = maxValue - minValue || 1;

  return (
    <div className="simple-line-chart">
      <div className="chart-y-axis">
        <span className="y-label">{maxValue.toFixed(0)}</span>
        <span className="y-label">{((maxValue + minValue) / 2).toFixed(0)}</span>
        <span className="y-label">{minValue.toFixed(0)}</span>
      </div>
      <div className="chart-content">
        <svg width="100%" height="200" preserveAspectRatio="none">
          <polyline
            points={data.map((d, i) => {
              const x = (i / (data.length - 1)) * 100;
              const y = 200 - ((d.y - minValue) / range) * 180;
              return `${x}%,${y}`;
            }).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 200 - ((d.y - minValue) / range) * 180;
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={y}
                r="3"
                fill={color}
              />
            );
          })}
        </svg>
        <div className="chart-x-axis">
          <span className="x-label">{new Date(data[0].x).toLocaleTimeString()}</span>
          <span className="x-label">{new Date(data[Math.floor(data.length / 2)].x).toLocaleTimeString()}</span>
          <span className="x-label">{new Date(data[data.length - 1].x).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

// Simple Bar Chart for Success/Failure
interface BarChartProps {
  data: ConnectivityHistoryEntry[];
  color: string;
}

const SimpleBarChart: React.FC<BarChartProps> = ({ data, color }) => {
  if (data.length === 0) return <div className="no-data">No data</div>;

  // Group data into buckets (e.g., every N entries)
  const bucketSize = Math.max(1, Math.floor(data.length / 50));
  const buckets = [];
  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize);
    const successRate = (bucket.filter(d => d.success).length / bucket.length) * 100;
    buckets.push({
      timestamp: bucket[0].timestamp,
      successRate
    });
  }

  return (
    <div className="simple-bar-chart">
      <div className="chart-y-axis">
        <span className="y-label">100%</span>
        <span className="y-label">50%</span>
        <span className="y-label">0%</span>
      </div>
      <div className="chart-content">
        <div className="bars">
          {buckets.map((bucket, i) => (
            <div
              key={i}
              className="bar"
              style={{
                height: `${bucket.successRate}%`,
                backgroundColor: bucket.successRate < 90 ? '#f44336' : bucket.successRate < 98 ? '#ff9800' : color
              }}
              title={`${bucket.successRate.toFixed(1)}% success at ${new Date(bucket.timestamp).toLocaleString()}`}
            />
          ))}
        </div>
        <div className="chart-x-axis">
          <span className="x-label">{new Date(buckets[0].timestamp).toLocaleTimeString()}</span>
          <span className="x-label">{new Date(buckets[buckets.length - 1].timestamp).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

