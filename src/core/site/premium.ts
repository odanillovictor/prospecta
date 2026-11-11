// Layout "Premium — Serviço Local": a estrutura do site da Gioconda (hero em arco, convite que acende, quem somos,
// serviços, passos em cartões com palco que troca, depoimentos do Google em faixa editorial, onde estamos, dúvidas,
// chamada final, barra de contato que muda por seção) para QUALQUER nicho. Determinístico, 0 token.
// Referência de design: vault-sites → 09_PAGE_PATTERNS/Estrutura Premium — Serviço Local (Gioconda).
import { WA_ICON, esc, initials, jsonLd, cleanSiteUrl, SITE_JS, type RenderOptions, type SiteModel } from './render';
import type { CustomBlock } from '../types';
import { icon, iconFor, type IconName } from './icons';
import { ensureContrast, mixHex } from './kit';
import type { SiteTheme } from './themes';

const GOOGLE_LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const GSTAR = '<svg viewBox="0 0 24 24" class="gst" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>';
const gstars = (n: number) => `<span class="gstars" role="img" aria-label="${n} de 5 estrelas">${GSTAR.repeat(Math.max(1, Math.min(5, Math.round(n))))}</span>`;

/** Palavra final (4+ letras) do título em destaque. */
function hl(text: string): string {
  const parts = text.trim().split(/\s+/);
  let at = -1;
  for (let i = parts.length - 1; i >= 0; i--) if (/^\p{L}{4,}[^\p{L}]*$/u.test(parts[i])) { at = i; break; }
  return parts.map((p, i) => {
    if (i !== at) return esc(p);
    const m = p.match(/^(\p{L}+)(.*)$/u)!;
    return `<em>${esc(m[1])}</em>${esc(m[2])}`;
  }).join(' ');
}

function palette(t: SiteTheme) {
  const dk = t.dark ? mixHex(t.bg, '#ffffff', 0.07) : mixHex(t.accent, '#000000', 0.62);
  const dki = t.dark ? t.ink : '#f6f1e8';
  return {
    dk,
    dki,
    pe: ensureContrast(mixHex(t.accent, '#ffffff', t.dark ? 0.1 : 0.5), dk),
    sand: mixHex(t.bg, t.accent, t.dark ? 0.08 : 0.13),
    ac2: mixHex(t.accent, '#ffffff', 0.16),
  };
}

/** Recorta uma avaliação longa no fim de uma frase (sem alterar o texto), marcando […]. */
function cutReview(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= 380) return t;
  const cut = t.slice(0, 360);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return `${t.slice(0, end > 120 ? end + 1 : 360).trim()} […]`;
}

