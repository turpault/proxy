import React from 'react';
import ReactDOM from 'react-dom/client'
import { ManagementApp } from './components/ManagementApp';
import './styles/global.css';

const isDevelopment = process.env.NODE_ENV === 'development';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ManagementApp />
)