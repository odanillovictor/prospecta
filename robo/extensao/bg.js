// Ponte: o script da página do WhatsApp Web manda "tick" (estado + resultado) e recebe o próximo comando.
// Só fala com o serviço local; a página não consegue chamar 127.0.0.1 direto (CORS), por isso passa por aqui.
const SERVICO = 'http://127.0.0.1:8791';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.tipo !== 'tick') return false;
  fetch(`${SERVICO}/ext/tick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg.body ?? {}) })
    .then((r) => r.json())
    .then((j) => sendResponse({ ok: true, ...j }))
    .catch(() => sendResponse({ ok: false }));
  return true; // resposta assíncrona
});

// ---- Instagram (perfil público): abre o perfil numa aba em segundo plano, lê nome, bio, foto de perfil e posts, e fecha a aba.
// As imagens são baixadas aqui (a página do Instagram não pode mandar nada ao serviço local) e reduzidas antes de voltar.
function extrairPerfil() {
  const meta = (p) => document.querySelector('meta[property="' + p + '"]')?.content || '';
  const desc = meta('og:description') || document.querySelector('meta[name="description"]')?.content || '';
  const titulo = meta('og:title');
  const posts = [...document.querySelectorAll('a[href*="/p/"] img, a[href*="/reel/"] img')]
    .map((i) => ({ src: i.currentSrc || i.src, alt: (i.alt || '').slice(0, 300) }))
    .filter((p) => p.src && /^https:/.test(p.src))
    .slice(0, 9);
  return { titulo, desc, foto: meta('og:image'), posts };
}

async function esperarAba(tabId, ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) return false;
    if (t.status === 'complete') return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function paraBase64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function reduzir(url, max) {
  try {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const out = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    return 'data:image/jpeg;base64,' + paraBase64(await out.arrayBuffer());
  } catch {
    return null;
  }
}

async function lerInstagram(handle) {
  const h = String(handle || '').replace(/^@/, '').replace(/[^\w.]/g, '').slice(0, 40);
  if (!h) return { ok: false, codigo: 'handle', erro: 'Usuário do Instagram inválido.' };
  const tab = await chrome.tabs.create({ url: 'https://www.instagram.com/' + h + '/', active: false });
  try {
    await esperarAba(tab.id, 25000);
    await new Promise((r) => setTimeout(r, 3000));
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extrairPerfil });
    if (!result || (!result.foto && !result.posts.length)) return { ok: false, codigo: 'login', erro: 'O Instagram não mostrou o perfil (pediu login ou o usuário não existe). Entre na sua conta no Chrome e tente de novo.' };
    const bio = (result.desc.match(/:\s*[“"]([\s\S]*)[”"]\.?\s*$/) || [])[1] || '';
    const nome = (result.titulo.match(/^(.*?)\s*\(@/) || [])[1] || '';
    const foto = result.foto ? await reduzir(result.foto, 600) : null;
    const posts = [];
    for (const p of result.posts) {
      const img = await reduzir(p.src, 800);
      if (img) posts.push({ img, alt: p.alt });
    }
    return { ok: true, instagram: { handle: h, nome, bio: bio.slice(0, 600), foto, posts } };
  } catch (e) {
    return { ok: false, codigo: 'erro', erro: String(e?.message ?? e).slice(0, 160) };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.tipo !== 'instagram') return false;
  lerInstagram(msg.handle).then(sendResponse);
  return true;
});
