// Fotos por serviço via Pexels (gratuito; licença permite uso comercial sem atribuição obrigatória — creditamos mesmo assim).
// Só é usado quando o segredo PEXELS_API_KEY existe; sem ele, o app usa o Openverse.
import type { StockPhoto } from './openverse';

export async function searchPexels(q: string, key: string, fetchFn: typeof fetch): Promise<StockPhoto[]> {
  const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query: q, orientation: 'landscape', per_page: '12', size: 'medium' })}`;
  const res = await fetchFn(url, { headers: { Authorization: key, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const data = (await res.json()) as { photos?: Array<Record<string, any>> };
  return (data.photos ?? [])
    .filter((p) => typeof p.src?.landscape === 'string' && /^https:\/\/images\.pexels\.com\//.test(p.src.landscape))
    .map((p) => ({
      url: p.src.landscape as string,
      width: 1200,
      height: 627,
      creator: typeof p.photographer === 'string' ? p.photographer.slice(0, 60) : undefined,
      license: 'Pexels',
      licenseUrl: 'https://www.pexels.com/license/',
      source: 'pexels',
      title: typeof p.alt === 'string' ? p.alt.slice(0, 80) : undefined,
      landing: typeof p.url === 'string' ? p.url : undefined,
    }));
}
