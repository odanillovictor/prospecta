-- Migração: adiciona restrição de IP por usuário
ALTER TABLE users ADD COLUMN registered_ip TEXT;
