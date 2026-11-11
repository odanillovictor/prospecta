// Modelo de dados central. Compartilhado entre o app (navegador) e as Pages Functions.
import type { BrandAssets } from './brandAssets';

/** "novo" e "pesquisado" ficam fora do quadro; "prospectado" (Salvar no funil) é a 1ª coluna, antes do contato. */
export const FUNNEL_STATUSES = ['novo', 'pesquisado', 'prospectado', 'contatado', 'respondeu', 'reuniao', 'finalizado'] as const;
export type FunnelStatus = (typeof FUNNEL_STATUSES)[number];

/** Colunas do quadro (estilo Trello). */
export const PIPELINE_STATUSES = ['prospectado', 'contatado', 'respondeu', 'reuniao', 'finalizado'] as const satisfies readonly FunnelStatus[];

/** Status em que o lead ainda não teve contato: ao abrir o WhatsApp passam a "contatado". */
export const BEFORE_CONTACT: readonly FunnelStatus[] = ['novo', 'pesquisado', 'prospectado'];

export const STATUS_LABEL: Record<FunnelStatus, string> = {
  novo: 'Novo',
  pesquisado: 'Pesquisado',
  prospectado: 'Prospectado',
  contatado: 'Contato iniciado',
  respondeu: 'Respondeu',
  reuniao: 'Reunião marcada',
  finalizado: 'Finalizado',
};

export type Outcome = 'ganho' | 'perdido';
export const OUTCOME_LABEL: Record<Outcome, string> = { ganho: 'Fechou', perdido: 'Não fechou' };

/** Etiqueta do quadro (cor em hex). */
export interface BoardLabel {
  id: string;
  name: string;
  color: string;
}

export interface CardComment {
  id: string;
  at: string;
  text: string;
}

/** Converte status de versões anteriores (proposta/cliente/perdido) para o modelo atual. */
export function migrateStatus(status: string): { status: FunnelStatus; outcome?: Outcome } {
  if ((FUNNEL_STATUSES as readonly string[]).includes(status)) return { status: status as FunnelStatus };
  if (status === 'proposta') return { status: 'reuniao' };
  if (status === 'cliente') return { status: 'finalizado', outcome: 'ganho' };
  if (status === 'perdido') return { status: 'finalizado', outcome: 'perdido' };
  return { status: 'novo' };
}

export const isClosed = (l: { status: FunnelStatus }) => l.status === 'finalizado';

/** De onde veio o registro. `demo` nunca se mistura com dados reais sem estar marcado. */
export type ProviderId = 'gmaps' | 'osm' | 'google_places' | 'csv' | 'manual' | 'demo';

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  gmaps: 'Google Maps',
  osm: 'OpenStreetMap',
  google_places: 'Google Maps (API oficial)',
  csv: 'Importação CSV',
  manual: 'Cadastro manual',
  demo: 'Demonstração',
};

export interface Review {
  author: string;
  rating: number;
  text: string;
  when?: string;
  source: 'Google';
}

export interface SourceRecord {
  provider: ProviderId;
  /** ID no provedor (place_id, osm node/way id, linha do CSV...). */
  externalId?: string;
  /** Link público para conferir o dado na origem. */
  url?: string;
  collectedAt: string; // ISO
  query?: string;
}

/** Empresa encontrada por um provedor, já normalizada, antes de virar lead. */
export interface RawBusiness {
  name: string;
  category?: string;
  phone?: string; // E.164 sem "+" (ex.: 5541999998888) quando normalizável
  phoneRaw?: string;
  whatsapp?: string; // E.164 sem "+", somente se o provedor declarou explicitamente
  website?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  lat?: number;
  lon?: number;
  rating?: number;
  reviewCount?: number;
  businessStatus?: string;
  /** Horário como texto (Google: weekdayDescriptions; OSM: opening_hours). */
  hours?: string;
  /** Resumo do perfil (Google editorialSummary). */
  summary?: string;
  instagram?: string;
  /** Referências de fotos do Google Places (places/.../photos/...), resolvidas pelo servidor. */
  photos?: Array<{ name: string; attribution?: string }>;
  /** Todas as categorias do Google Maps (em português), usadas para os serviços do site. */
  categories?: string[];
  /** Avaliações reais (Google Maps via coletor completo ou Places API). Nunca geradas. */
  reviews?: Review[];
  /** URLs públicas de fotos (ex.: coletor do Google Maps). */
  imageUrls?: string[];
  email?: string;
  source: SourceRecord;
}

