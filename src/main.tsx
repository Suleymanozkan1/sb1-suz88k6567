import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initMonitoring } from './lib/monitoring';
import './index.css';

initMonitoring();

const container = document.getElementById('root');
if (!container) throw new Error('#root elemanı bulunamadı.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
