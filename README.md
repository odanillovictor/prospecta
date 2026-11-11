# Prospecta

Plataforma de prospecção para quem vende criação e melhoria de sites: encontra empresas, identifica oportunidades, organiza o funil e prepara o briefing para o agente de criação **vault-sites**.

Roda como PWA (instalável no iPhone) e é hospedada no **Cloudflare Pages** (frontend estático + Pages Functions). Inspirada no fluxo do reel de referência (busca "o quê / onde", lista de empresas sem site, botões WhatsApp e "Criar site"), mas com diagnóstico real, score explicável e sem simular integrações.

## O que funciona hoje (verificado)

| Recurso | Estado | Observação |
|---|---|---|
| Busca no **Google Maps via coletor local** (gosom, sem API paga) | ✅ testado: 20 advogados em Joinville em 8 s | Roda no seu PC: `npm run coletor`. Traz telefone, site, nota, avaliações, horário. Fotos do Maps: modo completo bloqueado nesta máquina (ver `coletor/LEIA-ME.md`). |
| Busca no **OpenStreetMap** (Nominatim + Overpass) | ✅ funcional, gratuito | Testado: "dentista / Curitiba" → 28 empresas. Servidores públicos às vezes ficam congestionados (há failover entre 3). |
| Busca no **Google Maps** (Places API New): nota, avaliações, fotos, horário, resumo | ⚙️ implementado, **não testado com chave real** | Só é ativado com `GOOGLE_PLACES_API_KEY`. Pago por consulta. |
| Importação **CSV** (ex.: exportação do agente atual) | ✅ | Detecta separador, mapeia colunas pt/en. |
| Normalização de telefones/sites e **deduplicação** | ✅ | Domínio, telefone, nome+local, ID de origem. |
| **Score** de oportunidade editável e explicado | ✅ | Pesos em Ajustes; validação manual por sinal. |
| **Diagnóstico** de site (HTTPS, viewport, title, description, headings, WhatsApp, CTA, contato, formulário, schema, sinais de site antigo) | ✅ | Executa de verdade a partir da Cloudflare. Separa automático / inferido / manual. |
| Velocidade real (PageSpeed Insights) | ⚙️ opcional | Com `PAGESPEED_API_KEY`. Sem ela, mede só tempo de resposta do servidor. |
| Vitrine de resultados (score, motivo, telefone, botões WhatsApp / Criar site / Detalhes) | ✅ | Ações salvam o lead automaticamente. |
| Pesquisa salva (termos, filtros e resultados) | ✅ | Sobrevive à troca de tela e ao recarregar. |
| Abordagens (argumento, WhatsApp curto sem citar cidade, roteiro de ligação, próxima ação) | ✅ | Determinístico (sem IA, sem custo). |
| **Construir o site** (onepage animado, SEO local, identidade real do cliente) | ✅ | Logo, fotos, cor e serviços do site atual ou do Google Maps; comparativo "hoje × novo site"; baixa HTML único. |
| WhatsApp click-to-chat com confirmação | ✅ | Nunca envia sozinho. |
| Funil estilo Trello: Contato iniciado → Respondeu → Reunião marcada → Finalizado | ✅ | Arrastar cards, etiquetas, descrição, comentários. Abrir o WhatsApp pela ferramenta coloca o lead no funil. |
| Briefing para vault-sites (JSON + Markdown, copiar/baixar) | ✅ | Contrato **proposto** em `docs/INTEGRACOES.md`. |
| Envio ao vault-sites | ⏳ **pendente de configuração** | Adaptador pronto; endpoint real não existe/foi validado. |
| Publicação no Cloudflare | ⏳ não implementado | Ver `docs/INTEGRACOES.md`. |
| **Prévia online do site gerado** (link para o cliente) | ✅ testado em produção | Botão "Publicar e abrir" no construtor: publica no Cloudflare (KV `PREVIEWS`) em `https://prospecta-9y4.pages.dev/p/<id>`, com imagem de compartilhamento para o WhatsApp, `noindex`, válida por 90 dias; o mesmo link é atualizado a cada nova publicação. |
| Exportação do site (.zip) com SEO completo | ✅ | index.html, imagens em arquivos, `og.jpg` (imagem de compartilhamento gerada com foto/logo/cor do cliente), favicon, robots.txt e sitemap.xml (com o endereço publicado). |
| PWA (manifest, ícones, service worker conservador) | ✅ | |