export interface ContactLogEntry {
  at: string; // ISO
  channel: 'whatsapp' | 'ligacao' | 'email' | 'presencial' | 'outro';
  note?: string;
}

export interface BriefingDelivery {
  at: string;
  idempotencyKey: string;
  ok: boolean;
  httpStatus?: number;
  message: string;
}

export interface Lead extends Omit<RawBusiness, 'source'> {
  id: string;
  niche: string; // nicho pesquisado (o que o usuário digitou)
  sources: SourceRecord[];
  isDemo: boolean;
  status: FunnelStatus;
  /** Resultado, quando finalizado. */
  outcome?: Outcome;
  /** Ids de etiquetas (Settings.labels). */
  labels?: string[];
  /** Descrição do card no quadro. */
  description?: string;
  comments?: CardComment[];
  lastContactAt?: string;
  nextAction?: string;
  nextActionAt?: string;
  notes?: string;
  contactLog: ContactLogEntry[];
  /** Sinais marcados manualmente pelo usuário (validação humana). */
  manualSignals: Partial<Record<SignalId, boolean>>;
  diagnosis?: SiteDiagnosis;
  deliveries: BriefingDelivery[];
  /** Ajustes feitos no construtor de site (textos, tema). Imagens não são persistidas. */
  siteDraft?: SiteDraft;
  /** Catálogo lido do WhatsApp Business (items vazio = o negócio não tem catálogo). */
  /** Texto público lido do Instagram (as imagens ficam só na sessão do construtor). */
  instagramData?: { at: string; handle: string; name?: string; bio?: string; captions: string[] };
  catalog?: { at: string; businessName?: string; items: CatalogItem[] };
  /** Robô de vendas (WhatsApp Web): conversa, etapa e histórico deste lead. */
  robot?: RobotState;
  createdAt: string;
  updatedAt: string;
}

export interface SiteDraft {
  /** Estilo do site: 'premium' (arcos, depoimentos em faixa, palco que troca) ou 'classico'. */
  layout?: 'premium' | 'classico';
  /** Mostra a alternância "Presencial / Online" (só faz sentido em atendimento por vídeo). */
  online?: boolean;
  theme?: string;
  accent?: string;
  /** De onde veio a cor de destaque: logo/fotos do cliente (extraída), site atual, ou escolha manual. */
  accentFrom?: 'logo' | 'fotos' | 'site' | 'manual';
  headline?: string;
  subheadline?: string;
  about?: string;
  ctaPrimary?: string;
  hours?: string;
  instagram?: string;
  services?: Array<{ title: string; text: string }>;
  /** Imagens reais do cliente escolhidas no construtor (referências; os bytes são buscados de novo ao abrir). */
  logoSrc?: ImageRef;
  heroSrc?: ImageRef;
  /** Foto de fundo da chamada final (com película escura). Escolhida automaticamente, nunca repete outra foto. */
  ctaSrc?: ImageRef;
  /** Foto do topo já avaliada (valor da referência), para não reavaliar a cada abertura. */
  heroChecked?: string;
  /** O topo é uma foto ilustrativa escolhida automaticamente (pode ser trocada por foto real que chegar). */
  heroAuto?: boolean;
  /** Por que a foto do cliente não foi usada no topo (mostrado no construtor). */
  heroNote?: string;
  gallerySrc?: ImageRef[];
  /** true depois que a identidade do cliente foi aplicada automaticamente uma vez. */
  brandApplied?: boolean;
  /** true depois que fotos ilustrativas foram aplicadas automaticamente (não repete). */
  stockApplied?: boolean;
  /** Prévia online publicada no Cloudflare (mesmo link é atualizado a cada publicação). */
  /** Uma imagem por card de serviço (mesma ordem dos serviços). */
  serviceSrc?: ImageRef[];
  previewId?: string;
  previewUrl?: string;
  previewAt?: string;
  /** Layouts escolhidos no construtor (senão, variação automática por empresa). */
  heroLayout?: 'fullbleed' | 'editorial' | 'centered' | 'split';
  servicesLayout?: 'grid' | 'list';
  /** Incrementado em "Outra combinação" para sortear estilo/cor/layout/título diferentes. */
  shuffle?: number;
  /** Endereço público onde o site será publicado (para canonical, sitemap e prévia de link). */
  siteUrl?: string;
  /** IDs de seções padrão a ocultar (ex.: 'convite', 'sobre', 'depoimentos'). */
  hiddenSections?: string[];
  /** Blocos customizados adicionados pelo usuário no editor visual. */
  customBlocks?: CustomBlock[];
  /** Ordem personalizada das seções reordenáveis (exclui hero e contato, sempre fixos). */
  sectionOrder?: string[];
  /** Depoimentos editados manualmente (substitui os do Google quando preenchido). */
  draftReviews?: Array<{ author: string; rating: number; text: string; when?: string }>;
  /** Passos de "Como funciona" editados manualmente (substitui os gerados automaticamente). */
  draftSteps?: Array<{ title: string; text: string }>;
  /** Objeções editadas manualmente (substitui as geradas automaticamente). */
  draftObjections?: Array<{ title: string; text: string }>;
  /** FAQ editado manualmente (substitui o gerado automaticamente). */
  draftFaq?: Array<{ q: string; a: string }>;
  /** Número de WhatsApp para contato (qualquer formato; substitui o do lead). */
  draftWa?: string;
  /** Texto de fechamento da seção Contato final (substitui o do pacote). */
  draftClosing?: string;
  updatedAt?: string;
}

