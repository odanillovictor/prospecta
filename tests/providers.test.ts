import { describe, expect, it, vi } from 'vitest';
import { csvToBusinesses, parseCsv } from '../src/core/csv';
import { buildOverpassQuery, osmElementToBusiness, searchOsm } from '../src/core/providers/osm';
import { osmTagsForNiche } from '../src/core/providers/osmNiches';
import { placeToBusiness, searchGooglePlaces } from '../src/core/providers/googlePlaces';
import { validatePublicUrl, validateSearch } from '../src/core/validation';
import { pickWikimedia } from '../src/core/providers/wikimedia';
import { stockCredit } from '../src/core/providers/openverse';

const geo = { displayName: 'Curitiba, PR', lat: -25.43, lon: -49.27, osmType: 'relation', osmId: 297514, city: 'Curitiba', state: 'Paraná' };

describe('OSM', () => {
  it('mapeia nichos em português para tags', () => {
    expect(osmTagsForNiche('Dentista')).toContainEqual(['amenity', 'dentist']);
    expect(osmTagsForNiche('salão de beleza')).toContainEqual(['shop', 'hairdresser']);
    expect(osmTagsForNiche('consultoria em drones')).toEqual([]);
  });
  it('monta query Overpass por área e sanitiza o termo', () => {
    const q = buildOverpassQuery('dentista"];out;', geo, 50);
    expect(q).toContain(`area(id:${3600000000 + 297514})`);
    expect(q).toContain('nwr["amenity"="dentist"]["name"](area.a);');
    expect(q).not.toContain('"];out;"');
    expect(q).toContain('out tags center qt 50;');
  });
  it('usa raio quando o local não é uma relação', () => {
    expect(buildOverpassQuery('padaria', { ...geo, osmType: 'node' }, 10)).toContain('(around:5000,-25.43,-49.27)');
  });
  it('converte elemento OSM em empresa normalizada', () => {
    const b = osmElementToBusiness({ type: 'node', id: 7, lat: -25.4, lon: -49.2, tags: { name: 'Dr. Sorriso', amenity: 'dentist', phone: '+55 41 3333-4444', 'contact:whatsapp': '+55 41 99999-8888', 'addr:street': 'Rua X', 'addr:housenumber': '10', 'addr:suburb': 'Batel' } }, geo, 'q', new Date('2026-01-01'))!;
    expect(b.phone).toBe('554133334444');
    expect(b.whatsapp).toBe('5541999998888');
    expect(b.website).toBeUndefined();
    expect(b.city).toBe('Curitiba');
    expect(b.neighborhood).toBe('Batel');
    expect(b.source.url).toBe('https://www.openstreetmap.org/node/7');
  });
  it('searchOsm usa Nominatim + Overpass via fetch injetado', async () => {
    const fetchFn = vi.fn(async (url: any, _init?: RequestInit) => {
      if (String(url).includes('nominatim')) return new Response(JSON.stringify([{ display_name: 'Curitiba', lat: '-25.4', lon: '-49.2', osm_type: 'relation', osm_id: 1, address: { city: 'Curitiba' } }]));
      return new Response(JSON.stringify({ elements: [{ type: 'way', id: 2, center: { lat: -25.4, lon: -49.2 }, tags: { name: 'Padaria Boa', shop: 'bakery' } }, { type: 'node', id: 3, tags: {} }] }));
    });
    const r = await searchOsm('padaria', 'Curitiba', 10, { fetchFn: fetchFn as any, userAgent: 'test' });
    expect(r.results).toHaveLength(1);
    expect(r.outcome.status).toBe('ok');
    expect((fetchFn.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'User-Agent': 'test' });
  });
  it('faz failover quando um servidor Overpass está sobrecarregado', async () => {
    const calls: string[] = [];
    const fetchFn = async (url: any) => {
      calls.push(String(url));
      if (String(url).includes('nominatim')) return new Response(JSON.stringify([{ lat: '1', lon: '1', osm_type: 'relation', osm_id: 1 }]));
      if (String(url).includes('primeiro')) return new Response('busy', { status: 502 });
      return new Response(JSON.stringify({ elements: [{ type: 'node', id: 1, tags: { name: 'Ok' } }] }));
    };
    const r = await searchOsm('padaria', 'X', 5, { fetchFn: fetchFn as any, userAgent: 't', overpassUrls: ['https://primeiro.example/api', 'https://segundo.example/api'] });
    expect(r.results).toHaveLength(1);
    expect(calls.filter((c) => c.includes('example'))).toHaveLength(2);
  });
  it('aciona o segundo servidor se o primeiro demorar, usa o mais rápido e cancela o lento', async () => {
    let slowAborted = false;
    const fetchFn = (url: any, init?: RequestInit) => {
      if (String(url).includes('nominatim')) return Promise.resolve(new Response(JSON.stringify([{ lat: '1', lon: '1', osm_type: 'relation', osm_id: 1 }])));
      if (String(url).includes('lento')) {
        return new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => { slowAborted = true; rej(new Error('abort')); }));
      }
      return Promise.resolve(new Response(JSON.stringify({ elements: [{ type: 'node', id: 1, tags: { name: 'Rápido' } }] })));
    };
    const t = Date.now();
    const r = await searchOsm('padaria', 'X', 5, { fetchFn: fetchFn as any, userAgent: 't', hedgeMs: 30, overpassUrls: ['https://lento.example/api', 'https://rapido.example/api'] });
    expect(r.results[0].name).toBe('Rápido');
    expect(Date.now() - t).toBeLessThan(1000);
    expect(slowAborted).toBe(true);
  });
  it('erro claro quando todos os servidores falham', async () => {
    const fetchFn = async (url: any) => String(url).includes('nominatim')
      ? new Response(JSON.stringify([{ lat: '1', lon: '1', osm_type: 'relation', osm_id: 1 }]))
      : new Response('busy', { status: 504 });
    await expect(searchOsm('a', 'b', 5, { fetchFn: fetchFn as any, userAgent: 't', overpassUrls: ['https://a.example/x', 'https://b.example/x'] })).rejects.toThrow(/a\.example: HTTP 504; b\.example: HTTP 504/);
  });
  it('reporta local não encontrado sem lançar erro', async () => {
    const r = await searchOsm('padaria', 'Lugar Nenhum', 10, { fetchFn: (async () => new Response('[]')) as any, userAgent: 't' });
    expect(r.outcome.status).toBe('sem_resultados');
  });
});

