import { describe, expect, it } from 'vitest';
import { domainOf, isNonOwnSite, nameKey, normalizeBrPhone, normalizeWebsite } from '../src/core/normalize';

describe('normalizeBrPhone', () => {
  it.each([
    ['+55 (41) 9 9999-8888', '5541999998888', 'celular'],
    ['(41) 99999-8888', '5541999998888', 'celular'],
    ['041 3333-4444', '554133334444', 'fixo'],
    ['(41) 3333-4444', '554133334444', 'fixo'],
    ['0 15 41 99999-8888', '5541999998888', 'celular'],
    ['(41) 9999-8888', '5541999998888', 'celular'], // celular antigo ganha o 9
    ['5541999998888', '5541999998888', 'celular'],
  ])('%s → %s', (input, e164, kind) => {
    const r = normalizeBrPhone(input);
    expect(r.e164).toBe(e164);
    expect(r.kind).toBe(kind);
  });

  it('formata para exibição', () => {
    expect(normalizeBrPhone('41999998888').display).toBe('(41) 99999-8888');
  });

  it('rejeita lixo e números especiais', () => {
    expect(normalizeBrPhone('123').e164).toBeUndefined();
    expect(normalizeBrPhone('0800 123 4567').kind).toBe('especial');
    expect(normalizeBrPhone('').kind).toBe('invalido');
  });
});

describe('sites', () => {
  it('normaliza e identifica domínio', () => {
    expect(normalizeWebsite('www.exemplo.com.br/')).toBe('http://www.exemplo.com.br');
    expect(domainOf('https://www.Exemplo.com.br/x')).toBe('exemplo.com.br');
    expect(normalizeWebsite('não tem')).toBeUndefined();
  });
  it('rede social não conta como site próprio', () => {
    expect(isNonOwnSite('https://instagram.com/loja')).toBe(true);
    expect(isNonOwnSite('https://linktr.ee/loja')).toBe(true);
    expect(isNonOwnSite('https://loja.com.br')).toBe(false);
  });
});

describe('nameKey', () => {
  it('ignora acentos, sufixos societários e pontuação', () => {
    expect(nameKey('Clínica Sorriso LTDA.')).toBe(nameKey('clinica sorriso'));
  });
});
