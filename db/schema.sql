-- Schema do banco D1 para autenticação SaaS.
-- Aplicar localmente: npx wrangler d1 execute prospecta-db --local --file=db/schema.sql
-- Aplicar em produção: npx wrangler d1 execute prospecta-db --file=db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  clerk_id   TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage (
  clerk_id  TEXT NOT NULL,
  month     TEXT NOT NULL,
  searches  INTEGER NOT NULL DEFAULT 0,
  previews  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clerk_id, month)
);

CREATE TABLE IF NOT EXISTS usage_daily (
  clerk_id TEXT NOT NULL,
  day      TEXT NOT NULL,
  searches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clerk_id, day)
);
