import { describe, expect, it } from 'vitest';
import { crc32, dataUrlToBytes, makeZip } from '../src/core/zip';
import { leadFromRaw } from '../src/core/dedupe';
import { buildSiteModel, cleanSiteUrl, renderSite } from '../src/core/site/render';

describe('zip', () => {
  it('crc32 conhecido', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('gera estrutura zip válida com N entradas', () => {
    const z = makeZip([{ path: 'index.html', data: '<h1>oi</h1>' }, { path: 'img/a.png', data: new Uint8Array([1, 2, 3]) }]);
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const end = z.length - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 10, true)).toBe(2);
  });
  it('data URL → bytes', () => {
    expect(dataUrlToBytes('data:image/jpeg;base64,AQID')).toMatchObject({ ext: 'jpg', bytes: new Uint8Array([1, 2, 3]) });
    expect(dataUrlToBytes('javascript:x')).toBeNull();
  });
});

describe('SEO do site exportado', () => {
  const lead = leadFromRaw({ name: 'Clínica Sorriso', city: 'Curitiba', phone: '5541999998888', rating: 4.8, reviewCount: 120, instagram: 'clinicasorriso', source: { provider: 'gmaps', collectedAt: '' } }, 'dentista');
  const html = renderSite(buildSiteModel(lead, { heroLayout: 'centered' }), { siteUrl: 'clinicasorriso.com.br/', files: { hero: 'img/topo.jpg', gallery: [], og: 'og.jpg', favicon: 'favicon.png' } });

  it('normaliza o endereço público (só https)', () => {
    expect(cleanSiteUrl('clinicasorriso.com.br/')).toBe('https://clinicasorriso.com.br');
    expect(cleanSiteUrl('http://x.com.br')).toBeUndefined();
    expect(cleanSiteUrl('javascript:alert(1)')).toBeUndefined();
  });
  it('tem canonical, Open Graph com imagem absoluta, Twitter card e favicon', () => {
    expect(html).toContain('<link rel="canonical" href="https://clinicasorriso.com.br/">');
    expect(html).toContain('<meta property="og:image" content="https://clinicasorriso.com.br/og.jpg">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<link rel="icon" type="image/png" href="favicon.png">');
    expect(html).toContain('name="robots" content="index, follow');
  });
  it('usa arquivos no lugar de imagens embutidas e JSON-LD completo', () => {
    expect(html).toContain('src="img/topo.jpg"');
    expect(html).not.toContain('data:image');
    expect(html).toContain('"url":"https://clinicasorriso.com.br/"');
    expect(html).toContain('"sameAs":["https://www.instagram.com/clinicasorriso/"]');
    expect(html).toContain('"aggregateRating"');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('lang="pt-BR"');
  });
});
