// Gerador determinístico de site: dados do lead + pacote do segmento + melhorias do diagnóstico → HTML único.
// Sem IA e sem dependências: o arquivo final abre direto no navegador e pode ser publicado como está.
import type { CustomBlock, Lead, Review, SiteDraft } from '../types';
import { formatPhone, normText } from '../normalize';
import { packFor, fill, type ServiceItem } from './packs';
import { themeFor, safeHex, readableOn, type SiteTheme } from './themes';
import { improvementsFor, type Improvement } from './improvements';
import { fillHeadline, servicesFrom, servicesReport, variationFor, type HeroLayout, type ServicesLayout } from './variation';
import { icon, iconFor, type IconName } from './icons';
import { objectionsFor } from './copy';
import { renderPremium } from './premium';
import { SOURCE_LABEL } from './evidence';
import { reviewInsights, themeOfObjection, themeSentence } from './reviews';
import { KIT_CSS, ensureContrast, imageSize, noWidow, qualityNotes, tintNeutrals } from './kit';

/** Passo do "Como funciona": ícone + texto montado com os dados reais do cliente. */
export interface StepItem extends ServiceItem {
  icon: IconName | 'wa';
}

export interface SiteImages {
  hero?: string; // data:image/... (validado)
  logo?: string;
  gallery?: string[];
  /** Fundo da chamada final. */
  cta?: string;
  /** Uma imagem por serviço (mesma ordem de `services`). */
  services?: string[];
  /** Créditos exigidos pelas fotos do Google (nome do autor). */
  credits?: string[];
  /** Imagens dos blocos customizados: blockId → data URL. */
  customBlocks?: Record<string, string>;
}

export interface ResolvedImages {
  hero?: string;
  cta?: string;
  logo?: string;
  gallery: string[];
  services: string[];
  credits: string[];
  customBlocks?: Record<string, string>;
}

export interface SiteModel {
  name: string;
  segmentLabel: string;
  local: string;
  city?: string;
  neighborhood?: string;
  state?: string;
  address?: string;
  phoneE164?: string;
  phoneDisplay?: string;
  waE164?: string;
  waLink?: string;
  telLink?: string;
  mapsLink: string;
  mapEmbed?: string;
  lat?: number;
  lon?: number;
  rating?: number;
  reviewCount?: number;
  headline: string;
  subheadline: string;
  servicesLead: string;
  closing: string;
  ctaPrimary: string;
  ctaMessage: string;
  about: string;
  services: ServiceItem[];
  steps: StepItem[];
  /** Quem somos: apresentação do segmento + fatos reais (especialidades do Maps, nota no Google). */
  intro: string;
  forWho: string[];
  notFor: string[];
  faq: Array<{ q: string; a: string }>;
  /** Dúvidas que travam a decisão, com a resposta (quebra de objeção). */
  objections: ServiceItem[];
  /** Dados reais usados no site e o que ficou sem confirmação (nada é inventado). */
  data: { confirmed: string[]; missing: string[] };
  /** Pessoas do site atual do cliente (só se existirem). */
  team: Array<{ name: string; text?: string }>;
  hours?: string;
  instagram?: string;
  facebook?: string;
  email?: string;
  /** Avaliações reais (nunca geradas); vazio quando a fonte não traz texto. */
  reviews: Review[];
  theme: SiteTheme;
  heroLayout: HeroLayout;
  servicesLayout: ServicesLayout;
  seoTitle: string;
  seoDescription: string;
  improvements: Improvement[];
  warnings: string[];
  images: ResolvedImages;
  isDemo: boolean;
  /** 'premium' usa renderPremium (premium.ts); qualquer outro valor mantém o layout clássico. */
  layout: 'premium' | 'classico';
  /** Atendimento online além do presencial (alternância com imagem que troca). */
  online: boolean;
  /** IDs das seções padrão a ocultar. */
  hiddenSections: string[];
  /** Blocos customizados adicionados pelo editor visual. */
  customBlocks: CustomBlock[];
  /** Ordem de renderização das seções reordenáveis. */
  sectionOrder: string[];
}

const DATA_IMG = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i;

export function safeDataImage(v: string | undefined): string | undefined {
  return v && v.length < 6_000_000 && DATA_IMG.test(v) && !v.startsWith('data:image/svg') ? v : undefined;
}

function clip(s: string | undefined, max: number): string | undefined {
  const v = s?.replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : undefined;
}

export function buildSiteModel(lead: Lead, draft: SiteDraft = lead.siteDraft ?? {}, images: SiteImages = {}): SiteModel {
  const pack = packFor(lead.niche, lead.category);
  const local = lead.neighborhood && lead.city ? `${lead.neighborhood}, ${lead.city}` : lead.city || lead.neighborhood || 'sua região';
  // Variação estável por empresa (estilo, cor, layout, título); qualquer escolha do usuário prevalece.
  // Foto de topo pequena (ex.: miniatura de 408 px do Maps) estourada na tela fica borrada: não vai para o topo.
  const heroSize = imageSize(safeDataImage(images.hero));
  const weakHero = !!heroSize && heroSize.w < 900;
  if (weakHero) images = { ...images, hero: undefined };
  const v = variationFor(lead, pack, !!safeDataImage(images.hero), draft.shuffle ?? 0);
  const baseTheme = themeFor(draft.theme || v.themeId);
  const accent = safeHex(draft.accent) ?? v.accent;
  // Kit: neutros tingidos pela marca (60-30-10) e textos com contraste mínimo 4,5:1.
  const tint = tintNeutrals(baseTheme, accent);
  const accentText = ensureContrast(accent, [tint.bg, tint.surface]);
  const theme: SiteTheme = {
    ...baseTheme,
    ...tint,
    accent,
    accentInk: readableOn(accent),
    accentText,
    muted: ensureContrast(baseTheme.muted, [tint.bg, tint.surface]),
  };
  const hasHero = !!safeDataImage(images.hero);
  let heroLayout: HeroLayout = draft.heroLayout ?? v.hero;
  if (!hasHero && (heroLayout === 'fullbleed' || heroLayout === 'editorial')) heroLayout = 'split';
  const waE164 = draft.draftWa?.replace(/\D/g, '') || lead.whatsapp || lead.phone;
  const ctaMessage = pack.ctaMessage;
  const waLink = waE164 && /^55\d{10,11}$/.test(waE164) ? `https://wa.me/${waE164}?text=${encodeURIComponent(ctaMessage)}` : undefined;
  const services = (draft.services?.filter((s) => s.title.trim()) ?? servicesFrom(lead, pack)).slice(0, 8).map((s: ServiceItem) => ({ title: clip(s.title, 60)!, text: clip(s.text, 220) ?? '', ...(s.price ? { price: clip(s.price, 20) } : {}) }));
  const mapsQuery = [lead.name, lead.address || lead.city].filter(Boolean).join(' ');

  // Mapa: embed do Google Maps (grátis, sem chave) com o nome + endereço do cliente. O embed do OpenStreetMap passou a
  // responder "403 Access blocked" para sites de terceiros, então não é mais usado.
  let mapEmbed: string | undefined;
  const hasCoords = lead.lat != null && lead.lon != null && Math.abs(lead.lat) <= 90 && Math.abs(lead.lon) <= 180;
  if (lead.address || hasCoords) {
    const q = lead.address ? mapsQuery : `${lead.lat!.toFixed(5)},${lead.lon!.toFixed(5)}`;
    mapEmbed = `https://www.google.com/maps?${new URLSearchParams({ q, output: 'embed', hl: 'pt-BR' })}`;
  }

  const headline = clip(draft.headline, 120) ?? fillHeadline(v.headline, lead);
  const warnings: string[] = qualityNotes({
    headline,
    services: services.length,
    galleryCount: (images.gallery ?? []).filter((g) => !!safeDataImage(g)).length,
    texts: [headline, draft.subheadline ?? '', draft.about ?? '', ...services.map((s) => s.text)],
    accentAdjusted: accentText.toLowerCase() !== accent.toLowerCase(),
  });
  if (!waLink) warnings.push('Sem telefone válido: os botões de contato levam ao formulário. Adicione um número no lead.');
  if (!lead.address) warnings.push('Sem endereço: a seção de localização mostra apenas a cidade.');
  if (!draft.hours && !lead.hours) warnings.push('Horário de funcionamento não informado (opcional).');
  if (weakHero) warnings.push(`A foto do topo é pequena (${heroSize!.w}×${heroSize!.h}) e ficaria borrada: o topo usa o cartão da marca. Envie uma foto maior (mín. 900 px de largura).`);
  else if (!images.hero) warnings.push('Sem foto real no topo: o site usa o cartão da marca. Adicione uma foto do Google Maps, do site atual ou envie uma.');
  if (lead.isDemo) warnings.push('Lead de demonstração: dados fictícios.');

  const brand = lead.diagnosis?.facts?.brand;
  const hoursVal = clip(draft.hours, 200) ?? clip(lead.hours, 200);
  const checks: Array<[string, boolean]> = [
    ['endereço', !!lead.address], ['telefone', !!lead.phone], ['WhatsApp', !!waLink], ['horário', !!hoursVal],
    ['nota no Google', lead.rating != null && !!lead.reviewCount], ['avaliações com texto', (lead.reviews ?? []).length > 0],
    ['Instagram', !!(draft.instagram ?? lead.instagram)], ['e-mail', !!(lead.email ?? brand?.email)], ['equipe', !!brand?.team?.length],
    ['logo oficial', !!safeDataImage(images.logo)], ['fotos reais do cliente', (images.gallery ?? []).filter((g) => !!safeDataImage(g)).length >= 3],
  ];
  const report = servicesReport(lead, pack);
  if (!draft.services?.length) {
    warnings.push(`Serviços confirmados: ${report.confirmed.map((c) => `${c.title} (${SOURCE_LABEL[c.source]})`).join('; ') || 'nenhum'}.`);
    if (report.hidden.length) warnings.push(`Serviços ocultos por falta de confirmação no Maps ou no site do cliente: ${report.hidden.join(', ')}. Se o cliente oferece, adicione manualmente.`);
  }
  const data = { confirmed: checks.filter(([, ok]) => ok).map(([k]) => k), missing: checks.filter(([, ok]) => !ok).map(([k]) => k) };
  if (data.missing.length) warnings.push(`Não confirmado (ausente nos dados do cliente, por isso não aparece no site): ${data.missing.join(', ')}.`);
  const faq = faqFor(pack.faq, { name: lead.name.replace(/^\[DEMO\]\s*/, ''), address: lead.address, hours: hoursVal, phone: lead.phone ? formatPhone(lead.phone) : undefined, hasWa: !!waLink, services: services.map((s) => s.title) });

  const city = lead.city;
  const segmentLabel = lead.niche ? lead.niche.charAt(0).toUpperCase() + lead.niche.slice(1) : pack.label;
  return {
    name: lead.name.replace(/^\[DEMO\]\s*/, ''),
    segmentLabel,
    local,
    city,
    neighborhood: lead.neighborhood,
    state: lead.state,
    address: lead.address,
    phoneE164: lead.phone,
    phoneDisplay: lead.phone ? formatPhone(lead.phone) : undefined,
    waE164,
    waLink,
    telLink: lead.phone ? `tel:+${lead.phone}` : undefined,
    mapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
    mapEmbed,
    lat: lead.lat,
    lon: lead.lon,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
    headline,
    subheadline: clip(draft.subheadline, 240) ?? fill(pack.subheadline, { local }),
    servicesLead: pack.servicesLead,
    closing: clip(draft.draftClosing, 120) ?? pack.closing,
    ctaPrimary: clip(draft.ctaPrimary, 40) ?? pack.ctaPrimary,
    ctaMessage,
    about: clip(draft.about, 600) ?? clip(lead.diagnosis?.facts?.brand?.about, 520) ?? clip(lead.summary, 600) ?? pack.about,
    services,
    steps: draft.draftSteps?.length
      ? draft.draftSteps.map((s, i) => ({ ...s, icon: (['wa','calendar','sparkles','pin'] as const)[i] ?? 'check' as const }))
      : stepsFor(lead, pack.steps, pack.label, !!waLink),
    intro: introFor(lead, fill(pack.whoWeAre, { nome: lead.name.replace(/^\[DEMO\]\s*/, ''), local }), pack.label, services.map((s) => s.title)),
    forWho: pack.forWho,
    notFor: pack.notFor,
    faq: draft.draftFaq?.length ? draft.draftFaq : faq,
    objections: draft.draftObjections?.length ? draft.draftObjections : objectionsFor(pack.id),
    data,
    team: (lead.diagnosis?.facts?.brand?.team ?? []).slice(0, 4).map((t) => ({ name: clip(t.name, 60)!, text: clip(t.text, 420) })).filter((t) => t.name),
    hours: clip(draft.hours, 200) ?? clip(lead.hours, 200),
    instagram: clip(draft.instagram ?? lead.instagram, 60)?.replace(/^@/, '').replace(/[^\w.]/g, ''),
    facebook: /^https:\/\/(www\.)?facebook\.com\/[\w.\-/]+$/.test(lead.diagnosis?.facts?.brand?.facebook ?? '') ? lead.diagnosis!.facts!.brand!.facebook : undefined,
    email: clip(lead.email ?? lead.diagnosis?.facts?.brand?.email, 80),
    reviews: (draft.draftReviews?.length
      ? draft.draftReviews.filter((r) => r.text && r.author && r.rating >= 1 && r.rating <= 5)
          .map((r) => ({ ...r, source: 'Google' as const }))
      : (lead.reviews ?? []).filter((r) => r.text && r.author && r.rating >= 1 && r.rating <= 5)
    ).sort((a, b) => b.rating - a.rating || b.text.length - a.text.length).slice(0, 10),
    theme,
    heroLayout,
    servicesLayout: draft.servicesLayout ?? v.services,
    seoTitle: `${lead.name.replace(/^\[DEMO\]\s*/, '')} | ${segmentLabel}${city ? ` em ${city}` : ''}`.slice(0, 70),
    seoDescription: `${segmentLabel}${local !== 'sua região' ? ` em ${local}` : ''}. ${pack.ctaPrimary} pelo WhatsApp${lead.phone ? ` ou ligue ${formatPhone(lead.phone)}` : ''}.`.slice(0, 160),
    improvements: improvementsFor(lead),
    warnings,
    images: {
      hero: safeDataImage(images.hero),
      cta: (() => {
        const c = safeDataImage(images.cta);
        const sz = imageSize(c);
        return sz && sz.w < 900 ? undefined : c;
      })(),
      logo: safeDataImage(images.logo),
      gallery: (images.gallery ?? []).map(safeDataImage).filter((x): x is string => !!x).slice(0, 6),
      services: (images.services ?? []).map((x) => safeDataImage(x) ?? ''),
      credits: [...new Set((images.credits ?? []).map((c) => clip(c, 60)).filter((x): x is string => !!x))],
      customBlocks: images.customBlocks,
    },
    isDemo: lead.isDemo,
    layout: draft.layout === 'premium' ? 'premium' : 'classico',
    online: draft.online ?? false,
    hiddenSections: draft.hiddenSections ?? [],
    customBlocks: draft.customBlocks ?? [],
    sectionOrder: draft.sectionOrder ?? ['convite','sobre','servicos','comofunciona','depoimentos','onde','objecoes','duvidas'],
  };
}

