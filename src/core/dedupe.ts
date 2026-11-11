// Consolidação e deduplicação de empresas vindas de vários provedores.
import type { Lead, RawBusiness, SourceRecord } from './types';
import { distanceMeters, domainOf, isNonOwnSite, nameKey, normText } from './normalize';

export type DuplicateReason = 'id_origem' | 'dominio' | 'telefone' | 'nome_local';

interface Comparable {
  name: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  city?: string;
  lat?: number;
  lon?: number;
  sources?: SourceRecord[];
  source?: SourceRecord;
}

function sourcesOf(x: Comparable): SourceRecord[] {
  return x.sources ?? (x.source ? [x.source] : []);
}

function ownDomain(x: Comparable): string | undefined {
  return x.website && !isNonOwnSite(x.website) ? domainOf(x.website) : undefined;
}

/** Decide se duas empresas são a mesma. Retorna o motivo ou null. */
export function sameBusiness(a: Comparable, b: Comparable): DuplicateReason | null {
  const sa = sourcesOf(a);
  const sb = sourcesOf(b);
  for (const x of sa) {
    if (!x.externalId) continue;
    if (sb.some((y) => y.provider === x.provider && y.externalId === x.externalId)) return 'id_origem';
  }

  const da = ownDomain(a);
  if (da && da === ownDomain(b)) return 'dominio';

  const phonesA = [a.phone, a.whatsapp].filter(Boolean);
  const phonesB = new Set([b.phone, b.whatsapp].filter(Boolean));
  if (phonesA.some((p) => phonesB.has(p))) return 'telefone';

  const na = nameKey(a.name);
  if (na && na === nameKey(b.name)) {
    if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
      if (distanceMeters({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) < 250) return 'nome_local';
    } else if (a.city && b.city && normText(a.city) === normText(b.city)) {
      return 'nome_local';
    }
  }
  return null;
}

export function newId(): string {
  // crypto.randomUUID só existe em páginas seguras (https/localhost); no celular pelo IP da rede local ela não existe.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function leadFromRaw(raw: RawBusiness, niche: string, now = new Date().toISOString()): Lead {
  const { source, ...rest } = raw;
  return {
    ...rest,
    id: newId(),
    niche: niche.trim(),
    sources: [source],
    isDemo: source.provider === 'demo',
    status: 'novo',
    contactLog: [],
    manualSignals: {},
    deliveries: [],
    createdAt: now,
    updatedAt: now,
  };
}

const FILLABLE = [
  'category', 'phone', 'phoneRaw', 'whatsapp', 'website', 'address', 'neighborhood', 'city', 'state',
  'lat', 'lon', 'rating', 'reviewCount', 'businessStatus', 'hours', 'summary', 'instagram', 'photos', 'imageUrls', 'email', 'categories', 'reviews',
] as const;

/** Completa campos vazios do lead com o novo registro e anexa a origem. Não sobrescreve dados existentes. */
export function mergeIntoLead(lead: Lead, raw: RawBusiness, now = new Date().toISOString()): Lead {
  const next: Lead = { ...lead, sources: [...lead.sources] };
  for (const k of FILLABLE) {
    if (next[k] == null && raw[k] != null) {
      (next as unknown as Record<string, unknown>)[k] = raw[k];
    }
  }
  // Avaliações: mantém o dado mais recente de quem tem mais avaliações (fonte mais robusta).
  if (raw.reviewCount != null && (lead.reviewCount == null || raw.reviewCount > lead.reviewCount)) {
    next.rating = raw.rating;
    next.reviewCount = raw.reviewCount;
  }
  const already = next.sources.some(
    (s) => s.provider === raw.source.provider && s.externalId && s.externalId === raw.source.externalId,
  );
  if (!already) next.sources.push(raw.source);
  next.updatedAt = now;
  return next;
}

export interface MergeReport {
  leads: Lead[];
  added: number;
  merged: number;
  mergedReasons: Partial<Record<DuplicateReason, number>>;
}

/** Incorpora resultados de busca à base existente sem criar duplicidades. */
export function consolidate(existing: Lead[], incoming: RawBusiness[], niche: string): MergeReport {
  const leads = [...existing];
  let added = 0;
  let merged = 0;
  const mergedReasons: MergeReport['mergedReasons'] = {};
  for (const raw of incoming) {
    let idx = -1;
    let reason: DuplicateReason | null = null;
    for (let i = 0; i < leads.length; i++) {
      // Dados de demonstração nunca são fundidos com dados reais.
      if (leads[i].isDemo !== (raw.source.provider === 'demo')) continue;
      reason = sameBusiness(raw, leads[i]);
      if (reason) {
        idx = i;
        break;
      }
    }
    if (idx >= 0 && reason) {
      leads[idx] = mergeIntoLead(leads[idx], raw);
      merged++;
      mergedReasons[reason] = (mergedReasons[reason] ?? 0) + 1;
    } else {
      leads.push(leadFromRaw(raw, niche));
      added++;
    }
  }
  return { leads, added, merged, mergedReasons };
}

/** Remove duplicados dentro de um mesmo lote de resultados (ex.: OSM + Google Maps), completando campos. */
export function mergeRawList(items: RawBusiness[]): RawBusiness[] {
  const out: RawBusiness[] = [];
  for (const b of items) {
    const i = out.findIndex((x) => sameBusiness(b, x));
    if (i < 0) {
      out.push(b);
      continue;
    }
    const a = out[i];
    const merged: RawBusiness = { ...a };
    for (const k of FILLABLE) {
      if (merged[k] == null && b[k] != null) (merged as unknown as Record<string, unknown>)[k] = b[k];
    }
    if (b.reviewCount != null && (a.reviewCount == null || b.reviewCount > a.reviewCount)) {
      merged.rating = b.rating;
      merged.reviewCount = b.reviewCount;
    }
    out[i] = merged;
  }
  return out;
}
