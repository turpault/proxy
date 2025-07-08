import React, { useState, useEffect } from 'react';
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

export const ManagementApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('processes');

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'processes':
        return <ProcessesTab />;
      case 'statistics':
        return <StatisticsTab />;
      case 'certificates':
        return <CertificatesTab />;
      case 'cache':
        return <CacheTab />;
      case 'config':
        return <ConfigTab />;
      default:
        return <ProcessesTab />;
    }
  };

  return (
    <NotificationProvider>
      <WebSocketProvider>
        <div className="management-app">
          <Header />
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
          <div className="tab-content-container">
            {renderTabContent()}
          </div>
        </div>
      </WebSocketProvider>
    </NotificationProvider>
  );
}; 