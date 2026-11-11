import { describe, expect, it } from 'vitest';
import type { RawBusiness } from '../src/core/types';
import { consolidate, leadFromRaw, sameBusiness } from '../src/core/dedupe';

const src = (provider: RawBusiness['source']['provider'], externalId: string) => ({ provider, externalId, collectedAt: '2026-01-01T00:00:00Z' });

describe('sameBusiness', () => {
  it('casa por domínio próprio', () => {
    const a: RawBusiness = { name: 'A', website: 'https://www.loja.com.br', source: src('osm', '1') };
    const b: RawBusiness = { name: 'Outro nome', website: 'http://loja.com.br/contato', source: src('csv', 'x') };
    expect(sameBusiness(a, b)).toBe('dominio');
  });
  it('não casa por domínio de rede social', () => {
    const a: RawBusiness = { name: 'A', website: 'https://instagram.com/a', source: src('osm', '1') };
    const b: RawBusiness = { name: 'B', website: 'https://instagram.com/b', source: src('osm', '2') };
    expect(sameBusiness(a, b)).toBeNull();
  });
  it('casa por telefone', () => {
    const a: RawBusiness = { name: 'A', phone: '5541999998888', source: src('osm', '1') };
    const b: RawBusiness = { name: 'B', whatsapp: '5541999998888', source: src('csv', '2') };
    expect(sameBusiness(a, b)).toBe('telefone');
  });
  it('casa por nome + cidade, mas não nome em cidades diferentes', () => {
    const a: RawBusiness = { name: 'Pet Feliz Ltda', city: 'Curitiba', source: src('osm', '1') };
    expect(sameBusiness(a, { name: 'Pet Feliz', city: 'curitiba', source: src('csv', '2') })).toBe('nome_local');
    expect(sameBusiness(a, { name: 'Pet Feliz', city: 'Londrina', source: src('csv', '3') })).toBeNull();
  });
  it('casa por nome + proximidade', () => {
    const a: RawBusiness = { name: 'Café X', lat: -25.4284, lon: -49.2733, source: src('osm', '1') };
    expect(sameBusiness(a, { name: 'Cafe X', lat: -25.4290, lon: -49.2735, source: src('csv', '2') })).toBe('nome_local');
    expect(sameBusiness(a, { name: 'Cafe X', lat: -25.50, lon: -49.30, source: src('csv', '3') })).toBeNull();
  });
});

describe('consolidate', () => {
  it('funde duplicados completando campos e registrando origens', () => {
    const existing = [leadFromRaw({ name: 'Loja A', phone: '5541999998888', source: src('osm', 'n/1') }, 'loja')];
    const r = consolidate(existing, [
      { name: 'Loja A', phone: '5541999998888', website: 'https://lojaa.com.br', rating: 4.5, reviewCount: 20, source: src('google_places', 'p1') },
      { name: 'Loja B', source: src('google_places', 'p2') },
    ], 'loja');
    expect(r.added).toBe(1);
    expect(r.merged).toBe(1);
    const a = r.leads.find((l) => l.name === 'Loja A')!;
    expect(a.website).toBe('https://lojaa.com.br');
    expect(a.reviewCount).toBe(20);
    expect(a.sources.map((s) => s.provider)).toEqual(['osm', 'google_places']);
  });
  it('não funde dados de demonstração com reais', () => {
    const existing = [leadFromRaw({ name: 'X', phone: '5541999998888', source: src('demo', 'd') }, 'n')];
    const r = consolidate(existing, [{ name: 'X', phone: '5541999998888', source: src('osm', '1') }], 'n');
    expect(r.added).toBe(1);
    expect(r.leads.filter((l) => l.isDemo)).toHaveLength(1);
  });
  it('é idempotente para a mesma origem', () => {
    const raw: RawBusiness = { name: 'Y', source: src('osm', 'node/9') };
    const first = consolidate([], [raw], 'n');
    const second = consolidate(first.leads, [raw], 'n');
    expect(second.leads).toHaveLength(1);
    expect(second.leads[0].sources).toHaveLength(1);
  });
});
