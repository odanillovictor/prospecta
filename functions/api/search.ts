// POST /api/search — consulta provedores reais (OSM sempre; Google Places só com chave) com cache.
import type { ProviderOutcome, RawBusiness, SearchResponse } from '../../src/core/types';
import { validateSearch } from '../../src/core/validation';
import { normText } from '../../src/core/normalize';
import { searchOsm } from '../../src/core/providers/osm';
import { searchGooglePlaces } from '../../src/core/providers/googlePlaces';
import { type Env, cached, errorJson, fetchWithTimeout, json, logError, nominatimThrottle, readJson, redact, userAgent } from '../../server/http';

const TTL = 60 * 60 * 24; // 24h

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const v = validateSearch(await readJson(request));
  if (!v.ok) return errorJson(400, v.error);
  const { niche, location, providers, limit } = v.value;
  const keyBase = `${normText(niche)}|${normText(location)}|${limit}`;

  const tasks = providers.map(async (p): Promise<{ results: RawBusiness[]; outcome: ProviderOutcome }> => {
    try {
      if (p === 'osm') {
        const { value, hit } = await cached(`osm|${keyBase}`, TTL, async () => {
          const r = await searchOsm(niche, location, limit, {
            userAgent: userAgent(env),
            overpassUrls: env.OVERPASS_URLS?.split(',').map((u) => u.trim()).filter((u) => u.startsWith('https://')),
            fetchFn: async (input, init) => {
              const url = String(input);
              if (url.includes('nominatim')) await nominatimThrottle();
              return fetchWithTimeout(url, init as RequestInit, url.includes('nominatim') ? 10_000 : 45_000);
            },
          });
          return { results: r.results, outcome: r.outcome };
        });
        return { results: value.results, outcome: { ...value.outcome, cached: hit } };
      }
      if (p === 'google_places') {
        if (!env.GOOGLE_PLACES_API_KEY) {
          return {
            results: [],
            outcome: { provider: p, status: 'nao_configurado', count: 0, message: 'Defina GOOGLE_PLACES_API_KEY no servidor para habilitar.' },
          };
        }
        const { value, hit } = await cached(`gp|${keyBase}`, TTL, () =>
          searchGooglePlaces(niche, location, limit, {
            apiKey: env.GOOGLE_PLACES_API_KEY!,
            fetchFn: (input, init) => fetchWithTimeout(String(input), init as RequestInit, 15_000),
          }),
        );
        return { results: value.results, outcome: { ...value.outcome, cached: hit } };
      }
      return { results: [], outcome: { provider: p, status: 'erro', count: 0, message: 'Provedor desconhecido.' } };
    } catch (err) {
      logError(`search:${p}`, err, env);
      const msg = err instanceof Error ? err.message : 'Falha desconhecida';
      return { results: [], outcome: { provider: p, status: 'erro', count: 0, message: redact(msg, env) } };
    }
  });

  const settled = await Promise.all(tasks);
  const body: SearchResponse = {
    results: settled.flatMap((s) => s.results),
    providers: settled.map((s) => s.outcome),
    query: { niche, location },
  };
  return json(body);
};
