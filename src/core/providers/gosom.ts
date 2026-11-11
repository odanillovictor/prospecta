// Converte a saída JSON do coletor local (gosom/google-maps-scraper) em empresas normalizadas.
// O coletor roda no computador do usuário (coletor/server.mjs); aqui só há parsing determinístico.
import type { RawBusiness, Review } from '../types';
import { normalizeBrPhone, normalizeWebsite } from '../normalize';

const CATEGORY_PT: Record<string, string> = {
  'dental clinic': 'Clínica odontológica', dentist: 'Dentista', orthodontist: 'Ortodontista', 'oral surgeon': 'Cirurgião bucomaxilo',
  'cosmetic dentist': 'Dentista estético', 'dental implants periodontist': 'Implantes dentários',
  'real estate agency': 'Imobiliária', 'real estate agent': 'Corretor de imóveis', 'real estate consultant': 'Consultor imobiliário',
  lawyer: 'Advogado', 'law firm': 'Escritório de advocacia', attorney: 'Advogado', accountant: 'Contador', 'accounting firm': 'Contabilidade',
  restaurant: 'Restaurante', 'pizza restaurant': 'Pizzaria', 'hamburger restaurant': 'Hamburgueria', 'fast food restaurant': 'Lanchonete',
  cafe: 'Café', 'coffee shop': 'Cafeteria', bakery: 'Padaria', 'ice cream shop': 'Sorveteria', bar: 'Bar',
  'beauty salon': 'Salão de beleza', 'hair salon': 'Cabeleireiro', 'barber shop': 'Barbearia', 'nail salon': 'Manicure', 'aesthetics clinic': 'Clínica de estética',
  'pet store': 'Pet shop', 'pet groomer': 'Banho e tosa', veterinarian: 'Veterinário', 'animal hospital': 'Hospital veterinário',
  gym: 'Academia', 'fitness center': 'Academia', 'pilates studio': 'Pilates', 'yoga studio': 'Yoga',
  physiotherapist: 'Fisioterapeuta', 'physical therapy clinic': 'Fisioterapia', psychologist: 'Psicólogo', nutritionist: 'Nutricionista',
  'medical clinic': 'Clínica médica', doctor: 'Médico', 'auto repair shop': 'Oficina mecânica', 'car repair and maintenance service': 'Oficina mecânica',
  'driving school': 'Autoescola', 'architecture firm': 'Escritório de arquitetura', architect: 'Arquiteto', optician: 'Ótica', florist: 'Floricultura',
  'clothing store': 'Loja de roupas', 'hardware store': 'Material de construção', 'furniture store': 'Móveis', photographer: 'Fotógrafo',
  'tattoo shop': 'Estúdio de tatuagem', 'language school': 'Escola de idiomas', 'insurance agency': 'Corretora de seguros', 'marketing agency': 'Agência de marketing',
  'construction company': 'Construtora', 'general contractor': 'Construtora',
};

const DAYS: Array<[string, string]> = [
  ['Monday', 'Seg'], ['Tuesday', 'Ter'], ['Wednesday', 'Qua'], ['Thursday', 'Qui'], ['Friday', 'Sex'], ['Saturday', 'Sáb'], ['Sunday', 'Dom'],
];

export function categoryPt(c: string | undefined): string | undefined {
  if (!c) return undefined;
  return CATEGORY_PT[c.trim().toLowerCase()] ?? c.trim();
}

/** "8 AM–6 PM" → "08:00–18:00"; "Open 24 hours" → "24 horas"; "Closed" → "fechado". */
export function to24h(range: string): string {
  const r = range.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/open 24 hours/i.test(r)) return '24 horas';
  if (/^closed$/i.test(r)) return 'fechado';
  const parts = r.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return r;
  // "1:30–7 PM": o primeiro herda o AM/PM do segundo quando não tem.
  const suffix2 = parts[1].match(/\b(AM|PM)\b/i)?.[1];
  const conv = (p: string, fallback?: string) => {
    const m = p.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!m) return p;
    let h = Number(m[1]);
    const mer = (m[3] ?? fallback ?? '').toUpperCase();
    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
  };
  return `${conv(parts[0], suffix2)}–${conv(parts[1])}`;
}

/** Converte open_hours {Monday: ["8 AM–6 PM"], ...} em texto curto, agrupando dias iguais. */
export function formatHours(oh: unknown): string | undefined {
  if (!oh || typeof oh !== 'object') return undefined;
  const map = oh as Record<string, unknown>;
  const rows = DAYS.filter(([en]) => Array.isArray(map[en])).map(([en, pt]) => [pt, (map[en] as string[]).map(to24h).join(', ')] as const);
  if (!rows.length) return undefined;
  const groups: Array<{ from: string; to: string; value: string }> = [];
  for (const [day, value] of rows) {
    const last = groups[groups.length - 1];
    if (last && last.value === value) last.to = day;
    else groups.push({ from: day, to: day, value });
  }
  return groups.map((g) => `${g.from === g.to ? g.from : `${g.from}–${g.to}`}: ${g.value}`).join(' · ').slice(0, 300);
}