const css = (m: SiteModel, p: ReturnType<typeof palette>): string => {
  const t = m.theme;
  return `
:root{--bg:${t.bg};--sf:${t.surface};--sand:${p.sand};--ink:${t.ink};--mu:${t.muted};--ln:${t.line};--ac:${t.accent};--ac2:${p.ac2};--act:${t.accentText ?? t.accent};--aci:${t.accentInk};--dk:${p.dk};--dki:${p.dki};--pe:${p.pe};
--s1:8px;--s2:16px;--s3:24px;--s4:40px;--s5:64px;--sec:clamp(72px,10vw,128px);--hg:clamp(32px,5vw,56px);--cg:24px;--r:${t.radius};--fd:${t.display};--fb:${t.body};--ease:cubic-bezier(.16,1,.3,1)}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.65 var(--fb);-webkit-font-smoothing:antialiased;overflow-x:clip}
img{max-width:100%;display:block}a{color:inherit}
h1,h2,h3{font-family:var(--fd);font-weight:${t.displayWeight};letter-spacing:${t.displayTracking};line-height:1.05;margin:0;text-wrap:balance}
p,li{text-wrap:pretty}
em{font-style:italic;color:var(--act)}.dark em{color:var(--pe)}
.wrap{width:min(1180px,100% - 40px);margin-inline:auto}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--mu);margin:0 0 var(--s3)}.eyebrow i{width:28px;height:1px;background:currentColor}
.dark .eyebrow{color:color-mix(in srgb,var(--dki) 70%,transparent)}
section{position:relative}.sec{padding:var(--sec) 0}.sec.light+.sec.light{padding-top:0}
.dark{background:var(--dk);color:var(--dki)}.alt{background:var(--sand)}
.sh{margin-bottom:var(--hg);max-width:760px}.sh h2{font-size:clamp(34px,4.6vw,60px)}.sh p{color:var(--mu);margin:var(--s2) 0 0;font-size:18px}.dark .sh p{color:color-mix(in srgb,var(--dki) 75%,transparent)}
.btn{--h:56px;display:inline-flex;align-items:center;gap:12px;height:var(--h);padding:0 28px;border-radius:999px;font:700 16px/1 var(--fb);text-decoration:none;border:1.5px solid transparent;cursor:pointer;white-space:nowrap;transition:transform .35s var(--ease),box-shadow .35s var(--ease),background .25s,border-color .25s}
.btn svg{width:20px;height:20px;flex:none}
.btn-ac{background:linear-gradient(110deg,var(--ac) 0%,var(--ac2) 50%,var(--ac) 100%);background-size:220% 100%;color:var(--aci);box-shadow:0 14px 30px -16px var(--ac);animation:sheen 8s ease-in-out infinite}.btn-ac:hover{transform:translateY(-2px)}
.btn-ln{border-color:color-mix(in srgb,var(--ink) 30%,transparent);color:var(--ink)}.btn-ln:hover{border-color:var(--ink)}
.btn-pe{background:linear-gradient(110deg,var(--pe),color-mix(in srgb,var(--pe) 80%,#fff),var(--pe));background-size:220% 100%;color:var(--dk);animation:sheen 8s ease-in-out infinite}.btn-pe:hover{transform:translateY(-2px)}
@keyframes sheen{50%{background-position:100% 0}}
.hd{position:fixed;inset:0 0 auto;z-index:50;background:color-mix(in srgb,var(--bg) 72%,transparent);backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);border-bottom:1px solid color-mix(in srgb,var(--ln) 50%,transparent);transition:background .3s,border-color .3s}.hd.sc{background:color-mix(in srgb,var(--bg) 90%,transparent)}
.hd .wrap{display:flex;align-items:center;gap:28px;height:78px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;min-width:0}.brand b{font:600 18px/1.1 var(--fd);white-space:nowrap}.brand small{display:block;font:500 12px var(--fb);color:var(--mu);letter-spacing:.04em}
.mono{width:44px;height:44px;border-radius:50% 50% 50% 8px;background:var(--ac);color:var(--aci);display:grid;place-items:center;font:600 20px var(--fd);flex:none;overflow:hidden}.mono img{width:100%;height:100%;object-fit:cover}
.nav{display:flex;gap:26px;margin-left:auto;font-size:15px;font-weight:500}.nav a{text-decoration:none;color:var(--mu)}.nav a:hover{color:var(--ink)}
.hd .btn{--h:46px;padding:0 20px;font-size:14.5px}
@media(max-width:980px){.nav{display:none}.hd .btn{margin-left:auto}}@media(max-width:900px){.hd .btn{display:none}}
.hero{min-height:100svh;display:flex;align-items:center;padding:calc(78px + clamp(24px,5svh,56px)) 0 clamp(40px,7svh,72px);overflow:hidden;isolation:isolate}
.hero-g{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,6vw,96px);align-items:center}
.hero h1{font-size:min(clamp(40px,5.8vw,84px),11svh)}.hero h1 em{position:relative;white-space:nowrap}
.hero h1 em svg{position:absolute;left:-2%;bottom:-.14em;width:104%;height:.3em;overflow:visible}
.hero h1 em path{fill:none;stroke:var(--pe);stroke-width:5;stroke-linecap:round;stroke-dasharray:420;stroke-dashoffset:420;transition:stroke-dashoffset 1.4s var(--ease) 1s}
.ready .hero h1 em path{stroke-dashoffset:0}
.lead{font-size:clamp(18px,1.5vw,21px);color:var(--mu);max-width:34em;margin:var(--s3) 0 var(--s4)}
.acts{display:flex;flex-wrap:wrap;gap:12px}
.facts{display:flex;flex-wrap:wrap;gap:10px 28px;list-style:none;margin:var(--s4) 0 0;padding:0;font-size:15px;color:var(--mu)}.facts li{display:flex;align-items:center;gap:10px}.facts svg{width:20px;height:20px;color:var(--act)}
.arches{position:relative;justify-self:center;width:min(100%,470px)}
.arch{position:relative;border-radius:999px 999px 28px 28px;overflow:hidden;background:var(--sand);box-shadow:0 40px 80px -40px color-mix(in srgb,var(--ac) 55%,#000)}.arch img{width:100%;height:100%;object-fit:cover}
.arch-main{aspect-ratio:3/4}.arch-sm{position:absolute;left:-18%;bottom:-6%;width:46%;aspect-ratio:3/4;border:6px solid var(--bg);box-shadow:0 30px 60px -30px color-mix(in srgb,var(--ac) 60%,#000)}
.arch.mono-arch{display:grid;place-items:center;background:linear-gradient(155deg,var(--ac),var(--dk));color:var(--aci)}.mono-arch span{font:italic 400 clamp(90px,14vw,180px)/1 var(--fd);opacity:.92}
.chip{position:absolute;right:-4%;top:12%;background:var(--sf);color:var(--ink);border-radius:16px;padding:12px 16px;box-shadow:0 20px 40px -24px rgba(0,0,0,.45);font-size:14px;line-height:1.35;max-width:190px}.chip b{display:block;font:600 15px var(--fd)}
.blob{position:absolute;z-index:-1;border-radius:50%;pointer-events:none}.hero .blob-a{width:520px;height:520px;right:-140px;top:-120px;background:radial-gradient(circle at 40% 40%,color-mix(in srgb,var(--pe) 45%,transparent),transparent 68%)}
.hero .blob-b{width:420px;height:420px;left:-160px;bottom:-140px;background:radial-gradient(circle,color-mix(in srgb,var(--ac) 22%,transparent),transparent 70%)}
.js .arch-main{clip-path:inset(46% 30% 0 30% round 999px 999px 0 0);transition:clip-path 1.5s var(--ease) .15s}
.js .arch-sm,.js .chip{opacity:0;transform:translateY(32px);transition:opacity 1s var(--ease) 1s,transform 1.1s var(--ease) 1s}
.js.ready .arch-main{clip-path:inset(0 0 0 0 round 999px 999px 28px 28px)}.js.ready .arch-sm,.js.ready .chip{opacity:1;transform:none}
.js .hero h1 .w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.1em;margin-bottom:-.1em}.js .hero h1 .w>span{display:inline-block;transform:translateY(105%);transition:transform 1s var(--ease)}.js.ready .hero h1 .w>span{transform:none}
@media(max-width:900px){.hero{min-height:auto}.hero-g{grid-template-columns:1fr}.arches{width:min(86%,420px);margin:var(--s3) auto var(--s4)}.arch-sm{left:-10%}.arches>.chip{right:-3%;top:auto;bottom:-5%;max-width:168px;font-size:13px;padding:10px 14px}.hero h1{font-size:clamp(34px,9.4vw,50px)}.hero .acts .btn{flex:1 1 100%;justify-content:center}}
.desc{overflow:hidden}.desc .bg{position:absolute;inset:0;background-position:center;background-size:cover;opacity:.14;filter:blur(8px) saturate(1.1)}
.desc-g{display:grid;grid-template-columns:1.25fr .75fr;gap:clamp(32px,6vw,88px);align-items:center;position:relative}.desc-g.solo{grid-template-columns:1fr;max-width:980px}
.reveal{font:350 clamp(28px,3.6vw,48px)/1.22 var(--fd);margin:0}.reveal .rw{opacity:var(--o,.42);transition:opacity .25s linear}
.plaque{border-radius:28px;overflow:hidden;box-shadow:0 40px 70px -40px rgba(0,0,0,.7);aspect-ratio:1/1}.plaque img{width:100%;height:100%;object-fit:cover}
@media(max-width:900px){.desc-g{grid-template-columns:1fr}}
.about{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(32px,6vw,88px);align-items:start}.about h2{font-size:clamp(36px,4.8vw,64px)}.about p{margin:var(--s3) 0 0;font-size:18px}
.portrait{position:relative;max-width:420px;justify-self:center;width:100%}.portrait .arch{aspect-ratio:4/5}
.chip2{position:absolute;left:-6%;bottom:6%;background:var(--sf);border-radius:16px;padding:12px 16px;box-shadow:0 20px 40px -24px rgba(0,0,0,.45);font-size:14px;line-height:1.35}.chip2 b{display:block;font:600 16px var(--fd)}
.cred{list-style:none;margin:var(--s3) 0 0;padding:0;display:grid;gap:12px;font-size:16px}.cred li{display:grid;grid-template-columns:24px 1fr;gap:12px;align-items:start;padding-bottom:12px;border-bottom:1px solid var(--ln)}.cred svg{width:22px;height:22px;color:var(--act);margin-top:3px}.cred small{color:var(--mu);font-size:15px}
.team{margin-top:var(--s3)}.team h3{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu);margin:0 0 var(--s2);font-family:var(--fb);font-weight:700}.team li{list-style:none;padding:12px 0;border-bottom:1px solid var(--ln)}.team ul{padding:0;margin:0}.team p{margin:4px 0 0;color:var(--mu);font-size:15.5px}
.vals{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--cg);margin-top:var(--s5)}
.val{background:var(--sf);border:1px solid var(--ln);border-radius:24px;padding:28px;transition:transform .45s var(--ease),box-shadow .45s var(--ease)}.val:hover{transform:translateY(-4px);box-shadow:0 28px 50px -34px color-mix(in srgb,var(--ac) 60%,#000)}
.val .ic{width:52px;height:52px;border-radius:50% 50% 50% 8px;background:color-mix(in srgb,var(--pe) 35%,var(--sf));color:var(--act);display:grid;place-items:center;margin-bottom:var(--s2)}.val .ic svg{width:26px;height:26px}
.val h3{font-size:22px;margin-bottom:8px}.val p{margin:0;color:var(--mu);font-size:16px}
@media(max-width:900px){.about,.vals{grid-template-columns:1fr}.portrait{max-width:340px}.chip2{left:0}}
.svc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--cg)}.svc.n2{grid-template-columns:repeat(2,minmax(0,1fr))}.svc.n4{grid-template-columns:repeat(4,minmax(0,1fr))}
.card{background:var(--sf);border:1px solid var(--ln);border-radius:26px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.05),0 18px 40px -28px rgba(0,0,0,.35);transition:transform .45s var(--ease),box-shadow .45s var(--ease)}.card:hover{transform:translateY(-4px)}
.card-img{aspect-ratio:4/3;overflow:hidden;background:color-mix(in srgb,var(--ac) 14%,var(--sf))}.card-img img{width:100%;height:100%;object-fit:cover;transition:transform 1.1s var(--ease)}.card:hover .card-img img{transform:scale(1.06)}
.card-ic{padding:26px 24px 0}.card-ic span{width:64px;height:64px;border-radius:50% 50% 50% 12px;background:color-mix(in srgb,var(--pe) 35%,var(--sf));color:var(--act);display:grid;place-items:center}.card-ic svg{width:30px;height:30px}
.card-b{padding:24px;display:flex;flex-direction:column;gap:10px;flex:1}.card-b h3{font-size:clamp(21px,1.9vw,25px)}.card-b p{margin:0;color:var(--mu);font-size:15.5px}.price{font:600 19px var(--fd);color:var(--act)}
.card-cta{margin-top:auto;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:999px;background:color-mix(in srgb,var(--ac) 11%,var(--sf));color:var(--act);text-decoration:none;font-weight:700;font-size:15px;transition:background .25s,color .25s}.card-cta:hover{background:var(--ac);color:var(--aci)}.card-cta svg{width:18px;height:18px}
@media(max-width:900px){.svc,.svc.n2,.svc.n4{grid-template-columns:1fr 1fr}}@media(max-width:600px){.svc,.svc.n2,.svc.n4{grid-template-columns:1fr}}
.flow{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,6vw,88px);align-items:center}.steps{display:grid;gap:16px}
.step{display:grid;grid-template-columns:52px 1fr;gap:20px;align-items:start;padding:24px 28px;border:1px solid var(--ln);border-radius:24px;background:var(--sf);cursor:pointer;transition:background .4s var(--ease),color .4s,border-color .4s,transform .4s var(--ease),box-shadow .4s}.step:hover{transform:translateY(-2px)}
.step .n{width:52px;height:52px;border-radius:50% 50% 50% 10px;background:color-mix(in srgb,var(--pe) 35%,var(--sf));color:var(--act);display:grid;place-items:center;font:italic 500 24px var(--fd)}.step .n svg{width:24px;height:24px}
.step h3{font-size:clamp(21px,2vw,26px);margin:2px 0 6px}.step p{margin:0;color:var(--mu);font-size:16px}
.step.on{background:var(--dk);border-color:var(--dk);color:var(--dki)}.step.on .n{background:var(--pe);color:var(--dk)}.step.on p{color:color-mix(in srgb,var(--dki) 82%,transparent)}.step .si{display:none}
.stage{position:relative;aspect-ratio:4/5;max-height:620px;justify-self:center;width:min(100%,480px);border-radius:999px 999px 28px 28px;overflow:hidden;background:var(--dk);box-shadow:0 40px 80px -40px color-mix(in srgb,var(--ac) 60%,#000)}
.stage>*{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.05);transition:opacity .9s var(--ease),transform 1.4s var(--ease)}.stage>.on{opacity:1;transform:none}
.panel{display:grid;place-content:center;justify-items:center;gap:16px;text-align:center;padding:40px;background:linear-gradient(160deg,var(--sand),color-mix(in srgb,var(--pe) 40%,var(--sand)));color:var(--ink)}.panel .ic{width:84px;height:84px;color:var(--act)}.panel b{font:600 clamp(24px,2.4vw,32px) var(--fd)}
.chat-mock{background:linear-gradient(160deg,var(--sand),color-mix(in srgb,var(--pe) 38%,var(--sand)));display:flex;flex-direction:column;justify-content:center;gap:var(--s2);padding:clamp(22px,3.4vw,44px);height:100%}
.cm-top{display:flex;align-items:center;gap:12px;background:var(--sf);border-radius:20px;padding:12px 16px;box-shadow:0 14px 30px -22px rgba(0,0,0,.5)}.cm-top b{display:block;font:600 17px var(--fd)}.cm-top small{color:var(--mu);font-size:13px}
.cm-av{width:44px;height:44px;border-radius:50% 50% 50% 8px;background:var(--ac);color:var(--aci);display:grid;place-items:center;font:600 18px var(--fd)}
.cm-body{display:grid;gap:10px;align-content:start;min-height:196px}.cm-out,.cm-in{margin:0;max-width:90%;padding:12px 14px 8px;font-size:clamp(15px,1.3vw,16.5px);line-height:1.45;box-shadow:0 10px 24px -18px rgba(0,0,0,.4)}
.cm-out{grid-area:1/1;margin-left:auto;background:#d9fdd3;color:#10302b;border-radius:18px 18px 4px 18px}.cm-in{grid-area:2/1;background:var(--sf);color:var(--ink);border-radius:18px 18px 18px 4px}
.cm-out time,.cm-in time{display:flex;align-items:center;justify-content:flex-end;gap:4px;font-size:11.5px;opacity:.6;margin-top:3px}.cm-ck{width:16px;height:11px;color:#34a8dc}
.cm-typing{grid-area:2/1;margin:0;width:62px;background:var(--sf);padding:13px 16px;border-radius:18px 18px 18px 4px;display:flex;gap:5px}.cm-typing i{width:7px;height:7px;border-radius:50%;background:var(--mu);opacity:.5;animation:cmdy 1.2s infinite}.cm-typing i:nth-child(2){animation-delay:.2s}.cm-typing i:nth-child(3){animation-delay:.4s}
@keyframes cmdy{40%{transform:translateY(-4px);opacity:1}}@keyframes cmcur{50%{opacity:0}}
.cm-input{display:flex;align-items:center;gap:10px;background:var(--sf);border-radius:999px;padding:6px 6px 6px 18px;min-height:52px;box-shadow:0 14px 30px -22px rgba(0,0,0,.5)}
.cm-txt{flex:1;min-width:0;font-size:15px;line-height:1.35;color:var(--ink);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.cm-txt::after{content:"";display:inline-block;width:1.5px;height:1.05em;background:var(--ac);margin-left:2px;vertical-align:-.12em;animation:cmcur 1s steps(1) infinite}
.cm-send{width:40px;height:40px;border-radius:50%;background:var(--ac);color:var(--aci);display:grid;place-items:center;flex:none;transition:transform .3s var(--ease)}.cm-send svg{width:20px;height:20px}
.cm-cta{--h:52px;justify-content:center;width:100%}.cm-cap{margin:0;text-align:center;font-size:13px;color:var(--mu)}
.js .cm-out,.js .cm-in,.js .cm-typing,.js .cm-cta{opacity:0;transform:translateY(10px);transition:opacity .45s var(--ease),transform .45s var(--ease)}.js .cm-cta{pointer-events:none}
.js [data-chat].s1 .cm-out,.js [data-chat].s3 .cm-in,.js [data-chat].s2 .cm-typing,.js [data-chat].s4 .cm-cta{opacity:1;transform:none}.js [data-chat].s4 .cm-cta{pointer-events:auto}.js [data-chat].s3 .cm-typing{display:none}.js [data-chat].s1 .cm-send{transform:scale(.86)}
@media(prefers-reduced-motion:reduce){.cm-txt::after{display:none}}
@media(max-width:900px){.flow{grid-template-columns:1fr}.stage{display:none}.step{grid-template-columns:44px 1fr;padding:20px}.step .si{display:block;grid-column:1/-1;margin-top:8px;aspect-ratio:4/3;border-radius:20px;overflow:hidden}.step .si img{width:100%;height:100%;object-fit:cover}.step .si:has(.chat-mock),.step .si:has(.panel){aspect-ratio:auto;overflow:visible}.step .si .chat-mock,.step .si .panel{height:auto;border-radius:20px;padding:20px}
.step,.step.on{background:var(--sf);color:var(--ink);border-color:var(--ln)}.step.on p,.step p{color:var(--mu)}.step.on .n{background:color-mix(in srgb,var(--pe) 35%,var(--sf));color:var(--act)}}
.dep{overflow:hidden;padding-bottom:calc(var(--sec) * .8)}
.gbadge{display:inline-flex;align-items:center;gap:12px;margin-top:var(--s3);padding:10px 20px 10px 10px;border-radius:999px;background:#fff;color:#202124;text-decoration:none;font-size:15px;box-shadow:0 14px 30px -20px rgba(0,0,0,.6)}.gbadge .g{width:34px;height:34px;display:grid;place-items:center}.gbadge .g svg{width:26px;height:26px}.gbadge b{font:700 20px var(--fb)}.gbadge .gstars{margin:0 2px}
.gstars{display:inline-flex;gap:1px;color:#fbbc04;vertical-align:middle}.gst{width:18px;height:18px}
.gcar{margin-top:calc(var(--hg) * -.2)}.gcar-t{display:flex;gap:var(--cg,24px);overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:8px 2px 28px;margin:0 -2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}.gcar-t::-webkit-scrollbar{display:none}
.gc{flex:0 0 min(400px,84%);scroll-snap-align:start;background:#fff;color:#202124;border-radius:18px;padding:22px 24px 24px;box-shadow:0 22px 44px -28px rgba(0,0,0,.75);font-family:Roboto,Arial,var(--fb);display:flex;flex-direction:column;gap:10px}
.gc-h{display:flex;align-items:center;gap:12px}.gc-av{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#fff;font:500 19px/1 Roboto,Arial,sans-serif;flex:none}.gc-n{flex:1;min-width:0;font:500 15.5px/1.25 Roboto,Arial,sans-serif}.gc-n small{display:block;color:#70757a;font-weight:400;font-size:13px;margin-top:2px}.gc-g{width:22px;height:22px;flex:none}.gc-g svg{width:100%;height:100%}
.gc p{margin:0;font:400 15.5px/1.6 Roboto,Arial,sans-serif;color:#3c4043}
.gcar-ui{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:4px}.gcar-b{all:unset;box-sizing:border-box;width:48px;height:48px;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--dki) 40%,transparent);color:var(--dki);display:grid;place-items:center;cursor:pointer;transition:background .25s,color .25s}.gcar-b svg{width:22px;height:22px}.gcar-b:hover{background:var(--dki);color:var(--dk)}
.gcar-dots{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.gcar-dots i{width:8px;height:8px;border-radius:99px;background:color-mix(in srgb,var(--dki) 35%,transparent);transition:width .35s var(--ease),background .25s}.gcar-dots i.on{width:26px;background:var(--pe)}
@media(prefers-reduced-motion:reduce){.gcar-t{scroll-behavior:auto}}
.fmt{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,6vw,88px);align-items:center}.fmt.solo .seg{display:none}
.seg{display:inline-flex;background:var(--sand);border-radius:999px;padding:5px;margin-bottom:var(--s4)}.seg button{all:unset;cursor:pointer;padding:12px 28px;border-radius:999px;font:700 15px var(--fb);color:var(--mu)}.seg button.on{background:var(--ac);color:var(--aci)}
.fp{display:none}.fp.on{display:block;animation:fpin .6s var(--ease)}@keyframes fpin{from{opacity:0;transform:translateY(12px)}}
.fp h3{font-size:clamp(28px,3vw,40px);margin-bottom:var(--s2)}.fp>p{margin:0 0 var(--s3);color:var(--mu);font-size:18px;max-width:30em}
.ticks{list-style:none;margin:0 0 var(--s3);padding:0;display:grid;gap:12px}.ticks li{display:flex;gap:12px;align-items:flex-start;font-size:16.5px}.ticks svg{width:22px;height:22px;flex:none;color:var(--act);margin-top:2px}
.bx-map{border-radius:24px;overflow:hidden;position:relative;border:1px solid var(--ln);min-height:230px;margin-top:var(--s2)}
.map{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:10px;text-align:center;padding:20px;background:radial-gradient(60% 60% at 50% 45%,color-mix(in srgb,var(--pe) 28%,transparent),transparent 75%),repeating-linear-gradient(0deg,transparent 0 31px,color-mix(in srgb,var(--ac) 9%,transparent) 31px 32px),repeating-linear-gradient(90deg,transparent 0 31px,color-mix(in srgb,var(--ac) 9%,transparent) 31px 32px),var(--sand)}
.map b{font:600 19px var(--fd);max-width:26ch}.map span{color:var(--mu);font-size:14.5px}.map iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.pin{width:50px;height:50px;border-radius:50% 50% 50% 8px;transform:rotate(-45deg);background:var(--ac);color:var(--aci);display:grid;place-items:center}.pin svg{width:24px;height:24px;transform:rotate(45deg)}
.fmt-r{position:relative;justify-self:center;width:min(100%,460px);aspect-ratio:4/5}.fs{position:absolute;inset:0;opacity:0;transform:scale(1.04);transition:opacity .7s var(--ease),transform 1.1s var(--ease);pointer-events:none}.fs.on{opacity:1;transform:none;pointer-events:auto}
.fs>img{width:100%;height:100%;object-fit:cover}.fs .chip{right:auto;left:16px;top:auto;bottom:16px;opacity:1;transform:none}
.vc{background:var(--dk)}.vc-main{position:absolute;inset:0}.vc-main img{width:100%;height:100%;object-fit:cover}.vc-main.mono-arch{display:grid;place-items:center}
.vc-name{position:absolute;left:18px;top:64px;background:rgba(0,0,0,.6);color:#fff;padding:6px 14px;border-radius:999px;font-size:14px;font-weight:700}
.vc-me{position:absolute;right:16px;bottom:96px;width:104px;height:132px;border-radius:18px;background:linear-gradient(160deg,var(--pe),var(--sand));border:3px solid var(--dk);display:grid;place-items:end start;padding:8px 10px;color:var(--dk);font-weight:700;font-size:13px}
.vc-bar{position:absolute;left:0;right:0;bottom:22px;display:flex;justify-content:center;gap:14px}.vc-b{width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.92);color:var(--dk);display:grid;place-items:center}.vc-b svg{width:22px;height:22px}.vc-b.end{background:#d4493a;color:#fff}
@media(max-width:900px){.fmt{grid-template-columns:1fr}.fmt-r{width:min(86%,380px)}}
.themes{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--cg)}
.faq{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(32px,6vw,88px);align-items:start}.faq .sh{position:sticky;top:110px;margin:0}
.faq details{border-bottom:1px solid var(--ln)}.faq summary{list-style:none;cursor:pointer;padding:24px 0;display:flex;justify-content:space-between;gap:20px;font:${t.displayWeight} clamp(20px,1.9vw,25px)/1.25 var(--fd)}.faq summary::-webkit-details-marker{display:none}
.faq summary i{width:22px;height:22px;flex:none;position:relative;margin-top:4px}.faq summary i::before,.faq summary i::after{content:"";position:absolute;inset:10px 0 auto;height:2px;background:var(--act);transition:transform .35s var(--ease)}.faq summary i::after{transform:rotate(90deg)}.faq details[open] summary i::after{transform:rotate(0)}
.faq .ans{display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s var(--ease)}.faq details[open] .ans{grid-template-rows:1fr}.faq .ans>div{overflow:hidden}.faq .ans p{margin:0 0 24px;color:var(--mu);max-width:36em}
@media(max-width:900px){.faq{grid-template-columns:1fr}.faq .sh{position:static}.themes{grid-template-columns:1fr}}
.cta{overflow:hidden;text-align:center}.cta .bg{position:absolute;inset:0;background-position:center;background-size:cover;opacity:.55}.cta .bg::after{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--dk) 78%,transparent)}.cta .wrap{position:relative}
.cta h2{font-size:clamp(38px,6vw,80px);max-width:13em;margin:0 auto var(--s4)}.cta p{max-width:34em;margin:0 auto var(--s4);color:color-mix(in srgb,var(--dki) 80%,transparent);font-size:19px}
.ft{background:var(--ink);color:color-mix(in srgb,var(--bg) 72%,transparent);padding:var(--s5) 0 var(--s4);font-size:15px}.ft-g{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:var(--s4)}.ft h4{margin:0 0 var(--s2);color:var(--bg);font:700 12px var(--fb);letter-spacing:.14em;text-transform:uppercase}
.ft a{text-decoration:none}.ft a:hover{color:var(--bg)}.ft .brand b{color:var(--bg)}.ft .brand small{color:color-mix(in srgb,var(--bg) 60%,transparent)}.ft p{margin:var(--s2) 0 0;max-width:34ch}.ft ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ft-bot{border-top:1px solid color-mix(in srgb,var(--bg) 14%,transparent);margin-top:var(--s5);padding-top:var(--s3);display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between;font-size:13px}@media(max-width:800px){.ft-g{grid-template-columns:1fr}}
.lnk{display:inline-flex;align-items:center;gap:8px;color:var(--act);font-weight:700;text-decoration:none;border-bottom:1.5px solid color-mix(in srgb,var(--act) 35%,transparent)}
.dock{position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:60;display:none;transform:translateY(140%);transition:transform .5s var(--ease)}.dock.on{transform:none}.dock .btn{width:100%;justify-content:center;height:56px}
@media(max-width:900px){.dock{display:block}.ft{padding-bottom:96px}}
.rv{opacity:1}.js .rv{opacity:0;transform:translateY(28px);transition:opacity .9s var(--ease),transform .9s var(--ease);transition-delay:calc(var(--d,0) * 90ms)}.js .rv.in{opacity:1;transform:none}
:focus-visible{outline:2px solid var(--act);outline-offset:3px}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.js .rv,.js .arch-sm,.js .chip{opacity:1;transform:none}.js .arch-main{clip-path:none}.js .hero h1 .w>span{transform:none}.hero h1 em path{stroke-dashoffset:0}.reveal .rw{opacity:1}}
`;
};

