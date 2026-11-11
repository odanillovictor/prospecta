import { useEffect, useMemo, useState } from 'react';
import type { ProviderId, ProviderOutcome, RawBusiness } from '../core/types';
import { PROVIDER_LABEL, STATUS_LABEL } from '../core/types';
import { consolidate, leadFromRaw, mergeRawList, sameBusiness } from '../core/dedupe';
import { gosomToBusinesses } from '../core/providers/gosom';
import { searchOsmInBrowser } from './osmBrowser';
import { scoreLead } from '../core/scoring';
import { domainOf, formatPhone, isNonOwnSite, normalizeBrPhone } from '../core/normalize';
import { validateSearch } from '../core/validation';
import { api, ApiError, coletorApi } from '../data/api';
import type { MeResponse } from '../data/api';
import { store, useLeads, useSettings } from '../data/store';
import { GOOGLE_MONTHLY_LIMIT, GOOGLE_WARN_AT, addGoogleUsage, googleUsed } from '../data/quota';
import { Icon, Notice, ScoreBadge, useStoredState, useToast } from './common';
import { WhatsAppDialog } from './WhatsAppDialog';
import { RobotButton, RobotDialog } from './RobotUI';
import { SiteBuilder } from './SiteBuilder';
import { useIntegrations } from './App';

type Phase = 'idle' | 'loading' | 'done' | 'error';

interface Batch {
  niche: string;
  label: string;
  items: RawBusiness[];
  providers: ProviderOutcome[];
}

const hasOwn = (b: RawBusiness) => !!b.website && !isNonOwnSite(b.website);

