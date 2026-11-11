import { describe, expect, it } from 'vitest';
import { extractHtmlFacts } from '../src/core/htmlFacts';
import { buildChecks } from '../src/core/diagnosis';
import type { SiteFacts } from '../src/core/types';

const GOOD = `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Clínica Sorriso | Dentista no Batel, Curitiba</title>
<meta name="description" content="Implantes e clareamento no Batel.">
<meta property="og:title" content="Clínica Sorriso">
<script type="application/ld+json">{"@type":"Dentist","name":"x"}</script>
</head><body>
<h1>Dentista no Batel com atendimento humanizado</h1><h2>Serviços</h2><h2>Depoimentos</h2>
<a href="https://wa.me/5541999998888">Agende pelo WhatsApp</a> <a href="tel:+5541333344444">(41) 3333-4444</a>
<form><input></form><p>Endereço: Rua X, 10 — Batel. Horário de funcionamento: 8h às 18h. Veja as avaliações dos clientes.</p>
<img src="a.jpg" alt="Equipe"><footer>© 2025 Clínica Sorriso</footer></body></html>`;

const OLD = `<html><head><title>Home</title></head><body>
<table><tr><td><table><tr><td><table><tr><td>Bem vindo</td></tr></table></td></tr></table></td></tr></table>
<img src="x.gif"><p>Copyright 2014</p></body></html>`;

function facts(html: string, over: Partial<SiteFacts> = {}): SiteFacts {
  return {
    requestedUrl: 'https://x.com.br', finalUrl: 'https://x.com.br/', httpStatus: 200, https: true, redirects: 0,
    responseMs: 400, htmlBytes: html.length, truncated: false, ...extractHtmlFacts(html), pagespeed: undefined, ...over,
  };
}

describe('extractHtmlFacts', () => {
  it('extrai fatos de um site bem feito', () => {
    const f = extractHtmlFacts(GOOD);
    expect(f.title).toContain('Clínica Sorriso');
    expect(f.metaDescription).toContain('Implantes');
    expect(f.hasViewport).toBe(true);
    expect(f.h1).toHaveLength(1);
    expect(f.h2Count).toBe(2);
    expect(f.hasWhatsAppLink).toBe(true);
    expect(f.hasTelLink).toBe(true);
    expect(f.formCount).toBe(1);
    expect(f.hasSchemaLocalBusiness).toBe(true);
    expect(f.copyrightYear).toBe(2025);
    expect(f.ctaKeywords).toContain('agende');
    expect(f.socialProofKeywords.length).toBeGreaterThan(0);
    expect(f.imgWithoutAlt).toBe(0);
  });
  it('detecta sinais de site antigo', () => {
    const f = extractHtmlFacts(OLD);
    expect(f.hasViewport).toBe(false);
    expect(f.usesTablesForLayout).toBe(true);
    expect(f.copyrightYear).toBe(2014);
    expect(f.h1).toHaveLength(0);
  });
});

describe('buildChecks', () => {
  const now = new Date('2026-10-01');
  it('separa automático, inferido e manual', () => {
    const c = buildChecks(facts(GOOD), now);
    expect(new Set(c.map((x) => x.origin))).toEqual(new Set(['automatico', 'inferido', 'manual']));
    expect(c.filter((x) => x.origin === 'manual').every((x) => x.result === 'nao_verificado')).toBe(true);
  });
  it('site bom não tem problemas automáticos críticos', () => {
    const c = buildChecks(facts(GOOD), now);
    expect(c.filter((x) => x.origin === 'automatico' && x.result === 'problema')).toEqual([]);
  });
  it('site antigo acumula problemas', () => {
    const c = buildChecks(facts(OLD, { https: false, responseMs: 4000 }), now);
    const byId = Object.fromEntries(c.map((x) => [x.id, x.result]));
    expect(byId.https).toBe('problema');
    expect(byId.viewport).toBe('problema');
    expect(byId.description).toBe('problema');
    expect(byId.velocidade).toBe('atencao');
    expect(byId.desatualizado).toBe('problema');
    expect(byId.whatsapp).toBe('problema');
  });
  it('usa PageSpeed quando disponível', () => {
    const c = buildChecks(facts(GOOD, { pagespeed: { performance: 35, strategy: 'mobile' } }), now);
    const v = c.find((x) => x.id === 'velocidade')!;
    expect(v.result).toBe('problema');
    expect(v.detail).toContain('PageSpeed');
  });
});
