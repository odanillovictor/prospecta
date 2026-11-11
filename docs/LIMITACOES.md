# Limitações conhecidas

## Dados e busca
- **Coletor do Google Maps roda só no computador** onde `npm run coletor` está aberto; no iPhone a opção fica desligada. Modo rápido não traz fotos; o modo completo (com fotos) foi bloqueado pelo Google nesta máquina em 24/10/2026. Categorias vêm em inglês e são traduzidas por tabela.
- Raspar o Google Maps contraria os termos do Google (risco aceito pelo time).
- Categorias do OSM fora da tabela de tradução aparecem como no OSM (em inglês).
- **OpenStreetMap tem cobertura irregular no Brasil** e não traz avaliações. Muitos negócios não estão mapeados; "sem site" significa que *a fonte* não informou site — confirme antes de abordar.
- **Velocidade do OSM depende de servidores públicos gratuitos**: ~10–40 s numa busca nova (às vezes indisponíveis — o app mostra o erro e nada é salvo). Repetições usam cache de 24 h. Para buscas rápidas e completas, configure o Google Places.
- **Google Places não foi testado com uma chave real** neste ambiente (testes usam respostas simuladas no formato da documentação). Valide a primeira busca após configurar.
- Cache é por data center da Cloudflare (Cache API), não global.
- Throttle do Nominatim é por isolate do Worker, não global.

## Diagnóstico
- Analisa só o **HTML inicial**: sites montados por JavaScript (Wix, alguns construtores) podem parecer sem conteúdo/CTA. Itens "inferidos" são heurísticas.
- Sem `PAGESPEED_API_KEY`, "velocidade" é apenas o tempo de resposta do servidor visto da Cloudflare.
- Sites que bloqueiam bots/Cloudflare aparecem como falha de acesso (o erro é registrado; nenhuma verificação é inventada).
- Experiência real no celular, credibilidade visual e avaliações ficam como validação manual.

## Construtor de site
- **Fotos ilustrativas**: sem foto real do cliente (Maps em modo rápido e sem site), o construtor aplica fotos de banco aberto (Openverse/Flickr, licenças Creative Commons com uso comercial), filtradas para evitar fachadas, pessoas e lugares identificáveis, com crédito no rodapé. A qualidade varia: **revise e troque por fotos reais** do cliente sempre que possível.
- Cada empresa recebe automaticamente uma combinação própria (estilo, cor, layout do topo e dos serviços, título); "Outra combinação" sorteia de novo.
- A prévia de link no WhatsApp/redes só funciona depois de publicar o .zip e informar o **endereço publicado** (as redes exigem URL absoluta da imagem `og.jpg`).
- **Instagram não é lido automaticamente**: a Meta proíbe raspagem e a API oficial exige autorização da própria conta do cliente. O @ entra como link; fotos do Instagram podem ser enviadas manualmente (com autorização).
- Fotos do Google Maps só aparecem com a chave do Google configurada. Sem ela, as imagens vêm do site atual (via diagnóstico) ou de envio manual.
- Imagens de sites de terceiros podem ter direitos autorais: use-as na proposta para o próprio cliente.
- Os textos vêm de pacotes por segmento: são genéricos e verdadeiros, mas **revise com o cliente** (serviços, horário, diferenciais). O gerador não inventa números nem depoimentos.
- Imagens enviadas manualmente ficam só na sessão. As escolhidas do site/Google são salvas como referência e buscadas de novo ao abrir. Sem foto real, o topo usa o cartão da marca com dados reais (nunca imagem decorativa).
- Fontes vêm do Google Fonts e o mapa do OpenStreetMap (requerem internet).
- O formulário do site gerado abre o WhatsApp; não há backend de e-mail.

## Armazenamento
- Leads ficam no **localStorage do navegador** (~5 MB, alguns milhares de leads). Não sincroniza entre aparelhos. Use Exportar/Importar backup. Fase 2: Cloudflare D1 (ver ARQUITETURA.md).
- Limpar dados do navegador apaga os leads.

## Integrações pendentes
- vault-sites: pendente de configuração (contrato proposto em INTEGRACOES.md).
- Publicação no Cloudflare: não implementada.
- Acompanhamento de status de criação: depende de endpoint do vault-sites.

## Outros
- Wrangler 3 instalado (avisa que há versão 4); funciona, atualização opcional.
- Ícones do PWA são gerados por script (`npm run icons`); troque por arte própria se quiser.
