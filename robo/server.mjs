// Serviço local do robô de vendas: PONTE entre o app Prospecta e a extensão "Prospecta Robô", que roda no SEU Chrome
// (onde o WhatsApp Web já está logado). Nada de janela nova nem perfil anônimo.
//
//   npm run robo          modo seguro: o robô escreve a mensagem no WhatsApp Web mas NÃO envia
//   npm run robo:real     libera o envio real (o app ainda exige modo teste desligado e a sua aprovação)
//
// Variáveis (arquivo .robo.env, ignorado pelo git):
//   ROBO_PORT=8791   ROBO_ORIGINS=http://localhost:8788,https://seu-projeto.pages.dev
//   ROBO_ENVIO_REAL=1 (ou use npm run robo:real)   ROBO_MAX_DIA=40   ROBO_GAP_SEG=45
//   ROBO_AGENT_URL=https://…   ROBO_AGENT_TOKEN=…   (agente de vendas do usuário; o segredo fica aqui)
//
// Aviso: automatizar o WhatsApp Web contraria os termos do WhatsApp e pode levar ao bloqueio do número.
// Use número dedicado, poucas mensagens e só com aprovação. Ver o vault "Robô de vendas".
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(ROOT, 'estado.json');
const PORT = Number(process.env.ROBO_PORT || 8791);
const HOST = '127.0.0.1';
const ORIGINS = (process.env.ROBO_ORIGINS || 'https://prospecta-9y4.pages.dev,http://localhost:8788,http://127.0.0.1:8788,http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()).filter(Boolean);
const REAL = process.env.ROBO_ENVIO_REAL === '1';
const MAX_DAY = Math.max(1, Number(process.env.ROBO_MAX_DIA || 40));
const GAP_MS = Math.max(15, Number(process.env.ROBO_GAP_SEG || 45)) * 1000;
const AGENT_URL = process.env.ROBO_AGENT_URL || '';
const AGENT_TOKEN = process.env.ROBO_AGENT_TOKEN || '';
const CMD_TIMEOUT_MS = 150_000;
const EXT_ALIVE_MS = 20_000;

// ---------- estado em disco: teto diário e intervalo valem mesmo se o app errar ----------
function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { sends: [] };
  }
}
function writeState(s) {
  writeFileSync(STATE_FILE, JSON.stringify({ sends: s.sends.slice(-500) }, null, 1));
}
const todayKey = () => new Date().toISOString().slice(0, 10);
const sentToday = () => readState().sends.filter((x) => x.at.slice(0, 10) === todayKey()).length;
const lastSendMs = () => {
  const s = readState().sends;
  return s.length ? new Date(s[s.length - 1].at).getTime() : 0;
};

// ---------- ponte com a extensão ----------
let ext = { lastTick: 0, estado: null };
let paused = false;
const queue = []; // comandos aguardando a extensão buscar
const inflight = new Map(); // id → { resolve, reject, timer }
let current = null; // comando entregue à extensão e ainda sem resultado

const extAlive = () => Date.now() - ext.lastTick < EXT_ALIVE_MS;

function waState() {
  if (!extAlive()) return 'extensao_ausente';
  const e = ext.estado ?? {};
  if (e.conectado) return 'conectado';
  if (e.qr) return 'qr';
  return 'carregando';
}