// ---------------- HTML ----------------

export function joinPt(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : items[0] ?? '';
}

/** Apresentação: frase do segmento + só fatos verificáveis do lead (categorias do Maps, nota e nº de avaliações). */
function introFor(lead: Lead, base: string, packLabel: string, specialties: string[]): string {
  const name = lead.name.replace(/^\[DEMO\]\s*/, '');
  // "Quem somos": o que é, onde atua, com o que trabalha (só dados reais) e depois o jeito de atender.
  const labelWord = normText(packLabel).split(' ')[0];
  const inName = labelWord.length > 3 && normText(name).includes(labelWord.slice(0, 5));
  const parts: string[] = [];
  const seen = new Set<string>();
  const list = [...(lead.categories ?? []).map((c) => c.trim()), ...specialties].filter((x) => {
    const k = normText(x);
    if (!k || seen.has(k) || k === normText(packLabel) || k === normText(lead.niche)) return false;
    seen.add(k);
    return true;
  }).slice(0, 4).map((x) => (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1)));
  // Sem região no texto (regra do usuário): o que é, com o que trabalha e o jeito de atender.
  if (list.length) parts.push(`${name} atua com ${joinPt(list)}.`);
  else if (!inName) parts.push(`${name} trabalha com ${packLabel.toLowerCase()}.`);
  parts.push(base);
  // O que os clientes realmente elogiam (2+ avaliações reais citando o mesmo tema).
  const themes = themeSentence(reviewInsights(lead.reviews));
  if (themes) parts.push(themes);
  return parts.join(' ');
}

/** FAQ de 5 perguntas: respostas só com dados reais do cliente (endereço, horário, serviços) + a pergunta específica do segmento. */
function faqFor(packFaq: Array<{ q: string; a: string }>, d: { name: string; address?: string; hours?: string; phone?: string; hasWa: boolean; services: string[] }): Array<{ q: string; a: string }> {
  const contact = d.hasWa ? `Chame no WhatsApp${d.phone ? ` (${d.phone})` : ''}` : d.phone ? `Ligue para ${d.phone}` : 'Use o formulário de contato';
  const list: Array<{ q: string; a: string }> = [{ q: 'Como faço para agendar?', a: `${contact} e conte o que você precisa. Respondemos o mais rápido possível e combinamos o melhor horário.` }];
  list.push(...packFaq.filter((f) => !/agendar|onde voc[eê]s ficam/i.test(f.q)));
  list.push({ q: `Onde fica a ${d.name}?`, a: d.address ? `${d.address}. O mapa e o botão "Como chegar" estão na seção de contato.` : 'O mapa e o botão "Como chegar" estão na seção de contato, logo abaixo.' });
  if (d.hours) list.push({ q: 'Qual o horário de atendimento?', a: `${d.hours}.` });
  if (d.services.length >= 2) list.push({ q: 'Quais serviços vocês oferecem?', a: `${joinPt(d.services.slice(0, 6))}. Se não encontrou o que procura, pergunte pelo WhatsApp.` });
  list.push({ q: 'Como saber os valores?', a: 'Os valores dependem do seu caso. Conte o que você precisa e receba a orientação antes de decidir, sem compromisso.' });
  list.push({ q: 'Posso tirar dúvidas antes de decidir?', a: 'Pode, e é bem-vindo. Mande sua pergunta e respondemos com calma.' });
  return list.slice(0, 5);
}

/** "Como funciona" personalizado: contato real (WhatsApp/telefone), etapas do segmento e onde é o atendimento. */
function stepsFor(lead: Lead, base: ServiceItem[], segment: string, hasWa: boolean): StepItem[] {
  const phone = lead.phone ? formatPhone(lead.phone) : undefined;
  const segIcon = iconFor(`${lead.niche ?? ''} ${lead.category ?? ''} ${segment}`);
  const first: StepItem = hasWa
    ? { icon: 'wa', title: 'Chame no WhatsApp', text: `Mande uma mensagem para ${phone} contando o que você precisa. A conversa já abre pronta.` }
    : phone
      ? { icon: 'phone', title: 'Ligue para nós', text: `Ligue para ${phone} e conte o que você precisa.` }
      : { icon: 'mail', title: base[0]?.title ?? 'Fale com a gente', text: base[0]?.text ?? 'Envie sua mensagem pelo formulário.' };
  const steps: StepItem[] = [first];
  if (base[1]) steps.push({ ...base[1], icon: 'calendar' });
  if (base[2]) steps.push({ ...base[2], icon: segIcon === 'check' ? 'sparkles' : segIcon });
  // O Maps às vezes começa o endereço pelo nome da empresa ("Loja X - R. Y, 10 - Bairro…").
  const street = lead.address?.split(' - ').map((p) => p.trim()).find((p) => p && p.toLowerCase() !== lead.name.toLowerCase());
  if (street || lead.neighborhood || lead.city) {
    const where = lead.neighborhood ? `no ${lead.neighborhood}` : lead.city ? `em ${lead.city}` : 'perto de você';
    const hours = lead.hours && lead.hours.length <= 90 ? ` ${lead.hours}.` : '';
    steps.push({ icon: 'pin', title: `Atendimento ${where}`, text: `${street ? `${street}${lead.city && !street.includes(lead.city) ? `, ${lead.city}` : ''}.` : 'Endereço e mapa logo abaixo.'}${hours}` });
  }
  return steps;
}

export function esc(s: string | number | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 1)).toUpperCase();
}

export function jsonLd(m: SiteModel, url?: string, image?: string): string {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: m.name,
    description: m.seoDescription,
    ...(m.phoneE164 ? { telephone: `+${m.phoneE164}` } : {}),
    address: { '@type': 'PostalAddress', streetAddress: m.address, addressLocality: m.city, addressRegion: m.state, addressCountry: 'BR' },
    ...(m.lat != null && m.lon != null ? { geo: { '@type': 'GeoCoordinates', latitude: m.lat, longitude: m.lon } } : {}),
    ...(url ? { url: `${url}/` } : {}),
    ...(image ? { image } : {}),
    ...(m.instagram ? { sameAs: [`https://www.instagram.com/${m.instagram}/`] } : {}),
    ...(m.rating != null && m.reviewCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: m.rating, reviewCount: m.reviewCount } } : {}),
  };
  // Escapa "<" para que nenhum texto feche a tag <script>.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const star = (fill: number) =>
  `<svg viewBox="0 0 24 24" class="st" aria-hidden="true"><defs><linearGradient id="g${Math.round(fill * 100)}"><stop offset="${fill * 100}%" stop-color="currentColor"/><stop offset="${fill * 100}%" stop-color="currentColor" stop-opacity=".22"/></linearGradient></defs><path fill="url(#g${Math.round(fill * 100)})" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>`;

const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function stars(rating: number): string {
  return Array.from({ length: 5 }, (_, i) => star(Math.max(0, Math.min(1, rating - i)))).join('');
}

