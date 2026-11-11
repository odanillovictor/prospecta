// Pontuação de oportunidade: transparente, editável e explicada sinal a sinal.
// O score indica prioridade de abordagem — NÃO é probabilidade de fechamento.
import type { Lead, ScoreResult, ScoringConfig, SignalEvaluation, SignalId, SignalState, CheckOrigin, Temperature } from './types';
import { checkById } from './diagnosis';
import { isNonOwnSite, normText } from './normalize';

export const SIGNAL_LABEL: Record<SignalId, string> = {
  sem_site: 'Empresa sem site próprio',
  sem_https: 'Site sem HTTPS',
  nao_responsivo: 'Site não preparado para celular',
  lento: 'Site lento',
  seo_basico: 'SEO básico ausente (title/description)',
  sem_cta: 'Falta de chamada para ação',
  contato_escondido: 'Contato pouco visível',
  sem_whatsapp_site: 'Sem WhatsApp no site',
  desatualizado: 'Site com cara de desatualizado',
  oferta_confusa: 'Oferta pouco clara',
  baixa_presenca: 'Baixa presença digital (poucas avaliações)',
  boa_reputacao: 'Boa reputação (capacidade de investir)',
  contatavel: 'Tem telefone/WhatsApp para contato',
  segmento_aderente: 'Segmento prioritário para você',
  local_prioritario: 'Localização prioritária',
  urgencia_manual: 'Sinal de urgência/capacidade (validado por você)',
};

export const DEFAULT_SCORING: ScoringConfig = {
  weights: {
    sem_site: 40,
    sem_https: 8,
    nao_responsivo: 12,
    lento: 6,
    seo_basico: 6,
    sem_cta: 8,
    contato_escondido: 6,
    sem_whatsapp_site: 5,
    desatualizado: 8,
    oferta_confusa: 6,
    baixa_presenca: 6,
    boa_reputacao: 12,
    contatavel: 15,
    segmento_aderente: 6,
    local_prioritario: 5,
    urgencia_manual: 10,
  },
  hotMin: 55,
  warmMin: 35,
  prioritySegments: [],
  priorityLocations: [],
};

/** Sinais que só fazem sentido quando a empresa TEM site. */
const SITE_SIGNALS: SignalId[] = [
  'sem_https', 'nao_responsivo', 'lento', 'seo_basico', 'sem_cta', 'contato_escondido',
  'sem_whatsapp_site', 'desatualizado', 'oferta_confusa',
];

export function hasOwnSite(lead: Pick<Lead, 'website'>): boolean {
  return !!lead.website && !isNonOwnSite(lead.website);
}

function fromCheck(lead: Lead, checkId: string, problemWhenAttention = false): { state: SignalState; why: string; origin: CheckOrigin } {
  const ck = checkById(lead.diagnosis, checkId);
  if (!lead.diagnosis?.ok || !ck || ck.result === 'nao_verificado') {
    return { state: 'desconhecido', why: 'Rode o diagnóstico do site para avaliar.', origin: 'automatico' };
  }
  const bad = ck.result === 'problema' || (problemWhenAttention && ck.result === 'atencao');
  return { state: bad ? 'sim' : 'nao', why: ck.detail, origin: ck.origin };
}

function matchesAny(value: string | undefined, list: string[]): boolean {
  const v = normText(value);
  return !!v && list.some((x) => {
    const n = normText(x);
    return !!n && (v.includes(n) || n.includes(v));
  });
}

