// Coletor local do Google Maps (gosom/google-maps-scraper) para o Prospecta.
// Roda no SEU computador (o Cloudflare não executa navegador). O app chama este serviço ao buscar.
//
//   npm run coletor
//
// Variáveis opcionais:
//   COLETOR_PORT=8790
//   COLETOR_ORIGINS=http://localhost:8788,https://seu-projeto.pages.dev   (quem pode chamar)
//   COLETOR_TOKEN=um-segredo   (se definido, o app precisa enviar o mesmo token)
//   COLETOR_DEPTH=2            (profundidade de rolagem no Maps: mais = mais resultados e mais tempo)
//   COLETOR_MODO=auto          (auto = Docker com fotos quando disponível, senão rápido | rapido | completo)
//   COLETOR_IMAGEM=gosom/google-maps-scraper:v1.18.0@sha256:09ba6c2c74ca5dd063c370fd17e2d3da91cc8b1c50172093bdb62268d5c57ddb   (imagem Docker usada no modo completo)
//   COLETOR_CONTATO=seu-email   (identificação exigida pelo Nominatim/OSM para geolocalizar o local)
//
// Aviso: raspar o Google Maps contraria os termos do Google. Use em ritmo baixo, sem login, só dados públicos de empresas.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { dockerHardening } from './hardening.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
// Na nuvem (Hugging Face Spaces) o binário vem da imagem do gosom: COLETOR_BIN=google-maps-scraper.
const BIN = process.env.COLETOR_BIN || join(ROOT, 'bin', process.platform === 'win32' ? 'gms.exe' : 'gms');
const HAS_BIN = !!process.env.COLETOR_BIN || existsSync(BIN);
// Endereço de escuta: 127.0.0.1 no PC; 0.0.0.0 na nuvem (aí o token é obrigatório).
const HOST = process.env.COLETOR_HOST || '127.0.0.1';
const OUT = join(ROOT, 'saida');
const CACHE = join(OUT, 'cache');
const PORT = Number(process.env.COLETOR_PORT || 8790);
const ORIGINS = (process.env.COLETOR_ORIGINS || 'https://prospecta-9y4.pages.dev,http://localhost:8788,http://127.0.0.1:8788,http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TOKEN = process.env.COLETOR_TOKEN || '';
const DEPTH = Math.max(1, Math.min(10, Number(process.env.COLETOR_DEPTH || 2)));
const MODE = ['rapido', 'completo'].includes(process.env.COLETOR_MODO) ? process.env.COLETOR_MODO : 'auto';
const IMAGE = process.env.COLETOR_IMAGEM || 'gosom/google-maps-scraper:v1.18.0@sha256:09ba6c2c74ca5dd063c370fd17e2d3da91cc8b1c50172093bdb62268d5c57ddb';
const CONTACT = process.env.COLETOR_CONTATO || 'contato nao configurado';
const MAX_MS = 8 * 60 * 1000;
const CACHE_MS = 24 * 60 * 60 * 1000;

mkdirSync(CACHE, { recursive: true });

/** @type {Map<string, {id:string,status:'running'|'done'|'error',query:string,startedAt:number,file:string,error?:string,results?:any[],proc?:any,cached?:boolean}>} */
const jobs = new Map();
let running = null;

function clean(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f<>{}"`$\\|;&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Lê a saída JSON do gosom (um objeto por linha; tolera array ou linhas incompletas durante a coleta). */
function readResults(file) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8').trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try { return JSON.parse(text); } catch { /* ainda sendo escrito */ }
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim().replace(/,$/, '');
    if (!l.startsWith('{')) continue;
    try { out.push(JSON.parse(l)); } catch { /* linha parcial */ }
  }
  return out;
}

function cacheFile(query) {
  return join(CACHE, createHash('sha1').update(query.toLowerCase()).digest('hex') + '.json');
}

function pruneCache() {
  for (const f of readdirSync(CACHE)) {
    const p = join(CACHE, f);
    if (Date.now() - statSync(p).mtimeMs > CACHE_MS) rmSync(p, { force: true });
  }
}

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CAPITAIS = {
  acre: 'Rio Branco', alagoas: 'Maceió', amapa: 'Macapá', amazonas: 'Manaus', bahia: 'Salvador', ceara: 'Fortaleza',
  'distrito federal': 'Brasília', 'espirito santo': 'Vitória', goias: 'Goiânia', maranhao: 'São Luís', 'mato grosso': 'Cuiabá',
  'mato grosso do sul': 'Campo Grande', 'minas gerais': 'Belo Horizonte', para: 'Belém', paraiba: 'João Pessoa', parana: 'Curitiba',
  pernambuco: 'Recife', piaui: 'Teresina', 'rio de janeiro': 'Rio de Janeiro', 'rio grande do norte': 'Natal',
  'rio grande do sul': 'Porto Alegre', rondonia: 'Porto Velho', roraima: 'Boa Vista', 'santa catarina': 'Florianópolis',
  'sao paulo': 'São Paulo', sergipe: 'Aracaju', tocantins: 'Palmas',
};