export const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
export const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function css(t: SiteTheme): string {
  return `
:root{--bg:${t.bg};--sf:${t.surface};--ink:${t.ink};--mu:${t.muted};--ln:${t.line};--ac:${t.accent};--act:${t.accentText ?? t.accent};--aci:${t.accentInk};--r:${t.radius};--fd:${t.display};--fb:${t.body};--ease:cubic-bezier(.2,.7,.1,1);--imgf:${t.dark ? 'saturate(.9) brightness(.94) contrast(1.05)' : 'saturate(.93) contrast(1.04)'};--sh:0 1px 2px rgba(0,0,0,.06),0 18px 40px -24px rgba(0,0,0,.35)}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--fb);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{max-width:100%;display:block}a{color:inherit}
.wrap{width:min(1180px,100% - 40px);margin-inline:auto}
.display{font-family:var(--fd);font-weight:${t.displayWeight};letter-spacing:${t.displayTracking};line-height:1.02;margin:0}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mu);margin:0 0 22px}
.eyebrow i{width:28px;height:1px;background:currentColor;display:block}
.btn{--h:54px;white-space:nowrap;display:inline-flex;align-items:center;gap:12px;height:var(--h);padding:0 26px;border-radius:999px;font-weight:600;font-size:16px;text-decoration:none;border:1px solid transparent;cursor:pointer;transition:transform .35s var(--ease),background .25s,color .25s,border-color .25s;will-change:transform}
.btn svg{width:20px;height:20px;transition:transform .35s var(--ease)}
.btn:hover svg{transform:translateX(4px)}
.btn-ac{background:var(--ac);color:var(--aci)}
.btn-ac:hover{filter:brightness(1.06)}
.btn-ln{border-color:var(--ln);color:var(--ink);background:transparent}
.btn-ln:hover{border-color:var(--ink)}
/* header */
.hd{position:fixed;inset:0 0 auto;z-index:50;transition:background .3s,box-shadow .3s,transform .4s var(--ease)}
.hd.sc{background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--ln)}
.hd .wrap{display:flex;align-items:center;gap:28px;height:78px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-weight:700;letter-spacing:-.01em;min-width:0;overflow:hidden}
.brand>span{min-width:0;overflow:hidden}.brand b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mono{width:40px;height:40px;flex:none;border-radius:calc(var(--r) * .6 + 4px);background:var(--ink);color:var(--bg);display:grid;place-items:center;font-family:var(--fd);font-size:17px;font-weight:600;overflow:hidden}
.mono img{width:100%;height:100%;object-fit:cover}
.nav{display:flex;gap:26px;margin-left:auto;font-size:15px}
.nav a{white-space:nowrap;text-decoration:none;color:var(--mu);transition:color .2s}.nav a:hover{color:var(--ink)}
.hd .btn{--h:44px;padding:0 18px;font-size:14.5px}
.tel{font-size:14.5px;font-weight:600;text-decoration:none;white-space:nowrap}
.ic{width:20px;height:20px;flex:none}
.logo{display:block;height:44px;max-width:160px}.logo img{height:100%;width:auto;max-width:160px;object-fit:contain}
.tel{display:inline-flex;align-items:center;gap:8px}.tel .ic{width:16px;height:16px;color:var(--act)}
.mbtn{display:none;margin-left:auto;width:46px;height:46px;border-radius:12px;border:1px solid var(--ln);background:var(--sf);color:var(--ink);align-items:center;justify-content:center;cursor:pointer}
.mbtn .i-close{display:none}.mbtn[aria-expanded=true] .i-close{display:block}.mbtn[aria-expanded=true] .i-open{display:none}
.mnav{position:fixed;inset:78px 0 auto;background:var(--bg);border-top:1px solid var(--ln);box-shadow:0 30px 60px -30px rgba(0,0,0,.4);padding:10px 20px 24px;max-height:calc(100svh - 78px);overflow:auto;color:var(--ink)}
.mnav nav{display:grid}.mnav nav a{display:flex;justify-content:space-between;align-items:center;padding:18px 4px;border-bottom:1px solid var(--ln);text-decoration:none;font-size:20px;font-family:var(--fd)}
.mnav-ft{display:grid;gap:10px;margin-top:20px}.mnav-ft .btn{justify-content:center}
body.menu-open{overflow:hidden}
.hd.menu-on{background:var(--bg);color:var(--ink)}
@media(max-width:1240px){.hd .tel{display:none}.nav{gap:20px}}
@media(max-width:1020px){.nav,.tel,.hd-cta{display:none}.mbtn{display:inline-flex}}
@media(min-width:1021px){.mnav{display:none!important}}
/* hero */
.hero{min-height:100svh;display:flex;align-items:center;padding:130px 0 70px;position:relative}
.hero-g{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(30px,6vw,90px);align-items:center}
.hero h1{font-size:clamp(44px,7.4vw,100px)}
.hero h1 .w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.hero h1 .w>span{display:inline-block;transition:transform 1s var(--ease)}
.js .hero h1 .w>span{transform:translateY(105%)}.js.ready .hero h1 .w>span{transform:none}
.lead{font-size:clamp(18px,1.6vw,21px);color:var(--mu);max-width:34em;margin:28px 0 36px}
.acts{display:flex;flex-wrap:wrap;gap:12px}
.trust{display:flex;flex-wrap:wrap;gap:10px 26px;margin:42px 0 0;padding:0;list-style:none;font-size:14.5px;color:var(--mu)}
.trust li{display:flex;align-items:center;gap:8px}.trust b{color:var(--ink)}
.st{width:16px;height:16px;color:var(--ac)}
.badge{position:absolute;left:-36px;bottom:42px;width:128px;height:128px;border-radius:50%;background:var(--ac);color:var(--aci);display:grid;place-items:center;z-index:2;box-shadow:0 20px 40px -18px rgba(0,0,0,.4)}
.badge svg{position:absolute;inset:0;width:100%;height:100%;animation:spin 18s linear infinite}
.badge span{font-family:var(--fd);font-size:28px}
@keyframes spin{to{transform:rotate(360deg)}}
.hero-r{position:relative}
/* Hero com foto real do cliente: tela cheia, foto tratada com a cor da marca */
.hero-photo{color:#fff;min-height:100svh;align-items:flex-end;padding-bottom:clamp(60px,9vw,110px)}
.hero-bg{position:absolute;inset:0;overflow:hidden;background:var(--ink)}
.hero-bg img{width:100%;height:100%;object-fit:cover;filter:var(--imgf);transform:scale(1.08);transition:transform 2.4s var(--ease)}
.js.ready .hero-bg img{transform:scale(1)}
.hero-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.78) 0%,rgba(0,0,0,.5) 22%,rgba(0,0,0,.42) 45%,rgba(0,0,0,.66) 72%,rgba(0,0,0,.9) 100%),linear-gradient(90deg,rgba(0,0,0,.45),transparent 65%)}
.hero-photo h1,.hero-photo .lead,.hero-photo .eyebrow{text-shadow:0 2px 24px rgba(0,0,0,.45)}
.hd-over:not(.sc):not(.menu-on){background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,0))}
.hero-photo .wrap{position:relative;z-index:1}
.hero-photo .hero-g{grid-template-columns:1fr auto;align-items:end}
.hero-photo .eyebrow,.hero-photo .lead,.hero-photo .trust{color:rgba(255,255,255,.82)}
.hero-photo .trust b{color:#fff}
.hero-photo .btn-ln{color:#fff;border-color:rgba(255,255,255,.45)}
.hero-photo .btn-ln:hover{border-color:#fff}
.hero-photo .badge{position:relative;left:auto;bottom:auto}
.hd-over:not(.sc):not(.menu-on){color:#fff}.hd-over:not(.sc):not(.menu-on) .nav a{color:rgba(255,255,255,.8)}.hd-over:not(.sc):not(.menu-on) .mono{background:#fff;color:#111}.hd-over:not(.sc):not(.menu-on) .mbtn{background:rgba(0,0,0,.25);border-color:rgba(255,255,255,.35);color:#fff}.hd-over:not(.sc):not(.menu-on) .logo{background:#fff;border-radius:10px;padding:4px 8px;height:44px}
/* Cartão da marca (sem foto real): só dados verdadeiros do cliente */
.bcard{position:relative;background:var(--ac);color:var(--aci);border-radius:calc(var(--r) + 6px);padding:clamp(26px,3vw,40px);box-shadow:0 40px 80px -40px rgba(0,0,0,.45);overflow:hidden}
.js .bcard{clip-path:inset(100% 0 0 0 round calc(var(--r) + 6px));transition:clip-path 1.2s var(--ease) .3s}
.js.ready .bcard{clip-path:inset(0 0 0 0 round calc(var(--r) + 6px))}
.bcard::before{content:"";position:absolute;width:420px;height:420px;border-radius:50%;right:-180px;top:-200px;border:1px solid color-mix(in srgb,var(--aci) 22%,transparent);box-shadow:0 0 0 60px color-mix(in srgb,var(--aci) 5%,transparent),0 0 0 120px color-mix(in srgb,var(--aci) 4%,transparent)}
.bcard-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;position:relative}
.bcard-logo{width:84px;height:84px;border-radius:calc(var(--r) * .7 + 6px);background:#fff;color:#111;display:grid;place-items:center;font-family:var(--fd);font-size:30px;font-weight:600;overflow:hidden;box-shadow:0 10px 30px -12px rgba(0,0,0,.35)}
.bcard-logo img{width:100%;height:100%;object-fit:contain;padding:8px}
.bcard-seg{font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin-top:6px}
.bcard-name{font-family:var(--fd);font-weight:${t.displayWeight};letter-spacing:${t.displayTracking};font-size:clamp(30px,3vw,42px);line-height:1.05;margin:30px 0 22px;position:relative}
.bcard-list{list-style:none;margin:0 0 28px;padding:0;position:relative}
.bcard-list li{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:12px 0;border-top:1px solid color-mix(in srgb,var(--aci) 20%,transparent);font-size:15px}
.bcard-list .k{opacity:.7;font-size:13px;padding-top:2px}
.bcard-list .st{color:currentColor;width:14px;height:14px;vertical-align:-2px}
.bcard-cta{background:var(--aci);color:var(--ac);position:relative}
.bcard-cta:hover{filter:brightness(1.08)}
.hero-r .bcard+.badge{left:auto;right:-30px;bottom:auto;top:-34px;background:var(--ink);color:var(--bg)}
/* Variações de topo */
.hero-editorial .hero-g{grid-template-columns:1fr 1fr;align-items:stretch}
.hero-editorial{padding-bottom:40px}
.hero-media{position:relative;border-radius:var(--r);overflow:hidden;min-height:520px;background:var(--ink)}
.hero-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:var(--imgf);transform:scale(1.08);transition:transform 2.2s var(--ease)}
.js.ready .hero-media img{transform:scale(1)}
.js .hero-media{clip-path:inset(0 0 100% 0 round var(--r));transition:clip-path 1.3s var(--ease) .2s}
.js.ready .hero-media{clip-path:inset(0 0 0 0 round var(--r))}
.hero-media .badge{left:auto;right:24px;bottom:24px}
.hero-centered .hero-g{grid-template-columns:1fr;text-align:center;justify-items:center}
.hero-centered .hero-l{max-width:980px;display:flex;flex-direction:column;align-items:center}
.hero-centered .acts,.hero-centered .trust{justify-content:center}
.hero-centered .lead{margin-inline:auto}
.hero-band{width:100%;aspect-ratio:21/8;border-radius:var(--r);overflow:hidden;margin-top:10px}
.hero-band img{width:100%;height:100%;object-fit:cover;filter:var(--imgf)}
.js .hero-band{clip-path:inset(30% 0 30% 0 round var(--r));transition:clip-path 1.4s var(--ease) .4s}
.js.ready .hero-band{clip-path:inset(0 0 0 0 round var(--r))}
.hero-strip{width:min(760px,100%);text-align:left}
.hero-strip .bcard{display:grid;grid-template-columns:auto 1fr;gap:6px 28px;align-items:center}
.hero-strip .bcard-top{grid-row:span 2}
.hero-strip .bcard-seg{display:none}
.hero-strip .bcard-name{margin:0;font-size:clamp(24px,2.4vw,32px)}
.hero-strip .bcard-list{grid-column:1/-1;margin:14px 0 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 24px}
.hero-strip .bcard-cta{grid-column:1/-1;justify-self:start}
@media(max-width:900px){.hero-editorial .hero-g{grid-template-columns:1fr}.hero-media{min-height:360px}.hero-band{aspect-ratio:4/3}.hero-strip .bcard{grid-template-columns:1fr}}
/* Serviços em lista */
.svc-list{border-top:1px solid var(--ln)}
.svc-list article{display:grid;grid-template-columns:90px 1fr 1.2fr;gap:24px;align-items:baseline;padding:30px 0;border-bottom:1px solid var(--ln);transition:padding .4s var(--ease),background .3s}
.svc-list article:hover{padding-left:14px;background:color-mix(in srgb,var(--ac) 6%,transparent)}
.svc-list .n{font-family:var(--fd);font-size:34px;color:var(--act);line-height:1}
.svc-list h3{font-family:var(--fd);font-weight:var(--dw,400);font-size:clamp(24px,2.6vw,36px);margin:0;line-height:1.1}
.svc-list p{margin:0;color:var(--mu)}
@media(max-width:760px){.svc-list article{grid-template-columns:56px 1fr}.svc-list p{grid-column:2}}
/* Galeria com fotos reais */
.gal{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:clamp(180px,22vw,300px);gap:14px}
.gal figure{margin:0;overflow:hidden;border-radius:var(--r);background:var(--sf)}
.gal figure:first-child{grid-row:span 2}
.gal-3{grid-template-columns:1.4fr 1fr}.gal-5{grid-template-columns:1.4fr 1fr 1fr}
.gal img{width:100%;height:100%;object-fit:cover;filter:var(--imgf);transition:transform 1.2s var(--ease)}
.gal figure:hover img{transform:scale(1.05)}
.credits{font-size:12.5px;color:var(--mu);margin:14px 0 0}
@media(max-width:700px){.gal{grid-template-columns:1fr 1fr}.gal figure:first-child{grid-column:span 2;grid-row:auto}}
@media(max-width:900px){.hero{min-height:auto;padding-top:120px}.hero-g{grid-template-columns:1fr}.badge{left:auto;right:16px;bottom:-30px;width:104px;height:104px}}
/* marquee */
.mq{border-block:1px solid var(--ln);overflow:hidden;padding:22px 0;white-space:nowrap}
.mq-t{display:inline-flex;gap:48px;animation:mq 38s linear infinite;font-family:var(--fd);font-size:clamp(22px,2.6vw,34px);font-weight:${t.displayWeight}}
.mq-t span{display:inline-flex;align-items:center;gap:48px}.mq-t span::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--ac)}
@keyframes mq{to{transform:translateX(-50%)}}
/* sections */
section.s{padding:clamp(80px,11vw,150px) 0}
.sh{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:end;margin-bottom:clamp(40px,6vw,70px)}
.sh h2{font-size:clamp(36px,5vw,64px)}
.sh p{color:var(--mu);margin:0;max-width:30em;justify-self:end}
@media(max-width:800px){.sh{grid-template-columns:1fr}.sh p{justify-self:start}}
.svc{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--ln)}
.svc article{padding:34px 30px 40px 0;border-bottom:1px solid var(--ln);position:relative;transition:padding .45s var(--ease)}
.svc article:not(:nth-child(3n)){border-right:1px solid var(--ln);margin-right:0}
.svc article:not(:nth-child(3n+1)){padding-left:30px}
.svc .n{font-size:13px;color:var(--mu);letter-spacing:.1em}
.svc h3{font-family:var(--fd);font-weight:${t.displayWeight};font-size:clamp(22px,2vw,27px);letter-spacing:${t.displayTracking};margin:44px 0 12px;line-height:1.15}
.svc p{margin:0;color:var(--mu);font-size:16px}
.svc article::before{content:"";position:absolute;left:0;right:0;top:-1px;height:2px;background:var(--ac);transform:scaleX(0);transform-origin:left;transition:transform .6s var(--ease)}
.svc article:hover::before{transform:scaleX(1)}
@media(max-width:900px){.svc{grid-template-columns:1fr 1fr}.svc article{padding:28px 20px 32px!important;border-right:0!important}.svc article:nth-child(odd){border-right:1px solid var(--ln)!important}}
@media(max-width:560px){.svc{grid-template-columns:1fr}.svc article{border-right:0!important;padding-inline:0!important}}
.dark{background:var(--ink);color:var(--bg)}
.dark .sh p,.dark .mu{color:color-mix(in srgb,var(--bg) 65%,transparent)}
.steps{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:30px;position:relative;padding-top:46px}
.steps::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:color-mix(in srgb,var(--bg) 22%,transparent)}
.steps .bar{position:absolute;top:0;left:0;height:2px;background:var(--ac);width:calc(var(--p,0) * 100%);transition:width .2s linear}
.steps .k{font-family:var(--fd);font-size:clamp(40px,4.4vw,60px);line-height:1;color:color-mix(in srgb,var(--bg) 30%,transparent);font-weight:${t.displayWeight}}
.step-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.step-ic{width:58px;height:58px;border-radius:16px;background:var(--ac);color:var(--aci);display:grid;place-items:center;box-shadow:0 12px 28px -14px var(--ac)}
.step-ic .ic,.step-ic svg{width:26px;height:26px}
.steps h3{font-size:21px;margin:18px 0 8px}
.steps p{margin:0;color:color-mix(in srgb,var(--bg) 65%,transparent)}
@media(max-width:800px){.steps{grid-template-columns:1fr}}
.about{display:grid;grid-template-columns:1.2fr .8fr;gap:clamp(30px,6vw,90px);align-items:start}
.about h2{font-size:clamp(34px,4.2vw,58px);margin:10px 0 0}
.about blockquote{margin:0;padding-left:20px;border-left:3px solid var(--ac);font-family:var(--fd);font-weight:${t.displayWeight};font-size:clamp(20px,2vw,26px);line-height:1.35;letter-spacing:${t.displayTracking}}
.facts{list-style:none;margin:0;padding:0;border-top:1px solid var(--ln)}
.facts li{display:flex;justify-content:space-between;gap:20px;padding:18px 0;border-bottom:1px solid var(--ln);font-size:15.5px}
.facts span{color:var(--mu)}.facts b{text-align:right;font-weight:600}
@media(max-width:800px){.about{grid-template-columns:1fr}}
.rev{display:grid;grid-template-columns:auto 1fr;gap:clamp(30px,6vw,80px);align-items:center;padding:clamp(36px,5vw,60px);border:1px solid var(--ln);border-radius:var(--r);background:var(--sf)}
.rev .num{font-family:var(--fd);font-size:clamp(90px,13vw,170px);line-height:.85;letter-spacing:-.04em;font-weight:${t.displayWeight}}
.rev .stars .st{width:26px;height:26px}
.rev p{color:var(--mu);margin:12px 0 26px;font-size:18px}
@media(max-width:700px){.rev{grid-template-columns:1fr}}
.faq{max-width:860px}
.faq details{border-bottom:1px solid var(--ln)}
.faq summary{list-style:none;cursor:pointer;padding:26px 0;display:flex;justify-content:space-between;gap:20px;font-size:clamp(19px,1.8vw,23px);font-weight:600}
.faq summary::-webkit-details-marker{display:none}
.faq summary i{width:22px;height:22px;flex:none;position:relative;margin-top:4px}
.faq summary i::before,.faq summary i::after{content:"";position:absolute;inset:10px 0 auto;height:2px;background:currentColor;transition:transform .35s var(--ease)}
.faq summary i::after{transform:rotate(90deg)}
.faq details[open] summary i::after{transform:rotate(0)}
.faq .ans{display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s var(--ease)}
.faq details[open] .ans{grid-template-rows:1fr}
.faq .ans>div{overflow:hidden}.faq .ans p{margin:0 0 26px;color:var(--mu);max-width:40em}
.ct{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,5vw,70px)}
.ct h2{font-size:clamp(40px,6vw,80px)}
.form{display:grid;gap:14px;margin-top:34px}
.form label{display:grid;gap:6px;font-size:14px;font-weight:600}
.form input,.form textarea{font:inherit;color:var(--ink);background:var(--sf);border:1px solid var(--ln);border-radius:calc(var(--r) * .6 + 2px);padding:14px 16px;outline:none;transition:border-color .2s,box-shadow .2s}
.form input:focus,.form textarea:focus{border-color:var(--ac);box-shadow:0 0 0 4px color-mix(in srgb,var(--ac) 18%,transparent)}
.form textarea{min-height:120px;resize:vertical}
.map{border-radius:var(--r);overflow:hidden;border:1px solid var(--ln);aspect-ratio:4/3;background:var(--sf)}
.map iframe{width:100%;height:100%;border:0;filter:grayscale(.2)}
.addr{margin-top:20px;display:grid;gap:6px;font-size:16px}
.addr a{font-weight:600}
@media(max-width:860px){.ct{grid-template-columns:1fr}}
.cta{text-align:center}
.cta h2{font-size:clamp(40px,7vw,96px);max-width:12em;margin:0 auto 34px}
/* cards de serviços + carrossel */
.car{position:relative}
.car-track{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.car-nav{display:none;gap:10px;justify-content:flex-end;margin-top:20px}
.car-nav button{width:48px;height:48px;border-radius:50%;border:1px solid var(--ln);background:var(--sf);color:var(--ink);display:grid;place-items:center;cursor:pointer;transition:background .25s,border-color .25s,transform .25s var(--ease)}
.car-nav button:hover{border-color:var(--ink);transform:translateY(-1px)}
.car-always .car-track,.car-track.cards.many{display:grid;grid-auto-flow:column;grid-template-columns:none;grid-auto-columns:minmax(300px,1fr);overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:6px}
.car-always .car-track::-webkit-scrollbar{display:none}
.car-always .car-track>*{scroll-snap-align:start}
.car-always .car-nav{display:flex}
.card{background:var(--sf);border:1px solid var(--ln);border-radius:calc(var(--r) + 4px);overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--sh);transition:transform .45s var(--ease),box-shadow .45s var(--ease)}
.card:hover{transform:translateY(-4px);box-shadow:0 2px 4px rgba(0,0,0,.05),0 30px 60px -30px rgba(0,0,0,.45)}
.card-img{position:relative;margin:0;aspect-ratio:4/3;overflow:hidden;background:color-mix(in srgb,var(--ac) 14%,var(--sf))}
.card-img img{width:100%;height:100%;object-fit:cover;object-position:center;filter:var(--imgf);transition:transform 1.1s var(--ease)}
.card:hover .card-img img{transform:scale(1.06)}
.card-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.28)),color-mix(in srgb,var(--ac) 10%,transparent);mix-blend-mode:multiply;pointer-events:none}
.card-noimg::after,.img-fail::after{display:none}
.card-ic{position:absolute;left:16px;bottom:16px;width:46px;height:46px;border-radius:12px;background:var(--bg);color:var(--ac);display:grid;place-items:center;z-index:1;box-shadow:0 8px 20px -10px rgba(0,0,0,.4)}
.card-noimg .card-ic,.img-fail .card-ic{left:50%;top:50%;bottom:auto;transform:translate(-50%,-50%);width:84px;height:84px;border-radius:22px;background:var(--ac);color:var(--aci)}
.card-noimg .card-ic .ic,.img-fail .card-ic .ic{width:38px;height:38px}
.card-head{display:flex;align-items:center;justify-content:space-between;padding:26px 24px 0}
.card-ic2{width:64px;height:64px;border-radius:18px;background:color-mix(in srgb,var(--ac) 14%,var(--sf));color:var(--act);display:grid;place-items:center;transition:background .35s,color .35s,transform .45s var(--ease)}
.card-ic2 .ic{width:30px;height:30px}
.card:hover .card-ic2{background:var(--ac);color:var(--aci);transform:rotate(-6deg) scale(1.04)}
.card-n{font-family:var(--fd);font-size:15px;letter-spacing:.08em;color:var(--mu)}
.card-b{padding:24px 24px 26px;display:flex;flex-direction:column;gap:10px;flex:1}
.card-b h3{font-family:var(--fd);font-weight:${t.displayWeight};letter-spacing:${t.displayTracking};font-size:clamp(21px,1.9vw,25px);line-height:1.15;margin:0}
.card-b p{margin:0;color:var(--mu);font-size:15.5px}
.card-cta{margin-top:auto;padding-top:8px;display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:15px;color:var(--act);text-decoration:none}
.card-cta .ic{width:18px;height:18px;transition:transform .3s var(--ease)}.card-cta:hover .ic{transform:translateX(4px)}
@media(max-width:900px){.car-track.cards{display:grid;grid-auto-flow:column;grid-template-columns:none;grid-auto-columns:minmax(78%,1fr);overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:6px}.car-track.cards>*{scroll-snap-align:start}.car .car-nav{display:flex}}
/* avaliações */
.rev-sum{display:flex;align-items:center;gap:16px;justify-self:end}
.rev-sum .mono-n{font-family:var(--fd);font-size:64px;line-height:1;font-weight:${t.displayWeight}}
.rev-sum>span{display:grid;gap:4px}.rev-sum .st{width:20px;height:20px}
.car-rev .car-track{grid-auto-columns:min(380px,84%)}
.gbadge{display:inline-flex;align-items:center;gap:14px;background:var(--sf);border:1px solid var(--ln);border-radius:16px;padding:12px 18px 12px 12px;text-decoration:none;color:var(--ink);box-shadow:var(--sh)}
.g-logo{width:44px;height:44px;border-radius:12px;background:#fff;display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,.12)}.g-logo svg{width:26px;height:26px}
.gb-t{display:grid;gap:2px}.gb-l{font-size:13px;color:var(--mu);font-weight:600;letter-spacing:.02em}
.gb-s{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.gb-s b{font-size:22px;font-family:var(--fd);line-height:1}.gb-s .stars{color:#FBBC04}
.g-big{width:64px;height:64px;border-radius:18px;background:#fff;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.12)}.g-big svg{width:38px;height:38px}
.rcard .stars .st,.gb-s .st,.rev .stars .st{color:#FBBC04}
.intro{font-size:clamp(17px,1.5vw,19px);line-height:1.65;margin:14px 0 18px;max-width:60ch}
.fit{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.fit-c{border-radius:calc(var(--r) + 4px);padding:30px;border:1px solid var(--ln);background:var(--sf);box-shadow:var(--sh)}
.fit-c h3{display:flex;align-items:center;gap:10px;margin:0 0 18px;font-size:20px}.fit-c h3 .ic{width:26px;height:26px;padding:4px;border-radius:50%}
.fit-c ul{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.fit-c li{display:flex;gap:12px;align-items:flex-start;line-height:1.5}.fit-c li .ic{flex:none;width:20px;height:20px;margin-top:2px}
.fit-yes{border-color:color-mix(in srgb,var(--ac) 40%,var(--ln))}.fit-yes h3 .ic{background:var(--ac);color:var(--aci)}.fit-yes li .ic{color:var(--act)}
.fit-no h3 .ic{background:color-mix(in srgb,var(--mu) 25%,transparent);color:var(--mu)}.fit-no li .ic{color:var(--mu)}.fit-no li{color:var(--mu)}
@media(max-width:800px){.fit{grid-template-columns:1fr}}
.rcard{margin:0;background:var(--sf);border:1px solid var(--ln);border-radius:calc(var(--r) + 4px);padding:28px;display:flex;flex-direction:column;gap:14px;box-shadow:var(--sh);min-height:260px}
.rcard .q{width:30px;height:30px;color:var(--act)}
.rcard blockquote{margin:0;font-size:16.5px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:7;-webkit-box-orient:vertical;overflow:hidden}
.rcard figcaption{margin-top:auto;display:grid;gap:2px;font-size:14px}.rcard figcaption span{color:var(--mu)}
.rev-src{margin:18px 0 0;font-size:14px}
@media(max-width:800px){.rev-sum{justify-self:start}}
/* reserva quando uma imagem falha ao carregar */
.img-fail{background:color-mix(in srgb,var(--ac) 16%,var(--sf))!important}
/* rodapé */
.ft{background:var(--ink);color:color-mix(in srgb,var(--bg) 78%,transparent);padding:clamp(56px,7vw,90px) 0 0;font-size:15px}
.ft a{color:inherit;text-decoration:none;transition:color .2s}.ft a:hover{color:var(--bg)}
.ft-g{display:grid;grid-template-columns:1.4fr 1fr 1fr 1.3fr;gap:40px}
.ft .brand{color:var(--bg);margin-bottom:16px}.ft .logo{background:#fff;border-radius:10px;padding:4px 8px}.ft .mono{background:var(--bg);color:var(--ink)}
.ft-brand p{margin:0 0 18px;max-width:34ch;line-height:1.55}
.soc{display:flex;gap:10px}.soc a{width:42px;height:42px;border-radius:50%;border:1px solid color-mix(in srgb,var(--bg) 25%,transparent);display:grid;place-items:center}
.soc a:hover{border-color:var(--bg)}
.ft-col{display:flex;flex-direction:column;gap:12px}
.ft-col h4{margin:0 0 6px;color:var(--bg);font-size:13px;letter-spacing:.12em;text-transform:uppercase}
.ft-ct a,.ft-ct span{display:flex;gap:10px;align-items:flex-start}.ft-ct svg{width:18px;height:18px;flex:none;margin-top:2px;color:var(--ac)}
.ft-bot{display:flex;flex-wrap:wrap;gap:10px 24px;align-items:center;justify-content:space-between;border-top:1px solid color-mix(in srgb,var(--bg) 14%,transparent);margin-top:clamp(40px,5vw,64px);padding:22px 0 110px;font-size:13.5px}
.priv summary{cursor:pointer;list-style:none;text-decoration:underline;text-underline-offset:3px}.priv summary::-webkit-details-marker{display:none}
.priv p{max-width:60ch;margin:10px 0 0}
.ft .credits{color:inherit;margin:0;width:100%}
@media(max-width:900px){.ft-g{grid-template-columns:1fr 1fr}.ft-brand{grid-column:1/-1}}
@media(max-width:560px){.ft-g{grid-template-columns:1fr}}
.waf{position:fixed;right:20px;bottom:20px;z-index:60;width:60px;height:60px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 14px 30px -10px rgba(0,0,0,.45);transform:scale(0);transition:transform .5s var(--ease)}
.waf.on{transform:scale(1)}
.waf svg{width:30px;height:30px}
.waf::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid #25d366;animation:pulse 2.4s var(--ease) infinite}
@keyframes pulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.6);opacity:0}}
.js .rv{opacity:0;transform:translateY(34px)}.rv{transition:opacity .9s var(--ease),transform .9s var(--ease);transition-delay:calc(var(--d,0) * 90ms)}
.js .rv.in{opacity:1;transform:none}
.demo{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99;background:#2b2440;color:#fff;font-size:12px;padding:6px 12px;border-radius:999px}
:focus-visible{outline:2px solid var(--ac);outline-offset:3px}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.js .rv{opacity:1;transform:none}.js .hero h1 .w>span{transform:none}.js .hero-bg img{transform:none}.waf{transform:none}}
${KIT_CSS}`;
}