/** "R. XV de Novembro, 866 - Centro, Blumenau - SC, 89010-000" → bairro, cidade, UF. */
export function splitBrAddress(address: string | undefined): { neighborhood?: string; city?: string; state?: string } {
  if (!address) return {};
  const m = address.match(/-\s*([^,\-]+),\s*([^,\-]+?)\s*-\s*([A-Z]{2})\b/);
  if (m) return { neighborhood: m[1].trim(), city: m[2].trim(), state: m[3] };
  const m2 = address.match(/([^,\-]+?)\s*-\s*([A-Z]{2})\b/);
  return m2 ? { city: m2[1].trim(), state: m2[2] } : {};
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && String(v ?? '') !== '' ? n : undefined;
}

function imagesOf(it: Record<string, any>): string[] {
  const out: string[] = [];
  const add = (u: unknown) => {
    if (typeof u !== 'string' || !/^https:\/\//.test(u)) return;
    // Miniatura do Google (=w408-h544-…) → versão grande (o Google entrega até o tamanho original).
    const big = /googleusercontent\.com\//.test(u) ? u.replace(/=w\d+-h\d+[\w-]*$/, '=w1600-h1200-k-no') : u;
    if (!out.includes(big)) out.push(big);
  };
  add(it.thumbnail);
  if (Array.isArray(it.images)) for (const im of it.images) add(typeof im === 'string' ? im : im?.image);
  return out.slice(0, 12);
}

/** Avaliações do coletor (modo completo): [{Name, Rating, Description, When}]. Só entram as com texto. */
export function reviewsOf(it: Record<string, any>): Review[] | undefined {
  const list = Array.isArray(it.user_reviews) ? it.user_reviews : Array.isArray(it.user_reviews_extended) ? it.user_reviews_extended : [];
  const out: Review[] = [];
  for (const r of list) {
    const text = String(r?.Description ?? r?.description ?? '').replace(/\s+/g, ' ').trim();
    const rating = Number(r?.Rating ?? r?.rating);
    const author = String(r?.Name ?? r?.name ?? '').trim();
    if (!text || !author || !(rating >= 1 && rating <= 5)) continue;
    out.push({ author: author.slice(0, 60), rating, text: text.slice(0, 600), when: r?.When ? String(r.When).slice(0, 40) : undefined, source: 'Google' });
    if (out.length >= 10) break;
  }
  return out.length ? out : undefined;
}

export function gosomItemToBusiness(it: Record<string, any>, query: string, now: Date): RawBusiness | null {
  const name = String(it.title ?? '').trim();
  if (!name) return null;
  const phone = normalizeBrPhone(it.phone);
  const addr = String(it.address ?? '').replace(/^[:\s,]+/, '').trim() || undefined;
  const parts = splitBrAddress(addr);
  const ca = it.complete_address ?? {};
  const lat = num(it.latitude);
  const lon = num(it.longitude ?? it.longtitude);
  const dataId = typeof it.data_id === 'string' && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(it.data_id) ? it.data_id : undefined;
  const link = typeof it.link === 'string' && it.link.startsWith('https://') ? it.link
    : dataId ? `https://www.google.com/maps/place/data=!4m2!3m1!1s${dataId}` : undefined;
  const cats: string[] = Array.isArray(it.categories) ? it.categories : it.category ? [it.category] : [];
  const rating = num(it.review_rating);
  const reviews = num(it.review_count);
  const images = imagesOf(it);
  const email = Array.isArray(it.emails) ? it.emails.find((e: unknown) => typeof e === 'string' && /@/.test(e)) : undefined;
  return {
    name,
    category: categoryPt(cats[0]),
    categories: cats.length ? [...new Set(cats.map((c) => categoryPt(c)!).filter(Boolean))].slice(0, 8) : undefined,
    phone: phone.e164,
    phoneRaw: it.phone || undefined,
    website: normalizeWebsite(it.web_site ?? it.website),
    address: addr,
    neighborhood: ca.borough || parts.neighborhood,
    city: ca.city || parts.city,
    state: ca.state || parts.state,
    lat: lat != null && Math.abs(lat) <= 90 ? lat : undefined,
    lon: lon != null && Math.abs(lon) <= 180 ? lon : undefined,
    rating: rating != null && rating > 0 && rating <= 5 ? rating : undefined,
    reviewCount: reviews != null && reviews >= 0 ? Math.round(reviews) : undefined,
    businessStatus: typeof it.status === 'string' && it.status ? it.status : undefined,
    hours: formatHours(it.open_hours),
    summary: typeof it.description === 'string' && it.description.trim() ? it.description.trim().slice(0, 400) : undefined,
    imageUrls: images.length ? images : undefined,
    reviews: reviewsOf(it),
    email: email || undefined,
    source: {
      provider: 'gmaps',
      externalId: it.place_id || dataId || it.cid || undefined,
      url: link,
      collectedAt: now.toISOString(),
      query,
    },
  };
}

export function gosomToBusinesses(items: unknown, query: string, now = new Date()): RawBusiness[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => (it && typeof it === 'object' ? gosomItemToBusiness(it as Record<string, any>, query, now) : null))
    .filter((b): b is RawBusiness => !!b && !/permanently closed|fechado permanentemente/i.test(b.businessStatus ?? ''));
}
