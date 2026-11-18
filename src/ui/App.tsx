import { RefreshButton, UpdateBar } from './UpdateBar';
import { createContext, useContext, useEffect, useState } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { GateScreen } from './GateScreen';
import { isClosed, type IntegrationStatus } from '../core/types';
import { api, ApiError, type MeResponse } from '../data/api';
import { useStoreError } from '../data/store';
import { Icon, Notice, useRoute, useScoredLeads, type View } from './common';
import { SearchView } from './SearchView';
import { LeadsView } from './LeadsView';
import { FunnelView } from './FunnelView';
import { SettingsView } from './SettingsView';
import { LeadDetail } from './LeadDetail';
import { RobotView } from './RobotUI';
import { robotAttention, robotTick } from '../data/robot';
import DashboardView from './DashboardView';
import AdminView from './AdminView';

export interface IntegrationsState {
  status: IntegrationStatus | null;
  error: string | null;
  reload: () => void;
}
const IntegrationsCtx = createContext<IntegrationsState>({ status: null, error: null, reload: () => {} });
export const useIntegrations = () => useContext(IntegrationsCtx);

const BASE_NAV: Array<{ view: View; label: string; short: string; icon: string }> = [
  { view: 'dashboard', label: 'Dashboard', short: 'Dash', icon: 'bolt' },
  { view: 'prospectar', label: 'Prospectar', short: 'Buscar', icon: 'search' },
  { view: 'leads', label: 'Oportunidades', short: 'Leads', icon: 'list' },
  { view: 'funil', label: 'Funil', short: 'Funil', icon: 'funnel' },
  { view: 'ajustes', label: 'Ajustes', short: 'Ajustes', icon: 'cog' },
];
const ADMIN_EXTRA_NAV: Array<{ view: View; label: string; short: string; icon: string }> = [
  { view: 'robo', label: 'Robô', short: 'Robô', icon: 'bot' },
];
const ADMIN_NAV: Array<{ view: View; label: string; short: string; icon: string }> = [
  { view: 'admin', label: 'Admin', short: 'Admin', icon: 'cog' },
];

