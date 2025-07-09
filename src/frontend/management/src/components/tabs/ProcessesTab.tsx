import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../WebSocketProvider';
import { useNotifications } from '../NotificationProvider';
import { Process } from '../../types';
import { ProcessCard } from '../ProcessCard';
import { ProcessDetails } from '../ProcessDetails';
import { processesApi, handleApiSuccess } from '../../utils/api-client';

export const ProcessesTab: React.FC = () => {
  const { processes, status } = useWebSocket();
  const { showNotification } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get selected process from URL params
  const selectedProcessId = searchParams.get('process');
  const selectedProcess = processes.find(p => p.id === selectedProcessId) || null;

  const handleProcessSelect = (process: Process) => {
    setSearchParams({ process: process.id });
  };

  const handleProcessAction = async (processId: string, action: 'start' | 'stop' | 'restart') => {
    try {
      let success = false;

      switch (action) {
        case 'start':
          success = await handleApiSuccess(processesApi.startProcess(processId));
          break;
        case 'stop':
          success = await handleApiSuccess(processesApi.stopProcess(processId));
          break;
        case 'restart':
          success = await handleApiSuccess(processesApi.restartProcess(processId));
          break;
      }

      if (success) {
        showNotification(`Process ${action}ed successfully`, 'success');
      } else {
        throw new Error(`Failed to ${action} process`);
      }
    } catch (error) {
      console.error(`Failed to ${action} process:`, error);
      showNotification(`Failed to ${action} process`, 'error');
    }
  };

  return (
    <div className="processes-tab">
      <div className="status-overview">
        <div className="status-cards">
          <div className="card">
            <h3>Total Processes</h3>
            <div className="value">{processes.length}</div>
          </div>
          <div className="card">
            <h3>Running</h3>
            <div className="value">{processes.filter(p => p.isRunning).length}</div>
          </div>
          <div className="card">
            <h3>Stopped</h3>
            <div className="value">{processes.filter(p => !p.isRunning).length}</div>
          </div>
          <div className="card">
            <h3>Server Uptime</h3>
            <div className="value" id="server-uptime">
              {status ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      <div className="processes-container">
        <div className="processes-grid">
          {processes.map(process => (
            <ProcessCard
              key={process.id}
              process={process}
              isSelected={selectedProcess?.id === process.id}
              onSelect={() => handleProcessSelect(process)}
              onAction={handleProcessAction}
            />
          ))}
        </div>

        {selectedProcess && (
          <ProcessDetails
            process={selectedProcess}
            onAction={handleProcessAction}
          />
        )}
      </div>
    </div>
  );
}; 