// Links de WhatsApp (click-to-chat). Nada é enviado automaticamente: o link só abre a conversa
// com o texto pré-preenchido, e o envio continua sendo uma ação do usuário dentro do WhatsApp.
import { normalizeBrPhone } from './normalize';

export interface WhatsAppTarget {
  ok: boolean;
  url?: string;
  number?: string;
  warning?: string;
  error?: string;
}

const MAX_TEXT = 1500;

export function whatsappNumberFor(lead: { whatsapp?: string; phone?: string }): { number?: string; declared: boolean; kind?: string } {
  if (lead.whatsapp) return { number: lead.whatsapp, declared: true, kind: 'celular' };
  if (!lead.phone) return { declared: false };
  const p = normalizeBrPhone(lead.phone);
  return { number: p.e164, declared: false, kind: p.kind };
}

export function buildWhatsAppLink(lead: { whatsapp?: string; phone?: string }, text: string): WhatsAppTarget {
  const { number, declared, kind } = whatsappNumberFor(lead);
  if (!number) return { ok: false, error: 'Lead sem número de telefone válido.' };
  const digits = number.replace(/\D/g, '');
  if (!/^55[1-9]{2}\d{8,9}$/.test(digits)) return { ok: false, error: 'Número fora do padrão brasileiro.' };
  const clean = text.replace(/\u0000/g, '').trim().slice(0, MAX_TEXT);
  const url = `https://wa.me/${digits}${clean ? `?text=${encodeURIComponent(clean)}` : ''}`;
  let warning: string | undefined;
  if (!declared && kind === 'fixo') warning = 'Número fixo: pode não ter WhatsApp. Confirme antes.';
  else if (!declared) warning = 'WhatsApp não confirmado pela fonte: o número é o telefone cadastrado.';
  return { ok: true, url, number: digits, warning };
}
