// Normalização determinística de textos, telefones, URLs e endereços (foco Brasil).

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Minúsculas, sem acentos, sem pontuação, espaços colapsados. */
export function normText(s: string | undefined | null): string {
  if (!s) return '';
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NAME_NOISE = new Set([
  'ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'e', 'de', 'da', 'do', 'das', 'dos', 'the',
]);

/** Chave de nome para deduplicação: remove sufixos societários e palavras vazias. */
export function nameKey(name: string): string {
  return normText(name)
    .split(' ')
    .filter((w) => w && !NAME_NOISE.has(w))
    .join(' ');
}

export type PhoneKind = 'celular' | 'fixo' | 'especial' | 'invalido';

export interface NormalizedPhone {
  /** Formato E.164 sem "+" (ex.: 5541999998888). Ausente para números especiais/invalidos. */
  e164?: string;
  kind: PhoneKind;
  display: string;
}

/**
 * Normaliza telefones brasileiros. Aceita entradas como "+55 (41) 9 9999-8888",
 * "041 3333-4444", "(41) 9999-8888" (celular antigo de 8 dígitos ganha o 9).
 */
export function normalizeBrPhone(raw: string | undefined | null): NormalizedPhone {
  const input = (raw ?? '').trim();
  let d = input.replace(/\D/g, '');
  if (!d) return { kind: 'invalido', display: input };

  if (/^(0800|0300|0500|0900|400[0-9])/.test(d)) {
    return { kind: 'especial', display: input };
  }
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith('0')) {
    // "0" + DDD + número (11/12 dígitos) ou "0" + operadora (2) + DDD + número (13/14 dígitos)
    d = d.length >= 13 ? d.slice(3) : d.slice(1);
  }

  if (d.length !== 10 && d.length !== 11) return { kind: 'invalido', display: input };
  const ddd = d.slice(0, 2);
  if (!/^[1-9][1-9]$/.test(ddd)) return { kind: 'invalido', display: input };
  let local = d.slice(2);

  if (local.length === 8 && /^[6-9]/.test(local)) local = '9' + local; // celular pré-2016
  let kind: PhoneKind;
  if (local.length === 9 && local.startsWith('9')) kind = 'celular';
  else if (local.length === 8 && /^[2-5]/.test(local)) kind = 'fixo';
  else return { kind: 'invalido', display: input };

  const display =
    kind === 'celular'
      ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
      : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  return { e164: `55${ddd}${local}`, kind, display };
}

export function formatPhone(e164: string | undefined): string {
  if (!e164) return '';
  return normalizeBrPhone(e164).display || e164;
}

/** Normaliza URL de site. Retorna undefined para entradas que não são sites próprios. */
export function normalizeWebsite(raw: string | undefined | null): string | undefined {
  let s = (raw ?? '').trim();
  if (!s) return undefined;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.')) return undefined;
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

/** Domínios que NÃO contam como site próprio (redes sociais, agregadores, linktree...). */
const NOT_OWN_SITE = [
  'facebook.com', 'instagram.com', 'fb.com', 'wa.me', 'whatsapp.com', 'api.whatsapp.com',
  'linktr.ee', 'linktree.com', 'tiktok.com', 'twitter.com', 'x.com', 'youtube.com',
  'google.com', 'goo.gl', 'g.page', 'business.site', 'ifood.com.br', 'doctoralia.com.br',
  'booksy.com', 'beacons.ai', 'bio.link',
];

export function domainOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** true quando a URL aponta para rede social/agregador e não para um site próprio. */
export function isNonOwnSite(url: string | undefined): boolean {
  const d = domainOf(url);
  if (!d) return false;
  return NOT_OWN_SITE.some((x) => d === x || d.endsWith('.' + x));
}

/** Monta endereço legível a partir de partes, ignorando vazios e repetições. */
export function joinAddress(parts: Array<string | undefined>): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = p?.trim();
    if (!v) continue;
    const k = normText(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.length ? out.join(', ') : undefined;
}

/** Distância aproximada em metros (haversine). */
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
