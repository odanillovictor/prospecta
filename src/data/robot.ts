// Ações e laço do robô de vendas. Tudo que muda o lead passa por aqui (e pela estratégia pura em core/robot).
import { BEFORE_CONTACT, type Lead, type RobotMessage, type RobotStage, type RobotState } from '../core/types';
import { buildWhatsAppLink } from '../core/whatsapp';
import { buildAgentRequest, parseAgentResponse } from '../core/robot/agent';
import { canSendNow, isOptOut, lastOf } from '../core/robot/guards';
import { newMessage, newRobot, nextStep, publicPreviewUrl } from '../core/robot/strategy';
import { replyFor } from '../core/robot/brain';
import { robotApi } from './robotApi';
import { store } from './store';

const settings = () => store.getSettings();

/** Trecho [entre colchetes] esquecido na mensagem (ex.: "[seu nome]"): nunca pode sair assim. */
export const hasPlaceholder = (t: string) => new RegExp('\\[[^\\]\\n]{2,40}\\]').test(t);
const leadOf = (id: string) => store.getLeads().find((l) => l.id === id);

function patchRobot(leadId: string, fn: (r: RobotState) => RobotState) {
  store.updateLead(leadId, (l) => (l.robot ? { robot: fn(l.robot) } : {}));
}

function addMessage(leadId: string, m: RobotMessage) {
  patchRobot(leadId, (r) => ({ ...r, messages: [...r.messages, m] }));
}

function setMessage(leadId: string, msgId: string, patch: Partial<RobotMessage>) {
  patchRobot(leadId, (r) => ({ ...r, messages: r.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }));
}

/** Liga o robô neste lead (a 1ª mensagem aparece para aprovação no próximo ciclo ou já, se `firstText` vier). */
export function activateRobot(leadId: string, mode = settings().robot.mode, firstText?: string) {
  const now = new Date();
  store.updateLead(leadId, (l) => {
    const robot = newRobot(mode, now);
    if (firstText) robot.messages.push(newMessage({ at: now.toISOString(), dir: 'out', text: firstText, state: 'pendente', stage: 'abertura' }));
    return { robot, contactLog: [...l.contactLog, { at: now.toISOString(), channel: 'outro', note: 'Robô de vendas ativado' }] };
  });
}

export function deactivateRobot(leadId: string, reason = 'Desativado por você.') {
  const now = new Date().toISOString();
  store.updateLead(leadId, (l) => (l.robot ? { robot: { ...l.robot, active: false, stage: 'encerrado' as RobotStage, stopReason: reason }, contactLog: [...l.contactLog, { at: now, channel: 'outro', note: `Robô parou: ${reason}` }] } : {}));
}

export function clearRobotTask(leadId: string) {
  patchRobot(leadId, (r) => ({ ...r, task: undefined }));
}

export function discardMessage(leadId: string, msgId: string) {
  setMessage(leadId, msgId, { state: 'descartada', note: 'Descartada por você.' });
}

export interface SendResult {
  ok: boolean;
  reason?: string;
  teste?: boolean;
}

