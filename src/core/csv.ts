// Importação de CSV (ex.: exportações do agente atual / planilhas). Detecta separador e mapeia colunas por sinônimos.
import type { RawBusiness } from './types';
import { normText, normalizeBrPhone, normalizeWebsite } from './normalize';

export function detectDelimiter(firstLine: string): string {
  const counts: Array<[string, number]> = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Parser CSV com suporte a aspas, aspas escapadas ("") e quebras de linha dentro de campos. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = delimiter ?? detectDelimiter(src.split(/\r?\n/, 1)[0] ?? '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  name: ['name', 'nome', 'empresa', 'title', 'titulo', 'business name', 'razao social', 'nome fantasia'],
  phone: ['phone', 'telefone', 'fone', 'phone number', 'tel', 'celular', 'contato', 'phone_number', 'international phone'],
  whatsapp: ['whatsapp', 'wpp', 'zap'],
  website: ['website', 'site', 'url site', 'web', 'homepage', 'domain', 'dominio'],
  address: ['address', 'endereco', 'full address', 'endereco completo', 'logradouro'],
  neighborhood: ['bairro', 'neighborhood', 'district'],
  city: ['city', 'cidade', 'municipio'],
  state: ['state', 'estado', 'uf'],
  category: ['category', 'categoria', 'segmento', 'type', 'tipo', 'main category'],
  rating: ['rating', 'nota', 'avaliacao', 'stars', 'estrelas', 'review rating'],
  reviewCount: ['reviews', 'review count', 'avaliacoes', 'total reviews', 'num reviews', 'qtd avaliacoes', 'reviews count', 'user ratings total'],
  url: ['google maps url', 'maps url', 'place url', 'link', 'url', 'google url', 'source url'],
  externalId: ['place id', 'place_id', 'id', 'cid'],
  lat: ['lat', 'latitude'],
  lon: ['lng', 'lon', 'long', 'longitude'],
};

export type ColumnMap = Partial<Record<keyof typeof ALIASES, number>>;

export function mapHeaders(header: string[]): ColumnMap {
  const norm = header.map((h) => normText(h).replace(/_/g, ' '));
  const map: ColumnMap = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const idx = norm.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[field as keyof typeof ALIASES] = idx;
  }
  return map;
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export interface CsvImportResult {
  businesses: RawBusiness[];
  skipped: number;
  columns: ColumnMap;
  errors: string[];
}

export function csvToBusinesses(text: string, fileName = 'arquivo.csv', now = new Date().toISOString()): CsvImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length < 2) return { businesses: [], skipped: 0, columns: {}, errors: ['CSV vazio ou sem linhas de dados.'] };
  const columns = mapHeaders(rows[0]);
  if (columns.name == null) return { businesses: [], skipped: rows.length - 1, columns, errors: ['Coluna de nome não encontrada (use "nome" ou "name").'] };

  const businesses: RawBusiness[] = [];
  let skipped = 0;
  rows.slice(1).forEach((r, i) => {
    const get = (k: keyof typeof ALIASES) => (columns[k] != null ? (r[columns[k]!] ?? '').trim() : '');
    const name = get('name');
    if (!name) {
      skipped++;
      return;
    }
    const phone = normalizeBrPhone(get('phone'));
    const wa = get('whatsapp') ? normalizeBrPhone(get('whatsapp')) : undefined;
    const lat = num(get('lat'));
    const lon = num(get('lon'));
    const rating = num(get('rating'));
    businesses.push({
      name,
      category: get('category') || undefined,
      phone: phone.e164,
      phoneRaw: get('phone') || undefined,
      whatsapp: wa?.kind === 'celular' ? wa.e164 : undefined,
      website: normalizeWebsite(get('website')),
      address: get('address') || undefined,
      neighborhood: get('neighborhood') || undefined,
      city: get('city') || undefined,
      state: get('state') || undefined,
      lat: lat != null && Math.abs(lat) <= 90 ? lat : undefined,
      lon: lon != null && Math.abs(lon) <= 180 ? lon : undefined,
      rating: rating != null && rating >= 0 && rating <= 5 ? rating : undefined,
      reviewCount: num(get('reviewCount')) != null ? Math.round(num(get('reviewCount'))!) : undefined,
      source: {
        provider: 'csv',
        externalId: get('externalId') || `${fileName}#${i + 2}`,
        url: /^https?:\/\//i.test(get('url')) ? get('url') : undefined,
        collectedAt: now,
        query: fileName,
      },
    });
  });
  return { businesses, skipped, columns, errors };
}
