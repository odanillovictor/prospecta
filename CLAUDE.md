# Prospecta — contexto para o Claude

> **Vault de conhecimento:** `../Crm prospecta/00 Índice.md` (Obsidian). Leia o índice e só a nota necessária antes de explorar o código. **A cada feedback/pedido do usuário, registre e interprete no vault** (`Protocolo de auto-melhoria.md`: feedback → backlog → notas técnicas → decisões) para ele se auto-melhorar.

Ferramenta de prospecção para vender sites a pequenos negócios: busca empresas (Google Maps/OSM), dá nota de oportunidade,
funil estilo Trello, diagnostica o site atual, gera abordagem de WhatsApp e **constrói um site one-page** com a identidade
real do cliente, publicado como prévia online. Tudo determinístico (sem IA/tokens em tempo de uso).

## Como o usuário quer que você trabalhe
- Responder **em português, curto e direto**. Gastar poucos tokens: agrupar mudanças, validar uma vez no fim, evitar screenshots desnecessários.
- Nunca inventar dados (avaliações, fotos, números). Só dados reais do lead; fotos ilustrativas são marcadas e creditadas.
- **Nunca** mostrar no chat o código de acesso (`.acesso-producao.txt`) nem chaves. Segredos ficam no Cloudflare.
- Ao terminar mudanças: `npm run check` e publicar (`npx wrangler pages deploy dist --project-name prospecta --branch main --commit-dirty=true`).
  O usuário vê a faixa "Nova versão — Atualizar" no app (inclusive no iPhone).

## Onde está cada coisa
- App: Vite + React + TS em `src/` (UI em `src/ui`, regras em `src/core`). Dados ficam no localStorage do navegador.
- API: Cloudflare Pages Functions em `functions/api` (busca, diagnóstico com proteção SSRF, proxy de imagens, fotos, prévias).
- Gerador de site: `src/core/site/render.ts` (+ `packs.ts` textos por segmento, `photoScore.ts` nota das fotos,
  `serviceImages.ts` busca de foto por serviço). O hash do script do site (`siteJsHash.ts`) precisa bater com `public/_headers` (há teste).
- Coletor do Google Maps: `coletor/server.mjs` (roda **no PC**, porta 8790; modo rápido local e modo completo via Docker).
- Docs: `docs/` (ARQUITETURA, INTEGRACOES, SEGURANCA, LIMITACOES) e `docs/MUDAR-DE-PC.md`.

- Robô de vendas (WhatsApp Web): `robo/` (serviço local `npm run robo` + extensão Chrome `robo/extensao`), lógica em `src/core/robot/`, UI em `src/ui/RobotUI.tsx`. Aprovar cada mensagem por padrão; modo teste ligado; envio real só com `npm run robo:real`. Detalhes: vault `Robô de vendas.md`.

## Produção
- URL: https://prospecta-9y4.pages.dev (Cloudflare, conta "Dan Pages", projeto `prospecta`).
- Segredos no Cloudflare: `APP_ACCESS_TOKEN` (código de acesso do app), `PIXABAY_API_KEY` (fotos dos serviços).
- KV `PREVIEWS` guarda as prévias públicas `/p/<id>` (90 dias).

## Decisões já tomadas
- Google Maps só funciona com o PC ligado (coletor local). API oficial do Google exige cartão: usuário recusou.
  Hugging Face Docker virou pago; `coletor/hf-space/` ficou pronto mas sem uso.
- Fotos: Pixabay (Pexels parou de emitir chaves; Envato não tem API e a licença é por projeto).
- Pixabay recusa às vezes pedidos vindos do Cloudflare (HTTP 429): o app tenta de novo; resultado vazio não vai para cache.
- Imagem Docker do coletor fixada em `gosom/google-maps-scraper:v1.18.0` (a `latest` veio quebrada).
