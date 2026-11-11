# Integrações e provedores

Legenda: ✅ funcionando e testado · ⚙️ implementado, depende de credencial · ⏳ pendente (não implementado ou sem contrato real).

## Fontes de leads

### Coletor local do Google Maps (gosom) — escolhido pelo time

Decisão do time (documento `mineracao_leads_resumo.md`): usar o gosom/google-maps-scraper, aceitando o risco de termos de uso. Implementado em `coletor/server.mjs` (serviço local) + `src/core/providers/gosom.ts` (conversão). Detalhes, modos e limitações em `coletor/LEIA-ME.md`.

### Avaliação do Google Kit Scraper (abordagem anterior)

Raspar o Google Maps/Busca **viola os Termos de Serviço do Google** (proibição de acesso automatizado e de extração de conteúdo do Maps). Riscos práticos: bloqueio de IP/CAPTCHA, quebra a cada mudança de layout, dados sem garantia de atualização e risco jurídico/reputacional para quem vende. Recomendação: **não integrar o scraper à plataforma**. Durante a transição, os CSVs que ele já gerou podem ser importados (tela Prospectar → Importar CSV), com a origem registrada como "Importação CSV".

### Comparativo

| Provedor | Custo | Cobertura Brasil | Dados | Termos | Velocidade | Estado |
|---|---|---|---|---|---|---|
| **OpenStreetMap** (Nominatim + Overpass) | grátis | irregular: boa em capitais para categorias comuns, fraca em cidades pequenas | nome, endereço, às vezes telefone/site; **sem avaliações** | ODbL: atribuição obrigatória; uso moderado dos servidores públicos | 10–40 s nos servidores públicos; cache 24 h | ✅ |
| **Google Places API (New)** — Text Search | pago por requisição (há cota mensal gratuita; pedir telefone/site/avaliações usa SKU mais caro) | a melhor | nome, endereço, telefone, site, nota, nº avaliações, status | permitido; só `place_id` pode ser armazenado indefinidamente — demais campos devem ser atualizados periodicamente | ~1–2 s | ⚙️ implementado com base na documentação oficial, **não testado com chave real** |
| Importação CSV | grátis | a da sua fonte | conforme o arquivo | responsabilidade de quem coletou | instantâneo | ✅ |
| Overpass próprio (servidor dedicado) | VPS ~US$ 20–40/mês | igual OSM | igual OSM | ODbL | 1–3 s | ⏳ opcional (`OVERPASS_URLS`) |
| Foursquare Places / HERE / TomTom | pagos com cota grátis | média | variável | contratos próprios | rápido | ⏳ não implementado — podem entrar como novo arquivo em `src/core/providers/` |

**Recomendação de custo-benefício**: OSM para começar sem custo; **Google Places** quando o volume justificar (melhor cobertura e é a única fonte com avaliações, que alimentam o sinal "boa reputação" e a seção de avaliações do site gerado).

Campos pedidos ao Google: identificação, endereço, telefone, site, nota, nº de avaliações, status, horário (`regularOpeningHours`), resumo (`editorialSummary`) e fotos (`photos`). As fotos são servidas pelo proxy `/api/image?place=...` (a chave fica no servidor) e o site gerado exibe o crédito "Fotos: Google Maps (autor)", como pedem os termos.

Para ativar o Google: crie uma chave no Google Cloud com a **Places API (New)** habilitada e restrição por API, e defina `GOOGLE_PLACES_API_KEY` como secret no Cloudflare. Teste uma busca e confira o status do provedor na tela de resultados.

### Velocidade da busca

- Servidores públicos do Overpass ficam frequentemente congestionados. Mitigações implementadas: query só por tags (a busca por nome via regex só roda quando o nicho não tem tag conhecida), saída ordenada por `qt` (mais barata), disparo escalonado entre 3 servidores e cache de 24 h por nicho+local.
- Medido em 24/10/2026: busca nova ~21 s; repetida 0,35 s.
- Para ficar sempre rápido: Google Places ou um Overpass próprio (`OVERPASS_URLS=https://seu-servidor/api/interpreter`).

