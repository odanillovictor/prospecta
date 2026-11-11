// Lê os pixels (RGBA) de uma imagem num canvas reduzido, para extrair a cor da marca.
import type { Pixels } from '../core/site/palette';

export function imagePixels(src: string, size = 96): Promise<Pixels | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.min(size, img.naturalWidth || size);
        const h = Math.max(1, Math.round(((img.naturalHeight || size) / (img.naturalWidth || size)) * w));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ data: ctx.getImageData(0, 0, w, h).data });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
