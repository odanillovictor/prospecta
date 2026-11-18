import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ToastProvider } from './ui/common';
import { store } from './data/store';
import { ptBR } from './ptBR';
import './styles.css';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// Link do celular (npm run celular): "#coletor=TOKEN" configura o token do coletor e some da barra de endereço.
const hashToken = /^#coletor=([\w-]{6,64})$/.exec(location.hash)?.[1];
if (hashToken) {
  store.setSettings({ coletorToken: hashToken });
  history.replaceState(null, '', location.pathname + location.search);
}

const clerkAppearance = {
  layout: {
    showOptionalFields: false,
  },
  elements: {
    // Remove rodapé "Secured by Clerk"
    footer: { display: 'none' },
    // Remove banner de desenvolvimento
    developmentModeNotice: { display: 'none' },
    // Estilo escuro profissional
    card: {
      background: '#111118',
      border: '1px solid #22222c',
      borderRadius: '14px',
      boxShadow: '0 24px 80px rgba(0,0,0,.85)',
    },
    headerTitle: { color: '#f0f0f5', fontSize: '1.5rem', fontWeight: '800', letterSpacing: '-.03em' },
    headerSubtitle: { color: '#58586a' },
    socialButtonsBlockButton: { background: '#17171f', borderColor: '#22222c', color: '#f0f0f5' },
    socialButtonsBlockButtonText: { color: '#f0f0f5' },
    dividerText: { color: '#58586a' },
    formFieldLabel: { color: '#a8a8b8', fontSize: '13px' },
    formFieldInput: {
      background: '#17171f',
      borderColor: '#22222c',
      color: '#f0f0f5',
      borderRadius: '8px',
    },
    formFieldInput__focus: { borderColor: '#e05c2b' },
    formButtonPrimary: {
      background: '#e05c2b',
      borderRadius: '8px',
      fontWeight: '700',
    },
    identityPreviewEditButtonIcon: { color: '#e05c2b' },
    formResendCodeLink: { color: '#e05c2b' },
  },
  variables: {
    colorPrimary: '#e05c2b',
    colorBackground: '#111118',
    colorInputBackground: '#17171f',
    colorInputText: '#f0f0f5',
    colorText: '#f0f0f5',
    colorTextSecondary: '#a8a8b8',
    colorDanger: '#ef4444',
    borderRadius: '8px',
  },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ClerkProvider publishableKey={clerkPubKey} appearance={clerkAppearance} localization={ptBR}>
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
