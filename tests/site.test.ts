import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types';
import { leadFromRaw } from '../src/core/dedupe';
import { buildSiteModel, renderSite, safeDataImage } from '../src/core/site/render';
import { packFor } from '../src/core/site/packs';
import { improvementsFor } from '../src/core/site/improvements';
import { diagnosisFromFacts } from '../src/core/diagnosis';
import { extractHtmlFacts } from '../src/core/htmlFacts';
import { readableOn, safeHex } from '../src/core/site/themes';

const src = { provider: 'osm' as const, externalId: 'n/1', collectedAt: '2026-01-01T00:00:00Z' };
const mk = (over: Partial<Lead> = {}): Lead => ({
  ...leadFromRaw({ name: 'Sorriso Vivo', city: 'Curitiba', neighborhood: 'Batel', phone: '5541999998888', lat: -25.44, lon: -49.29, source: src }, 'dentista'),
  ...over,
});

describe('packs', () => {
  it('escolhe o pacote pelo nicho/categoria', () => {
    expect(packFor('dentista').id).toBe('odonto');
    expect(packFor('Salão de Beleza').id).toBe('beleza');
    expect(packFor('qualquer', 'restaurant').id).toBe('alimentacao');
    expect(packFor('drones agrícolas').id).toBe('generico');
  });
});

