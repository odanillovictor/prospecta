// Provedor Google Places API (New) — Text Search. Só é chamado com GOOGLE_PLACES_API_KEY configurada
// no servidor. Implementado conforme a documentação pública; NÃO foi exercitado com uma chave real
// neste ambiente (ver docs/INTEGRACOES.md). Custo: cobrado por requisição, e pedir telefone/site/avaliações
// coloca a chamada em um SKU mais caro. Termos: só o place_id pode ser armazenado indefinidamente.
import type { ProviderOutcome, RawBusiness } from '../types';
import { normalizeBrPhone, normalizeWebsite } from '../normalize';

export const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

/** Formato do nome de foto da Places API (New); usado também para validar pedidos ao proxy de imagens. */
export const PHOTO_NAME = /^places\/[\w-]{10,300}\/photos\/[\w-]{10,600}$/;

export const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.editorialSummary',
  'places.photos',
  'places.reviews',
  'nextPageToken',
].join(',');

interface PlacesCtx {
  fetchFn: typeof fetch;
  apiKey: string;
  now?: Date;
}

function component(p: Record<string, any>, type: string, short = false): string | undefined {
  const c = (p.addressComponents ?? []).find((x: any) => (x.types ?? []).includes(type));
  return c ? (short ? c.shortText : c.longText) : undefined;
}

export function placeToBusiness(p: Record<string, any>, query: string, now: Date): RawBusiness | null {
  const name = p.displayName?.text?.trim();
  if (!name) return null;
  const phoneRaw = p.internationalPhoneNumber ?? p.nationalPhoneNumber;
  const phone = normalizeBrPhone(phoneRaw);
  return {
    name,
    category: p.primaryTypeDisplayName?.text,
    phone: phone.e164,
    phoneRaw,
    website: normalizeWebsite(p.websiteUri),
    address: p.formattedAddress,
    neighborhood: component(p, 'sublocality_level_1') ?? component(p, 'sublocality'),
    city: component(p, 'administrative_area_level_2') ?? component(p, 'locality'),
    state: component(p, 'administrative_area_level_1', true),
    lat: p.location?.latitude,
    lon: p.location?.longitude,
    rating: typeof p.rating === 'number' ? p.rating : undefined,
    reviewCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
    businessStatus: p.businessStatus,
    hours: Array.isArray(p.regularOpeningHours?.weekdayDescriptions) ? p.regularOpeningHours.weekdayDescriptions.join(' · ').slice(0, 300) : undefined,
    summary: typeof p.editorialSummary?.text === 'string' ? p.editorialSummary.text.slice(0, 400) : undefined,
    photos: Array.isArray(p.photos)
      ? p.photos
          .filter((ph: any) => typeof ph?.name === 'string' && PHOTO_NAME.test(ph.name))
          .slice(0, 10)
          .map((ph: any) => ({ name: ph.name, attribution: ph.authorAttributions?.[0]?.displayName }))
      : undefined,
    reviews: Array.isArray(p.reviews)
      ? p.reviews
          .filter((r: any) => r?.text?.text && r?.authorAttribution?.displayName && r?.rating)
          .slice(0, 5)
          .map((r: any) => ({ author: String(r.authorAttribution.displayName).slice(0, 60), rating: Number(r.rating), text: String(r.text.text).slice(0, 600), when: r.relativePublishTimeDescription, source: 'Google' as const }))
      : undefined,
    source: { provider: 'google_places', externalId: p.id, url: p.googleMapsUri, collectedAt: now.toISOString(), query },
  };
}

export async function searchGooglePlaces(
  niche: string,
  location: string,
  limit: number,
  ctx: PlacesCtx,
): Promise<{ results: RawBusiness[]; outcome: ProviderOutcome }> {
  const now = ctx.now ?? new Date();
  const textQuery = `${niche} em ${location}`;
  const results: RawBusiness[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const res = await ctx.fetchFn(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': ctx.apiKey,
        'X-Goog-FieldMask': PLACES_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    if (!res.ok) {
      // Não repassa o corpo bruto (pode conter detalhes da conta); só o status.
      throw new Error(`Google Places respondeu HTTP ${res.status}${res.status === 403 ? ' (chave inválida ou API não habilitada)' : res.status === 429 ? ' (cota excedida)' : ''}`);
    }
    const data = (await res.json()) as { places?: Array<Record<string, any>>; nextPageToken?: string };
    for (const p of data.places ?? []) {
      if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
      const b = placeToBusiness(p, textQuery, now);
      if (b) results.push(b);
    }
    pageToken = data.nextPageToken;
    pages++;
  } while (pageToken && results.length < limit && pages < 3);

  const sliced = results.slice(0, limit);
  return {
    results: sliced,
    outcome: { provider: 'google_places', status: sliced.length ? 'ok' : 'sem_resultados', count: sliced.length },
  };
}
