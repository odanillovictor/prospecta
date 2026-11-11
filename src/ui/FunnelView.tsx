import { newId } from '../core/dedupe';
import { useMemo, useState } from 'react';
import { OUTCOME_LABEL, PIPELINE_STATUSES, STATUS_LABEL, type BoardLabel, type FunnelStatus, type Lead, type Outcome } from '../core/types';
import { normText } from '../core/normalize';
import { store, useSettings } from '../data/store';
import { Icon, Modal, ScoreBadge, daysSince, fmtDate, fmtDateTime, useToast, type ScoredLead } from './common';

type Pipeline = (typeof PIPELINE_STATUSES)[number];

const LABEL_COLORS = ['#ff4d1a', '#d99a00', '#1d7f53', '#2c5d8f', '#7b4fb3', '#c2331a', '#0f8b8d', '#7b8794'];

export function LabelChip({ label, small }: { label: BoardLabel; small?: boolean }) {
  return (
    <span className="lbl" style={{ background: label.color, fontSize: small ? 11 : 12 }} title={label.name}>
      {label.name}
    </span>
  );
}

export function FunnelView({ scored, onOpen }: { scored: ScoredLead[]; onOpen: (id: string) => void }) {
  const toast = useToast();
  const { labels } = useSettings();
  const [q, setQ] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Pipeline | null>(null);

  const inBoard = useMemo(() => scored.filter((s) => (PIPELINE_STATUSES as readonly string[]).includes(s.lead.status)), [scored]);
  const visible = useMemo(() => {
    const nq = normText(q);
    return inBoard.filter(({ lead }) =>
      (!nq || normText(`${lead.name} ${lead.niche} ${lead.description ?? ''}`).includes(nq)) && (!labelFilter || (lead.labels ?? []).includes(labelFilter)),
    );
  }, [inBoard, q, labelFilter]);

  const col = (s: Pipeline) =>
    visible.filter((x) => x.lead.status === s).sort((a, b) => (b.lead.updatedAt ?? '').localeCompare(a.lead.updatedAt ?? ''));
  const count = (s: FunnelStatus) => inBoard.filter((x) => x.lead.status === s).length;
  const won = inBoard.filter((x) => x.lead.status === 'finalizado' && x.lead.outcome === 'ganho').length;
  const contacted = inBoard.filter((x) => x.lead.status !== 'prospectado').length;
  const replied = inBoard.filter((x) => x.lead.status !== 'contatado' && x.lead.status !== 'prospectado').length;

  function move(id: string, to: Pipeline) {
    const lead = scored.find((s) => s.lead.id === id)?.lead;
    if (!lead || lead.status === to) return;
    store.updateLead(id, { status: to, outcome: to === 'finalizado' ? lead.outcome : undefined });
    toast(`${lead.name} → ${STATUS_LABEL[to]}`);
    if (to === 'finalizado' && !lead.outcome) setOpenId(id); // pede o resultado
  }

  const openLead = openId ? scored.find((s) => s.lead.id === openId)?.lead : undefined;

  return (
    <>
      <div className="page-head">
        <div><div className="kicker">Funil</div><h1>Conversas em andamento</h1></div>
        <span className="small muted" style={{ maxWidth: 380 }}>Entram aqui os leads salvos com "Salvar no funil" (Prospectado) e os com contato iniciado (ao abrir o WhatsApp). Arraste os cards entre as etapas.</span>
      </div>

      <div className="kpis">
        <div className="panel kpi"><div className="kpi-label">Em contato</div><div className="kpi-value mono">{contacted}</div></div>
        <div className="panel kpi"><div className="kpi-label">Responderam</div><div className="kpi-value mono">{contacted ? Math.round((replied / contacted) * 100) : 0}%</div></div>
        <div className="panel kpi"><div className="kpi-label">Reuniões marcadas</div><div className="kpi-value mono">{count('reuniao')}</div></div>
        <div className="panel kpi kpi-hot"><div className="kpi-label">Fechados</div><div className="kpi-value mono">{won}</div></div>
      </div>

      {!inBoard.length ? (
        <div className="panel empty">
          <h3>Nenhuma conversa ainda</h3>
          <p>Na busca, marque as empresas e clique em "Salvar no funil" (coluna Prospectado). Ao abrir o WhatsApp, o card passa para "Contato iniciado".</p>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input" style={{ maxWidth: 280 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar card…" aria-label="Buscar card" />
            <div className="row" style={{ gap: 6 }}>
              <button className={`lbl-filter${!labelFilter ? ' on' : ''}`} onClick={() => setLabelFilter('')}>Todas</button>
              {labels.map((l) => (
                <button key={l.id} className={`lbl-filter${labelFilter === l.id ? ' on' : ''}`} onClick={() => setLabelFilter(labelFilter === l.id ? '' : l.id)}>
                  <i style={{ background: l.color }} />{l.name}
                </button>
              ))}
            </div>
          </div>
          <div className="board" aria-label="Quadro do funil">
            {PIPELINE_STATUSES.map((s) => (
              <div
                key={s}
                className={`col${over === s ? ' col-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }}
                onDragLeave={() => setOver((o) => (o === s ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain') || dragId; if (id) move(id, s); setDragId(null); }}
              >
                <div className="col-head"><span>{STATUS_LABEL[s]}</span><span className="mono muted">{col(s).length}</span></div>
                {col(s).map(({ lead, score }) => (
                  <div
                    key={lead.id}
                    className={`tcard${dragId === lead.id ? ' dragging' : ''}`}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', lead.id); e.dataTransfer.effectAllowed = 'move'; setDragId(lead.id); }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    onClick={() => setOpenId(lead.id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenId(lead.id)}
                  >
                    {(lead.labels ?? []).length > 0 && (
                      <div className="tcard-labels">{(lead.labels ?? []).map((id) => labels.find((l) => l.id === id)).filter(Boolean).map((l) => <LabelChip key={l!.id} label={l!} small />)}</div>
                    )}
                    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <b className="small" style={{ minWidth: 0 }}>{lead.name}</b>
                      <ScoreBadge score={score} compact />
                    </div>
                    {lead.status === 'finalizado' && lead.outcome && <span className={`chip ${lead.outcome === 'ganho' ? 'chip-ok' : 'chip-cold'}`} style={{ alignSelf: 'flex-start' }}>{OUTCOME_LABEL[lead.outcome]}</span>}
                    {lead.nextAction && <span className="tiny muted">→ {lead.nextAction}{lead.nextActionAt ? ` · ${fmtDate(lead.nextActionAt)}` : ''}</span>}
                    <div className="tcard-meta tiny muted">
                      <span>{lead.niche}</span>
                      {lead.lastContactAt && <span>contato há {daysSince(lead.lastContactAt) ?? 0}d</span>}
                      {(lead.comments?.length ?? 0) > 0 && <span title="Comentários">{lead.comments!.length} coment.</span>}
                      {lead.description && <span title="Tem descrição">descrição</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {openLead && <CardModal lead={openLead} onClose={() => setOpenId(null)} onOpenFull={() => { setOpenId(null); onOpen(openLead.id); }} />}
    </>
  );
}

function CardModal({ lead, onClose, onOpenFull }: { lead: Lead; onClose: () => void; onOpenFull: () => void }) {
  const toast = useToast();
  const settings = useSettings();
  const [desc, setDesc] = useState(lead.description ?? '');
  const [comment, setComment] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
  const active = new Set(lead.labels ?? []);

  const toggleLabel = (id: string) =>
    store.updateLead(lead.id, (l) => {
      const cur = new Set(l.labels ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { labels: [...cur] };
    });

  function createLabel() {
    const name = newLabel.trim().slice(0, 30);
    if (!name) return;
    const id = `${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
    store.setSettings({ labels: [...settings.labels, { id, name, color: newColor }] });
    store.updateLead(lead.id, (l) => ({ labels: [...(l.labels ?? []), id] }));
    setNewLabel('');
  }

  function addComment() {
    const text = comment.trim().slice(0, 2000);
    if (!text) return;
    store.updateLead(lead.id, (l) => ({ comments: [...(l.comments ?? []), { id: newId(), at: new Date().toISOString(), text }] }));
    setComment('');
  }

  const setStatus = (s: FunnelStatus) => {
    store.updateLead(lead.id, { status: s, outcome: s === 'finalizado' ? lead.outcome : undefined });
    if (s === 'pesquisado') {
      toast('Removido do quadro (continua em Oportunidades).');
      onClose();
    }
  };

  return (
    <Modal title={lead.name} onClose={onClose} wide footer={<><button className="btn btn-ghost" onClick={onOpenFull}><Icon name="ext" /> Abrir ficha completa</button><button className="btn btn-primary" onClick={onClose}>Fechar</button></>}>
      <div className="small muted" style={{ marginTop: -6 }}>{lead.niche}{lead.city ? ` · ${lead.city}` : ''}{lead.lastContactAt ? ` · último contato ${fmtDateTime(lead.lastContactAt)}` : ''}</div>

      <div className="field"><span>Etapa</span>
        <div className="row" style={{ gap: 6 }}>
          {PIPELINE_STATUSES.map((s) => (
            <button key={s} className={`btn btn-sm ${lead.status === s ? 'btn-primary' : ''}`} aria-pressed={lead.status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
        {lead.status === 'finalizado' && (
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <span className="small muted">Resultado:</span>
            {(['ganho', 'perdido'] as Outcome[]).map((o) => (
              <button key={o} className={`btn btn-sm ${lead.outcome === o ? 'btn-primary' : ''}`} aria-pressed={lead.outcome === o} onClick={() => store.updateLead(lead.id, { outcome: o })}>{OUTCOME_LABEL[o]}</button>
            ))}
          </div>
        )}
      </div>

      <div className="field"><span>Etiquetas</span>
        <div className="row" style={{ gap: 6 }}>
          {settings.labels.map((l) => (
            <button key={l.id} className={`lbl-toggle${active.has(l.id) ? ' on' : ''}`} style={{ ['--c' as string]: l.color }} onClick={() => toggleLabel(l.id)} aria-pressed={active.has(l.id)}>{l.name}</button>
          ))}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <input className="input" style={{ maxWidth: 200, minHeight: 34 }} value={newLabel} maxLength={30} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createLabel()} placeholder="Nova etiqueta" />
          {LABEL_COLORS.map((c) => <button key={c} className={`swatch${newColor === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setNewColor(c)} aria-label={`Cor ${c}`} />)}
          <button className="btn btn-sm" onClick={createLabel} disabled={!newLabel.trim()}><Icon name="plus" /> Criar</button>
        </div>
      </div>

      <label className="field"><span>Descrição</span>
        <textarea className="textarea" value={desc} maxLength={4000} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (lead.description ?? '') && store.updateLead(lead.id, { description: desc })} placeholder="Contexto da conversa, quem decide, o que foi combinado…" />
      </label>

      <div className="field"><span>Comentários</span>
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <textarea className="textarea" style={{ minHeight: 60 }} value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && addComment()} placeholder="Escreva um comentário (Ctrl+Enter para salvar)" />
          <button className="btn btn-primary" onClick={addComment} disabled={!comment.trim()}>Salvar</button>
        </div>
        <div className="stack" style={{ gap: 8, marginTop: 4 }}>
          {[...(lead.comments ?? [])].reverse().map((c) => (
            <div key={c.id} className="comment">
              <div className="tiny muted row" style={{ justifyContent: 'space-between' }}>
                <span>{fmtDateTime(c.at)}</span>
                <button className="link-btn" onClick={() => store.updateLead(lead.id, (l) => ({ comments: (l.comments ?? []).filter((x) => x.id !== c.id) }))}>excluir</button>
              </div>
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{c.text}</div>
            </div>
          ))}
          {!(lead.comments?.length) && <span className="tiny muted">Nenhum comentário.</span>}
        </div>
      </div>

      <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setStatus('pesquisado')}>Tirar do quadro</button>
    </Modal>
  );
}