describe('renderSite', () => {
  it('gera página completa com SEO local, WhatsApp e mapa', () => {
    const html = renderSite(buildSiteModel(mk()));
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Sorriso Vivo | Dentista em Curitiba</title>');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('"@type":"LocalBusiness"');
    expect(html).toContain('https://wa.me/5541999998888?text=');
    expect(html).toContain('google.com/maps?q=');
    expect(html).not.toContain('openstreetmap.org/export/embed');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('não inventa avaliações quando não há dados', () => {
    const html = renderSite(buildSiteModel(mk()));
    expect(html).not.toContain('id="avaliacoes"');
    expect(html).not.toContain('aggregateRating');
    const withRating = renderSite(buildSiteModel(mk({ rating: 4.8, reviewCount: 120 })));
    expect(withRating).toContain('id="avaliacoes"');
    expect(withRating).toContain('120 avaliações');
  });

  it('escapa conteúdo do lead e do rascunho (sem injeção de HTML/JS)', () => {
    const evil = mk({ name: '<script>alert(1)</script>"x', address: '"><img src=x onerror=alert(1)>' });
    const html = renderSite(buildSiteModel(evil, { headline: '<b>oi</b>', accent: 'red;}</style><script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>oi</b>');
    expect(html).not.toContain('red;}');
    // JSON-LD não pode fechar a tag script
    const ld = html.slice(html.indexOf('application/ld+json'), html.indexOf('</script>', html.indexOf('application/ld+json')));
    expect(ld).not.toContain('<script>alert');
  });

  it('usa os textos editados e cai no padrão quando vazios', () => {
    const m = buildSiteModel(mk(), { headline: 'Novo título', subheadline: '   ', services: [{ title: 'Clareamento', text: 'x' }] });
    expect(m.headline).toBe('Novo título');
    expect(m.subheadline).toBe(packFor('dentista').subheadline);
    expect(m.services).toEqual([{ title: 'Clareamento', text: 'x' }]);
  });

  it('sem telefone: avisa e não gera link de WhatsApp', () => {
    const m = buildSiteModel(mk({ phone: undefined }));
    expect(m.waLink).toBeUndefined();
    expect(m.warnings.join(' ')).toMatch(/telefone/);
    expect(renderSite(m)).not.toContain('wa.me');
  });

  it('aceita só imagens raster em data URL', () => {
    expect(safeDataImage('data:image/png;base64,iVBORw0KGgo=')).toBeTruthy();
    expect(safeDataImage('data:image/svg+xml;base64,PHN2Zz4=')).toBeUndefined();
    expect(safeDataImage('javascript:alert(1)')).toBeUndefined();
  });

  it('cores: só hex e contraste automático', () => {
    expect(safeHex('#c6f432')).toBe('#c6f432');
    expect(safeHex('red')).toBeUndefined();
    expect(readableOn('#c6f432')).toBe('#111111');
    expect(readableOn('#1e3a5f')).toBe('#ffffff');
  });
});

describe('improvementsFor', () => {
  it('sem site: comparativo de criação', () => {
    const im = improvementsFor(mk({ reviewCount: 30, rating: 4.7 }));
    expect(im.map((i) => i.id)).toEqual(['presenca', 'contato', 'oferta', 'prova']);
  });
  it('com site diagnosticado: liga problemas às soluções', () => {
    const html = '<html><head><title>Home</title></head><body><table><tr><td>a</td></tr></table></body></html>';
    const diagnosis = diagnosisFromFacts({
      requestedUrl: 'http://exemplo.com.br', finalUrl: 'http://exemplo.com.br/', httpStatus: 200, https: false, redirects: 0,
      responseMs: 300, htmlBytes: 100, truncated: false, ...extractHtmlFacts(html), pagespeed: undefined,
    });
    const im = improvementsFor(mk({ website: 'http://exemplo.com.br', diagnosis }));
    const ids = im.map((i) => i.id);
    expect(ids).toContain('https');
    expect(ids).toContain('viewport');
    expect(ids).toContain('whatsapp');
    expect(im.every((i) => i.newSite.length > 10)).toBe(true);
  });
});

describe('CSP da prévia', () => {
  it('public/_headers autoriza exatamente o script do gerador (sha256)', async () => {
    const { createHash } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');
    const { SITE_JS } = await import('../src/core/site/render');
    const hash = createHash('sha256').update(SITE_JS, 'utf8').digest('base64');
    expect(readFileSync('public/_headers', 'utf8')).toContain(`'sha256-${hash}'`);
  });
});

describe('personalização por empresa', () => {
  const mkLead = (name: string, cats?: string[]) => ({ ...leadFromRaw({ name, city: 'Curitiba', phone: '5541999998888', categories: cats, source: { provider: 'gmaps' as const, collectedAt: '' } }, 'dentista') });
  it('empresas do mesmo segmento recebem combinações diferentes (cor/estilo/layout/título)', () => {
    const names = ['Clínica Sorriso', 'OdontoVida', 'Dra. Ana Lima', 'Implantes Batel', 'Dental Prime', 'Sorria Mais'];
    const combos = names.map((n) => { const m = buildSiteModel(mkLead(n)); return `${m.theme.id}|${m.theme.accent}|${m.heroLayout}|${m.servicesLayout}|${m.headline}`; });
    expect(new Set(combos).size).toBeGreaterThanOrEqual(5);
  });
  it('é estável para a mesma empresa e muda com "Outra combinação"', () => {
    const l = mkLead('Clínica Sorriso');
    const a = buildSiteModel(l);
    expect(buildSiteModel(l).theme.accent).toBe(a.theme.accent);
    const shuffled = [1, 2, 3, 4].map((n) => buildSiteModel(l, { shuffle: n }));
    expect(shuffled.some((m) => m.theme.accent !== a.theme.accent || m.heroLayout !== a.heroLayout || m.headline !== a.headline)).toBe(true);
  });
  it('serviços vêm das categorias reais do Maps', () => {
    const m = buildSiteModel(mkLead('X', ['Clínica odontológica', 'Ortodontista', 'Implantes dentários']));
    expect(m.services.slice(0, 2).map((s) => s.title)).toEqual(['Ortodontia', 'Implantes dentários']);
    // 2 das categorias + 2 essenciais do segmento + o que o Maps/site confirma; nada de serviço sem evidência.
    expect(m.services.length).toBeLessThanOrEqual(6);
    expect(m.services.length).toBeGreaterThanOrEqual(4);
  });
  it('sem foto real nunca usa layouts que dependem de imagem', () => {
    const m = buildSiteModel(mkLead('Y'), { heroLayout: 'editorial' });
    expect(m.heroLayout).toBe('split');
  });
});

describe('hash do script nas prévias', () => {
  it('SITE_JS_HASH acompanha o script do gerador', async () => {
    const { createHash } = await import('node:crypto');
    const { SITE_JS } = await import('../src/core/site/render');
    const { SITE_JS_HASH } = await import('../src/core/site/siteJsHash');
    expect(createHash('sha256').update(SITE_JS, 'utf8').digest('base64')).toBe(SITE_JS_HASH);
  });
});

describe('layout premium do site gerado', () => {
  const img = 'data:image/png;base64,iVBORw0KGgo=';
  const base = () => leadFromRaw({ name: 'Clínica Sorriso', city: 'Joinville', phone: '5547999998888', rating: 4.8, reviewCount: 120, email: 'contato@sorriso.com.br', instagram: 'clinicasorriso', source: { provider: 'gmaps', collectedAt: '' } }, 'dentista');

  it('serviços em cards com imagem, ícone e CTA de WhatsApp citando o serviço', () => {
    const mixed = renderSite(buildSiteModel(base(), {}, { services: [img, '', img] }));
    expect(mixed).not.toContain('class="card-img"');
    expect(mixed).toContain('class="card-ic2"');
    const html = renderSite(buildSiteModel(base(), {}, { services: Array(8).fill(img) }));
    expect(html).toContain('class="card-img"');
    expect(html).toMatch(/class="card-ic"><svg/);
    expect(html).toContain(encodeURIComponent('Olá! Vim pelo site e tenho interesse em: '));
  });

  it('avaliações em carrossel só quando existem avaliações reais; nunca inventa', () => {
    const sem = renderSite(buildSiteModel(base()));
    expect(sem).not.toContain('class="rcard"');
    expect(sem).toContain('Nota média de 120 avaliações');
    const lead = { ...base(), reviews: [{ author: 'Ana P.', rating: 5, text: 'Atendimento excelente.', when: 'há 2 meses', source: 'Google' as const }] };
    const com = renderSite(buildSiteModel(lead));
    expect(com).toContain('class="rcard"');
    expect(com).toContain('Atendimento excelente.');
    expect(com).toContain('Ana P.');
    expect(com.match(/class="rcard"/g)).toHaveLength(1);
  });

  it('header com menu mobile acessível e footer completo', () => {
    const html = renderSite(buildSiteModel(base()));
    expect(html).toContain('aria-controls="mnav"');
    expect(html).toContain('id="mnav" hidden');
    expect(html).toContain('class="ft"');
    expect(html).toContain('mailto:contato@sorriso.com.br');
    expect(html).toContain('https://www.instagram.com/clinicasorriso/');
    expect(html).toContain('Privacidade');
  });

  it('ícones têm um único estilo (traço) e cada serviço recebe um ícone coerente', async () => {
    const { iconFor, icon } = await import('../src/core/site/icons');
    expect(iconFor('Implantes dentários')).toBe('tooth');
    expect(iconFor('Banho e tosa')).toBe('paw');
    expect(iconFor('Direito trabalhista')).toBe('scale');
    expect(icon('tooth')).toContain('stroke-width="1.75"');
  });
});

describe('site personalizado', () => {
  it('passos com ícones e dados reais; serviços sem foto usam ícone; galeria só com 3+ fotos; avaliações em carrossel automático', async () => {
    const { buildSiteModel, renderSite } = await import('../src/core/site/render');
    const now = new Date().toISOString();
    const lead = {
      id: 'x1', name: 'Pet Bom', niche: 'pet shop', phone: '5547999990000', address: 'Pet Bom - R. Guilherme, 13 - Centro, Joinville - SC',
      city: 'Joinville', neighborhood: 'Centro', status: 'novo', sources: [], createdAt: now, updatedAt: now,
      reviews: [{ author: 'Ana', rating: 5, text: 'Ótimo atendimento.' }, { author: 'Bia', rating: 5, text: 'Recomendo.' }],
      rating: 4.9, reviewCount: 10,
    } as never;
    const m = buildSiteModel(lead);
    expect(m.steps[0]).toMatchObject({ icon: 'wa', title: 'Chame no WhatsApp' });
    expect(m.steps.at(-1)).toMatchObject({ icon: 'pin', title: 'Atendimento no Centro' });
    expect(m.steps.at(-1)!.text.startsWith('R. Guilherme, 13')).toBe(true);
    const html = renderSite(m);
    expect(html).toContain('class="step-ic"');
    expect(html).toContain('class="card-ic2"');
    expect(html).not.toContain('class="card-img card-noimg"');
    expect(html).not.toContain('id="fotos"');
    expect(html).toContain('data-auto');
    const img = 'data:image/png;base64,iVBORw0KGgo=';
    expect(renderSite(buildSiteModel(lead, {}, { gallery: [img, img] }))).not.toContain('id="fotos"');
    expect(renderSite(buildSiteModel(lead, {}, { gallery: [img, img, img] }))).toContain('Conheça a Pet Bom');
  });
});

describe('nota das fotos', () => {
  it('foto limpa passa; escura, borrada ou com cara de papel não', async () => {
    const { scorePhoto, MIN_PHOTO_SCORE } = await import('../src/core/site/photoScore');
    const w = 160, h = 100;
    const make = (f: (x: number, y: number) => [number, number, number]) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
      return d;
    };
    // Cena "calma": gradiente colorido com algumas manchas (nítida, sem excesso de bordas).
    const calm = make((x, y) => [80 + x / 2 + ((x * 7 + y * 13) % 40), 60 + y + ((x * 3) % 30), 150 - x / 3 + ((y * 5) % 50)]);
    const s1 = scorePhoto({ width: 1600, height: 1000, data: calm, w, h }, 'hero');
    expect(s1.score).toBeGreaterThanOrEqual(MIN_PHOTO_SCORE.hero);
    const dark = make(() => [10, 10, 12]);
    expect(scorePhoto({ width: 1600, height: 1000, data: dark, w, h }, 'hero').score).toBeLessThan(MIN_PHOTO_SCORE.hero);
    const paper = make((x, y) => ((x + y) % 9 === 0 ? [40, 40, 40] : [245, 245, 245]));
    const s3 = scorePhoto({ width: 1600, height: 1000, data: paper, w, h }, 'gallery');
    expect(s3.reasons).toContain('parece papel, cardápio ou print');
    expect(s3.score).toBeLessThan(MIN_PHOTO_SCORE.gallery);
    const tiny = scorePhoto({ width: 300, height: 200, data: calm, w, h }, 'hero');
    expect(tiny.reasons).toContain('resolução muito baixa');
  });
});

describe('upgrade premium leve', () => {
  const png = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
  it('FAQ tem 5 perguntas com dados reais e acordeão exclusivo', () => {
    const m = buildSiteModel(mk({ address: 'Rua A, 10', hours: 'Seg a sex, 8h às 18h' }));
    expect(m.faq).toHaveLength(5);
    expect(m.faq.some((f) => f.a.includes('Rua A, 10'))).toBe(true);
    expect(renderSite(m)).toContain('name="faq"');
  });
  it('mapa só carrega depois do clique', () => {
    const html = renderSite(buildSiteModel(mk({ address: 'Rua A, 10' })));
    expect(html).toContain('data-map=');
    expect(html).not.toMatch(/<iframe/);
  });
  it('título destaca o fim e o chat de exemplo usa a mensagem real do WhatsApp', () => {
    const m = buildSiteModel(mk());
    const html = renderSite(m);
    expect(html).toContain('class="hl"');
    expect(html).toContain('class="wa-mock');
    expect(html).toContain(m.ctaMessage.slice(0, 20));
  });
  it('reaproveita a foto como fundo desfocado sem duplicar o arquivo mais de uma vez', () => {
    const html = renderSite(buildSiteModel(mk(), {}, { cta: png }));
    expect(html).toContain('--pic:url(');
    expect(html.split(png).length - 1).toBeLessThanOrEqual(2);
  });
  it('relata o que não foi confirmado, sem inventar', () => {
    const m = buildSiteModel(mk());
    expect(m.data.missing).toContain('horário');
    expect(m.warnings.join(' ')).toMatch(/Não confirmado/);
  });
  it('barbearia nunca busca foto de salão feminino', async () => {
    const { serviceQuery, heroQuery } = await import('../src/core/site/serviceImages');
    expect(serviceQuery('Corte', 'beleza', 0, 'barbearia')).toBe('barber haircut man');
    expect(heroQuery('beleza', 'Barbearia Alfa')).toBe('barbershop barber');
    expect(packFor('barbearia').id).toBe('barbearia');
    expect(packFor('barbearia').services.map((s) => s.title).join()).not.toMatch(/Unhas/);
  });
});

describe('conversão e coerência', () => {
  it('h1 destaca só uma palavra e há quebra de objeção + faixa de prova', () => {
    const html = renderSite(buildSiteModel(mk()));
    const h1 = html.match(/<h1[\s\S]*?<\/h1>/)![0];
    expect(h1.match(/class="hl"/g)).toHaveLength(1);
    expect(html).toContain('id="duvidas"');
    expect(html).toContain('class="proof"');
    expect(html).toContain('kbtn');
  });
  it('rankStock tira fotos fora do assunto e prioriza as coerentes', async () => {
    const { rankStock } = await import('../src/core/site/serviceImages');
    const r = rankStock([{ title: 'brain, machine, man' }, { title: 'dog, grooming, pet' }, { title: 'dog grooming salon' }, { title: 'cat' }], 'dog grooming');
    expect(r.map((x) => x.title)).toEqual(['dog, grooming, pet', 'dog grooming salon']);
  });
});

describe('coletor no celular', () => {
  it('usa o IP do PC quando o app abre por um IP da rede local', async () => {
    const { coletorBase } = await import('../src/data/api');
    expect(coletorBase('http://127.0.0.1:8790', '192.168.0.12')).toBe('http://192.168.0.12:8790');
    expect(coletorBase('http://127.0.0.1:8790', '10.0.0.5')).toBe('http://10.0.0.5:8790');
    expect(coletorBase('http://127.0.0.1:8790', 'localhost')).toBe('http://127.0.0.1:8790');
    expect(coletorBase('https://x.hf.space', '192.168.0.12')).toBe('https://x.hf.space');
  });
});

describe('newId sem crypto.randomUUID (celular pelo IP da rede)', () => {
  it('gera um id válido mesmo sem randomUUID', async () => {
    const { newId } = await import('../src/core/dedupe');
    const orig = crypto.randomUUID;
    (crypto as any).randomUUID = undefined;
    try {
      expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      (crypto as any).randomUUID = orig;
    }
  });
});

describe('confirmação de serviços', () => {
  it('barbearia só mostra sobrancelha se o Maps ou o site do cliente falar disso', () => {
    const sem = buildSiteModel(mk({ niche: 'barbearia' } as any));
    expect(sem.services.map((s) => s.title)).not.toContain('Sobrancelha');
    expect(sem.warnings.join(' ')).toMatch(/ocultos por falta de confirmação.*Sobrancelha/);
    const com = buildSiteModel(mk({ niche: 'barbearia', summary: 'Barbearia com corte, barba e design de sobrancelha.' } as any));
    expect(com.services.map((s) => s.title)).toContain('Sobrancelha');
  });
  it('texto do site atual também confirma', () => {
    const lead: any = mk({ niche: 'barbearia' } as any);
    lead.diagnosis = { ranAt: '', ok: true, checks: [], facts: { bodyText: 'Nossos serviços: corte, barba e acabamento no pezinho', h1: [] } };
    expect(buildSiteModel(lead).services.map((s) => s.title)).toContain('Acabamento e pezinho');
  });
});

describe('catálogo do WhatsApp Business', () => {
  const catLead = () => mk({ niche: 'barbearia', catalog: { at: '2026-10-27T00:00:00Z', items: [{ title: 'Corte degradê', text: 'Corte com máquina e tesoura.', price: 'R$ 45,00', image: 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==' }, { title: 'Barba completa', price: 'R$ 30,00' }] } } as any);
  it('usa os itens do catálogo como serviços confirmados, com preço e sem inventar', () => {
    const m = buildSiteModel(catLead());
    expect(m.services.map((s) => s.title)).toEqual(['Corte degradê', 'Barba completa']);
    expect(m.services[0].price).toBe('R$ 45,00');
    expect(m.warnings.join(' ')).toMatch(/catálogo do WhatsApp/);
    const html = renderSite(m);
    expect(html).toContain('class="price">R$ 45,00');
    expect(html).not.toContain('Sobrancelha');
  });
});

describe('avaliações como autoridade', () => {
  const rv = (text: string, rating = 5, author = 'Ana') => ({ author, rating, text, source: 'Google' as const });
  const lead = () => mk({ reviews: [
    rv('Atendimento excelente, todos muito educados e atenciosos com a gente.', 5, 'Ana'),
    rv('Fui muito bem atendido, o atendimento é ótimo e nunca atrasam o horário marcado.', 5, 'Bruno'),
    rv('Preço justo e serviço de qualidade, recomendo para quem quer valor justo.', 5, 'Carla'),
    rv('Gostei bastante do lugar.', 4, 'Dia'),
  ] } as any);
  it('conta temas reais e mostra a frase só com 2+ citações', async () => {
    const { reviewInsights, themeSentence } = await import('../src/core/site/reviews');
    const ins = reviewInsights(lead().reviews);
    expect(ins.themes[0].id).toBe('atendimento');
    expect(themeSentence(ins)).toMatch(/atendimento/);
    expect(reviewInsights([rv('Atendimento ótimo e muito bom mesmo.')]).themes).toEqual([]);
  });
  it('o site usa o tema na apresentação, na faixa de prova e cita depoimento real na objeção', () => {
    const m = buildSiteModel(lead());
    expect(m.intro).toMatch(/destacar o atendimento/);
    const html = renderSite(m);
    expect(html).toMatch(/Clientes destacam <b>o atendimento/);
    expect(html).toContain('class="obj-q"');
    expect(html).toContain('Preço justo e serviço de qualidade');
  });
  it('sem avaliações com texto não aparece nada disso', () => {
    const html = renderSite(buildSiteModel(mk()));
    expect(html).not.toContain('Clientes destacam');
    expect(html).not.toContain('class="obj-q"');
  });
});
