import { useMemo, useRef, useState } from 'react';
import { FUNNEL_STATUSES, STATUS_LABEL, isClosed, type FunnelStatus, type Temperature } from '../core/types';
import { formatPhone, domainOf, normText } from '../core/normalize';
import { hasOwnSite } from '../core/scoring';
import { buildWhatsAppLink } from '../core/whatsapp';
import { store } from '../data/store';
import { Icon, Notice, ScoreBadge, StatusChip, fmtDate, useToast, type ScoredLead } from './common';
import { runDiagnosis } from './actions';
import { useIntegrations } from './App';

type Sort = 'prioridade' | 'recentes' | 'contato' | 'nome';

export function LeadsView({ scored, onOpen, goSearch }: { scored: ScoredLead[]; onOpen: (id: string) => void; goSearch: () => void }) {
  const toast = useToast();
  const { error: apiError } = useIntegrations();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [niche, setNiche] = useState('');
  const [temp, setTemp] = useState<'' | Temperature>('');
  const [status, setStatus] = useState<'' | FunnelStatus | 'abertos'>('abertos');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<Sort>('prioridade');
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const cancelRef = useRef(false);

  const cities = useMemo(() => [...new Set(scored.map((s) => s.lead.city).filter(Boolean) as string[])].sort(), [scored]);
  const niches = useMemo(() => [...new Set(scored.map((s) => s.lead.niche).filter(Boolean))].sort(), [scored]);

  const list = useMemo(() => {
    const nq = normText(q);
    let r = scored.filter(({ lead, score }) => {
      if (nq && !normText([lead.name, lead.category, lead.address, lead.neighborhood, lead.notes, lead.phone].join(' ')).includes(nq)) return false;
      if (city && lead.city !== city) return false;
      if (niche && lead.niche !== niche) return false;
      if (temp && score.temperature !== temp) return false;
      if (status === 'abertos' && isClosed(lead)) return false;
      if (status && status !== 'abertos' && lead.status !== status) return false;
      if (score.score < minScore) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      if (sort === 'prioridade') return b.score.score - a.score.score || b.score.confidence - a.score.confidence;
      if (sort === 'recentes') return b.lead.createdAt.localeCompare(a.lead.createdAt);
      if (sort === 'contato') return (a.lead.lastContactAt ?? '').localeCompare(b.lead.lastContactAt ?? '');
      return a.lead.name.localeCompare(b.lead.name, 'pt-BR');
    });
    return r;
  }, [scored, q, city, niche, temp, status, minScore, sort]);

  const open = scored.filter((s) => !isClosed(s.lead));
  const hot = open.filter((s) => s.score.temperature === 'quente').length;
  const noSite = open.filter((s) => !hasOwnSite(s.lead)).length;
  const toDiagnose = scored.filter((s) => !s.lead.isDemo && hasOwnSite(s.lead) && !s.lead.diagnosis);
  const demoCount = scored.filter((s) => s.lead.isDemo).length;

  async function diagnoseAll() {
    cancelRef.current = false;
    const targets = toDiagnose.map((s) => s.lead);
    setBulk({ done: 0, total: targets.length });
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break;
      const r = await runDiagnosis(targets[i]);
      if (r.ok) ok++;
      setBulk({ done: i + 1, total: targets.length });
    }
    setBulk(null);
    toast(`${ok} de ${targets.length} site(s) diagnosticado(s).`);
  }

  if (!scored.length) {
    return (
      <>
        <PageHead />
        <div className="panel empty">
          <h3>Nenhum lead ainda</h3>
          <p>Comece buscando empresas por nicho e cidade. Para importar planilhas ou ver a demonstração, use Ajustes → Importar leads.</p>
          <button className="btn btn-primary" onClick={goSearch}><Icon name="search" /> Buscar empresas</button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead />
      {demoCount > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Notice kind="demo">
            {demoCount} lead(s) de <b>demonstração</b> (fictícios, marcados [DEMO]). Eles não são enviados ao vault-sites nem fundidos com dados reais.{' '}
            <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => store.removeLeads(scored.filter((s) => s.lead.isDemo).map((s) => s.lead.id))}>Remover demonstração</button>
          </Notice>
        </div>
      )}

      <div className="kpis">
        <div className="panel kpi"><div className="kpi-label">Leads em aberto</div><div className="kpi-value mono">{open.length}</div></div>
        <div className="panel kpi kpi-hot"><div className="kpi-label">Oportunidades quentes</div><div className="kpi-value mono">{hot}</div></div>
        <div className="panel kpi"><div className="kpi-label">Sem site próprio</div><div className="kpi-value mono">{noSite}</div></div>
        <div className="panel kpi"><div className="kpi-label">Sites a diagnosticar</div><div className="kpi-value mono">{toDiagnose.length}</div></div>
      </div>

      {toDiagnose.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <div className="small"><b>{toDiagnose.length} site(s) ainda sem diagnóstico.</b> <span className="muted">Sem diagnóstico, o score desses leads tem confiança menor.</span></div>
            {bulk ? (
              <div className="row small"><span className="spinner" /> {bulk.done}/{bulk.total}<button className="btn btn-sm" onClick={() => (cancelRef.current = true)}>Parar</button></div>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={diagnoseAll} disabled={!!apiError} title={apiError ?? ''}><Icon name="bolt" /> Diagnosticar todos</button>
            )}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="filters">
          <label className="field"><span>Buscar</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome, bairro, telefone, observação…" /></label>
          <label className="field"><span>Cidade</span><select className="select" value={city} onChange={(e) => setCity(e.target.value)}><option value="">Todas</option>{cities.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span>Nicho</span><select className="select" value={niche} onChange={(e) => setNiche(e.target.value)}><option value="">Todos</option>{niches.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span>Temperatura</span><select className="select" value={temp} onChange={(e) => setTemp(e.target.value as Temperature | '')}><option value="">Todas</option><option value="quente">Quente</option><option value="morno">Morno</option><option value="frio">Frio</option></select></label>
          <label className="field"><span>Status</span><select className="select" value={status} onChange={(e) => setStatus(e.target.value as FunnelStatus | '' | 'abertos')}><option value="abertos">Em aberto</option><option value="">Todos</option>{FUNNEL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
          <label className="field"><span>Ordenar</span><select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="prioridade">Prioridade (score)</option><option value="recentes">Mais recentes</option><option value="contato">Contato mais antigo</option><option value="nome">Nome</option></select></label>
        </div>
        <div className="row small" style={{ padding: '0 14px 12px' }}>
          <span className="muted">Score mínimo</span>
          <input type="range" min={0} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} style={{ accentColor: 'var(--accent)', width: 160 }} aria-label="Score mínimo" />
          <span className="mono">{minScore}</span>
          <span className="muted" style={{ marginLeft: 'auto' }}>{list.length} de {scored.length}</span>
        </div>
      </div>

      {!list.length ? (
        <div className="panel empty"><h3>Nada com esses filtros</h3><p>Ajuste a busca ou os filtros acima.</p></div>
      ) : (
        <>
          <div className="panel table-wrap">
            <table className="leads">
              <thead>
                <tr><th>Score</th><th>Empresa</th><th>Contato</th><th>Site</th><th>Status</th><th>Últ. contato</th><th>Origem</th><th /></tr>
              </thead>
              <tbody>
                {list.map(({ lead, score }) => (
                  <tr key={lead.id} tabIndex={0} onClick={() => onOpen(lead.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(lead.id)}>
                    <td><ScoreBadge score={score} /></td>
                    <td style={{ maxWidth: 280 }}>
                      <div className="lead-name">{lead.name} {lead.isDemo && <span className="chip chip-demo">demo</span>}</div>
                      <div className="lead-sub">{lead.niche} · {[lead.neighborhood, lead.city].filter(Boolean).join(', ') || 'local não informado'}{lead.rating != null && ` · ★ ${lead.rating} (${lead.reviewCount ?? 0})`}</div>
                    </td>
                    <td className="nowrap">{lead.phone ? <span className="mono small">{formatPhone(lead.phone)}</span> : <span className="muted small">—</span>}{lead.whatsapp && <div className="tiny" style={{ color: '#1f9d55', fontWeight: 600 }}>WhatsApp declarado</div>}</td>
                    <td className="small">{hasOwnSite(lead) ? <span>{domainOf(lead.website)}{lead.diagnosis ? (lead.diagnosis.ok ? <div className="tiny muted">diagnosticado</div> : <div className="tiny" style={{ color: 'var(--bad)' }}>falha ao acessar</div>) : <div className="tiny muted">sem diagnóstico</div>}</span> : <span className="chip chip-hot">sem site</span>}</td>
                    <td><StatusChip status={lead.status} />{lead.nextAction && <div className="tiny muted" style={{ marginTop: 4, maxWidth: 160 }}>→ {lead.nextAction}</div>}</td>
                    <td className="small nowrap">{fmtDate(lead.lastContactAt)}</td>
                    <td className="tiny muted">{lead.sources.map((s) => s.provider).join(', ')}{score.signals.some((s) => s.origin === 'manual' && s.state === 'sim') && <div><span className="origin origin-manual">validado</span></div>}</td>
                    <td><RowActions leadId={lead.id} phone={lead.phone} whatsapp={lead.whatsapp} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cards">
            {list.map(({ lead, score }) => (
              <div key={lead.id} className="panel card" onClick={() => onOpen(lead.id)}>
                <div className="card-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="lead-name">{lead.name}</div>
                    <div className="lead-sub">{lead.niche} · {[lead.neighborhood, lead.city].filter(Boolean).join(', ')}</div>
                  </div>
                  <ScoreBadge score={score} compact />
                </div>
                <div className="row">
                  <StatusChip status={lead.status} />
                  {hasOwnSite(lead) ? <span className="chip">{domainOf(lead.website)}</span> : <span className="chip chip-hot">sem site</span>}
                  {lead.isDemo && <span className="chip chip-demo">demo</span>}
                  <span className="tiny muted" style={{ marginLeft: 'auto' }}>contato: {fmtDate(lead.lastContactAt)}</span>
                </div>
                <RowActions leadId={lead.id} phone={lead.phone} whatsapp={lead.whatsapp} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function PageHead() {
  return (
    <div className="page-head">
      <div><div className="kicker">Painel de oportunidades</div><h1>Quem abordar primeiro</h1></div>
      <span className="small muted" style={{ maxWidth: 360 }}>O score ordena prioridade de abordagem com base em sinais visíveis. Não é previsão de fechamento.</span>
    </div>
  );
}

function RowActions({ leadId, phone, whatsapp }: { leadId: string; phone?: string; whatsapp?: string }) {
  const wa = buildWhatsAppLink({ phone, whatsapp }, '');
  return (
    <div className="cell-actions" onClick={(e) => e.stopPropagation()}>
      {phone && <a className="btn btn-sm btn-ghost" href={`tel:+${phone}`} aria-label="Ligar"><Icon name="phone" /></a>}
      {wa.ok && <a className="btn btn-sm btn-wa" href={`#/leads/lead/${encodeURIComponent(leadId)}/abordagem`} aria-label="Preparar WhatsApp" title="Abrir abordagem e revisar mensagem antes de enviar"><Icon name="wa" /></a>}
    </div>
  );
}
