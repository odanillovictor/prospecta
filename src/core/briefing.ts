// Briefing exportável para o agente vault-sites.
// O formato abaixo é um CONTRATO PROPOSTO (docs/INTEGRACOES.md). Não existe confirmação de que o
// vault-sites aceite este payload hoje — por isso ele é versionado e validável.
import type { Lead, ScoreResult } from './types';
import { STATUS_LABEL } from './types';
import { formatPhone, domainOf } from './normalize';
import { hasOwnSite } from './scoring';
import type { Pitch } from './pitch';

export const BRIEFING_SCHEMA = 'prospecta.vault-sites.briefing/v1';

export interface SiteBriefing {
  schema: typeof BRIEFING_SCHEMA;
  idempotencyKey: string;
  generatedAt: string;
  business: {
    name: string;
    segment: string;
    category?: string;
    city?: string;
    neighborhood?: string;
    state?: string;
    address?: string;
    phone?: string;
    whatsapp?: string;
    currentWebsite?: string;
    rating?: number;
    reviewCount?: number;
  };
  commercialContext: {
    funnelStatus: string;
    opportunityScore: number;
    temperature: string;
    confidence: number;
    mainArgument: string;
    signals: string[];
    notes?: string;
  };
  currentSiteDiagnosis: null | {
    ranAt: string;
    problems: Array<{ item: string; detail: string; origin: string; priority: number }>;
    manualValidationPending: string[];
  };
  proposal: {
    goal: string;
    primaryCta: string;
    sections: string[];
    priorities: string[];
    tone: string;
    mustHave: string[];
  };
  sources: Array<{ provider: string; url?: string; collectedAt: string }>;
  constraints: {
    doNotPublishWithoutApproval: true;
    isDemoData: boolean;
  };
}

/** FNV-1a 32 bits em duas passadas → chave hexadecimal estável (não é criptográfica). */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function sectionsFor(segment: string): string[] {
  const n = segment.toLowerCase();
  const base = ['Hero com oferta clara + botão de WhatsApp', 'Serviços', 'Sobre / equipe'];
  let specific: string[] = [];
  if (/restaurante|pizzaria|lanchonete|hamburg|café|cafe|padaria|confeitaria|bar\b/.test(n)) specific = ['Cardápio', 'Delivery e reservas'];
  else if (/dent|odonto|clínic|clinic|médic|medic|psic|fisio|nutri|estétic|estetic|veterin/.test(n)) specific = ['Especialidades/tratamentos', 'Convênios e formas de pagamento'];
  else if (/imobili|corretor/.test(n)) specific = ['Imóveis em destaque', 'Avaliação/captação de imóvel'];
  else if (/academia|pilates|crossfit|escola|curso/.test(n)) specific = ['Planos/modalidades', 'Aula experimental'];
  else if (/advoga|contab|contador/.test(n)) specific = ['Áreas de atuação', 'Primeira consulta'];
  else if (/salão|salao|barbear|beleza|manicure/.test(n)) specific = ['Serviços e preços', 'Agendamento online'];
  else if (/oficina|mecânic|mecanic|auto/.test(n)) specific = ['Serviços e marcas atendidas', 'Pedido de orçamento'];
  return [...base, ...specific, 'Avaliações / depoimentos', 'Localização, mapa e horário', 'Perguntas frequentes', 'Contato'];
}

