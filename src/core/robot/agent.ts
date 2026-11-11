// Contrato com o agente de vendas do usuário (opcional). O app monta o pedido e valida a resposta;
// quem fala com o agente é o serviço local (robo/), então segredos e CORS ficam fora do navegador.
import type { Lead } from '../types';
import type { SellerProfile } from '../pitch';
import { isOptOut } from './guards';

export interface AgentRequest {
  objective: string;
  stage: string;
  seller: SellerProfile;
  lead: {
    name: string;
    niche: string;
    city?: string;
    hasOwnSite: boolean;
    website?: string;
    rating?: number;
    reviewCount?: number;
    previewUrl?: string;
    problems: string[];
  };
  history: Array<{ dir: 'out' | 'in'; text: string; at: string }>;
  constraints: { maxChars: number; language: 'pt-BR'; noPromises: true; stopOnOptOut: true };
}

export type AgentAction = { action: 'send'; text: string; note?: string } | { action: 'wait'; waitHours: number; note?: string } | { action: 'stop'; note?: string } | { action: 'handoff'; note?: string };

const MAX_CHARS = 600;

/** Pedido enviado ao agente: só dados comerciais do lead, nada de segredos. */
export function buildAgentRequest(lead: Lead, seller: SellerProfile): AgentRequest {
  const problems = (lead.diagnosis?.checks ?? []).filter((c) => c.result === 'problema').sort((a, b) => a.priority - b.priority).slice(0, 4).map((c) => c.label);
  return {
    objective: 'Vender a criação ou melhoria do site deste negócio, de forma honesta, curta e sem pressão. Parar se o contato pedir.',
    stage: lead.robot?.stage ?? 'abertura',
    seller,
    lead: {
      name: lead.name.replace(/^\[DEMO\]\s*/, ''),
      niche: lead.niche,
      city: lead.city,
      hasOwnSite: !!lead.website,
      website: lead.website,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      previewUrl: lead.siteDraft?.previewUrl,
      problems,
    },
    history: (lead.robot?.messages ?? []).filter((m) => m.state === 'enviada' || m.state === 'teste' || m.state === 'recebida').map((m) => ({ dir: m.dir, text: m.text, at: m.at })),
    constraints: { maxChars: MAX_CHARS, language: 'pt-BR', noPromises: true, stopOnOptOut: true },
  };
}

/** Valida a resposta do agente (nunca confie nela): ação conhecida, texto limpo e curto, sem contornar pedido de parada. */
export function parseAgentResponse(raw: unknown, lastInbound?: string): AgentAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const note = typeof r.note === 'string' ? r.note.slice(0, 200) : undefined;
  if (lastInbound && isOptOut(lastInbound)) return { action: 'stop', note: 'Contato pediu para parar.' };
  switch (r.action) {
    case 'send': {
      const text = typeof r.text === 'string' ? r.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() : '';
      if (!text) return undefined;
      return { action: 'send', text: text.slice(0, MAX_CHARS), note };
    }
    case 'wait': {
      const h = Number(r.waitHours);
      return Number.isFinite(h) && h > 0 ? { action: 'wait', waitHours: Math.min(h, 24 * 14), note } : undefined;
    }
    case 'stop':
      return { action: 'stop', note };
    case 'handoff':
      return { action: 'handoff', note };
    default:
      return undefined;
  }
}