describe('Google Places (contrato documentado, com fetch simulado)', () => {
  it('converte place e ignora fechados', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ places: [
      { id: 'abc', displayName: { text: 'Pet Feliz' }, nationalPhoneNumber: '(41) 99999-8888', rating: 4.6, userRatingCount: 80, googleMapsUri: 'https://maps.google.com/?cid=1', addressComponents: [{ longText: 'Curitiba', types: ['administrative_area_level_2'] }, { longText: 'Paraná', shortText: 'PR', types: ['administrative_area_level_1'] }] },
      { id: 'zzz', displayName: { text: 'Fechada' }, businessStatus: 'CLOSED_PERMANENTLY' },
    ] })));
    const r = await searchGooglePlaces('pet shop', 'Curitiba', 20, { fetchFn: fetchFn as any, apiKey: 'k' });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ phone: '5541999998888', city: 'Curitiba', state: 'PR', reviewCount: 80 });
    const init = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init[1].headers as Record<string, string>)['X-Goog-FieldMask']).toContain('places.websiteUri');
  });
  it('não vaza o corpo do erro', async () => {
    const fetchFn = async () => new Response('{"error":"API key xyz invalid"}', { status: 403 });
    await expect(searchGooglePlaces('a', 'b', 5, { fetchFn: fetchFn as any, apiKey: 'k' })).rejects.toThrow(/HTTP 403/);
    await expect(searchGooglePlaces('a', 'b', 5, { fetchFn: fetchFn as any, apiKey: 'k' })).rejects.not.toThrow(/xyz/);
  });
  it('placeToBusiness exige nome', () => {
    expect(placeToBusiness({ id: '1' }, 'q', new Date())).toBeNull();
  });
});

describe('CSV', () => {
  it('lida com aspas, ; e quebras de linha', () => {
    expect(parseCsv('a;b\n"x;1";"linha\n2"\n')).toEqual([['a', 'b'], ['x;1', 'linha\n2']]);
  });
  it('mapeia colunas em português e inglês', () => {
    const csv = 'Nome,Telefone,Site,Cidade,Nota,Avaliações,Place ID\n"Loja ""A""",(41) 99999-8888,loja.com.br,Curitiba,"4,7",35,abc\n,sem nome,,,,,\n';
    const r = csvToBusinesses(csv, 'leads.csv');
    expect(r.businesses).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.businesses[0]).toMatchObject({ name: 'Loja "A"', phone: '5541999998888', website: 'http://loja.com.br', rating: 4.7, reviewCount: 35, city: 'Curitiba' });
    expect(r.businesses[0].source.externalId).toBe('abc');
  });
  it('erro claro sem coluna de nome', () => {
    expect(csvToBusinesses('a,b\n1,2').errors[0]).toMatch(/nome/);
  });
});

describe('validação', () => {
  it('busca', () => {
    expect(validateSearch({ niche: 'd', location: 'Curitiba' }).ok).toBe(false);
    const v = validateSearch({ niche: ' <dentista> ', location: 'Curitiba', providers: ['osm', 'hack'], limit: 9999 });
    expect(v.ok && v.value).toMatchObject({ niche: 'dentista', providers: ['osm'], limit: 10 });
  });
  it.each(['http://localhost', 'http://127.0.0.1', 'http://10.0.0.1', 'http://192.168.0.10', 'http://169.254.169.254', 'ftp://x.com', 'http://x.com:8080', 'http://user:pw@x.com', 'http://[::1]', 'http://intranet'])('bloqueia %s', (u) => {
    expect(validatePublicUrl(u).ok).toBe(false);
  });
  it('aceita sites públicos e adiciona https', () => {
    const v = validatePublicUrl('loja.com.br');
    expect(v.ok && v.value.toString()).toBe('https://loja.com.br/');
  });
});

