// Fotos ilustrativas por segmento via Openverse (catálogo aberto, licenças Creative Commons com uso comercial).
// Só são usadas quando não há foto real do cliente, sempre marcadas como "ilustrativa" e com crédito ao autor.

export interface StockPhoto {
  url: string;
  width: number;
  height: number;
  creator?: string;
  license: string;
  licenseUrl?: string;
  source: string;
  title?: string;
  landing?: string;
}

export const OPENVERSE_URL = 'https://api.openverse.org/v1/images/';

/** URL de tamanho seguro (≤ ~1600 px) para Wikimedia e Flickr; outras fontes são descartadas. */
export function sizedUrl(url: string, width: number): string | undefined {
  const wm = url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/);
  if (wm) {
    if (width <= 1600) return url;
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${wm[1]}/${wm[2]}/${wm[3]}/1600px-${wm[3]}`;
  }
  if (/^https:\/\/live\.staticflickr\.com\/\d+\/\w+\.(jpg|jpeg)$/i.test(url)) return url;
  return undefined;
}

// Palavras que indicam fachada/nome de outro negócio, marca ou pessoa identificável — evitadas.
const AVOID = /(storefront|store front|shop front|signage|\bsign\b|logo|building|street|\broad\b|portrait of|selfie|\bmall\b|plaza|exterior|fa[cç]ade|geograph|historic|\bearly\b|museum|antique|vintage|really old|extract|wisdom tooth|surgery|blood|injur|wound|medflag|army|military|navy|protest|\bnews\b|truck|\b(19|20)\d{2}\b|'s\b)/i;

// Títulos com nome próprio ("Office in Toronto", "Clinic of John") ou códigos de arquivo indicam lugar/pessoa real.
const PROPER = /\b(in|of|at|by|ceo|dr\.?|dra\.?)\s+[A-Z][a-z]|[,\-–]\s*[A-Z][a-z]+|\b\d{6}-[A-Z]|^[A-Z0-9_-]{6,}$/;
// Fotos pessoais/eventos (baixa qualidade para um site comercial).
const PERSONAL = /\b(memorial|battleship|statue|dad|mom|my|ever|result|was nice|wedding|party|foodporn|berlin)\b/i;
// Tags que indicam letreiro/texto, arquivo histórico, turismo ou fábrica (fotos que não servem de ilustração).
const BAD_TAGS = /\b(text|typography|signali[sz]e|sign|signage|neon|archives?|history|historic|exhibition|museum|factory|travel|tourism|market|store|shop|street|building)\b/i;

export function pickStock(results: Array<Record<string, any>>): StockPhoto[] {
  const out: StockPhoto[] = [];
  for (const r of results) {
    const w = Number(r.width);
    const h = Number(r.height);
    if (!w || !h || w < 1000 || w / h < 1.2 || w / h > 2.2) continue;
    if (AVOID.test(`${r.title ?? ''} ${(r.tags ?? []).map((t: any) => t?.name).join(' ')}`) || PROPER.test(String(r.title ?? '')) || PERSONAL.test(String(r.title ?? '')) || /\d{5,}/.test(String(r.title ?? '')) || (r.tags ?? []).some((t: any) => BAD_TAGS.test(String(t?.name ?? '')))) continue;
    const url = typeof r.url === 'string' ? sizedUrl(r.url, w) : undefined;
    if (!url) continue;
    out.push({
      url,
      width: w,
      height: h,
      creator: typeof r.creator === 'string' ? r.creator.slice(0, 60) : undefined,
      license: String(r.license ?? 'cc').toUpperCase(),
      licenseUrl: r.license_url,
      source: String(r.source ?? ''),
      title: typeof r.title === 'string' ? r.title.slice(0, 80) : undefined,
      landing: r.foreign_landing_url,
    });
  }
  return out;
}

export async function searchStock(queries: string[], fetchFn: typeof fetch, userAgent: string): Promise<StockPhoto[]> {
  const all: StockPhoto[] = [];
  for (const q of queries.slice(0, 3)) {
    const url = `${OPENVERSE_URL}?${new URLSearchParams({ q, license_type: 'commercial', page_size: '20', aspect_ratio: 'wide', mature: 'false' })}`;
    const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (!res.ok) continue;
    const data = (await res.json()) as { results?: Array<Record<string, any>> };
    for (const p of pickStock(data.results ?? [])) if (!all.some((a) => a.url === p.url)) all.push(p);
  }
  // Flickr primeiro (fotos mais limpas); Wikimedia depois (mais documental).
  all.sort((a, b) => Number(b.source === 'flickr') - Number(a.source === 'flickr'));
  return all.slice(0, 18);
}

export function stockCredit(p: StockPhoto): string {
  if (p.source === 'pexels') return `${p.creator ?? 'autor desconhecido'} (Pexels)`;
  if (p.source === 'pixabay') return `${p.creator ?? 'autor desconhecido'} (Pixabay)`;
  if (p.source === 'wikimedia') return `${p.creator ?? 'autor desconhecido'} (Wikimedia Commons, ${p.license})`;
  return `${p.creator ?? 'autor desconhecido'} (${p.license === 'CC0' || p.license === 'PDM' ? p.license : `CC ${p.license}`})`;
}

// Títulos de objetos/produtos/diagramas (não servem como foto do serviço).
const OBJECTS = /\b(disc|disk|usb|drive|kit|kits|illustration|diagram|logo|poster|book|cover|x-?ray|model|toy|sticker|cartoon|drawing|chart|sign|card|flyer|ad)\b/i;

/** Busca uma foto para UM serviço: exige que o título/tags tenham as palavras da consulta (relevância). */
export async function searchServiceStock(q: string, fetchFn: typeof fetch, userAgent: string): Promise<StockPhoto[]> {
  const url = `${OPENVERSE_URL}?${new URLSearchParams({ q, license_type: 'commercial', page_size: '20', aspect_ratio: 'wide', mature: 'false' })}`;
  const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<Record<string, any>> };
  const words = q.split(' ').filter((w) => w.length > 2);
  const relevant = (data.results ?? []).filter((r) => {
    const text = `${r.title ?? ''} ${(r.tags ?? []).map((t: any) => t?.name).join(' ')}`.toLowerCase();
    // O título precisa citar o assunto principal (ex.: "dental"); só tags não bastam (vêm muitas fotos aleatórias).
    return !OBJECTS.test(String(r.title ?? '')) && String(r.title ?? '').toLowerCase().includes(words[0]) && words.filter((w) => text.includes(w)).length >= Math.min(2, words.length);
  });
  return pickStock(relevant).slice(0, 8);
}
