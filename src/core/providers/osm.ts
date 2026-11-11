// Provedor OpenStreetMap: Nominatim (geocodificação) + Overpass (empresas).
// Gratuito, dados sob licença ODbL (atribuição obrigatória). Política de uso: identificar a aplicação,
// no máximo ~1 requisição/s ao Nominatim e cache das respostas — por isso há cache na Function.
import type { ProviderOutcome, RawBusiness } from '../types';
import { joinAddress, normalizeBrPhone, normalizeWebsite, stripAccents } from '../normalize';
import { osmTagsForNiche, overpassRegex } from './osmNiches';

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Servidores públicos do Overpass, tentados em ordem quando um está sobrecarregado (comum). */
export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lon: number;
  osmType: string;
  osmId: number;
  city?: string;
  state?: string;
}

export interface ProviderContext {
  fetchFn: typeof fetch;
  userAgent: string;
  now?: Date;
  overpassUrls?: string[];
  /** Espera antes de acionar o próximo servidor Overpass em paralelo (padrão 4 s). */
  hedgeMs?: number;
}

type OverpassData = { elements?: Array<Record<string, any>> };

/**
 * Executa a query com "requisições escalonadas": começa no primeiro servidor; se ele não responder em
 * `hedgeMs` (ou falhar), dispara o próximo. O primeiro que responder vence e os demais são cancelados.
 * Mais rápido que tentar um por vez, sem bombardear todos os servidores públicos ao mesmo tempo.
 */
function runOverpass(query: string, ctx: ProviderContext): Promise<OverpassData> {
  const urls = ctx.overpassUrls?.length ? ctx.overpassUrls : OVERPASS_URLS;
  const hedgeMs = ctx.hedgeMs ?? 4000;
  const controllers = urls.map(() => new AbortController());
  const failures: string[] = urls.map(() => '');
  return new Promise((resolve, reject) => {
    let started = 0;
    let finished = 0;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const startNext = () => {
      if (done || started >= urls.length) return;
      const i = started++;
      if (timer !== undefined) clearTimeout(timer);
      if (started < urls.length) timer = setTimeout(startNext, hedgeMs);
      void attempt(i);
    };
    const fail = (i: number, msg: string) => {
      if (done) return;
      failures[i] = `${new URL(urls[i]).hostname}: ${msg}`;
      if (++finished === urls.length) {
        done = true;
        if (timer !== undefined) clearTimeout(timer);
        reject(new Error(`Servidores Overpass indisponíveis (${failures.filter(Boolean).join('; ')}). Tente novamente em alguns minutos.`));
      } else if (finished === started) startNext();
    };
    const attempt = async (i: number) => {
      try {
        const res = await ctx.fetchFn(urls[i], {
          method: 'POST',
          headers: { 'User-Agent': ctx.userAgent, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controllers[i].signal,
        });
        if (!res.ok) return fail(i, `HTTP ${res.status}`);
        const data = (await res.json()) as OverpassData;
        if (done) return;
        done = true;
        if (timer !== undefined) clearTimeout(timer);
        controllers.forEach((c, j) => j !== i && c.abort());
        resolve(data);
      } catch (e) {
        fail(i, e instanceof Error ? e.message : 'falha de rede');
      }
    };
    startNext();
  });
}

export async function geocode(location: string, ctx: ProviderContext): Promise<GeocodeResult | null> {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: location,
    countrycodes: 'br',
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    'accept-language': 'pt-BR',
  })}`;
  const res = await ctx.fetchFn(url, { headers: { 'User-Agent': ctx.userAgent, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim respondeu HTTP ${res.status}`);
  const data = (await res.json()) as Array<Record<string, any>>;
  const first = data[0];
  if (!first) return null;
  const a = first.address ?? {};
  return {
    displayName: String(first.display_name ?? location),
    lat: Number(first.lat),
    lon: Number(first.lon),
    osmType: String(first.osm_type ?? ''),
    osmId: Number(first.osm_id ?? 0),
    city: a.city ?? a.town ?? a.village ?? a.municipality,
    state: a.state,
  };
}

/** Regex tolerante a acentos: "salao" casa com "Salão". */
export function accentInsensitive(term: string): string {
  const map: Record<string, string> = { a: '[aáàâã]', e: '[eéê]', i: '[ií]', o: '[oóôõ]', u: '[uúü]', c: '[cç]' };
  return overpassRegex(stripAccents(term.toLowerCase()))
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
}

export function buildOverpassQuery(niche: string, geo: GeocodeResult, limit: number, radiusM = 5000): string {
  const scope = geo.osmType === 'relation' ? '(area.a)' : `(around:${radiusM},${geo.lat},${geo.lon})`;
  const head = geo.osmType === 'relation' ? `area(id:${3600000000 + geo.osmId})->.a;\n` : '';
  const tags = osmTagsForNiche(niche);
  const lines = tags.map(([k, v]) => `  nwr["${k}"="${v}"]["name"]${scope};`);
  // A busca por nome (regex) é cara para os servidores públicos: só é usada quando o nicho não tem tag conhecida.
  const words = stripAccents(niche).trim();
  if (!tags.length && words.length >= 3) lines.push(`  nwr["name"~"${accentInsensitive(words)}",i]${scope};`);
  return `[out:json][timeout:25];\n${head}(\n${lines.join('\n')}\n);\nout tags center qt ${Math.max(1, Math.min(limit, 500))};`;
}

