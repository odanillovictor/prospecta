// Cor de destaque da identidade do cliente, SEM inventar: 1) cores do logo; 2) predominância nas fotos reais do
// cliente (Instagram ou Google Maps). Puro (recebe pixels RGBA), testável; o navegador só lê os pixels via canvas.

export interface Pixels {
  data: ArrayLike<number>; // RGBA
}

export interface BrandColor {
  hex: string;
  source: 'logo' | 'fotos';
  /** Fração (0–1) dos pixels com cor que caem nessa cor: confiança. */
  share: number;
}

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

function hsl(r: number, g: number, b: number): { s: number; l: number } {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  const d = mx - mn;
  return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

interface Bucket { n: number; r: number; g: number; b: number; score: number }

/** Cor cromática predominante (ignora transparente, branco, preto e cinza). */
export function dominantColor(px: Pixels, minShare = 0.02): { hex: string; share: number } | undefined {
  const d = px.data;
  const buckets = new Map<number, Bucket>();
  let counted = 0;
  for (let i = 0; i + 3 < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    counted++;
    const { s, l } = hsl(r, g, b);
    if (s < 0.22 || l < 0.1 || l > 0.9) continue; // neutros e extremos não definem a marca
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, score: 0 };
    bk.n++; bk.r += r; bk.g += g; bk.b += b; bk.score += 0.4 + s; // cores vivas pesam mais que desbotadas
    buckets.set(key, bk);
  }
  if (!counted) return undefined;
  // Une buckets vizinhos (mesma família de cor) para não dividir um tom em vários.
  const list = [...buckets.entries()];
  let best: { score: number; n: number; r: number; g: number; b: number } | undefined;
  for (const [k, bk] of list) {
    let score = bk.score, n = bk.n, r = bk.r, g = bk.g, b = bk.b;
    for (const [k2, o] of list) {
      if (k2 === k) continue;
      const dr = Math.abs((k >> 8) - (k2 >> 8)), dg = Math.abs(((k >> 4) & 15) - ((k2 >> 4) & 15)), db = Math.abs((k & 15) - (k2 & 15));
      if (dr <= 1 && dg <= 1 && db <= 1) { score += o.score; n += o.n; r += o.r; g += o.g; b += o.b; }
    }
    if (!best || score > best.score) best = { score, n, r, g, b };
  }
  if (!best || best.n / counted < minShare) return undefined;
  return { hex: toHex(best.r / best.n, best.g / best.n, best.b / best.n), share: best.n / counted };
}

/** Logo primeiro; sem cor no logo (ou sem logo), predominância nas fotos reais. Nada é inventado. */
export function brandColorFrom(input: { logo?: Pixels; photos?: Pixels[] }): BrandColor | undefined {
  if (input.logo) {
    const c = dominantColor(input.logo, 0.04);
    if (c) return { ...c, source: 'logo' };
  }
  const acc = new Map<string, number>();
  let total = 0;
  const per: Array<{ hex: string; share: number }> = [];
  for (const p of input.photos ?? []) {
    const c = dominantColor(p, 0.02);
    if (c) { per.push(c); total += c.share; }
  }
  if (!per.length) return undefined;
  // Vota entre as fotos: agrupa tons parecidos e escolhe o grupo com mais peso.
  for (const c of per) {
    const r = parseInt(c.hex.slice(1, 3), 16), g = parseInt(c.hex.slice(3, 5), 16), b = parseInt(c.hex.slice(5, 7), 16);
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    acc.set(key, (acc.get(key) ?? 0) + c.share);
  }
  const topKey = [...acc.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const group = per.filter((c) => {
    const r = parseInt(c.hex.slice(1, 3), 16), g = parseInt(c.hex.slice(3, 5), 16), b = parseInt(c.hex.slice(5, 7), 16);
    return `${r >> 5}-${g >> 5}-${b >> 5}` === topKey;
  });
  const w = group.reduce((s, c) => s + c.share, 0);
  const mix = (i: number) => group.reduce((s, c) => s + parseInt(c.hex.slice(i, i + 2), 16) * c.share, 0) / w;
  return { hex: toHex(mix(1), mix(3), mix(5)), source: 'fotos', share: w / total };
}

/** Heurística: arte gráfica (poucas cores chapadas) parece logo; foto (muitos tons) não. */
export function looksLikeLogo(px: Pixels): boolean {
  const d = px.data;
  const b = new Map<number, number>();
  let n = 0;
  for (let i = 0; i + 3 < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    n++;
    const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
    b.set(k, (b.get(k) ?? 0) + 1);
  }
  if (n < 50) return false;
  const top = [...b.values()].sort((x, y) => y - x).slice(0, 4).reduce((s2, v) => s2 + v, 0);
  return top / n >= 0.8;
}