export function App() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [route, go] = useRoute();
  const scored = useScoredLeads();
  const storeError = useStoreError();
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [intError, setIntError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [meData, setMeData] = useState<MeResponse | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const isAdmin = user?.publicMetadata?.role === 'admin';
  const NAV = isAdmin ? [...BASE_NAV, ...ADMIN_EXTRA_NAV, ...ADMIN_NAV] : BASE_NAV;

  useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    api.me().then((m) => { if (alive) { setMeData(m); setMeLoaded(true); } }).catch(() => { if (alive) setMeLoaded(true); });
    return () => { alive = false; };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    api
      .integrations()
      .then((s) => alive && (setIntegrations(s), setIntError(null)))
      .catch((e: ApiError) => { if (!alive) return; setIntError(e.message); });
    return () => {
      alive = false;
    };
  }, [tick, isSignedIn]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.view]);

  // Laço do robô de vendas: prepara mensagens para aprovação e lê respostas (só com o app aberto).
  useEffect(() => {
    const t = setInterval(() => void robotTick(), 30_000);
    const first = setTimeout(() => void robotTick(), 4000);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, []);

  if (!isLoaded || (isSignedIn && !meLoaded)) return <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><span className="spinner" /></div>;
  if (!isSignedIn) return <GateScreen />;
  if (meData !== null && meData.ip_mismatch) return (
    <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="modal" style={{ width: 'min(420px, 100%)', textAlign: 'center' }}>
        <div className="modal-head"><h2>Acesso de IP diferente</h2></div>
        <div className="modal-body">
          <p style={{ marginBottom: 16 }}>Detectamos um acesso de um IP diferente do cadastrado. Por segurança, sua sessão foi bloqueada.</p>
          <p style={{ marginBottom: 24, color: 'var(--muted)', fontSize: 14 }}>Se você mudou de rede (Wi-Fi, dados móveis, VPN), entre em contato para liberar o acesso:</p>
          <a
            href="https://wa.me/5548988078599?text=Boa%20tarde%2C%20fui%20tentar%20entrar%2C%20mas%20meu%20IP%20aqui%20deu%20como%20diferente.%20Preciso%20de%20ajuda."
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-accent"
            style={{ display: 'inline-block', padding: '10px 24px' }}
          >
            Falar no WhatsApp
          </a>
        </div>
      </div>
    </div>
  );

  // Falha fechada: se não deu para confirmar o cadastro/assinatura, não libera o app.
  if (meData === null) return (
    <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="modal" style={{ width: 'min(420px, 100%)', textAlign: 'center' }}>
        <div className="modal-head"><h2>Não foi possível verificar seu acesso</h2></div>
        <div className="modal-body">
          <p style={{ marginBottom: 20 }}>Tente de novo em instantes.</p>
          <button className="btn btn-accent" style={{ marginRight: 8 }} onClick={() => location.reload()}>Tentar de novo</button>
          <button className="btn" onClick={() => void signOut({ redirectUrl: '/' })}>Sair</button>
        </div>
      </div>
    </div>
  );

  if (!meData.active) return (
    <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="modal" style={{ width: 'min(420px, 100%)', textAlign: 'center' }}>
        <div className="modal-head"><h2>Este e-mail não tem acesso</h2></div>
        <div className="modal-body">
          <p style={{ marginBottom: 8 }}>{meData.email ? `${meData.email} ainda não tem uma assinatura ativa.` : 'Sua conta ainda não tem uma assinatura ativa.'}</p>
          <p style={{ marginBottom: 20, color: 'var(--muted)', fontSize: 14 }}>Assine para liberar a ferramenta. Se já pagou, a ativação é automática pelo mesmo e-mail do pagamento.</p>
          <a href="/planos.html" className="btn btn-accent" style={{ display: 'inline-block', padding: '10px 24px', marginRight: 8 }}>Assinar</a>
          <button className="btn" style={{ marginRight: 8 }} onClick={() => location.reload()}>Verificar acesso</button>
          <button className="btn" onClick={() => void signOut({ redirectUrl: '/' })}>Sair</button>
        </div>
      </div>
    </div>
  );

  const hot = scored.filter((s) => s.score.temperature === 'quente' && !isClosed(s.lead)).length;
  const attention = robotAttention(scored.map((s) => s.lead));
  const counts: Partial<Record<View, number>> = { leads: scored.length, ...(attention ? { robo: attention } : {}) };

  return (
    <IntegrationsCtx.Provider value={{ status: integrations, error: intError, reload: () => setTick((t) => t + 1) }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand"><div className="brand-mark" /><span className="brand-name">SiteSales</span></div>
          <nav className="nav" aria-label="Principal">
            {NAV.map((n) => (
              <button key={n.view} aria-current={route.view === n.view ? 'page' : undefined} onClick={() => go({ view: n.view })}>
                <Icon name={n.icon} />
                {n.label}
                {counts[n.view] != null && <span className="count">{counts[n.view]}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <strong className="mono">{hot}</strong> oportunidade{hot === 1 ? '' : 's'} quente{hot === 1 ? '' : 's'} em aberto.
            <br />Dados salvos neste navegador.
            <RefreshButton />
          </div>
        </aside>

        <UpdateBar />
        <header className="topbar">
          <div className="brand-mark" /><span className="brand-name">SiteSales</span>
          <RefreshButton className="refresh-top" />
          <span className="chip chip-hot">{hot} quentes</span>
        </header>

        <main className="main">
          {storeError && <div style={{ marginBottom: 14 }}><Notice kind="error">{storeError}</Notice></div>}
          {route.view === 'dashboard' && <DashboardView meData={meData} />}
          {route.view === 'prospectar' && <SearchView onOpenLead={(id) => go({ view: 'prospectar', leadId: id })} meData={meData} />}
          {route.view === 'leads' && <LeadsView scored={scored} onOpen={(id) => go({ view: 'leads', leadId: id })} goSearch={() => go({ view: 'prospectar' })} />}
          {route.view === 'funil' && <FunnelView scored={scored} onOpen={(id) => go({ view: 'funil', leadId: id })} />}
          {route.view === 'robo' && <RobotView />}
          {route.view === 'ajustes' && <SettingsView />}
          {route.view === 'admin' && <AdminView />}
        </main>

        <nav className="tabbar" aria-label="Principal">
          {NAV.map((n) => (
            <button key={n.view} aria-current={route.view === n.view ? 'page' : undefined} onClick={() => go({ view: n.view })}>
              <Icon name={n.icon} />
              {n.short}
            </button>
          ))}
        </nav>
      </div>
      {route.leadId && <LeadDetail key={route.leadId} leadId={route.leadId} initialTab={route.tab} onClose={() => go({ view: route.view })} />}
    </IntegrationsCtx.Provider>
  );
}

