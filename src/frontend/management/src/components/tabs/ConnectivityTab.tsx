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

  // Helper function to calculate bucket count based on period
  const getBucketCount = (period: string): number => {
    switch (period) {
      case '30d':
        return 30; // Daily for 30 days
      case '7d':
        return 7 * 24; // Hourly for 7 days (168 buckets)
      case '24h':
        return 24 * 6; // 10 minutes for 24 hours (144 buckets)
      case '6h':
        return 6 * 12; // 5 minutes for 6 hours (72 buckets)
      case '1h':
        return 60 * 3; // 20 seconds for 1 hour (180 buckets)
      default:
        return 0; // No bucketing
    }
  };

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

      // Load history - unbucketed for line charts
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
                period={selectedPeriod}
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
                period={selectedPeriod}
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
                period={selectedPeriod}
                bucketCount={getBucketCount(selectedPeriod)}
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

// Helper function to format X-axis labels based on period
const formatXAxisLabel = (timestamp: string, period: string): string => {
  const date = new Date(timestamp);
  // For periods >= 7 days, show dates; for shorter periods, show times
  if (period === '7d' || period === '30d') {
    return date.toLocaleDateString();
  } else {
    return date.toLocaleTimeString();
  }
};

// Helper function to get start date for a given period
const getStartDateForPeriod = (period: string): Date => {
  const now = new Date();
  switch (period) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '6h':
      return new Date(now.getTime() - 6 * 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
  }
};

// Simple Line Chart Component
interface LineChartProps {
  data: Array<{ x: string; y: number }>;
  color: string;
  label: string;
  period: string;
}

const SimpleLineChart: React.FC<LineChartProps> = ({ data, color, label, period }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  if (data.length === 0) return <div className="no-data">No data</div>;

  const maxValue = Math.max(...data.map(d => d.y));
  const minValue = Math.min(...data.map(d => d.y));
  const range = maxValue - minValue || 1;

  // Calculate period range for positioning
  const periodStart = getStartDateForPeriod(period).getTime();
  const periodEnd = new Date().getTime();
  const periodRange = periodEnd - periodStart || 1;

  // Helper function to calculate X position based on timestamp
  const getXPosition = (timestamp: string): number => {
    const timestampMs = new Date(timestamp).getTime();
    const relativePosition = (timestampMs - periodStart) / periodRange;
    // Clamp to 0-100% to handle out-of-range timestamps
    return Math.max(0, Math.min(100, relativePosition * 100));
  };

  const handleMouseEnter = (index: number) => {
    setHoveredIndex(index);
    const xPos = getXPosition(data[index].x);
    setTooltipPosition({
      x: xPos,
      y: 200 - ((data[index].y - minValue) / range) * 180
    });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setTooltipPosition(null);
  };

  return (
    <div className="simple-line-chart">
      <div className="chart-y-axis">
        <span className="y-label">{maxValue.toFixed(0)}</span>
        <span className="y-label">{((maxValue + minValue) / 2).toFixed(0)}</span>
        <span className="y-label">{minValue.toFixed(0)}</span>
      </div>
      <div className="chart-content" style={{ position: 'relative' }}>
        <svg width="100%" height="200" preserveAspectRatio="none">
          <polyline
            points={data.map((d) => {
              const x = getXPosition(d.x);
              const y = 200 - ((d.y - minValue) / range) * 180;
              return `${x}%,${y}`;
            }).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
          {data.map((d, i) => {
            const x = getXPosition(d.x);
            const y = 200 - ((d.y - minValue) / range) * 180;
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={y}
                r={hoveredIndex === i ? "5" : "3"}
                fill={color}
                onMouseEnter={() => handleMouseEnter(i)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'pointer', transition: 'r 0.2s' }}
              />
            );
          })}
          {hoveredIndex !== null && (
            <line
              x1={`${getXPosition(data[hoveredIndex].x)}%`}
              y1="0"
              x2={`${getXPosition(data[hoveredIndex].x)}%`}
              y2="200"
              stroke="#999"
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.5"
            />
          )}
        </svg>
        {hoveredIndex !== null && tooltipPosition !== null && (
          <div 
            className="chart-tooltip"
            style={{
              position: 'absolute',
              left: `${tooltipPosition.x}%`,
              top: `${tooltipPosition.y - 50}px`,
              transform: 'translateX(-50%)',
              zIndex: 10
            }}
          >
            <div className="tooltip-label">{formatXAxisLabel(data[hoveredIndex].x, period)}</div>
            <div className="tooltip-value">{label}: {data[hoveredIndex].y.toFixed(0)}ms</div>
          </div>
        )}
        <div className="chart-x-axis">
          <span className="x-label">{formatXAxisLabel(getStartDateForPeriod(period).toISOString(), period)}</span>
          <span className="x-label">{formatXAxisLabel(new Date((getStartDateForPeriod(period).getTime() + new Date().getTime()) / 2).toISOString(), period)}</span>
          <span className="x-label">{formatXAxisLabel(new Date().toISOString(), period)}</span>
        </div>
      </div>
    </div>
  );
};

