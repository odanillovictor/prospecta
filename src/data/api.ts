// Cliente das Pages Functions. Autenticação via Clerk JWT (Bearer token).
import type { ImageRef, IntegrationStatus, SearchRequest, SearchResponse, SiteFacts } from '../core/types';
import type { StockPhoto } from '../core/providers/openverse';
import type { SiteBriefing } from '../core/briefing';
import { store } from './store';

export interface MeResponse {
  clerkId: string;
  email: string;
  active: boolean;
  usage: { searches: number; previews: number; month: string };
  dailySearches: number;
  remaining: { searches: number; previews: number };
  ip_mismatch?: boolean;
}

const getToken = async (): Promise<string | null> => {
  return (window as any).Clerk?.session?.getToken() ?? null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<{ status: number; data: T }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const token = await getToken();
  try {
    const res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
    const ctype = res.headers.get('content-type') ?? '';
    if (!ctype.includes('application/json')) {
      throw new ApiError(res.status, res.status === 404
        ? 'API indisponível. Rode o servidor local com "npm run dev:api" (ou "npm run preview").'
        : `Resposta inesperada do servidor (HTTP ${res.status}).`);
    }
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok && res.status !== 501 && !(data as any)?.message) throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
    return { status: res.status, data };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (ctrl.signal.aborted) throw new ApiError(0, 'Tempo esgotado. O provedor pode estar lento; tente novamente.');
    throw new ApiError(0, 'Sem conexão com a API. Verifique a internet ou se o servidor local está rodando.');
  } finally {
    clearTimeout(t);
  }
}

const imageCache = new Map<string, Promise<string>>();

export interface ColetorHealth {
  ok: boolean;
  busy: boolean;
  binary: boolean;
  mode: 'auto' | 'rapido' | 'completo';
  docker?: boolean;
  photos?: boolean;
}

export interface ColetorJob {
  id: string;
  status: 'running' | 'done' | 'error';
  found: number;
  /** Quantidade pedida e se o Maps não tinha mais empresas para esta busca. */
  requested?: number;
  exhausted?: boolean;
  elapsedMs: number;
  cached?: boolean;
  engine?: 'docker-completo' | 'local-completo' | 'local-rapido';
  error?: string;
  results?: unknown[];
}

/** Chama o coletor local do Google Maps (roda no computador do usuário, fora do Cloudflare). */
const PRIVATE_HOST = /^(192\.168|10\.\d+|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/;

/** Endereço do coletor. No celular (app aberto por um IP da rede local) o padrão "127.0.0.1" apontaria para o próprio celular: usa o IP do PC. */
export function coletorBase(configured: string, pageHost: string = typeof location === 'undefined' ? '' : location.hostname): string {
  if (/^http:\/\/(127\.0\.0\.1|localhost):8790$/.test(configured) && PRIVATE_HOST.test(pageHost)) return `http://${pageHost}:8790`;
  return configured;
}

async function coletor<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const { coletorUrl: configuredUrl, coletorToken } = store.getSettings();
  const coletorUrl = coletorBase(configuredUrl);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${coletorUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(coletorToken ? { 'x-coletor-token': coletorToken } : {}) },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? `Coletor respondeu HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'Coletor do Google Maps não está rodando neste computador (npm run coletor).');
  } finally {
    clearTimeout(t);
  }
}

export const coletorApi = {
  health: () => coletor<ColetorHealth>('/health', { method: 'GET' }, 6000),
  start: (niche: string, location: string, limit: number) => coletor<{ id: string }>('/jobs', { method: 'POST', body: JSON.stringify({ niche, location, limit }) }, 15000),
  job: (id: string) => coletor<ColetorJob>(`/jobs/${id}`, { method: 'GET' }, 15000),
  /** Detalhes de uma empresa (foto e avaliações reais) no modo completo; o coletor liga o Docker se preciso. */
  place: (name: string, address: string) => coletor<{ id: string; status: string }>('/place', { method: 'POST', body: JSON.stringify({ name, address }) }, 20000),
};

export const api = {
  /** Dados do usuário logado: cota, uso e status de ativação. */
  async me(): Promise<MeResponse> {
    return (await call<MeResponse>('/api/me', { method: 'GET' }, 10_000)).data;
  },
  /** Despublica a prévia online (o link para de funcionar). */
  async unpublishPreview(id: string): Promise<void> {
    await call<{ ok: boolean }>(`/api/preview?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, 30_000);
  },
  /** Publica/atualiza a prévia online do site gerado e devolve o link público. */
  async publishPreview(id: string, html: string, og?: string): Promise<{ url: string; id: string }> {
    const { data } = await call<{ ok: boolean; url: string; id: string; error?: string }>('/api/preview', { method: 'POST', body: JSON.stringify({ id, html, og }) }, 120_000);
    if (!data.ok) throw new ApiError(500, data.error ?? 'Falha ao publicar a prévia.');
    return data;
  },
  /** Fotos ilustrativas do segmento (Openverse, CC) — usadas só quando não há foto real do cliente. */
  async stock(seg: string): Promise<StockPhoto[]> {
    try {
      return (await call<{ photos: StockPhoto[] }>(`/api/stock?seg=${encodeURIComponent(seg)}`, { method: 'GET' }, 30_000)).data.photos ?? [];
    } catch {
      return [];
    }
  },
  /** Fotos para UM serviço (consulta em inglês). Pexels quando configurado, senão Openverse filtrado. */
  async stockFor(q: string): Promise<StockPhoto[]> {
    try {
      return (await call<{ photos: StockPhoto[] }>(`/api/stock?q=${encodeURIComponent(q)}`, { method: 'GET' }, 30_000)).data.photos ?? [];
    } catch {
      return [];
    }
  },
  /** Busca uma imagem do cliente pelo proxy do servidor e devolve como data URL (para embutir no site). */
  image(ref: ImageRef): Promise<string> {
    const key = `${ref.kind}:${ref.value}`;
    const hit = imageCache.get(key);
    if (hit) return hit;
    const p = (async () => {
      const token = await getToken();
      const qs = ref.kind === 'place' ? `place=${encodeURIComponent(ref.value)}` : `url=${encodeURIComponent(ref.value)}`;
      const res = await fetch(`/api/image?${qs}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, (data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new ApiError(0, 'Falha ao ler a imagem.'));
        r.readAsDataURL(blob);
      });
    })();
    imageCache.set(key, p);
    p.catch(() => imageCache.delete(key));
    return p;
  },

  async integrations(): Promise<IntegrationStatus> {
    return (await call<IntegrationStatus>('/api/integrations', { method: 'GET' }, 10_000)).data;
  },
  async search(req: SearchRequest): Promise<SearchResponse> {
    return (await call<SearchResponse>('/api/search', { method: 'POST', body: JSON.stringify(req) }, 150_000)).data;
  },
  async diagnose(url: string): Promise<{ ok: true; facts: SiteFacts } | { ok: false; error: string }> {
    return (await call<any>('/api/diagnose', { method: 'POST', body: JSON.stringify({ url }) }, 90_000)).data;
  },
  async sendBriefing(b: SiteBriefing): Promise<{ status: number; ok: boolean; message: string; pending: boolean }> {
    const { status, data } = await call<any>('/api/vault-sites/briefing', { method: 'POST', body: JSON.stringify(b) }, 30_000);
    return { status, ok: !!data.ok, message: data.message ?? data.error ?? `HTTP ${status}`, pending: data.status === 'pendente_configuracao' };
  },
};