export function evaluateSignals(lead: Lead, cfg: ScoringConfig): SignalEvaluation[] {
  const own = hasOwnSite(lead);
  const out: Array<Omit<SignalEvaluation, 'label' | 'weight' | 'points'>> = [];

  out.push({
    id: 'sem_site',
    state: own ? 'nao' : 'sim',
    origin: 'automatico',
    why: own
      ? `Site informado: ${lead.website}`
      : lead.website
        ? `Só tem link de rede social/agregador (${lead.website}).`
        : 'Nenhum site informado pelas fontes consultadas. Confirme pesquisando o nome.',
  });

  const siteMap: Array<[SignalId, string, boolean]> = [
    ['sem_https', 'https', false],
    ['nao_responsivo', 'viewport', false],
    ['lento', 'velocidade', true],
    ['sem_cta', 'cta', false],
    ['contato_escondido', 'contato', false],
    ['sem_whatsapp_site', 'whatsapp', false],
    ['desatualizado', 'desatualizado', false],
    ['oferta_confusa', 'oferta', true],
  ];
  for (const [id, checkId, attn] of siteMap) {
    if (!own) out.push({ id, state: 'nao', origin: 'automatico', why: 'Não se aplica: empresa sem site.' });
    else out.push({ id, ...fromCheck(lead, checkId, attn) });
  }
  if (!own) {
    out.push({ id: 'seo_basico', state: 'nao', origin: 'automatico', why: 'Não se aplica: empresa sem site.' });
  } else {
    const t = checkById(lead.diagnosis, 'title');
    const d = checkById(lead.diagnosis, 'description');
    if (!lead.diagnosis?.ok || !t || !d) {
      out.push({ id: 'seo_basico', state: 'desconhecido', origin: 'automatico', why: 'Rode o diagnóstico do site para avaliar.' });
    } else {
      const bad = t.result === 'problema' || d.result === 'problema';
      out.push({ id: 'seo_basico', state: bad ? 'sim' : 'nao', origin: 'automatico', why: `${t.label}: ${t.detail} ${d.label}: ${d.detail}` });
    }
  }

  if (lead.reviewCount == null) {
    out.push({ id: 'baixa_presenca', state: 'desconhecido', origin: 'automatico', why: 'Fonte não informa avaliações. Confira no Google.' });
    out.push({ id: 'boa_reputacao', state: 'desconhecido', origin: 'automatico', why: 'Fonte não informa avaliações.' });
  } else {
    out.push({
      id: 'baixa_presenca',
      state: lead.reviewCount < 15 ? 'sim' : 'nao',
      origin: 'automatico',
      why: `${lead.reviewCount} avaliação(ões).`,
    });
    const good = (lead.rating ?? 0) >= 4.3 && lead.reviewCount >= 15;
    out.push({
      id: 'boa_reputacao',
      state: good ? 'sim' : 'nao',
      origin: 'inferido',
      why: `Nota ${lead.rating ?? '—'} com ${lead.reviewCount} avaliações${good ? ': clientes satisfeitos — gancho forte para abordagem.' : '.'}`,
    });
  }

  out.push({
    id: 'contatavel',
    state: lead.phone || lead.whatsapp ? 'sim' : 'nao',
    origin: 'automatico',
    why: lead.phone || lead.whatsapp ? 'Há número para contato.' : 'Sem telefone nas fontes — exige pesquisa manual.',
  });

  out.push({
    id: 'segmento_aderente',
    state: cfg.prioritySegments.length ? (matchesAny(lead.niche, cfg.prioritySegments) || matchesAny(lead.category, cfg.prioritySegments) ? 'sim' : 'nao') : 'nao',
    origin: 'manual',
    why: cfg.prioritySegments.length ? `Segmentos prioritários: ${cfg.prioritySegments.join(', ')}.` : 'Nenhum segmento prioritário configurado.',
  });
  const loc = [lead.city, lead.neighborhood, lead.address].filter(Boolean).join(' ');
  out.push({
    id: 'local_prioritario',
    state: cfg.priorityLocations.length ? (cfg.priorityLocations.some((l) => normText(loc).includes(normText(l))) ? 'sim' : 'nao') : 'nao',
    origin: 'manual',
    why: cfg.priorityLocations.length ? `Locais prioritários: ${cfg.priorityLocations.join(', ')}.` : 'Nenhuma localização prioritária configurada.',
  });
  out.push({
    id: 'urgencia_manual',
    state: lead.manualSignals.urgencia_manual ? 'sim' : 'nao',
    origin: 'manual',
    why: lead.manualSignals.urgencia_manual ? 'Marcado por você.' : 'Marque se perceber urgência ou capacidade (inauguração, expansão, anúncio ativo...).',
  });

  // Validação manual sobrescreve automático/inferido para qualquer sinal.
  return out.map((s) => {
    const manual = lead.manualSignals[s.id];
    const overridden = manual !== undefined && s.id !== 'urgencia_manual';
    const state: SignalState = overridden ? (manual ? 'sim' : 'nao') : s.state;
    const weight = cfg.weights[s.id] ?? 0;
    const applicable = !(SITE_SIGNALS.includes(s.id) && !own);
    return {
      ...s,
      state,
      origin: overridden ? 'manual' : s.origin,
      why: overridden ? `Validado manualmente (${manual ? 'sim' : 'não'}). ${s.why}` : s.why,
      label: SIGNAL_LABEL[s.id],
      weight: applicable ? weight : 0,
      points: state === 'sim' && applicable ? weight : 0,
    };
  });
}

export function temperatureOf(score: number, cfg: ScoringConfig): Temperature {
  return score >= cfg.hotMin ? 'quente' : score >= cfg.warmMin ? 'morno' : 'frio';
}

export function scoreLead(lead: Lead, cfg: ScoringConfig = DEFAULT_SCORING): ScoreResult {
  const signals = evaluateSignals(lead, cfg);
  const raw = signals.reduce((a, s) => a + s.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const totalWeight = signals.reduce((a, s) => a + s.weight, 0);
  const knownWeight = signals.filter((s) => s.state !== 'desconhecido').reduce((a, s) => a + s.weight, 0);
  const confidence = totalWeight ? knownWeight / totalWeight : 0;
  return { score, temperature: temperatureOf(score, cfg), confidence, signals };
}

export function confidenceLabel(c: number): 'alta' | 'média' | 'baixa' {
  return c >= 0.8 ? 'alta' : c >= 0.5 ? 'média' : 'baixa';
}
