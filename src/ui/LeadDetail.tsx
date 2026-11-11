import { useEffect, useMemo, useState } from 'react';
import type { CheckOrigin, ContactLogEntry, DiagnosisCheck, Lead, ScoreResult, SignalId } from '../core/types';
import { BEFORE_CONTACT, FUNNEL_STATUSES, OUTCOME_LABEL, PROVIDER_LABEL, STATUS_LABEL, type Outcome } from '../core/types';
import { confidenceLabel, hasOwnSite, scoreLead } from '../core/scoring';
import { buildPitch } from '../core/pitch';
import { buildWhatsAppLink } from '../core/whatsapp';
import { buildBriefing, briefingToMarkdown } from '../core/briefing';
import { domainOf, formatPhone } from '../core/normalize';
import { store, useLeads, useSettings } from '../data/store';
import { api, ApiError } from '../data/api';
import { Icon, Modal, Notice, OriginTag, ScoreBadge, StatusChip, copyText, downloadFile, fmtDateTime, slug, useToast } from './common';
import { runDiagnosis } from './actions';
import { SiteBuilder } from './SiteBuilder';
import { RobotButton, RobotDialog } from './RobotUI';
import { useIntegrations } from './App';

const TABS = [
  ['resumo', 'Resumo'],
  ['score', 'Score'],
  ['diagnostico', 'Diagnóstico'],
  ['abordagem', 'Abordagem'],
  ['funil', 'Funil'],
  ['site', 'Criar site'],
] as const;
type Tab = (typeof TABS)[number][0];