const CB_CSS = `
.cb-g{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,6vw,88px);align-items:center}
@media(max-width:900px){.cb-g{grid-template-columns:1fr}}
.cb-img{border-radius:28px;overflow:hidden;aspect-ratio:4/3}.cb-img img{width:100%;height:100%;object-fit:cover}
.cb-quote{font:italic 350 clamp(28px,3.6vw,54px)/1.22 var(--fd);max-width:16em;margin:0 auto;text-align:center}
.cb-quote::before{content:"“";font-size:1.4em;color:var(--act);line-height:0;vertical-align:-.25em;margin-right:4px}
`;

function renderCustomBlock(b: CustomBlock, images: { customBlocks?: Record<string, string> }): string {
  const imgSrc = images.customBlocks?.[b.id] ?? '';
  const textStyle = b.textColor ? ` style="color:${esc(b.textColor)}"` : '';

  if (b.type === 'texto') {
    const align = b.layout === 'left' ? 'left' : b.layout === 'right' ? 'right' : 'center';
    const mx = align === 'center' ? 'margin-left:auto;margin-right:auto;' : '';
    return `<section class="sec light" id="cb-${esc(b.id)}">
<div class="wrap" style="text-align:${align}"${textStyle}>
  ${b.eyebrow ? `<p class="eyebrow" style="justify-content:${align}"><i></i>${esc(b.eyebrow)}</p>` : ''}
  ${b.title ? `<h2 class="rv" style="max-width:14em;${mx}">${hl(b.title)}</h2>` : ''}
  ${b.body ? `<p class="rv" style="margin:var(--s3) 0 0;font-size:18px;max-width:36em;${mx}color:var(--mu)">${esc(b.body)}</p>` : ''}
  ${b.btnLabel ? `<div class="acts rv" style="margin-top:var(--s3);justify-content:${align}"><a class="btn btn-ac" href="#contato">${esc(b.btnLabel)}</a></div>` : ''}
</div>
</section>`;
  }

  if (b.type === 'destaque') {
    const bg = b.bgColor ? esc(b.bgColor) : 'var(--dk)';
    const color = b.textColor ? esc(b.textColor) : 'var(--dki)';
    return `<section class="sec" id="cb-${esc(b.id)}" style="background:${bg};color:${color}">
<div class="wrap" style="text-align:center;position:relative">
  ${b.eyebrow ? `<p class="eyebrow" style="color:inherit;opacity:.7;justify-content:center"><i></i>${esc(b.eyebrow)}</p>` : ''}
  ${b.title ? `<h2 class="rv" style="font-size:clamp(38px,6vw,80px);color:inherit;max-width:14em;margin:0 auto var(--s4)">${hl(b.title)}</h2>` : ''}
  ${b.body ? `<p class="rv" style="max-width:34em;margin:0 auto var(--s4);font-size:19px;opacity:.8">${esc(b.body)}</p>` : ''}
  ${b.btnLabel ? `<a class="btn btn-pe rv" href="#contato">${esc(b.btnLabel)}</a>` : ''}
</div>
</section>`;
  }

  if (b.type === 'imagem') {
    const isRight = b.layout === 'right';
    const textCol = `<div${textStyle}>
  ${b.eyebrow ? `<p class="eyebrow"><i></i>${esc(b.eyebrow)}</p>` : ''}
  ${b.title ? `<h2 class="rv">${hl(b.title)}</h2>` : ''}
  ${b.body ? `<p class="rv" style="margin:var(--s3) 0 0;font-size:18px;color:var(--mu)">${esc(b.body)}</p>` : ''}
  ${b.btnLabel ? `<div class="acts rv" style="margin-top:var(--s3)"><a class="btn btn-ac" href="#contato">${esc(b.btnLabel)}</a></div>` : ''}
</div>`;
    const imgCol = imgSrc ? `<div class="cb-img rv"><img src="${imgSrc}" alt="${b.title ? esc(b.title) : ''}" decoding="async"></div>` : '<div></div>';
    return `<section class="sec light" id="cb-${esc(b.id)}">
<div class="wrap cb-g">
  ${isRight ? `${imgCol}${textCol}` : `${textCol}${imgCol}`}
</div>
</section>`;
  }

  // separador (citação grande)
  const bgProp = b.bgColor ? ` style="background:${esc(b.bgColor)}"` : '';
  const cls = b.bgColor ? '' : ' alt';
  return `<section class="sec${cls}" id="cb-${esc(b.id)}"${bgProp}>
<div class="wrap" style="text-align:center"${textStyle}>
  ${b.title ? `<p class="cb-quote rv">${esc(b.title)}</p>` : ''}
  ${b.body ? `<p class="rv" style="margin:var(--s3) 0 0;font-size:16px;color:var(--mu)">${esc(b.body)}</p>` : ''}
</div>
</section>`;
}

