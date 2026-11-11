// Middleware de /api/*: autenticação opcional por token, cabeçalhos de segurança e tratamento de erros.
import { type Env, HttpError, errorJson, logError } from '../../server/http';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const MAX_FAILS = 8;
const WINDOW_S = 15 * 60;

/** Contador de falhas por IP no Cache do Cloudflare (por data center; sem custo de escrita no KV). */
function failKey(ip: string): Request {
  return new Request(`https://rl.prospecta.invalid/${encodeURIComponent(ip)}`);
}
async function failCount(ip: string): Promise<number> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const hit = cache ? await cache.match(failKey(ip)) : undefined;
  return hit ? Number(await hit.text()) || 0 : 0;
}
async function setFailCount(ip: string, n: number): Promise<void> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (cache) await cache.put(failKey(ip), new Response(String(n), { headers: { 'Cache-Control': `max-age=${WINDOW_S}` } }));
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  // trim: segredos colados pelo terminal podem chegar com quebra de linha no fim.
  const expected = env.APP_ACCESS_TOKEN?.trim();
  if (expected) {
    // Bloqueio contra tentativas de adivinhar o código: muitas falhas do mesmo IP → espera 15 min.
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    const fails = await failCount(ip);
    if (fails >= MAX_FAILS) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas com código inválido. Tente novamente em 15 minutos.', code: 'rate_limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(WINDOW_S), 'Cache-Control': 'no-store' },
      });
    }
    const got = (request.headers.get('x-app-token') ?? '').trim();
    if (!timingSafeEqual(got, expected)) {
      // Requisições sem código nenhum (ex.: o app abrindo pela 1ª vez) não contam como tentativa.
      if (got) await setFailCount(ip, fails + 1);
      return errorJson(401, 'Token de acesso ausente ou inválido.', 'unauthorized');
    }
  }

  try {
    const res = await ctx.next();
    const out = new Response(res.body, res);
    out.headers.set('X-Content-Type-Options', 'nosniff');
    out.headers.set('Referrer-Policy', 'no-referrer');
    return out;
  } catch (err) {
    if (err instanceof HttpError) return errorJson(err.status, err.message);
    logError('api', err, env);
    return errorJson(500, 'Erro interno. Veja os logs da Function.');
  }
};
