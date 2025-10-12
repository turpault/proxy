import React from 'react';
import { Process } from '../types';
import { formatLocalTime, formatUptime } from '../utils';

interface ProcessCardProps {
  process: Process;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (processId: string, action: 'start' | 'stop' | 'restart') => void;
}

export const ProcessCard: React.FC<ProcessCardProps> = ({
  process,
  isSelected,
  onSelect,
  onAction
}) => {
  const statusClass = process.isRunning ? 'running' : 'stopped';
  const statusText = process.isRunning ? 'Running' : 'Stopped';

  return (
    <div
      className={`process-card ${isSelected ? 'selected' : ''} ${statusClass}`}
      onClick={onSelect}
    >
      <div className="process-header">
        <h3 className="process-name">{process.name}</h3>
        <span className={`process-status ${statusClass}`}>{statusText}</span>
      </div>

      {process.description && (
        <div className="process-description">
          {process.description}
        </div>
      )}

      <div className="process-info">
        <div className="info-row">
          <span className="label">PID:</span>
          <span className="value">{process.pid || 'N/A'}</span>
        </div>
        <div className="info-row">
          <span className="label">Uptime:</span>
          <span className="value">{formatUptime(process.uptime || 0)}</span>
        </div>
        <div className="info-row">
          <span className="label">Restarts:</span>
          <span className="value">{process.restartCount || 0}</span>
        </div>
        <div className="info-row">
          <span className="label">Last Restart:</span>
          <span className="value">{formatLocalTime(process.lastRestartTime || null)}</span>
        </div>
      </div>

      <div className="process-actions">
        <button
          className="btn btn-start"
          disabled={process.isRunning}
          onClick={(e) => {
            e.stopPropagation();
            onAction(process.id, 'start');
          }}
        >
          Start
        </button>
        <button
          className="btn btn-stop"
          disabled={!process.isRunning}
          onClick={(e) => {
            e.stopPropagation();
            onAction(process.id, 'stop');
          }}
        >
          Stop
        </button>
        <button
          className="btn btn-restart"
          onClick={(e) => {
            e.stopPropagation();
            onAction(process.id, 'restart');
          }}
        >
          Restart
        </button>
      </div>
    </div>
  );
}; 