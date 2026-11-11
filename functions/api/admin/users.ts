// GET /api/admin/users — lista todos os usuários com uso do mês atual (somente admin).
import { json, errorJson } from '../../../server/http';
import type { Env } from '../../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (request.headers.get('x-clerk-admin') !== '1') return errorJson(403, 'Acesso negado.');

  const month = new Date().toISOString().slice(0, 7);

  const rows = await env.DB!
    .prepare(
      `SELECT u.clerk_id, u.email, u.active, u.created_at,
              COALESCE(ug.searches, 0) AS searches,
              COALESCE(ug.previews, 0) AS previews
       FROM users u
       LEFT JOIN usage ug ON u.clerk_id = ug.clerk_id AND ug.month = ?
       ORDER BY u.created_at DESC`,
    )
    .bind(month)
    .all<{ clerk_id: string; email: string; active: number; created_at: string; searches: number; previews: number }>();

  const users = (rows.results ?? []).map((r) => ({
    clerkId: r.clerk_id,
    email: r.email,
    active: r.active === 1,
    createdAt: r.created_at,
    searches: r.searches,
    previews: r.previews,
  }));

  return json({ users });
};
