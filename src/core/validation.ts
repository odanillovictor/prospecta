// Validação de entradas — usada no app (feedback imediato) e repetida no servidor (fonte da verdade).
import type { ProviderId, SearchRequest } from './types';

const SEARCH_PROVIDERS: ProviderId[] = ['osm', 'google_places'];

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function cleanText(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function validateSearch(input: unknown): Validated<Required<SearchRequest>> {
  const o = (input ?? {}) as Record<string, unknown>;
  const niche = cleanText(o.niche, 80);
  const location = cleanText(o.location, 120);
  if (niche.length < 2) return { ok: false, error: 'Informe o nicho (mín. 2 caracteres).' };
  if (location.length < 2) return { ok: false, error: 'Informe cidade, região ou bairro.' };
  const providers = Array.isArray(o.providers)
    ? (o.providers.filter((p) => SEARCH_PROVIDERS.includes(p as ProviderId)) as ProviderId[])
    : ['osm' as ProviderId];
  if (!providers.length) return { ok: false, error: 'Selecione ao menos uma fonte de dados.' };
  const limitNum = Number(o.limit ?? 10);
  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(10, Math.round(limitNum))) : 10;
  return { ok: true, value: { niche, location, providers: [...new Set(providers)], limit } };
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.localhost|.*\.internal|.*\.lan|metadata\.google\.internal)$/i;

function isPrivateIPv4(h: string): boolean {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/** Garante que a URL a ser diagnosticada é um site público (proteção contra SSRF). */
export function validatePublicUrl(raw: unknown): Validated<URL> {
  let s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'URL vazia.' };
  if (s.length > 2048) return { ok: false, error: 'URL longa demais.' };
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'URL inválida.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Somente http/https.' };
  if (u.username || u.password) return { ok: false, error: 'URL com credenciais não é permitida.' };
  if (u.port && u.port !== '80' && u.port !== '443') return { ok: false, error: 'Porta não permitida.' };
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[') || host.includes(':')) return { ok: false, error: 'Endereços IPv6 literais não são permitidos.' };
  if (PRIVATE_HOST.test(host) || isPrivateIPv4(host)) return { ok: false, error: 'Endereço interno/privado não permitido.' };
  if (/^\d+$/.test(host) || !host.includes('.')) return { ok: false, error: 'Host inválido.' };
  return { ok: true, value: u };
}
