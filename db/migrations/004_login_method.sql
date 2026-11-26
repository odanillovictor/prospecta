-- Adiciona método de login do usuário (google | email).
-- Aplicar: npx wrangler d1 execute prospecta-db --file=db/migrations/004_login_method.sql
-- Local:   npx wrangler d1 execute prospecta-db --local --file=db/migrations/004_login_method.sql

ALTER TABLE users ADD COLUMN login_method TEXT NOT NULL DEFAULT 'email';
