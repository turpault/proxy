// Example usage of direct fetch calls with TypeScript types
// This file demonstrates how components should make API calls

import {
  API_BASE,
  StatusResponse,
  GetConfigRequest, GetConfigResponse,
  SaveConfigRequest, SaveConfigResponse,
  GetProcessesResponse,
  StartProcessResponse,
  GetCacheEntriesRequest, GetCacheEntriesResponse,
  ValidateConfigRequest, ValidateConfigResponse
} from './api-client';

// ============================================================================
// STATUS API EXAMPLES
// ============================================================================

export async function getStatus(): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json() as StatusResponse;
}

// ============================================================================
// CONFIGURATION API EXAMPLES
// ============================================================================

export async function getConfig(type: 'proxy' | 'processes' | 'main'): Promise<GetConfigResponse> {
  const response = await fetch(`${API_BASE}/api/config/${type}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json() as GetConfigResponse;
}

export async function saveConfig(
  type: 'proxy' | 'processes' | 'main',
  data: SaveConfigRequest
): Promise<SaveConfigResponse> {
  const response = await fetch(`${API_BASE}/api/config/${type}/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json() as SaveConfigResponse;
}

export async function validateConfig(data: ValidateConfigRequest): Promise<ValidateConfigResponse> {
  const response = await fetch(`${API_BASE}/api/config/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json() as ValidateConfigResponse;
}

// ============================================================================
// PROCESSES API EXAMPLES
// ============================================================================

export async function getProcesses(): Promise<GetProcessesResponse> {
  const response = await fetch(`${API_BASE}/api/processes`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json() as GetProcessesResponse;
}

export async function startProcess(id: string): Promise<StartProcessResponse> {
  const response = await fetch(`${API_BASE}/api/processes/${id}/start`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json() as StartProcessResponse;
}

// ============================================================================
// CACHE API EXAMPLES
// ============================================================================

export async function getCacheEntries(params?: GetCacheEntriesRequest): Promise<GetCacheEntriesResponse> {
  let url = `${API_BASE}/api/cache/entries`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value);
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json() as GetCacheEntriesResponse;
}

// ============================================================================
// COMPONENT USAGE EXAMPLES
// ============================================================================

// Example React component usage:
/*
import React, { useEffect, useState } from 'react';
import { getStatus, StatusResponse } from '../utils/api-examples';

export function StatusComponent() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        setLoading(true);
        const statusData = await getStatus();
        setStatus(statusData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!status) return <div>No status data</div>;

  return (
    <div>
      <h2>System Status</h2>
      <p>Status: {status.data.status}</p>
      <p>Uptime: {status.data.uptime}</p>
    </div>
  );
}
*/

// Example with form submission:
/*
import React, { useState } from 'react';
import { saveConfig, SaveConfigRequest } from '../utils/api-examples';

export function ConfigForm() {
  const [config, setConfig] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const requestData: SaveConfigRequest = {
        content: config,
        type: 'proxy'
      };
      
      const response = await saveConfig('proxy', requestData);
      
      if (response.success) {
        alert('Config saved successfully!');
      } else {
        alert(`Error: ${response.error}`);
      }
    } catch (err) {
      alert(`Failed to save config: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={config}
        onChange={(e) => setConfig(e.target.value)}
        placeholder="Enter configuration..."
      />
      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save Config'}
      </button>
    </form>
  );
}
*/ 