import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lib/i18n';
import App from './App.tsx';
import './index.css';

// Dark-first by default so the semantic tokens resolve to their dark values on
// the very first paint (no flash of a light theme before the persisted store
// rehydrates). If the operator saved a light preference, onRehydrateStorage in
// the settings store removes this class once storage loads.
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
