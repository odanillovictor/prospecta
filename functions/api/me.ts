// GET /api/me — retorna dados do usuário autenticado e seu uso atual.
import { ensureUser, MONTHLY_SEARCHES, MONTHLY_PREVIEWS } from '../../server/quota';
import { json, errorJson } from '../../server/http';
import type { Env } from '../../server/http';

function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    '0.0.0.0'
  );
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const clerkId = request.headers.get('x-clerk-id');
  if (!clerkId) return errorJson(401, 'Não autenticado.');

  const db = env.DB!;
  const isAdmin = request.headers.get('x-clerk-admin') === '1';
  let { active } = await ensureUser(db, clerkId, request.headers.get('x-clerk-email') ?? '');
  if (isAdmin && !active) {
    await db.prepare('UPDATE users SET active = 1 WHERE clerk_id = ?').bind(clerkId).run();
    active = true;
  }

  // Verificação de IP (admin está isento)
  let ip_mismatch = false;
  if (!isAdmin) {
    const clientIp = getClientIp(request);
    const userRow = await db
      .prepare('SELECT registered_ip FROM users WHERE clerk_id = ?')
      .bind(clerkId)
      .first<{ registered_ip: string | null }>();

    if (!userRow?.registered_ip) {
      // Primeiro acesso: registra o IP
      await db.prepare('UPDATE users SET registered_ip = ? WHERE clerk_id = ?').bind(clientIp, clerkId).run();
    } else if (userRow.registered_ip !== clientIp) {
      ip_mismatch = true;
    }
  }

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

  const email = request.headers.get('x-clerk-email') ?? '';
  return json({
    clerkId,
    email,
    active,
    ip_mismatch,
    usage: { searches, previews, month },
    dailySearches,
    remaining: {
      searches: Math.max(0, MONTHLY_SEARCHES - searches),
      previews: Math.max(0, MONTHLY_PREVIEWS - previews),
    },
  });
};
