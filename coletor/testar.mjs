// Testa o modo completo do coletor via Docker e mostra se as fotos do Google Maps chegaram.
//   npm run coletor:testar                      (busca padrão: "dentista em Blumenau SC")
//   npm run coletor:testar -- "pet shop em Joinville SC"
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { dockerHardening } from './hardening.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const IMAGE = process.env.COLETOR_IMAGEM || 'gosom/google-maps-scraper:v1.18.0@sha256:09ba6c2c74ca5dd063c370fd17e2d3da91cc8b1c50172093bdb62268d5c57ddb';
const query = process.argv[2] || 'dentista em Blumenau SC';
const dir = join(ROOT, 'saida', 'teste-docker');

function sh(args, opts = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, ...opts });
}

const info = sh(['info', '--format', '{{.ServerVersion}}']);
if (info.status !== 0) {
  console.error('Docker não está rodando. Abra o Docker Desktop e espere "Engine running". (Instalação: coletor/instalar-docker.ps1)');
  process.exit(1);
}
console.log(`Docker ${info.stdout.trim()} OK.`);

console.log(`Baixando/atualizando a imagem ${IMAGE} (só demora na primeira vez)...`);
const pull = sh(['pull', IMAGE], { stdio: 'inherit' });
if (pull.status !== 0) process.exit(1);

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'queries.txt'), query + '\n', 'utf8');
console.log(`Coletando "${query}" no modo completo (pode levar 1–3 min)...`);
const t0 = Date.now();
const run = sh(['run', '--rm', ...dockerHardening(), '-v', 'gmaps-playwright-cache:/opt', '-v', `${dir}:/work`, IMAGE,
  '-input', '/work/queries.txt', '-results', '/work/out.json', '-json', '-depth', '1', '-lang', 'pt', '-c', '1', '-exit-on-inactivity', '60s'], { maxBuffer: 64 * 1024 * 1024 });
const secs = Math.round((Date.now() - t0) / 1000);

const file = join(dir, 'out.json');
let items = [];
if (existsSync(file)) {
  const text = readFileSync(file, 'utf8').trim();
  try {
    items = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
  } catch { /* saída incompleta */ }
}
const withPhotos = items.filter((i) => i.thumbnail || (Array.isArray(i.images) && i.images.length));
const blocked = /unexpected page type/i.test(`${run.stdout}${run.stderr}`);

console.log('\n================ RESULTADO ================');
console.log(`Tempo: ${secs} s · Empresas: ${items.length} · Com fotos: ${withPhotos.length}`);
if (withPhotos[0]) {
  const ex = withPhotos[0];
  console.log(`Exemplo: ${ex.title} — ${(ex.images?.length ?? 0)} foto(s); capa: ${String(ex.thumbnail || ex.images?.[0]?.image).slice(0, 90)}`);
  console.log('\nOK: o modo completo via Docker funciona. "npm run coletor" vai usá-lo automaticamente.');
} else if (blocked) {
  console.log('\nO Google bloqueou também via Docker ("unexpected page type"). O bloqueio é da conexão/IP, não do Windows.');
  console.log('O coletor continua funcionando no modo rápido (sem fotos). Alternativas: outra rede/servidor ou API oficial do Google.');
} else {
  console.log('\nNenhuma foto retornada. Veja o log acima; o coletor seguirá no modo rápido como reserva.');
}