/** Imagem externa do cliente: URL do site dele ou foto do Google Places (places/.../photos/...). */
/** Catálogo do WhatsApp Business do negócio (fonte confirmada de serviços, preços e fotos). */
export interface CatalogItem {
  title: string;
  text?: string;
  price?: string;
  /** Foto do item (JPEG leve em data URL). */
  image?: string;
}

export interface ImageRef {
  kind: 'url' | 'place';
  value: string;
  attribution?: string;
}

export type CustomBlockType = 'texto' | 'destaque' | 'imagem' | 'separador';

export interface CustomBlock {
  id: string;
  type: CustomBlockType;
  eyebrow?: string;
  title?: string;
  body?: string;
  textColor?: string;
  bgColor?: string;
  btnLabel?: string;
  imageRef?: ImageRef;
  layout?: 'center' | 'left' | 'right';
}

// ---------- Diagnóstico ----------

export type CheckOrigin = 'automatico' | 'inferido' | 'manual';
export type CheckResult = 'ok' | 'problema' | 'atencao' | 'nao_verificado';

export interface DiagnosisCheck {
  id: string;
  label: string;
  origin: CheckOrigin;
  result: CheckResult;
  detail: string;
  /** Prioridade de correção para a proposta comercial (1 = mais importante). */
  priority: 1 | 2 | 3;
}

/** Fatos coletados de verdade pela função /api/diagnose (sem interpretação). */
export interface SiteFacts {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  https: boolean;
  redirects: number;
  responseMs: number; // tempo até cabeçalhos, medido a partir do servidor da Cloudflare
  htmlBytes: number;
  truncated: boolean;
  title?: string;
  metaDescription?: string;
  hasViewport: boolean;
  lang?: string;
  h1: string[];
  h2Count: number;
  hasTelLink: boolean;
  hasWhatsAppLink: boolean;
  hasMailto: boolean;
  formCount: number;
  ctaKeywords: string[];
  socialProofKeywords: string[];
  localInfoKeywords: string[];
  phonesInText: number;
  copyrightYear?: number;
  generator?: string;
  hasSchemaLocalBusiness: boolean;
  hasOpenGraph: boolean;
  imgCount: number;
  imgWithoutAlt: number;
  usesTablesForLayout: boolean;
  usesFlash: boolean;
  /** Texto visível do site (primeiros 8 mil caracteres): usado para confirmar serviços. */
  bodyText?: string;
  pagespeed?: { performance: number; strategy: 'mobile'; lcpMs?: number; cls?: number } | null;
  /** Identidade visual e conteúdo reaproveitável do site atual. */
  brand?: BrandAssets;
}

export interface SiteDiagnosis {
  ranAt: string;
  ok: boolean;
  error?: string;
  facts?: SiteFacts;
  checks: DiagnosisCheck[];
}

// ---------- Scoring ----------

