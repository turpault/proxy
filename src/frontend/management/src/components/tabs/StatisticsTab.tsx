import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../WebSocketProvider';
import { StatisticsSummary, DetailedStatistics, RouteStatistics } from '../../types';
import { GeoMap } from '../GeoMap';
import { API_BASE, GetStatisticsResponse, GetDetailedStatisticsResponse } from '../../utils/api-client';
import { getCountryName } from '../../utils/country-codes';

// Utility function to strip IPv6-mapped IPv4 prefix
const stripIPv6Prefix = (ip: string): string => {
  return ip.replace(/^::ffff:/, '');
};

export const StatisticsTab: React.FC = () => {
  const { status } = useWebSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statistics, setStatistics] = useState<StatisticsSummary | null>(null);
  const [detailedStatistics, setDetailedStatistics] = useState<DetailedStatistics | null>(null);

  // Get period from URL params, default to '24h'
  const selectedPeriod = searchParams.get('period') || '24h';

  useEffect(() => {
    const loadStatistics = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/statistics`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json() as GetStatisticsResponse;
        if (data.success && data.data) {
          setStatistics(data.data);
        } else {
          throw new Error('Failed to load statistics');
        }
      } catch (error) {
        console.error('Failed to load statistics:', error);
      }
    };

    const loadDetailedStatistics = async () => {
      try {
        let url = `${API_BASE}/api/statistics/detailed`;
        if (selectedPeriod) {
          url += `?period=${selectedPeriod}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json() as GetDetailedStatisticsResponse;
        if (data.success && data.data) {
          setDetailedStatistics(data.data);
        } else {
          throw new Error('Failed to load detailed statistics');
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

  // Convert backend country data to frontend format
  const aggregatedCountryData = useMemo(() => {
    if (!detailedStatistics?.countryStats) return [];

    return detailedStatistics.countryStats.map(country => ({
      country: country.country,
      count: country.totalRequests,
      percentage: (country.totalRequests / (detailedStatistics.countryStats?.reduce((sum, c) => sum + c.totalRequests, 0) || 1)) * 100,
      latitude: country.latitude,
      longitude: country.longitude
    })).sort((a, b) => b.count - a.count);
  }, [detailedStatistics?.countryStats]);

  // Convert backend city data to frontend format
  const aggregatedCityData = useMemo(() => {
    if (!detailedStatistics?.cityStats) return [];

    return detailedStatistics.cityStats.map(city => ({
      city: city.city,
      country: city.country,
      count: city.totalRequests,
      percentage: (city.totalRequests / (detailedStatistics.cityStats?.reduce((sum, c) => sum + c.totalRequests, 0) || 1)) * 100,
      latitude: city.latitude,
      longitude: city.longitude
    })).sort((a, b) => b.count - a.count);
  }, [detailedStatistics?.cityStats]);

  // Convert backend IP data to frontend format
  const aggregatedIPData = useMemo(() => {
    if (!detailedStatistics?.ipStats) return [];

    return detailedStatistics.ipStats.map(ip => ({
      ip: stripIPv6Prefix(ip.ip),
      country: ip.country,
      city: ip.city,
      count: ip.totalRequests,
      percentage: (ip.totalRequests / (detailedStatistics.ipStats?.reduce((sum, i) => sum + i.totalRequests, 0) || 1)) * 100,
      latitude: ip.latitude,
      longitude: ip.longitude
    })).sort((a, b) => b.count - a.count);
  }, [detailedStatistics?.ipStats]);

  return (
    <div className="statistics-tab">
      <div className="period-selector">
        <h3>Statistics Period</h3>
        <select
          value={selectedPeriod}
          onChange={(e) => setSearchParams({ period: e.target.value })}
          className="period-select"
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {/* Geolocation Map - Moved to top */}
      {aggregatedCountryData.length > 0 && (
        <GeoMap
          countryData={aggregatedCountryData}
          cityData={aggregatedCityData}
          ipData={aggregatedIPData}
          title="Request Distribution by Location"
          height={500}
        />
      )}

      <div className="stats-overview">
        <div className="stat-card">
          <h4>Total Requests</h4>
          <div className="value" id="total-requests">
            {statistics?.totalRequests?.toLocaleString() || '0'}
          </div>
        </div>
        <div className="stat-card">
          <h4>Unique Clients</h4>
          <div className="value" id="unique-clients">
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
          <h4>Routes</h4>
          <div className="value" id="routes-count">
            {detailedStatistics?.uniqueRoutes || status?.routes || '0'}
          </div>
        </div>
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
              <div className="route-locations">
                {route.topCountries && route.topCountries.length > 0 && (
                  <div className="route-countries">
                    <h5>Top Countries</h5>
                    <div className="countries-list">
                      {route.topCountries.slice(0, 3).map((country, idx) => (
                        <div key={idx} className="country-item">
                          <span className="country-name">{getCountryName(country.country)}</span>
                          <span className="country-count">{country.count}</span>
                          <span className="country-percentage">({country.percentage.toFixed(1)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {route.topCities && route.topCities.length > 0 && (
                  <div className="route-cities">
                    <h5>Top Cities</h5>
                    <div className="cities-list">
                      {route.topCities.slice(0, 3).map((city, idx) => (
                        <div key={idx} className="city-item">
                          <span className="city-name">{city.city}, {getCountryName(city.country)}</span>
                          <span className="city-count">{city.count}</span>
                          <span className="city-percentage">({city.percentage.toFixed(1)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
    </div>
  );
}; 