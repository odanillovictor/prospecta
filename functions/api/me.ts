// GET /api/me — retorna dados do usuário autenticado e seu uso atual.
import { ensureUser, MONTHLY_SEARCHES, MONTHLY_PREVIEWS } from '../../server/quota';
import { json, errorJson } from '../../server/http';
import type { Env } from '../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const clerkId = request.headers.get('x-clerk-id');
  if (!clerkId) return errorJson(401, 'Não autenticado.');

  const db = env.DB!;
  const { active } = await ensureUser(db, clerkId, '');

  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const usageRow = await db
    .prepare('SELECT searches, previews FROM usage WHERE clerk_id = ? AND month = ?')
    .bind(clerkId, month)
    .first<{ searches: number; previews: number }>();

  const dailyRow = await db
    .prepare('SELECT searches FROM usage_daily WHERE clerk_id = ? AND day = ?')
    .bind(clerkId, today)
    .first<{ searches: number }>();

  const searches = usageRow?.searches ?? 0;
  const previews = usageRow?.previews ?? 0;
  const dailySearches = dailyRow?.searches ?? 0;

  return json({
    clerkId,
    email: '',
    active,
    usage: { searches, previews, month },
    dailySearches,
    remaining: {
      searches: Math.max(0, MONTHLY_SEARCHES - searches),
      previews: Math.max(0, MONTHLY_PREVIEWS - previews),
    },
  });
};
