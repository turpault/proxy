import React, { useState, useEffect } from 'react';
import { Process, LogLine, LogFilter } from '../types';
import { useWebSocket } from './WebSocketProvider';
import { formatLocalTime, formatUptime, escapeHtml } from '../utils';

interface ProcessDetailsProps {
  process: Process;
  onAction: (processId: string, action: 'start' | 'stop' | 'restart') => void;
}

export const ProcessDetails: React.FC<ProcessDetailsProps> = ({ process, onAction }) => {
  const { processLogs, requestLogs } = useWebSocket();
  const [logLines, setLogLines] = useState<number | string>(100);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [showLogsSinceRestart, setShowLogsSinceRestart] = useState(false);

  const logs = processLogs[process.id] || [];

  useEffect(() => {
    requestLogs(process.id, logLines);
  }, [process.id, logLines, requestLogs]);

  const filteredLogs = logs.filter(log => {
    if (logFilter === 'all') return true;
    return log.stream === logFilter;
  });

  const renderLogs = () => {
    return filteredLogs.map((log, index) => (
      <div key={index} className={`log-line ${log.stream}`}>
        <span className="log-timestamp">{log.timestamp || ''}</span>
        <span className="log-content" dangerouslySetInnerHTML={{ __html: escapeHtml(log.line) }} />
      </div>
    ));
  };

  return (
    <div className="process-details">
      <div className="details-header">
        <h2>{process.name} - Details</h2>
        <div className="process-controls">
          <button
            className="btn btn-start"
            disabled={process.isRunning}
            onClick={() => onAction(process.id, 'start')}
          >
            Start
          </button>
          <button
            className="btn btn-stop"
            disabled={!process.isRunning}
            onClick={() => onAction(process.id, 'stop')}
          >
            Stop
          </button>
          <button
            className="btn btn-restart"
            onClick={() => onAction(process.id, 'restart')}
          >
            Restart
          </button>
        </div>
      </div>

      <div className="details-content">
        <div className="process-info-grid">
          <div className="info-item">
            <label>Process ID:</label>
            <span>{process.pid || 'N/A'}</span>
          </div>
          <div className="info-item">
            <label>Status:</label>
            <span className={`status ${process.isRunning ? 'running' : 'stopped'}`}>
              {process.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="info-item">
            <label>Uptime:</label>
            <span>{formatUptime(process.uptime || 0)}</span>
          </div>
          <div className="info-item">
            <label>Restart Count:</label>
            <span>{process.restartCount || 0}</span>
          </div>
          <div className="info-item">
            <label>Start Time:</label>
            <span>{formatLocalTime(process.startTime || null)}</span>
          </div>
          <div className="info-item">
            <label>Last Restart:</label>
            <span>{formatLocalTime(process.lastRestartTime || null)}</span>
          </div>
          <div className="info-item">
            <label>PID File:</label>
            <span>{process.pidFile || 'N/A'}</span>
          </div>
          <div className="info-item">
            <label>Log File:</label>
            <span>{process.logFile || 'N/A'}</span>
          </div>
        </div>

        <div className="process-logs">
          <div className="log-controls">
            <select
              value={logLines}
              onChange={(e) => setLogLines(e.target.value)}
            >
              <option value={50}>Last 50 lines</option>
              <option value={100}>Last 100 lines</option>
              <option value={200}>Last 200 lines</option>
              <option value={500}>Last 500 lines</option>
              <option value="all">All lines</option>
            </select>

            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value as LogFilter)}
            >
              <option value="all">All logs</option>
              <option value="stdout">Stdout only</option>
              <option value="stderr">Stderr only</option>
            </select>

            <label>
              <input
                type="checkbox"
                checked={showLogsSinceRestart}
                onChange={(e) => setShowLogsSinceRestart(e.target.checked)}
              />
              Show logs since last restart
            </label>
          </div>

          <div className="log-output">
            {logs.length === 0 ? (
              <div className="no-logs">No logs available</div>
            ) : (
              renderLogs()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 