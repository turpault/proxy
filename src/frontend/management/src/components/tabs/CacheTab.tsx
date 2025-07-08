import React, { useState, useEffect } from 'react';
import { useNotifications } from '../NotificationProvider';
import { CacheData, CacheEntry } from '../../types';
import { formatBytes, formatLocalTime } from '../../utils';

export const CacheTab: React.FC = () => {
  const [cacheData, setCacheData] = useState<CacheData | null>(null);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotifications();

  useEffect(() => {
    loadCacheStats();
  }, []);

  const loadCacheStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cache/stats');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setCacheData(result.data);
        } else {
          throw new Error('Invalid response format');
        }
      } else {
        throw new Error('Failed to load cache stats');
      }
    } catch (error) {
      console.error('Failed to load cache stats:', error);
      showNotification('Failed to load cache stats', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCacheEntries = async (page: number = 1) => {
    try {
      const response = await fetch(`/api/cache/entries?page=${page}&limit=50`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setCacheEntries(result.data.entries || []);
          setCurrentPage(page);
        } else {
          throw new Error('Invalid response format');
        }
      }
    } catch (error) {
      console.error('Failed to load cache entries:', error);
      showNotification('Failed to load cache entries', 'error');
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Are you sure you want to clear all cache entries?')) {
      return;
    }

    try {
      const response = await fetch('/api/cache/clear', { method: 'POST' });
      if (response.ok) {
        showNotification('Cache cleared successfully', 'success');
        loadCacheStats();
        loadCacheEntries(1);
      } else {
        throw new Error('Failed to clear cache');
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
      showNotification('Failed to clear cache', 'error');
    }
  };

  const handleDeleteEntry = async (key: string) => {
    if (!confirm('Are you sure you want to delete this cache entry?')) {
      return;
    }

    try {
      const response = await fetch(`/api/cache/delete/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        showNotification('Cache entry deleted successfully', 'success');
        loadCacheStats();
        loadCacheEntries(currentPage);
      } else {
        throw new Error('Failed to delete cache entry');
      }
    } catch (error) {
      console.error('Failed to delete cache entry:', error);
      showNotification('Failed to delete cache entry', 'error');
    }
  };

  if (loading) {
    return (
      <div className="cache-tab">
        <div className="loading">Loading cache statistics...</div>
      </div>
    );
  }

  return (
    <div className="cache-tab">
      <div className="cache-header">
        <h2>Cache Management</h2>
        <div className="cache-actions">
          <button className="btn btn-refresh" onClick={loadCacheStats}>
            Refresh
          </button>
          <button className="btn btn-clear" onClick={handleClearCache}>
            Clear All
          </button>
        </div>
      </div>

      {cacheData && (
        <div className="cache-stats">
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Total Entries</h4>
              <div className="value">{cacheData.totalEntries}</div>
            </div>
            <div className="stat-card">
              <h4>Total Size</h4>
              <div className="value">{formatBytes(cacheData.totalSize)}</div>
            </div>
            <div className="stat-card">
              <h4>Hit Rate</h4>
              <div className="value">{(cacheData.hitRate * 100).toFixed(1)}%</div>
            </div>
            <div className="stat-card">
              <h4>Miss Rate</h4>
              <div className="value">{(cacheData.missRate * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      )}

      <div className="cache-entries">
        <div className="entries-header">
          <h3>Cache Entries</h3>
          <button className="btn btn-load" onClick={() => loadCacheEntries(1)}>
            Load Entries
          </button>
        </div>

        {cacheEntries.length === 0 ? (
          <div className="no-entries">
            <p>No cache entries to display</p>
          </div>
        ) : (
          <div className="entries-table">
            <table>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cacheEntries.map((entry) => (
                  <tr key={entry.key}>
                    <td>{entry.url}</td>
                    <td>{entry.method}</td>
                    <td>{entry.status}</td>
                    <td>{formatBytes(entry.size)}</td>
                    <td>{formatLocalTime(entry.createdAt)}</td>
                    <td>{formatLocalTime(entry.expiresAt)}</td>
                    <td>
                      <button
                        className="btn btn-delete"
                        onClick={() => handleDeleteEntry(entry.key)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}; 