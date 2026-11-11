import { describe, expect, it } from 'vitest';
import { brandColorFrom, dominantColor, looksLikeLogo } from '../src/core/site/palette';

const px = (rgba: Array<[number, number, number, number, number]>) => {
  const a: number[] = [];
  for (const [r, g, b, al, n] of rgba) for (let i = 0; i < n; i++) a.push(r, g, b, al);
  return { data: a };
};

describe('paleta da marca', () => {
  it('logo: ignora fundo transparente/branco e pega a cor da marca', () => {
    const logo = px([[0, 0, 0, 0, 500], [255, 255, 255, 255, 300], [14, 110, 92, 255, 120], [200, 60, 40, 255, 20]]);
    const c = brandColorFrom({ logo })!;
    expect(c.source).toBe('logo');
    expect(c.hex).toBe('#0e6e5c');
  });
  it('sem logo (ou logo cinza/preto): usa a predominância nas fotos', () => {
    const cinza = px([[20, 20, 20, 255, 200], [255, 255, 255, 255, 200]]);
    const foto1 = px([[210, 205, 200, 255, 300], [30, 120, 100, 255, 150]]);
    const foto2 = px([[30, 120, 100, 255, 200], [230, 230, 230, 255, 100]]);
    const c = brandColorFrom({ logo: cinza, photos: [foto1, foto2] })!;
    expect(c.source).toBe('fotos');
    expect(c.hex).toBe('#1e7864');
  });
  it('só neutros: não inventa cor', () => {
    expect(dominantColor(px([[128, 128, 128, 255, 100], [255, 255, 255, 255, 100]]))).toBeUndefined();
    expect(brandColorFrom({})).toBeUndefined();
  });
  it('distingue logo (poucas cores chapadas) de foto (muitos tons)', () => {
    expect(looksLikeLogo(px([[255, 255, 255, 255, 300], [14, 110, 92, 255, 150], [20, 20, 20, 255, 50]]))).toBe(true);
    const foto: Array<[number, number, number, number, number]> = [];
    for (let i = 0; i < 64; i++) foto.push([(i * 37) % 256, (i * 91) % 256, (i * 53) % 256, 255, 8]);
    expect(looksLikeLogo(px(foto))).toBe(false);
  });
});
