// Usar o Prospecta no celular pelo Wi-Fi de casa: sobe o app e o coletor do Maps abertos para a rede local,
// com token. No celular, abra o endereço que aparecer aqui. Só funciona com o PC ligado e na mesma rede.
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import qrcode from 'qrcode-terminal';
import QR from 'qrcode';

// ABRIR_PC=1 (usado por "Abrir Prospecta (PC).bat"): abre o app no Chrome do PC quando estiver pronto, sem a página do QR.
const PC = process.env.ABRIR_PC === '1';
const APP_PORT = 8788;
// Saída da compilação fora do Google Drive (o Drive trava a exclusão de pastas: EPERM/ENOTEMPTY).
const OUT = join(tmpdir(), 'prospecta-celular');
const COLETOR_PORT = 8790;

const privateIp = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const ips = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal && privateIp(n.address)).map((n) => n.address);
const IP = process.env.LAN_IP || ips.find((i) => i.startsWith('192.168.')) || ips[0];
if (!IP) {
  console.error('Não achei o endereço do PC na rede local. Conecte-se ao Wi-Fi ou informe LAN_IP=192.168.x.x');
  process.exit(1);
}

// Token da rede local: gerado uma vez e guardado (fica fora do git).
const TOKEN_FILE = '.celular-token';
if (!existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, randomBytes(6).toString('hex'));
const TOKEN = readFileSync(TOKEN_FILE, 'utf8').trim();

// App compilado em .celular e recompilado sozinho a cada mudança no código (modo "watch"): o celular só precisa recarregar a página.
// A política de segurança (_headers) libera só o coletor deste PC na rede local e é reaplicada depois de cada compilação.
const patchHeaders = () => {
  try {
    const h = readFileSync('public/_headers', 'utf8').replace(/connect-src 'self'/, `connect-src 'self' http://${IP}:${COLETOR_PORT}`);
    const hf = join(OUT, '_headers');
    if (!existsSync(hf) || readFileSync(hf, 'utf8') !== h) writeFileSync(hf, h);
  } catch { /* compilando */ }
};
try { rmSync(OUT, { recursive: true, force: true }); } catch { /* o vite esvazia a pasta ao compilar */ }
console.log('Compilando o app (primeira vez, leva alguns segundos)...');
execSync(`npx vite build --outDir "${OUT}" --emptyOutDir`, { stdio: PC ? 'ignore' : 'inherit' });
patchHeaders();
setInterval(patchHeaders, 1500);

const run = (cmd, args, env = {}, quiet = false) => {
  const p = spawn(cmd, args, { stdio: quiet && PC ? 'ignore' : 'inherit', shell: true, env: { ...process.env, ...env } });
  p.on('exit', (c) => { console.log(`[${args[0]}] encerrou (${c})`); });
  return p;
};

const coletor = run('node', ['coletor/server.mjs'], {
  COLETOR_HOST: '0.0.0.0',
  COLETOR_TOKEN: TOKEN,
  COLETOR_PUBLIC_HOST: `${IP}:${COLETOR_PORT}`,
  COLETOR_ORIGINS: `http://${IP}:${APP_PORT},http://localhost:${APP_PORT},http://127.0.0.1:${APP_PORT}`,
});
const watcher = run('npx', ['vite', 'build', '--watch', '--outDir', `"${OUT}"`, '--emptyOutDir=false'], {}, true);
const app = run('npx', ['wrangler', 'pages', 'dev', `"${OUT}"`, '--ip', '0.0.0.0', '--port', String(APP_PORT), '--compatibility-date=2024-09-23'], {}, true);

setTimeout(() => {
  if (PC) return; // no PC não precisa de QR nem de link: o app abre sozinho no Chrome
  const link = `http://${IP}:${APP_PORT}/#coletor=${TOKEN}`;
  if (!PC) try { spawn('clip', { shell: true }).stdin.end(link); } catch { /* sem área de transferência: usa o QR */ }
  console.log('\n==============================================================');
  console.log(' MAIS FÁCIL: aponte a CÂMERA do celular para o QR code abaixo');
  console.log(' (sem copiar nada). O link também foi copiado no PC (Ctrl+V).');
  console.log(' Ou digite no navegador do celular (mesmo Wi-Fi):');
  console.log(`   ${link}`);
  console.log(' Se o Windows perguntar, permita em "Redes privadas".');
  console.log(' Mudanças no código aparecem sozinhas: é só recarregar a página no celular.');
  console.log(' NÃO selecione texto nesta janela (pausa o programa).');
  console.log('==============================================================');
  qrcode.generate(link, { small: true });
  // Plano B visual: abre uma página no navegador do PC com o QR grande (alguns terminais não desenham o QR direito).
  if (!PC) QR.toDataURL(link, { width: 420, margin: 2 }).then((png) => {
    writeFileSync('.celular-qr.html', `<!doctype html><meta charset="utf-8"><title>Prospecta no celular</title><body style="font-family:system-ui;text-align:center;padding:30px"><h2>Aponte a câmera do celular para o QR code</h2><img src="${png}" width="420" height="420" alt="QR code"><p>Mesmo Wi-Fi do PC, sem VPN. Mantenha a janela preta aberta.</p></body>`);
    spawn('cmd', ['/c', 'start', '""', '.celular-qr.html'], { shell: true, stdio: 'ignore' });
  }).catch(() => {});
}, 6000);

// Modo PC: espera o app responder e abre no Chrome (se não achar o Chrome, usa o navegador padrão).
if (PC) {
  (async () => {
    const url = `http://localhost:${APP_PORT}/`;
    for (let i = 0; i < 90; i++) {
      try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* ainda subindo */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
    if (chrome) spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('cmd', ['/c', 'start', '""', url], { shell: true, stdio: 'ignore' });
    console.log(`
Prospecta aberto em ${url}`);
  })();
}

const stop = () => { coletor.kill(); app.kill(); watcher.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
