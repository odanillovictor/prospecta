// Reúne o que já existe do cliente (site atual + perfil do Google + OSM) para montar o novo site
// com a identidade dele: logo, fotos, cor da marca, serviços, Instagram, horário e descrição.
import type { ImageRef, Lead, SiteDraft } from '../types';
import { THEMES } from './themes';
import { seedOf } from './variation';
import { stockCredit, type StockPhoto } from '../providers/openverse';

export interface ImageCandidate extends ImageRef {
  label: string;
  /** Foto ilustrativa (não é do cliente). */
  stock?: boolean;
  suggested?: 'logo' | 'hero' | 'gallery';
}

export function imageCandidates(lead: Lead, stock: StockPhoto[] = []): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: ImageCandidate) => {
    if (seen.has(c.value)) return;
    seen.add(c.value);
    out.push(c);
  };
  const b = lead.diagnosis?.ok ? lead.diagnosis.facts?.brand : undefined;
  if (b?.logo) add({ kind: 'url', value: b.logo, label: 'Logo do site atual', suggested: 'logo' });
  (lead.imageUrls ?? []).forEach((u, i) =>
    add({ kind: 'url', value: u, attribution: 'Google Maps', label: `Foto do Google Maps ${i + 1}`, suggested: i === 0 ? 'hero' : 'gallery' }),
  );
  (lead.photos ?? []).forEach((p, i) =>
    add({ kind: 'place', value: p.name, attribution: p.attribution, label: `Foto do Google ${i + 1}`, suggested: i === 0 ? 'hero' : 'gallery' }),
  );
  if (b?.ogImage) add({ kind: 'url', value: b.ogImage, label: 'Imagem de destaque do site', suggested: out.some((x) => x.suggested === 'hero') ? 'gallery' : 'hero' });
  (b?.images ?? []).forEach((u, i) => add({ kind: 'url', value: u, label: `Foto do site ${i + 1}`, suggested: 'gallery' }));
  if (b?.icon && !b.logo) add({ kind: 'url', value: b.icon, label: 'Ícone do site', suggested: 'logo' });
  const own = out.length;
  // Fotos ilustrativas entram por último e numa ordem própria de cada empresa (para não repetir entre leads).
  const start = stock.length ? seedOf(lead.id) % stock.length : 0;
  stock.forEach((_, i) => {
    const p = stock[(start + i) % stock.length];
    add({ kind: 'url', value: p.url, attribution: `Foto ilustrativa: ${stockCredit(p)}`, label: `Ilustrativa ${i + 1}`, stock: true, suggested: !own && i === 0 ? 'hero' : 'gallery' });
  });
  return out.slice(0, 30);
}

/** Primeiro rascunho com a identidade do cliente. Só preenche o que ainda não foi editado. */
export function brandDraft(lead: Lead, current: SiteDraft = {}, stock: StockPhoto[] = []): SiteDraft {
  const b = lead.diagnosis?.ok ? lead.diagnosis.facts?.brand : undefined;
  const cands = imageCandidates(lead, stock);
  const next: SiteDraft = { ...current, brandApplied: true };
  const color = b?.themeColor ?? b?.colors[0];
  if (!current.accent && color) { next.accent = color; next.accentFrom = 'site'; }
  if (!current.instagram && (lead.instagram || b?.instagram)) next.instagram = lead.instagram || b?.instagram;
  if (!current.hours && lead.hours) next.hours = lead.hours;
  if (!current.about && lead.summary) next.about = lead.summary;
  if (!current.services && b && b.serviceHints.length >= 3) {
    next.services = b.serviceHints.slice(0, 6).map((t) => ({ title: t, text: '' }));
  }
  if (!current.logoSrc) {
    const logo = cands.find((c) => c.suggested === 'logo');
    if (logo) next.logoSrc = { kind: logo.kind, value: logo.value, attribution: logo.attribution };
  }
  if (!current.heroSrc) {
    // Topo: foto real primeiro (Google Maps; depois fotos JPG/WEBP do site). PNG e og:image costumam ser
    // banners com texto embutido, que brigam com o título — só como último recurso.
    const isPhoto = (c: ImageCandidate) => c.kind === 'place' || (/\.(jpe?g|webp)(\?|$)/i.test(c.value) && !/banner|logo|og[-_]/i.test(c.value));
    const hero = cands.find((c) => c.kind === 'place' || c.attribution === 'Google Maps') ?? cands.find((c) => c.suggested !== 'logo' && isPhoto(c)) ?? cands.find((c) => c.suggested === 'hero');
    if (hero) next.heroSrc = { kind: hero.kind, value: hero.value, attribution: hero.attribution };
  }
  if (!current.gallerySrc) {
    const gal = cands.filter((c) => c.suggested === 'gallery' && c.value !== next.heroSrc?.value).slice(0, 6);
    if (gal.length >= 2) next.gallerySrc = gal.map(({ kind, value, attribution }) => ({ kind, value, attribution }));
  }
  // Site atual escuro → estilo escuro; caso contrário mantém o do segmento.
  if (!current.theme && color && THEMES.noturno && /^#(0|1|2)/.test(b?.themeColor ?? '')) next.theme = 'noturno';
  return next;
}

export function hasClientAssets(lead: Lead): boolean {
  return imageCandidates(lead).length > 0 || !!lead.diagnosis?.facts?.brand?.colors.length || !!lead.hours || !!lead.summary;
}
