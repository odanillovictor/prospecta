# Segurança

## Segredos
- Nenhuma chave no navegador. Chaves vivem só como secrets do Cloudflare (`wrangler pages secret put`) ou em `.dev.vars` local (ignorado pelo git).
- Nunca use o prefixo `VITE_` para segredos: tudo com esse prefixo vai para o JavaScript público.
- `/api/integrations` informa apenas se cada integração está ativa (booleanos).
- Mensagens de erro e logs passam por `redact()`, que remove valores de chaves e parâmetros `key=`.

## Acesso
- Recomendado: **Cloudflare Access** na frente do projeto inteiro (login por e-mail/Google, gratuito até 50 usuários).
- Alternativa mínima: `APP_ACCESS_TOKEN`. O middleware exige o header `x-app-token` (comparação em tempo constante). O token é informado em Ajustes e fica só no navegador.

## Entradas
- Busca: tamanho limitado, caracteres de controle e `<>{}` removidos, provedores em lista permitida, `limit` ≤ 200. O termo enviado ao Overpass é sanitizado (sem aspas/metacaracteres).
- Corpo das requisições limitado (200–300 KB) e JSON validado.
- CSV limitado a 5 MB; imagens do construtor a 4 MB e só PNG/JPG/WEBP.

## Diagnóstico de sites (SSRF)
- Só `http/https`, portas 80/443, sem usuário/senha na URL.
- Bloqueia `localhost`, `.local`, `.internal`, IPs privados/link-local/CGNAT/multicast e IPv6 literal.
- Redirecionamentos seguidos manualmente (máx. 5), cada destino revalidado.
- Leitura limitada a 2 MB, timeout de 12 s.

## Sites gerados
- Todo texto vindo do lead ou do construtor é escapado (`esc()`); JSON-LD escapa `<`; cores aceitas só em hex; imagens só como data URL raster (SVG recusado).
- A prévia roda em `iframe` com `sandbox="allow-scripts allow-popups"` (sem `allow-same-origin`): o site gerado não acessa os dados do app.
- A CSP do app autoriza apenas o script do gerador por hash SHA-256; um teste falha se o script mudar sem atualizar o hash.

## Cabeçalhos (public/_headers)
CSP restritiva, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`. O service worker nunca intercepta `/api/*`.

## Ações com efeito externo
- WhatsApp: o app só abre `wa.me` com texto pré-preenchido após uma tela de confirmação; o envio é feito pela pessoa no WhatsApp. Registrar o contato também exige confirmação.
- vault-sites: envio apenas por clique, com idempotência; dados de demonstração são recusados no servidor (422).
- Publicação no Cloudflare: não implementada; quando for, exigirá autorização explícita a cada publicação.

## Auditoria de 24/10/2026

**Aplicado e verificado**
- Bloqueio contra tentativas de adivinhar o código: 8 falhas do mesmo IP → 15 min bloqueado (HTTP 429). Requisições sem código não contam.
- Cabeçalhos: HSTS (1 ano), `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy` (same-origin no app, cross-origin só nas prévias `/p/*` para o WhatsApp ler a imagem).
- Prévias: botão "Despublicar" (`DELETE /api/preview`) — o link para de funcionar na hora; CSP própria que só executa o script do gerador (hash) e `noindex`.
- Coletor local: recusa Host externo (proteção contra DNS rebinding, HTTP 421), recusa origens fora da lista (403), escuta só em 127.0.0.1, cabeçalhos `nosniff`/`no-referrer`.
- Container Docker (modo completo): `--cap-drop ALL`, `--security-opt no-new-privileges`, limites de memória (2 GB), CPU (2) e processos (512), nenhuma porta publicada, só a pasta da coleta montada. Desligável com `COLETOR_DOCKER_HARDEN=0` se algo quebrar.
- Build conferido: nenhum código de acesso nem chave de API no front-end. Dependências de produção: 0 vulnerabilidades.
- Hospedeiro (só leitura): firewall do Windows ativo nos 3 perfis, Defender com tempo real ligado, API do Docker não exposta em TCP 2375, serviços da ferramenta só em 127.0.0.1.

**Pendente / atenção**
- Ferramentas de desenvolvimento (vite, vitest, wrangler 3) têm vulnerabilidades conhecidas (rodam só no PC, não vão para o site). Atualizar para wrangler 4 / vite 6 / vitest 3 quando houver espaço em disco.
- Imagem Docker fixada em `v1.18.0` por digest (a `latest`/v1.18.1 publicada pelo autor veio quebrada: driver do navegador com 0 bytes). Atualizar só após testar com `npm run coletor:testar`.
- Endurecimento do container testado com o modo completo: 20 empresas, 20 com foto (24/10/2026).
- Disco C: liberado (58 GB livres).
- Código de acesso é compartilhado (um único segredo). Para login individual por e-mail, ativar **Cloudflare Access** no projeto (Zero Trust → Access → Applications → Self-hosted → domínio `prospecta-9y4.pages.dev`, política "Emails" com o seu e-mail) e criar uma regra de **Bypass** para o caminho `/p/*` (prévias precisam ser públicas).
- Trocar o código: painel do Cloudflare → Workers & Pages → prospecta → Configurações → Variáveis e segredos → `APP_ACCESS_TOKEN` → editar; depois publicar de novo e colar o novo código no app.
- AnyDesk escuta em todas as interfaces (porta 7070): manter só se usar acesso remoto, com senha forte.