## Requisitos

- Node.js 20+ (testado com 24) e npm.
- Conta Cloudflare apenas para publicar (desenvolvimento local não precisa).

## Instalação e execução local

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

Aplicação completa (frontend + API) em http://localhost:8788:

```bash
npm run preview
```

Coletor do Google Maps (em outro terminal, deixe aberto):

```bash
npm run coletor
```

Desenvolvimento com hot reload: rode `npm run build` uma vez, depois em dois terminais `npm run dev:api` (API em 8788) e `npm run dev` (frontend em 5173, encaminha `/api` para 8788).

Sem a API rodando, o app abre normalmente: funil, CSV, briefing e demonstração funcionam; busca online e diagnóstico mostram um aviso de indisponibilidade.

## Verificações

```bash
npm run check
```

Executa `typecheck` (app + Functions), `test` (Vitest, 96 testes do núcleo) e `build`.

## Publicar no Cloudflare Pages

1. `npx wrangler login`
2. `npm run build && npx wrangler pages deploy dist` (cria o projeto `prospecta` na primeira vez).
3. Segredos (só os que você tiver):
   `npx wrangler pages secret put APP_ACCESS_TOKEN` · `GOOGLE_PLACES_API_KEY` · `PAGESPEED_API_KEY` · `VAULT_SITES_ENDPOINT` · `VAULT_SITES_TOKEN`
4. Ajuste `OSM_CONTACT` em `wrangler.toml` com um e-mail de contato (política do OpenStreetMap).
5. **Proteja o acesso**: recomendado colocar o projeto atrás do **Cloudflare Access** (gratuito até 50 usuários). Alternativa mínima: `APP_ACCESS_TOKEN` + informar o token em Ajustes.

Também é possível conectar o repositório Git no painel do Pages (build: `npm run build`, saída: `dist`).

## Instalar no iPhone

Abra a URL publicada no Safari → Compartilhar → "Adicionar à Tela de Início".

## Transferir para outro computador

1. Copie a pasta `prospecta/` **sem** `node_modules/`, `dist/`, `.wrangler/` e `.dev.vars` (segredos).
2. No novo computador: `npm install`, recrie `.dev.vars` a partir de `.dev.vars.example`.
3. Os leads ficam no navegador (localStorage). Antes de trocar de máquina/navegador: **Ajustes → Exportar backup**; no destino, **Importar backup**.
4. Para conectar seus agentes atuais: importe CSVs do agente de prospecção em Ajustes → Importar leads; use o briefing JSON com o vault-sites e, quando houver endpoint, configure `VAULT_SITES_*`.

## Estrutura

```
prospecta/
├─ src/core/          domínio puro (TS), usado no app e nas Functions
│  ├─ providers/      OpenStreetMap, Google Places
│  ├─ normalize.ts    telefones, sites, endereços
│  ├─ dedupe.ts       consolidação sem duplicidade
│  ├─ htmlFacts.ts    extração de fatos do HTML
│  ├─ diagnosis.ts    checklist automático / inferido / manual
│  ├─ scoring.ts      score editável e explicado
│  ├─ pitch.ts        abordagens comerciais
│  ├─ whatsapp.ts     links wa.me seguros
│  ├─ brandAssets.ts  identidade visual do site atual (logo, fotos, cores, serviços)
│  ├─ site/           gerador de sites: packs, temas, melhorias, identidade, render
│  ├─ briefing.ts     contrato do briefing vault-sites
│  ├─ csv.ts          importação CSV
│  └─ validation.ts   validação de entrada + proteção SSRF
├─ src/data/          armazenamento local, cliente da API, demonstração
├─ src/ui/            telas React
├─ functions/api/     Pages Functions (search, diagnose, image, integrations, vault-sites)
├─ server/            utilitários das Functions
├─ coletor/           coletor local do Google Maps (gosom) — ver coletor/LEIA-ME.md
├─ public/            manifest, service worker, ícones, _headers
├─ tests/             testes Vitest
└─ docs/              arquitetura, integrações, segurança, limitações
```

Documentação: [Arquitetura e modelo de dados](docs/ARQUITETURA.md) · [Integrações e provedores](docs/INTEGRACOES.md) · [Segurança](docs/SEGURANCA.md) · [Limitações conhecidas](docs/LIMITACOES.md)
