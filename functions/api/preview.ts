// POST /api/preview — publica (ou atualiza) a prévia online de um site gerado. Protegido pelo código de acesso
// (middleware de /api). A página fica pública em /p/<id> por 90 dias, para mostrar ao cliente.
import { PREVIEW_ID, PREVIEW_MAX_OG, PREVIEW_TTL_SECONDS, validPreviewHtml } from '../../src/core/preview';
import { dataUrlToBytes } from '../../src/core/zip';
import { type Env, errorJson, json, readJson } from '../../server/http';
import { checkQuota, ensureUser, incrementQuota } from '../../server/quota';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PREVIEWS) return errorJson(501, 'Armazenamento de prévias (KV PREVIEWS) não configurado.');

  const clerkId = request.headers.get('x-clerk-id');
  if (!clerkId) return errorJson(401, 'Autenticação necessária.', 'unauthorized');
  const { active } = await ensureUser(env.DB!, clerkId, request.headers.get('x-clerk-email') ?? '');
  if (!active) return errorJson(403, 'Conta ainda não ativada.', 'inactive');
  const quota = await checkQuota(env.DB!, clerkId, 'preview');
  if (!quota.allowed) return errorJson(429, quota.reason ?? 'Limite de prévias atingido.', 'quota_exceeded');

  const body = (await readJson(request, 24_000_000)) as { id?: unknown; html?: unknown; og?: unknown };
  const id = String(body?.id ?? '');
  if (!PREVIEW_ID.test(id)) return errorJson(400, 'Id de prévia inválido.');
  if (!validPreviewHtml(body.html)) return errorJson(400, 'HTML inválido ou grande demais.');

  await env.PREVIEWS.put(`p:${id}`, body.html, { expirationTtl: PREVIEW_TTL_SECONDS, metadata: { at: new Date().toISOString() } });
  if (typeof body.og === 'string') {
    const og = dataUrlToBytes(body.og);
    if (og && og.bytes.length <= PREVIEW_MAX_OG) {
      await env.PREVIEWS.put(`og:${id}`, og.bytes, { expirationTtl: PREVIEW_TTL_SECONDS, metadata: { type: og.ext === 'png' ? 'image/png' : 'image/jpeg' } });
    }
  }

  await incrementQuota(env.DB!, clerkId, 'preview');
  const url = `${new URL(request.url).origin}/p/${id}`;
  return json({ ok: true, id, url, expiresInDays: PREVIEW_TTL_SECONDS / 86400 });
};

// DELETE /api/preview?id=<id> — despublica: o link deixa de funcionar na hora.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PREVIEWS) return errorJson(501, 'Armazenamento de prévias (KV PREVIEWS) não configurado.');
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!PREVIEW_ID.test(id)) return errorJson(400, 'Id de prévia inválido.');
  await Promise.all([env.PREVIEWS.delete(`p:${id}`), env.PREVIEWS.delete(`og:${id}`)]);
  return json({ ok: true, id });
};
