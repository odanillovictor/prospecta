// Gera, no navegador, a imagem de compartilhamento (Open Graph 1200×630) e o favicon do site do cliente.
// Determinístico, sem IA: foto real do cliente (se houver) + logo + nome + cor da marca.
import type { SiteModel } from '../core/site/render';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s+\S*$/, '') + '…';
    return kept;
  }
  return lines;
}

function initials(name: string): string {
  return name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || name.slice(0, 1).toUpperCase();
}

const DISPLAY = (m: SiteModel) => m.theme.display.split(',')[0].replace(/'/g, '');
const BODY = (m: SiteModel) => m.theme.body.split(',')[0].replace(/'/g, '');

async function ensureFonts(m: SiteModel) {
  // Carrega as fontes do tema (mesmas do site) antes de desenhar; se falhar, usa as do sistema.
  try {
    if (!document.querySelector(`link[data-og-font="${m.theme.id}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = m.theme.fontsHref;
      l.dataset.ogFont = m.theme.id;
      document.head.appendChild(l);
    }
    await Promise.race([
      Promise.all([document.fonts.load(`600 64px "${DISPLAY(m)}"`), document.fonts.load(`500 28px "${BODY(m)}"`)]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fontes do sistema */
  }
}

export async function renderOgImage(m: SiteModel): Promise<string> {
  await ensureFonts(m);
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const t = m.theme;
  const hero = m.images.hero ? await loadImage(m.images.hero) : null;
  const logo = m.images.logo ? await loadImage(m.images.logo) : null;

  if (hero) {
    cover(ctx, hero, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.82)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = t.accent;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = t.accentInk;
    ctx.globalAlpha = 0.12;
    for (const r of [220, 330, 440]) {
      ctx.beginPath();
      ctx.arc(W - 60, 80, r, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const textColor = hero ? '#ffffff' : t.accentInk;

  // Barra da marca
  ctx.fillStyle = t.accent;
  ctx.fillRect(0, H - 14, W, 14);

  // Logo
  const lx = 72;
  const ly = 72;
  ctx.save();
  roundRect(ctx, lx, ly, 112, 112, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();
  if (logo) {
    const s = Math.min(92 / logo.width, 92 / logo.height);
    ctx.drawImage(logo, lx + (112 - logo.width * s) / 2, ly + (112 - logo.height * s) / 2, logo.width * s, logo.height * s);
  } else {
    ctx.fillStyle = '#111111';
    ctx.font = `600 46px "${DISPLAY(m)}", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(m.name), lx + 56, ly + 60);
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = textColor;
  ctx.globalAlpha = 0.85;
  ctx.font = `600 26px "${BODY(m)}", system-ui, sans-serif`;
  ctx.fillText(`${m.segmentLabel} · ${m.local}`.toUpperCase().slice(0, 60), 72, 262);
  ctx.globalAlpha = 1;

  ctx.font = `${t.displayWeight >= 700 ? 800 : 600} 76px "${DISPLAY(m)}", Georgia, serif`;
  const lines = wrap(ctx, m.name, hero ? 760 : 1000, 2);
  lines.forEach((l, i) => ctx.fillText(l, 72, 350 + i * 84));

  let y = 350 + lines.length * 84 + 18;
  ctx.font = `500 30px "${BODY(m)}", system-ui, sans-serif`;
  if (m.rating != null && m.reviewCount) {
    ctx.fillText(`★ ${m.rating.toFixed(1).replace('.', ',')} no Google · ${m.reviewCount} avaliações`, 72, y);
    y += 50;
  }
  // Selo de ação
  const label = m.waLink ? `${m.ctaPrimary} pelo WhatsApp` : m.ctaPrimary;
  ctx.font = `700 26px "${BODY(m)}", system-ui, sans-serif`;
  const bw = ctx.measureText(label).width + 56;
  roundRect(ctx, 72, Math.min(y, H - 110), bw, 58, 29);
  ctx.fillStyle = hero ? t.accent : t.accentInk;
  ctx.fill();
  ctx.fillStyle = hero ? t.accentInk : t.accent;
  ctx.fillText(label, 100, Math.min(y, H - 110) + 38);

  return c.toDataURL('image/jpeg', 0.86);
}

/** Reduz uma foto (data URL) para no máximo `max` px no maior lado, em JPEG — deixa a prévia online leve. */
export async function shrinkDataUrl(src: string | undefined, max = 1600, quality = 0.82): Promise<string | undefined> {
  if (!src) return undefined;
  const img = await loadImage(src);
  if (!img) return src;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  if (scale === 1 && src.length < 600_000) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/** Favicon 192×192: logo do cliente ou iniciais na cor da marca. */
export async function renderFavicon(m: SiteModel): Promise<string> {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  const logo = m.images.logo ? await loadImage(m.images.logo) : null;
  roundRect(ctx, 0, 0, 192, 192, 40);
  ctx.fillStyle = logo ? '#ffffff' : m.theme.accent;
  ctx.fill();
  if (logo) {
    const s = Math.min(160 / logo.width, 160 / logo.height);
    ctx.drawImage(logo, (192 - logo.width * s) / 2, (192 - logo.height * s) / 2, logo.width * s, logo.height * s);
  } else {
    ctx.fillStyle = m.theme.accentInk;
    ctx.font = `700 88px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(m.name), 96, 104);
  }
  return c.toDataURL('image/png');
}
