import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DBProvider } from './state';
import { ConfirmHost, ToastHost } from './ui';
import './styles.css';
import { initTheme } from './theme';

initTheme();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DBProvider>
      <ToastHost>
        <ConfirmHost>
          <App />
        </ConfirmHost>
      </ToastHost>
    </DBProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
