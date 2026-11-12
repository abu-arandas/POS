import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lib/i18n';
import App from './App.tsx';
import './index.css';
import { CustomerDisplay } from './components/CustomerDisplay';
import { ErrorBoundary } from './components/ErrorBoundary';

// Dark-first by default so the semantic tokens resolve to their dark values on
// the very first paint (no flash of a light theme before the persisted store
// rehydrates). If the operator saved a light preference, onRehydrateStorage in
// the settings store removes this class once storage loads.
document.documentElement.classList.add('dark');

// The customer-facing display is a second window on the counter's second
// screen, not a screen in the operator's navigation: it has no sidebar, no lock
// screen and nothing the customer could press. It gets its own entry point, and
// the register drives it over a BroadcastChannel (lib/cfdChannel).
//
// Selected by query string rather than a router because the app has no router —
// App.tsx switches on a screen id — and because this is the one surface that
// genuinely has to be a separate browser window.
const isCustomerDisplay = new URLSearchParams(window.location.search).get('display') === 'customer';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>{isCustomerDisplay ? <CustomerDisplay /> : <App />}</ErrorBoundary>
  </StrictMode>,
);
