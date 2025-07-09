import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { TabType } from '../types';
import { Header } from './Header';
import { TabBar } from './TabBar';
import { ProcessesTab } from './tabs/ProcessesTab';
import { StatisticsTab } from './tabs/StatisticsTab';
import { CertificatesTab } from './tabs/CertificatesTab';
import { CacheTab } from './tabs/CacheTab';
import { ConfigTab } from './tabs/ConfigTab';
import { NotificationProvider } from './NotificationProvider';
import { WebSocketProvider } from './WebSocketProvider';
import '../styles/global.css';

const ManagementAppContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Extract tab from URL path
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const activeTab = (pathSegments[0] as TabType) || 'processes';

  // Extract config type from URL if on config tab
  const configType = pathSegments[1] || 'main';

  const handleTabChange = (tab: TabType) => {
    if (tab === 'config') {
      // Navigate to config with current config type or default to main
      navigate(`config/${configType || 'main'}`);
    } else {
      navigate(tab);
    }
  };

  return (
    <div className="management-app">
      <Header />
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="tab-content-container">
        <Routes>
          <Route path="" element={<Navigate to="processes" replace />} />
          <Route path="processes" element={<ProcessesTab />} />
          <Route path="statistics" element={<StatisticsTab />} />
          <Route path="certificates" element={<CertificatesTab />} />
          <Route path="cache" element={<CacheTab />} />
          <Route path="config/:configType" element={<ConfigTab />} />
          <Route path="config" element={<Navigate to="config/main" replace />} />
          <Route path="*" element={<Navigate to="processes" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export const ManagementApp: React.FC = () => {
  return (
    <NotificationProvider>
      <WebSocketProvider>
        <ManagementAppContent />
      </WebSocketProvider>
    </NotificationProvider>
  );
}; 