export const SIGNAL_IDS = [
  'sem_site',
  'sem_https',
  'nao_responsivo',
  'lento',
  'seo_basico',
  'sem_cta',
  'contato_escondido',
  'sem_whatsapp_site',
  'desatualizado',
  'oferta_confusa',
  'baixa_presenca',
  'boa_reputacao',
  'contatavel',
  'segmento_aderente',
  'local_prioritario',
  'urgencia_manual',
] as const;
export type SignalId = (typeof SIGNAL_IDS)[number];

export interface ScoringConfig {
  weights: Record<SignalId, number>;
  hotMin: number;
  warmMin: number;
  prioritySegments: string[];
  priorityLocations: string[];
}

export type SignalState = 'sim' | 'nao' | 'desconhecido';

export interface SignalEvaluation {
  id: SignalId;
  label: string;
  state: SignalState;
  origin: CheckOrigin;
  weight: number;
  points: number;
  why: string;
}

export type Temperature = 'quente' | 'morno' | 'frio';

export interface ScoreResult {
  score: number; // 0–100
  temperature: Temperature;
  /** 0–1: fração do peso total cujo estado é conhecido. */
  confidence: number;
  signals: SignalEvaluation[];
}

// ---------- Busca ----------

export interface SearchRequest {
  niche: string;
  location: string;
  providers: ProviderId[];
  limit?: number;
}

export interface ProviderOutcome {
  provider: ProviderId;
  status: 'ok' | 'nao_configurado' | 'erro' | 'sem_resultados';
  count: number;
  message?: string;
  cached?: boolean;
}

export interface SearchResponse {
  results: RawBusiness[];
  providers: ProviderOutcome[];
  query: { niche: string; location: string };
}

export interface IntegrationStatus {
  osm: { configured: true; note: string };
  googlePlaces: { configured: boolean };
  pagespeed: { configured: boolean };
  vaultSites: { configured: boolean };
  accessToken: { required: boolean };
}

// ---------- Robô de vendas (WhatsApp Web) ----------
export type RobotStage = 'abertura' | 'followup1' | 'followup2' | 'despedida' | 'respondeu' | 'encerrado';

export interface RobotMessage {
  id: string;
  at: string; // ISO
  dir: 'out' | 'in';
  text: string;
  /** out: pendente (aguarda aprovação) → enviada | teste (modo teste, nada saiu) | descartada | falhou. in: recebida. */
  state: 'pendente' | 'enviada' | 'teste' | 'descartada' | 'falhou' | 'recebida';
  stage?: RobotStage;
  note?: string;
}

export interface RobotState {
  active: boolean;
  /** Modo deste lead: aprovar cada mensagem (padrão) ou automático. */
  mode: 'approve' | 'auto';
  stage: RobotStage;
  startedAt: string;
  messages: RobotMessage[];
  /** Motivo de ter parado (pediu para parar, usuário desativou, ciclo concluído…). */
  stopReason?: string;
  /** Última leitura da conversa no WhatsApp Web (para achar respostas novas). */
  lastInboxAt?: string;
  /** O lead quis ver: falta GERAR e PUBLICAR a prévia (só então o link é enviado). */
  task?: 'gerar_previa' | 'preparar_reuniao';
}

export interface RobotSettings {
  /** Padrão para novos robôs. */
  mode: 'approve' | 'auto';
  /** Máximo de mensagens ENVIADAS por dia (somando todos os leads). */
  dailyLimit: number;
  /** Janela de envio (hora local, 0–23). */
  startHour: number;
  endHour: number;
  weekdaysOnly: boolean;
  /** Intervalo mínimo entre dois envios (segundos). */
  minGapSec: number;
  /** Modo teste: o robô escreve a mensagem no WhatsApp Web mas NÃO envia. Ligado por padrão. */
  dryRun: boolean;
  /** Pausa geral: nenhum robô envia nem monitora enquanto estiver ligada. */
  paused: boolean;
  /** Endereço do serviço local do robô (npm run robo). */
  serviceUrl: string;
  /** Agente de vendas do usuário (opcional): recebe a conversa e devolve a próxima ação. */
  agentUrl: string;
  /** "Minha proposta": o que o robô pode dizer sobre oferta, preço e agenda (vazio = passa para você). */
  offerText: string;
  priceText: string;
  meetingText: string;
}
