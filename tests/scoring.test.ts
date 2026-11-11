import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types';
import { leadFromRaw } from '../src/core/dedupe';
import { DEFAULT_SCORING, scoreLead } from '../src/core/scoring';
import { diagnosisFromFacts } from '../src/core/diagnosis';
import { extractHtmlFacts } from '../src/core/htmlFacts';
import { buildPitch } from '../src/core/pitch';
import { buildWhatsAppLink } from '../src/core/whatsapp';
import { buildBriefing, briefingToMarkdown, BRIEFING_SCHEMA } from '../src/core/briefing';

const src = { provider: 'osm' as const, externalId: 'n/1', collectedAt: '2026-01-01T00:00:00Z' };
const mk = (over: Partial<Lead> = {}): Lead => ({ ...leadFromRaw({ name: 'Sorriso Vivo', city: 'Curitiba', source: src }, 'dentista'), ...over });

describe('scoreLead', () => {
  it('empresa sem site, contatável e bem avaliada é quente', () => {
    const s = scoreLead(mk({ phone: '5541999998888', rating: 4.8, reviewCount: 120 }));
    expect(s.score).toBe(40 + 15 + 12);
    expect(s.temperature).toBe('quente');
    expect(s.signals.find((x) => x.id === 'sem_site')!.points).toBe(40);
  });
  it('sinais de site não pontuam quando não há site', () => {
    const s = scoreLead(mk());
    for (const id of ['sem_https', 'nao_responsivo', 'lento'] as const) expect(s.signals.find((x) => x.id === id)!.points).toBe(0);
  });
  it('site sem diagnóstico tem baixa confiança', () => {
    const s = scoreLead(mk({ website: 'https://sorriso.com.br' }));
    expect(s.signals.find((x) => x.id === 'nao_responsivo')!.state).toBe('desconhecido');
    expect(s.confidence).toBeLessThan(0.5);
  });
  it('diagnóstico com problemas aumenta score e confiança', () => {
    const html = '<html><head><title>Home</title></head><body><table><tr><td>oi</td></tr></table></body></html>';
    const diag = diagnosisFromFacts({
      requestedUrl: 'http://exemplo.com.br', finalUrl: 'http://exemplo.com.br/', httpStatus: 200, https: false, redirects: 0, responseMs: 3000,
      htmlBytes: 100, truncated: false, ...extractHtmlFacts(html), pagespeed: undefined,
    });
    const base = mk({ website: 'http://exemplo.com.br', phone: '5541999998888' });
    const before = scoreLead(base);
    const after = scoreLead({ ...base, diagnosis: diag });
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.confidence).toBeGreaterThan(before.confidence);
  });
  it('validação manual sobrescreve o automático', () => {
    const s = scoreLead(mk({ manualSignals: { sem_site: false } }));
    const sig = s.signals.find((x) => x.id === 'sem_site')!;
    expect(sig.points).toBe(0);
    expect(sig.origin).toBe('manual');
  });
  it('pesos são configuráveis e o score fica entre 0 e 100', () => {
    const cfg = { ...DEFAULT_SCORING, weights: { ...DEFAULT_SCORING.weights, sem_site: 0 } };
    expect(scoreLead(mk(), cfg).signals.find((x) => x.id === 'sem_site')!.points).toBe(0);
    const big = { ...DEFAULT_SCORING, weights: Object.fromEntries(Object.keys(DEFAULT_SCORING.weights).map((k) => [k, 100])) as any };
    expect(scoreLead(mk({ phone: '5541999998888' }), big).score).toBe(100);
  });
});

describe('pitch, WhatsApp e briefing', () => {
  const lead = mk({ phone: '5541999998888', rating: 4.8, reviewCount: 120 });
  const score = scoreLead(lead);
  const pitch = buildPitch(lead, score, { name: 'Ana', company: 'Estúdio Web' });

  it('gera abordagem específica e sem promessas', () => {
    expect(pitch.whatsappMessage).toContain('Sorriso Vivo');
    expect(pitch.whatsappMessage).toContain('Ana');
    expect(pitch.whatsappMessage).not.toContain('Curitiba');
    expect(pitch.whatsappMessage).toMatch(/Sem compromisso/);
    expect(pitch.whatsappMessage.length).toBeLessThan(330);
    expect(pitch.mainArgument).not.toMatch(/garant/i);
    expect(pitch.callScript.length).toBeGreaterThan(2);
    expect(pitch.nextAction).toBeTruthy();
  });

  it('monta link wa.me seguro', () => {
    const wa = buildWhatsAppLink(lead, 'Olá & tchau?');
    expect(wa.ok).toBe(true);
    expect(wa.url).toBe('https://wa.me/5541999998888?text=Ol%C3%A1%20%26%20tchau%3F');
    expect(wa.warning).toBeTruthy(); // número não declarado como WhatsApp
    expect(buildWhatsAppLink({ phone: '554133334444' }, 'x').warning).toMatch(/fixo/);
    expect(buildWhatsAppLink({}, 'x').ok).toBe(false);
  });

  it('briefing é versionado e com idempotência estável', () => {
    const b1 = buildBriefing(lead, score, pitch, new Date('2026-01-01'));
    const b2 = buildBriefing(lead, score, pitch, new Date('2026-02-01'));
    expect(b1.schema).toBe(BRIEFING_SCHEMA);
    expect(b1.idempotencyKey).toBe(b2.idempotencyKey);
    expect(b1.idempotencyKey).toMatch(/^lead-[\w-]+$/);
    expect(b1.constraints.doNotPublishWithoutApproval).toBe(true);
    expect(b1.proposal.sections.join(' ')).toMatch(/Especialidades/);
    const changed = buildBriefing({ ...lead, phone: '5541988887777' }, score, pitch);
    expect(changed.idempotencyKey).not.toBe(b1.idempotencyKey);
    expect(briefingToMarkdown(b1)).toContain('# Briefing de site — Sorriso Vivo');
  });
});
