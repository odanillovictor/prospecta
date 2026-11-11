// Fotos por serviço via Pixabay (gratuito; licença permite uso comercial). Só é usado quando o segredo
// PIXABAY_API_KEY existe. As imagens são embutidas no site (data URL), sem link direto para o Pixabay.
import type { StockPhoto } from './openverse';

const FAKE = /\b(cartoon|illustration|figures?|figurine|miniature|doll|toy|3d|render|drawing|clipart|ai generated|generated|lego|plastic)\b/i;

export async function searchPixabay(q: string, key: string, fetchFn: typeof fetch): Promise<StockPhoto[]> {
  const url = `https://pixabay.com/api/?${new URLSearchParams({ key, q, image_type: 'photo', orientation: 'horizontal', safesearch: 'true', per_page: '20', min_width: '1000', order: 'popular' })}`;
  let res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  // Limite de ritmo do Pixabay (429): espera e tenta de novo, até 2 vezes.
  for (let i = 0; res.status === 429 && i < 2; i++) {
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  }
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status} (limite ${res.headers.get('x-ratelimit-limit') ?? '?'}, restante ${res.headers.get('x-ratelimit-remaining') ?? '?'}, volta em ${res.headers.get('x-ratelimit-reset') ?? '?'}s)`);
  const data = (await res.json()) as { hits?: Array<Record<string, any>>; total?: number };
  if (!data.hits?.length) throw new Error(`Pixabay: 0 fotos para "${q}" (total ${data.total ?? 0})`);
  return (data.hits ?? [])
    // Fora: ilustração, boneco/miniatura, desenho e PNG (costumam ser arte gerada, não foto real).
    .filter((h) => typeof h.largeImageURL === 'string' && /^https:\/\/pixabay\.com\/.*\.jpe?g$/i.test(h.largeImageURL) && !FAKE.test(String(h.tags ?? '')))
    .map((h) => ({
      url: h.largeImageURL as string,
      width: Number(h.imageWidth) || 1280,
      height: Number(h.imageHeight) || 853,
      creator: typeof h.user === 'string' ? h.user.slice(0, 60) : undefined,
      license: 'Pixabay',
      licenseUrl: 'https://pixabay.com/service/license-summary/',
      source: 'pixabay',
      title: typeof h.tags === 'string' ? h.tags.slice(0, 80) : undefined,
      landing: typeof h.pageURL === 'string' ? h.pageURL : undefined,
    }));
}
