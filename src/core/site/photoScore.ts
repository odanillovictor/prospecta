// Nota de qualidade de uma foto (0–100) a partir dos pixels, sem IA: decide se uma foto do Google Maps
// "cai bem" no site. Puro (recebe os pixels), para ser testável; o navegador só faz a leitura via canvas.

export interface PhotoStats {
  width: number; // largura original
  height: number;
  /** RGBA de uma versão reduzida (ex.: 160 px de largura). */
  data: Uint8ClampedArray | number[];
  w: number; // largura da versão reduzida
  h: number;
}

export interface PhotoScore {
  score: number;
  reasons: string[];
  /** Medidas usadas (para calibrar). */
  metrics: { sky: number; mean: number; std: number; colorful: number; sharp: number; busy: number; white: number };
}

export function scorePhoto(s: PhotoStats, use: 'hero' | 'gallery'): PhotoScore {
  const n = s.w * s.h;
  const lum = new Float32Array(n);
  let sum = 0;
  let white = 0;
  let dark = 0;
  let rg = 0;
  let yb = 0;
  let rg2 = 0;
  let yb2 = 0;
  for (let i = 0; i < n; i++) {
    const r = s.data[i * 4];
    const g = s.data[i * 4 + 1];
    const b = s.data[i * 4 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l;
    sum += l;
    if (l > 232) white++;
    if (l < 28) dark++;
    const a = r - g;
    const c = 0.5 * (r + g) - b;
    rg += a;
    yb += c;
    rg2 += a * a;
    yb2 += c * c;
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (lum[i] - mean) ** 2;
  const std = Math.sqrt(varSum / n);
  // Colorido (Hasler–Süsstrunk): foto cinza/documento fica baixo.
  const sdRg = Math.sqrt(Math.max(0, rg2 / n - (rg / n) ** 2));
  const sdYb = Math.sqrt(Math.max(0, yb2 / n - (yb / n) ** 2));
  const colorful = Math.sqrt(sdRg ** 2 + sdYb ** 2) + 0.3 * Math.sqrt((rg / n) ** 2 + (yb / n) ** 2);
  // Nitidez: variância do Laplaciano (foto borrada fica baixo).
  let lapSum = 0;
  let lapSq = 0;
  let m = 0;
  for (let y = 1; y < s.h - 1; y++) {
    for (let x = 1; x < s.w - 1; x++) {
      const i = y * s.w + x;
      const v = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - s.w] - lum[i + s.w];
      lapSum += v;
      lapSq += v * v;
      m++;
    }
  }
  const sharp = m ? lapSq / m - (lapSum / m) ** 2 : 0;
  // Poluição visual: fração de pixels com borda forte (letreiro, prateleira cheia, rua) — atrapalha texto por cima.
  let edges = 0;
  for (let y = 1; y < s.h - 1; y++) {
    for (let x = 1; x < s.w - 1; x++) {
      const i = y * s.w + x;
      if (Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + s.w] - lum[i - s.w]) > 60) edges++;
    }
  }
  const busy = m ? edges / m : 0;
  // Céu no terço de cima (azul e claro) indica fachada/rua: foto externa, ruim atrás do título.
  let sky = 0;
  const top = Math.floor(s.h / 3) * s.w;
  for (let i = 0; i < top; i++) {
    const r = s.data[i * 4];
    const g = s.data[i * 4 + 1];
    const b = s.data[i * 4 + 2];
    if (b > r + 15 && b >= g && lum[i] > 120) sky++;
  }
  const skyShare = top ? sky / top : 0;

  let score = 100;
  const reasons: string[] = [];
  const minW = use === 'hero' ? 900 : 500;
  if (s.width < minW * 0.6) (score -= 55), reasons.push('resolução muito baixa');
  else if (s.width < minW) (score -= 25), reasons.push('resolução baixa');
  if (use === 'hero' && s.width / s.height < 1.15) (score -= 20), reasons.push('foto em pé (não preenche o topo)');
  if (mean < 55) (score -= 30), reasons.push('escura');
  else if (mean > 210) (score -= 30), reasons.push('clara demais');
  if (std < 30) (score -= 25), reasons.push('sem contraste');
  if (sharp < 60) (score -= 30), reasons.push('borrada');
  else if (sharp < 120) (score -= 10);
  if (colorful < 12) (score -= 20), reasons.push('sem cor');
  if (white / n > 0.4) (score -= 35), reasons.push('parece papel, cardápio ou print');
  if (dark / n > 0.5) (score -= 25), reasons.push('muito preta');
  if (use === 'hero') {
    // Calibrado com fotos reais do Maps (out/2026): letreiro, prateleira cheia e rua ficam acima de 0,2.
    if (busy > 0.2) (score -= 35), reasons.push('poluída demais para texto por cima (letreiro, prateleira, rua)');
    else if (busy > 0.16) score -= 10;
    if (skyShare > 0.25) (score -= 25), reasons.push('fachada/rua');
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, metrics: { sky: Math.round(skyShare * 100) / 100, mean: Math.round(mean), std: Math.round(std), colorful: Math.round(colorful), sharp: Math.round(sharp), busy: Math.round(busy * 1000) / 1000, white: Math.round((white / n) * 100) / 100 } };
}

/** Nota mínima para usar a foto do cliente; abaixo disso entra foto ilustrativa coerente. */
export const MIN_PHOTO_SCORE = { hero: 70, gallery: 50 } as const;
