// Cliente do serviço local do robô (npm run robo). O serviço fala com a extensão no Chrome do usuário.
import { store } from './store';
import { ApiError } from './api';

export interface RobotStatus {
  ok: boolean;
  whatsapp: 'conectado' | 'qr' | 'carregando' | 'extensao_ausente';
  titulo: string | null;
  envioReal: boolean;
  pausado: boolean;
  enviadasHoje: number;
  tetoDia: number;
  agente: boolean;
  ocupado: boolean;
}

export interface RobotInboxMessage {
  dir: 'in' | 'out';
  text: string;
  at: string | null;
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const base = store.getSettings().robot.serviceUrl.replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new ApiError(res.status, body.error || `Robô respondeu HTTP ${res.status}.`);
    return body;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'Serviço do robô desligado. Rode "npm run robo" no computador.');
  } finally {
    clearTimeout(timer);
  }
}

export const robotApi = {
  status: () => call<RobotStatus>('/status', {}, 4000),
  /** Escreve (modo teste) ou envia (modo real) a mensagem na conversa do número. Pode levar até ~2 min. */
  send: (phone: string, text: string, dryRun: boolean) => call<{ ok: boolean; enviado: boolean; teste: boolean; aviso?: string }>('/enviar', { method: 'POST', body: JSON.stringify({ phone, text, dryRun }) }, 170_000),
  conversa: (phone: string) => call<{ ok: boolean; messages: RobotInboxMessage[] }>(`/conversa?phone=${encodeURIComponent(phone)}`, {}, 170_000),
  /** Catálogo do WhatsApp Business do número (itens com título, descrição, preço e foto). Pode levar ~1 min. */
  catalogo: (phone: string) => call<{ ok: boolean; catalogo: { nome: string; itens: Array<{ titulo: string; descricao: string; preco: string; imagem: string }> } }>(`/catalogo?phone=${encodeURIComponent(phone)}`, {}, 170_000),
  /** Perfil público do Instagram lido pelo Chrome (nome, bio, foto de perfil e posts reduzidos). Pode levar ~40 s. */
  instagram: (handle: string) => call<{ ok: boolean; instagram: { handle: string; nome: string; bio: string; foto: string | null; posts: Array<{ img: string; alt: string }> } }>(`/instagram?handle=${encodeURIComponent(handle)}`, {}, 90_000),
  agente: (payload: unknown) => call<{ ok: boolean; resposta: unknown }>('/agente', { method: 'POST', body: JSON.stringify(payload) }, 60_000),
  pausa: (pausado: boolean) => call<{ ok: boolean; pausado: boolean }>('/pausa', { method: 'POST', body: JSON.stringify({ pausado }) }, 4000),
  diagnostico: () => call<{ ok: boolean; diagnostico: Record<string, unknown> }>('/diagnostico', {}, 60_000),
};
