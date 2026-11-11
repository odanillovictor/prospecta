import { RefreshButton, UpdateBar } from './UpdateBar';
import { createContext, useContext, useEffect, useState } from 'react';
import { useUser, RedirectToSignIn } from '@clerk/clerk-react';
import { isClosed, type IntegrationStatus } from '../core/types';
import { api, ApiError, type MeResponse } from '../data/api';
import { store, useStoreError } from '../data/store';
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
  { view: 'robo', label: 'Robô', short: 'Robô', icon: 'bot' },
  { view: 'ajustes', label: 'Ajustes', short: 'Ajustes', icon: 'cog' },
];
const ADMIN_NAV: Array<{ view: View; label: string; short: string; icon: string }> = [
  { view: 'admin', label: 'Admin', short: 'Admin', icon: 'cog' },
];

export function App() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [route, go] = useRoute();
  const scored = useScoredLeads();
  const storeError = useStoreError();
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [intError, setIntError] = useState<string | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [tick, setTick] = useState(0);
  const [meData, setMeData] = useState<MeResponse | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const isAdmin = user?.publicMetadata?.role === 'admin';
  const NAV = isAdmin ? [...BASE_NAV, ...ADMIN_NAV] : BASE_NAV;

  useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    api.me().then((m) => { if (alive) { setMeData(m); setMeLoaded(true); } }).catch(() => { if (alive) setMeLoaded(true); });
    return () => { alive = false; };
  }, [isSignedIn]);

  useEffect(() => {
    let alive = true;
    api
      .integrations()
      .then((s) => alive && (setIntegrations(s), setIntError(null)))
      .catch((e: ApiError) => { if (!alive) return; setIntError(e.message); setNeedsToken(e.status === 401); });
    return () => {
      alive = false;
    };
  }, [tick]);

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

  if (!isLoaded) return <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><span className="spinner" /></div>;
  if (!isSignedIn) return <RedirectToSignIn />;
  if (meLoaded && meData?.active === false) return (
    <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="modal" style={{ width: 'min(420px, 100%)', textAlign: 'center' }}>
        <div className="modal-head"><h2>Aguardando ativação</h2></div>
        <div className="modal-body">
          <p>Sua conta foi criada! Aguarde a ativação pelo administrador para acessar a ferramenta.</p>
          <a className="btn btn-primary" href="https://wa.me/55?text=Oi%2C+quero+ativar+minha+conta+no+Prospecta" target="_blank" rel="noopener noreferrer">
            <Icon name="wa" /> Contato via WhatsApp
          </a>
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
          <div className="brand"><div className="brand-mark" /><span className="brand-name">Prospecta</span></div>
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
          <div className="brand-mark" /><span className="brand-name">Prospecta</span>
          <RefreshButton className="refresh-top" />
          <span className="chip chip-hot">{hot} quentes</span>
        </header>

        <main className="main">
          {storeError && <div style={{ marginBottom: 14 }}><Notice kind="error">{storeError}</Notice></div>}
          {route.view === 'dashboard' && <DashboardView meData={meData} />}
          {route.view === 'prospectar' && <SearchView onOpenLead={(id) => go({ view: 'leads', leadId: id })} meData={meData} />}
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
      {needsToken && <AccessGate onDone={() => { setNeedsToken(false); setTick((t) => t + 1); }} />}
      {route.leadId && <LeadDetail key={route.leadId} leadId={route.leadId} initialTab={route.tab} onClose={() => go({ view: route.view })} />}
    </IntegrationsCtx.Provider>
  );
}

/** Tela de acesso: aparece quando o site publicado exige o código (APP_ACCESS_TOKEN) e ele ainda não foi informado. */
function AccessGate({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    store.setSettings({ accessToken: code.trim() });
    try {
      await api.integrations();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Código incorreto. Confira e tente de novo.' : 'Não foi possível validar agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" style={{ zIndex: 90 }}>
      <form className="modal" onSubmit={submit} style={{ width: 'min(420px, 100%)' }}>
        <div className="modal-head"><h2>Acesso ao Prospecta</h2></div>
        <div className="modal-body">
          <p className="small muted" style={{ margin: 0 }}>Digite o código de acesso desta instalação. Ele fica salvo neste navegador e só é pedido uma vez.</p>
          {error && <Notice kind="error">{error}</Notice>}
          <input className="input input-lg" type="password" autoFocus autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de acesso" aria-label="Código de acesso" />
        </div>
        <div className="modal-foot"><button className="btn btn-primary" disabled={!code.trim() || busy}>{busy ? <span className="spinner" /> : null} Entrar</button></div>
      </form>
    </div>
  );
}
