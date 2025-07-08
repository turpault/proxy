import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '../NotificationProvider';
import { ConfigData, ConfigResponse, BackupItem } from '../../types';
import { formatLocalTime, formatBytes } from '../../utils';

type ConfigType = 'main' | 'proxy' | 'processes';

interface ValidationResult {
  isValid: boolean;
  error?: string;
  line?: number;
  column?: number;
  details?: string;
  suggestions?: string[];
}

export const ConfigTab: React.FC = () => {
  const [activeConfigType, setActiveConfigType] = useState<ConfigType>('main');
  const [configData, setConfigData] = useState<ConfigData | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { showNotification } = useNotifications();

  useEffect(() => {
    loadConfig(activeConfigType);
  }, [activeConfigType]);

  const validateYAML = useCallback(async (content: string): Promise<ValidationResult> => {
    try {
      const response = await fetch('/api/config/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, type: activeConfigType })
      });

      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : { isValid: false, error: result.error };
      } else {
        return { isValid: false, error: 'Validation service unavailable' };
      }
    } catch (error) {
      return { isValid: false, error: 'Failed to validate configuration' };
    }
  }, [activeConfigType]);

  const loadConfig = async (type: ConfigType) => {
    try {
      setLoading(true);
      setValidationResult(null);
      setHasUnsavedChanges(false);

      const response = await fetch(`/api/config/${type}`);
      const data: ConfigResponse = await response.json();

      if (data.success && data.data) {
        setConfigData(data.data);
        // Validate the loaded content
        const validation = await validateYAML(data.data.content);
        setValidationResult(validation);
      } else {
        throw new Error(data.error || 'Failed to load configuration');
      }
    } catch (error) {
      console.error(`Failed to load ${type} configuration:`, error);
      showNotification(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = useCallback(async (content: string) => {
    setHasUnsavedChanges(true);
    const validation = await validateYAML(content);
    setValidationResult(validation);
  }, [validateYAML]);

  const handleSaveConfig = async () => {
    if (!configData) return;

    const content = (document.getElementById(`${activeConfigType}-config-editor`) as HTMLTextAreaElement)?.value;

    if (!content) {
      showNotification('No content to save', 'error');
      return;
    }

    // Validate before saving
    const validation = await validateYAML(content);
    if (!validation.isValid) {
      showNotification('Configuration has syntax errors. Please fix them before saving.', 'error');
      return;
    }

    const createBackup = confirm('Create a backup before saving? (Recommended)');

    try {
      const response = await fetch(`/api/config/${activeConfigType}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, createBackup })
      });

      const data: ConfigResponse = await response.json();

      if (data.success) {
        showNotification('Configuration saved successfully', 'success');
        setConfigData(prev => prev ? { ...prev, content } : null);
        setHasUnsavedChanges(false);
        // Reload config to get updated metadata
        await loadConfig(activeConfigType);
      } else {
        throw new Error(data.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error(`Failed to save ${activeConfigType} configuration:`, error);
      showNotification(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const handleBackupConfig = async () => {
    try {
      const response = await fetch(`/api/config/${activeConfigType}/backup`, { method: 'POST' });
      const data: ConfigResponse = await response.json();

      if (data.success) {
        showNotification('Configuration backup created successfully', 'success');
      } else {
        throw new Error(data.error || 'Failed to create backup');
      }
    } catch (error) {
      console.error(`Failed to backup ${activeConfigType} configuration:`, error);
      showNotification(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const handleShowBackups = async () => {
    try {
      const response = await fetch(`/api/config/${activeConfigType}/backups`);
      const data = await response.json();

      if (data.success) {
        setBackups(data.data || []);
        setShowBackupModal(true);
      } else {
        throw new Error(data.error || 'Failed to load backups');
      }
    } catch (error) {
      console.error(`Failed to load ${activeConfigType} backups:`, error);
      showNotification(`Failed to load backups: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const handleRestoreBackup = async (backupPath: string) => {
    if (!confirm('Are you sure you want to restore this backup? This will overwrite the current configuration.')) {
      return;
    }

    try {
      const response = await fetch(`/api/config/${activeConfigType}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupPath })
      });

      const data: ConfigResponse = await response.json();

      if (data.success) {
        showNotification('Configuration restored successfully', 'success');
        setShowBackupModal(false);
        setHasUnsavedChanges(false);
        await loadConfig(activeConfigType);
      } else {
        throw new Error(data.error || 'Failed to restore backup');
      }
    } catch (error) {
      console.error(`Failed to restore ${activeConfigType} backup:`, error);
      showNotification(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const handleRevertChanges = () => {
    if (hasUnsavedChanges && confirm('Are you sure you want to revert all unsaved changes?')) {
      setHasUnsavedChanges(false);
      setValidationResult(null);
      if (configData) {
        // Reset the textarea to original content
        const textarea = document.getElementById(`${activeConfigType}-config-editor`) as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = configData.content;
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="config-tab">
        <div className="loading">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="config-tab">
      <div className="config-header">
        <h2>Configuration Management</h2>
        <div className="config-tabs">
          <button
            className={`config-tab ${activeConfigType === 'main' ? 'active' : ''}`}
            onClick={() => setActiveConfigType('main')}
          >
            Main Config
          </button>
          <button
            className={`config-tab ${activeConfigType === 'proxy' ? 'active' : ''}`}
            onClick={() => setActiveConfigType('proxy')}
          >
            Proxy Config
          </button>
          <button
            className={`config-tab ${activeConfigType === 'processes' ? 'active' : ''}`}
            onClick={() => setActiveConfigType('processes')}
          >
            Processes Config
          </button>
        </div>
      </div>

      {configData && (
        <div className="config-content">
          <div className="config-info">
            <div className="info-row">
              <span className="label">File Path:</span>
              <span className="value">{configData.path}</span>
            </div>
            <div className="info-row">
              <span className="label">Last Modified:</span>
              <span className="value">{formatLocalTime(configData.lastModified)}</span>
            </div>
            {hasUnsavedChanges && (
              <div className="info-row">
                <span className="label">Status:</span>
                <span className="value unsaved">Unsaved changes</span>
              </div>
            )}
          </div>

          {/* Validation Status */}
          {validationResult && (
            <div className={`validation-status ${validationResult.isValid ? 'valid' : 'invalid'}`}>
              <div className="validation-header">
                <span className="validation-icon">
                  {validationResult.isValid ? '✓' : '✗'}
                </span>
                <span className="validation-title">
                  {validationResult.isValid ? 'Configuration is valid' : 'Configuration has errors'}
                </span>
              </div>
              {!validationResult.isValid && (
                <div className="validation-details">
                  <div className="validation-error">{validationResult.error}</div>
                  {validationResult.line && (
                    <div className="validation-location">
                      Line {validationResult.line}
                      {validationResult.column && `, Column ${validationResult.column}`}
                    </div>
                  )}
                  {validationResult.details && (
                    <div className="validation-message">{validationResult.details}</div>
                  )}
                  {validationResult.suggestions && validationResult.suggestions.length > 0 && (
                    <div className="validation-suggestions">
                      <strong>Suggestions:</strong>
                      <ul>
                        {validationResult.suggestions.map((suggestion, index) => (
                          <li key={index}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="config-editor">
            <textarea
              id={`${activeConfigType}-config-editor`}
              defaultValue={configData.content}
              placeholder="Enter configuration content..."
              onChange={(e) => handleConfigChange(e.target.value)}
            />
          </div>

          <div className="config-actions">
            <button
              className="btn btn-save"
              onClick={handleSaveConfig}
              disabled={!hasUnsavedChanges || (validationResult && !validationResult.isValid)}
            >
              Save Configuration
            </button>
            {hasUnsavedChanges && (
              <button className="btn btn-revert" onClick={handleRevertChanges}>
                Revert Changes
              </button>
            )}
            <button className="btn btn-backup" onClick={handleBackupConfig}>
              Create Backup
            </button>
            <button className="btn btn-backups" onClick={handleShowBackups}>
              View Backups
            </button>
          </div>
        </div>
      )}

      {showBackupModal && (
        <div className="modal-overlay" onClick={() => setShowBackupModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Configuration Backups</h3>
              <button className="modal-close" onClick={() => setShowBackupModal(false)}>
                &times;
              </button>
            </div>
            <div className="backup-list">
              {backups.length === 0 ? (
                <div className="no-backups">No backups found</div>
              ) : (
                backups.map((backup, index) => (
                  <div key={index} className="backup-item">
                    <div className="backup-info">
                      <div className="backup-name">{backup.name}</div>
                      <div className="backup-meta">
                        Size: {formatBytes(backup.size)} |
                        Modified: {formatLocalTime(backup.lastModified)}
                      </div>
                    </div>
                    <div className="backup-actions">
                      <button
                        className="btn btn-restore"
                        onClick={() => handleRestoreBackup(backup.path)}
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 