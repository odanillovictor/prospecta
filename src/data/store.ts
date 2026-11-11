// Armazenamento local (navegador) com interface de repositório.
// Fase 1: localStorage — sem servidor de banco, sem custo. Fase 2 prevista: Cloudflare D1 (docs/ARQUITETURA.md).
import { useSyncExternalStore } from 'react';
import { migrateStatus, type BoardLabel, type Lead, type RobotSettings, type ScoringConfig } from '../core/types';
import { DEFAULT_SCORING } from '../core/scoring';
import type { SellerProfile } from '../core/pitch';

const LEADS_KEY = 'prospecta.v1.leads';
const SETTINGS_KEY = 'prospecta.v1.settings';

export interface Settings {
  scoring: ScoringConfig;
  seller: SellerProfile;
  accessToken: string;
  labels: BoardLabel[];
  /** Endereço do coletor local do Google Maps (npm run coletor). */
  coletorUrl: string;
  coletorToken: string;
  /** Robô de vendas (WhatsApp Web). */
  robot: RobotSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  scoring: DEFAULT_SCORING,
  seller: { name: '', company: '' },
  accessToken: '',
  coletorUrl: 'http://127.0.0.1:8790',
  coletorToken: '',
  robot: { mode: 'approve', dailyLimit: 15, startHour: 9, endHour: 18, weekdaysOnly: true, minGapSec: 90, dryRun: true, paused: false, serviceUrl: 'http://127.0.0.1:8791', agentUrl: '', offerText: '', priceText: '', meetingText: '' },
  labels: [
    { id: 'prioridade', name: 'Prioridade', color: '#ff4d1a' },
    { id: 'retornar', name: 'Retornar', color: '#d99a00' },
    { id: 'orcamento', name: 'Orçamento enviado', color: '#2c5d8f' },
    { id: 'site-pronto', name: 'Site pronto', color: '#1d7f53' },
    { id: 'sem-interesse', name: 'Sem interesse agora', color: '#7b8794' },
  ],
};

type Listener = () => void;
const listeners = new Set<Listener>();
let lastError: string | null = null;

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    lastError = null;
    return true;
  } catch (e) {
    lastError = e instanceof DOMException && e.name === 'QuotaExceededError'
      ? 'Armazenamento do navegador cheio. Exporte e limpe leads antigos.'
      : 'Não foi possível salvar no navegador.';
    return false;
  }
}

/** Normaliza leads salvos por versões anteriores (status antigos, campos novos). */
function migrateLeads(list: Lead[]): Lead[] {
  return list.map((l) => {
    const m = migrateStatus(l.status as string);
    return m.status === l.status && !m.outcome ? l : { ...l, status: m.status, outcome: l.outcome ?? m.outcome };
  });
}

let leads: Lead[] = migrateLeads(safeRead<Lead[]>(LEADS_KEY, []));
let settings: Settings = mergeSettings(safeRead<Partial<Settings>>(SETTINGS_KEY, {}));

function mergeSettings(s: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    scoring: {
      ...DEFAULT_SCORING,
      ...(s.scoring ?? {}),
      weights: { ...DEFAULT_SCORING.weights, ...(s.scoring?.weights ?? {}) },
    },
    seller: { ...DEFAULT_SETTINGS.seller, ...(s.seller ?? {}) },
    robot: { ...DEFAULT_SETTINGS.robot, ...(s.robot ?? {}) },
  };
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Sincroniza entre abas.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LEADS_KEY) leads = migrateLeads(safeRead<Lead[]>(LEADS_KEY, []));
    if (e.key === SETTINGS_KEY) settings = mergeSettings(safeRead<Partial<Settings>>(SETTINGS_KEY, {}));
    emit();
  });
}

export const store = {
  getLeads: () => leads,
  getSettings: () => settings,
  getError: () => lastError,

  setLeads(next: Lead[]) {
    leads = next;
    safeWrite(LEADS_KEY, leads);
    emit();
  },
  updateLead(id: string, patch: Partial<Lead> | ((l: Lead) => Partial<Lead>)) {
    leads = leads.map((l) => {
      if (l.id !== id) return l;
      const p = typeof patch === 'function' ? patch(l) : patch;
      return { ...l, ...p, updatedAt: new Date().toISOString() };
    });
    safeWrite(LEADS_KEY, leads);
    emit();
  },
  removeLeads(ids: string[]) {
    const set = new Set(ids);
    leads = leads.filter((l) => !set.has(l.id));
    safeWrite(LEADS_KEY, leads);
    emit();
  },
  setSettings(patch: Partial<Settings>) {
    settings = mergeSettings({ ...settings, ...patch });
    safeWrite(SETTINGS_KEY, settings);
    emit();
  },
  exportAll(): string {
    return JSON.stringify({ format: 'prospecta.backup/v1', exportedAt: new Date().toISOString(), leads, settings: { ...settings, accessToken: '', coletorToken: '' } }, null, 2);
  },
  importAll(text: string): { ok: boolean; message: string } {
    try {
      const data = JSON.parse(text);
      if (data?.format !== 'prospecta.backup/v1' || !Array.isArray(data.leads)) return { ok: false, message: 'Arquivo não é um backup do Prospecta.' };
      const valid = data.leads.filter((l: Lead) => l && typeof l.id === 'string' && typeof l.name === 'string');
      const byId = new Map(leads.map((l) => [l.id, l]));
      for (const l of valid) byId.set(l.id, { contactLog: [], manualSignals: {}, deliveries: [], sources: [], ...l });
      leads = migrateLeads([...byId.values()]);
      safeWrite(LEADS_KEY, leads);
      if (data.settings) // Códigos e endereço do coletor são deste aparelho: o backup não pode apagá-los (importar no celular zerava o token do coletor).
      settings = mergeSettings({ ...data.settings, accessToken: settings.accessToken, coletorToken: settings.coletorToken, coletorUrl: settings.coletorUrl });
      safeWrite(SETTINGS_KEY, settings);
      emit();
      return { ok: true, message: `${valid.length} lead(s) importado(s).` };
    } catch {
      return { ok: false, message: 'JSON inválido.' };
    }
  },
};

export function useLeads(): Lead[] {
  return useSyncExternalStore(subscribe, store.getLeads);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, store.getSettings);
}

export function useStoreError(): string | null {
  return useSyncExternalStore(subscribe, store.getError);
}
