// Verificação e incremento de cotas de uso no D1 (mensais e diárias).

export const MONTHLY_SEARCHES = 200;
export const MONTHLY_PREVIEWS = 999_999;
export const DAILY_SEARCH_WARN = 20;

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  dailySearches: number;
  reason?: string;
}

/** Garante que o usuário existe na tabela `users`. Retorna se está ativo. */
export async function ensureUser(
  db: D1Database,
  clerkId: string,
  email: string,
): Promise<{ active: boolean }> {
  await db.prepare('INSERT OR IGNORE INTO users (clerk_id, email) VALUES (?, ?)').bind(clerkId, email).run();
  const row = await db
    .prepare('SELECT active FROM users WHERE clerk_id = ?')
    .bind(clerkId)
    .first<{ active: number }>();

  // Auto-ativar se o e-mail tem uma compra paga (checkout PIX)
  if (!(row?.active)) {
    const paid = await db
      .prepare("SELECT id FROM purchases WHERE email = ? AND status = 'PAID' LIMIT 1")
      .bind(email.toLowerCase())
      .first();
    if (paid) {
      await db.prepare('UPDATE users SET active = 1 WHERE clerk_id = ?').bind(clerkId).run();
      return { active: true };
    }
  }

  return { active: (row?.active ?? 0) === 1 };
}

/** Verifica se o usuário ainda tem cota para a ação solicitada. */
export async function checkQuota(
  db: D1Database,
  clerkId: string,
  action: 'search' | 'preview',
): Promise<QuotaResult> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const usage = await db
    .prepare('SELECT searches, previews FROM usage WHERE clerk_id = ? AND month = ?')
    .bind(clerkId, month)
    .first<{ searches: number; previews: number }>();

  const daily = await db
    .prepare('SELECT searches FROM usage_daily WHERE clerk_id = ? AND day = ?')
    .bind(clerkId, day)
    .first<{ searches: number }>();

  if (action === 'search') {
    const searches = usage?.searches ?? 0;
    const dailySearches = daily?.searches ?? 0;
    const allowed = searches < MONTHLY_SEARCHES;
    const remaining = MONTHLY_SEARCHES - searches;
    return {
      allowed,
      remaining,
      dailySearches,
      ...(allowed ? {} : { reason: `Limite mensal de ${MONTHLY_SEARCHES} buscas atingido.` }),
    };
  } else {
    const previews = usage?.previews ?? 0;
    const allowed = previews < MONTHLY_PREVIEWS;
    const remaining = MONTHLY_PREVIEWS - previews;
    return {
      allowed,
      remaining,
      dailySearches: 0,
      ...(allowed ? {} : { reason: `Limite mensal de ${MONTHLY_PREVIEWS} prévias atingido.` }),
    };
  }
}

/** Incrementa o contador de uso para a ação realizada. */
export async function incrementQuota(
  db: D1Database,
  clerkId: string,
  action: 'search' | 'preview',
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);

  if (action === 'search') {
    const day = new Date().toISOString().slice(0, 10);
    await db
      .prepare(
        `INSERT INTO usage (clerk_id, month, searches, previews) VALUES (?, ?, 1, 0)
         ON CONFLICT(clerk_id, month) DO UPDATE SET searches = searches + 1`,
      )
      .bind(clerkId, month)
      .run();
    await db
      .prepare(
        `INSERT INTO usage_daily (clerk_id, day, searches) VALUES (?, ?, 1)
         ON CONFLICT(clerk_id, day) DO UPDATE SET searches = searches + 1`,
      )
      .bind(clerkId, day)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO usage (clerk_id, month, searches, previews) VALUES (?, ?, 0, 1)
         ON CONFLICT(clerk_id, month) DO UPDATE SET previews = previews + 1`,
      )
      .bind(clerkId, month)
      .run();
  }
}