/** Geolocaliza o local (o modo rápido do coletor exige coordenadas). Usa o Nominatim (OSM), com cache. */
const geoCache = new Map();
async function geocode(location) {
  const key = location.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: location, countrycodes: 'br', format: 'jsonv2', limit: '1' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': `prospecta-coletor/0.1 (${CONTACT})`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [first] = await res.json();
  let geo = first ? { lat: Number(first.lat), lon: Number(first.lon), type: first.addresstype || first.type } : null;
  // Estado inteiro (ex.: "Tocantins"): o centro geográfico costuma ser área vazia. Busca na capital.
  const capital = geo?.type === 'state' ? CAPITAIS[norm(first.name)] : undefined;
  if (capital) {
    const cap = await geocode(`${capital}, ${first.name}`);
    if (cap) geo = { ...cap, capital };
  }
  geoCache.set(key, geo);
  return geo;
}

/** Rolagem no Maps proporcional à quantidade pedida (menos resultados = coleta mais rápida). */
function depthFor(limit) {
  // ~10 empresas por "página" de rolagem; o preenchimento abaixo sobe a rolagem se faltar.
  return Math.max(1, Math.min(10, Math.ceil(limit / 10)));
}

function baseArgs(input, file, limit, depth) {
  return ['-input', input, '-results', file, '-json', '-depth', String(depth ?? depthFor(limit)), '-lang', 'pt', '-c', '1', '-exit-on-inactivity', '45s'];
}

function fastArgs(geo) {
  // Bairros: raio menor e zoom maior; cidades: raio de 10 km.
  const small = /suburb|neighbourhood|quarter|road/.test(geo.type || '');
  return ['-fast-mode', '-geo', `${geo.lat},${geo.lon}`, '-zoom', small ? '15' : '13', '-radius', small ? '3000' : '10000'];
}

/** Executa um comando e devolve stdout (ou null se falhar / passar do tempo). */
function run(cmd, args, ms) {
  return new Promise((resolve) => {
    let out = '';
    let p;
    try {
      p = spawn(cmd, args, { windowsHide: true });
    } catch {
      return resolve(null);
    }
    const t = setTimeout(() => { p.kill(); resolve(null); }, ms);
    p.stdout?.on('data', (d) => (out += d));
    p.on('error', () => { clearTimeout(t); resolve(null); });
    p.on('exit', (code) => { clearTimeout(t); resolve(code === 0 ? out.trim() : null); });
  });
}

/** Docker disponível e com o motor ligado? (resultado guardado por 60 s) */
let dockerState = { ok: false, at: 0 };
async function dockerReady() {
  if (Date.now() - dockerState.at < 60_000) return dockerState.ok;
  const v = await run('docker', ['info', '--format', '{{.ServerVersion}}'], 8000);
  dockerState = { ok: !!v, at: Date.now() };
  return dockerState.ok;
}

/**
 * Uma tentativa de coleta. Tipos:
 *  - docker-completo: gosom na imagem Docker (Linux), com fotos;
 *  - local-completo:  binário local sem fast-mode (com fotos; bloqueado pelo Google nesta máquina em 24/10/2026);
 *  - local-rapido:    binário local em fast-mode (sem fotos, funciona).
 */
function attempt(kind, job, dir, geo) {
  return new Promise((resolve) => {
    const file = join(dir, `${kind}.json`);
    job.file = file;
    job.engine = kind;
    let cmd;
    let args;
    let container;
    if (kind === 'docker-completo') {
      container = `prospecta-${job.id.slice(0, 8)}`;
      cmd = 'docker';
      args = ['run', '--rm', '--name', container, ...dockerHardening(), '-v', 'gmaps-playwright-cache:/opt', '-v', `${dir}:/work`, IMAGE,
        ...baseArgs('/work/queries.txt', `/work/${kind}.json`, job.limit, job.depth)];
    } else {
      cmd = BIN;
      args = [...baseArgs(join(dir, 'queries.txt'), file, job.limit, job.depth), ...(kind === 'local-rapido' ? fastArgs(geo) : [])];
    }
    const proc = spawn(cmd, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    job.proc = proc;
    const timer = setTimeout(() => {
      proc.kill();
      if (container) run('docker', ['rm', '-f', container], 15000);
    }, MAX_MS);
    proc.on('error', () => { clearTimeout(timer); resolve([]); });
    proc.on('exit', () => { clearTimeout(timer); resolve(readResults(file)); });
  });
}

/**
 * Liga o Docker Desktop sob demanda (só para "detalhes de uma empresa") e desliga depois de 10 min sem uso,
 * para não deixar a máquina virtual pesando no PC.
 */
const IDLE_STOP_MS = 10 * 60 * 1000;
let startedDocker = false;
let idleTimer = null;
async function ensureDocker() {
  if (await dockerReady()) return true;
  if (process.platform !== 'win32') return false;
  startedDocker = true;
  await run('docker', ['desktop', 'start', '--timeout', '150'], 170_000);
  dockerState = { ok: false, at: 0 };
  return dockerReady();
}
function scheduleDockerStop() {
  if (!startedDocker) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (running) return scheduleDockerStop();
    await run('docker', ['desktop', 'stop'], 90_000);
    startedDocker = false;
    dockerState = { ok: false, at: 0 };
    console.log('Docker desligado após 10 min sem uso.');
  }, IDLE_STOP_MS);
}

