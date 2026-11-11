// Ferramentas de importação e informações sobre as fontes — ficam em Ajustes para a tela de
// Prospectar mostrar só a pesquisa e os resultados.
import { useRef, useState } from 'react';
import type { RawBusiness } from '../core/types';
import { consolidate, sameBusiness } from '../core/dedupe';
import { csvToBusinesses } from '../core/csv';
import { normalizeBrPhone, normalizeWebsite } from '../core/normalize';
import { store, useLeads } from '../data/store';
import { buildDemoLeads } from '../data/demo';
import { Icon, Modal, Notice, useToast } from './common';

const openLead = (id: string) => {
  window.location.hash = `#/leads/lead/${encodeURIComponent(id)}`;
};

export function ImportPanel() {
  const leads = useLeads();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [niche, setNiche] = useState('');
  const [showManual, setShowManual] = useState(false);
  const hasDemo = leads.some((l) => l.isDemo);

  async function onCsv(file: File) {
    if (file.size > 5_000_000) return toast('Arquivo maior que 5 MB.', true);
    const r = csvToBusinesses(await file.text(), file.name);
    if (r.errors.length) return toast(r.errors[0], true);
    const report = consolidate(leads, r.businesses, niche.trim() || 'importado');
    store.setLeads(report.leads);
    toast(`${report.added} lead(s) novo(s)${report.merged ? ` · ${report.merged} já existente(s) atualizado(s)` : ''}${r.skipped ? ` · ${r.skipped} linha(s) sem nome ignorada(s)` : ''}.`);
  }

  return (
    <>
      <div className="grid-2">
        <div className="stack">
          <h3>Importar planilha (CSV)</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Reaproveite exportações do seu agente atual ou de planilhas. Colunas reconhecidas: nome, telefone, whatsapp, site, endereço, bairro, cidade, categoria, nota, avaliações, link. Duplicados são mesclados automaticamente.
          </p>
          <label className="field"><span>Nicho desses leads</span><input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="ex.: dentista" maxLength={80} /></label>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ''; }} />
          <div className="row">
            <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Escolher CSV</button>
            <button className="btn btn-ghost" onClick={() => setShowManual(true)}><Icon name="plus" /> Cadastrar manualmente</button>
          </div>
          <div className="row">
            {!hasDemo
              ? <button className="btn btn-sm btn-ghost" onClick={() => { store.setLeads([...leads, ...buildDemoLeads()]); toast('Dados de demonstração carregados.'); }}>Carregar dados de demonstração</button>
              : <button className="btn btn-sm btn-ghost" onClick={() => store.removeLeads(leads.filter((l) => l.isDemo).map((l) => l.id))}>Remover dados de demonstração</button>}
          </div>
        </div>
        <div className="stack">
          <h3>Como a busca funciona</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li><b>OpenStreetMap</b>: gratuito, mas muitos negócios brasileiros não estão mapeados e não há nota/fotos.</li>
            <li><b>Google Maps</b>: maior cobertura, com nota, avaliações, fotos e horário; precisa da chave da API do Google no servidor e é cobrado por consulta.</li>
            <li>Duplicados são detectados por domínio, telefone, nome + localização e ID da origem.</li>
            <li>"Sem site" significa que <i>a fonte</i> não informou site. Confirme antes de abordar.</li>
            <li>Buscas repetidas são instantâneas (ficam em cache por 24 h).</li>
          </ul>
        </div>
      </div>
      {showManual && <ManualLeadModal defaultNiche={niche} onClose={() => setShowManual(false)} onCreated={(id) => { setShowManual(false); openLead(id); }} />}
    </>
  );
}

function ManualLeadModal({ defaultNiche, onClose, onCreated }: { defaultNiche: string; onClose: () => void; onCreated: (id: string) => void }) {
  const leads = useLeads();
  const toast = useToast();
  const [f, setF] = useState({ name: '', niche: defaultNiche, phone: '', website: '', city: '', neighborhood: '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  function submit() {
    if (f.name.trim().length < 2) return setErr('Informe o nome da empresa.');
    if (f.niche.trim().length < 2) return setErr('Informe o nicho.');
    const phone = f.phone ? normalizeBrPhone(f.phone) : undefined;
    if (f.phone && !phone?.e164) return setErr('Telefone inválido. Use DDD + número.');
    const website = f.website ? normalizeWebsite(f.website) : undefined;
    if (f.website && !website) return setErr('Site inválido.');
    const raw: RawBusiness = {
      name: f.name.trim().slice(0, 120), phone: phone?.e164, phoneRaw: f.phone || undefined, website,
      city: f.city.trim() || undefined, neighborhood: f.neighborhood.trim() || undefined,
      source: { provider: 'manual', externalId: `manual-${Date.now()}`, collectedAt: new Date().toISOString() },
    };
    const dup = leads.find((l) => !l.isDemo && sameBusiness(raw, l));
    if (dup) {
      toast('Esse lead já existe — abrindo o existente.');
      return onCreated(dup.id);
    }
    const report = consolidate(leads, [raw], f.niche);
    store.setLeads(report.leads);
    onCreated(report.leads[report.leads.length - 1].id);
  }

  return (
    <Modal title="Cadastrar lead" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={submit}>Salvar lead</button></>}>
      {err && <Notice kind="error">{err}</Notice>}
      <label className="field"><span>Empresa *</span><input className="input" value={f.name} onChange={set('name')} autoFocus /></label>
      <label className="field"><span>Nicho *</span><input className="input" value={f.niche} onChange={set('niche')} /></label>
      <div className="grid-2">
        <label className="field"><span>Telefone/WhatsApp</span><input className="input" value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="(41) 99999-0000" /></label>
        <label className="field"><span>Site</span><input className="input" value={f.website} onChange={set('website')} inputMode="url" placeholder="exemplo.com.br" /></label>
        <label className="field"><span>Cidade</span><input className="input" value={f.city} onChange={set('city')} /></label>
        <label className="field"><span>Bairro</span><input className="input" value={f.neighborhood} onChange={set('neighborhood')} /></label>
      </div>
    </Modal>
  );
}
