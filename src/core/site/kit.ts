// Kit Premium Leve: regras do vault-sites destiladas em código determinístico (0 token por site).
// Fonte: vault-sites → Checklist de Acabamento, Anti AI-Slop, Sistema de Tokens. Mapa em "Kit Premium Leve" (vault Prospecta).

const norm = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;

export function luminance(hex: string): number {
  const [r, g, b] = norm(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores hex. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mistura `pct` (0–1) de `b` em `a`. */
export function mixHex(a: string, b: string, pct: number): string {
  const [x, y] = [norm(a), norm(b)];
  return toHex(x.map((c, i) => c + (y[i] - c) * pct));
}

/** Escurece/clareia `fg` (na direção oposta ao fundo) até atingir o contraste mínimo contra todos os fundos. */
export function ensureContrast(fg: string, bgs: string | string[], min = 4.5): string {
  const list = Array.isArray(bgs) ? bgs : [bgs];
  const ok = (c: string) => list.every((bg) => contrast(c, bg) >= min);
  if (ok(fg)) return fg;
  const target = list.reduce((s, b) => s + luminance(b), 0) / list.length > 0.4 ? '#000000' : '#ffffff';
  for (let p = 0.06; p <= 1; p += 0.06) {
    const c = mixHex(fg, target, p);
    if (ok(c)) return c;
  }
  return target;
}

/** Neutros levemente tingidos pela cor da marca (60-30-10 coeso: o acento "contamina" fundo e superfície). */
export function tintNeutrals(t: { bg: string; surface: string; line: string; dark: boolean }, accent: string) {
  return {
    bg: mixHex(t.bg, accent, t.dark ? 0.05 : 0.04),
    surface: mixHex(t.surface, accent, t.dark ? 0.06 : 0.035),
    line: mixHex(t.line, accent, 0.1),
  };
}

/** Largura/altura reais de um data URL JPEG ou PNG (lê só o cabeçalho); undefined se não reconhecer. */
export function imageSize(dataUrl: string | undefined): { w: number; h: number } | undefined {
  if (!dataUrl || !/^data:image\/(png|jpe?g);base64,/.test(dataUrl)) return undefined;
  // Só o começo do arquivo: o cabeçalho com a dimensão fica nos primeiros KB (JPEGs com miniatura EXIF grande cabem em 120 KB).
  const start = dataUrl.indexOf(',') + 1;
  const b64 = dataUrl.slice(start, start + 120_000);
  let bin: string;
  try {
    bin = atob(b64.slice(0, b64.length - (b64.length % 4)));
  } catch {
    return undefined;
  }
  const u = (i: number) => bin.charCodeAt(i);
  if (/^data:image\/png/.test(dataUrl)) return bin.length >= 24 ? { w: (u(16) << 24) | (u(17) << 16) | (u(18) << 8) | u(19), h: (u(20) << 24) | (u(21) << 16) | (u(22) << 8) | u(23) } : undefined;
  let i = 2;
  while (i + 9 < bin.length) {
    if (u(i) !== 0xff) return undefined;
    const marker = u(i + 1);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: (u(i + 5) << 8) | u(i + 6), w: (u(i + 7) << 8) | u(i + 8) };
    i += 2 + ((u(i + 2) << 8) | u(i + 3));
  }
  return undefined;
}

/** Evita palavra viúva: cola as duas últimas palavras com espaço não separável. */
export function noWidow(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return text;
  const last = words.pop()!;
  const prev = words.pop()!;
  return [...words, `${prev} ${last}`].join(' ');
}

/** CSS do kit: tokens de espaço, tipografia sem viúva e véu uniforme. Entra depois do CSS base. */
export const KIT_CSS = `
:root{--s1:8px;--s2:16px;--s3:24px;--s4:40px;--s5:64px;--sec:clamp(72px,10vw,136px);--hg:clamp(32px,5vw,56px);--cg:22px}
h1,h2,h3,h4,.display,.sh p,.lead{text-wrap:balance}
p,li,blockquote,figcaption{text-wrap:pretty}
.hero-bg::after{background:linear-gradient(0deg,rgba(0,0,0,.3),transparent 45%),rgba(6,6,6,.52)}
/* Ritmo: toda seção tem --sec em cima e embaixo; duas claras seguidas dividem UM --sec (nunca colado, nunca dobrado). */
section.s{padding:var(--sec) 0}
section.s:not(.dark)+section.s:not(.dark){padding-top:0}
.cta{padding:var(--sec) 0}
/* Chamada final com fundo próprio (bloco na cor da marca), sem repetir a foto (site leve). */
.cta{background:var(--ac);color:var(--aci)}
.cta h2{margin-bottom:var(--s4)}
.cta .btn-ac{background:var(--aci);color:var(--ac)}
.cta .btn-ac:hover{filter:none;transform:translateY(-2px)}
.sh{margin-bottom:var(--hg)}
.car-track{gap:var(--cg)}
.btn-ac,.btn-ln,.card-cta{min-height:44px}
/* Links de ação (cartões de serviço, "Como chegar") viram botões com fundo: ficam visíveis como clicáveis. */
.card-cta,.addr a:last-child{align-self:flex-start;justify-self:start;display:inline-flex;align-items:center;gap:8px;padding:0 18px;border-radius:999px;background:color-mix(in srgb,var(--ac) 11%,var(--sf));color:var(--act);text-decoration:none;font-weight:600;transition:background .25s,color .25s}
.card-cta{margin-top:auto}
.card-cta:hover,.addr a:last-child:hover{background:var(--ac);color:var(--aci)}
.dark .addr a:last-child{background:color-mix(in srgb,var(--ac) 22%,transparent);color:var(--bg)}
.dark .addr a:last-child:hover{background:var(--ac);color:var(--aci)}
.bcard-top{padding-right:76px}
/* Topo cabe na dobra (1366×640 a 1920×1080): título e respiros limitados pela ALTURA da tela, botão principal sempre visível. */
.hero h1{font-size:min(clamp(44px,6.4vw,92px),10.5svh)}
.hero-l{min-width:0}
@media(min-width:901px){
  .hero-editorial .hero-g{grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr)}
  .hero-editorial h1{font-size:min(clamp(38px,5.2vw,78px),10.5svh)}
  .hero-media{min-height:clamp(380px,64svh,640px)}
}
.hero{padding-top:clamp(92px,15svh,130px);padding-bottom:clamp(36px,6svh,70px)}
.hero .lead{margin:clamp(14px,3svh,28px) 0 clamp(18px,4svh,36px)}
.hero .trust{margin-top:clamp(18px,4svh,42px)}
.priv summary{min-height:44px;display:flex;align-items:center}

/* Ícones e botões modernos: WhatsApp preenchido, seta só mexe a própria seta, botão flutuante sem aro branco. */
.btn svg{flex:none}
.btn:hover svg{transform:none}.btn:hover svg:last-child:not(:first-child){transform:translateX(4px)}
.waf{background:linear-gradient(145deg,#34e07f,#1eb356);box-shadow:0 14px 30px -10px rgba(30,179,86,.65),0 2px 6px rgba(0,0,0,.25);border:0}
.waf svg{width:30px;height:30px;color:#fff}
.waf::after{border:0;box-shadow:0 0 0 0 rgba(37,211,102,.5);animation:wapulse 2.8s var(--ease) infinite}
@keyframes wapulse{70%{box-shadow:0 0 0 18px rgba(37,211,102,0)}100%{box-shadow:0 0 0 0 rgba(37,211,102,0)}}
/* Avaliações do Google: 3 colunas no desktop (selo, nota, texto) e pilha compacta no celular. */
.rev{grid-template-columns:auto auto 1fr;gap:clamp(16px,3vw,40px);padding:clamp(22px,3vw,40px)}
.rev .num{font-size:clamp(56px,7vw,96px)}
.rev .g-big{width:56px;height:56px}
.rev p{margin:8px 0 18px;font-size:clamp(15px,1.3vw,18px)}
@media(max-width:800px){.rev{grid-template-columns:auto 1fr;align-items:center}.rev>div:last-child{grid-column:1/-1}}
/* Chamada final com foto: película preta uniforme (contraste do texto) e botão na cor da marca. */
.cta{position:relative;overflow:hidden}
.cta .wrap{position:relative;z-index:1}
.cta-photo{background:#101010;color:#fff}
.cta-bg{position:absolute;inset:0}
.cta-bg img{width:100%;height:100%;object-fit:cover;filter:var(--imgf)}
.cta-bg::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.55)}
.cta-photo .btn-ac{background:var(--ac);color:var(--aci)}
.cta-photo .btn-ac:hover{filter:brightness(1.08)}
/* Equipe (só quando o site atual do cliente apresenta pessoas). */
.team{margin-top:var(--s4)}
.team h3{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu);margin:0 0 var(--s2);font-weight:600}
.team ul{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.team li{display:flex;gap:16px;align-items:flex-start;padding:18px;border:1px solid var(--ln);border-radius:calc(var(--r) + 2px);background:var(--sf)}
.team-av{flex:none;width:48px;height:48px;border-radius:50%;background:var(--ac);color:var(--aci);display:grid;place-items:center;font-family:var(--fd);font-size:18px}
.team p{margin:6px 0 0;color:var(--mu);font-size:15.5px}
/* Nada vaza da tela no celular (o selo do topo passava da borda e alargava a página). */
html,body{overflow-x:clip}.hero{overflow-x:clip}
@media(max-width:900px){.hero-r .bcard+.badge{right:12px;top:-34px}.hero-media .badge{right:12px}}
/* Serviços: no desktop, grade fechada (sem carrossel cortado no meio do cartão). */
@media(min-width:901px){
  .car:not(.car-rev) .car-track{display:grid!important;grid-auto-flow:row!important;grid-auto-columns:auto!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;overflow:visible!important;padding:0!important}
  .car:not(.car-rev) .car-track:has(>:nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .car:not(.car-rev) .car-track:has(>:nth-child(7)){grid-template-columns:repeat(4,minmax(0,1fr))!important}
  .car:not(.car-rev) .car-nav{display:none!important}
  .car:not(.car-rev) .card{height:100%}
}
/* Carrosséis (celular e avaliações): sangram até a borda da tela, sem cortar sombra nem cartão no meio do container. */
@media(max-width:900px){
  .car .car-track{margin-inline:-20px;padding:12px 20px 18px!important;scroll-padding-inline:20px}
}
.car-rev .car-track{padding:12px 0 18px;margin-top:-12px}
@media(min-width:901px){.car-rev .car-track{margin-right:calc(50% - 50vw);padding-right:calc(50vw - 50%)}}
/* ---- Upgrade premium leve (0 token, 0 imagem extra): direção de arte só com CSS ---- */
/* Destaque colorido no fim do título. */
.hl{font-style:normal;color:var(--act);background:linear-gradient(transparent 84%,color-mix(in srgb,var(--ac) 30%,transparent) 84%)}
.hero-photo .hl{color:color-mix(in srgb,var(--ac) 55%,#fff);background:none}
/* Topo sem foto: luz da marca nos cantos + grade de pontos (nunca um bloco chapado). */
.hero{isolation:isolate}
.hero:not(.hero-photo)::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(55% 55% at 88% 8%,color-mix(in srgb,var(--ac) 20%,transparent),transparent 70%),radial-gradient(40% 40% at 4% 98%,color-mix(in srgb,var(--ac) 11%,transparent),transparent 70%),radial-gradient(color-mix(in srgb,var(--ink) 13%,transparent) 1.2px,transparent 1.4px) 0 0/26px 26px;-webkit-mask-image:linear-gradient(180deg,#000 60%,transparent);mask-image:linear-gradient(180deg,#000 60%,transparent)}
/* Topo com foto: brilho da cor da marca no canto oposto ao texto (contraste do texto preservado). */
.hero-bg::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(60% 70% at 100% 0%,color-mix(in srgb,var(--ac) 38%,transparent),transparent 70%)}
/* Fundo desfocado: a MESMA foto da página (uma cópia só, via variável) em blur e baixa opacidade nas seções escuras. */
.bgp{position:relative;isolation:isolate;overflow:hidden}
.bgp::before{content:"";position:absolute;inset:-48px;z-index:-1;background:var(--pic) center/cover;filter:blur(24px) saturate(1.15);opacity:.17}
.bgp::after{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(60% 80% at 100% 0%,color-mix(in srgb,var(--ac) 20%,transparent),transparent 70%)}
#sobre{position:relative}
/* O que fazemos: editorial e assimétrico. 5 serviços = destaque largo; múltiplos de 3 = colunas escalonadas. */
@media(min-width:901px){
  .car:not(.car-rev) .car-track.stag>:nth-child(3n+2){margin-top:36px}
  .car:not(.car-rev) .card.feat{grid-column:span 2;flex-direction:row}
  .card.feat .card-img{flex:1 1 52%;aspect-ratio:auto;min-height:280px}
  .card.feat .card-b{flex:1 1 48%;justify-content:center;padding:34px}
  .card.feat h3{font-size:clamp(26px,2.5vw,34px)}
}
/* Como funciona: etapas em linha do tempo + exemplo real da conversa no WhatsApp. */
.how-g.has-chat{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:clamp(32px,6vw,90px);align-items:center}
.has-chat .steps{grid-template-columns:1fr;gap:var(--s4);padding:0 0 0 0}
.has-chat .steps::before{top:0;bottom:0;left:28px;right:auto;width:1px;height:auto}
.has-chat .steps .bar{left:27px;width:3px;height:calc(var(--p,0) * 100%)}
.has-chat .step{display:grid;grid-template-columns:58px 1fr;gap:2px 24px;align-items:start}
.has-chat .step-top{grid-row:span 2}.has-chat .step .k{display:none}
.has-chat .steps h3{margin:6px 0 0}
.wa-mock{background:color-mix(in srgb,var(--bg) 8%,var(--ink));border:1px solid color-mix(in srgb,var(--bg) 16%,transparent);border-radius:calc(var(--r) + 10px);padding:var(--s3);box-shadow:0 40px 80px -40px rgba(0,0,0,.6);display:grid;gap:var(--s2)}
.wa-top{display:flex;align-items:center;gap:12px;padding-bottom:var(--s2);border-bottom:1px solid color-mix(in srgb,var(--bg) 14%,transparent)}
.wa-top small{display:block;opacity:.65;font-size:13px}
.wa-av{width:44px;height:44px;border-radius:50%;background:var(--ac);color:var(--aci);display:grid;place-items:center;font-family:var(--fd);font-size:17px}
.wa-body{display:grid;gap:10px;padding:var(--s1) 0}
.wa-out{margin:0 0 0 auto;max-width:88%;background:#d9fdd3;color:#111;padding:12px 14px;border-radius:14px 14px 4px 14px;font-size:15.5px;line-height:1.45}
.wa-out time{display:block;text-align:right;font-size:11px;opacity:.55;margin-top:4px}
.wa-typing{margin:0;width:62px;background:color-mix(in srgb,var(--bg) 16%,var(--ink));padding:12px 14px;border-radius:14px 14px 14px 4px;display:flex;gap:5px}
.wa-typing i{width:7px;height:7px;border-radius:50%;background:var(--bg);opacity:.5;animation:wady 1.2s infinite}
.wa-typing i:nth-child(2){animation-delay:.2s}.wa-typing i:nth-child(3){animation-delay:.4s}
@keyframes wady{40%{transform:translateY(-4px);opacity:1}}
.wa-mock .btn{justify-content:center}
@media(max-width:900px){.how-g.has-chat{grid-template-columns:1fr}}
/* Mapa leve: cartão estático; o Google Maps só carrega depois do clique. */
.map{position:relative}
.map iframe{position:absolute;inset:0}
.map-ph{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:14px;text-align:center;padding:var(--s3);background:radial-gradient(60% 60% at 50% 45%,color-mix(in srgb,var(--ac) 22%,transparent),transparent 75%),repeating-linear-gradient(0deg,transparent 0 31px,color-mix(in srgb,var(--bg) 9%,transparent) 31px 32px),repeating-linear-gradient(90deg,transparent 0 31px,color-mix(in srgb,var(--bg) 9%,transparent) 31px 32px),color-mix(in srgb,var(--ink) 88%,var(--ac))}
.map-ph b{color:var(--bg);font-weight:600;max-width:28ch}
.map-pin{width:58px;height:58px;border-radius:50% 50% 50% 8px;transform:rotate(-45deg);background:var(--ac);color:var(--aci);display:grid;place-items:center;box-shadow:0 14px 30px -10px rgba(0,0,0,.6)}
.map-pin .ic{transform:rotate(45deg);width:26px;height:26px}
/* Chamada final com arte própria (sem foto): anéis da marca + grade de pontos. */
.cta:not(.cta-photo)::before{content:"";position:absolute;right:-8%;top:-55%;width:64vmin;height:64vmin;border-radius:50%;border:1px solid color-mix(in srgb,var(--aci) 24%,transparent);box-shadow:0 0 0 7vmin color-mix(in srgb,var(--aci) 6%,transparent),0 0 0 14vmin color-mix(in srgb,var(--aci) 4%,transparent);pointer-events:none}
.cta:not(.cta-photo)::after{content:"";position:absolute;left:0;top:0;bottom:0;width:42%;background:radial-gradient(color-mix(in srgb,var(--aci) 26%,transparent) 1.5px,transparent 1.7px) 0 0/22px 22px;-webkit-mask-image:linear-gradient(90deg,#000,transparent);mask-image:linear-gradient(90deg,#000,transparent);pointer-events:none}
.cta-photo .cta-bg::before{content:"";position:absolute;inset:0;z-index:1;background:radial-gradient(60% 90% at 50% 100%,color-mix(in srgb,var(--ac) 30%,transparent),transparent 70%)}
/* Microinterações leves (somem com prefers-reduced-motion). */
.card:hover .card-n{color:var(--act)}
.btn-ac{box-shadow:0 10px 24px -14px var(--ac)}
/* Celular: título do topo menor (3 linhas no máximo na maioria dos textos) e botões em largura cheia. */
@media(max-width:600px){
  .hero h1{font-size:clamp(30px,8.4vw,38px);line-height:1.08;letter-spacing:-.02em}
  .hero .lead{font-size:17px}
  .hero .acts .btn{flex:1 1 100%;justify-content:center}
}
.spec{margin:var(--s3) 0}
.spec h3{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu);margin:0 0 var(--s2);font-weight:600}
.spec ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.spec li{padding:8px 14px;border:1px solid var(--ln);border-radius:999px;background:var(--sf);font-size:15px}
.obj-q{margin:var(--s2) 0 0;padding:12px 14px;border-left:3px solid var(--ac);background:color-mix(in srgb,var(--ac) 7%,var(--sf));border-radius:0 10px 10px 0;font-size:15px;line-height:1.5;color:var(--ink)}
.obj-q cite{display:block;margin-top:6px;font-style:normal;font-size:13px;color:var(--mu)}
.price{align-self:flex-start;font-family:var(--fd);font-size:19px;color:var(--act);font-weight:600}
/* Uma palavra em cor nos títulos (h1 e h2). */
.dark .hl{color:color-mix(in srgb,var(--ac) 58%,#fff);background:none}
.cta .hl{color:inherit;background:linear-gradient(transparent 84%,color-mix(in srgb,var(--aci) 38%,transparent) 84%)}
.cta-photo .hl{color:color-mix(in srgb,var(--ac) 55%,#fff);background:none}
.sh h2 .hl,.about h2 .hl{background:none}
/* Botões com gradiente animado e limpo (leve, só CSS; desliga com prefers-reduced-motion). */
.btn-ac,.bcard-cta{background:linear-gradient(110deg,var(--ac) 0%,color-mix(in srgb,var(--ac) 80%,#fff) 50%,var(--ac) 100%);background-size:220% 100%;animation:kbtn 7s ease-in-out infinite}
.cta .btn-ac,.bcard-cta{background-image:linear-gradient(110deg,var(--aci) 0%,color-mix(in srgb,var(--aci) 82%,var(--ac)) 50%,var(--aci) 100%)}
.cta-photo .btn-ac{background-image:linear-gradient(110deg,var(--ac) 0%,color-mix(in srgb,var(--ac) 80%,#fff) 50%,var(--ac) 100%)}
.btn-ac:hover{animation-duration:2.2s;filter:none}
@keyframes kbtn{50%{background-position:100% 0}}
/* Faixa de prova (só dados reais) logo abaixo do topo. */
.proof{background:var(--sf);border-block:1px solid var(--ln)}
.proof ul{list-style:none;margin:0 auto;padding:var(--s3) 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--s2) var(--s3)}
.proof li{display:flex;align-items:center;gap:12px;font-size:15px;color:var(--mu);line-height:1.35}
.proof li>svg{flex:none;width:22px;height:22px;color:var(--act)}.proof .st{width:16px;height:16px;margin-right:-8px}
.proof b{color:var(--ink)}
/* Quebra de objeção. */
.obj-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--cg)}
.obj-c{padding:30px;border:1px solid var(--ln);border-radius:calc(var(--r) + 4px);background:var(--sf);box-shadow:var(--sh)}
.obj-c h3{font-family:var(--fd);font-weight:var(--dw,400);font-size:clamp(20px,1.8vw,24px);line-height:1.2;margin:16px 0 10px}
.obj-c p{margin:0;color:var(--mu)}
.obj-i{width:46px;height:46px;border-radius:12px;background:color-mix(in srgb,var(--ac) 14%,var(--sf));color:var(--act);display:grid;place-items:center}
.obj-i .ic{width:24px;height:24px}
@media(max-width:900px){.obj-g{grid-template-columns:1fr}}
/* Movimento guiado pelo scroll (sem JS; navegadores sem suporte mostram estático). */
@supports (animation-timeline:view()){
  @media(prefers-reduced-motion:no-preference){
    .hero-media img,.hero-bg img{animation:kpar linear both;animation-timeline:scroll(root);animation-range:0 100svh}
    @keyframes kpar{to{transform:translateY(7%) scale(1.05)}}
    .gal figure,.card-img{animation:kreveal linear both;animation-timeline:view();animation-range:entry 0% cover 28%}
    @keyframes kreveal{from{clip-path:inset(12% 6% 12% 6% round var(--r));opacity:.4}to{clip-path:inset(0 round var(--r));opacity:1}}
    .steps .step-ic{animation:kpop linear both;animation-timeline:view();animation-range:entry 10% entry 90%}
    @keyframes kpop{from{transform:scale(.6) rotate(-12deg)}to{transform:none}}
  }
}
`;

const CLICHES = [/solu[cç][aã]o inovadora/i, /experi[eê]ncia [uú]nica/i, /l[ií]der de mercado/i, /excel[eê]ncia em tudo/i, /qualidade incompar[aá]vel/i];

/** Avisos de acabamento (vindos do checklist do vault-sites) para exibir no construtor. */
export function qualityNotes(input: { headline: string; services: number; galleryCount: number; texts: string[]; accentAdjusted: boolean }): string[] {
  const out: string[] = [];
  if (input.headline.length > 60) out.push('Título longo (mais de 60 caracteres): no celular passa de 3 linhas. Encurte.');
  if (input.services < 3) out.push('Menos de 3 serviços: a seção fica rala. Adicione serviços reais do cliente.');
  if (input.galleryCount > 0 && input.galleryCount < 3) out.push('Galeria com menos de 3 fotos não é exibida (evita foto solta). Adicione mais fotos.');
  if (input.texts.some((t) => CLICHES.some((re) => re.test(t)))) out.push('Texto com frase genérica ("solução inovadora", "experiência única"…): troque por algo concreto do cliente.');
  if (input.accentAdjusted) out.push('A cor de destaque foi escurecida/clareada nos textos para manter a leitura (contraste mínimo 4,5:1).');
  return out;
}
