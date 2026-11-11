# Levar o Prospecta para outro PC

O app online (https://prospecta-9y4.pages.dev) **não depende do PC**: continua funcionando igual.
O PC só importa para (1) editar/publicar o app e (2) a busca no Google Maps (coletor local).

## 1. Copiar
- Copie a pasta `prospecta` inteira (pode pular `node_modules`, `dist` e `.wrangler`; são recriadas).
- Mantenha o arquivo `.acesso-producao.txt` (código de acesso do app). Não compartilhe.

## 2. Instalar no PC novo
1. **Node.js 20 ou mais novo** (nodejs.org).
2. Na pasta do projeto: `npm install`
3. Entrar no Cloudflare para publicar: `npx wrangler login` (conta **Dan Pages**).
4. Testar: `npm run check` (testes + build).

## 3. Google Maps (opcional, só se for buscar no Maps)
- Rodar o coletor: `npm run coletor` (deixa o PC ligado enquanto busca).
- Iniciar sozinho com o Windows: Win+R → `shell:startup` → copie `coletor\iniciar-oculto.vbs` para lá.
- Busca com fotos e avaliações: instale o **Docker Desktop** (`coletor\instalar-docker.ps1`). Feche o Docker quando não usar (pesa no PC).

## 4. Dados dos leads
Os leads ficam salvos **no navegador** de cada aparelho (não na pasta). No PC novo o app abre vazio até você buscar/importar.
Para levar os leads: no PC antigo, Ajustes → **Exportar backup** (arquivo .json); no novo, Ajustes → **Importar backup**.

## 5. Claude no PC novo
Abra o Claude Code nesta pasta: ele lê o `CLAUDE.md` e já entende o projeto. Peça, por exemplo:
"leia o CLAUDE.md e o docs/MUDAR-DE-PC.md e confira se está tudo pronto neste PC".
