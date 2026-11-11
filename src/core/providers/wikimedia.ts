// Fotos ilustrativas via Wikimedia Commons: API pública e gratuita, SEM chave. Fallback quando não há Pixabay/Pexels.
// Só entram fotos JPEG horizontais e grandes, com licença que permite uso comercial (CC0, CC BY, CC BY-SA, domínio público),
// sempre creditadas ao autor. Qualidade é irregular: o filtro descarta arquivo histórico, retrato, mapa, logo e letreiro.
import type { StockPhoto } from './openverse';

const API = 'https://commons.wikimedia.org/w/api.php';
const LICENSE_OK = /^(cc0|cc by(-sa)? \d(\.\d)?|public domain|pdm)/i;
// Arquivo histórico, retrato/pessoa, mapa, logo, letreiro, esquema — não servem de ilustração comercial.
const BAD_TITLE = /\b(archives?|dpla|statelib|queensland|historic|history|portrait|headshot|selfie|map|diagram|chart|logo|flag|poster|sign|signage|exterior|street|facade|museum|wedding|memorial|statue|screenshot|icon|schema|sunsets?|twilights?|landscape|lake|river|sky|clouds?|wildlife|flowers?|beach|mountains?|waiting|crowd|queue|people|group|students?|school|soldiers?|army|military|navy|refugees?|camp|x-?ray|surgery|injur|wound|\b(1[0-9]|20)\d{2}\b)\b/i;

// Nome próprio de lugar/negócio/pessoa no título ("clinic in Franklin", "Henry Clay's", "geograph", códigos): evita expor outra empresa.
const PROPER = /\b(in|of|at|by)\s+[A-Z][a-z]|geograph|'s\b|\(\d{4,}\)|\bfirm\b|\b[Dd]r\.?\s/;

// Primeira palavra com maiúscula que não é termo comum nem da consulta costuma ser nome de negócio/pessoa ("Korolyov Dental Clinic").
const GENERIC = new Set(['a','an','the','modern','empty','beauty','interior','inside','view','close','new','small','big','old','clean','professional','personal','car','gym','dog','cat','pet','food','plate','plates','kitchen','office','room','desk','group','young','woman','man']);

const strip = (html: unknown, max: number) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Escolhe as melhores fotos da resposta da API (função pura, testável). */
export function pickWikimedia(pages: Array<Record<string, any>>, q: string): StockPhoto[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p): StockPhoto | undefined => {
      const ii = p.imageinfo?.[0];
      if (!ii || ii.mime !== 'image/jpeg' || !ii.width || !ii.height) return undefined;
      if (ii.width < 1400 || ii.width / ii.height < 1.3) return undefined;
      const meta = ii.extmetadata ?? {};
      const license = strip(meta.LicenseShortName?.value, 30);
      if (!LICENSE_OK.test(license)) return undefined;
      const title = String(p.title ?? '').replace(/^File:/, '').replace(/\.[a-z]+$/i, '');
      if (BAD_TITLE.test(title) || PROPER.test(title)) return undefined;
      const first = title.split(/[\s,_-]/)[0];
      if (/^[A-Z][a-z]+$/.test(first) && !GENERIC.has(first.toLowerCase()) && !words.some((w) => first.toLowerCase().startsWith(w.replace(/s$/, '')))) return undefined;
      const text = title.toLowerCase(); // só o título: a descrição às vezes cita o tema de passagem (foto de comida com "limpeza dental")
      if (words.length && !words.some((w) => text.includes(w.replace(/s$/, '')))) return undefined;
      const url = typeof ii.thumburl === 'string' && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(ii.thumburl) ? ii.thumburl : undefined;
      if (!url) return undefined;
      return {
        url,
        width: Math.min(ii.width, 1280),
        height: Math.round((Math.min(ii.width, 1280) * ii.height) / ii.width),
        creator: strip(meta.Artist?.value, 60) || 'Wikimedia Commons',
        license: license.replace(/^cc /i, ''),
        licenseUrl: 'https://commons.wikimedia.org/wiki/Commons:Licensing',
        source: 'wikimedia',
        title: title.slice(0, 80),
        landing: typeof ii.descriptionurl === 'string' ? ii.descriptionurl : undefined,
      };
    })
    .filter((x): x is StockPhoto => !!x);
}

export async function searchWikimedia(q: string, fetchFn: typeof fetch, userAgent: string): Promise<StockPhoto[]> {
  const url = `${API}?${new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '30',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
    iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription', format: 'json',
  })}`;
  let res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  // Limite de ritmo da Wikimedia (429): espera e tenta de novo, até 2 vezes.
  for (let i = 0; i < 2 && res.status === 429; i++) {
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  }
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  const data = (await res.json()) as { query?: { pages?: Record<string, Record<string, any>> } };
  return pickWikimedia(Object.values(data.query?.pages ?? {}), q);
}