export const SITE_JS = `
(function(){
  var d=document,root=d.documentElement;root.classList.add('js');
  requestAnimationFrame(function(){setTimeout(function(){root.classList.add('ready')},60)});
  var hd=d.querySelector('.hd'),waf=d.querySelector('.waf');
  function onScroll(){var y=window.scrollY;hd&&hd.classList.toggle('sc',y>20);waf&&waf.classList.toggle('on',y>window.innerHeight*.5);
    var st=d.querySelector('.steps');if(st){var r=st.getBoundingClientRect(),h=window.innerHeight;var p=Math.min(1,Math.max(0,(h*.85-r.top)/(r.height+h*.3)));st.style.setProperty('--p',p.toFixed(3))}}
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);
    var c=e.target.querySelector('[data-count]');if(c){var to=parseFloat(c.getAttribute('data-count')),t0=performance.now();(function tick(t){var k=Math.min(1,(t-t0)/1400),v=to*(1-Math.pow(1-k,3));c.textContent=v.toFixed(1).replace('.',',');if(k<1)requestAnimationFrame(tick)})(t0)}}})},{rootMargin:'0px 0px -10% 0px'});
    d.querySelectorAll('.rv').forEach(function(el){io.observe(el)})}else{d.querySelectorAll('.rv').forEach(function(el){el.classList.add('in')})}
  var f=d.querySelector('form[data-wa]');if(f){f.addEventListener('submit',function(ev){ev.preventDefault();var n=f.querySelector('[name=nome]').value.trim(),m=f.querySelector('[name=msg]').value.trim();
    var txt='Olá! Sou '+(n||'—')+'. '+(m||'Vim pelo site e gostaria de mais informações.');var url=f.getAttribute('data-wa');
    if(url){window.open(url+'?text='+encodeURIComponent(txt),'_blank','noopener')}})}
  var mb=d.querySelector('[data-menu]'),mn=d.getElementById('mnav');
  if(mb&&mn){var setM=function(o){mb.setAttribute('aria-expanded',o?'true':'false');mb.setAttribute('aria-label',o?'Fechar menu':'Abrir menu');mn.hidden=!o;d.body.classList.toggle('menu-open',o);hd&&hd.classList.toggle('menu-on',o)};
    mb.addEventListener('click',function(){setM(mn.hidden)});mn.addEventListener('click',function(e){if(e.target.closest('a'))setM(false)});
    d.addEventListener('keydown',function(e){if(e.key==='Escape'&&!mn.hidden){setM(false);mb.focus()}})}
  d.querySelectorAll('[data-car]').forEach(function(c){var tr=c.querySelector('.car-track');if(!tr)return;
    if(tr.children.length>3)tr.classList.add('many'),c.classList.add('car-always');
    c.querySelectorAll('[data-dir]').forEach(function(b){b.addEventListener('click',function(){var it=tr.firstElementChild;var w=it?it.getBoundingClientRect().width+22:320;tr.scrollBy({left:w*Number(b.getAttribute('data-dir')),behavior:'smooth'})})});
    if(c.hasAttribute('data-auto')&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){var hold=false;
      ['mouseenter','touchstart','focusin'].forEach(function(n){c.addEventListener(n,function(){hold=true},{passive:true})});
      ['mouseleave','focusout'].forEach(function(n){c.addEventListener(n,function(){hold=false})});
      setInterval(function(){if(hold||d.hidden)return;var it=tr.firstElementChild;var w=it?it.getBoundingClientRect().width+22:320;
        if(tr.scrollLeft+tr.clientWidth>=tr.scrollWidth-8)tr.scrollTo({left:0,behavior:'smooth'});else tr.scrollBy({left:w,behavior:'smooth'})},4500)}
    tr.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();var it=tr.firstElementChild;var w=it?it.getBoundingClientRect().width+22:320;tr.scrollBy({left:e.key==='ArrowRight'?w:-w,behavior:'smooth'})}})});
  d.querySelectorAll('img').forEach(function(i){var fail=function(){var f=i.closest('figure,.hero-media,.hero-band,.hero-bg,.logo')||i.parentElement;if(f)f.classList.add('img-fail');i.remove()};
    if(i.complete&&i.naturalWidth===0&&i.getAttribute('src'))fail();else i.addEventListener('error',fail)});
  if(window.matchMedia('(pointer:fine)').matches){d.querySelectorAll('[data-mag]').forEach(function(b){b.addEventListener('mousemove',function(e){var r=b.getBoundingClientRect();b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.18)+'px,'+((e.clientY-r.top-r.height/2)*.25)+'px)'});b.addEventListener('mouseleave',function(){b.style.transform=''})})}
  d.querySelectorAll('[data-map]').forEach(function(w){var b=w.querySelector('[data-map-btn]');if(!b)return;b.addEventListener('click',function(){var f=d.createElement('iframe');f.src=w.getAttribute('data-map');f.title='Mapa';f.referrerPolicy='no-referrer';w.textContent='';w.appendChild(f)})});
  d.querySelectorAll('[data-split]').forEach(function(h){var i=0;function wrap(t){var s=d.createElement('span');s.className='w';var x=d.createElement('span');x.style.transitionDelay=(120+i*70)+'ms';i++;x.appendChild(t);s.appendChild(x);return s}
    Array.prototype.slice.call(h.childNodes).forEach(function(n){if(n.nodeType===3){var parts=n.textContent.split(/(\\s+)/),fr=d.createDocumentFragment();parts.forEach(function(p){if(!p)return;if(/^\\s+$/.test(p))fr.appendChild(d.createTextNode(' '));else fr.appendChild(wrap(d.createTextNode(p)))});h.replaceChild(fr,n)}else if(n.nodeType===1){var s=wrap(n.cloneNode(true));h.replaceChild(s,n)}})});
  var rv=d.querySelector('.reveal');if(rv){var tx=rv.textContent.trim().split(/\\s+/);rv.textContent='';var ws=tx.map(function(w,k){var s=d.createElement('span');s.className='rw';s.textContent=w;rv.appendChild(s);if(k<tx.length-1)rv.appendChild(d.createTextNode(' '));return s});
    var lit=function(){var r=rv.getBoundingClientRect(),h=window.innerHeight,p=Math.min(1,Math.max(0,(h*.82-r.top)/(r.height+h*.25))),n=Math.round(p*ws.length*1.15);ws.forEach(function(s,k){s.style.setProperty('--o',k<n?'1':'.32')})};
    window.addEventListener('scroll',lit,{passive:true});lit()}
  var rm=window.matchMedia('(prefers-reduced-motion: reduce)').matches,chats=d.querySelectorAll('[data-chat]');
  function playChat(m){if(!m)return;(m._t||[]).forEach(clearTimeout);m._t=[];var tx=m.querySelector('.cm-txt'),full=tx.getAttribute('data-full')||'';function at(ms,fn){m._t.push(setTimeout(fn,ms))}
    m.classList.remove('s1','s2','s3','s4');tx.textContent='';if(rm){m.classList.add('s1','s3','s4');return}
    for(var i=0;i<full.length;i++)(function(k){at(700+k*34,function(){tx.textContent=full.slice(0,k+1)})})(i);
    var sd=700+full.length*34+450;at(sd,function(){tx.textContent='';m.classList.add('s1')});at(sd+700,function(){m.classList.add('s2')});at(sd+2300,function(){m.classList.remove('s2');m.classList.add('s3')});at(sd+3100,function(){m.classList.add('s4');if(typeof upd==='function')upd()})}
  if('IntersectionObserver' in window&&!rm){var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)playChat(e.target)})},{threshold:.6});chats.forEach(function(m){cio.observe(m)})}else chats.forEach(function(m){m.classList.add('s1','s3','s4')});
  d.querySelectorAll('[data-gcar]').forEach(function(car){var t=car.querySelector('.gcar-t'),cs=t.children,dots=car.querySelector('.gcar-dots'),idx=0,tm=null,held=false;
    for(var q=0;q<cs.length;q++)dots.appendChild(d.createElement('i'));
    function sw(){return cs.length>1?cs[1].offsetLeft-cs[0].offsetLeft:t.clientWidth}
    function mark(){idx=Math.max(0,Math.min(cs.length-1,Math.round(t.scrollLeft/sw())));Array.prototype.forEach.call(dots.children,function(x,n){x.classList.toggle('on',n===idx)})}
    function go(n){t.scrollTo({left:n*sw(),behavior:rm?'auto':'smooth'})}
    t.addEventListener('scroll',mark,{passive:true});mark();
    car.querySelectorAll('.gcar-b').forEach(function(b){b.addEventListener('click',function(){held=true;var n=idx+parseInt(b.getAttribute('data-d'),10);go(n<0?cs.length-1:n>=cs.length?0:n)})});
    ['pointerdown','touchstart','focusin','mouseenter'].forEach(function(ev){car.addEventListener(ev,function(){held=true},{passive:true})});
    if('IntersectionObserver' in window&&!rm)new IntersectionObserver(function(es){clearInterval(tm);if(es[0].isIntersecting)tm=setInterval(function(){if(!held)go(idx+1>=cs.length?0:idx+1)},5200)},{threshold:.4}).observe(car)});
  var stg=d.querySelector('.stage');
  d.querySelectorAll('.step').forEach(function(s,k,all){var go=function(){var f0=stg&&stg.children[0],was=f0&&f0.classList.contains('on');all.forEach(function(o){o.classList.toggle('on',o===s)});if(stg)Array.prototype.forEach.call(stg.children,function(c,j){c.classList.toggle('on',j===k)});if(k===0&&f0&&f0.hasAttribute('data-chat')&&!was)playChat(f0)};
    s.addEventListener('click',go);s.addEventListener('mouseenter',go);s.addEventListener('focus',go);s.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})});
  d.querySelectorAll('[data-fmt]').forEach(function(w){var sw=function(i){w.querySelectorAll('[data-f]').forEach(function(e){var on=e.getAttribute('data-f')===String(i);e.classList.toggle('on',on);if(e.tagName==='BUTTON')e.setAttribute('aria-selected',on?'true':'false')})};
    w.querySelectorAll('.seg button').forEach(function(b){b.addEventListener('click',function(){sw(b.getAttribute('data-f'))})})});
  var secs=d.querySelectorAll('[data-cta]'),live=d.querySelectorAll('[data-cta-live]'),dock=d.querySelector('.dock'),wb=d.body.getAttribute('data-wa')||'',last=null;
  if(secs.length&&live.length){var upd=function(){var mid=window.innerHeight*.45,cur=null;secs.forEach(function(s){var r=s.getBoundingClientRect();if(r.top<=mid&&r.bottom>mid)cur=s});
      if(cur&&cur!==last){last=cur;live.forEach(function(a){var t=a.querySelector('.t');if(t)t.textContent=cur.getAttribute('data-cta');if(wb)a.setAttribute('href',wb+encodeURIComponent(cur.getAttribute('data-msg')||''))})}
      if(dock){var fin=d.getElementById('contato'),inFin=false;if(fin){var q=fin.getBoundingClientRect();inFin=q.top<window.innerHeight*.7&&q.bottom>0}var cc=d.querySelector('.step .chat-mock.s4 .cm-cta'),rc=cc&&cc.getBoundingClientRect(),onC=!!rc&&rc.bottom>0&&rc.top<window.innerHeight;dock.classList.toggle('on',window.scrollY>window.innerHeight*.6&&!inFin&&!onC)}};
    window.addEventListener('scroll',upd,{passive:true});upd()}
})();`;

