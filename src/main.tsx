import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ToastProvider } from './ui/common';
import { store } from './data/store';
import './styles.css';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// Link do celular (npm run celular): "#coletor=TOKEN" configura o token do coletor e some da barra de endereço.
const hashToken = /^#coletor=([\w-]{6,64})$/.exec(location.hash)?.[1];
if (hashToken) {
  store.setSettings({ coletorToken: hashToken });
  history.replaceState(null, '', location.pathname + location.search);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ClerkProvider publishableKey={clerkPubKey}>
          <App />
        </ClerkProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Service worker apenas em produção: em dev ele atrapalharia o hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sem SW o app continua funcionando normalmente */
    });
  });
}
