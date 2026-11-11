// Perfil de abordagem do lead: o robô fala diferente com quem NÃO tem site, com quem só usa rede social,
// com quem tem site com problemas e com quem tem site ok (mas pode ficar mais personalizado e atualizado).
// Só usa fatos reais (cadastro do Google/diagnóstico). Sem diagnóstico, não inventa problema.
import type { Lead } from '../types';
import { domainOf } from '../normalize';
import { hasOwnSite } from '../scoring';

export type LeadKind = 'sem_site' | 'rede_social' | 'site_fraco' | 'site_ok';

export interface LeadProfile {
  kind: LeadKind;
  /** Rótulo curto para a tela. */
  label: string;
  /** Domínio do site próprio (se houver). */
  domain?: string;
  /** Nome da rede social usada como "site" (Instagram, Facebook…). */
  network?: string;
  /** Problemas reais do diagnóstico, do mais importante ao menos, em linguagem de cliente. */
  problems: string[];
}

// Linguagem de cliente (sem jargão) para cada verificação do diagnóstico.
const PHRASE: Record<string, string> = {
  https: 'o site aparece como "não seguro" no navegador (sem HTTPS)',
  status: 'o site está fora do ar ou com erro',
  viewport: 'o site não está preparado para celular',
  velocidade: 'o site está lento para carregar',
  title: 'faltam informações que o Google mostra nos resultados de busca',
  description: 'faltam informações que o Google mostra nos resultados de busca',
  whatsapp: 'não há um botão de WhatsApp para o cliente chamar rápido',
  contato: 'o contato está difícil de encontrar',
  cta: 'faltam chamadas claras para o cliente entrar em contato',
  oferta: 'a oferta não fica clara logo de início',
  desatualizado: 'o visual parece desatualizado',
  seo_local: 'o site não está bem preparado para ser encontrado na região pelo Google',
};

const NETWORKS: Array<[RegExp, string]> = [
  [/instagram\.com/, 'Instagram'], [/facebook\.com|fb\.com/, 'Facebook'], [/linktr\.ee|linktree|beacons|bio\.link/, 'Linktree'],
  [/tiktok/, 'TikTok'], [/youtube/, 'YouTube'], [/wa\.me|whatsapp/, 'WhatsApp'], [/ifood/, 'iFood'], [/doctoralia/, 'Doctoralia'],
];

export function leadProfile(lead: Lead): LeadProfile {
  if (!lead.website) return { kind: 'sem_site', label: 'Sem site no Google', problems: [] };
  const domain = domainOf(lead.website);
  if (!hasOwnSite(lead)) {
    const network = NETWORKS.find(([re]) => re.test(domain ?? ''))?.[1] ?? 'rede social';
    return { kind: 'rede_social', label: `Só ${network} (sem site próprio)`, network, problems: [] };
  }
  const checks = (lead.diagnosis?.ok ? lead.diagnosis.checks : []) ?? [];
  const ranked = [...checks.filter((c) => c.result === 'problema'), ...checks.filter((c) => c.result === 'atencao' && c.priority === 1)].sort((a, b) => a.priority - b.priority);
  const problems = [...new Set(ranked.map((c) => PHRASE[c.id]).filter((p): p is string => !!p))].slice(0, 3);
  return problems.length ? { kind: 'site_fraco', label: 'Site com pontos de melhoria', domain, problems } : { kind: 'site_ok', label: 'Tem site', domain, problems: [] };
}
