# Robô de vendas (WhatsApp Web) — serviço local + extensão

O robô conversa com os leads pelo **WhatsApp Web do seu Chrome** (onde você já está logado). Nada de janela nova nem perfil anônimo.

```
App Prospecta ──HTTP──▶ serviço local (npm run robo, 127.0.0.1:8791) ◀──HTTP── extensão "Prospecta Robô" ──▶ aba do WhatsApp Web
```

> **Aviso:** automatizar o WhatsApp Web contraria os termos do WhatsApp e pode levar ao **bloqueio do número**. Use um número dedicado (ex.: WhatsApp Business só para prospecção), poucas mensagens por dia e **aprovação de cada mensagem** (padrão). A alternativa oficial é a WhatsApp Business Platform (API), paga.

## Instalar (uma vez)
1. No Chrome, abra `chrome://extensions` e ligue **Modo do desenvolvedor** (canto superior direito).
2. **Carregar sem compactação** → escolha a pasta `prospecta/robo/extensao`.
3. Abra `https://web.whatsapp.com` numa aba e **deixe essa aba aberta** (o robô troca de conversa nela; use uma aba só para isso).

> Depois de **atualizar** a extensão (botão de recarregar em `chrome://extensions`), **recarregue também a aba do WhatsApp Web** (F5): a aba antiga perde a conexão com a extensão.

## Usar
```bash
npm run robo          # modo seguro: escreve a mensagem no WhatsApp Web, NÃO envia
npm run robo:real     # libera envio real
```
No app: **Ajustes → Robô** mostra se o serviço e a extensão estão ligados. O **modo teste** vem ligado: o robô só escreve a mensagem na caixa, sem enviar. Para enviar de verdade: `npm run robo:real` **e** desligar o modo teste nos Ajustes.

## Travas de segurança (em camadas)
- Aprovar cada mensagem (padrão) · horário comercial · dias úteis · teto diário · intervalo mínimo entre envios · só celular · para sozinho se o lead pedir ("pare", "não quero"…) · pausa geral.
- O serviço repete o teto diário e o intervalo **mesmo se o app errar** (`ROBO_MAX_DIA`, `ROBO_GAP_SEG`) e bloqueia envio real sem `npm run robo:real`.

## Agente de vendas (opcional)
Crie `.robo.env` (ignorado pelo git) na pasta `prospecta`:
```
ROBO_AGENT_URL=https://seu-agente/endpoint
ROBO_AGENT_TOKEN=segredo
```
Contrato: o app envia `AgentRequest` (ver `src/core/robot/agent.ts`) e espera `{ "action": "send"|"wait"|"stop"|"handoff", "text"?, "waitHours"? }`. Sem agente, vale a estratégia padrão (abertura → lembrete 24 h → novo ângulo 72 h → despedida).

## Se algo não funcionar
O WhatsApp Web muda o HTML de tempos em tempos. `GET http://127.0.0.1:8791/diagnostico` mostra quais peças a extensão enxerga (sem ler conversas). Mande esse resultado para ajustar os seletores em `extensao/wa.js`.

## Instagram (v0.2.0 da extensão)
O construtor de sites pede ao robô o perfil público do Instagram do cliente (`GET /instagram?handle=`). A extensão abre o perfil numa aba em segundo plano, lê nome, bio, foto de perfil e posts, reduz as imagens e fecha a aba. Não posta, não segue, não curte. **Depois de atualizar, recarregue a extensão em chrome://extensions** (pede as novas permissões: tabs, scripting, instagram.com). Se o Instagram pedir login, entre na sua conta no Chrome.
