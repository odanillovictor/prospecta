-- Tabela de compras via PIX (checkout do SaaS).
-- Aplicar: npx wrangler d1 execute prospecta-db --file=db/migrations/003_purchases.sql
-- Local:   npx wrangler d1 execute prospecta-db --local --file=db/migrations/003_purchases.sql

CREATE TABLE IF NOT EXISTS purchases (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  phone      TEXT,
  status     TEXT NOT NULL DEFAULT 'PENDING',
  amount     INTEGER NOT NULL DEFAULT 2999,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(email);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
