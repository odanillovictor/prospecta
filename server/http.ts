// Utilitários das Pages Functions: env tipado, respostas JSON, cache e logs sem vazar segredos.

export interface Env {
  APP_ACCESS_TOKEN?: string;
  GOOGLE_PLACES_API_KEY?: string;
  PAGESPEED_API_KEY?: string;
  OSM_CONTACT?: string;
  /** Lista separada por vírgulas de servidores Overpass (opcional; há padrões com failover). */
  OVERPASS_URLS?: string;
  /** KV com as prévias publicadas dos sites gerados. */
  PREVIEWS?: KVNamespace;
  VAULT_SITES_ENDPOINT?: string;
  VAULT_SITES_TOKEN?: string;
  /** Chave gratuita do Pexels (fotos dos serviços). Opcional: sem ela usa o Openverse. */
  PEXELS_API_KEY?: string;
  /** Chave gratuita do Pixabay (fotos dos serviços). Tem prioridade sobre o Pexels. */
  PIXABAY_API_KEY?: string;
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export function errorJson(status: number, error: string, code?: string): Response {
  return json({ error, code }, status);
}

export async function readJson(request: Request, maxBytes = 200_000): Promise<unknown> {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new HttpError(413, 'Corpo da requisição grande demais.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Corpo da requisição grande demais.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Remove possíveis segredos de mensagens antes de logar/retornar. */
export function redact(message: string, env: Env): string {
  let out = message;
  for (const v of [env.GOOGLE_PLACES_API_KEY, env.PAGESPEED_API_KEY, env.VAULT_SITES_TOKEN, env.APP_ACCESS_TOKEN]) {
    if (v && v.length > 4) out = out.split(v).join('***');
  }
  return out.replace(/key=[A-Za-z0-9_-]{10,}/g, 'key=***');
}

export function logError(scope: string, err: unknown, env: Env): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${scope}] ${redact(msg, env)}`);
}

export function userAgent(env: Env): string {
  return `prospecta/0.1 (${env.OSM_CONTACT || 'contato nao configurado'})`;
}

/** Cache via Cache API do Cloudflare (por data center). Chave sintética em domínio interno. */
export async function cached<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const req = new Request(`https://cache.prospecta.invalid/${encodeURIComponent(key)}`);
  if (cache) {
    const hit = await cache.match(req);
    if (hit) return { value: (await hit.json()) as T, hit: true };
  }
  const value = await produce();
  if (cache) {
    await cache.put(req, new Response(JSON.stringify(value), { headers: { 'Cache-Control': `public, max-age=${ttlSeconds}`, 'Content-Type': 'application/json' } }));
  }
  return { value, hit: false };
}

export async function fetchWithTimeout(input: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  // Respeita também o cancelamento de quem chamou (ex.: servidor Overpass que perdeu a corrida).
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (outer?.aborted) throw new Error('Cancelado');
    if (ctrl.signal.aborted) throw new Error(`Tempo esgotado após ${Math.round(ms / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Intervalo mínimo entre chamadas ao Nominatim neste isolate (política: máx. 1 req/s). */
let lastNominatim = 0;
export async function nominatimThrottle(): Promise<void> {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
}
