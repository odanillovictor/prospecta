import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types';
import { leadFromRaw } from '../src/core/dedupe';
import { buildSiteModel, renderSite } from '../src/core/site/render';

const src = { provider: 'osm' as const, externalId: 'n/1', collectedAt: '2026-01-01T00:00:00Z' };
const mk = (over: Partial<Lead> = {}): Lead => ({
  ...leadFromRaw({ name: 'Espaço Gioconda', city: 'São José', neighborhood: 'Campinas', phone: '5548996235697', source: src }, 'psicólogo'),
  ...over,
});
const review = { author: 'Ana Paula', rating: 5, text: 'Atendimento acolhedor e muito cuidadoso.', source: 'Google' as const };
const premium = (lead: Lead, extra = {}) => renderSite(buildSiteModel(lead, { layout: 'premium', ...extra }));

describe('layout premium', () => {
  it('só ativa quando pedido; o padrão do núcleo continua clássico', () => {
    expect(renderSite(buildSiteModel(mk()))).not.toContain('class="hero light"');
    expect(premium(mk())).toContain('class="hero light"');
  });

  it('tem as seções da estrutura, um h1 e barra de contato com texto por seção', () => {
    const html = premium(mk());
    for (const id of ['sobre', 'servicos', 'comofunciona', 'duvidas', 'contato']) expect(html).toContain(`id="${id}"`);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('data-cta-live');
    expect(html).toContain('data-cta=');
    expect(html).toContain('class="chat-mock');
    expect(html).toContain('https://wa.me/5548996235697?text=');
  });

  it('depoimentos do Google só aparecem com avaliações reais, no estilo do Google', () => {
    expect(premium(mk())).not.toContain('id="depoimentos"');
    const html = premium(mk({ reviews: [review], rating: 4.9, reviewCount: 12 }));
    expect(html).toContain('id="depoimentos"');
    expect(html).toContain('Atendimento acolhedor');
    expect(html).toContain('Ana Paula');
    expect(html).toContain('class="gst"'); // estrelas do Google
    expect(html).toContain('fill="#4285F4"'); // logo do Google
    // ordenadas pelas melhores avaliações
    const ord = premium(mk({ reviews: [{ ...review, author: 'Ruim', rating: 3 }, { ...review, author: 'Ótima', rating: 5 }] }));
    expect(ord.indexOf('Ótima')).toBeLessThan(ord.indexOf('Ruim'));
  });

  it('conversa do passo 1 é animada e termina com botão para mandar a mensagem', () => {
    const html = premium(mk());
    expect(html).toContain('data-chat');
    expect(html).toContain('class="cm-txt"');
    expect(html).toContain('cm-cta');
    expect(html).toContain('Mandar sua mensagem agora');
    expect(html).toContain('Exemplo ilustrativo de conversa');
  });

  it('depoimentos em carrossel com cartões do Google', () => {
    const html = premium(mk({ reviews: [review, { ...review, author: 'Bia' }], rating: 5, reviewCount: 2 }));
    expect(html).toContain('data-gcar');
    expect(html.match(/class="gc"/g)).toHaveLength(2);
    expect(html).not.toContain('class="marq"');
  });

  it('alternância Presencial/Online só com online ligado', () => {
    expect(premium(mk())).not.toContain('class="seg"');
    const html = premium(mk(), { online: true });
    expect(html).toContain('class="seg"');
    expect(html).toContain('vc-bar');
  });

  it('sem fotos usa monograma (nada quebrado) e escapa HTML', () => {
    const html = premium(mk({ name: 'Foo <b>Bar</b>' }));
    expect(html).toContain('mono-arch');
    expect(html).not.toContain('<b>Bar</b></h1>');
    expect(html).not.toContain('loading="lazy"');
  });
});
