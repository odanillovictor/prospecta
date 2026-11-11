import { useMemo, useState } from 'react';
import { BEFORE_CONTACT, type Lead } from '../core/types';
import { scoreLead } from '../core/scoring';
import { buildPitch } from '../core/pitch';
import { buildWhatsAppLink } from '../core/whatsapp';
import { formatPhone } from '../core/normalize';
import { store, useSettings } from '../data/store';
import { Icon, Modal, Notice, useToast } from './common';

/** Registra o contato e coloca o lead no Funil em "Contato iniciado". */
export function startContact(leadId: string) {
  const now = new Date().toISOString();
  store.updateLead(leadId, (l) => ({
    lastContactAt: now,
    status: BEFORE_CONTACT.includes(l.status) ? 'contatado' : l.status,
    contactLog: [...l.contactLog, { at: now, channel: 'whatsapp', note: 'WhatsApp aberto pela ferramenta (mensagem de abertura)' }],
  }));
}

/** Revisar mensagem de abordagem e abrir o WhatsApp. Nada é enviado sem a pessoa apertar enviar no WhatsApp. */
export function WhatsAppDialog({ lead, onClose, initialMessage }: { lead: Lead; onClose: () => void; initialMessage?: string }) {
  const { scoring, seller } = useSettings();
  const toast = useToast();
  const suggested = useMemo(() => buildPitch(lead, scoreLead(lead, scoring), seller).whatsappMessage, [lead, scoring, seller]);
  const [msg, setMsg] = useState(initialMessage ?? suggested);
  const wa = buildWhatsAppLink(lead, msg);

  return (
    <Modal
      title={`WhatsApp — ${lead.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          {wa.ok && (
            <a className="btn btn-wa" href={wa.url} target="_blank" rel="noopener noreferrer" onClick={() => { startContact(lead.id); toast('Contato iniciado — o lead entrou no Funil.'); onClose(); }}>
              <Icon name="wa" /> Abrir WhatsApp
            </a>
          )}
        </>
      }
    >
      {!seller.name && <Notice kind="warn">Defina seu nome em Ajustes para a mensagem sair personalizada.</Notice>}
      {wa.ok && <div className="small">Para: <b className="mono">{formatPhone(wa.number)}</b></div>}
      {wa.warning && <Notice kind="warn">{wa.warning}</Notice>}
      {!wa.ok && <Notice kind="error">{wa.error}</Notice>}
      <label className="field"><span>Mensagem (pode editar)</span>
        <textarea className="textarea" rows={6} maxLength={1500} value={msg} onChange={(e) => setMsg(e.target.value)} />
      </label>
      <span className="tiny muted">Ao abrir, o lead vai para o Funil em "Contato iniciado". O envio continua sendo seu, dentro do WhatsApp.</span>
    </Modal>
  );
}
