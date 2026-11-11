// Estratégia de vendas do robô (determinística, sem IA): abertura → lembrete → novo ângulo → despedida.
// Se o usuário conectar um agente (Settings.robot.agentUrl), ele decide as respostas; esta estratégia continua
// como padrão e como rede de segurança. Funções puras: o chamador passa `now`.
import type { Lead, RobotMessage, RobotSettings, RobotStage, RobotState } from '../types';
import type { SellerProfile } from '../pitch';
import { leadProfile } from './profile';
import { isOptOut, lastOf } from './guards';

/** Horas desde a última mensagem ENVIADA até o próximo passo. */
export const FOLLOWUP_DELAY_H: Record<'followup1' | 'followup2' | 'despedida', number> = { followup1: 24, followup2: 72, despedida: 96 };

const ORDER: RobotStage[] = ['abertura', 'followup1', 'followup2', 'despedida'];

export type Step =
  | { kind: 'none'; why: string }
  | { kind: 'waiting-approval' }
  | { kind: 'wait'; until: Date; stage: RobotStage }
  | { kind: 'reply-needed' } // o lead respondeu: o robô para e avisa (ou o agente conectado responde)
  | { kind: 'stop-optout' }
  | { kind: 'compose'; stage: RobotStage; text: string }
  | { kind: 'done' };

export function newRobot(mode: RobotSettings['mode'], now: Date): RobotState {
  return { active: true, mode, stage: 'abertura', startedAt: now.toISOString(), messages: [] };
}

const firstName = (s: SellerProfile) => (s.name || '').trim().split(/\s+/)[0] || '';

/** A prévia só pode ir para o lead se estiver publicada num endereço público (nunca localhost). */
export function publicPreviewUrl(lead: Lead): string | undefined {
  const u = lead.siteDraft?.previewUrl;
  if (!u) return undefined;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && !/^(localhost|127\.|0\.0\.0\.0)/.test(x.hostname) ? u : undefined;
  } catch {
    return undefined;
  }
}

/** Texto de cada etapa, personalizado pelo perfil do lead (sem site / só rede social / site com problemas / site ok). O site só é publicado se o lead quiser ver: nada daqui leva link. */
export function composeText(lead: Lead, stage: RobotStage, seller: SellerProfile): string {
  const company = lead.name.replace(/^\[DEMO\]\s*/, '').split(/\s[|\-–]\s/)[0].trim();
  const eu = seller.name.trim() || '[seu nome]';
  const sign = seller.name ? `

— ${firstName(seller)}${seller.company ? `, ${seller.company}` : ''}` : '';
  const p = leadProfile(lead);
  const problem = p.problems[0];
  // Objetivo: uma conversa rápida em que o Danillo MOSTRA o site. Ver por mensagem, sem reunião, é a opção do lead.
  const oferta = 'Gostaria de te mostrar como o site ficaria numa conversa rápida (uns 15 minutos), sem compromisso. Se preferir ver por aqui mesmo, é só me dizer que eu te envio a prévia. O que acha?';
  switch (stage) {
    case 'abertura': {
      const nota = lead.rating != null && lead.reviewCount && lead.rating >= 4.5 ? ` (nota ${lead.rating.toFixed(1).replace('.', ',')} no Google, parabéns!)` : '';
      const quem = `Olá, tudo bem? Aqui é ${eu}${seller.company ? `, da ${seller.company}` : ', web designer'}. Vi a ${company} no Google${nota}.`;
      // Momento 1 (quem não tem site): só pergunta, curto. O pitch com o protótipo vai no momento 2, quando respondem "não tenho" (brain.ts).
      if (p.kind === 'sem_site' || p.kind === 'rede_social') return `Olá, tudo bem? Aqui é ${eu}${seller.company ? `, da ${seller.company}` : ''}. Gostaria de saber se a ${company} tem um site ou página?`;
      if (p.kind === 'site_fraco')
        return `${quem} Olhei o site de vocês (${p.domain}) e vi um ponto que pode estar custando clientes: ${problem}. ${oferta.replace('como o site ficaria', 'uma versão melhorada dele')}`;
      return `${quem} Olhei o site de vocês (${p.domain}) e vejo espaço para deixá-lo mais personalizado e atualizado, com foco em atrair e transformar visitantes em contatos. ${oferta.replace('como o site ficaria', 'uma versão renovada dele')}`;
    }
    case 'followup1':
      return `Oi! Só passando para saber se você viu minha mensagem sobre ${p.kind === 'sem_site' || p.kind === 'rede_social' ? `o site da ${company}` : 'a melhoria do site da ' + company}. Se quiser, marcamos uma conversa rápida para eu te mostrar, ou te envio a prévia por aqui, o que for melhor para você.${sign}`;
    case 'followup2': {
      const angulo =
        p.kind === 'sem_site' ? `Muita gente pesquisa no Google antes de procurar um profissional, e sem site a ${company} pode ficar de fora dessas buscas.`
        : p.kind === 'rede_social' ? `Hoje o cliente costuma pesquisar no Google antes de chamar, e um site próprio ajuda a ${company} a ser encontrada e a passar mais confiança.`
        : p.kind === 'site_fraco' ? `Ao olhar a presença online da ${company}, notei que ${problem}.`
        : `Um site mais atual e com a cara da ${company} ajuda mais visitantes a virarem contatos.`;
      return `Olá! ${angulo} Se quiser ver como ficaria, podemos fazer uma conversa rápida ou eu te envio a prévia por aqui.${sign}`;
    }
    case 'despedida':
      return `Última mensagem por aqui para não incomodar. Se mudar de ideia sobre o site da ${company}, é só me chamar. Sucesso!${sign}`;
    default:
      return '';
  }
}

/** Próximo passo do robô para um lead. */
export function nextStep(lead: Lead, now: Date, seller: SellerProfile): Step {
  const r = lead.robot;
  if (!r || !r.active) return { kind: 'none', why: 'Robô desligado.' };
  if (r.stage === 'encerrado') return { kind: 'none', why: r.stopReason ?? 'Encerrado.' };
  const msgs = r.messages;
  const lastIn = lastOf(msgs, 'in');
  const lastOut = [...msgs].reverse().find((m) => m.dir === 'out' && (m.state === 'enviada' || m.state === 'teste'));
  if (lastIn && (!lastOut || new Date(lastIn.at) >= new Date(lastOut.at))) return isOptOut(lastIn.text) ? { kind: 'stop-optout' } : { kind: 'reply-needed' };
  if (msgs.some((m) => m.dir === 'out' && m.state === 'pendente')) return { kind: 'waiting-approval' };
  // Quem já respondeu não recebe mais lembretes automáticos: a conversa segue com você (ou com o agente conectado).
  if (lastIn) return { kind: 'none', why: 'O contato respondeu; a conversa segue com você.' };
  const sent = new Set(msgs.filter((m) => m.dir === 'out' && (m.state === 'enviada' || m.state === 'teste')).map((m) => m.stage));
  const next = ORDER.find((st) => !sent.has(st));
  if (!next) return { kind: 'done' };
  if (next === 'abertura') return { kind: 'compose', stage: next, text: composeText(lead, next, seller) };
  const due = new Date(new Date(lastOut!.at).getTime() + FOLLOWUP_DELAY_H[next as 'followup1'] * 3600_000);
  if (now < due) return { kind: 'wait', until: due, stage: next };
  return { kind: 'compose', stage: next, text: composeText(lead, next, seller) };
}

export const newMessage = (m: Omit<RobotMessage, 'id'>): RobotMessage => ({ id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, ...m });
