# Arquitetura

## Visão geral

```
Navegador (PWA React)                      Cloudflare Pages Functions            Serviços externos
┌─────────────────────────┐   /api/*     ┌───────────────────────────┐
│ Telas (src/ui)          │ ───────────▶ │ _middleware (token, erros)│
│ Domínio (src/core) ◀────┼── mesmo ───▶ │ search    ─────────────── │──▶ Nominatim + Overpass (OSM)
│ Armazenamento local     │   código     │                           │──▶ Google Places API (opcional)
│ (localStorage)          │              │ diagnose  ─────────────── │──▶ site do lead (+ PageSpeed opcional)
│ Construtor de site      │              │ integrations              │
└─────────────────────────┘              │ vault-sites/briefing ──── │──▶ vault-sites (quando configurado)
                                         └───────────────────────────┘
```

- **`src/core/`** é TypeScript puro, sem dependências: roda no navegador, no Worker e nos testes. Toda regra de negócio está aqui (normalização, deduplicação, score, diagnóstico, abordagens, briefing e gerador de sites).
- **Functions** só existem onde o navegador não pode agir sozinho: chamar APIs com chave secreta, contornar CORS ao baixar sites de terceiros e aplicar proteção SSRF/limites.
- **Sem IA em tempo de execução.** Abordagens, briefing e sites são gerados por regras e textos versionados no código (`src/core/pitch.ts`, `src/core/site/*`). Custo de tokens: zero.

## Fluxo principal

1. **Busca** (`/api/search`): valida entrada → para cada provedor, consulta com cache de 24 h (Cache API) → devolve empresas normalizadas e o status de cada provedor (`ok`, `sem_resultados`, `nao_configurado`, `erro`).
   - OSM: Nominatim geocodifica o local (≤ 1 req/s por isolate) e o Overpass busca por tags do nicho (`src/core/providers/osmNiches.ts`). Servidores Overpass são acionados de forma escalonada: se o primeiro não responder em 4 s, o segundo entra na corrida; o primeiro que responder vence e os outros são cancelados.
2. **Revisão e consolidação** (navegador): o usuário escolhe o que salvar; `consolidate()` funde com a base existente (domínio próprio, telefone, nome + cidade/proximidade de 250 m, ID da origem) sem sobrescrever dados e registrando todas as origens.
3. **Diagnóstico** (`/api/diagnose`): baixa a página (máx. 2 MB, 12 s, 5 redirecionamentos validados um a um), extrai fatos (`htmlFacts.ts`) e o app converte em checklist (`diagnosis.ts`) separado em **automático / inferido / manual**.
4. **Score** (`scoring.ts`): soma os pesos dos sinais presentes (limite 100). Cada sinal tem estado `sim/não/desconhecido`, origem e justificativa. Confiança = fração do peso total cujo estado é conhecido. Validação manual sobrescreve o automático.
5. **Abordagem** (`pitch.ts`) e **WhatsApp** (`whatsapp.ts`): mensagem curta, sem citar cidade, convidando para uma reunião sem compromisso; link `wa.me` aberto só após confirmação.
6. **Construir o site** (`src/core/site/`): pacote do segmento + dados do lead + melhorias do diagnóstico → HTML único, responsivo e animado. Comparativo "hoje × novo site" para a reunião.
7. **Briefing** (`briefing.ts`): payload versionado para o vault-sites, com chave de idempotência estável.

## Gerador de sites (`src/core/site/`)

