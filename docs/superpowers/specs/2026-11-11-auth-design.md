# Design: Auth + Painel de Usuário — Prospecta SaaS

Data: 2026-11-11 (aprovado pelo usuário)

## Intenção e motivação

Transformar o Prospecta em SaaS pago. Para usar, precisa pagar.
O Danillo tem área de admin para gerenciar usuários e uso.

## Metas

- Cadastro + login + recuperação de senha (via Clerk)
- Verificação de e-mail obrigatória antes do primeiro acesso
- Área de admin (só Danillo): lista de clientes, uso, bloquear conta
- Painel do cliente: saldo de buscas, aviso de limite diário
- Cotas aplicadas no servidor em todos os endpoints
- Cache de busca estendido para 7 dias (estava em 24h)
- Custo inicial R$ 0

## Fora do escopo neste ciclo

- Pagamento / PIX (fase seguinte — admin libera manualmente no beta)
- Créditos de imagem IA (não implementado ainda)
- Coleta Maps, robô WhatsApp, Instagram

## Plano único

**R$59,90/mês — sem trial, sem free, sem planos múltiplos.**

| Recurso | Limite |
|---|---|
| Buscas/mês | 200 |
| Resultados por busca (teto) | 50 |
| Aviso diário | ao atingir 20 buscas no dia |
| Prévias/mês | 50 |

Aviso diário: banner não bloqueante — *"Você já fez 20 buscas hoje. Use com calma para não esgotar o mês."*

Teto de 50 resultados: campo pré-selecionado em 50, dica explicativa ao lado:
*"1 busca = 1 crédito, independente da quantidade. Busque sempre o máximo."*

## Cache de busca: 7 dias

Cache atual é 24h (Cloudflare KV). Estender para 7 dias.
Quando resultado vem do cache, mostrar: *"Resultados salvos há X dias. Atualizar (gasta 1 busca)."*
Ao clicar em atualizar, faz nova consulta e gasta 1 busca do saldo.

## Restrições

- Stack: Cloudflare Pages + Workers (Pages Functions) + TypeScript + Vite
- D1 criado neste ciclo
- E-mail transacional: Resend (free tier)
- Clerk free tier: até 10.000 MAU

## Decisões técnicas

### Auth: Clerk

Clerk cuida de registro, login, verificação de e-mail, reset de senha e sessão (JWT).
Componentes `<SignIn>` e `<SignUp>` embutidos na UI React existente.
Middleware Cloudflare valida JWT do Clerk em toda chamada às APIs.

**Papel admin:** e-mail `web.danillo@gmail.com` recebe role `admin` via metadata no Clerk.

### Banco: D1

```sql
CREATE TABLE users (
  clerk_id   TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 0, -- 0=aguardando pagamento, 1=ativo
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE usage (
  clerk_id    TEXT NOT NULL,
  month       TEXT NOT NULL,   -- YYYY-MM
  searches    INTEGER NOT NULL DEFAULT 0,
  previews    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clerk_id, month)
);

CREATE TABLE usage_daily (
  clerk_id TEXT NOT NULL,
  day      TEXT NOT NULL,      -- YYYY-MM-DD
  searches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clerk_id, day)
);
```

### Expiração de trial

Não existe trial. Sem cron necessário.
Conta criada → `active = 0` → Danillo ativa manualmente no admin (ou webhook de pagamento na fase 2).

### Quota nos endpoints

Cada chamada a `/api/search`, `/api/diagnose`, `/api/preview`:
1. Middleware valida JWT → extrai `clerk_id`
2. Worker verifica `users.active = 1`
3. Verifica cota mensal e diária no D1
4. Se excedeu → 429 com mensagem clara
5. Se não → executa → incrementa contador

### Rotas novas na SPA

| Rota | O que faz | Acesso |
|------|-----------|--------|
| `/login` | `<SignIn>` do Clerk | público |
| `/register` | `<SignUp>` do Clerk | público |
| `/dashboard` | Painel do cliente | autenticado + ativo |
| `/admin` | Painel de admin | autenticado + role admin |

Rotas existentes continuam funcionando normalmente.

### Painel do cliente (`/dashboard`)

- Contador: *"187 de 200 buscas restantes este mês"*
- Barra de progresso visual
- Aviso diário se ≥ 20 buscas no dia
- Data de renovação (1º dia do próximo mês)
- Botão "Falar com suporte" → WhatsApp do Danillo

### Painel de admin (`/admin`)

- Tabela: e-mail, status (ativo/inativo), buscas do mês, prévias do mês, data de cadastro
- Botão "Ativar" / "Desativar" por usuário
- Total de clientes ativos

## O que fica para o builder decidir

- Componentes React para os painéis (reaproveitar design system do projeto)
- Nome do banco D1 no wrangler.toml
- Estratégia de cache read-through no D1
