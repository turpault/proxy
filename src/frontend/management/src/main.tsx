import * as React from 'react';
import * as ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import { ManagementApp } from './components/ManagementApp';
import './styles/global.css';

const isDevelopment = process.env.NODE_ENV === 'development';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/frontend">
    <ManagementApp />
  </BrowserRouter>
)