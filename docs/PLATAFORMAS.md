# Plataformas, contas e serviços

> Atualizado em: novembro de 2026
> Este arquivo documenta **onde** o projeto está, **quais contas** são usadas e **o que já foi configurado**.
> **Nunca anote senhas ou chaves secretas aqui** — ficam no Cloudflare como secrets.

---

## 1. Cloudflare Pages — hospedagem do app

| Campo | Valor |
|---|---|
| **URL pública** | https://sitesales.com.br |
| **URL alternativa** | https://prospecta-9y4.pages.dev |
| **Projeto** | `prospecta` |
| **Account ID** | `55efd7392ed17e31165b4f1088448fb9` |
| **Conta de login** | `dangrafico.1@gmail.com` (perfil "Dan Pages") |
| **Painel** | https://dash.cloudflare.com/55efd7392ed17e31165b4f1088448fb9/pages/view/prospecta |
| **Domínios** | https://dash.cloudflare.com/55efd7392ed17e31165b4f1088448fb9/pages/view/prospecta/domains |

### Como fazer deploy

```bash
# Na pasta do projeto (G:\Meu Drive\Danillo crm\prospecta):
npm run build
npx wrangler pages deploy dist --project-name prospecta --branch main
```

Ou se o wrangler falhar com erro de package.json — ver seção "Problema Google Drive" abaixo.

### Secrets configurados no Cloudflare

Adicionar/editar em: Painel do Cloudflare → Workers & Pages → prospecta → Configurações → Variáveis e segredos

| Secret | Para que serve |
|---|---|
| `APP_ACCESS_TOKEN` | Código de acesso da plataforma (para usuários sem assinatura) |
| `CLERK_SECRET_KEY` | Autenticação server-side do Clerk |
| `GOOGLE_PLACES_API_KEY` | Busca de leads via Google Places (opcional) |
| `PAGESPEED_API_KEY` | Diagnóstico de velocidade do site do lead (opcional) |
| `OPENPIX_*` ou similar | Pagamentos PIX |
| `VAULT_SITES_ENDPOINT` + `VAULT_SITES_TOKEN` | Integração vault-sites (ainda não configurado) |

---

## 2. Clerk — autenticação de usuários

| Campo | Valor |
|---|---|
| **Conta de login** | `dangrafico.1@gmail.com` |
| **Painel** | https://dashboard.clerk.com |
| **Instância** | Produção — `sitesales.com.br` |
| **Domínio Clerk** | `clerk.sitesales.com.br` |
| **Publishable Key** | `pk_live_Y2xlcmsuc2l0ZXNhbGVzLmNvbS5iciQ` (pública, já no código) |
| **Secret Key** | No Cloudflare como `CLERK_SECRET_KEY` |

### O que já foi configurado

- **Google OAuth (SSO)**: configurado com credenciais customizadas do projeto Google `sitesales-514916`
  - Client ID do Google está salvo no Clerk → Configure → SSO connections → Google
  - Redirect URI: `https://clerk.sitesales.com.br/v1/oauth_callback`
- **Localização pt-BR**: interface de login em português via `src/ptBR.ts`
  - Nota: o pacote `@clerk/localizations` não instala corretamente em caminhos longos no Google Drive; a solução foi criar o arquivo de tradução diretamente no projeto
- **Admin**: para dar role de admin a um usuário, no painel do Clerk → Users → selecionar o usuário → Public Metadata → adicionar `{"role": "admin"}`

---

## 3. Google Cloud Console — OAuth do login com Google

| Campo | Valor |
|---|---|
| **Conta de login** | `dangrafico.1@gmail.com` |
| **Painel** | https://console.cloud.google.com |
| **Projeto** | `SiteSales` (ID: `sitesales-514916`) |
| **Auth Platform** | https://console.cloud.google.com/auth/overview?project=sitesales-514916 |
| **OAuth Client** | "SiteSales" — tipo: Aplicativo da Web |
| **Client ID** | `416330203266-k7itoa6kclcrd9dfr192lvk8sa41167p.apps.googleusercontent.com` |
| **Client Secret** | No Cloudflare / Clerk como secret |
| **Redirect URI autorizada** | `https://clerk.sitesales.com.br/v1/oauth_callback` |
| **Status do app** | Testando (modo externo — máx. 100 usuários de teste) |

### Usuários de teste cadastrados

