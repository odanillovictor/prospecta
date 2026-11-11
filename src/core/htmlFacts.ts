// Extração determinística de fatos do HTML (sem IA, sem DOM — roda no Worker e nos testes).
import type { SiteFacts } from './types';

type HtmlFacts = Omit<
  SiteFacts,
  'requestedUrl' | 'finalUrl' | 'httpStatus' | 'https' | 'redirects' | 'responseMs' | 'htmlBytes' | 'truncated' | 'pagespeed'
>;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : undefined;
}

function metaContent(html: string, key: string, keyAttr = 'name'): string | undefined {
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if ((attr(m[0], keyAttr) ?? '').toLowerCase() === key) return attr(m[0], 'content')?.trim();
  }
  return undefined;
}

const CTA_TERMS = [
  'agende', 'agendar', 'orçamento', 'orcamento', 'fale conosco', 'fale com', 'entre em contato', 'chame no whatsapp',
  'peça', 'peca ja', 'compre', 'reserve', 'solicite', 'marque sua', 'saiba mais', 'contrate', 'ligue',
];
const SOCIAL_PROOF_TERMS = [
  'depoimento', 'avaliações', 'avaliacoes', 'clientes satisfeitos', 'o que dizem', 'estrelas', 'google reviews',
  'anos de experiência', 'anos de experiencia', 'certificad', 'premiad',
];
const LOCAL_TERMS = [
  'endereço', 'endereco', 'como chegar', 'horário de funcionamento', 'horario de funcionamento', 'atendemos',
  'google.com/maps', 'maps.google', 'bairro', 'cep',
];

function foundTerms(textLower: string, terms: string[]): string[] {
  return terms.filter((t) => textLower.includes(t));
}

export function extractHtmlFacts(rawHtml: string): HtmlFacts {
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '');
  const noScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const text = clean(noScripts);
  const textLower = text.toLowerCase();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? clean(titleMatch[1]) || undefined : undefined;

  const h1 = [...noScripts.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => clean(m[1])).filter(Boolean);
  const h2Count = (noScripts.match(/<h2\b/gi) ?? []).length;

  const links = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => (attr(m[0], 'href') ?? '').toLowerCase());
  const hasTelLink = links.some((h) => h.startsWith('tel:'));
  const hasWhatsAppLink =
    links.some((h) => /(wa\.me\/|api\.whatsapp\.com|whatsapp:\/\/|web\.whatsapp\.com)/.test(h)) ||
    /wa\.me\/\d|api\.whatsapp\.com\/send/i.test(html);
  const hasMailto = links.some((h) => h.startsWith('mailto:'));

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imgWithoutAlt = imgs.filter((t) => !(attr(t, 'alt') ?? '').trim()).length;

  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
  const copyrightYear = years.length ? Math.max(...years) : undefined;

  const phonesInText = (text.match(/\(?\b\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}\b/g) ?? []).length;

  const tables = (noScripts.match(/<table\b/gi) ?? []).length;
  const divs = (noScripts.match(/<div\b/gi) ?? []).length;

  return {
    title,
    metaDescription: metaContent(html, 'description') || undefined,
    hasViewport: !!metaContent(html, 'viewport'),
    lang: (html.match(/<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]+)/i) ?? [])[1],
    h1,
    h2Count,
    hasTelLink,
    hasWhatsAppLink,
    hasMailto,
    formCount: (noScripts.match(/<form\b/gi) ?? []).length,
    ctaKeywords: foundTerms(textLower, CTA_TERMS),
    socialProofKeywords: foundTerms(textLower, SOCIAL_PROOF_TERMS),
    localInfoKeywords: foundTerms(textLower + ' ' + html.toLowerCase().slice(0, 200000), LOCAL_TERMS),
    phonesInText,
    copyrightYear,
    generator: metaContent(html, 'generator'),
    hasSchemaLocalBusiness: /"@type"\s*:\s*"(LocalBusiness|Dentist|Restaurant|Store|MedicalBusiness|ProfessionalService|[A-Za-z]*Business)"/.test(html),
    hasOpenGraph: !!metaContent(html, 'og:title', 'property'),
    imgCount: imgs.length,
    imgWithoutAlt,
    bodyText: text.slice(0, 8000),
    usesTablesForLayout: tables >= 3 && tables * 4 > divs,
    usesFlash: /\.swf\b|application\/x-shockwave-flash/i.test(html),
  };
}