/** Título de seção com UMA palavra em cor (a última com 4+ letras). */
function hl(text: string): string {
  const parts = text.trim().split(/\s+/);
  let at = -1;
  for (let i = parts.length - 1; i >= 0; i--) if (/^\p{L}{4,}[^\p{L}]*$/u.test(parts[i])) { at = i; break; }
  return parts.map((p, i) => {
    if (i !== at) return esc(p);
    const m = p.match(/^(\p{L}+)(.*)$/u)!;
    return `<em class="hl">${esc(m[1])}</em>${esc(m[2])}`;
  }).join(' ');
}

function splitWords(text: string): string {
  const words = text.trim().split(/\s+/);
  // Sem palavra viúva: as duas últimas palavras andam juntas.
  if (words.length > 3) {
    const last = words.pop()!;
    words[words.length - 1] += ` ${last}`;
  }
  const last = words.length - 1;
  return words
    .map((w, i) => {
      const sp = i === last ? w.lastIndexOf(' ') : -1; // as 2 últimas palavras andam juntas, mas só a última ganha cor
      const html = i !== last ? esc(w) : sp > 0 ? `${esc(w.slice(0, sp + 1))}<em class="hl">${esc(w.slice(sp + 1))}</em>` : `<em class="hl">${esc(w)}</em>`;
      return `<span class="w"><span style="transition-delay:${120 + i * 70}ms">${html}</span></span>`;
    })
    .join(' ');
}

