import { describe, expect, it } from 'vitest';
import { extractBrandAssets, isBrandish } from '../src/core/brandAssets';
import { leadFromRaw } from '../src/core/dedupe';
import { brandDraft, imageCandidates } from '../src/core/site/clientAssets';
import { buildSiteModel, renderSite } from '../src/core/site/render';
import { placeToBusiness } from '../src/core/providers/googlePlaces';
import type { Lead } from '../src/core/types';

const HTML = `<html><head>
<meta name="theme-color" content="#0a7d6b"><meta property="og:image" content="/img/capa.jpg"><meta property="og:site_name" content="Clínica Sorriso">
<link rel="apple-touch-icon" href="/apple.png"><style>.btn{background:#0a7d6b}.x{color:#0a7d6b}.y{color:#ffffff}.z{color:#333}</style></head><body>
<header><img class="site-logo" src="/img/logo.png" alt="Clínica Sorriso"></header>
<img src="https://cdn.exemplo.com/equipe.jpg" width="800" height="600"><img src="/img/icon-whatsapp.png" width="32"><img src="/pixel.gif">
<div style="background-image:url('/img/fachada.webp')"></div>
<h2>Nossos serviços</h2><h3>Implantes dentários</h3><h3>Clareamento</h3><h3>Ortodontia invisível</h3><h2>Fale conosco</h2>
<a href="https://www.instagram.com/clinicasorriso/">IG</a><a href="mailto:contato@sorriso.com.br">mail</a>
</body></html>`;

describe('extractBrandAssets', () => {
  const b = extractBrandAssets(HTML, 'https://sorriso.com.br/');
  it('encontra logo, capa, ícone e fotos com URLs absolutas', () => {
    expect(b.logo).toBe('https://sorriso.com.br/img/logo.png');
    expect(b.ogImage).toBe('https://sorriso.com.br/img/capa.jpg');
    expect(b.icon).toBe('https://sorriso.com.br/apple.png');
    expect(b.images).toEqual(['https://cdn.exemplo.com/equipe.jpg', 'https://sorriso.com.br/img/fachada.webp']);
  });
  it('identifica cor da marca e ignora neutras', () => {
    expect(b.themeColor).toBe('#0a7d6b');
    expect(b.colors[0]).toBe('#0a7d6b');
    expect(b.colors).not.toContain('#ffffff');
    expect(isBrandish('#333333')).toBe(false);
  });
  it('extrai serviços, Instagram e e-mail', () => {
    expect(b.serviceHints).toEqual(['Implantes dentários', 'Clareamento', 'Ortodontia invisível']);
    expect(b.instagram).toBe('clinicasorriso');
    expect(b.email).toBe('contato@sorriso.com.br');
    expect(b.siteName).toBe('Clínica Sorriso');
  });
});

const base = (over: Partial<Lead> = {}): Lead => ({
  ...leadFromRaw({ name: 'Clínica Sorriso', city: 'Curitiba', phone: '5541999998888', website: 'https://sorriso.com.br', source: { provider: 'osm', collectedAt: '' } }, 'dentista'),
  ...over,
});

describe('identidade do cliente no novo site', () => {
  const lead = base({
    hours: 'segunda-feira: 08:00–18:00',
    photos: [{ name: 'places/ChIJabcdefghij/photos/AZabcdefghijk', attribution: 'Clínica Sorriso' }],
    diagnosis: { ranAt: '', ok: true, checks: [], facts: { brand: extractBrandAssets(HTML, 'https://sorriso.com.br/') } as any },
  });
  it('lista candidatas com logo do site e fotos do Google', () => {
    const c = imageCandidates(lead);
    expect(c[0]).toMatchObject({ kind: 'url', suggested: 'logo' });
    expect(c.find((x) => x.kind === 'place')).toMatchObject({ suggested: 'hero' });
  });
  it('brandDraft aplica cor, serviços, horário, logo, topo e galeria sem sobrescrever edições', () => {
    const d = brandDraft(lead, { accent: '#123456' });
    expect(d.accent).toBe('#123456');
    expect(d.services?.map((s) => s.title)).toEqual(['Implantes dentários', 'Clareamento', 'Ortodontia invisível']);
    expect(d.hours).toContain('08:00');
    expect(d.instagram).toBe('clinicasorriso');
    expect(d.logoSrc?.value).toContain('logo.png');
    expect(d.heroSrc?.kind).toBe('place');
    expect(d.gallerySrc?.length).toBeGreaterThanOrEqual(2);
    expect(d.brandApplied).toBe(true);
  });
  it('hero: com foto real usa tela cheia; sem foto usa cartão da marca com dados reais (sem painel decorativo)', () => {
    const img = 'data:image/png;base64,iVBORw0KGgo=';
    const withPhoto = renderSite(buildSiteModel(lead, { heroLayout: 'fullbleed' }, { hero: img, gallery: [img, img, img], credits: ['Google Maps'] }));
    expect(withPhoto).toContain('hero-photo">');
    expect(withPhoto).toContain('class="gal gal-3"');
    expect(withPhoto).toContain('Fotos: Google Maps');
    const noPhoto = buildSiteModel(lead);
    const html = renderSite(noPhoto);
    expect(html).not.toContain('hero-photo">');
    expect(html).toContain('class="bcard"');
    expect(html).toContain('08:00');
    expect(html).not.toContain('class="big"');
    expect(noPhoto.warnings.join(' ')).toMatch(/Sem foto real/);
  });
});

describe('Google Places: fotos, horário e resumo', () => {
  it('mapeia campos e valida nomes de foto', () => {
    const b = placeToBusiness({
      id: 'x', displayName: { text: 'Pet Feliz' },
      regularOpeningHours: { weekdayDescriptions: ['segunda-feira: 09:00–18:00', 'terça-feira: 09:00–18:00'] },
      editorialSummary: { text: 'Banho e tosa no bairro.' },
      photos: [{ name: 'places/ChIJ1234567890/photos/AbCdEfGhIjKl', authorAttributions: [{ displayName: 'Pet Feliz' }] }, { name: '../../etc/passwd' }],
    }, 'q', new Date())!;
    expect(b.hours).toContain('segunda-feira');
    expect(b.summary).toBe('Banho e tosa no bairro.');
    expect(b.photos).toEqual([{ name: 'places/ChIJ1234567890/photos/AbCdEfGhIjKl', attribution: 'Pet Feliz' }]);
  });
});