async function planFor(geo, full) {
  // Logo após ligar o Docker a 1ª execução pode sair vazia (navegador ainda sendo preparado): tenta 2x.
  if (full) {
    if (await ensureDocker()) return ['docker-completo', 'docker-completo'];
    return MODE === 'completo' && HAS_BIN ? ['local-completo', 'local-completo'] : [];
  }
  const plan = [];
  if (MODE !== 'rapido' && (await dockerReady())) plan.push('docker-completo');
  if (MODE === 'completo' && !plan.length) plan.push('local-completo');
  if (MODE !== 'completo' && geo && HAS_BIN) plan.push('local-rapido');
  return plan;
}

async function startJob(query, geo, limit, full = false) {
  const id = randomUUID();
  // Cache por busca + faixa de quantidade (pedir mais refaz a coleta com mais rolagem).
  const cf = cacheFile(`${query}|${depthFor(limit)}${full ? '|full' : ''}`);
  if (existsSync(cf) && Date.now() - statSync(cf).mtimeMs < CACHE_MS) {
    const cached = JSON.parse(readFileSync(cf, 'utf8'));
    const job = { id, status: 'done', query, startedAt: Date.now(), file: cf, results: (cached.results ?? cached).slice(0, limit), engine: cached.engine, cached: true, limit, exhausted: (cached.results ?? cached).length < limit };
    jobs.set(id, job);
    return job;
  }
  const job = { id, status: 'running', query, startedAt: Date.now(), file: '', engine: full ? 'docker-completo' : undefined, tried: [], limit };
  jobs.set(id, job);
  running = job;
  const plan = await planFor(geo, full);
  if (!plan.length) {
    running = null;
    Object.assign(job, { status: 'error', error: full ? 'Não foi possível ligar o Docker Desktop. Abra-o e tente de novo.' : 'Nenhum modo de coleta disponível (binário ausente e Docker desligado).' });
    return job;
  }
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'queries.txt'), query + '\n', 'utf8');
  (async () => {
    for (const kind of plan) {
      // Fiel à quantidade pedida: se vier menos, rola mais (até 3 rodadas); para quando o Maps não traz mais nada.
      let depth = depthFor(limit);
      let results = [];
      for (let round = 0; round < 3; round++) {
        job.depth = depth;
        const got = await attempt(kind, job, dir, geo);
        job.tried.push(`${kind}/rolagem ${depth}: ${got.length}`);
        const grew = got.length > results.length;
        if (got.length >= results.length) results = got;
        if (results.length >= limit || !grew || depth >= 10) break;
        depth = Math.min(10, depth + 2);
      }
      if (results.length) {
        Object.assign(job, { status: 'done', results: results.slice(0, limit), engine: kind, exhausted: results.length < limit });
        writeFileSync(cf, JSON.stringify({ engine: kind, results, exhausted: results.length < limit }));
        break;
      }
    }
    if (job.status === 'running') Object.assign(job, { status: 'error', error: `Nenhum resultado (${job.tried.join('; ')}).` });
    running = null;
    if (full) scheduleDockerStop();
    rmSync(dir, { recursive: true, force: true });
    pruneCache();
  })();
  return job;
}

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  if (origin && ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10_000) reject(new Error('corpo grande demais'));
    });
    req.on('end', () => resolve(data));
  });
}