describe('fotos ilustrativas (filtro)', () => {
  it('descarta letreiros, arquivo histórico e títulos-código', async () => {
    const { pickStock } = await import('../src/core/providers/openverse');
    const ok = { width: 1024, height: 683, url: 'https://live.staticflickr.com/65535/123_abc_b.jpg', title: 'dental chair', tags: [{ name: 'dentist' }] };
    const r = pickStock([
      ok,
      { ...ok, url: 'https://live.staticflickr.com/1/1_a_b.jpg', title: 'Kathmandu Dental Office', tags: [{ name: 'text' }, { name: 'typography' }] },
      { ...ok, url: 'https://live.staticflickr.com/1/2_a_b.jpg', title: 'Dental Clinic and equipment, 1950', tags: [{ name: 'archives' }] },
      { ...ok, url: 'https://live.staticflickr.com/1/3_a_b.jpg', title: '83006075PS627_India_Plac.JP', tags: [] },
    ]);
    expect(r.map((p) => p.title)).toEqual(['dental chair']);
  });
});

describe('Wikimedia Commons (fallback sem chave)', () => {
  const page = (index: number, title: string, w: number, h: number, license: string, mime = 'image/jpeg') => ({
    index, title: `File:${title}`,
    imageinfo: [{ width: w, height: h, mime, thumburl: `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${index}.jpg/1280px-${index}.jpg`, descriptionurl: 'https://commons.wikimedia.org/wiki/File:x', extmetadata: { LicenseShortName: { value: license }, Artist: { value: '<a href="#">Ana Souza</a>' } } }],
  });

  it('aceita foto horizontal grande com licença livre e credita o autor', () => {
    const out = pickWikimedia([page(1, 'Dental clinic interior.jpg', 4000, 2600, 'CC BY-SA 4.0')], 'dental clinic');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'wikimedia', creator: 'Ana Souza', width: 1280 });
    expect(stockCredit(out[0])).toBe('Ana Souza (Wikimedia Commons, BY-SA 4.0)');
  });

  it('descarta retrato, arquivo histórico, PNG, pequena, vertical e licença não livre', () => {
    const q = 'dentist';
    expect(pickWikimedia([page(1, 'Dentist portrait.jpg', 4000, 2600, 'CC BY 4.0')], q)).toHaveLength(0);
    expect(pickWikimedia([page(2, 'Dentist 1964.jpg', 4000, 2600, 'CC BY 4.0')], q)).toHaveLength(0);
    expect(pickWikimedia([page(3, 'Dentist office.png', 4000, 2600, 'CC BY 4.0', 'image/png')], q)).toHaveLength(0);
    expect(pickWikimedia([page(4, 'Dentist office.jpg', 900, 600, 'CC BY 4.0')], q)).toHaveLength(0);
    expect(pickWikimedia([page(5, 'Dentist office.jpg', 2000, 3000, 'CC BY 4.0')], q)).toHaveLength(0);
    expect(pickWikimedia([page(6, 'Dentist office.jpg', 4000, 2600, 'All rights reserved')], q)).toHaveLength(0);
  });

  it('descarta título com lugar/negócio/pessoa própria', () => {
    expect(pickWikimedia([page(1, 'Aspen Dental clinic in Franklin.jpg', 4000, 2600, 'CC0')], 'dental clinic')).toHaveLength(0);
    expect(pickWikimedia([page(2, "Henry Clay's law office.jpg", 4000, 2600, 'CC0')], 'law office')).toHaveLength(0);
    expect(pickWikimedia([page(4, 'Korolyov Dental Clinic.jpg', 4000, 2600, 'CC0')], 'dental clinic')).toHaveLength(0);
    expect(pickWikimedia([page(5, 'Dental clinic chair.jpg', 4000, 2600, 'CC0')], 'dental clinic')).toHaveLength(1);
    expect(pickWikimedia([page(3, 'Beauty salon in iran.jpg', 4000, 2600, 'CC0')], 'beauty salon')).toHaveLength(1);
  });

  it('exige relevância com a consulta', () => {
    expect(pickWikimedia([page(1, 'Mountain lake.jpg', 4000, 2600, 'CC0')], 'dentist')).toHaveLength(0);
  });
});

describe('serviceQuery por segmento', () => {
  it('Restaurações num dentista não vira restaurante', async () => {
    const { serviceQuery } = await import('../src/core/site/serviceImages');
    expect(serviceQuery('Restaurações', 'odonto')).toBe('dental filling dentist');
    expect(serviceQuery('Avaliação e prevenção', 'odonto')).toBe('dental cleaning dentist');
    expect(serviceQuery('Restaurante e delivery', 'alimentacao')).toBe('food delivery');
    expect(serviceQuery('Tosa', 'pet')).toBe('dog grooming');
  });
});
