import React from 'react';
import { createRoot } from 'react-dom/client';
import { ManagementApp } from './components/ManagementApp';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ManagementApp />
  </React.StrictMode>
); 