# Coletor do Google Maps (local)

Busca empresas direto no Google Maps usando o **gosom/google-maps-scraper** (open source, MIT, v1.18.1),
sem API paga e sem gastar tokens de IA. Roda **no seu computador**: o Cloudflare não executa navegador.

> **Aviso:** raspar o Google Maps contraria os termos do Google. Risco aceito pelo projeto: só dados públicos
> de empresas, uma coleta por vez, sem login.

## Instalar (Windows)

1. Baixe o binário da página de releases (já feito nesta máquina em `coletor/bin/gms.exe`):
   `google_maps_scraper-1.18.1-windows-amd64.exe` → salve como `coletor/bin/gms.exe`.
   SHA-256 conferido: `c124fab30f12e4aae25ef52f38eb2bea5422ece708b3171ca0f34be56cf7848f`.
2. Na primeira coleta ele baixa sozinho o Chromium (~150 MB) para `%LOCALAPPDATA%\ms-playwright`.
3. Em Linux/macOS use o binário correspondente salvo como `coletor/bin/gms`.

## Ativar as fotos do Maps (modo completo via Docker)

Nesta máquina o Google bloqueou o modo completo pelo binário Windows. O teste via Docker (Linux, como no fluxo original do time) depende de instalar WSL2 + Docker Desktop, o que exige administrador e reinício:

1. Menu Iniciar (botão direito) → **Terminal (Administrador)**, na pasta `prospecta`:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\coletor\instalar-docker.ps1
   ```
2. Reinicie o computador, abra o **Docker Desktop** e espere "Engine running".
3. Teste: `npm run coletor:testar` — mostra quantas empresas vieram e quantas **com fotos**.
4. Pronto: `npm run coletor` detecta o Docker sozinho e usa o modo completo, com o rápido como reserva automática se o Google bloquear.

## Usar

```bash
npm run coletor
```

Deixe esse terminal aberto. Em **Prospectar**, a opção **Google Maps** fica disponível ("coletor ativo").
Cada busca nova leva ~10–60 s; repetir a mesma busca em 24 h é instantâneo (cache em `coletor/saida/cache`).

## Configuração (variáveis de ambiente)

| Variável | Padrão | Para quê |
|---|---|---|
| `COLETOR_PORT` | `8790` | Porta local |
| `COLETOR_ORIGINS` | localhost:8788 e :5173 | Sites que podem chamar o coletor. **Adicione a URL publicada** (ex.: `https://prospecta.pages.dev`) para usar o app online com o coletor do seu PC |
| `COLETOR_TOKEN` | vazio | Se definido, informe o mesmo token em Ajustes |
| `COLETOR_DEPTH` | `2` | Mais = mais resultados e mais tempo |
| `COLETOR_MODO` | `auto` | `auto`: Docker (com fotos) quando ligado, senão rápido; `rapido`: sempre rápido; `completo`: só completo |
| `COLETOR_IMAGEM` | `gosom/google-maps-scraper:v1.18.0@sha256:09ba6c2c74ca5dd063c370fd17e2d3da91cc8b1c50172093bdb62268d5c57ddb` | Imagem Docker do modo completo |
| `COLETOR_CONTATO` | vazio | E-mail de contato enviado ao Nominatim (geolocalização) |

## Modos

- **Rápido (padrão, funcionando):** nome, categoria, telefone, site, nota, nº de avaliações, horário, endereço,
  coordenadas e link do Maps. **Não traz fotos.** Usa as coordenadas do local (geolocalizado pelo OpenStreetMap).
  Teste real em 24/10/2026: "advogado em Joinville SC" → 20 empresas em 8 s.
- **Completo:** traz também as fotos do perfil. Em 24/10/2026, nesta máquina (Windows), o Google respondeu com uma
  página que a v1.18.1 não reconhece (`unexpected page type`), tanto para buscas quanto para páginas de empresa.
  Alternativas quando precisar das fotos do Maps: versão mais nova do gosom, rodar em Linux/Docker (como no fluxo
  original do time) ou a API oficial do Google Places (paga).

Sem fotos do Maps, o construtor de site usa as fotos e o logo do **site atual** do cliente (via diagnóstico) ou fotos enviadas manualmente.

## Segurança

- Escuta só em `127.0.0.1` (não fica acessível na rede).
- Recusa chamadas de sites fora de `COLETOR_ORIGINS`; responde ao pré-teste de "Private Network Access" do Chrome.
- Termos de busca são sanitizados antes de virar arquivo de entrada; uma coleta por vez; coletas travadas são encerradas em 8 min.