### Tratamento de rate limit, erros e privacidade

- Nominatim: no máximo 1 requisição/s por isolate, `User-Agent` com contato (`OSM_CONTACT`).
- Respostas de erro dos provedores não são repassadas ao navegador (só o status), e chaves são removidas dos logs.
- Cada resultado guarda provedor, ID externo, link de origem, consulta e data de coleta.
- LGPD: dados de empresas (pessoa jurídica) em fontes públicas. Evite armazenar dados pessoais além do necessário (ex.: celular pessoal do dono) e atenda pedidos de exclusão (botão "Excluir lead").

## Diagnóstico

Além do checklist, o diagnóstico coleta a identidade do site atual (`src/core/brandAssets.ts`): logo, ícone, og:image, até 12 fotos, `theme-color` e cores do CSS, títulos de serviços (H2/H3), Instagram, Facebook e e-mail. Esses dados alimentam o construtor de site.

| Item | Estado |
|---|---|
| HTML inicial (HTTPS, status, viewport, title, description, headings, links tel/WhatsApp, formulários, schema, OG, imagens sem alt, sinais de site antigo) | ✅ |
| Velocidade real (PageSpeed Insights, mobile) | ⚙️ `PAGESPEED_API_KEY` (gratuita) |
| Conteúdo carregado por JavaScript | ❌ não analisado (ver limitações) |

## vault-sites

**Estado: ⏳ pendente de configuração.** Não havia acesso ao vault-sites neste ambiente; nenhum endpoint, fila ou webhook foi presumido como existente.

O que existe:
- **Construtor de site local** (sem IA) que já entrega um site completo para apresentar — não depende do vault-sites.
- Briefing exportável (JSON/Markdown) com schema `prospecta.vault-sites.briefing/v1` (`src/core/briefing.ts`).
- Adaptador server-side `POST /api/vault-sites/briefing` que só encaminha quando `VAULT_SITES_ENDPOINT` (https) e `VAULT_SITES_TOKEN` existem; caso contrário responde `501 pendente_configuracao`.

### Contrato proposto (a validar com o vault-sites)

```
POST {VAULT_SITES_ENDPOINT}
Authorization: Bearer {VAULT_SITES_TOKEN}
Idempotency-Key: lead-<uuid>-<hash do conteúdo>
Content-Type: application/json

<SiteBriefing v1>

→ 202 { "projectId": "...", "status": "queued" }    # aceito
→ 200 { "projectId": "...", "status": "..." }       # mesma Idempotency-Key já recebida
→ 4xx { "error": "..." }                             # payload inválido — não reenviar sem corrigir
→ 5xx                                                 # pode reenviar com a MESMA chave
```

Necessário para completar o fluxo (ainda não existe):
- `GET {endpoint}/{projectId}` para acompanhar status (`queued | building | ready | failed`) e URL de prévia.
- Webhook opcional de conclusão, assinado (HMAC) e validado no servidor.

Garantias já implementadas do lado do Prospecta: autenticação só no servidor, chave de idempotência estável (mesmo conteúdo = mesma chave), registro de cada entrega no lead, reenvio seguro, bloqueio de dados de demonstração, mensagens de erro sem segredos.

## Publicação no Cloudflare

**Estado: ⏳ não implementado.** Caminho recomendado quando houver autorização:
1. Token de API do Cloudflare com escopo mínimo **Cloudflare Pages: Edit**, guardado como secret.
2. Function `POST /api/publish` que recebe o HTML gerado, cria/atualiza um projeto Pages por cliente via Direct Upload e retorna a URL `*.pages.dev`.
3. Confirmação explícita do usuário a cada publicação, registro de quem/quando, e nunca publicar dados de demonstração.

Enquanto isso: baixe o HTML no construtor e publique manualmente (`npx wrangler pages deploy pasta-do-site`) ou arraste para o painel do Pages.
