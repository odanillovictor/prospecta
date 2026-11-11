// Lê os pixels de uma imagem (data URL) num canvas reduzido e dá a nota de qualidade.
import { scorePhoto, type PhotoScore } from '../core/site/photoScore';

export function photoQuality(src: string, use: 'hero' | 'gallery'): Promise<PhotoScore | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = 160;
        const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(scorePhoto({ width: img.naturalWidth, height: img.naturalHeight, data: ctx.getImageData(0, 0, w, h).data, w, h }, use));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Impressão digital visual (8×8, média de brilho) para achar fotos repetidas ou quase iguais. */
export function imageHash(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 8;
        c.height = 8;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        const lum: number[] = [];
        for (let i = 0; i < d.length; i += 4) lum.push(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        const avg = lum.reduce((a, b) => a + b, 0) / lum.length;
        resolve(lum.map((v) => (v >= avg ? '1' : '0')).join(''));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function hammingDistance(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n;
}