| Arquivo | Papel |
|---|---|
| `packs.ts` | Textos por segmento (odonto, saúde, beleza, alimentação, fitness, jurídico/contábil, imóveis, automotivo, pet, genérico): título, serviços, etapas, sobre, FAQ, CTA. **Sem fatos inventados.** |
| `themes.ts` | 5 estilos com tipografia e paleta próprias; cor de destaque personalizável (só hex, contraste automático). |
| `improvements.ts` | Liga cada problema do diagnóstico ao recurso do novo site que o resolve. |
| `clientAssets.ts` | Reúne a identidade real do cliente (site atual + Google Maps) e monta o primeiro rascunho: logo, foto do topo (foto real primeiro), galeria, cor, serviços, horário, Instagram. |
| `variation.ts` | Personalização determinística por empresa (estilo, cor, layout do topo e dos serviços, título) e serviços a partir das categorias reais do Maps. |
| `render.ts` | Monta o modelo e o HTML: SEO local (title/description/OG/JSON-LD LocalBusiness), WhatsApp fixo, formulário que abre o WhatsApp, mapa OSM, avaliações reais (só se existirem), animações (entrada do título, revelação ao rolar, marquee, contador, botões magnéticos), `prefers-reduced-motion`, funciona sem JavaScript. Todo texto é escapado. |

O script embutido no site (`SITE_JS`) é autorizado na CSP do app por hash SHA-256 (`public/_headers`); um teste garante que o hash acompanha o código.

## Modelo de dados

Definido em `src/core/types.ts`. Persistido em `localStorage` (`prospecta.v1.leads`, `prospecta.v1.settings`).

**Lead**
| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `name`, `niche`, `category` | texto | `niche` = termo pesquisado |
| `phone`, `whatsapp` | E.164 sem "+" | `whatsapp` só se a fonte declarou |
| `website` | URL | redes sociais não contam como site próprio |
| `address`, `neighborhood`, `city`, `state`, `lat`, `lon` | | |
| `rating`, `reviewCount` | número | só de fontes que informam (Google/CSV) |
| `sources[]` | `{provider, externalId, url, collectedAt, query}` | origem e data de coleta |
| `isDemo` | boolean | dados fictícios nunca se misturam com reais |
| `status` | `novo, pesquisado, contatado, respondeu, reuniao, finalizado` | quadro mostra só as 4 últimas; dados antigos (proposta/cliente/perdido) são migrados |
| `outcome` | `ganho \| perdido` | resultado ao finalizar |
| `labels[]`, `description`, `comments[]` | | cards estilo Trello |
| `hours`, `summary`, `instagram`, `photos[]` | | do Google Maps/OSM |
| `lastContactAt`, `nextAction`, `nextActionAt`, `notes`, `contactLog[]` | | funil |
| `manualSignals` | mapa sinal → boolean | validação humana |
| `diagnosis` | `{ranAt, ok, error?, facts?, checks[]}` | |
| `siteDraft` | textos/tema do construtor | imagens não são persistidas |
| `deliveries[]` | registro de envios ao vault-sites | |

**Settings**: `labels` (etiquetas do quadro), `scoring` (pesos, limiares quente/morno, segmentos e locais prioritários), `seller` (nome/empresa para mensagens), `accessToken` (opcional).

### Evolução prevista (fase 2): Cloudflare D1

O armazenamento está isolado em `src/data/store.ts`. Para multiusuário/multidispositivo, criar tabelas `leads`, `lead_sources`, `contact_log`, `deliveries` no D1, expor `GET/PUT /api/leads` nas Functions e trocar a implementação do `store` mantendo a mesma interface. O formato de backup (`prospecta.backup/v1`) serve de migração.

## Score padrão

| Sinal | Peso | Origem |
|---|---|---|
| Empresa sem site próprio | 40 | automático (dados da fonte) |
| Tem telefone/WhatsApp | 15 | automático |
| Boa reputação (≥ 4,3 e ≥ 15 avaliações) | 12 | inferido |
| Site não preparado para celular | 12 | automático |
| Urgência/capacidade validada por você | 10 | manual |
| Sem HTTPS · Sem CTA · Site desatualizado | 8 cada | auto / inferido |
| Lento · SEO básico · Contato escondido · Oferta confusa · Baixa presença · Segmento prioritário | 6 cada | |
| Sem WhatsApp no site · Local prioritário | 5 cada | |

Quente ≥ 55, morno ≥ 35. Sinais de site valem 0 quando a empresa não tem site. Tudo editável em **Ajustes**.