const CATEGORY_KEYS = ['amenity', 'shop', 'office', 'craft', 'healthcare', 'leisure', 'tourism'];

/** Nomes em português para as categorias mais comuns do OSM (o restante aparece como no OSM). */
const CATEGORY_PT: Record<string, string> = {
  dentist: 'Dentista', doctors: 'Consultório médico', clinic: 'Clínica', pharmacy: 'Farmácia', veterinary: 'Veterinário',
  restaurant: 'Restaurante', fast_food: 'Lanchonete', cafe: 'Café', bar: 'Bar', pub: 'Bar', ice_cream: 'Sorveteria',
  bakery: 'Padaria', pastry: 'Confeitaria', confectionery: 'Doceria', supermarket: 'Supermercado', convenience: 'Mercearia',
  hairdresser: 'Salão / barbearia', beauty: 'Estética', cosmetics: 'Cosméticos', pet: 'Pet shop', pet_grooming: 'Banho e tosa',
  estate_agent: 'Imobiliária / corretor', lawyer: 'Advocacia', accountant: 'Contabilidade', tax_advisor: 'Contabilidade',
  architect: 'Arquitetura', car_repair: 'Oficina mecânica', car: 'Concessionária', driving_school: 'Autoescola',
  fitness_centre: 'Academia', sports_centre: 'Centro esportivo', physiotherapist: 'Fisioterapia', psychotherapist: 'Psicologia',
  optician: 'Ótica', florist: 'Floricultura', hotel: 'Hotel', guest_house: 'Pousada', hostel: 'Hostel', clothes: 'Roupas',
  boutique: 'Boutique', hardware: 'Material de construção', doityourself: 'Material de construção', school: 'Escola',
  language_school: 'Escola de idiomas', laundry: 'Lavanderia', dry_cleaning: 'Lavanderia', carpenter: 'Marcenaria',
  furniture: 'Móveis', electrician: 'Eletricista', plumber: 'Encanador', photographer: 'Fotografia', photo: 'Fotografia',
  tattoo: 'Tatuagem', jewelry: 'Joalheria', watches: 'Relojoaria', chocolate: 'Chocolateria',
};

export function osmElementToBusiness(el: Record<string, any>, geo: GeocodeResult, query: string, now: Date): RawBusiness | null {
  const t: Record<string, string> = el.tags ?? {};
  const name = t.name?.trim();
  if (!name) return null;
  const phoneRaw = t.phone ?? t['contact:phone'] ?? t['contact:mobile'];
  const phone = normalizeBrPhone(phoneRaw?.split(/[;,]/)[0]);
  const waRaw = t['contact:whatsapp'] ?? t.whatsapp;
  const wa = waRaw ? normalizeBrPhone(waRaw.split(/[;,]/)[0]) : undefined;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const catKey = CATEGORY_KEYS.find((k) => t[k]);
  return {
    name,
    category: catKey ? CATEGORY_PT[t[catKey]] ?? t[catKey].replace(/_/g, ' ') : undefined,
    phone: phone.e164,
    phoneRaw: phoneRaw || undefined,
    whatsapp: wa?.e164,
    website: normalizeWebsite(t.website ?? t['contact:website'] ?? t.url),
    address: joinAddress([
      [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ') || undefined,
      t['addr:suburb'],
      t['addr:city'],
    ]),
    neighborhood: t['addr:suburb'] ?? t['addr:neighbourhood'],
    city: t['addr:city'] ?? geo.city,
    state: t['addr:state'] ?? geo.state,
    lat: typeof lat === 'number' ? lat : undefined,
    lon: typeof lon === 'number' ? lon : undefined,
    hours: t.opening_hours?.slice(0, 200),
    instagram: (t['contact:instagram'] ?? t.instagram)?.match(/(?:instagram\.com\/)?@?([A-Za-z0-9_.]{2,30})\/?$/)?.[1],
    source: {
      provider: 'osm',
      externalId: `${el.type}/${el.id}`,
      url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      collectedAt: now.toISOString(),
      query,
    },
  };
}

export async function searchOsm(
  niche: string,
  location: string,
  limit: number,
  ctx: ProviderContext,
): Promise<{ results: RawBusiness[]; outcome: ProviderOutcome; geo?: GeocodeResult }> {
  const now = ctx.now ?? new Date();
  const geo = await geocode(location, ctx);
  if (!geo) {
    return { results: [], outcome: { provider: 'osm', status: 'sem_resultados', count: 0, message: `Local "${location}" não encontrado no Brasil.` } };
  }
  const query = buildOverpassQuery(niche, geo, limit);
  const data = await runOverpass(query, ctx);
  const q = `${niche} @ ${geo.displayName}`;
  const results = (data.elements ?? [])
    .map((el) => osmElementToBusiness(el, geo, q, now))
    .filter((b): b is RawBusiness => !!b)
    .slice(0, limit);
  return {
    results,
    geo,
    outcome: {
      provider: 'osm',
      status: results.length ? 'ok' : 'sem_resultados',
      count: results.length,
      message: results.length
        ? `Área: ${geo.displayName}. Dados © colaboradores do OpenStreetMap (ODbL).`
        : `Nenhuma empresa mapeada no OSM para "${niche}" em ${geo.displayName}. A cobertura do OSM varia muito por cidade.`,
    },
  };
}