export interface RenderOptions {
  creditName?: string;
  /** Endereço público final do site (https://...). Habilita canonical, og:url e caminhos absolutos para a prévia de link. */
  siteUrl?: string;
  /** Exportação em pacote: caminhos relativos dos arquivos no lugar das imagens embutidas. */
  files?: { hero?: string; cta?: string; logo?: string; gallery?: string[]; services?: string[]; og?: string; favicon?: string };
  /** URL absoluta da imagem de compartilhamento (prévia online). */
  ogImageUrl?: string;
  /** Prévia: pede aos buscadores para não indexar. */
  noindex?: boolean;
  /** Modo editor: injeta data-editable e script de click-to-edit no iframe. */
  editorMode?: boolean;
}

/** Normaliza o endereço público (https apenas). */
export function cleanSiteUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return undefined;
    return `https://${u.hostname}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return undefined;
  }
}

export function renderSite(m: SiteModel, opts: RenderOptions = {}): string {
  if (m.layout === 'premium') return renderPremium(m, opts);
  const img = {
    hero: opts.files ? opts.files.hero : m.images.hero,
    cta: opts.files ? opts.files.cta : m.images.cta,
    logo: opts.files ? opts.files.logo : m.images.logo,
    gallery: opts.files ? opts.files.gallery ?? [] : m.images.gallery,
    services: opts.files ? opts.files.services ?? [] : m.images.services,
  };
  const base = cleanSiteUrl(opts.siteUrl);
  const absolute = (path?: string) => (path && base ? `${base}/${path.replace(/^\.?\//, '')}` : path);
  const ogImage = opts.ogImageUrl ?? absolute(opts.files?.og);
  const t = m.theme;
  const bgPic = img.cta ?? img.hero;
  const contactHref = m.waLink ?? '#contato';
  const contactAttrs = m.waLink ? ' target="_blank" rel="noopener"' : '';
  const logoMark = img.logo
    ? `<span class="logo"><img src="${img.logo}" alt="Logo ${esc(m.name)}" height="44"></span>`
    : `<span class="mono">${esc(initials(m.name))}</span>`;
  const waFor = (service: string) =>
    m.waE164 ? `https://wa.me/${m.waE164}?text=${encodeURIComponent(`Olá! Vim pelo site e tenho interesse em: ${service}.`)}` : '#contato';
  const navLinks: Array<[string, string]> = [['#sobre', 'Quem somos'], ['#servicos', 'Serviços'], ['#para-quem', 'Para quem é'], ...(m.reviews.length || m.rating != null ? [['#avaliacoes', 'Avaliações'] as [string, string]] : []), ['#contato', 'Contato']];
  const hasRating = m.rating != null && !!m.reviewCount;
  const ins = reviewInsights(m.reviews);
  const marquee = m.services.map((s) => `<span>${esc(s.title)}</span>`).join('');
  const circleText = `${m.ctaPrimary} · ${m.segmentLabel} · `.toUpperCase().slice(0, 44);
  // Ajusta o corpo do texto circular para caber na circunferência sem sobrepor letras.
  const circleSize = Math.min(9, 236 / (circleText.length * 0.68)).toFixed(2);

  // Layout do topo: variação por empresa (sem foto real, nunca usa layouts que dependem de imagem).
  const layout = img.hero ? m.heroLayout : m.heroLayout === 'centered' ? 'centered' : 'split';
  const photoHero = layout === 'fullbleed';
  const badge = `<a class="badge" href="${esc(contactHref)}"${contactAttrs} aria-label="${esc(m.ctaPrimary)}">
      <svg viewBox="0 0 100 100" aria-hidden="true"><defs><path id="c" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0"/></defs><text font-size="${circleSize}" fill="currentColor" font-family="inherit" font-weight="600"><textPath href="#c" textLength="236" lengthAdjust="spacing">${esc(circleText)}</textPath></text></svg>
      <span>↗</span>
    </a>`;

  // Cartão da marca: usado quando não há foto real. Só mostra informação verdadeira do cliente.
  const cardRows: string[] = [];
  if (hasRating) cardRows.push(`<li><span class="k">Google</span><span class="v">${stars(m.rating!)} ${m.rating!.toFixed(1).replace('.', ',')} · ${m.reviewCount} avaliações</span></li>`);
  cardRows.push(`<li><span class="k">Onde</span><span class="v">${esc(m.address || m.local)}</span></li>`);
  if (m.hours) cardRows.push(`<li><span class="k">Horário</span><span class="v">${esc(m.hours)}</span></li>`);
  if (m.phoneDisplay) cardRows.push(`<li><span class="k">Telefone</span><span class="v">${esc(m.phoneDisplay)}</span></li>`);
  if (m.instagram) cardRows.push(`<li><span class="k">Instagram</span><span class="v">@${esc(m.instagram)}</span></li>`);
  const brandCard = `<div class="bcard">
      <div class="bcard-top"><span class="bcard-logo">${img.logo ? `<img src="${img.logo}" alt="Logo ${esc(m.name)}">` : esc(initials(m.name))}</span><span class="bcard-seg">${esc(m.segmentLabel)}</span></div>
      <div class="bcard-name">${esc(m.name)}</div>
      <ul class="bcard-list">${cardRows.join('')}</ul>
      <a class="btn bcard-cta" href="${esc(contactHref)}"${contactAttrs}>${m.waLink ? WA_ICON : ''}${esc(m.ctaPrimary)}${ARROW}</a>
    </div>`;

  // Galeria só com 3+ fotos reais, em composição fechada (3 ou 5), com título — nunca fotos soltas.
  const galN = img.gallery.length >= 5 ? 5 : img.gallery.length >= 3 ? 3 : 0;
  const gallery = galN
    ? `<section class="s gal-s" id="fotos"><div class="wrap">
  <div class="sh"><h2 class="display rv">Conheça a ${esc(m.name)}</h2><p class="rv" style="--d:1">Fotos reais${m.neighborhood || m.city ? ` · ${esc(m.neighborhood || m.city)}` : ''}.</p></div>
  <div class="gal gal-${galN}">${img.gallery.slice(0, galN).map((src, i) => `<figure class="rv" style="--d:${i % 3}"><img src="${src}" alt="${esc(m.name)} — foto ${i + 1}" loading="lazy" decoding="async"></figure>`).join('')}</div>
</div></section>`
    : '';

  const gBadge = hasRating
    ? `<a class="gbadge rv" style="--d:1" href="${esc(m.mapsLink)}" target="_blank" rel="noopener" aria-label="Ver avaliações no Google"><span class="g-logo">${GOOGLE_G}</span><span class="gb-t"><span class="gb-l">Avaliações no Google</span><span class="gb-s"><b>${m.rating!.toFixed(1).replace('.', ',')}</b><span class="stars">${stars(m.rating!)}</span><span class="mu">${m.reviewCount} avaliações</span></span></span></a>`
    : `<span class="gbadge rv" style="--d:1"><span class="g-logo">${GOOGLE_G}</span><span class="gb-t"><span class="gb-l">Avaliações no Google</span></span></span>`;
  const allSvcImgs = m.services.length > 0 && m.services.every((_, i) => !!img.services[i]);
  const facts: Array<[string, string]> = [];
  if (m.address || m.local) facts.push(['Onde', m.address || m.local]);
  if (m.phoneDisplay) facts.push(['Telefone', m.phoneDisplay]);
  if (m.hours) facts.push(['Horário', m.hours]);
  if (hasRating) facts.push(['Avaliação no Google', `${m.rating!.toFixed(1).replace('.', ',')} de 5 (${m.reviewCount})`]);
  if (m.instagram) facts.push(['Instagram', `@${m.instagram}`]);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(m.seoTitle)}</title>
<meta name="description" content="${esc(m.seoDescription)}">
<meta name="theme-color" content="${esc(t.bg)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(m.seoTitle)}">
<meta property="og:description" content="${esc(m.seoDescription)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${esc(m.name)}">
<meta name="robots" content="${opts.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">
${base ? `<link rel="canonical" href="${esc(base)}/">
<meta property="og:url" content="${esc(base)}/">` : ''}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(m.name)} — ${esc(m.segmentLabel)}">` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(m.seoTitle)}">
<meta name="twitter:description" content="${esc(m.seoDescription)}">
${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : ''}
${opts.files?.favicon ? `<link rel="icon" type="image/png" href="${esc(opts.files.favicon)}">
<link rel="apple-touch-icon" href="${esc(opts.files.favicon)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(t.fontsHref)}">
<script type="application/ld+json">${jsonLd(m, base, ogImage)}</script>
<style>${bgPic ? `:root{--pic:url("${bgPic.replace(/"/g, '%22')}")}` : ''}${css(t)}</style>
</head>
<body>
${m.isDemo ? '<div class="demo">Demonstração — dados fictícios</div>' : ''}
<header class="hd${photoHero ? ' hd-over' : ''}"><div class="wrap">
  <a class="brand" href="#top" aria-label="${esc(m.name)} — início">${logoMark}<b>${esc(m.name)}</b></a>
  <nav class="nav" aria-label="Seções">${navLinks.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
  ${m.telLink ? `<a class="tel" href="${m.telLink}">${icon('phone')}${esc(m.phoneDisplay)}</a>` : ''}
  <a class="btn btn-ac hd-cta" href="${esc(contactHref)}"${contactAttrs}>${esc(m.ctaPrimary)}</a>
  <button class="mbtn" type="button" data-menu aria-expanded="false" aria-controls="mnav" aria-label="Abrir menu">${icon('menu', 'ic i-open')}${icon('close', 'ic i-close')}</button>
</div>
<div class="mnav" id="mnav" hidden>
  <nav aria-label="Menu">${navLinks.map(([h, l]) => `<a href="${h}">${l}${icon('right')}</a>`).join('')}</nav>
  <div class="mnav-ft">
    <a class="btn btn-ac" href="${esc(contactHref)}"${contactAttrs}>${m.waLink ? WA_ICON : ''}${esc(m.ctaPrimary)}</a>
    ${m.telLink ? `<a class="btn btn-ln" href="${m.telLink}">${icon('phone')}${esc(m.phoneDisplay)}</a>` : ''}
  </div>
</div></header>

<main id="top">
<section class="hero hero-${layout}${photoHero ? ' hero-photo' : ''}">
${photoHero ? `<div class="hero-bg" aria-hidden="true"><img src="${img.hero}" alt="" fetchpriority="high" decoding="async"></div>` : ''}
<div class="wrap hero-g">
  <div class="hero-l">
    <p class="eyebrow"><i></i>${esc(m.segmentLabel)} · ${esc(m.local)}</p>
    <h1 class="display">${splitWords(m.headline)}</h1>
    <p class="lead rv" style="--d:4">${esc(noWidow(m.subheadline))}</p>
    <div class="acts rv" style="--d:5">
      <a class="btn btn-ac" data-mag href="${esc(contactHref)}"${contactAttrs}>${m.waLink ? WA_ICON : ''}${esc(m.ctaPrimary)}${ARROW}</a>
      ${m.telLink ? `<a class="btn btn-ln" href="${m.telLink}">Ligar agora</a>` : '<a class="btn btn-ln" href="#servicos">Ver serviços</a>'}
    </div>
    <ul class="trust rv" style="--d:6">
      ${hasRating ? `<li>${stars(m.rating!)} <b>${m.rating!.toFixed(1).replace('.', ',')}</b> no Google (${m.reviewCount} avaliações)</li>` : ''}
      ${m.waLink ? '<li>Atendimento pelo WhatsApp</li>' : ''}
      <li>${esc(m.local)}</li>
    </ul>
  </div>
  ${layout === 'fullbleed' ? `<div class="hero-r">${badge}</div>`
    : layout === 'editorial' ? `<div class="hero-media"><img src="${img.hero}" alt="${esc(m.name)}" fetchpriority="high" decoding="async">${badge}</div>`
    : layout === 'centered' ? (img.hero ? `<div class="hero-band"><img src="${img.hero}" alt="${esc(m.name)}" fetchpriority="high" decoding="async"></div>` : `<div class="hero-strip rv" style="--d:7">${brandCard}</div>`)
    : `<div class="hero-r">${brandCard}${badge}</div>`}
</div></section>

<div class="proof"><ul class="wrap">
  ${ins.themes.length ? `<li>${icon('heart')}<span>Clientes destacam <b>${esc(ins.themes.slice(0, 2).map((t) => t.label).join(' e '))}</b> <span class="mu">(${ins.themes[0].count} de ${ins.n} avaliações lidas)</span></span></li>` : ''}
  ${hasRating ? `<li>${stars(m.rating!)}<span><b>${m.rating!.toFixed(1).replace('.', ',')}</b> no Google · ${m.reviewCount} avaliações</span></li>` : ''}
  ${m.waLink ? `<li>${WA_ICON}<span><b>Resposta direta</b> pelo WhatsApp</span></li>` : ''}
  <li>${icon('pin')}<span>Atendimento em <b>${esc(m.neighborhood || m.city || m.local)}</b></span></li>
  ${m.hours ? `<li>${icon('clock')}<span>${esc(m.hours.length > 48 ? m.hours.slice(0, 45).replace(/\s+\S*$/, '') + '…' : m.hours)}</span></li>` : `<li>${icon('shield')}<span><b>Orientação sem compromisso</b> antes de decidir</span></li>`}
</ul></div>

<div class="mq" aria-hidden="true"><div class="mq-t">${marquee}${marquee}${marquee}${marquee}</div></div>

<section class="s" id="sobre"><div class="wrap about">
  <div><p class="eyebrow rv"><i></i>Quem somos</p><h2 class="display rv" style="--d:1">Conheça a ${esc(m.name)}</h2><p class="intro rv" style="--d:2">${esc(noWidow(m.intro))}</p>${m.services.length ? `<div class="spec rv" style="--d:3"><h3>Especialidades</h3><ul>${m.services.slice(0, 8).map((sv) => `<li>${esc(sv.title)}</li>`).join('')}</ul></div>` : ''}<blockquote class="rv" style="--d:3">${esc(noWidow(m.about))}</blockquote>${m.team.length ? `<div class="team rv" style="--d:4"><h3>Quem atende você</h3><ul>${m.team.map((t) => `<li><span class="team-av">${esc(initials(t.name.replace(/^(Dr|Dra|Eng|Arq|Adv)\.?\s+/i, '')))}</span><div><b>${esc(t.name)}</b>${t.text ? `<p>${esc(t.text)}</p>` : ''}</div></li>`).join('')}</ul></div>` : ''}</div>
  <ul class="facts rv" style="--d:2">${facts.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('')}</ul>
</div></section>

<section class="s" id="servicos"><div class="wrap">
  <div class="sh"><h2 class="display rv">${hl('O que fazemos')}</h2><p class="rv" style="--d:1">${esc(m.servicesLead)}</p></div>
  <div class="car${m.servicesLayout === 'list' ? ' car-always' : ''}" data-car role="region" aria-roledescription="carrossel" aria-label="Serviços">
    <div class="car-track cards${m.services.length % 3 === 0 ? ' stag' : ''}" tabindex="0">${m.services.map((sv, i) => {
      // Foto só quando TODOS os serviços têm uma (cards mistos de foto e ícone ficam desencontrados).
      const src = allSvcImgs ? img.services[i] : undefined;
      return `<article class="card rv${i === 0 && m.services.length === 5 ? ' feat' : ''}" style="--d:${i % 3}">
      ${src ? `<figure class="card-img"><img src="${src}" alt="${esc(sv.title)} — ${esc(m.name)}" loading="lazy" decoding="async" width="600" height="450"><span class="card-ic">${icon(iconFor(sv.title))}</span></figure>`
        : `<div class="card-head"><span class="card-ic2">${icon(iconFor(`${sv.title} ${m.segmentLabel}`))}</span><span class="card-n">${String(i + 1).padStart(2, '0')}</span></div>`}
      <div class="card-b"><h3>${esc(sv.title)}</h3>${sv.price ? `<span class="price">${esc(sv.price)}</span>` : ''}${sv.text ? `<p>${esc(noWidow(sv.text))}</p>` : ''}
        <a class="card-cta" href="${esc(waFor(sv.title))}"${m.waLink ? ' target="_blank" rel="noopener"' : ''}>${m.waLink ? 'Solicitar orçamento' : 'Fale com a gente'}${icon('arrow')}</a></div>
    </article>`;
    }).join('')}</div>
    <div class="car-nav" aria-hidden="false"><button type="button" data-dir="-1" aria-label="Serviço anterior">${icon('left')}</button><button type="button" data-dir="1" aria-label="Próximo serviço">${icon('right')}</button></div>
  </div>
</div></section>
${gallery}

<section class="s dark how${bgPic ? ' bgp' : ''}"><div class="wrap">
  <div class="sh"><h2 class="display rv">${hl('Como funciona')}</h2><p class="rv" style="--d:1">Do primeiro contato ao atendimento na ${esc(m.name)}.</p></div>
  <div class="how-g${m.waLink ? ' has-chat' : ''}">
  <div class="steps" style="--n:${m.steps.length}"><div class="bar"></div>${m.steps.map((s, i) => `<div class="step rv" style="--d:${i}"><div class="step-top"><span class="step-ic">${s.icon === 'wa' ? WA_ICON : icon(s.icon)}</span><span class="k">${String(i + 1).padStart(2, '0')}</span></div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('')}</div>
  ${m.waLink ? `<aside class="wa-mock rv" style="--d:2" aria-label="Exemplo de como a conversa começa"><div class="wa-top"><span class="wa-av">${esc(initials(m.name))}</span><div><b>${esc(m.name)}</b><small>WhatsApp${m.phoneDisplay ? ` · ${esc(m.phoneDisplay)}` : ''}</small></div></div><div class="wa-body"><p class="wa-out">${esc(m.ctaMessage)}<time>agora</time></p><p class="wa-typing" aria-hidden="true"><i></i><i></i><i></i></p></div><a class="btn btn-ac" href="${esc(m.waLink)}" target="_blank" rel="noopener">${WA_ICON}${esc(m.ctaPrimary)}</a></aside>` : ''}
  </div>
</div></section>


<section class="s fit-s" id="para-quem"><div class="wrap">
  <div class="sh"><h2 class="display rv">${hl('Para quem é')}</h2><p class="rv" style="--d:1">Sinceridade desde o começo: assim você sabe se a ${esc(m.name)} é o lugar certo para você.</p></div>
  <div class="fit">
    <div class="fit-c fit-yes rv"><h3>${icon('check')}É para você se…</h3><ul>${m.forWho.map((x) => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul></div>
    <div class="fit-c fit-no rv" style="--d:1"><h3>${icon('close')}Não é para você se…</h3><ul>${m.notFor.map((x) => `<li>${icon('close')}<span>${esc(x)}</span></li>`).join('')}</ul></div>
  </div>
</div></section>

${m.reviews.length ? `<section class="s rev-s" id="avaliacoes"><div class="wrap">
  <div class="sh"><h2 class="display rv">${hl('O que dizem os clientes')}</h2>${gBadge}</div>
  <div class="car car-always car-rev" data-car data-auto role="region" aria-roledescription="carrossel" aria-label="Avaliações de clientes">
    <div class="car-track" tabindex="0">${m.reviews.map((r) => `<figure class="rcard">${icon('quote', 'ic q')}<div class="stars" role="img" aria-label="${r.rating} de 5 estrelas">${stars(r.rating)}</div><blockquote>${esc(r.text)}</blockquote><figcaption><b>${esc(r.author)}</b><span>${r.when ? `${esc(r.when)} · ` : ''}Google</span></figcaption></figure>`).join('')}</div>
    <div class="car-nav"><button type="button" data-dir="-1" aria-label="Avaliação anterior">${icon('left')}</button><button type="button" data-dir="1" aria-label="Próxima avaliação">${icon('right')}</button></div>
  </div>
  <p class="rev-src mu">Avaliações publicadas no Google, exibidas como foram escritas. <a href="${esc(m.mapsLink)}" target="_blank" rel="noopener">Ver todas no Google</a></p>
</div></section>` : hasRating ? `<section class="s" id="avaliacoes"><div class="wrap">
  <div class="sh"><h2 class="display rv">${hl('O que dizem os clientes')}</h2></div>
  <div class="rev rv">
    <div class="g-big">${GOOGLE_G}</div>
    <div class="num" data-count="${m.rating!.toFixed(1)}">0,0</div>
    <div><div class="stars">${stars(m.rating!)}</div><p>Nota média de ${m.reviewCount} avaliações de clientes no Google.</p>
    <a class="btn btn-ln" href="${esc(m.mapsLink)}" target="_blank" rel="noopener">Ver avaliações no Google${ARROW}</a></div>
  </div>
</div></section>` : ''}

<section class="s obj" id="duvidas"><div class="wrap">
  <div class="sh"><h2 class="display rv">${hl('Dúvidas que travam a decisão')}</h2><p class="rv" style="--d:1">Respostas diretas para o que costuma segurar quem ainda está decidindo.</p></div>
  <div class="obj-g">${m.objections.map((o, i) => `<article class="obj-c rv" style="--d:${i}"><span class="obj-i">${icon('shield')}</span><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p>${(() => { const q = ins.quoteFor(themeOfObjection(o.title)); return q && themeOfObjection(o.title) ? `<blockquote class="obj-q">“${esc(q.text)}”<cite>${esc(q.author)} · avaliação no Google</cite></blockquote>` : ''; })()}</article>`).join('')}</div>
  <div class="acts rv" style="--d:3;margin-top:var(--s4)"><a class="btn btn-ac" href="${esc(contactHref)}"${contactAttrs}>${m.waLink ? WA_ICON : ''}${esc(m.ctaPrimary)}${ARROW}</a></div>
</div></section>

<section class="s"><div class="wrap">
  <div class="sh"><h2 class="display rv">${hl('Perguntas frequentes')}</h2></div>
  <div class="faq">${m.faq.map((f, i) => `<details class="rv" name="faq" style="--d:${i}"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}<i></i></summary><div class="ans"><div><p>${esc(f.a)}</p></div></div></details>`).join('')}</div>
</div></section>

<section class="s dark${bgPic ? ' bgp' : ''}" id="contato"><div class="wrap ct">
  <div>
    <h2 class="display rv">${hl('Vamos conversar?')}</h2>
    <p class="mu rv" style="--d:1">Mande uma mensagem${m.waLink ? ' — ela abre direto no nosso WhatsApp' : ''}.</p>
    <form class="form rv" style="--d:2" ${m.waLink ? `data-wa="https://wa.me/${esc(m.waE164)}"` : ''}>
      <label>Seu nome<input name="nome" autocomplete="name" required></label>
      <label>Como podemos ajudar?<textarea name="msg"></textarea></label>
      <div><button class="btn btn-ac" type="submit" ${m.waLink ? '' : 'disabled'}>${m.waLink ? `${WA_ICON}Enviar pelo WhatsApp` : 'Contato a configurar'}</button></div>
    </form>
  </div>
  <div class="rv" style="--d:2">
    ${m.mapEmbed ? `<div class="map" data-map="${esc(m.mapEmbed)}"><div class="map-ph"><span class="map-pin">${icon('pin')}</span><b>${esc(m.address || m.local)}</b><button class="btn btn-ac" type="button" data-map-btn>Ver mapa aqui</button></div></div>` : ''}
    <div class="addr">
      <b>${esc(m.address || m.local)}</b>
      ${m.hours ? `<span class="mu">${esc(m.hours)}</span>` : ''}
      ${m.telLink ? `<a href="${m.telLink}">${esc(m.phoneDisplay)}</a>` : ''}
      <a href="${esc(m.mapsLink)}" target="_blank" rel="noopener">Como chegar →</a>
    </div>
  </div>
</div></section>

<section class="cta${img.cta ? ' cta-photo' : ''}">${img.cta ? `<div class="cta-bg" aria-hidden="true"><img src="${img.cta}" alt="" loading="lazy" decoding="async"></div>` : ''}<div class="wrap">
  <h2 class="display rv">${hl(m.closing)}</h2>
  <a class="btn btn-ac rv" style="--d:1" data-mag href="${esc(contactHref)}"${contactAttrs}>${m.waLink ? WA_ICON : ''}${esc(m.ctaPrimary)}${ARROW}</a>
</div></section>
</main>

<footer class="ft"><div class="wrap ft-g">
  <div class="ft-brand">
    <a class="brand" href="#top">${logoMark}<b>${esc(m.name)}</b></a>
    <p>${esc(m.about.length > 170 ? m.about.slice(0, 167).replace(/\s+\S*$/, '') + '…' : m.about)}</p>
    ${m.instagram || m.facebook ? `<div class="soc">${m.instagram ? `<a href="https://www.instagram.com/${esc(m.instagram)}/" target="_blank" rel="noopener" aria-label="Instagram">${icon('instagram')}</a>` : ''}${m.facebook ? `<a href="${esc(m.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${icon('facebook')}</a>` : ''}</div>` : ''}
  </div>
  <nav class="ft-col" aria-label="Rodapé"><h4>Navegação</h4>${navLinks.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
  <div class="ft-col"><h4>Serviços</h4>${m.services.slice(0, 6).map((sv) => `<a href="#servicos">${esc(sv.title)}</a>`).join('')}</div>
  <div class="ft-col ft-ct"><h4>Contato</h4>
    ${m.waLink ? `<a href="${esc(m.waLink)}" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>` : ''}
    ${m.telLink ? `<a href="${m.telLink}">${icon('phone')}${esc(m.phoneDisplay)}</a>` : ''}
    ${m.email ? `<a href="mailto:${esc(m.email)}">${icon('mail')}${esc(m.email)}</a>` : ''}
    <a href="${esc(m.mapsLink)}" target="_blank" rel="noopener">${icon('pin')}${esc(m.address || m.local)}</a>
    ${m.hours ? `<span>${icon('clock')}${esc(m.hours)}</span>` : ''}
  </div>
</div>
<div class="wrap ft-bot">
  <span>© ${new Date().getFullYear()} ${esc(m.name)}</span>
  <details class="priv"><summary>Privacidade</summary><p>Este site não coleta dados pessoais nem usa cookies próprios. O formulário de contato apenas abre uma conversa no WhatsApp com a mensagem que você escrever. O mapa (Google Maps) e as fontes (Google Fonts) são carregados desses serviços.</p></details>
  ${m.images.credits.length ? `<span class="credits">Fotos: ${esc(m.images.credits.join(' · '))}</span>` : ''}
  ${opts.creditName ? `<span>Site por ${esc(opts.creditName)}</span>` : ''}
</div></footer>
${m.waLink ? `<a class="waf" href="${esc(m.waLink)}" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp">${WA_ICON}</a>` : ''}
<script>${SITE_JS}</script>
</body>
</html>`;
}