/** Capa pequena (quadrado) da foto do Google Maps; undefined quando a empresa não tem foto. */
function coverOf(b: RawBusiness): string | undefined {
  const u = b.imageUrls?.find((x) => /^https:\/\/lh3\.googleusercontent\.com\//.test(x));
  return u ? u.replace(/=w\d+-h\d+[\w-]*$/, '=w640-h320-c') : undefined;
}

export function SearchView({ onOpenLead, meData }: { onOpenLead: (id: string) => void; meData?: MeResponse | null }) {
  const leads = useLeads();
  const toast = useToast();
  const { scoring } = useSettings();
  const { status: integ, error: integError } = useIntegrations();
  // A pesquisa (termos, filtros e resultados) fica salva no navegador: sobrevive à troca de tela e ao recarregar.
  const [niche, setNiche] = useStoredState('search.niche', '');
  const [location, setLocation] = useStoredState('search.location', '');
  const [providers, setProviders] = useStoredState<ProviderId[]>('search.providers', ['gmaps', 'osm']);
  const [onlyNoSite, setOnlyNoSite] = useStoredState('search.onlyNoSite', false);
  const [onlyWithSite, setOnlyWithSite] = useStoredState('search.onlyWithSite', false);
  const [needPhone, setNeedPhone] = useStoredState('search.needPhone', false);
  // Quantidade de resultados desejada: menos = busca mais rápida.
  // Campo livre (digita o número que quiser, sem setas): vale exatamente o que foi digitado, de 1 a 50.
  const [limitText, setLimitText] = useStoredState('search.limitText', '50');
  const safeLimit = Math.max(1, Math.min(50, Math.round(Number(limitText) || 50)));
  // Com filtros, busca mais empresas para sobrar a quantidade pedida depois de filtrar.
  // Sem filtros pede um pouco a mais: duplicatas entre fontes são unidas e a lista final fica com a quantidade exata pedida.
  const fetchLimit = onlyNoSite || onlyWithSite || needPhone ? Math.min(120, Math.max(safeLimit * 3, 20)) : Math.min(120, Math.ceil(safeLimit * 1.25) + 2);
  const [batch, setBatch] = useStoredState<Batch | null>('search.batch', null);
  const [selectedArr, setSelectedArr] = useStoredState<number[]>('search.selected', []);
  const selected = useMemo(() => new Set(selectedArr), [selectedArr]);
  const setSelected = (next: Set<number> | ((s: Set<number>) => Set<number>)) =>
    setSelectedArr((arr) => [...(typeof next === 'function' ? next(new Set(arr)) : next)]);
  const [googleUsedNow, setGoogleUsedNow] = useState(() => googleUsed());
  const [phase, setPhase] = useState<Phase>(batch ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);

  const realLeads = useMemo(() => leads.filter((l) => !l.isDemo), [leads]);

  const rows = useMemo(() => {
    if (!batch) return [];
    let r = batch.items.map((b, i) => ({ b, i, dup: realLeads.find((l) => sameBusiness(b, l)) }));
    if (onlyNoSite) r = r.filter((x) => !hasOwn(x.b));
    if (needPhone) r = r.filter((x) => x.b.phone || x.b.whatsapp);
    if (onlyWithSite) r = r.filter((x) => hasOwn(x.b));
    // Sem site primeiro: são as oportunidades de criação.
    // Maior score primeiro (sem site + telefone sobem); empate: sem site antes.
    const scoreOf = (x: (typeof r)[number]) => scoreLead(x.dup ?? leadFromRaw(x.b, batch.niche), scoring).score;
    r = r.map((x) => ({ ...x, s: scoreOf(x) })).sort((a, b) => b.s - a.s || Number(hasOwn(a.b)) - Number(hasOwn(b.b)));
    // "Quantos?" vale para o que passa nos filtros: mostra os melhores até a quantidade pedida.
    return r.slice(0, safeLimit);
  }, [batch, realLeads, onlyNoSite, onlyWithSite, needPhone, scoring, safeLimit]);

  function loadBatch(next: Batch) {
    setBatch(next);
    const sel = new Set<number>();
    next.items.forEach((b, i) => {
      if (!realLeads.some((l) => sameBusiness(b, l))) sel.add(i);
    });
    setSelected(sel);
    setPhase('done');
  }

  /** Descarta a lista atual para começar uma busca nova (leads já salvos continuam). */
  function clearResults() {
    setBatch(null);
    setSelected(new Set());
    setError(null);
    setPhase('idle');
    setCachedAt(null);
    setSearchWarning(null);
  }

  // Coletor local do Google Maps: verifica se está rodando neste computador.
  const [coletorUp, setColetorUp] = useState<boolean | null>(null);
  /** Por que o coletor não respondeu: token errado/ausente neste aparelho, ou o PC não foi alcançado. */
  const [coletorWhy, setColetorWhy] = useState<'token' | 'rede'>('rede');
  const noteDown = (e: unknown) => { setColetorWhy(e instanceof ApiError && e.status === 401 ? 'token' : 'rede'); setColetorUp(false); };
  const [coletorPhotos, setColetorPhotos] = useState(false);
  const [progress, setProgress] = useState('');
  const [gmapsHelp, setGmapsHelp] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => coletorApi.health().then((h) => { if (alive) { setColetorUp(true); setColetorPhotos(!!h.photos); } }).catch((e) => alive && noteDown(e));
    check();
    window.addEventListener('focus', check);
    return () => {
      alive = false;
      window.removeEventListener('focus', check);
    };
  }, []);

  // Com o coletor ligado, o Google Maps vem marcado (é a fonte mais completa e rápida).
  useEffect(() => {
    if (coletorUp) setProviders((p) => (p.includes('gmaps') ? p : ['gmaps', ...p]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coletorUp]);

  async function collectGmaps(n: string, loc: string): Promise<{ items: RawBusiness[]; outcome: ProviderOutcome }> {
    try {
      const { id } = await coletorApi.start(n, loc, fetchLimit);
      const t0 = Date.now();
      for (;;) {
        const job = await coletorApi.job(id);
        if (job.status === 'done') {
          const items = gosomToBusinesses(job.results ?? [], `${n} em ${loc}`);
          return { items, outcome: { provider: 'gmaps', status: items.length ? 'ok' : 'sem_resultados', count: items.length, cached: job.cached, message: `${job.exhausted ? `O Google Maps listou só ${items.length} de ${job.requested ?? fetchLimit} pedidas para esta busca (é o máximo que existe na área). ` : ''}${job.cached ? 'Resultado da coleta anterior (cache 24 h)' : `Coletado em ${Math.round(job.elapsedMs / 1000)} s`}${job.engine === 'docker-completo' ? ' · modo completo (com fotos)' : job.engine === 'local-rapido' ? ' · modo rápido (sem fotos)' : ''}.` } };
        }
        if (job.status === 'error') return { items: [], outcome: { provider: 'gmaps', status: 'erro', count: 0, message: job.error } };
        setProgress(`Google Maps: ${job.found} empresa(s) até agora · ${Math.round((Date.now() - t0) / 1000)} s`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      return { items: [], outcome: { provider: 'gmaps', status: 'erro', count: 0, message: err instanceof ApiError ? err.message : 'Falha no coletor.' } };
    }
  }

  async function doSearch(override?: ProviderId[]) {
    const active = override ?? providers;
    const useGmaps = active.includes('gmaps') && !!coletorUp;
    const serverProviders = active.filter((p) => p !== 'gmaps');
    // Valida os textos mesmo quando só o Google Maps (coletor) está marcado.
    const v = validateSearch({ niche, location, providers: serverProviders.length ? serverProviders : ['osm'] });
    if (!v.ok) {
      setError(v.error);
      setPhase('error');
      return;
    }
    if (!useGmaps && !serverProviders.length) {
      setError('Marque uma fonte. Para o Google Maps, inicie o coletor no computador (npm run coletor).');
      setPhase('error');
      return;
    }
    if (serverProviders.includes('google_places') && googleUsed() >= GOOGLE_MONTHLY_LIMIT) {
      setError(`Você usou as ${GOOGLE_MONTHLY_LIMIT} buscas do Google deste mês. Desmarque "Google API oficial" para buscar no OpenStreetMap ou aguarde o próximo mês.`);
      setPhase('error');
      return;
    }
    setPhase('loading');
    setError(null);
    setProgress('');
    setCachedAt(null);
    setSearchWarning(null);
    try {
      // OpenStreetMap é consultado direto do aparelho: os servidores Overpass recusam pedidos vindos do Cloudflare.
      const wantOsm = serverProviders.includes('osm');
      const onServer = serverProviders.filter((p) => p !== 'osm');
      const [g, srv, osm] = await Promise.all([
        useGmaps ? collectGmaps(v.value.niche, v.value.location) : Promise.resolve(null),
        onServer.length ? api.search({ niche: v.value.niche, location: v.value.location, providers: onServer, limit: fetchLimit }) : Promise.resolve(null),
        wantOsm ? searchOsmInBrowser(v.value.niche, v.value.location, fetchLimit) : Promise.resolve(null),
      ]);
      // Conta só consultas reais ao Google (resposta em cache não custa). Estimativa: 1 consulta a cada 20 resultados pedidos, no máximo 3.
      const gp = srv?.providers.find((p) => p.provider === 'google_places');
      if (gp && gp.status !== 'nao_configurado' && gp.status !== 'erro' && !gp.cached) setGoogleUsedNow(addGoogleUsage(Math.min(3, Math.max(1, Math.ceil(fetchLimit / 20)))));
      const items = mergeRawList([...(g?.items ?? []), ...(srv?.results ?? []), ...(osm?.results ?? [])]);
      const outcomes = [...(g ? [g.outcome] : []), ...(srv?.providers ?? []), ...(osm ? [osm.outcome] : [])];
      if (srv?.cachedAt) setCachedAt(srv.cachedAt);
      if (srv?.warning) setSearchWarning(srv.warning);
      loadBatch({ niche: v.value.niche, label: `${v.value.niche} · ${v.value.location}`, items, providers: outcomes });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha inesperada na busca.');
      setPhase('error');
    }
  }

  async function runSearch(e: React.FormEvent, override?: ProviderId[]) {
    e.preventDefault();
    doSearch(override);
  }

  function save(toFunnel = false) {
    if (!batch) return;
    // Só o que aparece na lista (o botão mostra essa contagem): resultados escondidos pelo limite/filtros não entram.
    const shown = new Set(rows.map((r) => r.i));
    const chosen = batch.items.filter((_, i) => selected.has(i) && shown.has(i));
    if (!chosen.length) return toast('Nenhuma empresa selecionada.', true);
    const report = consolidate(leads, chosen, batch.niche);
    let out = report.leads;
    if (toFunnel) {
      // Só move para o funil quem ainda não teve contato; quem já está em andamento não volta de etapa.
      const ids = new Set(chosen.map((b) => report.leads.find((l) => !l.isDemo && sameBusiness(b, l))?.id));
      const now = new Date().toISOString();
      out = report.leads.map((l) => (ids.has(l.id) && (l.status === 'novo' || l.status === 'pesquisado') ? { ...l, status: 'prospectado' as const, updatedAt: now } : l));
    }
    store.setLeads(out);
    toast(toFunnel
      ? `${chosen.length} lead(s) no funil · coluna Prospectado.`
      : `${report.added} novo(s) lead(s)${report.merged ? ` · ${report.merged} já existente(s) atualizado(s)` : ''}.`);
    setSelected(new Set());
    setBatch({ ...batch });
  }

  // Ações da vitrine salvam o lead automaticamente (ou reaproveitam o que já existe na base).
  const [waId, setWaId] = useState<string | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [robotId, setRobotId] = useState<string | null>(null);
  const waLead = waId ? leads.find((l) => l.id === waId) : undefined;
  const buildLead = buildId ? leads.find((l) => l.id === buildId) : undefined;

  function ensureSaved(b: RawBusiness, existingId?: string): string {
    if (existingId) return existingId;
    const current = store.getLeads();
    const found = current.find((l) => !l.isDemo && sameBusiness(b, l));
    if (found) return found.id;
    const report = consolidate(current, [b], batch?.niche ?? niche);
    store.setLeads(report.leads);
    toast(`"${b.name}" salvo nos leads.`);
    return report.leads[report.leads.length - 1].id;
  }

  const openDetails = (b: RawBusiness, existingId?: string) => onOpenLead(ensureSaved(b, existingId));

  const toggle = (i: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  });

  const googleReady = !!integ?.googlePlaces.configured;
  const visibleSelected = rows.filter((r) => selected.has(r.i)).length;

  return (
    <>
      <section className="search-hero">
        <div className="kicker" style={{ color: '#a9a59c' }}>Prospecção</div>
        <h1>Quem precisa de um site hoje?</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>Busque por nicho e local. Você revisa os resultados antes de salvar.</p>
        {meData && (
          <p className="small muted" style={{ margin: '4px 0 0' }}>{meData.remaining.searches} buscas restantes este mês</p>
        )}
        <form onSubmit={runSearch}>
          <div className="search-grid">
            <label className="field"><span>O quê? (qualquer nicho)</span>
              <input className="input input-lg" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="dentista, pet shop, corretor…" maxLength={80} autoComplete="off" />
            </label>
            <label className="field qty"><span>Quantos? <span className="tiny muted">1 busca = 1 crédito, independente da quantidade. Busque sempre o máximo.</span></span>
              <input className="input input-lg" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={limitText} onChange={(e) => setLimitText(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => setLimitText(String(safeLimit))} aria-label="Quantidade de resultados" />
            </label>
            <label className="field"><span>Onde? (cidade, região ou bairro)</span>
              <input className="input input-lg" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Curitiba, Batel – Curitiba…" maxLength={120} autoComplete="off" />
            </label>
            <button className="btn btn-accent" style={{ minHeight: 52, paddingInline: 22 }} disabled={phase === 'loading'}>
              {phase === 'loading' ? <span className="spinner" /> : <Icon name="search" />} Buscar
            </button>
          </div>
          <div className="search-opts">
            <span className="small" style={{ color: "#a9a59c", fontWeight: 600 }}>Buscar em:</span>
            <label className="check" title={coletorUp ? 'Coleta direto do Google Maps pelo coletor que roda neste computador.' : 'Inicie o coletor neste computador: npm run coletor (veja coletor/LEIA-ME.md).'}>
              <input type="checkbox" checked={!!coletorUp && providers.includes('gmaps')} onChange={(e) => {
                // Coletor desligado: em vez de ignorar o toque, verifica de novo e explica o que fazer.
                if (!coletorUp) {
                  setGmapsHelp(true);
                  coletorApi.health().then((h) => { setColetorUp(true); setColetorPhotos(!!h.photos); setGmapsHelp(false); setProviders((p) => (p.includes('gmaps') ? p : ['gmaps', ...p])); }).catch(noteDown);
                  return;
                }
                setProviders((p) => e.target.checked ? [...p, 'gmaps'] : p.filter((x) => x !== 'gmaps'));
              }} />
              Google Maps <span className="tiny muted">{coletorUp == null ? '(verificando…)' : coletorUp ? (coletorPhotos ? '(coletor ativo via Docker: com fotos)' : '(coletor ativo: telefone, nota, horário — sem fotos)') : '(coletor desligado — npm run coletor)'}</span>
            </label>
            <label className="check"><input type="checkbox" checked={providers.includes('osm')} onChange={(e) => setProviders((p) => e.target.checked ? [...p, 'osm'] : p.filter((x) => x !== 'osm'))} /> OpenStreetMap <span className="tiny muted">(grátis, menos empresas)</span></label>
            {googleReady && (
              <label className="check" title="API oficial do Google: nota, avaliações, fotos e horário. Cobrado por consulta.">
                <input type="checkbox" checked={providers.includes('google_places')} onChange={(e) => setProviders((p) => e.target.checked ? [...p, 'google_places'] : p.filter((x) => x !== 'google_places'))} />
                Google API oficial{' '}
                <span className="tiny muted" style={googleUsedNow >= GOOGLE_MONTHLY_LIMIT * GOOGLE_WARN_AT ? { color: '#c2331a' } : undefined}>
                  ({googleUsedNow} de {GOOGLE_MONTHLY_LIMIT} buscas neste mês{googleUsedNow >= GOOGLE_MONTHLY_LIMIT ? ' · limite atingido' : googleUsedNow >= GOOGLE_MONTHLY_LIMIT * GOOGLE_WARN_AT ? ' · perto do limite' : ''})
                </span>
              </label>
            )}
            <span style={{ width: 1, background: '#3a3f48' }} />
            <label className="check"><input type="checkbox" checked={onlyNoSite} onChange={(e) => { setOnlyNoSite(e.target.checked); if (e.target.checked) setOnlyWithSite(false); }} /> Somente sem site</label>
            <label className="check"><input type="checkbox" checked={onlyWithSite} onChange={(e) => { setOnlyWithSite(e.target.checked); if (e.target.checked) setOnlyNoSite(false); }} /> Somente com site</label>
            <label className="check"><input type="checkbox" checked={needPhone} onChange={(e) => setNeedPhone(e.target.checked)} /> Com telefone</label>
          </div>
          {gmapsHelp && coletorUp === false && (
            <Notice kind="warn">
              {coletorWhy === 'token' ? (
                <><b>O coletor respondeu, mas este aparelho está sem o token certo.</b> Escaneie de novo o QR (ou abra o link completo, com <code>#coletor=…</code>) que aparece na janela do <code>Abrir Prospecta no celular.bat</code>.</>
              ) : (
                <><b>Não consegui falar com o coletor no PC.</b> Confira: a janela preta do <code>.bat</code> está aberta? O celular está no mesmo Wi-Fi do PC (sem VPN)? No PC, rode <code>npm run coletor</code> se ele não estiver ligado.</>
              )}
            </Notice>
          )}
        </form>
      </section>

      {integError && phase !== 'done' && (
        <div style={{ marginBottom: 14 }}><Notice kind="warn">{integError} A busca online não funciona sem ela; importação CSV e o funil funcionam offline.</Notice></div>
      )}

      {phase === 'error' && error && <div style={{ marginBottom: 14 }}><Notice kind="error">{error}</Notice></div>}

      {phase === 'loading' && (
        <div className="panel" aria-busy="true">
          <div className="provider-line"><span className="spinner" /> Consultando {providers.filter((p) => p !== 'gmaps' || coletorUp).map((p) => PROVIDER_LABEL[p]).join(' + ')}… {progress || 'Uma coleta nova no Google Maps leva cerca de 15–60 s; repetida é instantânea.'}</div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="result-row"><div className="skeleton" style={{ width: 18, height: 18 }} /><div className="stack" style={{ gap: 6 }}><div className="skeleton" style={{ height: 14, width: '45%' }} /><div className="skeleton" style={{ height: 11, width: '70%' }} /></div><div className="skeleton" style={{ width: 70, height: 22 }} /></div>
          ))}
        </div>
      )}

      {phase === 'done' && batch && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>{batch.label}</h2>
              <div className="small muted">{batch.items.length} encontrada(s) · {rows.length} exibida(s) · {rows.filter((r) => !hasOwn(r.b)).length} sem site próprio</div>
            </div>
            <div className="row">
              <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set(rows.filter((r) => !r.dup).map((r) => r.i)))}>Selecionar novas</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Desmarcar</button>
              <button className="btn btn-sm btn-ghost" title="Descarta esta lista de resultados para começar uma busca nova (os leads já salvos não são apagados)" onClick={clearResults}>Descartar resultados</button>
              <button className="btn" onClick={() => save(true)} disabled={!visibleSelected} title="Salva e coloca na 1ª coluna do funil (Prospectado)">Salvar no funil</button>
              <button className="btn btn-primary" onClick={() => save()} disabled={!visibleSelected}>Salvar {visibleSelected} lead{visibleSelected === 1 ? '' : 's'}</button>
            </div>
          </div>
          {cachedAt != null && (
            <div style={{ marginBottom: 10 }}>
              <Notice kind="info">
                Resultados salvos há {Math.floor((Date.now() - cachedAt) / 86_400_000)} dias.{' '}
                <button className="btn btn-sm" onClick={() => { clearResults(); doSearch(); }}>Atualizar</button>{' '}
                (gasta 1 busca)
              </Notice>
            </div>
          )}
          {searchWarning && (
            <div style={{ marginBottom: 10 }}>
              <Notice kind="warn">{searchWarning}</Notice>
            </div>
          )}
          <div className="provider-line">
            {batch.providers.map((p) => (
              <span key={p.provider} className={`chip ${p.status === 'ok' ? 'chip-ok' : p.status === 'erro' ? 'chip-bad' : p.status === 'nao_configurado' ? 'chip-cold' : 'chip-attn'}`} title={p.message}>
                {PROVIDER_LABEL[p.provider]}: {p.status === 'ok' ? `${p.count}` : p.status.replace('_', ' ')}{p.cached ? ' · cache' : ''}
              </span>
            ))}
            <span className="muted tiny">{batch.providers.map((p) => p.message).filter(Boolean).join(' ')}</span>
          </div>
          {!rows.length ? (
            <div className="empty">
              <h3>{!batch.items.length && batch.providers.every((p) => p.status === 'erro' || p.status === 'nao_configurado') ? 'A fonte de dados falhou' : 'Nenhuma empresa para mostrar'}</h3>
              <p>{!batch.items.length && batch.providers.some((p) => p.status === 'erro')
                ? 'Os servidores públicos podem estar sobrecarregados. Nada foi salvo. Tente de novo em alguns minutos ou importe um CSV.'
                : batch.items.length ? `Das ${batch.items.length} empresas encontradas, nenhuma passa nos filtros${onlyNoSite ? ' (todas têm site próprio)' : onlyWithSite ? ' (nenhuma tem site)' : ''}.` : 'A fonte não retornou empresas para esta busca. Tente um termo mais comum (ex.: "dentista"), um local maior, ou importe um CSV.'}</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                {batch.items.length > 0 && (onlyNoSite || onlyWithSite || needPhone) && <button className="btn" onClick={() => { setOnlyNoSite(false); setOnlyWithSite(false); setNeedPhone(false); }}>Mostrar todas</button>}
                {coletorUp && !providers.includes('gmaps') && <button className="btn btn-accent" onClick={(e) => { setProviders(['gmaps']); runSearch(e as unknown as React.FormEvent, ['gmaps']); }}>Buscar no Google Maps</button>}
                {batch.providers.some((p) => p.status === "erro") && <button className="btn btn-primary" onClick={(e) => runSearch(e as unknown as React.FormEvent)}>Tentar novamente</button>}
              </div>
            </div>
          ) : (
            <div className="rcards">
              {rows.map(({ b, i, dup }) => {
                const preview = dup ?? leadFromRaw(b, batch.niche);
                const score = scoreLead(preview, scoring);
                const phone = b.phone ? normalizeBrPhone(b.phone) : undefined;
                return (
                  <article className={`rcard${selected.has(i) ? ' is-sel' : ''}`} key={i}>
                    <div className="rcard-cover" aria-hidden="true">
                      {coverOf(b) ? <img src={coverOf(b)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.remove(); }} /> : <span>{b.name.trim().charAt(0).toUpperCase()}</span>}
                    </div>
                    <input className="rcard-check" type="checkbox" aria-label={`Selecionar ${b.name}`} checked={selected.has(i)} onChange={() => toggle(i)} />
                    <div className="rcard-head">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <button className="rcard-name" onClick={() => openDetails(b, dup?.id)}>{b.name}</button>
                        <div className="lead-sub">{[b.category, [b.neighborhood, b.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
                      </div>
                      <ScoreBadge score={score} />
                    </div>

                    <div className="rcard-chips">
                      {hasOwn(b) ? <span className="chip">site: {domainOf(b.website)}</span> : <span className="chip chip-hot">sem site</span>}
                      {phone?.kind === 'celular' && <span className="chip chip-ok">celular · provável WhatsApp</span>}
                      {phone?.kind === 'fixo' && <span className="chip chip-attn">telefone fixo</span>}
                      {!b.phone && !b.whatsapp && <span className="chip chip-cold">sem telefone</span>}
                      {b.whatsapp && <span className="chip chip-ok">WhatsApp declarado</span>}
                      {b.rating != null && <span className="chip">★ {b.rating.toFixed(1)} · {b.reviewCount ?? 0} avaliações</span>}
                      {(b.photos?.length ?? 0) > 0 && <span className="chip">{b.photos!.length} fotos no Google</span>}
                      {dup && <span className="chip chip-info">já na base · {STATUS_LABEL[dup.status]}</span>}
                    </div>

                    <div className="rcard-body">
                      <dl className="rcard-facts">
                        <div><dt>Telefone</dt><dd className="mono">{b.phone ? formatPhone(b.phone) : b.phoneRaw ?? '—'}</dd></div>
                        <div><dt>Endereço</dt><dd>{b.address || [b.neighborhood, b.city].filter(Boolean).join(', ') || '—'}</dd></div>
                        {b.hours && <div><dt>Horário</dt><dd>{b.hours}</dd></div>}
                        {b.instagram && <div><dt>Instagram</dt><dd>@{b.instagram}</dd></div>}
                      </dl>
                    </div>

                    <div className="rcard-acts">
                      <button className="btn btn-sm btn-wa" disabled={!b.phone && !b.whatsapp} onClick={() => setWaId(ensureSaved(b, dup?.id))}><Icon name="wa" /> WhatsApp</button>
                      <button className="btn btn-sm btn-accent" onClick={() => setBuildId(ensureSaved(b, dup?.id))}><Icon name="sparkle" /> Criar site</button>
                      <RobotButton lead={dup ?? preview} onOpen={() => setRobotId(ensureSaved(b, dup?.id))} />
                      <button className="btn btn-sm" onClick={() => openDetails(b, dup?.id)}>Detalhes</button>
                      {b.source.url && <a className="btn btn-sm btn-ghost" href={b.source.url} target="_blank" rel="noopener noreferrer"><Icon name="ext" /> Origem</a>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {waLead && <WhatsAppDialog lead={waLead} onClose={() => setWaId(null)} />}
      {buildLead && <SiteBuilder lead={buildLead} onClose={() => setBuildId(null)} />}
      {robotId && <RobotDialog leadId={robotId} onClose={() => setRobotId(null)} />}
    </>
  );
}
