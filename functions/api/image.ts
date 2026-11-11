// GET /api/image?url=<imagem pública>  |  GET /api/image?place=<places/.../photos/...>
// Busca imagens do cliente (site atual ou foto do Google Places) pelo servidor:
// evita CORS, protege contra SSRF e mantém a chave do Google fora do navegador.
import { validatePublicUrl } from '../../src/core/validation';
import { PHOTO_NAME } from '../../src/core/providers/googlePlaces';
import { type Env, errorJson, fetchWithTimeout, logError } from '../../server/http';

const MAX_BYTES = 5_000_000;
const ALLOWED = /^image\/(png|jpeg|jpg|webp|gif)\b/i;

async function capped(res: Response): Promise<Uint8Array | null> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) return null;
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const params = new URL(request.url).searchParams;
  const place = params.get('place');
  const raw = params.get('url');
  let res: Response;
  try {
    if (place) {
      if (!PHOTO_NAME.test(place)) return errorJson(400, 'Referência de foto inválida.');
      if (!env.GOOGLE_PLACES_API_KEY) return errorJson(501, 'Fotos do Google exigem GOOGLE_PLACES_API_KEY.');
      res = await fetchWithTimeout(
        `https://places.googleapis.com/v1/${place}/media?maxWidthPx=1600&key=${encodeURIComponent(env.GOOGLE_PLACES_API_KEY)}`,
        {},
        15_000,
      );
    } else {
      let current = validatePublicUrl(raw);
      if (!current.ok) return errorJson(400, current.error);
      let hops = 0;
      for (;;) {
        res = await fetchWithTimeout(current.value.toString(), { redirect: 'manual', headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0 (compatible; ProspectaAudit/0.1)' } }, 12_000);
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
          if (++hops > 4) return errorJson(502, 'Redirecionamentos demais.');
          current = validatePublicUrl(new URL(loc, current.value).toString());
          if (!current.ok) return errorJson(400, `Redirecionamento bloqueado: ${current.error}`);
          continue;
        }
        break;
      }
    }
  } catch (err) {
    logError('image', err, env);
    return errorJson(502, 'Não foi possível buscar a imagem.');
  }

  if (!res!.ok) return errorJson(502, `Origem respondeu HTTP ${res!.status}.`);
  const type = res!.headers.get('content-type') ?? '';
  if (!ALLOWED.test(type)) return errorJson(415, 'O arquivo não é uma imagem PNG/JPG/WEBP/GIF.');
  const bytes = await capped(res!);
  if (!bytes) return errorJson(413, 'Imagem maior que 5 MB.');
  return new Response(bytes, {
    headers: {
      'Content-Type': type.split(';')[0],
      'Cache-Control': 'private, max-age=86400',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
};
