import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CheckOrigin, FunnelStatus, Lead, ScoreResult } from '../core/types';
import { STATUS_LABEL } from '../core/types';
import { scoreLead, confidenceLabel } from '../core/scoring';
import { useLeads, useSettings } from '../data/store';

// ---------- Ícones (inline, sem dependência) ----------
const paths: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>,
  funnel: <path d="M3 4h18l-7 9v6l-4 2v-8z" />,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  wa: <path d="M20.5 3.5A11 11 0 0 0 3.2 17.3L2 22l4.8-1.2A11 11 0 0 0 20.5 3.5zM12 20a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.5 2.5 0 0 0 1.7-1.2 2 2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z" fill="currentColor" stroke="none" />,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  ext: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 20h16" /></>,
  upload: <><path d="M12 20V9M7 14l5-5 5 5" /><path d="M4 4h16" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bot: <><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9 16.5h6" /><circle cx="12" cy="3.5" r="1" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
};

export function Icon({ name, title }: { name: keyof typeof paths | string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {paths[name]}
    </svg>
  );
}

// ---------- Rotas por hash ----------
export type View = 'prospectar' | 'leads' | 'funil' | 'robo' | 'ajustes';
export interface Route {
  view: View;
  leadId?: string;
  tab?: string;
}

function parseHash(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  const view = (['prospectar', 'leads', 'funil', 'robo', 'ajustes'].includes(parts[0]) ? parts[0] : 'prospectar') as View;
  const leadId = parts[1] === 'lead' && parts[2] ? decodeURIComponent(parts[2]) : undefined;
  return { view, leadId, tab: leadId ? parts[3] : undefined };
}

export function routeHref(r: Route): string {
  return `#/${r.view}${r.leadId ? `/lead/${encodeURIComponent(r.leadId)}${r.tab ? `/${r.tab}` : ''}` : ''}`;
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route) => {
    window.location.hash = routeHref(r);
  }, []);
  return [route, go];
}

// ---------- Leads + score ----------
export interface ScoredLead {
  lead: Lead;
  score: ScoreResult;
}

export function useScoredLeads(): ScoredLead[] {
  const leads = useLeads();
  const { scoring } = useSettings();
  return useMemo(() => leads.map((lead) => ({ lead, score: scoreLead(lead, scoring) })), [leads, scoring]);
}

// ---------- Visual atoms ----------
export function ScoreBadge({ score, compact }: { score: ScoreResult; compact?: boolean }) {
  return (
    <span className={`score score-${score.temperature}`} title={`Score ${score.score}/100 · ${score.temperature} · confiança ${confidenceLabel(score.confidence)}`}>
      <span className="score-num">{score.score}</span>
      {!compact && (
        <span className="score-meta">
          <b>{score.temperature}</b>
          <span>confiança {confidenceLabel(score.confidence)}</span>
        </span>
      )}
    </span>
  );
}

const STATUS_CLASS: Record<FunnelStatus, string> = {
  novo: 'chip-outline', pesquisado: 'chip-info', prospectado: 'chip-info', contatado: 'chip-attn', respondeu: 'chip-warm',
  reuniao: 'chip-hot', finalizado: 'chip-ok',
};

export function StatusChip({ status }: { status: FunnelStatus }) {
  return <span className={`chip chip-dot ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function OriginTag({ origin }: { origin: CheckOrigin }) {
  const label = origin === 'automatico' ? 'auto' : origin === 'inferido' ? 'inferido' : 'manual';
  const title = origin === 'automatico' ? 'Verificado automaticamente' : origin === 'inferido' ? 'Inferência de baixa confiança' : 'Exige/teve validação manual';
  return <span className={`origin origin-${origin}`} title={title}>{label}</span>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok' | 'demo'; children: ReactNode }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={kind === 'error' || kind === 'warn' ? 'alert' : 'info'} />
      <div>{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  // Portal no body: evita que o modal fique preso no contexto de empilhamento do drawer.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Toasts ----------
interface Toast { id: number; text: string; error?: boolean }
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, error }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), error ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast${t.error ? ' is-error' : ''}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Estado persistente (localStorage) ----------
const STATE_PREFIX = 'prospecta.v1.ui.';

/** useState que sobrevive à troca de tela e ao recarregar a página. Falhas de armazenamento são ignoradas. */
export function useStoredState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(STATE_PREFIX + key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STATE_PREFIX + key, JSON.stringify(value));
    } catch {
      /* armazenamento cheio/bloqueado: mantém só em memória */
    }
  }, [key, value]);
  return [value, setValue];
}

// ---------- Helpers ----------
export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}
