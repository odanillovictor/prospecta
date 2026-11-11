// POST /api/search — consulta provedores reais (OSM sempre; Google Places só com chave) com cache.
import type { ProviderOutcome, RawBusiness, SearchResponse } from '../../src/core/types';
import { validateSearch } from '../../src/core/validation';
import { normText } from '../../src/core/normalize';
import { searchOsm } from '../../src/core/providers/osm';
import { searchGooglePlaces } from '../../src/core/providers/googlePlaces';
import { type Env, cached, errorJson, fetchWithTimeout, json, logError, nominatimThrottle, readJson, redact, userAgent } from '../../server/http';
import { DAILY_SEARCH_WARN, MONTHLY_SEARCHES, checkQuota, ensureUser, incrementQuota } from '../../server/quota';

const TTL = 60 * 60 * 24 * 7; // 7 dias

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const clerkId = request.headers.get('x-clerk-id');
  if (!clerkId) return errorJson(401, 'Autenticação necessária.', 'unauthorized');
  const { active } = await ensureUser(env.DB!, clerkId, request.headers.get('x-clerk-email') ?? '');
  if (!active) return errorJson(403, 'Conta ainda não ativada.', 'inactive');
  const quota = await checkQuota(env.DB!, clerkId, 'search');
  if (!quota.allowed) return errorJson(429, `Você atingiu o limite de ${MONTHLY_SEARCHES} buscas este mês.`, 'quota_exceeded');
  const dailyWarning =
    quota.dailySearches >= DAILY_SEARCH_WARN
      ? `Você já fez ${quota.dailySearches} buscas hoje. Use com calma.`
      : undefined;

  const v = validateSearch(await readJson(request));
  if (!v.ok) return errorJson(400, v.error);
  const { niche, location, providers, limit } = v.value;
  const keyBase = `${normText(niche)}|${normText(location)}|${limit}`;

  const tasks = providers.map(
    async (p): Promise<{ results: RawBusiness[]; outcome: ProviderOutcome; cacheHit: boolean; cachedAt?: number }> => {
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
            return { results: r.results, outcome: r.outcome, cachedAt: Date.now() };
          });
          return { results: value.results, outcome: { ...value.outcome, cached: hit }, cacheHit: hit, cachedAt: value.cachedAt };
        }
        if (p === 'google_places') {
          if (!env.GOOGLE_PLACES_API_KEY) {
            return {
              results: [],
              outcome: { provider: p, status: 'nao_configurado', count: 0, message: 'Defina GOOGLE_PLACES_API_KEY no servidor para habilitar.' },
              cacheHit: false,
            };
          }
          const { value, hit } = await cached(`gp|${keyBase}`, TTL, async () => {
            const r = await searchGooglePlaces(niche, location, limit, {
              apiKey: env.GOOGLE_PLACES_API_KEY!,
              fetchFn: (input, init) => fetchWithTimeout(String(input), init as RequestInit, 15_000),
            });
            return { ...r, cachedAt: Date.now() };
          });
          return { results: value.results, outcome: { ...value.outcome, cached: hit }, cacheHit: hit, cachedAt: value.cachedAt };
        }
        return { results: [], outcome: { provider: p, status: 'erro', count: 0, message: 'Provedor desconhecido.' }, cacheHit: false };
      } catch (err) {
        logError(`search:${p}`, err, env);
        const msg = err instanceof Error ? err.message : 'Falha desconhecida';
        return { results: [], outcome: { provider: p, status: 'erro', count: 0, message: redact(msg, env) }, cacheHit: false };
      }
    },
  );

  const settled = await Promise.all(tasks);
  const anyMiss = settled.some((s) => !s.cacheHit);
  if (anyMiss) await incrementQuota(env.DB!, clerkId, 'search');

  const cachedAt = settled.find((s) => s.cachedAt != null)?.cachedAt;
  const body: SearchResponse & { cachedAt?: number; warning?: string } = {
    results: settled.flatMap((s) => s.results),
    providers: settled.map((s) => s.outcome),
    query: { niche, location },
    ...(cachedAt != null ? { cachedAt } : {}),
    ...(dailyWarning ? { warning: dailyWarning } : {}),
  };
  return json(body);
};