export function LeadDetail({ leadId, initialTab, onClose }: { leadId: string; initialTab?: string; onClose: () => void }) {
  const leads = useLeads();
  const { scoring } = useSettings();
  const lead = leads.find((l) => l.id === leadId);
  const validTab = (t?: string): t is Tab => TABS.some((x) => x[0] === t);
  const [tab, setTabState] = useState<Tab>(validTab(initialTab) ? initialTab : 'resumo');
  useEffect(() => {
    if (validTab(initialTab)) setTabState(initialTab);
  }, [initialTab]);
  // Mantém a aba no endereço (link compartilhável/voltar), sem disparar nova navegação.
  const setTab = (t: Tab) => {
    setTabState(t);
    const base = window.location.hash.replace(/(\/lead\/[^/]+).*$/, '$1');
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${base}/${t}`);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal, .builder') && onClose();
    window.addEventListener('keydown', on);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', on);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const score = useMemo(() => (lead ? scoreLead(lead, scoring) : null), [lead, scoring]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={lead?.name ?? 'Lead'}>
        {!lead || !score ? (
          <div className="drawer-body">
            <Notice kind="warn">Lead não encontrado (pode ter sido removido).</Notice>
            <button className="btn" onClick={onClose}>Fechar</button>
          </div>
        ) : (
          <>
            <div className="drawer-head">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="kicker" style={{ color: '#a9a59c' }}>{lead.niche}{lead.city ? ` · ${lead.city}` : ''}</div>
                  <h2>{lead.name}</h2>
                  <div className="row" style={{ marginTop: 8 }}>
                    <ScoreBadge score={score} />
                    <StatusChip status={lead.status} />
                    {lead.isDemo && <span className="chip chip-demo">demonstração</span>}
                    {!hasOwnSite(lead) && <span className="chip chip-hot">sem site</span>}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={onClose} aria-label="Fechar" style={{ background: 'transparent', color: '#fff', borderColor: '#3a3f48' }}><Icon name="x" /></button>
              </div>
              <div className="tabs" role="tablist">
                {TABS.map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="drawer-body">
              {tab === 'resumo' && <Summary lead={lead} score={score} goTab={setTab} onDeleted={onClose} />}
              {tab === 'score' && <ScoreTab lead={lead} score={score} />}
              {tab === 'diagnostico' && <DiagnosisTab lead={lead} />}
              {tab === 'abordagem' && <PitchTab lead={lead} score={score} />}
              {tab === 'funil' && <FunnelTab lead={lead} />}
              {tab === 'site' && <SiteTab lead={lead} score={score} />}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

// ---------------- Resumo ----------------
function Summary({ lead, score, goTab, onDeleted }: { lead: Lead; score: ScoreResult; goTab: (t: Tab) => void; onDeleted: () => void }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [robotOpen, setRobotOpen] = useState(false);
  const top = score.signals.filter((s) => s.points > 0).sort((a, b) => b.points - a.points).slice(0, 4);
  return (
    <>
      <div className="row">
        <button className="btn btn-wa" onClick={() => goTab('abordagem')} disabled={!lead.phone && !lead.whatsapp}><Icon name="wa" /> WhatsApp</button>
        {lead.phone && <a className="btn" href={`tel:+${lead.phone}`}><Icon name="phone" /> Ligar</a>}
        {hasOwnSite(lead) && <a className="btn" href={lead.website} target="_blank" rel="noopener noreferrer"><Icon name="ext" /> Abrir site</a>}
        <button className="btn btn-accent" onClick={() => goTab('site')}><Icon name="sparkle" /> Construir o site</button>
        <RobotButton lead={lead} onOpen={() => setRobotOpen(true)} />
      </div>
      {robotOpen && <RobotDialog leadId={lead.id} onClose={() => setRobotOpen(false)} />}

      <div className="panel panel-pad">
        <dl className="facts" style={{ margin: 0 }}>
          <div><dt>Segmento</dt><dd>{lead.niche}{lead.category && lead.category !== lead.niche ? ` (${lead.category})` : ''}</dd></div>
          <div><dt>Local</dt><dd>{[lead.neighborhood, lead.city, lead.state].filter(Boolean).join(', ') || '—'}</dd></div>
          <div><dt>Endereço</dt><dd>{lead.address || '—'}</dd></div>
          <div><dt>Telefone</dt><dd className="mono">{lead.phone ? formatPhone(lead.phone) : lead.phoneRaw ? `${lead.phoneRaw} (não normalizado)` : '—'}</dd></div>
          <div><dt>WhatsApp</dt><dd>{lead.whatsapp ? <span className="mono">{formatPhone(lead.whatsapp)} <span className="chip chip-ok">declarado pela fonte</span></span> : lead.phone ? <span className="muted">não confirmado — usar telefone com cautela</span> : '—'}</dd></div>
          <div><dt>Site</dt><dd>{lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer">{domainOf(lead.website)}</a> : '—'}{lead.website && !hasOwnSite(lead) && <span className="tiny muted"> (rede social/agregador)</span>}</dd></div>
          <div><dt>Avaliações</dt><dd>{lead.reviewCount != null ? `★ ${lead.rating ?? '—'} · ${lead.reviewCount} avaliações` : <span className="muted">não informado pela fonte</span>}</dd></div>
          <div><dt>Confiança da análise</dt><dd>{confidenceLabel(score.confidence)} ({Math.round(score.confidence * 100)}% dos sinais conhecidos)</dd></div>
        </dl>
      </div>

      <div className="panel panel-pad stack">
        <div className="row" style={{ justifyContent: 'space-between' }}><h3>Por que este score</h3><button className="btn btn-sm btn-ghost" onClick={() => goTab('score')}>Ver detalhes</button></div>
        {top.length ? top.map((s) => (
          <div key={s.id} className="row" style={{ flexWrap: 'nowrap' }}><span className="mono" style={{ width: 36, fontWeight: 700 }}>+{s.points}</span><span style={{ flex: 1 }}>{s.label}</span><OriginTag origin={s.origin} /></div>
        )) : <span className="muted small">Nenhum sinal positivo ainda.</span>}
      </div>

      <div className="panel panel-pad stack">
        <h3>Origem dos dados</h3>
        {lead.sources.map((s, i) => (
          <div key={i} className="small row">
            <span className="chip">{PROVIDER_LABEL[s.provider]}</span>
            <span className="muted">coletado {fmtDateTime(s.collectedAt)}</span>
            {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer">ver na origem</a>}
          </div>
        ))}
        <span className="tiny muted">Dados automáticos podem estar desatualizados. Confirme telefone e existência de site antes de abordar.</span>
      </div>

      <div><button className="btn btn-sm btn-ghost" style={{ color: 'var(--bad)' }} onClick={() => setConfirmDel(true)}><Icon name="trash" /> Excluir lead</button></div>
      {confirmDel && (
        <Modal title="Excluir lead?" onClose={() => setConfirmDel(false)} footer={<><button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Cancelar</button><button className="btn btn-primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={() => { store.removeLeads([lead.id]); onDeleted(); }}>Excluir</button></>}>
          <p style={{ margin: 0 }}>"{lead.name}" e todo o histórico serão removidos deste navegador. Exporte um backup em Ajustes se quiser guardar.</p>
        </Modal>
      )}
    </>
  );
}

// ---------------- Score ----------------
const NO_TOGGLE: SignalId[] = ['segmento_aderente', 'local_prioritario'];

function ScoreTab({ lead, score }: { lead: Lead; score: ScoreResult }) {
  function setManual(id: SignalId, v: boolean | undefined) {
    store.updateLead(lead.id, (l) => {
      const m = { ...l.manualSignals };
      if (v === undefined) delete m[id];
      else m[id] = v;
      return { manualSignals: m };
    });
  }
  const groups: Array<[string, typeof score.signals]> = [
    ['Somam pontos', score.signals.filter((s) => s.points > 0)],
    ['Desconhecidos (reduzem a confiança)', score.signals.filter((s) => s.state === 'desconhecido')],
    ['Não se aplicam / não', score.signals.filter((s) => s.points === 0 && s.state !== 'desconhecido')],
  ];
  return (
    <>
      <div className="panel panel-pad stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <ScoreBadge score={score} />
          <span className="small muted">Pesos editáveis em Ajustes.</span>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Confiança: {Math.round(score.confidence * 100)}%</div>
          <div className="meter"><i style={{ width: `${Math.round(score.confidence * 100)}%` }} /></div>
        </div>
        <span className="small muted">O score soma os pesos dos sinais presentes (máx. 100). Ele indica <b>prioridade de abordagem</b>, não chance de fechar negócio. Marque "Sim/Não" para validar manualmente qualquer sinal.</span>
      </div>
      {groups.map(([title, list]) => list.length > 0 && (
        <div key={title} className="panel panel-pad">
          <h3 style={{ marginBottom: 6 }}>{title}</h3>
          {list.map((s) => {
            const manual = lead.manualSignals[s.id];
            return (
              <div key={s.id} className="signal">
                <div className="row" style={{ gap: 8 }}><b style={{ fontSize: 14 }}>{s.label}</b><OriginTag origin={s.origin} /></div>
                <div className="signal-pts" style={{ color: s.points ? 'var(--accent-ink)' : 'var(--muted)' }}>{s.points ? `+${s.points}` : s.weight ? `0/${s.weight}` : '—'}</div>
                <div className="signal-why">{s.why}</div>
                {!NO_TOGGLE.includes(s.id) && (
                  <div className="signal-ctrl">
                    <div className="seg" role="group" aria-label={`Validar ${s.label}`}>
                      {s.id !== 'urgencia_manual' && <button aria-pressed={manual === undefined} onClick={() => setManual(s.id, undefined)}>Auto</button>}
                      <button aria-pressed={manual === true} onClick={() => setManual(s.id, true)}>Sim</button>
                      <button aria-pressed={manual === false || (s.id === 'urgencia_manual' && manual === undefined)} onClick={() => setManual(s.id, s.id === 'urgencia_manual' ? undefined : false)}>Não</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ---------------- Diagnóstico ----------------
const ORIGIN_TITLE: Record<CheckOrigin, string> = {
  automatico: 'Verificações automatizadas',
  inferido: 'Inferências de baixa confiança',
  manual: 'Exigem validação manual',
};
const RESULT_ICON: Record<DiagnosisCheck['result'], string> = { ok: '✓', problema: '!', atencao: '~', nao_verificado: '?' };

function DiagnosisTab({ lead }: { lead: Lead }) {
  const toast = useToast();
  const { error: apiError } = useIntegrations();
  const [running, setRunning] = useState(false);
  const own = hasOwnSite(lead);
  const d = lead.diagnosis;

  async function run() {
    setRunning(true);
    const r = await runDiagnosis(lead);
    setRunning(false);
    toast(r.message, !r.ok);
  }

  if (!own) {
    return (
      <Notice kind="info">
        {lead.website ? <>O único link conhecido é <b>{domainOf(lead.website)}</b> (rede social/agregador), que não é avaliado como site.</> : 'Nenhuma fonte informou site para esta empresa.'}{' '}
        Antes de abordar, pesquise o nome no Google para confirmar. Se não houver site, a oportunidade é de <b>criação</b>.
      </Notice>
    );
  }

  return (
    <>
      <div className="panel panel-pad row" style={{ justifyContent: 'space-between' }}>
        <div className="small">
          <b>{domainOf(lead.website)}</b><br />
          <span className="muted">{d ? `Último diagnóstico: ${fmtDateTime(d.ranAt)}` : 'Ainda não diagnosticado.'}</span>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={running || lead.isDemo || !!apiError} title={lead.isDemo ? 'Demonstração: site fictício' : apiError ?? ''}>
          {running ? <span className="spinner" /> : <Icon name="bolt" />} {d ? 'Rodar novamente' : 'Diagnosticar site'}
        </button>
      </div>
      {lead.isDemo && d && <Notice kind="demo">Diagnóstico de demonstração com dados fictícios — serve apenas para conhecer a tela.</Notice>}
      {running && <Notice kind="info">Acessando o site a partir da Cloudflare… (até ~15 s{' '}— ou mais com PageSpeed configurado)</Notice>}
      {d && !d.ok && <Notice kind="error">Diagnóstico não concluído: {d.error} Nenhuma verificação foi registrada.</Notice>}
      {d?.ok && d.facts && (
        <>
          <div className="panel panel-pad small">
            <dl className="facts" style={{ margin: 0 }}>
              <div><dt>URL final</dt><dd>{d.facts.finalUrl}</dd></div>
              <div><dt>HTTP</dt><dd className="mono">{d.facts.httpStatus} · {d.facts.responseMs} ms · {(d.facts.htmlBytes / 1024).toFixed(0)} KB{d.facts.truncated ? ' (truncado)' : ''}</dd></div>
              {d.facts.pagespeed && <div><dt>PageSpeed mobile</dt><dd className="mono">{d.facts.pagespeed.performance}/100</dd></div>}
              {d.facts.pagespeed === null && <div><dt>PageSpeed</dt><dd className="muted">falhou nesta execução</dd></div>}
            </dl>
          </div>
          {(['automatico', 'inferido', 'manual'] as CheckOrigin[]).map((o) => {
            const items = d.checks.filter((c) => c.origin === o);
            if (!items.length) return null;
            return (
              <div key={o} className="panel panel-pad">
                <div className="row" style={{ marginBottom: 4 }}><h3>{ORIGIN_TITLE[o]}</h3><OriginTag origin={o} /></div>
                {items.map((c) => (
                  <div key={c.id} className="check-item">
                    <span className={`check-ico ico-${c.result}`} aria-label={c.result}>{RESULT_ICON[c.result]}</span>
                    <div><b style={{ fontSize: 14 }}>{c.label}</b><div className="small muted">{c.detail}</div></div>
                    {c.result !== 'ok' && c.result !== 'nao_verificado' && <span className="tiny mono muted">P{c.priority}</span>}
                  </div>
                ))}
              </div>
            );
          })}
          <span className="tiny muted">A análise usa apenas o HTML inicial. Conteúdo carregado por JavaScript pode não aparecer. Itens "inferidos" são heurísticas — confirme antes de citar ao cliente.</span>
        </>
      )}
    </>
  );
}

// ---------------- Abordagem ----------------
function PitchTab({ lead, score }: { lead: Lead; score: ScoreResult }) {
  const { seller } = useSettings();
  const toast = useToast();
  const pitch = useMemo(() => buildPitch(lead, score, seller), [lead, score, seller]);
  const [msg, setMsg] = useState(pitch.whatsappMessage);
  const [confirm, setConfirm] = useState(false);
  const wa = buildWhatsAppLink(lead, msg);

  useEffect(() => setMsg(pitch.whatsappMessage), [pitch.whatsappMessage]);

  function logContact() {
    const now = new Date().toISOString();
    store.updateLead(lead.id, (l) => ({
      lastContactAt: now,
      status: BEFORE_CONTACT.includes(l.status) ? 'contatado' : l.status,
      contactLog: [...l.contactLog, { at: now, channel: 'whatsapp', note: 'WhatsApp aberto pela ferramenta (mensagem de abertura)' }],
    }));
    toast('Contato iniciado — o lead entrou no Funil.');
  }

  return (
    <>
      {!seller.name && <Notice kind="warn">Defina seu nome em Ajustes para personalizar as mensagens.</Notice>}
      <div className="panel panel-pad stack">
        <div className="kicker">{pitch.headline}</div>
        <h3>Argumento principal</h3>
        <p style={{ margin: 0 }}>{pitch.mainArgument}</p>
        {pitch.basedOn.length > 0 && <span className="tiny muted">Baseado em: {pitch.basedOn.join(' · ')}</span>}
      </div>

      <div className="panel panel-pad stack">
        <div className="row" style={{ justifyContent: 'space-between' }}><h3>Mensagem para WhatsApp</h3><button className="btn btn-sm btn-ghost" onClick={() => setMsg(pitch.whatsappMessage)}>Restaurar sugestão</button></div>
        <textarea className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} rows={6} maxLength={1500} aria-label="Mensagem" />
        {wa.warning && <Notice kind="warn">{wa.warning}</Notice>}
        {!wa.ok && <Notice kind="error">{wa.error}</Notice>}
        <div className="row">
          <button className="btn btn-wa" disabled={!wa.ok} onClick={() => setConfirm(true)}><Icon name="wa" /> Revisar e abrir WhatsApp</button>
          <button className="btn" onClick={async () => toast((await copyText(msg)) ? 'Mensagem copiada.' : 'Não foi possível copiar.', false)}><Icon name="copy" /> Copiar</button>
        </div>
        <span className="tiny muted">Nada é enviado automaticamente: o WhatsApp abre com o texto preenchido e você decide se envia.</span>
      </div>

      <div className="panel panel-pad stack">
        <h3>Roteiro para ligação / contato manual</h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{pitch.callScript.map((s, i) => <li key={i}>{s}</li>)}</ol>
      </div>

      <div className="panel panel-pad stack">
        <h3>Próxima ação recomendada</h3>
        <div className="row"><span style={{ flex: 1 }}>{pitch.nextAction}</span><button className="btn btn-sm" onClick={() => { store.updateLead(lead.id, { nextAction: pitch.nextAction }); toast('Próxima ação definida.'); }}>Usar no funil</button></div>
        {pitch.secondary.length > 0 && (<><div className="divider" /><span className="small"><b>Oportunidades secundárias</b> <span className="muted">(só depois do site)</span>: {pitch.secondary.join(' · ')}</span></>)}
      </div>

      {confirm && wa.ok && (
        <Modal title="Abrir conversa no WhatsApp" onClose={() => setConfirm(false)} footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancelar</button>
          <a className="btn btn-wa" href={wa.url} target="_blank" rel="noopener noreferrer" onClick={() => { setConfirm(false); logContact(); }}><Icon name="wa" /> Abrir WhatsApp</a>
        </>}>
          <div className="small">Para: <b className="mono">{formatPhone(wa.number)}</b> — {lead.name}</div>
          {wa.warning && <Notice kind="warn">{wa.warning}</Notice>}
          <div className="quote small">{msg}</div>
          <span className="tiny muted">Ao abrir, o lead entra no Funil em "Contato iniciado". O envio da mensagem continua sendo seu, no WhatsApp.</span>
        </Modal>
      )}
    </>
  );
}

// ---------------- Funil ----------------
function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function FunnelTab({ lead }: { lead: Lead }) {
  const toast = useToast();
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [next, setNext] = useState(lead.nextAction ?? '');
  const [channel, setChannel] = useState<ContactLogEntry['channel']>('whatsapp');
  const [note, setNote] = useState('');

  useEffect(() => setNext(lead.nextAction ?? ''), [lead.nextAction]);

  function addContact() {
    const now = new Date().toISOString();
    store.updateLead(lead.id, (l) => ({ lastContactAt: now, contactLog: [...l.contactLog, { at: now, channel, note: note.trim().slice(0, 500) || undefined }] }));
    setNote('');
    toast('Contato registrado.');
  }

  return (
    <>
      <div className="panel panel-pad stack">
        <h3>Etapa do funil</h3>
        <div className="row">
          {FUNNEL_STATUSES.map((s) => (
            <button key={s} className={`btn btn-sm ${lead.status === s ? 'btn-primary' : ''}`} aria-pressed={lead.status === s} onClick={() => { store.updateLead(lead.id, { status: s }); toast(`Status: ${STATUS_LABEL[s]}`); }}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {lead.status === 'finalizado' && (
          <div className="row" style={{ gap: 6 }}>
            <span className="small muted">Resultado:</span>
            {(['ganho', 'perdido'] as Outcome[]).map((o) => (
              <button key={o} className={`btn btn-sm ${lead.outcome === o ? 'btn-primary' : ''}`} aria-pressed={lead.outcome === o} onClick={() => store.updateLead(lead.id, { outcome: o })}>{OUTCOME_LABEL[o]}</button>
            ))}
          </div>
        )}
      </div>

      <div className="panel panel-pad stack">
        <div className="grid-2">
          <label className="field"><span>Próxima ação</span><input className="input" value={next} maxLength={160} onChange={(e) => setNext(e.target.value)} onBlur={() => next !== (lead.nextAction ?? '') && store.updateLead(lead.id, { nextAction: next.trim() || undefined })} placeholder="ex.: enviar rascunho do site" /></label>
          <label className="field"><span>Quando</span><input className="input" type="datetime-local" value={toLocalInput(lead.nextActionAt)} onChange={(e) => store.updateLead(lead.id, { nextActionAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></label>
          <label className="field"><span>Último contato</span><input className="input" type="datetime-local" value={toLocalInput(lead.lastContactAt)} onChange={(e) => store.updateLead(lead.id, { lastContactAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></label>
        </div>
        <label className="field"><span>Observações internas</span><textarea className="textarea" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (lead.notes ?? '') && (store.updateLead(lead.id, { notes }), toast('Observações salvas.'))} placeholder="Quem atendeu, objeções, preço comentado…" /></label>
      </div>

      <div className="panel panel-pad stack">
        <h3>Registrar contato</h3>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 150 }}><span>Canal</span>
            <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as ContactLogEntry['channel'])}>
              <option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option><option value="email">E-mail</option><option value="presencial">Presencial</option><option value="outro">Outro</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 180 }}><span>Resumo</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="ex.: pediu proposta por e-mail" /></label>
          <button className="btn btn-primary" onClick={addContact}>Registrar</button>
        </div>
        {lead.contactLog.length ? (
          <div className="stack" style={{ gap: 6 }}>
            {[...lead.contactLog].reverse().map((c, i) => (
              <div key={i} className="small row" style={{ flexWrap: 'nowrap' }}><span className="mono muted nowrap">{fmtDateTime(c.at)}</span><span className="chip">{c.channel}</span><span>{c.note ?? ''}</span></div>
            ))}
          </div>
        ) : <span className="small muted">Nenhum contato registrado.</span>}
      </div>
    </>
  );
}

// ---------------- Criar site ----------------
function SiteTab({ lead, score }: { lead: Lead; score: ScoreResult }) {
  const { seller } = useSettings();
  const { status: integ } = useIntegrations();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [building, setBuilding] = useState(false);
  const [view, setView] = useState<'md' | 'json'>('md');
  const briefing = useMemo(() => buildBriefing(lead, score, buildPitch(lead, score, seller)), [lead, score, seller]);
  const md = useMemo(() => briefingToMarkdown(briefing), [briefing]);
  const jsonText = useMemo(() => JSON.stringify(briefing, null, 2), [briefing]);
  const vaultReady = !!integ?.vaultSites.configured;
  const own = hasOwnSite(lead);
  const delivered = lead.deliveries.find((d) => d.ok && d.idempotencyKey === briefing.idempotencyKey);

  async function send() {
    setSending(true);
    try {
      const r = await api.sendBriefing(briefing);
      const entry = { at: new Date().toISOString(), idempotencyKey: briefing.idempotencyKey, ok: r.ok, httpStatus: r.status, message: r.message };
      if (!r.pending) store.updateLead(lead.id, (l) => ({ deliveries: [...l.deliveries, entry] }));
      toast(r.message, !r.ok);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Falha ao enviar.', true);
    } finally {
      setSending(false);
    }
  }

  const steps: Array<[string, 'pronto' | 'pendente' | 'indisponivel' | 'parcial', string]> = [
    ['Briefing com dados do lead', 'pronto', 'Gerado localmente a partir dos dados salvos.'],
    ['Diagnóstico do site atual', !own ? 'pronto' : lead.diagnosis?.ok ? 'pronto' : 'pendente', !own ? 'Sem site — briefing de criação.' : lead.diagnosis?.ok ? 'Incluído no briefing.' : 'Rode o diagnóstico para incluí-lo.'],
    ['Segmento, local e contexto comercial', 'pronto', 'Incluídos (score, argumento, observações).'],
    ['Estrutura e prioridades do novo site', 'pronto', 'Sugestão determinística por segmento.'],
    ['Site construído com as melhorias', lead.siteDraft ? 'pronto' : 'pendente', lead.siteDraft ? 'Gerado no construtor (sem IA). Baixe o HTML para apresentar.' : 'Clique em "Construir o site".'],
    ['Iniciar criação no vault-sites', vaultReady ? (delivered ? 'pronto' : 'pendente') : 'indisponivel', vaultReady ? (delivered ? `Entregue em ${fmtDateTime(delivered.at)}.` : 'Integração configurada no servidor.') : 'Pendente de configuração (VAULT_SITES_ENDPOINT/TOKEN).'],
    ['Acompanhar status da criação', 'indisponivel', 'Requer contrato de status do vault-sites (não existe ainda).'],
    ['Publicar no Cloudflare', 'indisponivel', 'Não implementado. Exigirá autorização explícita por projeto.'],
  ];
  const stepChip = { pronto: 'chip-ok', pendente: 'chip-attn', indisponivel: 'chip-cold', parcial: 'chip-warm' } as const;
  const stepLabel = { pronto: 'pronto', pendente: 'pendente', indisponivel: 'pendente de configuração', parcial: 'parcial' } as const;
  const base = `briefing-${slug(lead.name)}`;

  return (
    <>
      {lead.isDemo && <Notice kind="demo">Lead de demonstração: o briefing pode ser visto/baixado, mas não é enviado ao vault-sites.</Notice>}
      <div className="build-cta">
        <div style={{ flex: 1 }}><b>Construir o site</b><p>Gera um site completo para {lead.name}, já resolvendo os problemas encontrados. Sem IA, sem custo, pronto para apresentar.</p></div>
        <button className="btn btn-accent" onClick={() => setBuilding(true)}><Icon name="sparkle" /> Construir o site</button>
      </div>
      {building && <SiteBuilder lead={lead} onClose={() => setBuilding(false)} />}
      <div className="panel panel-pad stack">
        <h3>Fluxo de criação</h3>
        {steps.map(([label, st, why], i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <span className="mono muted" style={{ width: 18 }}>{i + 1}</span>
            <div style={{ flex: 1 }}><b className="small">{label}</b><div className="tiny muted">{why}</div></div>
            <span className={`chip ${stepChip[st]}`}>{stepLabel[st]}</span>
          </div>
        ))}
      </div>

      <div className="panel panel-pad stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Briefing</h3>
          <div className="seg"><button aria-pressed={view === 'md'} onClick={() => setView('md')}>Texto</button><button aria-pressed={view === 'json'} onClick={() => setView('json')}>JSON</button></div>
        </div>
        <pre className="code">{view === 'md' ? md : jsonText}</pre>
        <div className="row">
          <button className="btn" onClick={async () => toast((await copyText(view === 'md' ? md : jsonText)) ? 'Briefing copiado.' : 'Não foi possível copiar.')}><Icon name="copy" /> Copiar</button>
          <button className="btn" onClick={() => downloadFile(`${base}.json`, jsonText)}><Icon name="download" /> JSON</button>
          <button className="btn" onClick={() => downloadFile(`${base}.md`, md, 'text/markdown')}><Icon name="download" /> Markdown</button>
          <button className="btn btn-accent" onClick={send} disabled={!vaultReady || lead.isDemo || sending} title={!vaultReady ? 'Integração com vault-sites pendente de configuração' : ''}>
            {sending ? <span className="spinner" /> : <Icon name="sparkle" />} Enviar ao vault-sites
          </button>
        </div>
        {!vaultReady && <span className="tiny muted">vault-sites: <b>pendente de configuração</b>. Use o JSON/Markdown manualmente com o agente até a integração existir. Contrato proposto em docs/INTEGRACOES.md.</span>}
        <span className="tiny muted mono">chave de idempotência: {briefing.idempotencyKey}</span>
      </div>

      {lead.deliveries.length > 0 && (
        <div className="panel panel-pad stack">
          <h3>Registro de entregas</h3>
          {[...lead.deliveries].reverse().map((d, i) => (
            <div key={i} className="small row"><span className={`chip ${d.ok ? 'chip-ok' : 'chip-bad'}`}>{d.ok ? 'ok' : 'falhou'}</span><span className="mono muted">{fmtDateTime(d.at)}</span><span>{d.message}</span></div>
          ))}
        </div>
      )}
    </>
  );
}