// Simple Bar Chart for Success/Failure
interface BarChartProps {
  data: ConnectivityHistoryEntry[];
  color: string;
  period: string;
  bucketCount: number;
}

const SimpleBarChart: React.FC<BarChartProps> = ({ data, color, period, bucketCount }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [bucketedData, setBucketedData] = useState<Array<{ timestamp: string; successRate: number; count: number }>>([]);

  useEffect(() => {
    // Load bucketed data from backend
    const loadBucketedData = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/connectivity/history?period=${period}&buckets=${bucketCount}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            // Map bucketed data to our format
            const buckets = result.data
              .filter((entry: ConnectivityHistoryEntry) => entry.successRate !== undefined && entry.count !== undefined)
              .map((entry: ConnectivityHistoryEntry) => ({
                timestamp: entry.timestamp,
                successRate: entry.successRate!,
                count: entry.count!
              }));
            setBucketedData(buckets);
          } else {
            setBucketedData([]);
          }
        } else {
          setBucketedData([]);
        }
      } catch (error) {
        console.error('Failed to load bucketed data:', error);
        setBucketedData([]);
      }
    };

    if (bucketCount > 0) {
      loadBucketedData();
    } else {
      setBucketedData([]);
    }
  }, [period, bucketCount]);

  if (bucketCount === 0) {
    return <div className="no-data">Bucketing not configured</div>;
  }

  if (bucketedData.length === 0) {
    return <div className="no-data">No data available</div>;
  }

  // Calculate period range for positioning
  const periodStart = getStartDateForPeriod(period).getTime();
  const periodEnd = new Date().getTime();
  const periodRange = periodEnd - periodStart || 1;

  // Helper function to calculate X position based on timestamp
  const getXPosition = (timestamp: string): number => {
    const timestampMs = new Date(timestamp).getTime();
    const relativePosition = (timestampMs - periodStart) / periodRange;
    // Clamp to 0-100% to handle out-of-range timestamps
    return Math.max(0, Math.min(100, relativePosition * 100));
  };

  const buckets = bucketedData;

  // Fixed width for bars (in percentage)
  const fixedBarWidth = 0.8; // Fixed width percentage
  
  // Calculate positions for each bucket based on timestamp
  // Bars are centered on their timestamp position
  const bucketPositions = buckets.map((bucket) => {
    const xPos = getXPosition(bucket.timestamp);
    const left = Math.max(0, xPos - fixedBarWidth / 2);
    return { 
      left: Math.min(left, 100 - fixedBarWidth), 
      width: fixedBarWidth 
    };
  });

  return (
    <div className="simple-bar-chart">
      <div className="chart-y-axis">
        <span className="y-label">100%</span>
        <span className="y-label">50%</span>
        <span className="y-label">0%</span>
      </div>
      <div className="chart-content" style={{ position: 'relative' }}>
        <div className="bars" style={{ position: 'relative', width: '100%', height: '100%' }}>
          {buckets.map((bucket, i) => {
            const pos = bucketPositions[i];
            const xPos = getXPosition(bucket.timestamp);
            return (
              <div
                key={i}
                className="bar"
                style={{
                  position: 'absolute',
                  left: `${pos.left}%`,
                  width: `${pos.width}%`,
                  height: `${bucket.successRate}%`,
                  backgroundColor: bucket.successRate < 90 ? '#f44336' : bucket.successRate < 98 ? '#ff9800' : color,
                  bottom: 0
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </div>
        {hoveredIndex !== null && hoveredIndex < buckets.length && (
          <div 
            className="chart-tooltip"
            style={{
              position: 'absolute',
              left: `${getXPosition(buckets[hoveredIndex].timestamp)}%`,
              top: `${200 - (buckets[hoveredIndex].successRate / 100) * 180 - 50}px`,
              transform: 'translateX(-50%)',
              zIndex: 10
            }}
          >
            <div className="tooltip-label">{formatXAxisLabel(buckets[hoveredIndex].timestamp, period)}</div>
            <div className="tooltip-value">Success Rate: {buckets[hoveredIndex].successRate.toFixed(1)}%</div>
            <div className="tooltip-value" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
              ({buckets[hoveredIndex].count} {buckets[hoveredIndex].count === 1 ? 'sample' : 'samples'})
            </div>
          </div>
        )}
        <div className="chart-x-axis">
          <span className="x-label">{formatXAxisLabel(getStartDateForPeriod(period).toISOString(), period)}</span>
          <span className="x-label">{formatXAxisLabel(new Date().toISOString(), period)}</span>
        </div>
      </div>
    </div>
  );
};

