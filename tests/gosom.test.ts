import { describe, expect, it } from 'vitest';
import { formatHours, gosomToBusinesses, splitBrAddress, to24h } from '../src/core/providers/gosom';
import { mergeRawList } from '../src/core/dedupe';
import { imageCandidates, brandDraft } from '../src/core/site/clientAssets';
import { leadFromRaw } from '../src/core/dedupe';

// Formato real observado no coletor (modo rápido), 24/10/2026.
const ITEM = {
  title: 'OdontoBlumenau', categories: ['Dental clinic'], address: 'R. XV de Novembro, 866 - Centro, Blumenau - SC, 89010-000',
  open_hours: { Monday: ['8 AM–6 PM'], Tuesday: ['8 AM–6 PM'], Wednesday: ['8 AM–6 PM'], Thursday: ['8 AM–6 PM'], Friday: ['8 AM–6 PM'], Saturday: ['8 AM–12 PM'], Sunday: ['Closed'] },
  web_site: 'https://campanhas.exemplo.com.br/odonto', phone: '(47)99164-1110', review_count: '232', review_rating: '4.4',
  latitude: '-26.9199867', longtitude: '-49.0649921', data_id: '0x94df18c1bf1ccc4f:0xa02f4856f08d3c1d', link: '', images: null, thumbnail: '',
  complete_address: { borough: '', street: '', city: '', postal_code: '', state: '', country: '' },
};

describe('coletor gosom', () => {
  it('converte horário para 24 h em português e agrupa dias iguais', () => {
    expect(to24h('8 AM–6 PM')).toBe('08:00–18:00');
    expect(to24h('1:30–7 PM')).toBe('13:30–19:00');
    expect(to24h('12 PM–2 PM')).toBe('12:00–14:00');
    expect(to24h('Open 24 hours')).toBe('24 horas');
    expect(formatHours(ITEM.open_hours)).toBe('Seg–Sex: 08:00–18:00 · Sáb: 08:00–12:00 · Dom: fechado');
  });
  it('separa bairro, cidade e UF do endereço', () => {
    expect(splitBrAddress(ITEM.address)).toEqual({ neighborhood: 'Centro', city: 'Blumenau', state: 'SC' });
  });
  it('gera empresa normalizada com link do Maps e origem', () => {
    const [b] = gosomToBusinesses([ITEM, { title: '' }], 'dentista em Blumenau SC', new Date('2026-10-24'));
    expect(b).toMatchObject({
      name: 'OdontoBlumenau', category: 'Clínica odontológica', phone: '5547991641110', rating: 4.4, reviewCount: 232,
      city: 'Blumenau', state: 'SC', neighborhood: 'Centro', website: 'https://campanhas.exemplo.com.br/odonto',
    });
    expect(b.lon).toBeCloseTo(-49.065, 2);
    expect(b.source).toMatchObject({ provider: 'gmaps', externalId: ITEM.data_id, url: `https://www.google.com/maps/place/data=!4m2!3m1!1s${ITEM.data_id}` });
    expect(b.hours).toContain('Seg–Sex');
  });
  it('fotos do Maps (modo completo) viram candidatas para o topo do site', () => {
    const [b] = gosomToBusinesses([{ ...ITEM, thumbnail: 'https://lh5.googleusercontent.com/p/abc=w800', images: [{ title: 'Fachada', image: 'https://lh5.googleusercontent.com/p/def=w1200' }] }], 'q');
    expect(b.imageUrls).toEqual(['https://lh5.googleusercontent.com/p/abc=w800', 'https://lh5.googleusercontent.com/p/def=w1200']);
    const lead = leadFromRaw(b, 'dentista');
    expect(imageCandidates(lead)[0]).toMatchObject({ attribution: 'Google Maps', suggested: 'hero' });
    expect(brandDraft(lead).heroSrc?.value).toContain('abc');
  });
  it('junta o mesmo negócio vindo do Maps e do OSM', () => {
    const [maps] = gosomToBusinesses([ITEM], 'q');
    const osm = { name: 'Odonto Blumenau', phone: '5547991641110', source: { provider: 'osm' as const, externalId: 'node/1', collectedAt: '' } };
    const merged = mergeRawList([maps, osm]);
    expect(merged).toHaveLength(1);
    expect(merged[0].rating).toBe(4.4);
  });
});