export function renderPremium(m: SiteModel, opts: RenderOptions = {}): string {
  const img = {
    hero: opts.files ? opts.files.hero : m.images.hero,
    cta: opts.files ? opts.files.cta : m.images.cta,
    logo: opts.files ? opts.files.logo : m.images.logo,
    gallery: opts.files ? opts.files.gallery ?? [] : m.images.gallery,
    services: opts.files ? opts.files.services ?? [] : m.images.services,
    customBlocks: m.images.customBlocks,
  };
  const em = !!opts.editorMode;
  const base = cleanSiteUrl(opts.siteUrl);
  const absolute = (path?: string) => (path && base ? `${base}/${path.replace(/^\.?\//, '')}` : path);
  const ogImage = opts.ogImageUrl ?? absolute(opts.files?.og);
  const t = m.theme;
  const p = palette(t);
  const pics = [...new Set([img.hero, ...img.gallery, img.cta, ...img.services].filter((x): x is string => !!x))];
  const waBase = m.waE164 ? `https://wa.me/${m.waE164}?text=` : '';
  const wa = (msg: string) => (waBase ? `${waBase}${encodeURIComponent(msg)}` : '#contato');
  const waAttr = waBase ? ' target="_blank" rel="noopener"' : '';
  const first = m.name.split(/\s+/)[0];
  const mono = initials(m.name);
  const hasRating = m.rating != null && !!m.reviewCount;
  const monoArch = `<div class="arch mono-arch"><span>${esc(mono)}</span></div>`;
  const archImg = (src: string | undefined, alt: string, cls = '', extra = '') =>
    src ? `<div class="arch ${cls}">${`<img src="${src}" alt="${esc(alt)}" decoding="async">`}${extra}</div>` : monoArch;
  const cta = (label: string, msg: string, cls = 'btn-ac') => `<a class="btn ${cls}" href="${esc(wa(msg))}"${waAttr}>${waBase ? WA_ICON : ''}${esc(label)}</a>`;
  const sec = (label: string, msg: string) => `data-cta="${esc(label)}" data-msg="${esc(msg)}"`;

  const logoMark = img.logo ? `<span class="mono"><img src="${img.logo}" alt="Logo ${esc(m.name)}"></span>` : `<span class="mono">${esc(mono)}</span>`;
  const brand = (href: string) => `<a class="brand" href="${href}" aria-label="${esc(m.name)}">${logoMark}<span><b>${esc(m.name)}</b><small>${esc(m.segmentLabel)}${m.local !== 'sua região' ? ` · ${esc(m.local)}` : ''}</small></span></a>`;

  const nav: Array<[string, string]> = [['#sobre', 'Quem somos'], ['#servicos', 'Serviços'], ['#comofunciona', 'Como funciona'], ...(m.reviews.length ? [['#depoimentos', 'Depoimentos'] as [string, string]] : []), ['#duvidas', 'Dúvidas']];

  // 1 · topo
  const facts: string[] = [];
  if (hasRating) facts.push(`<li>${icon('star')}Nota ${m.rating!.toFixed(1).replace('.', ',')} no Google</li>`);
  if (waBase) facts.push(`<li>${icon('phone')}Atendimento pelo WhatsApp</li>`);
  if (m.local !== 'sua região') facts.push(`<li>${icon('pin')}${esc(m.local)}</li>`);
  const heroH1 = `${hl(m.headline).replace(/<em>(.*?)<\/em>/, '<em>$1<svg viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true"><path d="M3 15C40 4 78 22 118 11S196 6 237 14"/></svg></em>')}`;
  const heroPicsMain = pics[0];
  const hero = `<section class="hero light"${em ? ' data-section="hero" data-section-label="Topo"' : ''} ${sec(m.ctaPrimary, m.ctaMessage)}>
  <i class="blob blob-a" aria-hidden="true"></i><i class="blob blob-b" aria-hidden="true"></i>
  <div class="wrap hero-g">
    <div>
      <p class="eyebrow"><i></i>${esc(m.segmentLabel)}${m.local !== 'sua região' ? ` · ${esc(m.local)}` : ''}</p>
      <h1 data-split>${heroH1}</h1>
      <p class="lead">${esc(m.subheadline)}</p>
      <div class="acts">${cta(m.ctaPrimary, m.ctaMessage)}<a class="btn btn-ln" href="#servicos">Ver serviços</a></div>
      <ul class="facts">${facts.join('')}</ul>
    </div>
    <div class="arches">
      ${archImg(heroPicsMain, `${m.name}`, 'arch-main')}
      ${pics[1] ? `<div class="arch arch-sm" aria-hidden="true"><img src="${pics[1]}" alt="" decoding="async"></div>` : ''}
      <div class="chip"><b>${esc(m.name)}</b>${esc(m.segmentLabel)}${m.local !== 'sua região' ? `<br>${esc(m.local)}` : ''}</div>
    </div>
  </div>
</section>`;

  // 2 · convite (texto que acende)
  const inviteText = m.about.length > 300 ? `${m.about.slice(0, 297).replace(/\s+\S*$/, '')}…` : m.about;
  const invitePic = pics[2] ?? pics[1];
  const invite = `<section class="sec dark desc" id="convite"${em ? ' data-section="convite" data-section-label="Convite"' : ''} ${sec('Quero começar', `${m.ctaMessage}`)}>
  ${pics[3] ?? pics[0] ? `<div class="bg" aria-hidden="true" style="background-image:url(${pics[3] ?? pics[0]})"></div>` : ''}
  <div class="wrap desc-g${invitePic ? '' : ' solo'}">
    <div><p class="eyebrow"><i></i>O convite</p><p class="reveal">${esc(inviteText)}</p></div>
    ${invitePic ? `<figure class="rv" style="margin:0"><div class="plaque"><img src="${invitePic}" alt="${esc(m.name)}" decoding="async"></div></figure>` : ''}
  </div>
</section>`;

  // 3 · quem somos
  const cred: string[] = [];
  if (m.address || m.local !== 'sua região') cred.push(`<li>${icon('pin')}<span><b>Onde estamos</b><br><small>${esc(m.address || m.local)}</small></span></li>`);
  if (m.hours) cred.push(`<li>${icon('clock')}<span><b>Horário</b><br><small>${esc(m.hours)}</small></span></li>`);
  if (m.phoneDisplay) cred.push(`<li>${icon('phone')}<span><b>Contato</b><br><small>${esc(m.phoneDisplay)}</small></span></li>`);
  if (hasRating) cred.push(`<li>${icon('star')}<span><b>Avaliação no Google</b><br><small>${m.rating!.toFixed(1).replace('.', ',')} de 5 em ${m.reviewCount} avaliações</small></span></li>`);
  if (m.instagram) cred.push(`<li>${icon('instagram')}<span><b>Instagram</b><br><small><a class="lnk" href="https://www.instagram.com/${esc(m.instagram)}/" target="_blank" rel="noopener">@${esc(m.instagram)}</a></small></span></li>`);
  const aboutPic = pics[1] ?? pics[0];
  const vals = m.forWho.slice(0, 3);
  const about = `<section class="sec light" id="sobre"${em ? ' data-section="sobre" data-section-label="Quem somos"' : ''} ${sec('Falar agora', `${m.ctaMessage}`)}>
  <div class="wrap">
    <div class="about">
      <div class="portrait rv">${archImg(aboutPic, m.name)}<span class="chip2"><b>${esc(m.name)}</b>${esc(m.segmentLabel)}</span></div>
      <div>
        <p class="eyebrow rv"><i></i>Quem somos</p>
        <h2 class="rv" style="--d:1">${hl(`Conheça a ${m.name}`)}</h2>
        <p class="rv" style="--d:2">${esc(m.intro)}</p>
        <ul class="cred rv" style="--d:2">${cred.join('')}</ul>
        ${m.team.length ? `<div class="team rv"><h3>Quem atende você</h3><ul>${m.team.map((x) => `<li><b>${esc(x.name)}</b>${x.text ? `<p>${esc(x.text)}</p>` : ''}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div>
    ${vals.length ? `<div class="vals">${vals.map((v, i) => `<article class="val rv" style="--d:${i}"><span class="ic">${icon(['heart', 'shield', 'sparkles'][i] as IconName)}</span><h3>${['Para quem é', 'Sem surpresa', 'Do seu jeito'][i]}</h3><p>${esc(v)}</p></article>`).join('')}</div>` : ''}
  </div>
</section>`;

  // 4 · serviços
  const n = m.services.length;
  const svcImgs = img.services;
  const allSvcImgs = n > 0 && m.services.every((_, i) => !!svcImgs[i]);
  const services = `<section class="sec alt" id="servicos"${em ? ' data-section="servicos" data-section-label="Serviços"' : ''} ${sec('Pedir orçamento', `${m.ctaMessage}`)}>
  <div class="wrap">
    <div class="sh"><p class="eyebrow"><i></i>Serviços</p><h2>${hl('O que fazemos')}</h2><p>${esc(m.servicesLead)}</p></div>
    <div class="svc ${n === 2 ? 'n2' : n >= 7 ? 'n4' : ''}">${m.services.map((s, i) => `<article class="card rv" style="--d:${i % 3}">
      ${allSvcImgs ? `<div class="card-img"><img src="${svcImgs[i]}" alt="${esc(s.title)} — ${esc(m.name)}" decoding="async"></div>` : `<div class="card-ic"><span>${icon(iconFor(`${s.title} ${m.segmentLabel}`))}</span></div>`}
      <div class="card-b"><h3>${esc(s.title)}</h3>${s.price ? `<span class="price">${esc(s.price)}</span>` : ''}${s.text ? `<p>${esc(s.text)}</p>` : ''}<a class="card-cta" href="${esc(wa(`Olá! Vim pelo site e tenho interesse em: ${s.title}.`))}"${waAttr}>${waBase ? 'Solicitar orçamento' : 'Fale com a gente'}${icon('arrow')}</a></div>
    </article>`).join('')}</div>
  </div>
</section>`;

  // 5 · como funciona (cartões + palco que troca)
  const TICK = '<svg class="cm-ck" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 6.5l3.2 3.2L10.5 2M7.5 9.7l.6.6L16 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const chat = (on: boolean) => `<div class="chat-mock${on ? ' on' : ''}" data-chat><div class="cm-top"><span class="cm-av">${esc(mono.slice(0, 1))}</span><span><b>${esc(m.name)}</b><small>WhatsApp${m.phoneDisplay ? ` · ${esc(m.phoneDisplay)}` : ''}</small></span></div><div class="cm-body"><p class="cm-out">${esc(m.ctaMessage)}<time>agora ${TICK}</time></p><p class="cm-typing" aria-hidden="true"><i></i><i></i><i></i></p><p class="cm-in">Oi! Que bom que você escreveu. Me conta um pouco do que você procura?<time>agora</time></p></div><div class="cm-input"><span class="cm-txt" data-full="${esc(m.ctaMessage)}"></span><i class="cm-send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20l18-8L3 4v6l11 2-11 2z" fill="currentColor"/></svg></i></div><a class="btn btn-ac cm-cta" href="${esc(wa(m.ctaMessage))}"${waAttr}>${waBase ? WA_ICON : ''}Mandar sua mensagem agora</a><p class="cm-cap">Exemplo ilustrativo de conversa</p></div>`;
  const panel = (s: { title: string; icon?: string }, on: boolean) => `<div class="panel${on ? ' on' : ''}">${icon((s.icon && s.icon !== 'wa' ? s.icon : iconFor(s.title)) as IconName)}<b>${esc(s.title)}</b></div>`;
  const steps = m.steps.slice(0, 4);
  const stageItem = (s: (typeof steps)[number], i: number) => {
    if (i === 0 && waBase) return chat(true);
    const pic = pics[(i + 1) % Math.max(1, pics.length)];
    return pics.length && i > 0 ? `<img src="${pic}" alt="" decoding="async">` : panel(s, i === 0);
  };
  const how = `<section class="sec light" id="comofunciona"${em ? ' data-section="comofunciona" data-section-label="Como funciona"' : ''} ${sec('Saber como funciona', `${m.ctaMessage}`)}>
  <div class="wrap">
    <div class="sh"><p class="eyebrow"><i></i>Passo a passo</p><h2>${hl('Como funciona')}</h2><p>Do primeiro contato ao atendimento, no seu ritmo. Toque em cada passo para ver como acontece.</p></div>
    <div class="flow">
      <div class="steps" role="tablist" aria-label="Passos">${steps.map((s, i) => `<article class="step${i === 0 ? ' on' : ''}" data-i="${i}" role="tab" tabindex="0"><span class="n">${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div><div class="si">${i === 0 && waBase ? chat(false) : pics.length && i > 0 ? `<img src="${pics[(i + 1) % pics.length]}" alt="" decoding="async">` : panel(s, false)}</div></article>`).join('')}</div>
      <div class="stage" aria-hidden="true">${steps.map(stageItem).map((h, i) => (i === 0 && !h.includes(' on') ? h.replace(/^<(\w+)/, '<$1 class="on"').replace('class="on" class="', 'class="on ') : h)).join('')}</div>
    </div>
  </div>
</section>`;

  // 6 · depoimentos do Google (faixa editorial, sem estrelas)
  const AV = ['#1a73e8', '#d93025', '#188038', '#e37400', '#9334e6', '#c2185b', '#00796b', '#5f6368'];
  // Melhores avaliações primeiro (5 estrelas, depois as de texto mais completo); nunca altera o texto do cliente.
  const rv = [...m.reviews].sort((a, b) => b.rating - a.rating || b.text.length - a.text.length).slice(0, 8);
  const gc = rv.map((r, i) => `<article class="gc"><div class="gc-h"><span class="gc-av" style="background:${AV[i % AV.length]}">${esc(r.author.trim().charAt(0).toUpperCase())}</span><span class="gc-n">${esc(r.author)}<small>${r.when ? esc(r.when) : 'Avaliação no Google'}</small></span><span class="gc-g">${GOOGLE_LOGO}</span></div>${gstars(r.rating)}<p>${esc(cutReview(r.text))}</p></article>`).join('');
  const ARR_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ARR_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const depo = rv.length
    ? `<section class="sec dark dep" id="depoimentos"${em ? ' data-section="depoimentos" data-section-label="Depoimentos"' : ''} ${sec(m.ctaPrimary, m.ctaMessage)}>
  <div class="wrap"><div class="sh"><p class="eyebrow"><i></i>Depoimentos</p><h2>${hl('O que dizem os clientes')}</h2>
    <a class="gbadge" href="${esc(m.mapsLink)}" target="_blank" rel="noopener"><span class="g">${GOOGLE_LOGO}</span><span>${hasRating ? `<b>${m.rating!.toFixed(1).replace('.', ',')}</b> ${gstars(m.rating!)} · ${m.reviewCount} avaliações no Google` : 'Avaliações no Google'}</span></a></div></div>
  <div class="wrap"><div class="gcar" data-gcar><div class="gcar-t" tabindex="0" aria-label="Avaliações de clientes publicadas no Google">${gc}</div><div class="gcar-ui"><button class="gcar-b" type="button" data-d="-1" aria-label="Avaliação anterior">${ARR_L}</button><div class="gcar-dots" aria-hidden="true"></div><button class="gcar-b" type="button" data-d="1" aria-label="Próxima avaliação">${ARR_R}</button></div></div></div>
</section>`
    : '';

  // 7 · onde estamos (presencial / online quando faz sentido)
  const placePic = pics[2] ?? pics[0];
  const placeBtn = m.mapEmbed
    ? `<div class="bx-map" data-map="${esc(m.mapEmbed)}"><div class="map"><span class="pin">${icon('pin')}</span><b>${esc(m.address || m.local)}</b><span>${esc(m.hours ?? 'Veja como chegar')}</span><button class="btn btn-ac" type="button" data-map-btn style="--h:48px">Ver mapa aqui</button></div></div>`
    : '';
  const placeTicks = [`<li>${icon('pin')}${esc(m.address || m.local)}</li>`, m.hours ? `<li>${icon('clock')}${esc(m.hours)}</li>` : `<li>${icon('calendar')}Horário combinado pelo WhatsApp</li>`].join('');
  const place = `<section class="sec light" id="onde"${em ? ' data-section="onde" data-section-label="Onde estamos"' : ''} ${sec('Ver horários', `Olá! Gostaria de saber sobre horários e como chegar.`)}>
  <div class="wrap">
    <div class="sh"><p class="eyebrow"><i></i>Onde estamos</p><h2>${m.online ? hl('Presencial ou online') : hl('Venha nos visitar')}</h2><p>${m.online ? 'Escolha o formato que cabe na sua rotina.' : `Atendimento em ${esc(m.local)}.`}</p></div>
    <div class="fmt${m.online ? '' : ' solo'}" data-fmt>
      <div class="fmt-l">
        ${m.online ? '<div class="seg" role="tablist" aria-label="Formato"><button class="on" role="tab" data-f="0" aria-selected="true">Presencial</button><button role="tab" data-f="1" aria-selected="false">Online</button></div>' : ''}
        <div class="fp on" data-f="0"><h3>${hl(`Atendimento em ${m.neighborhood || m.city || m.local}`)}</h3><p>${esc(m.segmentLabel)} com atendimento próximo e hora combinada pelo WhatsApp.</p><ul class="ticks">${placeTicks}</ul>${placeBtn}</div>
        ${m.online ? `<div class="fp" data-f="1"><h3>${hl('De onde você estiver')}</h3><p>Atendimento por vídeo, com o mesmo cuidado e o mesmo sigilo do presencial.</p><ul class="ticks"><li>${icon('phone')}Sessão por vídeo, no horário combinado</li><li>${icon('shield')}Cuidado e sigilo profissional</li><li>${icon('calendar')}Combinamos tudo pelo WhatsApp</li></ul>${cta('Saber do atendimento online', 'Olá! Gostaria de saber sobre o atendimento online.')}</div>` : ''}
      </div>
      <div class="fmt-r">
        <div class="fs on" data-f="0">${archImg(placePic, m.name)}</div>
        ${m.online ? `<div class="arch fs vc" data-f="1"><div class="vc-main${placePic ? '' : ' mono-arch'}">${placePic ? `<img src="${placePic}" alt="" decoding="async">` : `<span>${esc(mono)}</span>`}<span class="vc-name">${esc(first)}</span></div><div class="vc-me"><span>Você</span></div><div class="vc-bar"><i class="vc-b">${icon('phone')}</i><i class="vc-b">${icon('camera')}</i><i class="vc-b end">${icon('close')}</i></div></div>` : ''}
      </div>
    </div>
  </div>
</section>`;

  // 8 · dúvidas (objeções + FAQ)
  const objs = `<section class="sec alt" id="objecoes"${em ? ' data-section="objecoes" data-section-label="Objeções"' : ''} ${sec('Tirar uma dúvida', `Olá! Tenho uma dúvida.`)}>
  <div class="wrap"><div class="sh"><p class="eyebrow"><i></i>Antes de decidir</p><h2>${hl('Dúvidas que travam a decisão')}</h2><p>Respostas diretas para o que costuma segurar quem ainda está decidindo.</p></div>
    <div class="vals">${m.objections.map((o, i) => `<article class="val rv" style="--d:${i}"><span class="ic">${icon('shield')}</span><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p></article>`).join('')}</div></div>
</section>`;
  const faq = `<section class="sec light" id="duvidas"${em ? ' data-section="duvidas" data-section-label="FAQ"' : ''} ${sec('Tirar uma dúvida', 'Olá! Tenho uma dúvida.')}>
  <div class="wrap faq">
    <div class="sh"><p class="eyebrow"><i></i>Dúvidas</p><h2>${hl('Perguntas frequentes')}</h2><p>Não encontrou a sua? Pergunte pelo WhatsApp, sem compromisso.</p><div class="acts" style="margin-top:24px">${cta('Tirar uma dúvida', 'Olá! Tenho uma dúvida.')}</div></div>
    <div>${m.faq.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}<i></i></summary><div class="ans"><div><p>${esc(f.a)}</p></div></div></details>`).join('')}</div>
  </div>
</section>`;

  // 9 · chamada final
  const ctaPic = img.cta ?? pics[1] ?? pics[0];
  const final = `<section class="sec cta dark" id="contato"${em ? ' data-section="contato" data-section-label="Contato final"' : ''} ${sec(m.ctaPrimary, m.ctaMessage)}>
  ${ctaPic ? `<div class="bg" aria-hidden="true" style="background-image:url(${ctaPic})"></div>` : ''}
  <div class="wrap"><p class="eyebrow" style="color:color-mix(in srgb,var(--dki) 70%,transparent)"><i></i>O primeiro passo</p><h2>${hl(m.closing)}</h2><p>Conte, em poucas palavras, o que você procura. A conversa começa por aí.</p>${cta(m.ctaPrimary, m.ctaMessage, 'btn-pe')}</div>
</section>`;

  const footer = `<footer class="ft"><div class="wrap">
  <div class="ft-g">
    <div>${brand('#topo')}<p>${esc(m.about.length > 170 ? `${m.about.slice(0, 167).replace(/\s+\S*$/, '')}…` : m.about)}</p></div>
    <div><h4>Contato</h4><ul>${waBase ? `<li><a href="https://wa.me/${m.waE164}" target="_blank" rel="noopener">WhatsApp${m.phoneDisplay ? ` ${esc(m.phoneDisplay)}` : ''}</a></li>` : ''}${m.email ? `<li><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></li>` : ''}${m.instagram ? `<li><a href="https://www.instagram.com/${esc(m.instagram)}/" target="_blank" rel="noopener">Instagram @${esc(m.instagram)}</a></li>` : ''}<li>${esc(m.address || m.local)}</li></ul></div>
    <div><h4>Navegar</h4><ul>${nav.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>
  </div>
  <div class="ft-bot"><span>© ${new Date().getFullYear()} ${esc(m.name)}</span>${m.images.credits.length ? `<span>Fotos: ${esc(m.images.credits.join(' · '))}</span>` : ''}${opts.creditName ? `<span>Site por ${esc(opts.creditName)}</span>` : ''}</div>
</div></footer>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(m.seoTitle)}</title>
<meta name="description" content="${esc(m.seoDescription)}">
<meta name="theme-color" content="${esc(t.bg)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(m.seoTitle)}"><meta property="og:description" content="${esc(m.seoDescription)}"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="${esc(m.name)}">
<meta name="robots" content="${opts.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">
${base ? `<link rel="canonical" href="${esc(base)}/"><meta property="og:url" content="${esc(base)}/">` : ''}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(m.name)} — ${esc(m.segmentLabel)}">` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(m.seoTitle)}"><meta name="twitter:description" content="${esc(m.seoDescription)}">${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : ''}
${opts.files?.favicon ? `<link rel="icon" type="image/png" href="${esc(opts.files.favicon)}"><link rel="apple-touch-icon" href="${esc(opts.files.favicon)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(t.fontsHref)}">
<script type="application/ld+json">${jsonLd(m, base, ogImage)}</script>
<style>${css(m, p)}${CB_CSS}</style>
</head>
<body data-wa="${esc(waBase)}">
${m.isDemo ? '<div style="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99;background:#2b2440;color:#fff;font-size:12px;padding:6px 12px;border-radius:999px">Demonstração — dados fictícios</div>' : ''}
<header class="hd"><div class="wrap">${brand('#topo')}<nav class="nav" aria-label="Seções">${nav.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav><a class="btn btn-ac" data-cta-live href="${esc(wa(m.ctaMessage))}"${waAttr}>${waBase ? WA_ICON : ''}<span class="t">${esc(m.ctaPrimary)}</span></a><button class="mbtn" data-menu aria-expanded="false" aria-label="Abrir menu"><svg class="i-open" width="20" height="20" viewBox="0 0 20 20" fill="none"><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M3 5h14M3 10h14M3 15h14"/></svg><svg class="i-close" width="20" height="20" viewBox="0 0 20 20" fill="none"><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M4 4l12 12M16 4L4 16"/></svg></button></div></header>
<div class="mnav" id="mnav" hidden><nav>${nav.map(([h, l]) => `<a href="${h}">${esc(l)}<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path stroke="currentColor" stroke-width="1.5" d="M6 3l5 5-5 5"/></svg></a>`).join('')}</nav><div class="mnav-ft"><a class="btn btn-ac" href="${esc(wa(m.ctaMessage))}"${waAttr}>${waBase ? WA_ICON : ''}<span class="t">${esc(m.ctaPrimary)}</span></a></div></div>
<main id="topo">
${hero}
${(() => { const sm: Record<string,string> = {convite:invite,sobre:about,servicos:services,comofunciona:how,depoimentos:depo,onde:place,objecoes:objs,duvidas:faq}; return m.sectionOrder.map(id => m.hiddenSections.includes(id) ? '' : (sm[id] ?? '')).join('\n'); })()}
${m.customBlocks.map((b) => renderCustomBlock(b, { customBlocks: img.customBlocks })).join('\n')}
${m.hiddenSections.includes('contato') ? '' : final}
</main>
${footer}
<div class="dock"><a class="btn btn-ac" data-cta-live href="${esc(wa(m.ctaMessage))}"${waAttr}>${waBase ? WA_ICON : ''}<span class="t">${esc(m.ctaPrimary)}</span></a></div>
<script>${SITE_JS}</script>
${em ? `<style>[data-section]{cursor:pointer;outline:0;position:relative;transition:outline .15s,box-shadow .15s}[data-section]:hover{outline:2px dashed rgba(99,102,241,.55);outline-offset:4px}[data-section].es-on{outline:2.5px solid #6366f1!important;outline-offset:4px;box-shadow:0 0 0 6px rgba(99,102,241,.14)!important}[data-section]::after{content:attr(data-section-label);position:absolute;top:10px;left:12px;background:#6366f1;color:#fff;font:600 11px/1 system-ui,sans-serif;padding:3px 8px;border-radius:4px;z-index:200;pointer-events:none;white-space:nowrap;opacity:0;transition:opacity .15s}[data-section]:hover::after,[data-section].es-on::after{opacity:1}</style><script>(function(){var secs=document.querySelectorAll('[data-section]');secs.forEach(function(el){el.addEventListener('click',function(ev){ev.stopPropagation();secs.forEach(function(x){x.classList.remove('es-on')});el.classList.add('es-on');window.parent.postMessage({type:'prospecta-section',section:el.dataset.section},'*')})})})();<\/script>` : ''}
</body>
</html>`;
}

