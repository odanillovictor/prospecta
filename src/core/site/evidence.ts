// Confirmação de serviços: só aparece no site o que tem evidência nos dados do próprio negócio
// (categorias e resumo do Google Maps, textos do site atual dele) ou é o essencial do segmento.
import type { Lead } from '../types';
import { normText } from '../normalize';
import type { ServiceItem } from './packs';

export type ServiceSource = 'maps' | 'site' | 'essencial' | 'whatsapp';

export interface ServiceEvidence {
  title: string;
  source: ServiceSource;
}

/** Palavras genéricas que não provam um serviço. */
const WEAK = new Set(['atendimento', 'servicos', 'tratamentos', 'especiais', 'masculino', 'feminino', 'infantil', 'geral', 'acabamento', 'consultoria', 'tecnica', 'planejamento', 'ocasioes']);

/** Radicais do serviço (sem acento, 5+ letras, sem palavras genéricas): "Sobrancelhas" → "sobran". */
export function serviceKeys(title: string): string[] {
  return normText(title)
    .split(' ')
    .filter((w) => w.length >= 5 && !WEAK.has(w))
    .map((w) => w.slice(0, Math.min(w.length, 6)));
}

function corpora(lead: Lead): { maps: string; site: string } {
  const f = lead.diagnosis?.facts;
  const maps = [lead.category, ...(lead.categories ?? []), lead.summary].filter(Boolean).join(' ');
  const site = [f?.title, f?.metaDescription, ...(f?.h1 ?? []), f?.brand?.about, ...(f?.brand?.team ?? []).map((t) => `${t.name} ${t.text ?? ''}`), f?.bodyText].filter(Boolean).join(' ');
  return { maps: normText(maps), site: normText(site) };
}

/** Fonte que confirma o serviço, ou null se não há evidência. Os 2 primeiros do pacote são o essencial do segmento. */
export function confirmService(lead: Lead, item: ServiceItem, index: number, fromCategory = false): ServiceSource | null {
  if (fromCategory) return 'maps';
  if (index < 2) return 'essencial';
  const keys = serviceKeys(item.title);
  if (!keys.length) return null;
  const c = corpora(lead);
  if (keys.some((k) => c.maps.includes(k))) return 'maps';
  if (keys.some((k) => c.site.includes(k))) return 'site';
  return null;
}

export const SOURCE_LABEL: Record<ServiceSource, string> = { whatsapp: 'catálogo do WhatsApp', maps: 'Google Maps', site: 'site atual do cliente', essencial: 'essencial do segmento' };
