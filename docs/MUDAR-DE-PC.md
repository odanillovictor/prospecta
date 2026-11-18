# Levar o SiteSales para outro computador

> O app online (https://sitesales.com.br) **não depende do PC**: continua funcionando igual.
> O PC só importa para (1) editar e publicar o app e (2) a busca via coletor local do Google Maps.

---

## 1. O que copiar

Copie a pasta `prospecta` inteira. Pode pular:
- `node_modules/` → recriada com `npm install`
- `dist/` → recriada com `npm run build`
- `.wrangler/` → recriada pelo wrangler

**Arquivos críticos que NÃO podem faltar:**
- `.acesso-producao.txt` — código de acesso da plataforma (não compartilhe; não sobe pro git)
- `.dev.vars` — variáveis de ambiente locais para testes (se existir)

---

## 2. Instalar no PC novo

```bash
# 1. Instalar Node.js 20 ou mais novo
#    nodejs.org → baixar instalador LTS

# 2. Na pasta do projeto
npm install

# 3. Autenticar no Cloudflare para publicar
npx wrangler login
# Abre o navegador → fazer login com dangrafico.1@gmail.com (perfil "Dan Pages")

# 4. Verificar que tudo está OK
npm run check
# roda: typecheck + testes + build
```

> **Atenção se o projeto ficar no Google Drive:** o `npm install` pode corromper arquivos de alguns pacotes (TAR errors). Se isso acontecer, leia a seção 6 do `docs/PLATAFORMAS.md` para o workaround manual.
>
> **Recomendação:** mover o projeto para `C:\Projetos\sitesales\prospecta\` e usar o Google Drive só para backup do `.acesso-producao.txt`.

---

## 3. Publicar uma atualização

```bash
npm run build
npx wrangler pages deploy dist --project-name prospecta --branch main
```

O site atualiza em segundos em https://sitesales.com.br.

---

## 4. Configurar secrets no PC novo (só se fizer deploy local)

Os secrets ficam no Cloudflare — não precisam ser reconfigurados a cada PC. Mas se precisar rodar localmente com as APIs:

```bash
# Criar .dev.vars na raiz do projeto (não commitar)
# Exemplo:
CLERK_SECRET_KEY=sk_live_...
GOOGLE_PLACES_API_KEY=...
APP_ACCESS_TOKEN=...
```

Ver todos os secrets necessários em `docs/PLATAFORMAS.md`.

---

## 5. Plataformas (onde fazer login)

| Serviço | URL | Conta |
|---|---|---|
| **Cloudflare** (hospedagem) | https://dash.cloudflare.com | `dangrafico.1@gmail.com` |
| **Clerk** (login de usuários) | https://dashboard.clerk.com | `dangrafico.1@gmail.com` |
| **Google Cloud** (OAuth Google) | https://console.cloud.google.com | `dangrafico.1@gmail.com` |

Detalhes completos de cada plataforma: `docs/PLATAFORMAS.md`

---

## 6. Dados dos leads

Os leads ficam **no navegador** de cada aparelho (não na pasta nem no servidor).

No PC novo o app abre vazio. Para levar os leads:
- **PC antigo:** no app → Ajustes → **Exportar backup** (arquivo .json)
- **PC novo:** no app → Ajustes → **Importar backup**

---

## 7. Coletor local do Google Maps (opcional)

Só necessário se quiser buscar no Google Maps (não na busca padrão por OSM/Google Places via API):

```bash
npm run coletor
# Deixa o PC ligado enquanto faz buscas
```

Iniciar com o Windows: Win+R → `shell:startup` → copie `coletor\iniciar-oculto.vbs` para lá.

Busca com fotos e avaliações: instale Docker Desktop (`coletor\instalar-docker.ps1`). Feche o Docker quando não usar.

---

## 8. Claude no PC novo

Abra o Claude Code nesta pasta. Ele lê o `CLAUDE.md` e já entende o projeto.

Peça:
> "leia o CLAUDE.md e os docs/ e me diga o estado atual do projeto e o que precisa ser feito"

Arquivos de contexto importantes:
- `CLAUDE.md` — regras e fluxo de trabalho com o Claude
- `docs/PLATAFORMAS.md` — plataformas, contas, configurações
- `docs/ARQUITETURA.md` — como o código está organizado
- `docs/INTEGRACOES.md` — integrações externas (Google Maps, vault-sites, etc.)
- `docs/SEGURANCA.md` — práticas de segurança implementadas
