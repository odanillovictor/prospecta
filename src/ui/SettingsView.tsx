import { useRef, useState } from 'react';
import { SIGNAL_IDS, type SignalId } from '../core/types';
import { DEFAULT_SCORING, SIGNAL_LABEL } from '../core/scoring';
import { store, useLeads, useSettings } from '../data/store';
import { Icon, Modal, Notice, downloadFile, useToast } from './common';
import { useIntegrations } from './App';
import { ImportPanel } from './ImportPanel';

export function SettingsView() {
  const settings = useSettings();
  const leads = useLeads();
  const toast = useToast();
  const { status, error, reload } = useIntegrations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [segments, setSegments] = useState(settings.scoring.prioritySegments.join(', '));
  const [locations, setLocations] = useState(settings.scoring.priorityLocations.join(', '));
  const sc = settings.scoring;

  const setWeight = (id: SignalId, v: number) => store.setSettings({ scoring: { ...sc, weights: { ...sc.weights, [id]: v } } });
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30);

  const integRows: Array<[string, boolean | undefined, string]> = [
    ['OpenStreetMap (Nominatim + Overpass)', status?.osm.configured, 'Gratuito. Sempre disponível quando a API está no ar.'],
    ['Google Maps (Places API)', status?.googlePlaces.configured, 'GOOGLE_PLACES_API_KEY no servidor. Traz nota, avaliações, fotos e horário.'],
    ['PageSpeed Insights', status?.pagespeed.configured, 'PAGESPEED_API_KEY no servidor (velocidade real).'],
    ['vault-sites', status?.vaultSites.configured, 'VAULT_SITES_ENDPOINT + VAULT_SITES_TOKEN. Contrato a validar.'],
    ['Token de acesso da API', status?.accessToken.required, 'APP_ACCESS_TOKEN — se ativo, informe o token abaixo.'],
  ];

  return (
    <>
      <div className="page-head"><div><div className="kicker">Ajustes</div><h1>Regras do jogo</h1></div></div>
      <div className="stack">
        <div className="panel panel-pad stack">
          <h2>Seu perfil (usado nas mensagens)</h2>
          <div className="grid-2">
            <label className="field"><span>Seu nome</span><input className="input" defaultValue={settings.seller.name} maxLength={60} onBlur={(e) => store.setSettings({ seller: { ...settings.seller, name: e.target.value.trim() } })} /></label>
            <label className="field"><span>Empresa / marca (opcional)</span><input className="input" defaultValue={settings.seller.company} maxLength={60} onBlur={(e) => store.setSettings({ seller: { ...settings.seller, company: e.target.value.trim() } })} /></label>
          </div>
        </div>

        <div className="panel panel-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Pesos do score</h2>
            <button className="btn btn-sm" onClick={() => { store.setSettings({ scoring: DEFAULT_SCORING }); setSegments(''); setLocations(''); toast('Pesos restaurados.'); }}>Restaurar padrão</button>
          </div>
          <span className="small muted">Cada sinal presente soma seu peso (total limitado a 100). Peso 0 desliga o sinal. Os sinais ajudam a priorizar — não preveem fechamento.</span>
          <div className="weights">
            {SIGNAL_IDS.map((id) => (
              <div key={id} style={{ display: 'contents' }}>
                <label htmlFor={`w-${id}`} className="small">{SIGNAL_LABEL[id]}</label>
                <input id={`w-${id}`} type="range" min={0} max={40} value={sc.weights[id]} onChange={(e) => setWeight(id, Number(e.target.value))} />
                <span className="mono small" style={{ textAlign: 'right' }}>{sc.weights[id]}</span>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="grid-2">
            <label className="field"><span>Quente a partir de</span><input className="input" type="number" min={1} max={100} value={sc.hotMin} onChange={(e) => store.setSettings({ scoring: { ...sc, hotMin: Math.max(sc.warmMin + 1, Math.min(100, Number(e.target.value) || 0)) } })} /></label>
            <label className="field"><span>Morno a partir de</span><input className="input" type="number" min={0} max={99} value={sc.warmMin} onChange={(e) => store.setSettings({ scoring: { ...sc, warmMin: Math.max(0, Math.min(sc.hotMin - 1, Number(e.target.value) || 0)) } })} /></label>
            <label className="field"><span>Segmentos prioritários (separe por vírgula)</span><input className="input" value={segments} onChange={(e) => setSegments(e.target.value)} onBlur={() => store.setSettings({ scoring: { ...sc, prioritySegments: list(segments) } })} placeholder="dentista, advogado" /></label>
            <label className="field"><span>Locais prioritários</span><input className="input" value={locations} onChange={(e) => setLocations(e.target.value)} onBlur={() => store.setSettings({ scoring: { ...sc, priorityLocations: list(locations) } })} placeholder="Curitiba, Batel" /></label>
          </div>
        </div>

        <div className="panel panel-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2>Integrações</h2><button className="btn btn-sm" onClick={reload}>Verificar</button></div>
          {error && <Notice kind="error">API indisponível: {error}</Notice>}
          {integRows.filter(([name, ok]) => ok !== false || name.startsWith('Token')).map(([name, ok, hint]) => (
            <div key={name} className="row" style={{ flexWrap: 'nowrap' }}>
              <span className={`chip ${ok ? 'chip-ok' : ok === false ? 'chip-cold' : ''}`} style={{ minWidth: 118, justifyContent: 'center' }}>{ok === undefined ? 'desconhecido' : ok ? (name.startsWith('Token') ? 'exigido' : 'configurado') : (name.startsWith('Token') ? 'não exigido' : 'não configurado')}</span>
              <div><b className="small">{name}</b><div className="tiny muted">{hint}</div></div>
            </div>
          ))}
          <div className="grid-2">
            <label className="field"><span>Coletor do Google Maps (no PC ou na nuvem)</span><input className="input" defaultValue={settings.coletorUrl} onBlur={(e) => { const v = e.target.value.trim().replace(/\/$/, ''); if (/^http:\/\/(127\.0\.0\.1|localhost|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{2,5}$/.test(v) || /^https:\/\/[a-z0-9-]+\.hf\.space$/.test(v)) store.setSettings({ coletorUrl: v }); else toast('Use http://127.0.0.1:8790 (PC) ou https://SEU-SPACE.hf.space (nuvem)', true); }} /></label>
            <label className="field"><span>Token do coletor (opcional)</span><input className="input" type="password" autoComplete="off" defaultValue={settings.coletorToken} onBlur={(e) => store.setSettings({ coletorToken: e.target.value.trim() })} placeholder="igual a COLETOR_TOKEN" /></label>
          </div>
          <span className="tiny muted">O coletor roda no seu computador (npm run coletor). Ele abre o Google Maps em segundo plano e devolve as empresas; veja coletor/LEIA-ME.md.</span>
          <label className="field"><span>Token de acesso desta instalação (fica só neste navegador)</span>
            <input className="input" type="password" autoComplete="off" defaultValue={settings.accessToken} onBlur={(e) => { store.setSettings({ accessToken: e.target.value.trim() }); reload(); }} placeholder="deixe vazio se APP_ACCESS_TOKEN não estiver definido" />
          </label>
          <span className="tiny muted">Chaves de API ficam apenas no servidor (Cloudflare). O navegador só sabe se cada integração está ativa.</span>
        </div>

        <div className="panel panel-pad stack" id="importar">
          <h2>Importar leads e informações</h2>
          <ImportPanel />
        </div>

        <div className="panel panel-pad stack">
          <h2>Dados</h2>
          <span className="small muted">{leads.length} lead(s) salvos neste navegador ({leads.filter((l) => l.isDemo).length} de demonstração). Faça backup antes de trocar de computador ou limpar o navegador.</span>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const r = store.importAll(await f.text()); toast(r.message, !r.ok); }} />
          <div className="row">
            <button className="btn" onClick={() => downloadFile(`sitesales-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportAll())}><Icon name="download" /> Exportar backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Importar backup</button>
            <button className="btn btn-ghost" style={{ color: 'var(--bad)' }} onClick={() => setConfirmClear(true)}><Icon name="trash" /> Apagar todos os leads</button>
          </div>
        </div>
      </div>
      {confirmClear && (
        <Modal title="Apagar todos os leads?" onClose={() => setConfirmClear(false)} footer={<><button className="btn btn-ghost" onClick={() => setConfirmClear(false)}>Cancelar</button><button className="btn btn-primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={() => { store.setLeads([]); setConfirmClear(false); toast('Leads apagados.'); }}>Apagar {leads.length} lead(s)</button></>}>
          <p style={{ margin: 0 }}>Isso remove os leads deste navegador e não pode ser desfeito. Exporte um backup antes, se precisar.</p>
        </Modal>
      )}
    </>
  );
}