Enquanto o app não for submetido para verificação do Google, apenas estes e-mails podem logar com Google:

- `web.danillo@gmail.com`
- `dangrafico.1@gmail.com`

**Para adicionar mais usuários de teste:**
https://console.cloud.google.com/auth/audience?project=sitesales-514916 → "Add users"

**Para publicar o app e liberar para qualquer conta Google:**
https://console.cloud.google.com/auth/overview?project=sitesales-514916 → "Publicar app" → submeter para verificação do Google (pode demorar dias/semanas)

---

## 4. Localização do projeto no PC

```
G:\Meu Drive\Danillo crm\prospecta\
│
├── src/            → código fonte React (frontend)
│   ├── ui/         → componentes e telas
│   ├── core/       → lógica de negócio (sem dependências externas)
│   ├── data/       → store, api client
│   └── ptBR.ts     → tradução pt-BR para o Clerk (criado manualmente)
│
├── functions/      → Cloudflare Pages Functions (backend / API)
│   └── api/        → endpoints: search, diagnose, pix, me, admin, etc.
│
├── server/         → utilitários compartilhados entre functions
├── public/         → arquivos estáticos (planos.html, planos.js, etc.)
├── docs/           → esta pasta de documentação
├── dist/           → build de produção (gerado por `npm run build`, não versionar)
│
├── CLAUDE.md       → instruções para o Claude Code (ler antes de tudo)
├── package.json    → dependências e scripts
└── .acesso-producao.txt → código de acesso da plataforma (NÃO compartilhar)
```

---

## 5. Fluxo de assinatura (checkout)

1. Usuário acessa `sitesales.com.br/planos.html`
2. Faz login via Clerk (e-mail+senha ou Google)
3. Preenche nome → gera QR Code PIX via `/api/pix/create`
4. Paga → webhook confirma → usuário é ativado no banco (Cloudflare D1)
5. Ao acessar o app, `/api/me` confirma assinatura ativa

Arquivos relevantes: `public/planos.html`, `public/planos.js`, `functions/api/pix/`

---

## 6. Problema conhecido: Google Drive corrompe npm no Windows

**Sintoma:** `npm install` mostra erros `TAR_ENTRY_ERROR` e os arquivos instalados ficam com 0 bytes.

**Causa:** O Google Drive File Stream no Windows não suporta caminhos muito longos durante a extração de tarballs.

**Solução para pacotes corrompidos:**

```powershell
# 1. Descobrir a versão do pacote no package-lock.json
Get-Content "package-lock.json" | Select-String '"@clerk/shared"'

# 2. Baixar o tarball diretamente do npm
$tmpDir = "C:\Users\Usuario\AppData\Local\Temp\pkg-fix"
New-Item -ItemType Directory -Force $tmpDir
Invoke-WebRequest "https://registry.npmjs.org/@clerk/shared/-/shared-4.46.0.tgz" -OutFile "$tmpDir\pkg.tgz"
tar -xzf "$tmpDir\pkg.tgz" -C $tmpDir

# 3. Copiar para node_modules
$dest = "node_modules\@clerk\shared"
Copy-Item "$tmpDir\package\package.json" "$dest\package.json" -Force
Copy-Item "$tmpDir\package\dist" "$dest\" -Recurse -Force
```

**Alternativa de longo prazo:** mover o projeto para um caminho fora do Google Drive (ex.: `C:\Projetos\sitesales\prospecta\`) e usar o Google Drive só para backup do `.acesso-producao.txt` e dos docs.

---

## 7. Histórico de decisões técnicas

| Data | Decisão | Motivo |
|---|---|---|
| out/2026 | Autenticação via Clerk | Login por Google + e-mail, sem implementar auth própria |
| nov/2026 | Google OAuth com credenciais customizadas | Clerk em produção exige credenciais próprias (não usa as do Clerk) |
| nov/2026 | Localização pt-BR via arquivo local | `@clerk/localizations` não instala em caminhos longos no Google Drive |
| nov/2026 | Usuários de teste Google: `web.danillo` + `dangrafico.1` | App em modo "Testando" — máx. 100 usuários enquanto não verificado |
| out/2026 | Pagamentos via PIX | Sem mensalidade de cartão; menos fricção para o público-alvo |
| out/2026 | Cloudflare Pages + D1 | Edge global, functions serverless gratuitas, D1 sem custo até limites |
