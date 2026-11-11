// Coleta a identidade visual e o conteúdo reaproveitável do site atual do cliente (determinístico).
// Usado para remodelar o site mantendo logo, fotos, cor da marca e serviços reais.

export interface BrandAssets {
  siteName?: string;
  logo?: string;
  icon?: string;
  ogImage?: string;
  images: string[];
  themeColor?: string;
  colors: string[];
  serviceHints: string[];
  instagram?: string;
  facebook?: string;
  email?: string;
  /** "Quem somos" do site atual (1–2 parágrafos reais). */
  about?: string;
  /** Pessoas citadas no site atual (nome com título profissional + texto próximo, se houver). */
  team?: Array<{ name: string; text?: string }>;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : undefined;
}

function abs(url: string | undefined, base: string): string | undefined {
  if (!url || url.startsWith('data:') || url.startsWith('javascript:')) return undefined;
  try {
    const u = new URL(url.replace(/&amp;/g, '&'), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const SKIP_IMG = /(pixel|tracking|spacer|blank|loader|loading|sprite|icon-|\/icons?\/|emoji|gravatar|facebook\.com\/tr|google-analytics|doubleclick|wp-includes|captcha|flag|arrow|seta|whatsapp|wpp|instagram|facebook|youtube|linkedin|twitter)/i;
const IMG_EXT = /\.(jpe?g|png|webp)(\?|#|$)/i;

function clean(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Cor hex normalizada (#rrggbb) ou undefined. */
export function normHex(c: string | undefined): string | undefined {
  if (!c) return undefined;
  let h = c.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(h)) return undefined;
  if (h.length === 4) h = '#' + h.slice(1).split('').map((x) => x + x).join('');
  return h;
}

/** Descarta cores "neutras" (quase branco/preto/cinza), que não representam a marca. */
export function isBrandish(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return sat > 0.28 && max > 50 && !(max > 245 && min > 230);
}

export function extractBrandAssets(html: string, baseUrl: string): BrandAssets {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key: string) => {
    const t = metas.find((x) => (attr(x, 'property') ?? attr(x, 'name') ?? '').toLowerCase() === key);
    return t ? attr(t, 'content') : undefined;
  };
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const iconTag =
    links.find((l) => /apple-touch-icon/i.test(attr(l, 'rel') ?? '')) ?? links.find((l) => /\bicon\b/i.test(attr(l, 'rel') ?? ''));

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const srcOf = (t: string) => {
    const set = attr(t, 'srcset') ?? attr(t, 'data-srcset');
    const fromSet = set?.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
    return attr(t, 'data-src') ?? attr(t, 'data-lazy-src') ?? fromSet ?? attr(t, 'src');
  };
  const logoTag = imgs.find((t) => /logo|marca|brand/i.test(`${attr(t, 'class') ?? ''} ${attr(t, 'id') ?? ''} ${attr(t, 'alt') ?? ''} ${attr(t, 'src') ?? ''}`));
  const logo = logoTag ? abs(srcOf(logoTag), baseUrl) : undefined;

  const images: string[] = [];
  for (const t of imgs) {
    if (t === logoTag) continue;
    const u = abs(srcOf(t), baseUrl);
    if (!u || SKIP_IMG.test(u) || !IMG_EXT.test(u)) continue;
    const w = Number(attr(t, 'width') ?? 0);
    const h = Number(attr(t, 'height') ?? 0);
    if ((w && w < 200) || (h && h < 150)) continue;
    if (!images.includes(u)) images.push(u);
    if (images.length >= 12) break;
  }
  // Imagens de fundo em estilos inline (heros costumam usar).
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    const u = abs(m[1], baseUrl);
    if (u && IMG_EXT.test(u) && !SKIP_IMG.test(u) && !images.includes(u) && images.length < 12) images.push(u);
  }

  const counts = new Map<string, number>();
  for (const m of html.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) {
    const h = normHex(m[0]);
    if (h && isBrandish(h)) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 6);
  const themeColor = normHex(meta('theme-color'));

  const noScript = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const GENERIC = /^(home|início|inicio|contato|fale conosco|sobre|sobre nós|quem somos|menu|blog|localização|endereço|depoimentos|galeria|faq|perguntas frequentes|nossos serviços|serviços|servicos|newsletter|siga-nos|redes sociais|links|categorias|copyright.*)$/i;
  const serviceHints: string[] = [];
  for (const m of noScript.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)) {
    const t = clean(m[1]);
    if (t.length < 3 || t.length > 60 || GENERIC.test(t) || /[?!]$/.test(t)) continue;
    if (!serviceHints.some((x) => x.toLowerCase() === t.toLowerCase())) serviceHints.push(t);
    if (serviceHints.length >= 10) break;
  }


  // "Quem somos" real do site atual: parágrafos logo após um título tipo "Sobre / Quem somos / Nossa história".
  let about: string | undefined;
  const heads = [...noScript.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
  for (const h of heads) {
    if (!/sobre|quem somos|nossa hist|a empresa|o escrit|a cl[ií]nica|apresenta/i.test(clean(h[1]))) continue;
    const after = noScript.slice((h.index ?? 0) + h[0].length, (h.index ?? 0) + h[0].length + 2500);
    const ps = [...after.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1])).filter((t) => t.length >= 60 && !/©|todos os direitos|cookies/i.test(t));
    if (ps.length) {
      about = ps.slice(0, 2).join(' ').slice(0, 520);
      break;
    }
  }
  // Equipe: nomes com título profissional em títulos (Dr./Dra./Eng./Arq./Adv.) + parágrafo seguinte, quando houver.
  const team: Array<{ name: string; text?: string }> = [];
  const PERSON = /\b(?:Dr\.?|Dra\.?|Eng\.?|Engenheir[oa]|Arq\.?|Arquitet[oa]|Adv\.?|Advogad[oa])\s+[A-ZÀ-Ú][\p{L}'-]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][\p{L}'-]+){0,3}/u;
  for (const h of [...noScript.matchAll(/<h[2-5]\b[^>]*>([\s\S]*?)<\/h[2-5]>/gi)]) {
    const name = PERSON.exec(clean(h[1]))?.[0]?.trim();
    if (!name || team.some((t) => t.name.toLowerCase() === name.toLowerCase())) continue;
    const after = noScript.slice((h.index ?? 0) + h[0].length, (h.index ?? 0) + h[0].length + 900);
    const text = [...after.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1])).find((t) => t.length >= 50 && t.length <= 420);
    team.push({ name, ...(text ? { text } : {}) });
    if (team.length >= 4) break;
  }

  const hrefs = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => attr(m[0], 'href') ?? '');
  const ig = hrefs.map((h) => h.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/)).find((m) => m && !['p', 'explore', 'reel', 'accounts'].includes(m[1]));
  const fb = hrefs.find((h) => /facebook\.com\/[A-Za-z0-9.]+/i.test(h) && !/sharer|plugins|tr\?/i.test(h));
  const mail = hrefs.find((h) => /^mailto:/i.test(h))?.replace(/^mailto:/i, '').split('?')[0];

  return {
    siteName: meta('og:site_name'),
    logo,
    icon: iconTag ? abs(attr(iconTag, 'href'), baseUrl) : undefined,
    ogImage: abs(meta('og:image'), baseUrl),
    images,
    themeColor: themeColor && isBrandish(themeColor) ? themeColor : undefined,
    colors,
    serviceHints,
    instagram: ig?.[1],
    facebook: fb,
    email: mail && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(mail) ? mail : undefined,
    about,
    team: team.length ? team : undefined,
  };
}