// COLETOR_PUBLIC_HOST: domínio público na nuvem (ex.: usuario-prospecta-coletor.hf.space).
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, ...(process.env.COLETOR_PUBLIC_HOST || '').split(',').map((h) => h.trim()).filter(Boolean)]);

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  // Anti "DNS rebinding": um site externo que aponte seu domínio para 127.0.0.1 chega com outro Host.
  if (!ALLOWED_HOSTS.has(String(req.headers.host || ''))) return send(res, 421, { error: 'Host não permitido.' });
  // Bloqueia sites que não estão na lista (o navegador envia Origin em chamadas de outras páginas).
  if (origin && !ORIGINS.includes(origin)) return send(res, 403, { error: `Origem não autorizada: ${origin}. Adicione em COLETOR_ORIGINS.` });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin || '',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-coletor-token',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
    return res.end();
  }
  // Neste PC (acesso direto por 127.0.0.1/localhost, sem proxy nem túnel) o token é dispensado: o modo celular
  // exige token só de quem vem pela rede. Túnel/proxy chegam com Host público ou cabeçalhos "forwarded", então continuam exigindo.
  const ra = req.socket.remoteAddress || '';
  const direct = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ra) && /^(127\.0\.0\.1|localhost):\d+$/.test(String(req.headers.host || '')) && !req.headers['x-forwarded-for'] && !req.headers['cf-connecting-ip'] && !req.headers['forwarded'];
  if (TOKEN && !direct && req.headers['x-coletor-token'] !== TOKEN) return send(res, 401, { error: 'Token do coletor inválido.' }, origin);

  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    const docker = MODE !== 'rapido' && (await dockerReady());
    return send(res, 200, { ok: true, tool: 'gosom/google-maps-scraper', binary: HAS_BIN, docker, photos: docker || MODE === 'completo', busy: !!running, depth: DEPTH, mode: MODE }, origin);
  }
  if (req.method === 'POST' && url.pathname === '/jobs') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'JSON inválido.' }, origin); }
    const niche = clean(body.niche, 80);
    const location = clean(body.location, 120);
    const limit = Math.max(5, Math.min(120, Math.round(Number(body.limit) || 20)));
    if (niche.length < 2 || location.length < 2) return send(res, 400, { error: 'Informe nicho e local.' }, origin);
    if (running) return send(res, 409, { error: 'Já existe uma coleta em andamento. Aguarde terminar.' }, origin);
    let geo = null;
    try {
      geo = await geocode(location);
    } catch (e) {
      return send(res, 502, { error: `Não foi possível localizar "${location}": ${e.message}` }, origin);
    }
    if (!geo && !(await dockerReady())) return send(res, 400, { error: `Local "${location}" não encontrado no Brasil.` }, origin);
    const job = await startJob(`${niche} em ${geo?.capital ? `${geo.capital} ${location}` : location}`, geo, limit);
    return send(res, 202, { id: job.id, status: job.status, cached: !!job.cached }, origin);
  }
  // Detalhes de UMA empresa (foto e avaliações reais), para o construtor de sites. Liga o Docker se preciso.
  if (req.method === 'POST' && url.pathname === '/place') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'JSON inválido.' }, origin);
    }
    const name = clean(body.name, 120);
    const address = clean(body.address, 200);
    if (name.length < 2) return send(res, 400, { error: 'Informe o nome da empresa.' }, origin);
    if (running) return send(res, 409, { error: 'Já existe uma coleta em andamento. Aguarde terminar.' }, origin);
    const job = startJob(`${name} ${address}`.trim(), null, 1, true);
    const j = await Promise.race([job, new Promise((r) => setTimeout(() => r(null), 1500))]);
    const id = j?.id ?? running?.id;
    return send(res, 202, { id, status: j?.status ?? 'running', cached: !!j?.cached }, origin);
  }
  const m = url.pathname.match(/^\/jobs\/([\w-]{36})$/);
  if (req.method === 'GET' && m) {
    const job = jobs.get(m[1]);
    if (!job) return send(res, 404, { error: 'Coleta não encontrada.' }, origin);
    const found = job.status === 'running' ? readResults(job.file).length : job.results?.length ?? 0;
    return send(res, 200, {
      id: job.id, status: job.status, query: job.query, found, requested: job.limit, exhausted: !!job.exhausted, elapsedMs: Date.now() - job.startedAt, cached: !!job.cached, engine: job.engine,
      error: job.error, results: job.status === 'done' ? job.results : undefined,
    }, origin);
  }
  send(res, 404, { error: 'Rota inexistente.' }, origin);
});

if (HOST !== '127.0.0.1' && !TOKEN) {
  console.error('Exposto fora do PC exige COLETOR_TOKEN. Abortando.');
  process.exit(1);
}
server.listen(PORT, HOST, () => {
  console.log(`Coletor do Google Maps em http://127.0.0.1:${PORT}`);
  console.log(`Origens permitidas: ${ORIGINS.join(', ')}`);
  dockerReady().then((ok) => console.log(ok && MODE !== 'rapido' ? `Docker ativo: modo completo (com fotos) via ${IMAGE}, com o rápido como reserva.` : 'Docker indisponível: usando o modo rápido (sem fotos).'));
  if (!existsSync(BIN)) console.log(`ATENÇÃO: binário não encontrado em ${BIN}`);
});