/** Envia (ou, em modo teste, só escreve) uma mensagem pendente. Respeita todas as travas. */
export async function sendPending(leadId: string, msgId: string, editedText?: string): Promise<SendResult> {
  const lead = leadOf(leadId);
  const msg = lead?.robot?.messages.find((m) => m.id === msgId);
  if (!lead || !msg || msg.state !== 'pendente') return { ok: false, reason: 'Mensagem não está mais pendente.' };
  const s = settings().robot;
  const check = canSendNow(lead, store.getLeads(), new Date(), s);
  if (!check.ok) return { ok: false, reason: check.reason };
  const target = buildWhatsAppLink(lead, '');
  if (!target.ok || !target.number) return { ok: false, reason: target.error ?? 'Número inválido.' };
  const text = (editedText ?? msg.text).trim();
  if (!text) return { ok: false, reason: 'Mensagem vazia.' };
  if (hasPlaceholder(text)) return { ok: false, reason: 'A mensagem tem um trecho [entre colchetes] para preencher (ex.: seu nome em Ajustes).' };
  try {
    const r = await robotApi.send(target.number, text, s.dryRun);
    const now = new Date().toISOString();
    if (r.enviado) {
      setMessage(leadId, msgId, { state: 'enviada', text, at: now });
      store.updateLead(leadId, (l) => ({
        lastContactAt: now,
        status: BEFORE_CONTACT.includes(l.status) ? 'contatado' : l.status,
        contactLog: [...l.contactLog, { at: now, channel: 'whatsapp', note: 'Mensagem enviada pelo robô (aprovada)' }],
      }));
      return { ok: true };
    }
    setMessage(leadId, msgId, { state: 'teste', text, at: now, note: 'Modo teste: escrita no WhatsApp Web, NÃO enviada.' });
    return { ok: true, teste: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Falha ao enviar.';
    // Envio incerto: não é seguro tentar de novo sem conferir (evita mensagem duplicada).
    setMessage(leadId, msgId, { state: 'falhou', note: /PODE ter sido enviada/.test(reason) ? `${reason} (não reenviar sem conferir)` : reason });
    return { ok: false, reason };
  }
}

// ---------- laço do robô ----------
let ticking = false;
const INBOX_EVERY_MS = 4 * 60_000;

/** Junta respostas novas do lead ao histórico. */
function mergeInbound(lead: Lead, incoming: Array<{ dir: 'in' | 'out'; text: string; at: string | null }>) {
  const known = new Set((lead.robot?.messages ?? []).filter((m) => m.dir === 'in').map((m) => `${m.text}|${m.at.slice(0, 16)}`));
  const lastOut = [...(lead.robot?.messages ?? [])].reverse().find((m) => m.dir === 'out' && (m.state === 'enviada' || m.state === 'teste'));
  const fresh = incoming.filter((m) => m.dir === 'in' && m.text && (!m.at || !lastOut || new Date(m.at) >= new Date(lastOut.at)) && !known.has(`${m.text}|${(m.at ?? new Date().toISOString()).slice(0, 16)}`));
  for (const m of fresh) addMessage(lead.id, newMessage({ at: m.at ?? new Date().toISOString(), dir: 'in', text: m.text, state: 'recebida' }));
  return fresh.length;
}

/** Pede ao agente do usuário a próxima ação; undefined se não houver agente ou a resposta for inválida. */
async function askAgent(lead: Lead, agentOn: boolean) {
  if (!agentOn) return undefined;
  try {
    const { resposta } = await robotApi.agente(buildAgentRequest(lead, store.getSettings().seller));
    const lastIn = lastOf(lead.robot?.messages ?? [], 'in')?.text;
    return parseAgentResponse(resposta, lastIn);
  } catch {
    return undefined;
  }
}

/** Um ciclo: decide o próximo passo de cada robô ativo, prepara mensagens e (modo automático) envia. */
export async function robotTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const s = settings();
    if (s.robot.paused) return;
    const status = await robotApi.status().catch(() => null);
    const now = new Date();
    for (const l of store.getLeads()) {
      if (!l.robot?.active || l.robot.stage === 'encerrado') continue;
      const lead = leadOf(l.id)!;
      const step = nextStep(lead, now, s.seller);
      const hasPending = lead.robot!.messages.some((m) => m.dir === 'out' && m.state === 'pendente');
      // O lead quis ver e a prévia já foi publicada (endereço público): prepara a mensagem com o link para você aprovar.
      if (lead.robot!.task === 'gerar_previa' && !hasPending) {
        const url = publicPreviewUrl(lead);
        if (url) {
          addMessage(lead.id, newMessage({ at: now.toISOString(), dir: 'out', text: `Prontinho! Aqui está a prévia do site da ${lead.name.split(/\s[|\-–]\s/)[0].trim()}: ${url}\n\nDá uma olhada com calma e me diga o que achou. Posso ajustar o que você quiser.`, state: 'pendente', stage: 'respondeu', note: 'Prévia publicada: link pronto para enviar' }));
          patchRobot(lead.id, (rb) => ({ ...rb, task: undefined }));
        }
        continue;
      }
      if (step.kind === 'stop-optout') {
        deactivateRobot(lead.id, 'O contato pediu para parar.');
        continue;
      }
      if (step.kind === 'done') {
        patchRobot(lead.id, (r) => ({ ...r, active: false, stage: 'encerrado', stopReason: 'Ciclo concluído sem resposta.' }));
        continue;
      }
      if (step.kind === 'reply-needed') {
        if (lead.robot!.stage !== 'respondeu') patchRobot(lead.id, (r) => ({ ...r, stage: 'respondeu' }));
        if (!hasPending) {
          const a = await askAgent(lead, !!status?.agente);
          if (a?.action === 'send') addMessage(lead.id, newMessage({ at: now.toISOString(), dir: 'out', text: a.text, state: 'pendente', stage: 'respondeu', note: a.note ? `Agente: ${a.note}` : 'Sugerida pelo agente' }));
          else if (a?.action === 'stop') deactivateRobot(lead.id, a.note ?? 'O agente encerrou a conversa.');
          else if (!a) {
            // Sem agente: cérebro embutido (regras, grátis). Não entendeu ou falta dado da proposta → você assume.
            const lastIn = lastOf(lead.robot!.messages, 'in');
            const r = lastIn ? replyFor(lead, lastIn.text, s.seller, { offerText: s.robot.offerText, priceText: s.robot.priceText, meetingText: s.robot.meetingText }) : undefined;
            if (r?.action === 'send') {
              addMessage(lead.id, newMessage({ at: now.toISOString(), dir: 'out', text: r.text, state: 'pendente', stage: 'respondeu', note: `Sugerida pelo robô (${r.note})` }));
              if (r.needsPreview) patchRobot(lead.id, (rb) => ({ ...rb, task: 'gerar_previa' }));
            }
            // Vai ter conversa: deixa o site pronto para mostrar na reunião (sem publicar).
            if (r && r.intent === 'reuniao' && r.action !== 'stop') patchRobot(lead.id, (rb) => ({ ...rb, task: rb.task ?? 'preparar_reuniao' }));
            else if (r?.action === 'stop') deactivateRobot(lead.id, r.note);
            else if (r?.action === 'handoff' && !lead.robot!.messages.some((m) => m.note === r.note)) patchRobot(lead.id, (rb) => ({ ...rb, messages: [...rb.messages, newMessage({ at: now.toISOString(), dir: 'out', text: '', state: 'descartada', stage: 'respondeu', note: r.note })] }));
          }
        }
        continue;
      }
      if (step.kind === 'compose' && !hasPending) {
        let text = step.text;
        let note: string | undefined;
        const a = await askAgent(lead, !!status?.agente);
        if (a?.action === 'send') {
          text = a.text;
          note = 'Texto do agente';
        } else if (a?.action === 'wait') continue;
        else if (a?.action === 'stop') {
          deactivateRobot(lead.id, a.note ?? 'O agente encerrou a conversa.');
          continue;
        }
        addMessage(lead.id, newMessage({ at: now.toISOString(), dir: 'out', text, state: 'pendente', stage: step.stage, note }));
        if (lead.robot!.mode === 'auto') {
          const fresh = leadOf(lead.id)!.robot!.messages.filter((m) => m.state === 'pendente').pop();
          if (fresh && status?.whatsapp === 'conectado') await sendPending(lead.id, fresh.id);
        }
      }
    }

    // Uma leitura de conversa por ciclo (o WhatsApp Web troca de conversa): quem não é lido há mais tempo e já recebeu mensagem real.
    if (s.robot.dryRun || status?.whatsapp !== 'conectado' || status.ocupado) return;
    const due = store.getLeads()
      .filter((l) => l.robot?.active && l.robot.messages.some((m) => m.dir === 'out' && m.state === 'enviada'))
      .filter((l) => !l.robot!.lastInboxAt || now.getTime() - new Date(l.robot!.lastInboxAt).getTime() > INBOX_EVERY_MS)
      .sort((a, b) => (a.robot!.lastInboxAt ?? '').localeCompare(b.robot!.lastInboxAt ?? ''))[0];
    if (due) {
      const target = buildWhatsAppLink(due, '');
      patchRobot(due.id, (r) => ({ ...r, lastInboxAt: now.toISOString() }));
      if (target.ok && target.number) {
        try {
          const { messages } = await robotApi.conversa(target.number);
          mergeInbound(leadOf(due.id)!, messages);
          // Pedido de parar tem prioridade imediata
          const fresh = leadOf(due.id)!;
          const lastIn = lastOf(fresh.robot!.messages, 'in');
          if (lastIn && isOptOut(lastIn.text)) deactivateRobot(due.id, 'O contato pediu para parar.');
        } catch {
          /* tenta de novo no próximo intervalo */
        }
      }
    }
  } finally {
    ticking = false;
  }
}

/** Mensagens pendentes de aprovação + conversas que responderam (para o selo do menu). */
export function robotAttention(leads: Lead[]): number {
  let n = 0;
  for (const l of leads) {
    if (!l.robot?.active) continue;
    if (l.robot.messages.some((m) => m.dir === 'out' && m.state === 'pendente')) n++;
    else if (l.robot.task) n++;
    else if (l.robot.stage === 'respondeu') n++;
  }
  return n;
}
