import { useEffect, useMemo, useState } from 'react';
import type { Lead, RobotMessage } from '../core/types';
import { buildWhatsAppLink } from '../core/whatsapp';
import { formatPhone } from '../core/normalize';
import { composeText } from '../core/robot/strategy';
import { leadProfile } from '../core/robot/profile';
import { canSendNow, sentToday } from '../core/robot/guards';
import { store, useLeads, useSettings } from '../data/store';
import { robotApi, type RobotStatus } from '../data/robotApi';
import { activateRobot, clearRobotTask, deactivateRobot, discardMessage, hasPlaceholder, sendPending } from '../data/robot';
import { Icon, Modal, Notice, useToast } from './common';

const STAGE_LABEL: Record<string, string> = {
  abertura: 'Abertura',
  followup1: 'Lembrete (24 h)',
  followup2: 'Novo ângulo (72 h)',
  despedida: 'Despedida',
  respondeu: 'Respondeu — sua vez',
  encerrado: 'Encerrado',
};

/** Estado do serviço local + extensão + WhatsApp Web, atualizado a cada poucos segundos. */
export function useRobotStatus(every = 5000): { status: RobotStatus | null; error: string | null } {
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = useSettings().robot.serviceUrl;
  useEffect(() => {
    let alive = true;
    const run = () => robotApi.status().then((s) => alive && (setStatus(s), setError(null))).catch((e: Error) => alive && (setStatus(null), setError(e.message)));
    run();
    const t = setInterval(run, every);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [every, url]);
  return { status, error };
}

function StatusChips({ status, error }: { status: RobotStatus | null; error: string | null }) {
  const settings = useSettings().robot;
  const wa = status?.whatsapp;
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      <span className={`chip ${status ? 'chip-ok' : 'chip-bad'}`}>serviço {status ? 'ligado' : 'desligado'}</span>
      <span className={`chip ${wa === 'conectado' ? 'chip-ok' : wa ? 'chip-attn' : 'chip-cold'}`}>
        WhatsApp Web: {!status ? '—' : wa === 'conectado' ? 'conectado' : wa === 'extensao_ausente' ? 'extensão/aba ausente' : wa === 'qr' ? 'faça login (QR)' : 'carregando'}
      </span>
      <span className={`chip ${settings.dryRun ? 'chip-attn' : 'chip-hot'}`}>{settings.dryRun ? 'modo teste (não envia)' : 'ENVIO REAL'}</span>
      {status && !status.envioReal && !settings.dryRun && <span className="chip chip-bad">serviço sem envio real (npm run robo:real)</span>}
      {settings.paused && <span className="chip chip-bad">em pausa</span>}
      {error && <span className="tiny muted">{error}</span>}
    </div>
  );
}

function MessageEditor({ lead, msg }: { lead: Lead; msg: RobotMessage }) {
  const toast = useToast();
  const [text, setText] = useState(msg.text);
  const [busy, setBusy] = useState(false);
  const settings = useSettings().robot;
  const leads = useLeads();
  const check = canSendNow(lead, leads, new Date(), settings);
  async function approve() {
    setBusy(true);
    const r = await sendPending(lead.id, msg.id, text);
    setBusy(false);
    if (!r.ok) toast(r.reason ?? 'Não foi possível enviar.', true);
    else toast(r.teste ? 'Modo teste: a mensagem foi escrita no WhatsApp Web, mas NÃO foi enviada.' : 'Mensagem enviada.');
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <textarea className="textarea" rows={5} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} />
      {!check.ok && <Notice kind="warn">{check.reason}</Notice>}
      {hasPlaceholder(text) && <Notice kind="warn">Há um trecho [entre colchetes] para preencher (ex.: defina seu nome em Ajustes → Seu perfil).</Notice>}
      <div className="row">
        <button className="btn btn-wa" disabled={busy || !check.ok || !text.trim() || hasPlaceholder(text)} onClick={approve}><Icon name="wa" /> {busy ? 'Enviando…' : settings.dryRun ? 'Aprovar (escrever no WhatsApp, modo teste)' : 'Aprovar e enviar'}</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => discardMessage(lead.id, msg.id)}>Descartar</button>
      </div>
    </div>
  );
}

