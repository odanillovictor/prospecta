// POST /api/vault-sites/briefing — encaminha o briefing ao vault-sites SOMENTE se houver endpoint e token
// configurados no servidor. Sem configuração, responde 501 "pendente_configuracao" (nada é simulado).
// O endpoint real e seu contrato ainda não existem/foram validados — ver docs/INTEGRACOES.md.
import { BRIEFING_SCHEMA } from '../../../src/core/briefing';
import { type Env, errorJson, fetchWithTimeout, json, logError, readJson, redact } from '../../../server/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await readJson(request, 300_000)) as Record<string, any>;
  if (body?.schema !== BRIEFING_SCHEMA) return errorJson(400, `Schema inválido; esperado ${BRIEFING_SCHEMA}.`);
  const key = String(body.idempotencyKey ?? '');
  if (!/^lead-[\w-]{8,80}$/.test(key)) return errorJson(400, 'idempotencyKey inválida.');
  if (body.constraints?.isDemoData) return errorJson(422, 'Briefing de dados de demonstração não é enviado ao vault-sites.');

  if (!env.VAULT_SITES_ENDPOINT || !env.VAULT_SITES_TOKEN) {
    return json(
      { ok: false, status: 'pendente_configuracao', message: 'Integração com vault-sites pendente de configuração (VAULT_SITES_ENDPOINT/VAULT_SITES_TOKEN).' },
      501,
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(env.VAULT_SITES_ENDPOINT);
    if (endpoint.protocol !== 'https:') throw new Error('endpoint precisa ser https');
  } catch (err) {
    logError('vault-sites', err, env);
    return errorJson(500, 'VAULT_SITES_ENDPOINT inválido (precisa ser uma URL https).');
  }

  try {
    const res = await fetchWithTimeout(
      endpoint.toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.VAULT_SITES_TOKEN}`,
          'Idempotency-Key': key,
        },
        body: JSON.stringify(body),
      },
      20_000,
    );
    const text = (await res.text()).slice(0, 2000);
    let parsed: unknown = undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* resposta não-JSON */
    }
    return json({
      ok: res.ok,
      httpStatus: res.status,
      message: res.ok ? 'Briefing entregue ao vault-sites (resposta abaixo).' : `vault-sites respondeu HTTP ${res.status}.`,
      response: parsed ?? redact(text, env),
    }, res.ok ? 200 : 502);
  } catch (err) {
    logError('vault-sites', err, env);
    return json({ ok: false, message: `Falha ao contatar vault-sites: ${redact(err instanceof Error ? err.message : 'erro', env)}. Pode reenviar com segurança (mesma chave de idempotência).` }, 502);
  }
};