function enqueue(cmd) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => {
      inflight.delete(id);
      const i = queue.findIndex((c) => c.id === id);
      if (i >= 0) queue.splice(i, 1);
      if (current?.id === id) current = null;
      reject(new Error('A extensão não respondeu a tempo. Deixe a aba do WhatsApp Web aberta no Chrome.'));
    }, CMD_TIMEOUT_MS);
    inflight.set(id, { resolve, reject, timer });
    queue.push({ id, ...cmd });
  });
}

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  if (origin && (ORIGINS.includes(origin) || origin.startsWith('chrome-extension://'))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req, max = 200_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > max) {
        reject(new Error('Corpo grande demais.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const isPhone = (p) => typeof p === 'string' && /^55[1-9]{2}9\d{8}$/.test(p);

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const host = String(req.headers.host || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') return send(res, 421, { error: 'Host não permitido.' }, null);
  const fromExt = !!origin && origin.startsWith('chrome-extension://');
  if (origin && !fromExt && !ORIGINS.includes(origin)) return send(res, 403, { error: 'Origem não permitida.' }, null);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin ?? '',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
      Vary: 'Origin',
    });
    return res.end();
  }
  const url = new URL(req.url, 'http://localhost');

  // ---- extensão: batida de coração + resultado do comando anterior; devolve o próximo comando ----
  if (req.method === 'POST' && url.pathname === '/ext/tick') {
    if (!fromExt) return send(res, 403, { error: 'Só a extensão pode chamar esta rota.' }, null);
    let b = {};
    try { b = JSON.parse(await readBody(req, 8_000_000)); } catch { /* corpo vazio */ }
    ext = { lastTick: Date.now(), estado: b.estado ?? null };
    if (b.resultado?.id && inflight.has(b.resultado.id)) {
      const p = inflight.get(b.resultado.id);
      clearTimeout(p.timer);
      inflight.delete(b.resultado.id);
      if (current?.id === b.resultado.id) current = null;
      p.resolve(b.resultado);
    }
    let comando = null;
    if (!current && queue.length && !paused) {
      comando = queue.shift();
      current = comando;
    }
    return send(res, 200, { ok: true, comando, pausado: paused }, origin);
  }

  // ---- app ----
  if (req.method === 'GET' && url.pathname === '/status') {
    return send(res, 200, { ok: true, whatsapp: waState(), titulo: ext.estado?.titulo ?? null, envioReal: REAL, pausado: paused, enviadasHoje: sentToday(), tetoDia: MAX_DAY, agente: !!AGENT_URL, ocupado: !!current || queue.length > 0 }, origin);
  }
  if (req.method === 'POST' && url.pathname === '/pausa') {
    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch { /* corpo vazio */ }
    paused = body.pausado !== false;
    return send(res, 200, { ok: true, pausado: paused }, origin);
  }

  if (req.method === 'POST' && url.pathname === '/enviar') {
    let b;
    try { b = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'JSON inválido.' }, origin); }
    const text = typeof b.text === 'string' ? b.text.replace(/\u0000/g, '').trim().slice(0, 1500) : '';
    if (!isPhone(b.phone)) return send(res, 400, { error: 'Só celular brasileiro (55 + DDD + 9 dígitos).' }, origin);
    if (!text) return send(res, 400, { error: 'Mensagem vazia.' }, origin);
    if (waState() !== 'conectado') return send(res, 409, { error: 'WhatsApp Web não está pronto. Abra web.whatsapp.com no Chrome (com a extensão instalada).' }, origin);
    if (paused) return send(res, 423, { error: 'Robô em pausa.' }, origin);
    if (current || queue.length) return send(res, 429, { error: 'Já existe uma operação em andamento. Aguarde.' }, origin);
    const wantReal = b.dryRun === false;
    if (wantReal && !REAL) return send(res, 403, { error: 'Envio real bloqueado: inicie o serviço com "npm run robo:real" (trava de segurança).' }, origin);
    if (wantReal) {
      if (sentToday() >= MAX_DAY) return send(res, 429, { error: `Teto diário do serviço (${MAX_DAY}) atingido.` }, origin);
      const wait = lastSendMs() + GAP_MS - Date.now();
      if (wait > 0) return send(res, 429, { error: `Aguarde ${Math.ceil(wait / 1000)}s (intervalo mínimo entre envios).` }, origin);
    }
    try {
      const r = await enqueue({ tipo: 'enviar', phone: b.phone, text, dryRun: !wantReal });
      if (!r.ok) {
        // Sem confirmação = o clique em enviar aconteceu e talvez a mensagem tenha saído: conta no teto/intervalo e avisa para NÃO reenviar sem conferir.
        if (wantReal && r.codigo === 'sem_confirmacao') {
          const st = readState();
          st.sends.push({ at: new Date().toISOString(), phone: `${b.phone.slice(0, 4)}…${b.phone.slice(-2)}`, incerto: true });
          writeState(st);
          return send(res, 502, { error: 'Não consegui confirmar o envio. A mensagem PODE ter sido enviada: confira a conversa antes de tentar de novo.', code: r.codigo }, origin);
        }
        return send(res, r.codigo === 'numero_invalido' ? 422 : 502, { error: r.erro || 'Falha ao enviar.', code: r.codigo }, origin);
      }
      if (wantReal && r.enviado) {
        const st = readState();
        st.sends.push({ at: new Date().toISOString(), phone: `${b.phone.slice(0, 4)}…${b.phone.slice(-2)}` });
        writeState(st);
      }
      return send(res, 200, { ok: true, enviado: !!r.enviado, teste: !wantReal, aviso: !wantReal ? 'Modo teste: a mensagem foi escrita no WhatsApp Web, mas NÃO foi enviada.' : undefined }, origin);
    } catch (e) {
      return send(res, 504, { error: String(e?.message ?? e) }, origin);
    }
  }

  if (req.method === 'GET' && url.pathname === '/conversa') {
    const phone = url.searchParams.get('phone');
    if (!isPhone(phone)) return send(res, 400, { error: 'Número inválido.' }, origin);
    if (waState() !== 'conectado') return send(res, 409, { error: 'WhatsApp Web não está pronto.' }, origin);
    if (paused) return send(res, 423, { error: 'Robô em pausa.' }, origin);
    if (current || queue.length) return send(res, 429, { error: 'Operação em andamento.' }, origin);
    try {
      const r = await enqueue({ tipo: 'conversa', phone });
      if (!r.ok) return send(res, r.codigo === 'numero_invalido' ? 422 : 502, { error: r.erro || 'Falha ao ler a conversa.', code: r.codigo }, origin);
      return send(res, 200, { ok: true, messages: r.mensagens ?? [] }, origin);
    } catch (e) {
      return send(res, 504, { error: String(e?.message ?? e) }, origin);
    }
  }

  // Catálogo do WhatsApp Business do número (só lê o perfil comercial e o catálogo, nunca as mensagens)
  if (req.method === 'GET' && url.pathname === '/catalogo') {
    const phone = url.searchParams.get('phone');
    if (!isPhone(phone)) return send(res, 400, { error: 'Número inválido.' }, origin);
    if (waState() !== 'conectado') return send(res, 409, { error: 'WhatsApp Web não está pronto.' }, origin);
    if (paused) return send(res, 423, { error: 'Robô em pausa.' }, origin);
    if (current || queue.length) return send(res, 429, { error: 'Operação em andamento.' }, origin);
    try {
      const r = await enqueue({ tipo: 'catalogo', phone });
      if (!r.ok) return send(res, r.codigo === 'numero_invalido' ? 422 : 502, { error: r.erro || 'Falha ao ler o catálogo.', code: r.codigo }, origin);
      return send(res, 200, { ok: true, catalogo: r.catalogo ?? { nome: '', itens: [] } }, origin);
    } catch (e) {
      return send(res, 504, { error: String(e?.message ?? e) }, origin);
    }
  }

  // Perfil público do Instagram (nome, bio, foto de perfil e posts) lido pelo Chrome do usuário; nada é postado nem seguido.
  if (req.method === 'GET' && url.pathname === '/instagram') {
    const handle = (url.searchParams.get('handle') ?? '').replace(/^@/, '');
    if (!/^[\w.]{1,40}$/.test(handle)) return send(res, 400, { error: 'Usuário do Instagram inválido.' }, origin);
    if (!extAlive()) return send(res, 409, { error: 'Extensão ausente. Abra o WhatsApp Web no Chrome com a extensão instalada.' }, origin);
    if (paused) return send(res, 423, { error: 'Robô em pausa.' }, origin);
    if (current || queue.length) return send(res, 429, { error: 'Operação em andamento.' }, origin);
    try {
      const r = await enqueue({ tipo: 'instagram', handle });
      if (!r.ok) return send(res, 502, { error: r.erro || 'Falha ao ler o Instagram.', code: r.codigo }, origin);
      return send(res, 200, { ok: true, instagram: r.instagram }, origin);
    } catch (e) {
      return send(res, 504, { error: String(e?.message ?? e) }, origin);
    }
  }

  // Diagnóstico dos seletores do WhatsApp Web (sem ler conversas): quais peças a extensão enxerga
  if (req.method === 'GET' && url.pathname === '/diagnostico') {
    if (!extAlive()) return send(res, 409, { error: 'Extensão ausente.' }, origin);
    try {
      const r = await enqueue({ tipo: 'diagnostico' });
      return send(res, 200, { ok: true, diagnostico: r.diagnostico }, origin);
    } catch (e) {
      return send(res, 504, { error: String(e?.message ?? e) }, origin);
    }
  }

  // Agente de vendas do usuário (proxy: o segredo fica aqui)
  if (req.method === 'POST' && url.pathname === '/agente') {
    if (!AGENT_URL) return send(res, 501, { error: 'Agente não configurado (ROBO_AGENT_URL).' }, origin);
    let payload;
    try { payload = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'JSON inválido.' }, origin); }
    try {
      const r = await fetch(AGENT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(AGENT_TOKEN ? { Authorization: `Bearer ${AGENT_TOKEN}` } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(45_000) });
      if (!r.ok) return send(res, 502, { error: `Agente respondeu HTTP ${r.status}.` }, origin);
      return send(res, 200, { ok: true, resposta: await r.json() }, origin);
    } catch (e) {
      return send(res, 502, { error: `Falha ao falar com o agente: ${String(e?.message ?? e).slice(0, 120)}` }, origin);
    }
  }

  send(res, 404, { error: 'Rota inexistente.' }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`Robô de vendas em http://${HOST}:${PORT}`);
  console.log(REAL ? 'ENVIO REAL liberado. O app ainda exige modo teste desligado e a sua aprovação.' : 'Modo seguro: nada é enviado (só escrito no WhatsApp Web). Para liberar: npm run robo:real');
  console.log(AGENT_URL ? 'Agente de vendas conectado.' : 'Sem agente: usa a estratégia padrão do app.');
  console.log('Falta a extensão no seu Chrome? Veja robo/LEIA-ME.md (chrome://extensions → Carregar sem compactação → robo/extensao).');
});
