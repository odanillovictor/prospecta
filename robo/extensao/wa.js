// Roda dentro do WhatsApp Web do SEU Chrome (já logado). Recebe comandos do Prospecta (via serviço local) e age na página:
// abrir a conversa de um número, escrever (e, se liberado, enviar) uma mensagem, ler as últimas mensagens.
// Não lê conversas por conta própria: só a conversa pedida pelo app. Ritmo humano (pausas e digitação gradual).
(() => {
  if (window.__prospectaRobo) return;
  window.__prospectaRobo = true;

  const SEL = {
    list: '#pane-side, [data-testid="chat-list"]',
    qr: 'canvas[aria-label]',
    // Só a caixa de mensagem da conversa aberta (rodapé). NÃO usar [role=textbox] genérico: casa com o campo de busca.
    composer: 'footer div[contenteditable="true"], #main div[contenteditable="true"][data-tab="10"]',
    send: 'button[aria-label="Enviar"], button[aria-label="Send"], span[data-icon="send"], [data-testid="send"]',
    dialog: 'div[role="dialog"], div[data-animate-modal-popup="true"]',
  };
  const INVALIDO = /inv[aá]lido|n[aã]o est[aá] no WhatsApp|not on WhatsApp|invalid|compartilhad[oa] por url/i;
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
  const visible = (el) => !!el && el.getClientRects().length > 0;

  let busy = false;
  let resultado = null; // devolvido ao serviço no próximo tick

  const estado = () => ({
    conectado: visible($(SEL.list)),
    qr: visible($(SEL.qr)),
    titulo: document.title.replace(/^\(\d+\)\s*/, ''),
  });

  async function esperar(fn, ms, passo = 400) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      const v = fn();
      if (v) return v;
      await sleep(passo);
    }
    return null;
  }

  /** Espera a conversa abrir: caixa de mensagem visível (ok) ou aviso de número inválido. */
  async function conversaPronta() {
    const r = await esperar(() => {
      const d = [...document.querySelectorAll(SEL.dialog)].find((x) => INVALIDO.test(x.innerText || ''));
      if (d) return 'invalido';
      return visible($(SEL.composer)) ? 'ok' : null;
    }, 60_000);
    return r;
  }

  /** Apaga rascunho antigo da caixa (senão o texto novo seria somado ao velho). */
  async function limparCaixa(box) {
    box.focus();
    window.getSelection().selectAllChildren(box);
    document.execCommand('delete');
    await sleep(250);
    return (box.innerText || '').replace(/\s+/g, '') === '';
  }

  /** Escreve o texto na caixa. Colagem (preserva quebras de linha); se falhar, digita em uma linha só, palavra por palavra. */
  async function digitar(texto) {
    const box = $(SEL.composer);
    if (!(await limparCaixa(box))) return false;
    box.focus();
    const esperado = texto.replace(/\s+/g, ' ').trim();
    const confere = () => {
      const escrito = (box.innerText || '').replace(/\s+/g, ' ').trim();
      return escrito.length >= Math.min(esperado.length, 20) && escrito.includes(esperado.slice(0, 20)) && escrito.includes(esperado.slice(-20));
    };
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', texto);
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch {
      /* cai para a digitação */
    }
    await sleep(500);
    if (confere()) return true;
    if (!(await limparCaixa(box))) return false;
    for (const p of texto.replace(/\s*\n\s*/g, ' ').split(/(\s+)/).filter(Boolean)) {
      document.execCommand('insertText', false, p);
      await sleep(rand(25, 85));
    }
    await sleep(300);
    return confere();
  }

  // O WhatsApp Web atual não usa mais div.message-in/out: cada mensagem é um elemento [data-id] com
  // [data-pre-plain-text] ("[hh:mm, dd/mm/aaaa] Nome: "). Mensagem SAÍDA = tem ícone de status (relógio/✓/✓✓).
  const mensagens = () => [...document.querySelectorAll('#main [data-id]')].filter((e) => e.querySelector('[data-pre-plain-text]'));
  const ehSaida = (e) => !!e.querySelector('[data-icon^="msg-"]');

  function lerMensagens(max = 14) {
    return mensagens()
      .slice(-max)
      .map((e) => {
        const meta = e.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '';
        const texto = [...e.querySelectorAll('span.selectable-text')].map((s) => s.innerText).join(' ').replace(/\s+/g, ' ').trim();
        const m = meta.match(/\[(\d{1,2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
        const at = m ? new Date(Number(m[5]), Number(m[4]) - 1, Number(m[3]), Number(m[1]), Number(m[2])).toISOString() : null;
        return { dir: ehSaida(e) ? 'out' : 'in', text: texto, at };
      })
      .filter((x) => x.text);
  }

  const contarSaidas = () => mensagens().filter(ehSaida).length;

  async function enviar(cmd) {
    await sleep(rand(1500, 4000));
    if (!(await digitar(cmd.text))) return { ok: false, codigo: 'digitacao', erro: 'Não consegui escrever a mensagem na caixa do WhatsApp Web.' };
    if (cmd.dryRun) return { ok: true, enviado: false };
    await sleep(rand(800, 2200));
    const antes = contarSaidas();
    const botao = $(SEL.send);
    if (botao) (botao.closest('button') || botao).click();
    else $(SEL.composer).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    const ok = await esperar(() => contarSaidas() > antes, 10_000);
    return ok ? { ok: true, enviado: true } : { ok: false, codigo: 'sem_confirmacao', erro: 'Não consegui confirmar o envio na conversa.' };
  }

  /** Reduz uma imagem (blob da própria página) para um JPEG leve. */
  async function reduzir(url, max = 720) {
    const blob = await (await fetch(url)).blob();
    const bm = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bm.width * k);
    c.height = Math.round(bm.height * k);
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  /** Catálogo do WhatsApp Business do contato aberto: título, descrição, preço e foto de cada item (só o que o negócio publicou). */
  async function lerCatalogo() {
    const nome = (document.querySelector('[data-testid="conversation-info-header"]')?.innerText || '').split('\n')[0].trim();
    const botao = document.querySelector('header [aria-label="Catálogo"], header [aria-label="Catalog"]');
    if (!botao) return { ok: true, catalogo: { nome, itens: [] } };
    botao.click();
    const primeiro = await esperar(() => document.querySelector('[data-testid="product-catalog-item"]'), 15_000);
    if (!primeiro) return { ok: true, catalogo: { nome, itens: [] } };
    let rolavel = primeiro;
    while (rolavel && rolavel.scrollHeight <= rolavel.clientHeight + 4) rolavel = rolavel.parentElement;
    let antes = 0;
    for (let i = 0; i < 6; i++) {
      const n = document.querySelectorAll('[data-testid="product-catalog-item"]').length;
      if (n >= 20 || (i > 0 && n === antes)) break;
      antes = n;
      if (rolavel) rolavel.scrollTop = rolavel.scrollHeight;
      await sleep(900);
    }
    const itens = [];
    for (const [i, el] of [...document.querySelectorAll('[data-testid="product-catalog-item"]')].slice(0, 20).entries()) {
      const titulo = el.querySelector('[data-testid="cell-frame-title"]')?.innerText?.trim();
      if (!titulo) continue;
      const descricao = el.querySelector('[data-testid="cell-frame-secondary"]')?.innerText?.trim() || '';
      const preco = (el.innerText.match(/R\$\s?[\d.]+(?:,\d{2})?/) || [''])[0];
      let imagem = '';
      if (i < 6) {
        try {
          const bg = [...el.querySelectorAll('*')].map((x) => getComputedStyle(x).backgroundImage).find((b) => b && b.startsWith('url("blob:'));
          if (bg) imagem = await reduzir(bg.slice(5, -2));
        } catch { /* sem foto deste item */ }
      }
      itens.push({ titulo, descricao, preco, imagem });
    }
    return { ok: true, catalogo: { nome, itens } };
  }

  async function executarNaConversa(cmd) {
    const pronta = await conversaPronta();
    if (pronta === 'invalido') return { ok: false, codigo: 'numero_invalido', erro: 'Número sem WhatsApp (ou inválido).' };
    if (pronta !== 'ok') return { ok: false, codigo: 'tempo', erro: 'A conversa não abriu a tempo.' };
    if (cmd.tipo === 'conversa') {
      await sleep(rand(1200, 2500));
      return { ok: true, mensagens: lerMensagens(14) };
    }
    if (cmd.tipo === 'catalogo') return lerCatalogo();
    return enviar(cmd);
  }

  function diagnostico() {
    const n = (s) => document.querySelectorAll(s).length;
    return {
      url: location.pathname,
      titulo: document.title.replace(/^\(\d+\)\s*/, ''),
      listaDeConversas: n(SEL.list),
      qr: n(SEL.qr),
      caixaDeMensagem: n(SEL.composer),
      botaoEnviar: n(SEL.send),
      mensagensRecebidas: mensagens().filter((e) => !ehSaida(e)).length,
      mensagensEnviadas: mensagens().filter(ehSaida).length,
      textoSelecionavel: n('span.selectable-text'),
      avisos: n(SEL.dialog),
    };
  }

  /** Comando novo: guarda e abre a conversa (a página recarrega; o script retoma depois). */
  async function iniciar(cmd) {
    if (cmd.tipo === 'diagnostico') {
      resultado = { id: cmd.id, ok: true, diagnostico: diagnostico() };
      return;
    }
    if (cmd.tipo === 'instagram') {
      busy = true;
      try {
        const r = await chrome.runtime.sendMessage({ tipo: 'instagram', handle: cmd.handle });
        resultado = { id: cmd.id, ...(r ?? { ok: false, codigo: 'erro', erro: 'Sem resposta da extensão.' }) };
      } catch (e) {
        resultado = { id: cmd.id, ok: false, codigo: 'erro', erro: String(e?.message ?? e).slice(0, 160) };
      } finally {
        busy = false;
      }
      return;
    }
    busy = true;
    await chrome.storage.local.set({ pendente: { cmd, em: Date.now() } });
    location.href = `https://web.whatsapp.com/send?phone=${encodeURIComponent(cmd.phone)}`;
  }

  async function retomar() {
    const { pendente } = await chrome.storage.local.get('pendente');
    if (!pendente) return;
    await chrome.storage.local.remove('pendente');
    if (Date.now() - pendente.em > 120_000) {
      resultado = { id: pendente.cmd.id, ok: false, codigo: 'tempo', erro: 'O comando expirou antes de a página carregar.' };
      return;
    }
    busy = true;
    try {
      const r = await executarNaConversa(pendente.cmd);
      resultado = { id: pendente.cmd.id, ...r };
    } catch (e) {
      resultado = { id: pendente.cmd.id, ok: false, codigo: 'erro', erro: String(e?.message ?? e).slice(0, 200) };
    } finally {
      busy = false;
    }
  }

  function tick() {
    // Extensão recarregada/atualizada: este script ficou órfão. Recarrega a aba para religar sozinho (só se não houver comando em curso).
    if (!chrome.runtime?.id) {
      if (!busy) location.reload();
      return;
    }
    const enviando = resultado;
    try {
    chrome.runtime.sendMessage({ tipo: 'tick', body: { estado: estado(), resultado: enviando } }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) return;
      if (enviando && resultado === enviando) resultado = null;
      if (resp.comando && !busy) iniciar(resp.comando).catch(() => { busy = false; });
    });
    } catch {
      if (!busy) location.reload();
    }
  }

  // A batida de coração roda sempre (o app vê a extensão viva mesmo durante um comando); `busy` impede comandos paralelos.
  retomar();
  tick();
  setInterval(tick, 2500);
})();
