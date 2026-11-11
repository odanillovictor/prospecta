// POST /api/diagnose — baixa a página de verdade (com proteção SSRF) e extrai fatos verificáveis.
// Opcionalmente consulta o PageSpeed Insights (com chave) para nota real de performance mobile.
import type { SiteFacts } from '../../src/core/types';
import { validatePublicUrl } from '../../src/core/validation';
import { extractHtmlFacts } from '../../src/core/htmlFacts';
import { extractBrandAssets } from '../../src/core/brandAssets';
import { type Env, errorJson, fetchWithTimeout, json, logError, readJson, redact } from '../../server/http';
import { ensureUser } from '../../server/quota';

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const UA = 'Mozilla/5.0 (compatible; ProspectaAudit/0.1; +diagnostico de site)';

function decode(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder('utf-8').decode(bytes.slice(0, 4096));
  const label = (contentType.match(/charset=([\w-]+)/i) ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i) ?? [])[1];
  if (label && !/^utf-?8$/i.test(label)) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      /* charset não suportado pelo runtime: usa UTF-8 */
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

async function readCapped(res: Response): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!res.body) return { text: '', bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      truncated = true;
      chunks.push(value.slice(0, value.byteLength - (bytes - MAX_BYTES)));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(chunks.reduce((a, c) => a + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return { text: decode(all, res.headers.get('content-type') ?? ''), bytes, truncated };
}

async function pagespeed(url: string, key: string): Promise<SiteFacts['pagespeed']> {
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${new URLSearchParams({ url, strategy: 'mobile', category: 'performance', key })}`;
  const res = await fetchWithTimeout(api, {}, 60_000);
  if (!res.ok) throw new Error(`PageSpeed HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const perf = data?.lighthouseResult?.categories?.performance?.score;
  if (typeof perf !== 'number') return null;
  return {
    performance: Math.round(perf * 100),
    strategy: 'mobile',
    lcpMs: data.lighthouseResult.audits?.['largest-contentful-paint']?.numericValue,
    cls: data.lighthouseResult.audits?.['cumulative-layout-shift']?.numericValue,
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const clerkId = request.headers.get('x-clerk-id');
  if (!clerkId) return errorJson(401, 'Autenticação necessária.', 'unauthorized');
  const { active } = await ensureUser(env.DB!, clerkId, '');
  if (!active) return errorJson(403, 'Conta ainda não ativada.', 'inactive');

  const body = (await readJson(request)) as { url?: unknown };
  const v = validatePublicUrl(body?.url);
  if (!v.ok) return errorJson(400, v.error);

  let current = v.value;
  let redirects = 0;
  const started = Date.now();
  let res: Response;
  try {
    for (;;) {
      res = await fetchWithTimeout(current.toString(), { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.5', 'Accept-Language': 'pt-BR,pt;q=0.9' } }, 12_000);
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (++redirects > MAX_REDIRECTS) return errorJson(502, 'Redirecionamentos demais.');
        const next = validatePublicUrl(new URL(res.headers.get('location')!, current).toString());
        if (!next.ok) return errorJson(400, `Redirecionamento bloqueado: ${next.error}`);
        current = next.value;
        continue;
      }
      break;
    }
  } catch (err) {
    logError('diagnose', err, env);
    const raw = err instanceof Error ? err.message : 'falha de rede';
    // O runtime devolve "internal error" para DNS inexistente, conexão recusada ou certificado inválido.
    const msg = /internal error|network connection lost/i.test(raw) ? 'o site não respondeu (domínio inexistente, servidor fora do ar ou certificado inválido)' : raw;
    // Erro de HTTPS/conexão é informação útil para a venda, mas é reportado como falha, não como análise.
    return json({ ok: false, error: `Não foi possível acessar o site: ${redact(msg, env)}` }, 200);
  }
  const responseMs = Date.now() - started;
  const ctype = res!.headers.get('content-type') ?? '';
  const { text, bytes, truncated } = ctype.includes('html') || !ctype ? await readCapped(res!) : { text: '', bytes: 0, truncated: false };
  if (!text) {
    return json({ ok: false, error: `Resposta HTTP ${res!.status} sem HTML (${ctype || 'tipo desconhecido'}).` });
  }

  let ps: SiteFacts['pagespeed'] = undefined;
  if (env.PAGESPEED_API_KEY) {
    try {
      ps = await pagespeed(current.toString(), env.PAGESPEED_API_KEY);
    } catch (err) {
      logError('pagespeed', err, env);
      ps = null;
    }
  }

  const facts: SiteFacts = {
    requestedUrl: v.value.toString(),
    finalUrl: current.toString(),
    httpStatus: res!.status,
    https: current.protocol === 'https:',
    redirects,
    responseMs,
    htmlBytes: bytes,
    truncated,
    ...extractHtmlFacts(text),
    pagespeed: ps,
    brand: extractBrandAssets(text, current.toString()),
  };
  return json({ ok: true, facts });
};
