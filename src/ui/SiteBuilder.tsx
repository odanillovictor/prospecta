import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImageRef, Lead, SiteDraft } from '../core/types';
import { buildSiteModel, cleanSiteUrl, renderSite, type SiteImages } from '../core/site/render';
import { dataUrlToBytes, makeZip, type ZipEntry } from '../core/zip';
import { renderFavicon, renderOgImage, shrinkDataUrl } from './ogImage';
import { newPreviewId } from '../core/preview';
import { brandDraft, hasClientAssets, imageCandidates, type ImageCandidate } from '../core/site/clientAssets';
import type { StockPhoto } from '../core/providers/openverse';
import { api, ApiError, coletorApi } from '../data/api';
import { enrichFromMaps, runDiagnosis } from './actions';
import { hasOwnSite } from '../core/scoring';
import { useIntegrations } from './App';
import { THEMES } from '../core/site/themes';
import { packFor } from '../core/site/packs';
import { seedOf, servicesFrom } from '../core/site/variation';
import { MIN_PHOTO_SCORE } from '../core/site/photoScore';
import { hammingDistance, imageHash, photoQuality } from './photoQuality';
import { imagePixels } from './imagePixels';
import { brandColorFrom, looksLikeLogo } from '../core/site/palette';
import { heroQuery, rankStock, serviceQuery } from '../core/site/serviceImages';
import { stockCredit } from '../core/providers/openverse';
import { store, useSettings } from '../data/store';
import { robotApi } from '../data/robotApi';
import { Icon, Notice, copyText, downloadFile, slug, useToast } from './common';
import { EditorPanel } from './EditorPanel';

type Device = 'desktop' | 'mobile';
type Panel = 'conteudo' | 'visual' | 'comparativo' | 'editor';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return reject(new Error('Use PNG, JPG ou WEBP.'));
    if (file.size > 4_000_000) return reject(new Error('Imagem maior que 4 MB.'));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    r.readAsDataURL(file);
  });
}

