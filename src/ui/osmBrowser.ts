// Busca no OpenStreetMap feita pelo próprio navegador (Nominatim + Overpass aceitam CORS).
// Pelo Cloudflare os servidores Overpass costumam recusar (HTTP 522/504); pelo aparelho do usuário respondem.
import type { ProviderOutcome, RawBusiness } from '../core/types';
import { geocode, osmElementToBusiness, searchOsm } from '../core/providers/osm';
import { osmTagsForNiche } from '../core/providers/osmNiches';

const cache = new Map<string, { at: number; value: { results: RawBusiness[]; outcome: ProviderOutcome } }>();

export async function searchOsmInBrowser(niche: string, location: string, limit: number): Promise<{ results: RawBusiness[]; outcome: ProviderOutcome }> {
  const key = `${niche}|${location}|${limit}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return { ...hit.value, outcome: { ...hit.value.outcome, cached: true } };
  // O navegador não deixa definir User-Agent (e o cabeçalho geraria pré-checagem CORS): removido.
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    delete headers['User-Agent'];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), String(input).includes('nominatim') ? 10_000 : 12_000);
    try {
      return await fetch(input, { ...init, headers, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }) as typeof fetch;
  try {
    const r = await searchOsm(niche, location, limit, { fetchFn, userAgent: 'prospecta' }).catch(() => null);
    const value = r && r.outcome.status !== 'erro' ? { results: r.results, outcome: r.outcome } : await viaNominatim(niche, location, limit, fetchFn);
    if (value.results.length) cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    return { results: [], outcome: { provider: 'osm', status: 'erro', count: 0, message: e instanceof Error ? e.message : 'Falha no OpenStreetMap.' } };
  }
}

/** Reserva quando os servidores Overpass estão fora: busca "dentist in Palmas" no Nominatim (menos resultados). */
async function viaNominatim(niche: string, location: string, limit: number, fetchFn: typeof fetch): Promise<{ results: RawBusiness[]; outcome: ProviderOutcome }> {
  const geo = await geocode(location, { fetchFn, userAgent: 'prospecta' });
  if (!geo) return { results: [], outcome: { provider: 'osm', status: 'sem_resultados', count: 0, message: `Local "${location}" não encontrado no Brasil.` } };
  const kinds = [...new Set(osmTagsForNiche(niche).map(([, v]) => v.replace(/_/g, ' ')))].slice(0, 3);
  const now = new Date();
  const out: RawBusiness[] = [];
  for (const kind of kinds.length ? kinds : [niche]) {
    const qs = new URLSearchParams({ q: `${kind} in ${location}`, countrycodes: 'br', format: 'jsonv2', limit: '40', extratags: '1' });
    const res = await fetchFn(`https://nominatim.openstreetmap.org/search?${qs}`, {});
    if (!res.ok) continue;
    for (const it of (await res.json()) as Array<Record<string, any>>) {
      const el = { type: it.osm_type, id: it.osm_id, lat: Number(it.lat), lon: Number(it.lon), tags: { ...(it.extratags ?? {}), name: it.name, [it.category]: it.type } };
      const b = osmElementToBusiness(el, geo, `${niche} @ ${geo.displayName}`, now);
      if (b && !out.some((x) => x.name === b.name)) out.push(b);
    }
    await new Promise((r) => setTimeout(r, 1100)); // política do Nominatim: até 1 pedido por segundo
  }
  const results = out.slice(0, limit);
  return {
    results,
    outcome: { provider: 'osm', status: results.length ? 'ok' : 'sem_resultados', count: results.length, message: 'Servidores Overpass fora do ar: resultado parcial pelo Nominatim (OpenStreetMap).' },
  };
}