export function buildBriefing(lead: Lead, score: ScoreResult, pitch: Pitch, now = new Date()): SiteBriefing {
  const own = hasOwnSite(lead);
  const problems = (lead.diagnosis?.checks ?? [])
    .filter((c) => c.result === 'problema' || c.result === 'atencao')
    .sort((a, b) => a.priority - b.priority)
    .map((c) => ({ item: c.label, detail: c.detail, origin: c.origin, priority: c.priority }));
  const pendingManual = (lead.diagnosis?.checks ?? []).filter((c) => c.result === 'nao_verificado').map((c) => c.label);

  const priorities: string[] = [];
  if (!own) priorities.push('Presença própria no Google com nome, serviço e cidade no título');
  for (const p of problems.slice(0, 5)) priorities.push(`Corrigir: ${p.item}`);
  priorities.push('Contato em 1 toque no celular (WhatsApp e telefone)');
  if (lead.reviewCount) priorities.push('Destacar avaliações reais dos clientes');

  const segment = lead.niche || lead.category || '';
  const core = {
    business: {
      name: lead.name,
      segment,
      category: lead.category,
      city: lead.city,
      neighborhood: lead.neighborhood,
      state: lead.state,
      address: lead.address,
      phone: lead.phone ? formatPhone(lead.phone) : undefined,
      whatsapp: lead.whatsapp ? formatPhone(lead.whatsapp) : undefined,
      currentWebsite: own ? lead.website : undefined,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
    },
    proposal: {
      goal: own ? `Reformular o site ${domainOf(lead.website)} com foco em conversão` : 'Criar o primeiro site da empresa',
      primaryCta: lead.whatsapp || lead.phone ? 'Chamar no WhatsApp' : 'Pedir orçamento',
      sections: sectionsFor(segment),
      priorities: [...new Set(priorities)],
      tone: 'Profissional, próximo e local; linguagem simples; sem promessas de resultado.',
      mustHave: ['Responsivo (mobile first)', 'HTTPS', 'Title e description com serviço + cidade', 'Botão fixo de WhatsApp', 'Mapa e horário', 'Schema.org LocalBusiness'],
    },
  };

  return {
    schema: BRIEFING_SCHEMA,
    idempotencyKey: `lead-${lead.id}-${stableHash(JSON.stringify(core))}`,
    generatedAt: now.toISOString(),
    ...core,
    commercialContext: {
      funnelStatus: STATUS_LABEL[lead.status],
      opportunityScore: score.score,
      temperature: score.temperature,
      confidence: Math.round(score.confidence * 100) / 100,
      mainArgument: pitch.mainArgument,
      signals: pitch.basedOn,
      notes: lead.notes || undefined,
    },
    currentSiteDiagnosis: lead.diagnosis?.ok
      ? { ranAt: lead.diagnosis.ranAt, problems, manualValidationPending: pendingManual }
      : null,
    sources: lead.sources.map((s) => ({ provider: s.provider, url: s.url, collectedAt: s.collectedAt })),
    constraints: { doNotPublishWithoutApproval: true, isDemoData: lead.isDemo },
  };
}

export function briefingToMarkdown(b: SiteBriefing): string {
  const L: string[] = [];
  const biz = b.business;
  L.push(`# Briefing de site — ${biz.name}`, '');
  L.push(`> Schema \`${b.schema}\` · chave \`${b.idempotencyKey}\` · gerado em ${b.generatedAt}`);
  if (b.constraints.isDemoData) L.push('', '> ⚠️ DADOS DE DEMONSTRAÇÃO — não usar com cliente real.');
  L.push('', '## Empresa');
  const rows: Array<[string, string | number | undefined]> = [
    ['Segmento', biz.segment], ['Categoria', biz.category], ['Cidade', biz.city], ['Bairro', biz.neighborhood],
    ['Endereço', biz.address], ['Telefone', biz.phone], ['WhatsApp', biz.whatsapp], ['Site atual', biz.currentWebsite ?? 'não possui'],
    ['Avaliações', biz.reviewCount != null ? `${biz.rating ?? '—'} (${biz.reviewCount})` : undefined],
  ];
  for (const [k, v] of rows) if (v !== undefined && v !== '') L.push(`- **${k}:** ${v}`);
  L.push('', '## Contexto comercial');
  L.push(`- Status: ${b.commercialContext.funnelStatus}`);
  L.push(`- Score de oportunidade: ${b.commercialContext.opportunityScore}/100 (${b.commercialContext.temperature}, confiança ${Math.round(b.commercialContext.confidence * 100)}%)`);
  L.push(`- Argumento: ${b.commercialContext.mainArgument}`);
  if (b.commercialContext.signals.length) L.push(`- Sinais: ${b.commercialContext.signals.join('; ')}`);
  if (b.commercialContext.notes) L.push(`- Observações: ${b.commercialContext.notes}`);
  L.push('', '## Diagnóstico do site atual');
  if (!b.currentSiteDiagnosis) L.push(biz.currentWebsite ? '_Diagnóstico não executado._' : '_Empresa sem site próprio._');
  else {
    for (const p of b.currentSiteDiagnosis.problems) L.push(`- [${p.origin}] **${p.item}** — ${p.detail}`);
    if (!b.currentSiteDiagnosis.problems.length) L.push('- Nenhum problema automático encontrado.');
    if (b.currentSiteDiagnosis.manualValidationPending.length) L.push(`- Validação manual pendente: ${b.currentSiteDiagnosis.manualValidationPending.join(', ')}`);
  }
  L.push('', '## Proposta');
  L.push(`- Objetivo: ${b.proposal.goal}`, `- CTA principal: ${b.proposal.primaryCta}`, `- Tom: ${b.proposal.tone}`);
  L.push('', '### Estrutura sugerida', ...b.proposal.sections.map((s, i) => `${i + 1}. ${s}`));
  L.push('', '### Prioridades', ...b.proposal.priorities.map((s) => `- ${s}`));
  L.push('', '### Obrigatório', ...b.proposal.mustHave.map((s) => `- ${s}`));
  L.push('', '## Fontes', ...b.sources.map((s) => `- ${s.provider} — ${s.collectedAt}${s.url ? ` — ${s.url}` : ''}`));
  L.push('', '_Não publicar sem aprovação explícita._');
  return L.join('\n');
}