export function SiteBuilder({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { seller } = useSettings();
  const toast = useToast();
  const pack = useMemo(() => packFor(lead.niche, lead.category), [lead.niche, lead.category]);
  // Mesmos serviços que o site mostra (categorias reais do Maps + pacote do segmento).
  const servicesFromLead = useMemo(() => servicesFrom(lead, pack), [lead, pack]);
  // Na primeira abertura, já parte da identidade real do cliente (logo, fotos, cor, serviços, horário).
  const [draft, setDraft] = useState<SiteDraft>(() => {
    // Rascunhos antigos podiam ter fotos ilustrativas aplicadas sozinhas: remove (só fotos reais entram).
    const isStock = (r?: ImageRef) => !!r?.attribution?.startsWith('Foto ilustrativa');
    const raw = lead.siteDraft ?? {};
    const d: SiteDraft = {
      ...raw,
      heroSrc: isStock(raw.heroSrc) && !raw.heroAuto ? undefined : raw.heroSrc,
      gallerySrc: raw.gallerySrc?.filter((g) => !isStock(g)),
      serviceSrc: raw.serviceSrc?.some(isStock) ? undefined : raw.serviceSrc,
      ctaSrc: isStock(raw.ctaSrc) ? undefined : raw.ctaSrc,
    };
    return !d.brandApplied && hasClientAssets(lead) ? brandDraft(lead, d) : d;
  });
  const [uploads, setUploads] = useState<{ hero?: string; logo?: string }>({});
  const [blockUploads, setBlockUploads] = useState<Record<string, string>>({});
  const [serviceUploads, setServiceUploads] = useState<Record<number, string>>({});
  function handleBlockImage(blockId: string, file: File | null) {
    if (!file) { setBlockUploads((u) => { const n = { ...u }; delete n[blockId]; return n; }); return; }
    readImage(file).then((data) => setBlockUploads((u) => ({ ...u, [blockId]: data }))).catch((e) => toast(e instanceof Error ? e.message : 'Imagem inválida.', true));
  }
  function handleHeroUpload(file: File | null) {
    if (!file) { setUploads((u) => ({ ...u, hero: undefined })); return; }
    pickImage('hero', file);
  }
  function handleLogoUpload(file: File | null) {
    if (!file) { setUploads((u) => ({ ...u, logo: undefined })); return; }
    pickImage('logo', file);
  }
  function handleServiceUpload(index: number, file: File | null) {
    if (!file) { setServiceUploads((u) => { const n = { ...u }; delete n[index]; return n; }); return; }
    readImage(file).then((data) => setServiceUploads((u) => ({ ...u, [index]: data }))).catch((e) => toast(e instanceof Error ? e.message : 'Imagem inválida.', true));
  }
  const [resolved, setResolved] = useState<SiteImages>({});
  const [device, setDevice] = useState<Device>('desktop');
  /** Celular: o site em tela cheia (a prévia embutida ficava espremida). */
  const [fullView, setFullView] = useState(false);
  useEffect(() => {
    if (!fullView) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFullView(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [fullView]);
  // Fotos ilustrativas do segmento (só entram sozinhas quando não há foto real do cliente).
  const [stock, setStock] = useState<StockPhoto[]>([]);
  // Fotos ilustrativas já usadas neste site (topo + serviços): nenhuma foto se repete.
  const usedStock = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    api.stock(pack.id).then((s) => alive && setStock(s));
    return () => {
      alive = false;
    };
  }, [pack.id]);
  const candidates = useMemo(() => imageCandidates(lead, stock), [lead, stock]);
  // Fotos ilustrativas não entram sozinhas no topo nem na galeria (lá só fotos reais do cliente).
  // Nos cards de serviço, cada serviço ganha uma foto buscada pelo próprio serviço ("Tosa" → "dog grooming").
  const isStockRef = (r?: ImageRef) => !!r?.attribution?.startsWith('Foto ilustrativa');
  // Impressões digitais das fotos ilustrativas já usadas: nenhuma foto se repete (nem versões quase iguais).
  const usedHashes = useRef<string[]>([]);
  /** Primeira foto da lista que ainda não foi usada neste site (por endereço e por aparência). */
  async function pickUnique(list: StockPhoto[]): Promise<StockPhoto | undefined> {
    for (const x of list.slice(0, 10)) {
      if (usedStock.current.has(x.url)) continue;
      let h: string | null = null;
      try {
        const data = await api.image({ kind: 'url', value: x.url });
        h = await imageHash(data);
      } catch {
        continue; // não baixou: não serve
      }
      if (h && usedHashes.current.some((u) => hammingDistance(u, h as string) <= 8)) continue;
      usedStock.current.add(x.url);
      if (h) usedHashes.current.push(h);
      return x;
    }
    return undefined;
  }
  const stockRanked = async (q: string, strict = false) => (q ? rankStock(await api.stockFor(q), q, strict) : []);
  const segCtx = `${lead.niche ?? ''} ${lead.category ?? ''} ${lead.name}`;
  /** Foto ilustrativa do segmento (Pixabay/Wikimedia), com novas tentativas se o serviço recusar. */
  async function pickStockHero(): Promise<ImageRef | undefined> {
    // Topo: só foto cujas tags batem com o segmento (senão o topo usa o cartão da marca, nunca uma foto sem nexo).
    let photos = await stockRanked(heroQuery(pack.id, segCtx), true);
    for (let t = 1; !photos.length && t < 4; t++) {
      await new Promise((r) => setTimeout(r, 1500 * t));
      photos = await stockRanked(heroQuery(pack.id, segCtx), true);
    }
    const start = photos.length ? seedOf(lead.id) % Math.min(photos.length, 5) : 0;
    const p = await pickUnique([...photos.slice(start), ...photos.slice(0, start)]);
    return p ? { kind: 'url', value: p.url, attribution: `Foto ilustrativa: ${stockCredit(p)}` } : undefined;
  }
  const serviceTitles = (draft.services ?? servicesFromLead).map((s) => s.title).join('|');
  useEffect(() => {
    if (draft.serviceSrc?.length || lead.catalog?.items.length) return;
    let alive = true;
    const titles = serviceTitles.split('|').filter(Boolean);
    (async () => {
      const picks: ImageRef[] = [];
      for (let i = 0; i < titles.length; i++) {
        // O Pixabay às vezes recusa por excesso de pedidos vindos do Cloudflare (429): tenta de novo com pausa.
        const svcQuery = serviceQuery(titles[i], pack.id, i, segCtx);
        let photos = await stockRanked(svcQuery, true);
        for (let t = 1; !photos.length && svcQuery && t < 4 && alive; t++) {
          await new Promise((r) => setTimeout(r, 1500 * t));
          photos = await stockRanked(svcQuery, true);
        }
        // Ordem própria de cada empresa (para dois leads do mesmo segmento não terem as mesmas fotos).
        const start = photos.length ? seedOf(`${lead.id}|${i}`) % Math.min(photos.length, 4) : 0;
        let p = await pickUnique([...photos.slice(start), ...photos.slice(0, start)]);
        // Sem foto coerente com o serviço: fica sem foto (cartão com ícone). Foto genérica no lugar errado é pior.
        picks.push(p ? { kind: 'url', value: p.url, attribution: `Foto ilustrativa: ${stockCredit(p)}` } : { kind: 'url', value: '' });
      }
      if (alive && picks.some((p) => p.value)) setDraft((d) => (d.serviceSrc?.length ? d : { ...d, serviceSrc: picks }));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTitles, draft.serviceSrc?.length]);

  // Identidade real automática: diagnostica o site atual (logo, cores, fotos) e traz do Google Maps a foto e as
  // avaliações reais quando o lead veio da busca rápida. Cada coisa uma vez por abertura.
  const [fetching, setFetching] = useState<string | null>(null);
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || lead.isDemo) return;
    autoRan.current = true;
    (async () => {
      if (hasOwnSite(lead) && !lead.diagnosis) {
        setFetching('Lendo o site atual do cliente (logo, cores e fotos)…');
        await runDiagnosis(lead);
      }
      if (!lead.reviews?.length && !lead.imageUrls?.length && !lead.photos?.length) {
        const up = await coletorApi.health().then(() => true).catch(() => false);
        if (up) {
          const r = await enrichFromMaps(lead, setFetching);
          toast(r.message);
        }
      }
      setFetching(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Quando chegam dados novos (diagnóstico ou Maps), preenche o que ainda está vazio no rascunho.
  const assetsKey = `${lead.diagnosis?.ranAt ?? ''}|${lead.imageUrls?.length ?? 0}|${lead.reviews?.length ?? 0}`;
  const firstKey = useRef(assetsKey);
  useEffect(() => {
    if (assetsKey === firstKey.current) return;
    setDraft((d) => brandDraft(lead, d.heroAuto ? { ...d, heroSrc: undefined, heroAuto: undefined } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsKey]);

  // Busca as imagens escolhidas (Google/site atual) pelo servidor e embute como data URL.
  const refsKey = JSON.stringify([draft.heroSrc, draft.ctaSrc, draft.logoSrc, draft.gallerySrc, draft.serviceSrc]);
  useEffect(() => {
    let alive = true;
    const load = (r?: ImageRef) => (r?.value ? api.image(r).catch(() => undefined) : Promise.resolve(undefined));
    Promise.all([load(draft.heroSrc), load(draft.logoSrc), Promise.all((draft.gallerySrc ?? []).map(load)), Promise.all((draft.serviceSrc ?? []).map(load)), load(draft.ctaSrc)]).then(async ([hero, logo, galRaw, svc, cta]) => {
      if (!alive) return;
      // Galeria: só fotos do cliente que "caem bem" (nítidas, com luz e cor, sem cara de papel/print).
      const gal = await Promise.all(galRaw.map(async (g) => (g && ((await photoQuality(g, 'gallery'))?.score ?? 0) >= MIN_PHOTO_SCORE.gallery ? g : undefined)));
      // Topo: foto do cliente poluída/escura/borrada é trocada por uma ilustrativa coerente com o segmento.
      const heroRef = draft.heroSrc;
      if (hero && heroRef && !isStockRef(heroRef) && draft.heroChecked !== heroRef.value) {
        const q = await photoQuality(hero, 'hero');
        if (!alive) return;
        if (q && q.score < MIN_PHOTO_SCORE.hero) {
          const stockHero = await pickStockHero();
          if (!alive) return;
          if (stockHero) {
            setDraft((d) => (d.heroSrc?.value === heroRef.value ? { ...d, heroSrc: stockHero, heroAuto: true, heroChecked: heroRef.value, heroNote: q.reasons.join(', ') || 'qualidade baixa' } : d));
            return;
          }
        }
        setDraft((d) => (d.heroSrc?.value === heroRef.value ? { ...d, heroChecked: heroRef.value } : d));
      }
      const refs = [draft.heroSrc, draft.ctaSrc, ...(draft.gallerySrc ?? []), ...(draft.serviceSrc ?? [])].filter((r): r is ImageRef => !!r?.value && (r.kind === 'place' || !!r.attribution));
      setResolved({
        hero,
        cta,
        logo,
        gallery: gal.filter((x): x is string => !!x),
        services: svc.map((x) => x ?? ''),
        credits: creditLines(refs),
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey]);
  // Sem foto do cliente: topo com foto ilustrativa coerente JÁ, sem esperar o Maps (~2 min). Se o site atual ou o
  // Maps trouxerem foto real, ela substitui esta (heroAuto é descartado quando chegam dados novos).
  useEffect(() => {
    if (draft.heroSrc || uploads.hero) return;
    let alive = true;
    pickStockHero().then((ref) => alive && ref && setDraft((d) => (d.heroSrc ? d : { ...d, heroSrc: ref, heroAuto: true })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!draft.heroSrc, !!uploads.hero]);
  // Foto de fundo da chamada final: outra foto do segmento (nunca a mesma do topo ou dos cards), depois que o topo existe.
  useEffect(() => {
    if (draft.ctaSrc || !(draft.heroSrc || uploads.hero)) return;
    let alive = true;
    pickStockHero().then((ref) => alive && ref && setDraft((d) => (d.ctaSrc ? d : { ...d, ctaSrc: ref })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!draft.heroSrc, !!uploads.hero, !!draft.ctaSrc]);
  // Catálogo do WhatsApp Business: as fotos dos itens são do próprio negócio e batem com cada serviço.
  const catalogImgs = draft.services?.length ? [] : (lead.catalog?.items ?? []).filter((i) => i.title.trim()).slice(0, 8).map((i) => i.image ?? '');
  const baseServices = catalogImgs.length ? catalogImgs : (resolved.services ?? []);
  const finalServices = Object.keys(serviceUploads).length
    ? baseServices.map((img, i) => serviceUploads[i] ?? img)
    : baseServices;
  const images: SiteImages = { ...resolved, hero: uploads.hero ?? resolved.hero, logo: uploads.logo ?? resolved.logo, services: finalServices, customBlocks: blockUploads };
  // Instagram do cliente (perfil público, lido pelo Chrome via extensão do robô): logo/foto de perfil, posts e bio.
  // Imagens ficam só na sessão; o texto (bio e legendas) é guardado no lead.
  const [ig, setIg] = useState<{ foto?: string; fotoEhLogo?: boolean; posts: string[] }>({ posts: [] });
  const [igState, setIgState] = useState<'idle' | 'lendo' | 'ok' | 'erro'>('idle');
  const [igMsg, setIgMsg] = useState('');
  const igHandle = (draft.instagram ?? lead.instagram ?? '').replace(/^@/, '').replace(/[^\w.]/g, '');
  useEffect(() => {
    if (lead.isDemo || !igHandle || igState !== 'idle') return;
    let alive = true;
    (async () => {
      const st = await robotApi.status().catch(() => null);
      if (!st || st.whatsapp === 'extensao_ausente' || st.ocupado || !alive) return;
      setIgState('lendo');
      try {
        const { instagram: r } = await robotApi.instagram(igHandle);
        if (!alive) return;
        store.updateLead(lead.id, { instagramData: { at: new Date().toISOString(), handle: r.handle, name: r.nome || undefined, bio: r.bio || undefined, captions: r.posts.map((p) => p.alt).filter(Boolean).slice(0, 9) } });
        const px = r.foto ? await imagePixels(r.foto) : null;
        const logoLike = !!px && looksLikeLogo(px);
        setIg({ foto: r.foto ?? undefined, fotoEhLogo: logoLike, posts: r.posts.map((p) => p.img) });
        if (logoLike && r.foto) setUploads((u) => (u.logo ? u : { ...u, logo: r.foto! }));
        setIgState('ok');
        setIgMsg(logoLike ? 'Foto de perfil parece logo: usada como logo.' : 'Foto de perfil e posts lidos (sem logo no perfil).');
      } catch (e) {
        if (!alive) return;
        setIgState('erro');
        setIgMsg(e instanceof Error ? e.message : 'Não consegui ler o Instagram.');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igHandle]);
  // Cor da marca sem inventar: cores do logo; sem logo, predominância nas fotos reais do cliente (Instagram/Maps).
  const palKey = `${draft.accent ?? ''}|${draft.accentFrom ?? ''}|${images.logo?.length ?? 0}|${resolved.hero?.length ?? 0}|${resolved.gallery?.length ?? 0}|${uploads.hero?.length ?? 0}|${ig.posts.length}|${ig.foto?.length ?? 0}`;
  useEffect(() => {
    if (draft.accentFrom === 'manual' || draft.accentFrom === 'site' || draft.accentFrom === 'logo') return;
    if (draft.accent && draft.accentFrom !== 'fotos') return;
    const logo = images.logo;
    const clientHero = uploads.hero ?? (draft.heroSrc && !isStockRef(draft.heroSrc) && !draft.heroAuto ? resolved.hero : undefined);
    const photos = [clientHero, ...(resolved.gallery ?? []), ...ig.posts, ig.fotoEhLogo ? undefined : ig.foto].filter((x): x is string => !!x);
    if (!logo && !photos.length) return;
    let alive = true;
    (async () => {
      const [lp, pp] = await Promise.all([logo ? imagePixels(logo) : null, Promise.all(photos.map((p) => imagePixels(p)))]);
      if (!alive) return;
      const c = brandColorFrom({ logo: lp ?? undefined, photos: pp.filter((x): x is NonNullable<typeof x> => !!x) });
      if (c) setDraft((d) => (d.accentFrom === 'manual' || d.accentFrom === 'site' || d.accentFrom === 'logo' || (d.accent && d.accentFrom !== 'fotos') ? d : { ...d, accent: c.hex, accentFrom: c.source }));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palKey]);
  // Lê o catálogo do WhatsApp Business sozinho (uma vez por lead), se o robô estiver ligado neste computador.
  const [catalogState, setCatalogState] = useState<'idle' | 'lendo' | 'ok' | 'sem' | 'erro'>('idle');
  useEffect(() => {
    const number = lead.whatsapp || lead.phone;
    if (lead.isDemo || lead.catalog || !number || !/^55\d{10,11}$/.test(number)) return;
    let alive = true;
    (async () => {
      const st = await robotApi.status().catch(() => null);
      if (!st || st.whatsapp !== 'conectado' || st.ocupado || !alive) return;
      setCatalogState('lendo');
      try {
        const { catalogo } = await robotApi.catalogo(number);
        const items = catalogo.itens.filter((i) => i.titulo).map((i) => ({ title: i.titulo, text: i.descricao || undefined, price: i.preco || undefined, image: i.imagem || undefined }));
        store.updateLead(lead.id, { catalog: { at: new Date().toISOString(), businessName: catalogo.nome || undefined, items } });
        if (alive) setCatalogState(items.length ? 'ok' : 'sem');
      } catch {
        if (alive) setCatalogState('erro');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);
  const [panel, setPanel] = useState<Panel>('conteudo');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Escuta clicks do iframe em modo editor
  useEffect(() => {
    if (panel !== 'editor') { setActiveSection(null); return; }
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'prospecta-section') return;
      setActiveSection(e.data.section as string);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [panel]);

  const heroRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Salva os ajustes no lead (textos/tema; imagens ficam só nesta sessão para não lotar o armazenamento).
  const savedDraft = useDebounced(draft, 500);
  useEffect(() => {
    store.updateLead(lead.id, { siteDraft: { ...savedDraft, updatedAt: new Date().toISOString() } });
  }, [savedDraft, lead.id]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  const model = useMemo(() => buildSiteModel(lead, { ...draft, layout: draft.layout ?? 'premium' }, images), [lead, draft, resolved, uploads]); // eslint-disable-line react-hooks/exhaustive-deps
  const html = useMemo(() => renderSite(model, { creditName: seller.company || seller.name || undefined }), [model, seller]);
  const editorHtml = useMemo(() => renderSite(model, { creditName: seller.company || seller.name || undefined, editorMode: true }), [model, seller]);
  const previewHtml = useDebounced(html, 350);
  const previewEditorHtml = useDebounced(editorHtml, 350);

  const set = <K extends keyof SiteDraft>(k: K, v: SiteDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const services = draft.services ?? servicesFromLead;
  const setService = (i: number, field: 'title' | 'text', v: string) =>
    set('services', services.map((s, j) => (j === i ? { ...s, [field]: v } : s)));

  async function pickImage(kind: 'hero' | 'logo', file?: File) {
    if (!file) return;
    try {
      const data = await readImage(file);
      setUploads((im) => ({ ...im, [kind]: data }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Imagem inválida.', true);
    }
  }

  const fileName = `site-${slug(model.name)}.html`;
  const siteUrl = cleanSiteUrl(draft.siteUrl);
  const [exporting, setExporting] = useState(false);
  const [ogPreview, setOgPreview] = useState<string | null>(null);

  // Prévia da imagem de compartilhamento (atualiza quando foto, logo, nome ou cor mudam).
  const ogKey = `${model.name}|${model.theme.accent}|${model.theme.id}|${!!model.images.hero}|${!!model.images.logo}|${model.rating}|${model.ctaPrimary}|${(model.images.hero ?? '').length}`;
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => renderOgImage(model).then((u) => alive && setOgPreview(u)).catch(() => {}), 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ogKey]);

  /** Pacote pronto para publicar: index.html + imagens + og.jpg + favicon + robots.txt + sitemap.xml. */
  async function exportZip() {
    setExporting(true);
    try {
      const entries: ZipEntry[] = [];
      const put = (data: string | undefined, name: string) => {
        const b = data ? dataUrlToBytes(data) : null;
        if (!b) return undefined;
        const path = `img/${name}.${b.ext}`;
        entries.push({ path, data: b.bytes });
        return path;
      };
      const hero = put(model.images.hero, 'topo');
      const cta = put(model.images.cta, 'fundo');
      const logo = put(model.images.logo, 'logo');
      const gallery = model.images.gallery.map((g, i) => put(g, `foto-${i + 1}`)).filter((x): x is string => !!x);
      const services = model.images.services.map((g, i) => (g ? put(g, `servico-${i + 1}`) ?? '' : ''));
      const og = dataUrlToBytes(await renderOgImage(model));
      if (og) entries.push({ path: 'og.jpg', data: og.bytes });
      const fav = dataUrlToBytes(await renderFavicon(model));
      if (fav) entries.push({ path: 'favicon.png', data: fav.bytes });
      const html = renderSite(model, { creditName: seller.company || seller.name || undefined, siteUrl, files: { hero, cta, logo, gallery, services, og: og ? 'og.jpg' : undefined, favicon: fav ? 'favicon.png' : undefined } });
      entries.unshift({ path: 'index.html', data: html });
      entries.push({ path: 'robots.txt', data: `User-agent: *
Allow: /
${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml
` : ''}` });
      if (siteUrl) {
        entries.push({ path: 'sitemap.xml', data: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url></urlset>
` });
      }
      const zip = makeZip(entries);
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `site-${slug(model.name)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(siteUrl ? 'Site baixado (.zip) pronto para publicar.' : 'Site baixado. Informe o endereço publicado para a prévia de link funcionar no WhatsApp.');
    } catch {
      toast('Não foi possível gerar o pacote.', true);
    } finally {
      setExporting(false);
    }
  }
  // Prévia online no Cloudflare: link público para abrir e mandar ao cliente.
  const [publishing, setPublishing] = useState(false);
  async function publishOnline() {
    // Abre a aba já no clique (depois de "await" o navegador bloquearia o pop-up).
    const tab = window.open('', '_blank');
    if (tab) {
      tab.opener = null;
      tab.document.write('<p style="font-family:system-ui;padding:40px">Publicando a prévia do site…</p>');
    }
    setPublishing(true);
    try {
      const id = draft.previewId && /^[a-z0-9]{10}$/.test(draft.previewId) ? draft.previewId : newPreviewId();
      const light: SiteImages = {
        ...images,
        hero: await shrinkDataUrl(images.hero),
        cta: await shrinkDataUrl(images.cta, 1400, 0.76),
        gallery: await Promise.all((images.gallery ?? []).map((g) => shrinkDataUrl(g, 1400))).then((g) => g.filter((x): x is string => !!x)),
        services: await Promise.all((images.services ?? []).map((g) => (g ? shrinkDataUrl(g, 900) : Promise.resolve('')))).then((g) => g.map((x) => x ?? '')),
      };
      const m = buildSiteModel(lead, { ...draft, layout: draft.layout ?? 'premium' }, light);
      const og = await renderOgImage(m);
      const htmlOnline = renderSite(m, { creditName: seller.company || seller.name || undefined, ogImageUrl: `${window.location.origin}/p/${id}/og.jpg`, noindex: true });
      const { url } = await api.publishPreview(id, htmlOnline, og);
      setDraft((d) => ({ ...d, previewId: id, previewUrl: url, previewAt: new Date().toISOString() }));
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener');
      toast('Prévia publicada. O link fica no topo para copiar e mandar ao cliente.');
    } catch (e) {
      tab?.close();
      // Sem API (ex.: abriu o arquivo local), mostra a prévia local como antes.
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(blobUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      toast(e instanceof ApiError ? `Não publiquei online (${e.message}). Abri uma prévia local.` : 'Não publiquei online. Abri uma prévia local.', true);
    } finally {
      setPublishing(false);
    }
  }

  return createPortal(
    <div className="builder" role="dialog" aria-modal="true" aria-label={`Construir site — ${lead.name}`}>
      <div className="builder-top">
        <button className="btn btn-sm builder-back" onClick={onClose}>← Voltar</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="builder-title">{model.name}</div>
          <div className="small" style={{ color: '#a9a59c' }}>Site gerado a partir do diagnóstico · {pack.label}</div>
        </div>
        <div className="seg seg-dark" role="group" aria-label="Dispositivo">
          <button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>Computador</button>
          <button aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>Celular</button>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button className="btn btn-sm" onClick={publishOnline} disabled={publishing} title="Publica no seu Cloudflare e abre o link para mostrar ao cliente">{publishing ? <span className="spinner" /> : <Icon name="ext" />} {draft.previewUrl ? 'Atualizar e abrir' : 'Publicar e abrir'}</button>
          <button className="btn btn-sm" onClick={() => { downloadFile(fileName, html, 'text/html'); toast('HTML único baixado (imagens embutidas, sem prévia de link).'); }} title="Arquivo único, bom para mostrar ao cliente"><Icon name="download" /> HTML</button>
          <button className="btn btn-sm btn-accent" onClick={exportZip} disabled={exporting} title="Pacote para publicar: SEO completo, imagem de compartilhamento e favicon">{exporting ? <span className="spinner" /> : <Icon name="download" />} Baixar site (.zip)</button>
        </div>
      </div>

      {draft.previewUrl && (
        <div className="builder-link">
          <span className="small">Link do site:</span>
          <a href={draft.previewUrl} target="_blank" rel="noopener noreferrer" className="mono small">{draft.previewUrl}</a>
          <button className="btn btn-sm" onClick={async () => toast((await copyText(draft.previewUrl!)) ? 'Link copiado.' : 'Não foi possível copiar.')}><Icon name="copy" /> Copiar</button>
          <span className="tiny" style={{ color: '#a9a59c' }}>válido por 90 dias · atualiza ao publicar de novo</span>
          <button className="btn btn-sm" onClick={async () => {
            if (!draft.previewId || !window.confirm('Despublicar? O link deixa de funcionar para quem tiver recebido.')) return;
            try { await api.unpublishPreview(draft.previewId); setDraft((d) => ({ ...d, previewId: undefined, previewUrl: undefined, previewAt: undefined })); toast('Prévia despublicada.'); }
            catch (e) { toast(e instanceof ApiError ? e.message : 'Não foi possível despublicar.', true); }
          }}>Despublicar</button>
        </div>
      )}
      <div className="builder-body">
        <aside className="builder-side">
          <div className="tabs-light" role="tablist">
            {([['conteudo', 'Conteúdo'], ['visual', 'Visual'], ['editor', 'Editor'], ['comparativo', 'Antes × depois']] as Array<[Panel, string]>).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>{label}</button>
            ))}
          </div>

          {fetching && <Notice kind="info">{fetching}</Notice>}
          {draft.heroAuto && draft.heroNote && panel !== 'comparativo' && <Notice kind="info">A foto do Google Maps não ficou boa no topo ({draft.heroNote}). Usei uma foto ilustrativa do segmento; dá para trocar em Visual → Fotos.</Notice>}
          {catalogState === 'lendo' && <Notice kind="info">Lendo o catálogo do WhatsApp Business do cliente (serviços, preços e fotos)…</Notice>}
          {catalogState === 'ok' && <Notice kind="info">Catálogo do WhatsApp lido: serviços, preços e fotos confirmados pelo próprio negócio.</Notice>}
          {model.warnings.length > 0 && panel !== 'comparativo' && (
            <Notice kind="warn"><ul style={{ margin: 0, paddingLeft: 16 }}>{model.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>
          )}

          {panel === 'conteudo' && (
            <div className="stack">
              <label className="field"><span>Endereço do site publicado (para SEO e prévia de link)</span>
                <input className="input" value={draft.siteUrl ?? ''} maxLength={120} placeholder="ex.: clinicaalol.com.br" onChange={(e) => set('siteUrl', e.target.value)} />
                {draft.siteUrl && !siteUrl && <span className="tiny" style={{ color: 'var(--bad)' }}>Use um domínio válido (https).</span>}
              </label>
              <SharePreview image={ogPreview} title={model.seoTitle} description={model.seoDescription} domain={siteUrl?.replace(/^https:\/\//, '') ?? 'seu-dominio.com.br'} />
              <label className="field"><span>Título principal</span><textarea className="textarea" style={{ minHeight: 70 }} value={draft.headline ?? pack.headline} maxLength={120} onChange={(e) => set('headline', e.target.value)} /></label>
              <label className="field"><span>Subtítulo</span><textarea className="textarea" style={{ minHeight: 70 }} value={draft.subheadline ?? model.subheadline} maxLength={240} onChange={(e) => set('subheadline', e.target.value)} /></label>
              <div className="grid-2">
                <label className="field"><span>Botão principal</span><input className="input" value={draft.ctaPrimary ?? pack.ctaPrimary} maxLength={40} onChange={(e) => set('ctaPrimary', e.target.value)} /></label>
                <label className="field"><span>Horário (opcional)</span><input className="input" value={draft.hours ?? ''} maxLength={120} placeholder="Seg a sex, 8h às 18h" onChange={(e) => set('hours', e.target.value)} /></label>
              </div>
              <label className="field"><span>Sobre</span><textarea className="textarea" value={draft.about ?? pack.about} maxLength={600} onChange={(e) => set('about', e.target.value)} /></label>
              <label className="field"><span>Instagram (opcional)</span><input className="input" value={draft.instagram ?? ''} maxLength={60} placeholder="@perfil" onChange={(e) => set('instagram', e.target.value)} /></label>
              <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Serviços</b>
                <button className="btn btn-sm btn-ghost" disabled={services.length >= 8} onClick={() => set('services', [...services, { title: 'Novo serviço', text: '' }])}><Icon name="plus" /> Adicionar</button>
              </div>
              {services.map((s, i) => (
                <div key={i} className="svc-edit">
                  <input className="input" value={s.title} maxLength={60} onChange={(e) => setService(i, 'title', e.target.value)} aria-label={`Serviço ${i + 1}`} />
                  <textarea className="textarea" style={{ minHeight: 56 }} value={s.text} maxLength={220} onChange={(e) => setService(i, 'text', e.target.value)} aria-label={`Descrição do serviço ${i + 1}`} />
                  <button className="btn btn-sm btn-ghost" onClick={() => set('services', services.filter((_, j) => j !== i))} aria-label="Remover serviço"><Icon name="trash" /></button>
                </div>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => { setDraft({ theme: draft.theme }); toast('Textos padrão do segmento restaurados.'); }}>Restaurar textos do segmento</button>
            </div>
          )}

          {panel === 'visual' && (
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small muted">Cada empresa já recebe uma combinação própria de estilo, cor e layout.</span>
                <button className="btn btn-sm" onClick={() => setDraft((d) => ({ ...d, shuffle: (d.shuffle ?? 0) + 1, theme: undefined, heroLayout: undefined, servicesLayout: undefined, headline: undefined, accent: d.brandApplied && lead.diagnosis?.facts?.brand?.themeColor ? d.accent : undefined }))}>Outra combinação</button>
              </div>
              <label className="field"><span>Estilo do site</span>
                <select className="select" value={draft.layout ?? 'premium'} onChange={(e) => set('layout', e.target.value as SiteDraft['layout'])}>
                  <option value="premium">Premium (arcos, depoimentos em faixa, passo a passo animado)</option>
                  <option value="classico">Clássico</option>
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={!!draft.online} onChange={(e) => set('online', e.target.checked)} /> Atende também online (mostra Presencial / Online)</label>
              <div className="grid-2">
                <label className="field"><span>Topo</span>
                  <select className="select" value={draft.heroLayout ?? model.heroLayout} onChange={(e) => set('heroLayout', e.target.value as SiteDraft['heroLayout'])}>
                    <option value="fullbleed" disabled={!model.images.hero}>Foto em tela cheia</option>
                    <option value="editorial" disabled={!model.images.hero}>Editorial (texto + foto)</option>
                    <option value="centered">Centralizado</option>
                    <option value="split">Cartão da marca</option>
                  </select>
                </label>
                <label className="field"><span>Serviços</span>
                  <select className="select" value={draft.servicesLayout ?? model.servicesLayout} onChange={(e) => set('servicesLayout', e.target.value as SiteDraft['servicesLayout'])}>
                    <option value="grid">Grade</option>
                    <option value="list">Lista</option>
                  </select>
                </label>
              </div>
              <div className="field"><span>Estilo</span>
                <div className="theme-grid">
                  {Object.values(THEMES).map((t) => (
                    <button key={t.id} className="theme-opt" aria-pressed={(draft.theme ?? pack.theme) === t.id} onClick={() => set('theme', t.id)}>
                      <span className="theme-sw" style={{ background: t.bg, borderColor: t.line }}><i style={{ background: t.ink }} /><i style={{ background: t.accent }} /></span>
                      <span className="small">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="row">
                <label className="field" style={{ width: 150 }}><span>Cor de destaque</span><input type="color" className="input" style={{ padding: 4, height: 42 }} value={draft.accent ?? model.theme.accent} onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value, accentFrom: 'manual' }))} /></label>
                {draft.accent && <button className="btn btn-sm btn-ghost" style={{ marginTop: 22 }} onClick={() => setDraft((d) => ({ ...d, accent: undefined, accentFrom: 'manual' }))}>Usar cor do estilo</button>}
                {igHandle && <span className="tiny muted" style={{ marginTop: 26 }}>Instagram @{igHandle}: {igState === 'lendo' ? 'lendo…' : igState === 'idle' ? 'aguardando o robô/extensão' : igMsg}</span>}
                {draft.accent && draft.accentFrom && draft.accentFrom !== 'manual' && <span className="tiny muted" style={{ marginTop: 26 }}>Cor tirada {draft.accentFrom === 'logo' ? 'do logo do cliente' : draft.accentFrom === 'fotos' ? 'da predominância nas fotos do cliente' : 'do site atual do cliente'}.</span>}
              </div>
              <ClientPhotos lead={lead} candidates={candidates} draft={draft} setDraft={setDraft} />
              <div className="field"><span>Enviar imagem própria (fica só nesta sessão)</span>
                <input ref={heroRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { pickImage('hero', e.target.files?.[0]); e.target.value = ''; }} />
                <input ref={logoRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { pickImage('logo', e.target.files?.[0]); e.target.value = ''; }} />
                <div className="row">
                  <button className="btn btn-sm" onClick={() => heroRef.current?.click()}><Icon name="upload" /> {uploads.hero ? 'Trocar foto do topo' : 'Foto do topo'}</button>
                  <button className="btn btn-sm" onClick={() => logoRef.current?.click()}><Icon name="upload" /> {uploads.logo ? 'Trocar logo' : 'Logo'}</button>
                  {(uploads.hero || uploads.logo) && <button className="btn btn-sm btn-ghost" onClick={() => setUploads({})}>Remover envios</button>}
                </div>
                <span className="tiny muted">Ex.: foto do profissional ou da equipe tirada do Instagram do cliente. Use com autorização dele.</span>
              </div>
              <button className="btn btn-sm" onClick={() => { setDraft((d) => brandDraft(lead, { ...d, accent: undefined, logoSrc: undefined, heroSrc: undefined, gallerySrc: undefined })); toast('Identidade do cliente reaplicada.'); }} disabled={!hasClientAssets(lead)}>Reaplicar identidade do cliente</button>
            </div>
          )}

          {panel === 'editor' && (
            <EditorPanel
              draft={draft}
              setDraft={setDraft}
              servicesFromLead={servicesFromLead}
              model={model}
              heroUpload={uploads.hero}
              logoUpload={uploads.logo}
              serviceUploads={serviceUploads}
              onHeroUpload={handleHeroUpload}
              onLogoUpload={handleLogoUpload}
              onServiceUpload={handleServiceUpload}
              blockImages={blockUploads}
              onBlockImage={handleBlockImage}
              externalSection={activeSection}
            />
          )}

          {panel === 'comparativo' && (
            <div className="stack">
              <p className="small muted" style={{ margin: 0 }}>Use na reunião: cada linha liga um problema encontrado ao que o novo site resolve.</p>
              {model.improvements.map((im) => (
                <div key={im.id} className="cmp">
                  <div><span className="tiny muted">HOJE</span><p>{im.today}</p></div>
                  <div><span className="tiny" style={{ color: 'var(--ok)', fontWeight: 700 }}>NOVO SITE</span><p>{im.newSite}</p></div>
                </div>
              ))}
              <span className="tiny muted">Itens do diagnóstico marcados como "inferidos" são heurísticas: confirme antes de citar.</span>
            </div>
          )}
        </aside>

        <div className="builder-stage">
          <div className={`frame frame-${device}`}>
            <iframe title="Pré-visualização do site" srcDoc={panel === 'editor' ? previewEditorHtml : previewHtml} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
          </div>
        </div>
      </div>
      <button className="btn btn-accent builder-peek" onClick={() => setFullView(true)}>Ver o site completo</button>
      {fullView && (
        <div className="builder-full" role="dialog" aria-modal="true" aria-label="Site completo">
          <div className="builder-full-top">
            <b>{model.name}</b>
            <button className="btn btn-sm builder-close" onClick={() => setFullView(false)} aria-label="Fechar e voltar ao menu">✕ Fechar</button>
          </div>
          <iframe title="Site completo" srcDoc={previewHtml} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
        </div>
      )}
    </div>,
    document.body,
  );
}

const same = (a?: ImageRef, b?: ImageRef) => !!a && !!b && a.kind === b.kind && a.value === b.value;

/** Miniatura carregada pelo proxy do servidor (a chave do Google nunca chega ao navegador). */
function Thumb({ c }: { c: ImageCandidate }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.image(c).then((s) => alive && setSrc(s)).catch((e) => alive && setErr(e instanceof Error ? e.message : 'erro'));
    return () => {
      alive = false;
    };
  }, [c]);
  if (err) return <div className="thumb thumb-err" title={err}>indisponível</div>;
  if (!src) return <div className="thumb skeleton" />;
  return <img className="thumb" src={src} alt={c.label} />;
}

function ClientPhotos({ lead, candidates, draft, setDraft }: { lead: Lead; candidates: ImageCandidate[]; draft: SiteDraft; setDraft: (f: (d: SiteDraft) => SiteDraft) => void }) {
  const { status } = useIntegrations();
  const needsGoogle = (lead.photos?.length ?? 0) > 0 && !status?.googlePlaces.configured;
  const asRef = (c: ImageCandidate): ImageRef => ({ kind: c.kind, value: c.value, attribution: c.attribution });
  const inGallery = (c: ImageCandidate) => (draft.gallerySrc ?? []).some((g) => same(g, c));
  const toggleGallery = (c: ImageCandidate) =>
    setDraft((d) => {
      const g = d.gallerySrc ?? [];
      return { ...d, gallerySrc: g.some((x) => same(x, c)) ? g.filter((x) => !same(x, c)) : [...g, asRef(c)].slice(0, 6) };
    });

  return (
    <div className="field">
      <span>Fotos e logo do cliente</span>
      {!candidates.length ? (
        <Notice kind="info">
          Nenhuma imagem do cliente encontrada ainda. {lead.website ? 'Rode o diagnóstico do site atual para coletar logo e fotos. ' : ''}
          Com o Google Maps configurado, as fotos do perfil (fachada, equipe, profissional) aparecem aqui. Você também pode enviar uma foto abaixo.
        </Notice>
      ) : (
        <>
          {needsGoogle && <span className="tiny" style={{ color: 'var(--attn)' }}>Fotos do Google exigem a chave do Google Maps no servidor.</span>}
          <div className="thumbs">
            {candidates.map((c) => (
              <div key={c.value} className="thumb-card">
                <Thumb c={c} />
                <div className="tiny muted thumb-label">{c.stock && <span className="chip chip-attn" style={{ padding: '0 6px', marginRight: 4 }}>ilustrativa</span>}{c.label}</div>
                <div className="thumb-acts">
                  <button aria-pressed={same(draft.heroSrc, c)} onClick={() => setDraft((d) => (same(d.heroSrc, c) ? { ...d, heroSrc: undefined } : { ...d, heroSrc: asRef(c), heroChecked: c.value, heroAuto: undefined, heroNote: undefined }))}>Topo</button>
                  <button aria-pressed={same(draft.logoSrc, c)} onClick={() => setDraft((d) => ({ ...d, logoSrc: same(d.logoSrc, c) ? undefined : asRef(c) }))}>Logo</button>
                  <button aria-pressed={inGallery(c)} onClick={() => toggleGallery(c)}>Galeria</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** "Google Maps" ou "Google Maps (autor1, autor2)" — crédito exigido para fotos do Google. */
function creditLines(refs: ImageRef[]): string[] {
  // Rodapé limpo: Pixabay/Pexels não exigem crédito e as fotos do Maps/site do cliente não levam rótulo.
  // Só entram autores de fotos com licença Creative Commons (Wikimedia/Openverse), que exigem atribuição.
  const cc = refs
    .map((r) => r.attribution)
    .filter((a): a is string => !!a && a.startsWith('Foto ilustrativa') && !/\((Pixabay|Pexels)\)\s*$/.test(a))
    .map((a) => a.replace(/^Foto ilustrativa:\s*/, ''));
  return [...new Set(cc)];
}

/** Simula como o link aparece ao ser colado no WhatsApp / redes sociais. */
function SharePreview({ image, title, description, domain }: { image: string | null; title: string; description: string; domain: string }) {
  return (
    <div className="field">
      <span>Prévia ao compartilhar o link</span>
      <div className="share">
        {image ? <img src={image} alt="Imagem de compartilhamento" /> : <div className="share-img skeleton" />}
        <div className="share-txt">
          <b>{title}</b>
          <span>{description}</span>
          <span className="share-dom">{domain}</span>
        </div>
      </div>
      <span className="tiny muted">Imagem gerada automaticamente com a foto, o logo e a cor do cliente. Vai como og.jpg no pacote .zip.</span>
    </div>
  );
}