function History({ lead }: { lead: Lead }) {
  const msgs = (lead.robot?.messages ?? []).filter((m) => m.state !== 'pendente');
  if (!msgs.length) return <div className="small muted">Sem mensagens ainda.</div>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {msgs.map((m) => (
        <div key={m.id} className={`robot-msg robot-${m.dir}`}>
          <div className="tiny muted">{m.dir === 'out' ? 'Robô' : 'Lead'} · {new Date(m.at).toLocaleString('pt-BR')}{m.stage ? ` · ${STAGE_LABEL[m.stage] ?? m.stage}` : ''}{m.state === 'teste' ? ' · TESTE (não enviada)' : m.state === 'descartada' ? ' · descartada' : m.state === 'falhou' ? ' · FALHOU' : ''}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
          {m.note && <div className="tiny muted">{m.note}</div>}
        </div>
      ))}
    </div>
  );
}

/** Botão do lead: "Ativar robô" ou "Robô ativo". */
export function RobotButton({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const active = !!lead.robot?.active;
  const target = buildWhatsAppLink(lead, '');
  return (
    <button className={`btn btn-sm ${active ? 'btn-accent' : ''}`} disabled={!active && !target.ok} title={!active && !target.ok ? 'Sem celular válido para WhatsApp' : 'Robô de vendas no WhatsApp'} onClick={onOpen}>
      <Icon name="bot" /> {active ? 'Robô ativo' : 'Ativar robô'}
    </button>
  );
}

/** Janela do robô de um lead: ativar, aprovar mensagens, ver conversa, desativar. */
export function RobotDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const leads = useLeads();
  const settings = useSettings();
  const toast = useToast();
  const lead = leads.find((l) => l.id === leadId);
  const { status, error } = useRobotStatus();
  const [mode, setMode] = useState(settings.robot.mode);
  const suggested = useMemo(() => (lead ? composeText(lead, 'abertura', settings.seller) : ''), [lead, settings.seller]);
  const [first, setFirst] = useState(suggested);
  useEffect(() => setFirst(suggested), [suggested]);
  if (!lead) return null;
  const r = lead.robot;
  const target = buildWhatsAppLink(lead, '');
  const pending = r?.messages.filter((m) => m.dir === 'out' && m.state === 'pendente') ?? [];

  return (
    <Modal title={`Robô de vendas — ${lead.name}`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Fechar</button>}>
      <StatusChips status={status} error={error} />
      {target.ok && target.number && <div className="small">WhatsApp: <b className="mono">{formatPhone(target.number)}</b>{target.warning ? ` · ${target.warning}` : ''}</div>}
      {!target.ok && <Notice kind="error">{target.error}</Notice>}
      <div className="small">Perfil do lead: <b>{leadProfile(lead).label}</b> · a mensagem foi escrita para esse caso{leadProfile(lead).problems[0] ? ` (ponto citado: ${leadProfile(lead).problems[0]})` : ''}.</div>
      {status?.whatsapp === 'extensao_ausente' && <Notice kind="warn">Abra <b>web.whatsapp.com</b> no seu Chrome com a extensão "Prospecta Robô" instalada (passo a passo em Robô → Como instalar).</Notice>}

      {!r?.active ? (
        <>
          <label className="field"><span>Primeira mensagem (você aprova antes de sair)</span>
            <textarea className="textarea" rows={6} maxLength={1500} value={first} onChange={(e) => setFirst(e.target.value)} />
          </label>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <label className="row" style={{ gap: 6 }}><input type="radio" checked={mode === 'approve'} onChange={() => setMode('approve')} /> Aprovar cada mensagem (recomendado)</label>
            <label className="row" style={{ gap: 6 }}><input type="radio" checked={mode === 'auto'} onChange={() => setMode('auto')} /> Automático (dentro dos limites)</label>
          </div>
          <div className="tiny muted">Estratégia: abertura → lembrete em 24 h → novo ângulo em 72 h → despedida. Para sozinho se o contato pedir ("pare", "não quero"). Horário {settings.robot.startHour}h–{settings.robot.endHour}h, máx. {settings.robot.dailyLimit} envios/dia.</div>
          {hasPlaceholder(first) && <Notice kind="warn">A mensagem tem um trecho [entre colchetes] (ex.: seu nome). Defina seu nome em Ajustes → Seu perfil ou edite o texto.</Notice>}
          <div className="row">
            <button className="btn btn-accent" disabled={!target.ok || !first.trim() || hasPlaceholder(first)} onClick={() => { activateRobot(lead.id, mode, first.trim()); toast('Robô ativado. A 1ª mensagem aguarda sua aprovação.'); }}>
              <Icon name="bot" /> Ativar robô
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><b>{STAGE_LABEL[r.stage]}</b> · modo {r.mode === 'approve' ? 'aprovar cada mensagem' : 'automático'}</div>
            <button className="btn btn-sm btn-ghost" onClick={() => { deactivateRobot(lead.id); toast('Robô desativado neste lead.'); }}>Desativar robô</button>
          </div>
          {r.stage === 'respondeu' && <Notice kind="info">O contato respondeu. Veja abaixo e responda no WhatsApp (ou aprove a sugestão do agente, se houver).</Notice>}
          {pending.map((m) => (
            <div key={m.id} className="panel panel-pad stack" style={{ gap: 6 }}>
              <b className="small">Aguardando sua aprovação · {STAGE_LABEL[m.stage ?? 'abertura']}{m.note ? ` · ${m.note}` : ''}</b>
              <MessageEditor lead={lead} msg={m} />
            </div>
          ))}
          <h3 style={{ margin: '6px 0 0' }}>Conversa</h3>
          <History lead={lead} />
        </>
      )}
    </Modal>
  );
}

