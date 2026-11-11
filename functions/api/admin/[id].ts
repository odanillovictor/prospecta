// PATCH /api/admin/users/:id — ativa ou desativa um usuário (somente admin).
import { json, errorJson, readJson } from '../../../server/http';
import type { Env } from '../../../server/http';

export const onRequestPatch: PagesFunction<Env, 'id'> = async ({ request, env, params }) => {
  if (request.headers.get('x-clerk-admin') !== '1') return errorJson(403, 'Acesso negado.');

  const id = String(params.id ?? '');
  if (!id) return errorJson(400, 'ID ausente.');

  const body = (await readJson(request)) as { active: number };
  if (body.active !== 0 && body.active !== 1) {
    return errorJson(400, 'O campo active deve ser 0 ou 1.');
  }

  await env.DB!
    .prepare('UPDATE users SET active = ? WHERE clerk_id = ?')
    .bind(body.active, id)
    .run();

  return json({ ok: true });
};
