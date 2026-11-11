import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types';
import { leadFromRaw } from '../src/core/dedupe';
import { buildSiteModel, renderSite } from '../src/core/site/render';
import { THEMES } from '../src/core/site/themes';
import { contrast, ensureContrast, mixHex, noWidow, qualityNotes } from '../src/core/site/kit';

const src = { provider: 'osm' as const, externalId: 'n/1', collectedAt: '2026-01-01T00:00:00Z' };
const mk = (over: Partial<Lead> = {}): Lead => ({
  ...leadFromRaw({ name: 'Sorriso Vivo', city: 'Curitiba', neighborhood: 'Batel', phone: '5541999998888', source: src }, 'dentista'),
  ...over,
});

describe('kit: contraste', () => {
  it('mede a razão WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('ajusta uma cor fraca até o mínimo e preserva a que já passa', () => {
    expect(ensureContrast('#0f6e5c', '#f4f2ec')).toBe('#0f6e5c');
    const fixed = ensureContrast('#f2d16b', '#f4f2ec');
    expect(contrast(fixed, '#f4f2ec')).toBeGreaterThanOrEqual(4.5);
    const onDark = ensureContrast('#222222', '#111216');
    expect(contrast(onDark, '#111216')).toBeGreaterThanOrEqual(4.5);
  });

  it('mistura cores', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('kit: tipografia', () => {
  it('cola as duas últimas palavras (sem viúva)', () => {
    expect(noWidow('Seu sorriso merece atenção de verdade')).toBe('Seu sorriso merece atenção de verdade');
    expect(noWidow('Olá mundo')).toBe('Olá mundo');
  });
});

describe('kit: aplicado ao site', () => {
  it('todo tema + acento passa 4,5:1 no texto de destaque', () => {
    for (const id of Object.keys(THEMES)) {
      const html = renderSite(buildSiteModel(mk(), { theme: id }));
      const act = /--act:(#[0-9a-f]{6})/i.exec(html)?.[1];
      const bg = /--bg:(#[0-9a-f]{6})/i.exec(html)?.[1];
      expect(act && bg, id).toBeTruthy();
      expect(contrast(act!, bg!), id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('acento personalizado fraco é corrigido só no texto e avisa', () => {
    const m = buildSiteModel(mk(), { theme: 'sobrio', accent: '#ffe066' });
    expect(m.theme.accent).toBe('#ffe066');
    expect(contrast(m.theme.accentText!, m.theme.bg)).toBeGreaterThanOrEqual(4.5);
    expect(m.warnings.some((w) => w.includes('contraste'))).toBe(true);
  });

  it('inclui regras anti-viúva e véu uniforme, e o título não termina com palavra sozinha', () => {
    const html = renderSite(buildSiteModel(mk()));
    expect(html).toContain('text-wrap:balance');
    expect(html).toContain('--sec:');
    expect(html).toMatch(/<h1[^>]*>.* .*<\/h1>/s);
  });

  it('ritmo uniforme: sem padding solto, serviços em grade e topo limitado pela altura', () => {
    const html = renderSite(buildSiteModel(mk()));
    expect(html).not.toContain('style="padding-top:0"');
    expect(html).toContain('section.s:not(.dark)+section.s:not(.dark){padding-top:0}');
    expect(html).toContain('10.5svh');
    expect(html).toContain('overflow-x:clip');
    expect(html).toMatch(/\.car:not\(\.car-rev\) \.car-track\{display:grid!important/);
  });

  it('avisa sobre frase genérica e título longo', () => {
    const notes = qualityNotes({ headline: 'x'.repeat(95), services: 2, galleryCount: 1, texts: ['Uma experiência única'], accentAdjusted: false });
    expect(notes).toHaveLength(4);
  });
});

const jpeg = (w: number, h: number) => {
  const bytes = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9];
  return `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;
};

describe('kit: foto fraca e pacote de engenharia', () => {
  it('lê a dimensão real de JPEG', async () => {
    const { imageSize } = await import('../src/core/site/kit');
    expect(imageSize(jpeg(408, 240))).toEqual({ w: 408, h: 240 });
    expect(imageSize('data:image/gif;base64,AAAA')).toBeUndefined();
  });

  it('foto de topo pequena não vira capa borrada: usa o cartão da marca e avisa', () => {
    const m = buildSiteModel(mk(), {}, { hero: jpeg(408, 240) });
    expect(m.images.hero).toBeUndefined();
    expect(m.heroLayout === 'split' || m.heroLayout === 'centered').toBe(true);
    expect(m.warnings.some((w) => w.includes('408×240'))).toBe(true);
  });

  it('foto grande de topo nunca usa o layout com a foto abaixo da dobra', () => {
    for (let s = 0; s < 12; s++) {
      const m = buildSiteModel(mk(), { shuffle: s }, { hero: jpeg(1600, 1000) });
      expect(['fullbleed', 'editorial']).toContain(m.heroLayout);
    }
  });

  it('engenheiro civil usa pacote próprio, não o genérico', () => {
    const m = buildSiteModel(mk({ niche: 'engenheiro', category: 'Engenheiro civil' }));
    expect(m.services.map((s) => s.title)).toContain('Laudos e vistorias');
    expect(m.ctaPrimary).toBe('Pedir orçamento');
  });
});

describe('copy sem foco em região', () => {
  it('título e subtítulo não citam cidade nem bairro, em nenhum segmento', () => {
    for (const niche of ['dentista', 'advogado', 'salão de beleza', 'pizzaria', 'academia', 'imobiliária', 'oficina mecânica', 'pet shop', 'engenheiro', 'drones agrícolas', 'clínica médica']) {
      for (let s = 0; s < 6; s++) {
        const m = buildSiteModel(mk({ niche, category: undefined, city: 'Florianópolis', neighborhood: 'Estreito' }), { shuffle: s });
        expect(`${m.headline} ${m.subheadline} ${m.intro} ${m.about}`, `${niche}/${s}`).not.toMatch(/Florian[oó]polis|Estreito/);
      }
    }
  });
});

describe('chamada final com foto, equipe e quem somos reais', () => {
  it('com foto grande de fundo usa película e classe cta-photo; foto pequena é ignorada', () => {
    const big = renderSite(buildSiteModel(mk(), {}, { cta: jpeg(1600, 1000) }));
    expect(big).toContain('class="cta cta-photo"');
    expect(big).toContain('class="cta-bg"');
    const small = renderSite(buildSiteModel(mk(), {}, { cta: jpeg(400, 300) }));
    expect(small).not.toContain('cta-photo"');
  });

  it('traz "quem somos" e equipe do site atual do cliente', async () => {
    const { extractBrandAssets } = await import('../src/core/brandAssets');
    const html = `<html><body><h2>Quem somos</h2><p>Somos um escritório de engenharia civil focado em reformas e laudos técnicos para residências e empresas.</p>
      <h3>Eng. Diogo Moraes</h3><p>Engenheiro civil responsável técnico, acompanha cada obra do projeto até a entrega final.</p></body></html>`;
    const b = extractBrandAssets(html, 'https://exemplo.com.br');
    expect(b.about).toContain('escritório de engenharia civil');
    expect(b.team?.[0]).toMatchObject({ name: 'Eng. Diogo Moraes' });
    expect(b.team?.[0].text).toContain('responsável técnico');
    const lead = mk({ diagnosis: { ranAt: '2026-01-01', ok: true, checks: [], facts: { brand: b } as any } as any });
    const m = buildSiteModel(lead);
    expect(m.about).toContain('escritório de engenharia civil');
    expect(m.team[0].name).toBe('Eng. Diogo Moraes');
    expect(renderSite(m)).toContain('Quem atende você');
  });

  it('botão do WhatsApp usa o ícone novo e o rodapé não cita Pixabay', () => {
    const html = renderSite(buildSiteModel(mk()));
    expect(html).toContain('M17.472 14.382');
    expect(html).not.toContain('Pixabay');
  });
});
