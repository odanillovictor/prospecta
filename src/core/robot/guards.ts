// Travas de segurança do robô: parar quando o lead pede, respeitar horário, teto diário e intervalo mínimo.
// Funções puras (sem relógio, sem rede): o chamador passa `now`.
import type { Lead, RobotMessage, RobotSettings } from '../types';
import { normalizeBrPhone } from '../normalize';

const OPT_OUT = /\b(pare|parar|pare de|para de me|n[aã]o quero|n[aã]o tenho interesse|sem interesse|n[aã]o me (chame|mande|envie|procure)|me (tira|tire|remove|remova)|remover|descadastr|sair da lista|chega de|spam|denunci|bloque(i|ar|ei))\b/i;

/** O lead pediu para parar de receber mensagens? */
export function isOptOut(text: string): boolean {
  return OPT_OUT.test(text.normalize('NFC'));
}

/** Janela de envio: hora local dentro de [startHour, endHour) e, se pedido, só dias úteis. */
export function withinSendWindow(now: Date, s: Pick<RobotSettings, 'startHour' | 'endHour' | 'weekdaysOnly'>): boolean {
  const day = now.getDay();
  if (s.weekdaysOnly && (day === 0 || day === 6)) return false;
  const h = now.getHours();
  return h >= s.startHour && h < s.endHour;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Quantas mensagens do robô foram ENVIADAS hoje (teste e descartadas não contam). */
export function sentToday(leads: Lead[], now: Date): number {
  let n = 0;
  for (const l of leads) for (const m of l.robot?.messages ?? []) if (m.dir === 'out' && m.state === 'enviada' && sameDay(new Date(m.at), now)) n++;
  return n;
}

/** Última mensagem enviada por qualquer robô (para o intervalo mínimo). */
export function lastSentAt(leads: Lead[]): Date | undefined {
  let last = 0;
  for (const l of leads) for (const m of l.robot?.messages ?? []) if (m.dir === 'out' && m.state === 'enviada') last = Math.max(last, new Date(m.at).getTime());
  return last ? new Date(last) : undefined;
}

export interface SendCheck {
  ok: boolean;
  reason?: string;
}

/** Pode enviar AGORA? (pausa geral, número válido, horário, teto diário, intervalo mínimo). */
export function canSendNow(lead: Lead, leads: Lead[], now: Date, s: RobotSettings): SendCheck {
  if (s.paused) return { ok: false, reason: 'Robô em pausa geral (Ajustes → Robô).' };
  const phone = normalizeBrPhone(lead.whatsapp || lead.phone);
  if (phone.kind !== 'celular') return { ok: false, reason: 'Só envia para celular (provável WhatsApp). Este número é fixo ou inválido.' };
  if (!withinSendWindow(now, s)) return { ok: false, reason: `Fora do horário de envio (${s.startHour}h–${s.endHour}h${s.weekdaysOnly ? ', dias úteis' : ''}).` };
  if (!s.dryRun && sentToday(leads, now) >= s.dailyLimit) return { ok: false, reason: `Limite diário de ${s.dailyLimit} mensagens atingido.` };
  const last = lastSentAt(leads);
  if (!s.dryRun && last && now.getTime() - last.getTime() < s.minGapSec * 1000) return { ok: false, reason: `Aguardando o intervalo mínimo de ${s.minGapSec}s entre envios.` };
  return { ok: true };
}

export const lastOf = (msgs: RobotMessage[], dir: RobotMessage['dir']): RobotMessage | undefined => [...msgs].reverse().find((m) => m.dir === dir && m.state !== 'descartada');