/** Tela "Robô": fila de aprovação, conversas ativas e ajustes. */
export function RobotView() {
  const leads = useLeads();
  const { robot } = useSettings();
  const toast = useToast();
  const { status, error } = useRobotStatus();
  const [openId, setOpenId] = useState<string | null>(null);
  const active = leads.filter((l) => l.robot?.active);
  const queue = active.flatMap((l) => l.robot!.messages.filter((m) => m.dir === 'out' && m.state === 'pendente').map((m) => ({ lead: l, msg: m })));
  const replied = active.filter((l) => l.robot!.stage === 'respondeu');
  const previews = active.filter((l) => l.robot!.task === 'gerar_previa');
  const reunioes = active.filter((l) => l.robot!.task === 'preparar_reuniao');
  const isPublicHost = !/^(localhost|127\.)/.test(window.location.hostname);
  const set = (patch: Partial<typeof robot>) => store.setSettings({ robot: { ...robot, ...patch } });
  const num = (v: string, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Math.round(Number(v) || fallback)));

  return (
    <>
      <div className="page-head"><div><div className="kicker">Robô de vendas</div><h1>Conversas no WhatsApp</h1></div></div>
      <div className="stack">
        <div className="panel panel-pad stack">
          <h2>Estado</h2>
          <StatusChips status={status} error={error} />
          <div className="small muted">Enviadas hoje: <b>{sentToday(leads, new Date())}</b> de {robot.dailyLimit} (teto do serviço: {status?.tetoDia ?? '—'}). O robô só funciona com este app aberto, o serviço ligado (<span className="mono">npm run robo</span>) e a aba do WhatsApp Web aberta no Chrome.</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${robot.paused ? 'btn-primary' : ''}`} onClick={() => { set({ paused: !robot.paused }); robotApi.pausa(!robot.paused).catch(() => {}); toast(robot.paused ? 'Robô retomado.' : 'Robô em pausa: nada será preparado nem enviado.'); }}>{robot.paused ? 'Retomar robô' : 'Pausar tudo'}</button>
          </div>
        </div>

        <div className="panel panel-pad stack">
          <h2>Aguardando sua aprovação ({queue.length})</h2>
          {!queue.length && <div className="small muted">Nada pendente. Ative o robô num lead (botão "Ativar robô") para preparar a 1ª mensagem.</div>}
          {queue.map(({ lead, msg }) => (
            <div key={msg.id} className="panel panel-pad stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{lead.name}</b><span className="tiny muted">{STAGE_LABEL[msg.stage ?? 'abertura']}{msg.note ? ` · ${msg.note}` : ''}</span>
              </div>
              <MessageEditor lead={lead} msg={msg} />
            </div>
          ))}
        </div>

        {reunioes.length > 0 && (
          <div className="panel panel-pad stack">
            <h2>Reuniões para preparar ({reunioes.length})</h2>
            <span className="small muted">O lead topou uma conversa. Deixe o site pronto para mostrar na reunião (não precisa publicar antes).</span>
            {reunioes.map((l) => (
              <div key={l.id} className="row" style={{ justifyContent: 'space-between' }}>
                <div><b>{l.name}</b><div className="tiny muted">Quer conversar · combine o horário no WhatsApp</div></div>
                <div className="row">
                  <a className="btn btn-sm btn-accent" href={`#/leads/lead/${encodeURIComponent(l.id)}/site`}><Icon name="sparkle" /> Preparar o site</a>
                  <button className="btn btn-sm btn-ghost" onClick={() => clearRobotTask(l.id)}>Pronto</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {previews.length > 0 && (
          <div className="panel panel-pad stack">
            <h2>Prévias para gerar ({previews.length})</h2>
            <span className="small muted">O site só é publicado quando o lead quer ver. Gere e publique a prévia; depois o link aparece aqui para você aprovar o envio.</span>
            {!isPublicHost && <Notice kind="warn">Este app está rodando no seu computador: o link da prévia só abriria aí. Publique o app (wrangler login) para o lead conseguir abrir.</Notice>}
            {previews.map((l) => (
              <div key={l.id} className="row" style={{ justifyContent: 'space-between' }}>
                <div><b>{l.name}</b><div className="tiny muted">Quis ver o site{l.siteDraft?.previewUrl ? ' · prévia já publicada' : ''}</div></div>
                <a className="btn btn-sm btn-accent" href={`#/leads/lead/${encodeURIComponent(l.id)}/site`}><Icon name="sparkle" /> Gerar prévia</a>
              </div>
            ))}
          </div>
        )}

        <div className="panel panel-pad stack">
          <h2>Conversas ativas ({active.length}){replied.length ? ` · ${replied.length} responderam` : ''}</h2>
          {!active.length && <div className="small muted">Nenhum robô ativo.</div>}
          {active.map((l) => (
            <div key={l.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
              <div><b>{l.name}</b><div className="tiny muted">{STAGE_LABEL[l.robot!.stage]} · {l.robot!.messages.filter((m) => m.state === 'enviada').length} enviada(s)</div></div>
              <button className="btn btn-sm" onClick={() => setOpenId(l.id)}>Abrir</button>
            </div>
          ))}
        </div>

        <div className="panel panel-pad stack">
          <h2>Minha proposta (o que o robô pode dizer)</h2>
          <span className="small muted">O robô entende as respostas por regras do próprio app (sem IA, sem custo) e só fala de oferta, preço e agenda o que você escrever aqui. Campo vazio = ele passa a conversa para você.</span>
          <label className="field"><span>O que o site inclui</span><textarea className="textarea" rows={2} maxLength={400} defaultValue={robot.offerText} onBlur={(e) => set({ offerText: e.target.value.trim() })} placeholder="Ex.: Site de uma página com a identidade da sua empresa, botão de WhatsApp, mapa e SEO local, pronto para publicar." /></label>
          <label className="field"><span>Preço (ou faixa)</span><textarea className="textarea" rows={2} maxLength={300} defaultValue={robot.priceText} onBlur={(e) => set({ priceText: e.target.value.trim() })} placeholder="Ex.: O site sai por R$ ___ (ou: a partir de R$ ___), com 1 ajuste incluído." /></label>
          <label className="field"><span>Como marcar uma conversa</span><textarea className="textarea" rows={2} maxLength={300} defaultValue={robot.meetingText} onBlur={(e) => set({ meetingText: e.target.value.trim() })} placeholder="Ex.: Posso te ligar amanhã às 10h ou 15h, qual prefere? (ou o link da sua agenda)" /></label>
        </div>

        <div className="panel panel-pad stack">
          <h2>Limites e modo</h2>
          <div className="grid-2">
            <label className="field"><span>Modo padrão</span>
              <select className="input" value={robot.mode} onChange={(e) => set({ mode: e.target.value as 'approve' | 'auto' })}>
                <option value="approve">Aprovar cada mensagem (recomendado)</option>
                <option value="auto">Automático dentro dos limites</option>
              </select>
            </label>
            <label className="field"><span>Máx. de mensagens enviadas por dia</span><input className="input" inputMode="numeric" defaultValue={robot.dailyLimit} onBlur={(e) => set({ dailyLimit: num(e.target.value, 1, 100, 15) })} /></label>
            <label className="field"><span>Enviar a partir das (h)</span><input className="input" inputMode="numeric" defaultValue={robot.startHour} onBlur={(e) => set({ startHour: num(e.target.value, 0, 23, 9) })} /></label>
            <label className="field"><span>Enviar até as (h)</span><input className="input" inputMode="numeric" defaultValue={robot.endHour} onBlur={(e) => set({ endHour: num(e.target.value, 1, 24, 18) })} /></label>
            <label className="field"><span>Intervalo mínimo entre envios (segundos)</span><input className="input" inputMode="numeric" defaultValue={robot.minGapSec} onBlur={(e) => set({ minGapSec: num(e.target.value, 30, 3600, 90) })} /></label>
            <label className="field"><span>Endereço do serviço do robô</span><input className="input" defaultValue={robot.serviceUrl} onBlur={(e) => set({ serviceUrl: e.target.value.trim() || 'http://127.0.0.1:8791' })} /></label>
          </div>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={robot.weekdaysOnly} onChange={(e) => set({ weekdaysOnly: e.target.checked })} /> Só em dias úteis</label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={robot.dryRun} onChange={(e) => set({ dryRun: e.target.checked })} /> <b>Modo teste</b>: escreve a mensagem no WhatsApp Web mas NÃO envia (desligue só quando quiser enviar de verdade)</label>
          {!robot.dryRun && <Notice kind="warn">Envio real ligado. O serviço também precisa estar em <span className="mono">npm run robo:real</span>. Cada mensagem continua exigindo sua aprovação (modo "aprovar cada mensagem"). O WhatsApp pode bloquear números que automatizam o WhatsApp Web: use um número dedicado e poucas mensagens.</Notice>}
          <div className="tiny muted">Agente de vendas: configurado no serviço (arquivo <span className="mono">.robo.env</span>) — {status ? (status.agente ? 'conectado.' : 'não conectado (usa a estratégia padrão).') : 'serviço desligado.'}</div>
        </div>

        <div className="panel panel-pad stack">
          <h2>Como instalar (uma vez)</h2>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>No Chrome: <span className="mono">chrome://extensions</span> → ligue <b>Modo do desenvolvedor</b>.</li>
            <li><b>Carregar sem compactação</b> → escolha a pasta <span className="mono">prospecta/robo/extensao</span>.</li>
            <li>No computador: <span className="mono">npm run robo</span> (deixe aberto).</li>
            <li>Abra <span className="mono">web.whatsapp.com</span> numa aba (a do robô) e deixe aberta.</li>
          </ol>
        </div>
      </div>
      {openId && <RobotDialog leadId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
