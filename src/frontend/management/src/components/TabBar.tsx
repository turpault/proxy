import React from 'react';
import { TabType } from '../types';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'processes', label: 'Processes', icon: '⚙️' },
    { id: 'statistics', label: 'Statistics', icon: '📊' },
    { id: 'connectivity', label: 'Connectivity', icon: '🌐' },
    { id: 'certificates', label: 'Certificates', icon: '🔒' },
    { id: 'cache', label: 'Cache', icon: '💾' },
    { id: 'config', label: 'Configuration', icon: '⚙️' }
  ];

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}; 