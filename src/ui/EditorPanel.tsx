import { useEffect, useRef, useState } from 'react';
import type { CustomBlock, CustomBlockType, SiteDraft } from '../core/types';
import type { SiteModel } from '../core/site/render';
import { Icon } from './common';

type StandardSection = { id: string; label: string; always?: boolean; desc?: string; reorderable?: boolean };

const DEFAULT_ORDER = ['convite','sobre','servicos','comofunciona','depoimentos','onde','objecoes','duvidas'];

const STANDARD_SECTIONS: StandardSection[] = [
  { id: 'hero', label: 'Topo', desc: 'Título, subtítulo, botão e foto principal', always: true },
  { id: 'convite', label: 'Convite', desc: 'Texto que "acende" o visitante', reorderable: true },
  { id: 'sobre', label: 'Quem somos', desc: 'Credenciais e equipe (auto)', reorderable: true },
  { id: 'servicos', label: 'Serviços', desc: 'Cards dos serviços e fotos', reorderable: true },
  { id: 'comofunciona', label: 'Como funciona', desc: 'Passo a passo (auto)', reorderable: true },
  { id: 'depoimentos', label: 'Depoimentos', desc: 'Avaliações do Google ou personalizadas', reorderable: true },
  { id: 'onde', label: 'Onde estamos', desc: 'Mapa e endereço (auto)', reorderable: true },
  { id: 'objecoes', label: 'Objeções', desc: 'Dúvidas que travam a decisão (auto)', reorderable: true },
  { id: 'duvidas', label: 'FAQ', desc: 'Perguntas frequentes (auto)', reorderable: true },
  { id: 'contato', label: 'Contato final', desc: 'Chamada à ação final', always: true },
];

const SECTION_ICONS: Record<string, string> = {
  hero: '🏠', convite: '✨', sobre: 'ℹ', servicos: '🛠', comofunciona: '📋',
  depoimentos: '⭐', onde: '📍', objecoes: '🛡', duvidas: '❓', contato: '📞',
};

const PRESETS: Array<{ type: CustomBlockType; label: string; desc: string; defaults: Partial<CustomBlock> }> = [
  { type: 'texto', label: 'Texto', desc: 'Título e parágrafo', defaults: { title: 'Título da seção', body: 'Descreva algo importante sobre o seu negócio.' } },
  { type: 'destaque', label: 'Destaque', desc: 'Faixa escura com CTA', defaults: { title: 'Pronto para dar o próximo passo?', body: 'Fale com a gente e tire todas as suas dúvidas.', btnLabel: 'Entre em contato' } },
  { type: 'imagem', label: 'Texto + foto', desc: 'Texto à esquerda, foto à direita', defaults: { title: 'Mais sobre nós', body: 'Conte mais sobre o seu negócio, sua equipe ou seu espaço.', layout: 'left' } },
  { type: 'separador', label: 'Citação', desc: 'Frase de impacto em grande', defaults: { title: 'Uma frase que resume o que vocês fazem', body: 'Fonte ou contexto opcional' } },
];

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface EditorPanelProps {
  draft: SiteDraft;
  setDraft: (fn: (d: SiteDraft) => SiteDraft) => void;
  servicesFromLead: Array<{ title: string; text: string }>;
  model: SiteModel;
  heroUpload?: string;
  logoUpload?: string;
  serviceUploads: Record<number, string>;
  onHeroUpload: (file: File | null) => void;
  onLogoUpload: (file: File | null) => void;
  onServiceUpload: (index: number, file: File | null) => void;
  blockImages: Record<string, string>;
  onBlockImage: (blockId: string, file: File | null) => void;
  externalSection?: string | null;
}

export function EditorPanel({
  draft, setDraft, servicesFromLead, model,
  heroUpload, logoUpload, serviceUploads,
  onHeroUpload, onLogoUpload, onServiceUpload,
  blockImages, onBlockImage,
  externalSection,
}: EditorPanelProps) {
  const hidden = new Set(draft.hiddenSections ?? []);
  const blocks = draft.customBlocks ?? [];
  const services = draft.services ?? servicesFromLead;
  const sectionOrder = draft.sectionOrder ?? DEFAULT_ORDER;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    if (externalSection) setExpanded(externalSection);
  }, [externalSection]);

  const setField = <K extends keyof SiteDraft>(k: K, v: SiteDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const toggleHidden = (id: string) =>
    setDraft((d) => {
      const h = new Set(d.hiddenSections ?? []);
      h.has(id) ? h.delete(id) : h.add(id);
      return { ...d, hiddenSections: [...h] };
    });

  const moveSection = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const order = [...(d.sectionOrder ?? DEFAULT_ORDER)];
      const idx = order.indexOf(id);
      if (idx === -1) return d;
      const to = idx + dir;
      if (to < 0 || to >= order.length) return d;
      [order[idx], order[to]] = [order[to], order[idx]];
      return { ...d, sectionOrder: order };
    });

  const addBlock = (type: CustomBlockType, defaults: Partial<CustomBlock>) => {
    const block: CustomBlock = { id: newId(), type, ...defaults };
    setDraft((d) => ({ ...d, customBlocks: [...(d.customBlocks ?? []), block] }));
  };

  const updateBlock = (index: number, b: CustomBlock) =>
    setDraft((d) => ({ ...d, customBlocks: (d.customBlocks ?? []).map((x, i) => (i === index ? b : x)) }));

  const deleteBlock = (index: number) => {
    const id = blocks[index]?.id;
    setDraft((d) => ({ ...d, customBlocks: (d.customBlocks ?? []).filter((_, i) => i !== index) }));
    if (expanded === `cb:${id}`) setExpanded(null);
  };

  const moveBlock = (from: number, to: number) =>
    setDraft((d) => {
      const arr = [...(d.customBlocks ?? [])];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...d, customBlocks: arr };
    });

  // Build ordered section list: hero first, contato last
  const orderedSections = [
    STANDARD_SECTIONS.find((s) => s.id === 'hero')!,
    ...sectionOrder.map((id) => STANDARD_SECTIONS.find((s) => s.id === id)).filter(Boolean) as StandardSection[],
    ...STANDARD_SECTIONS.filter((s) => !['hero','contato'].includes(s.id) && !sectionOrder.includes(s.id)),
    STANDARD_SECTIONS.find((s) => s.id === 'contato')!,
  ];

  return (
    <div className="stack">
      <p className="tiny muted" style={{ margin: 0 }}>Clique em uma seção para editar, ou clique diretamente na página ao lado.</p>

      <div className="stack" style={{ gap: 4 }}>
        {orderedSections.map((s) => {
          const isHidden = hidden.has(s.id);
          const isOpen = expanded === s.id;
          const orderIdx = sectionOrder.indexOf(s.id);
          return (
            <div key={s.id} className="cb-card" style={{ background: isOpen ? 'var(--paper-2)' : undefined, opacity: isHidden ? 0.6 : 1 }}>
              <div className="cb-card-head" style={{ cursor: 'pointer', padding: '10px 12px' }}
                onClick={() => setExpanded(isOpen ? null : s.id)}>
                <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center' }}>{SECTION_ICONS[s.id] ?? '■'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="layer-label">{s.label}{isHidden ? <span className="tiny muted"> · oculta</span> : null}</div>
                  {s.desc && !isOpen && <div className="tiny muted" style={{ marginTop: 1 }}>{s.desc}</div>}
                </div>
                {s.reorderable && (
                  <div className="row" style={{ gap: 1 }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" disabled={orderIdx <= 0}
                      style={{ padding: '2px 5px', minHeight: 0, fontSize: 12 }}
                      onClick={() => moveSection(s.id, -1)}>↑</button>
                    <button className="btn btn-sm btn-ghost" disabled={orderIdx >= sectionOrder.length - 1}
                      style={{ padding: '2px 5px', minHeight: 0, fontSize: 12 }}
                      onClick={() => moveSection(s.id, 1)}>↓</button>
                  </div>
                )}
                {!s.always && (
                  <button className={`layer-vis${isHidden ? ' hidden' : ''}`}
                    title={isHidden ? 'Oculta — clique para mostrar' : 'Visível — clique para ocultar'}
                    onClick={(e) => { e.stopPropagation(); toggleHidden(s.id); }}>
                    {isHidden ? '○' : '●'}
                  </button>
                )}
                <span className="layer-arrow">{isOpen ? '▼' : '›'}</span>
              </div>

              {isOpen && (
                <div className="stack" style={{ padding: '0 16px 16px' }}>
                  <SectionFields
                    id={s.id} draft={draft} setField={setField} model={model} services={services}
                    setDraft={setDraft}
                    heroUpload={heroUpload} logoUpload={logoUpload} serviceUploads={serviceUploads}
                    onHeroUpload={onHeroUpload} onLogoUpload={onLogoUpload} onServiceUpload={onServiceUpload}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--ln)', margin: '4px 0' }} />

      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <b className="small">Seções extras</b>
          <button className="btn btn-sm btn-accent" onClick={() => setShowPresets((v) => !v)}>
            <Icon name="plus" /> Adicionar
          </button>
        </div>

        {showPresets && (
          <div className="stack" style={{ marginBottom: 12 }}>
            <div className="grid-2">
              {PRESETS.map((p) => (
                <button key={p.type} className="btn btn-sm"
                  style={{ flexDirection: 'column', alignItems: 'flex-start', height: 'auto', padding: '10px 14px', gap: 2 }}
                  onClick={() => { addBlock(p.type, p.defaults); setShowPresets(false); }}>
                  <b style={{ fontSize: 13 }}>{p.label}</b>
                  <span className="tiny muted">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {blocks.length === 0 && !showPresets && (
          <p className="tiny muted" style={{ margin: 0 }}>Nenhuma seção extra ainda.</p>
        )}

        <div className="stack" style={{ gap: 4 }}>
          {blocks.map((block, i) => {
            const typeLabels: Record<CustomBlockType, string> = { texto: 'Texto', destaque: 'Destaque', imagem: 'Texto + foto', separador: 'Citação' };
            const blockKey = `cb:${block.id}`;
            const isOpen = expanded === blockKey;
            return (
              <div key={block.id} className="cb-card"
                style={{ opacity: dragOver === i ? 0.5 : 1, background: isOpen ? 'var(--paper-2)' : undefined }}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragIdx.current = i; }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDrop={(e) => { e.preventDefault(); if (dragIdx.current !== null && dragIdx.current !== i) moveBlock(dragIdx.current, i); dragIdx.current = null; setDragOver(null); }}
                onDragEnd={() => { dragIdx.current = null; setDragOver(null); }}
              >
                <div className="cb-card-head" style={{ cursor: 'pointer', padding: '10px 12px' }} onClick={() => setExpanded(isOpen ? null : blockKey)}>
                  <span style={{ fontSize: 14, cursor: 'grab', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>⠿</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="layer-label">{typeLabels[block.type]}{block.title ? `: ${block.title.slice(0, 24)}` : ''}</div>
                  </div>
                  <div className="row" style={{ gap: 1 }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" disabled={i === 0} style={{ padding: '2px 5px', minHeight: 0, fontSize: 12 }} onClick={() => moveBlock(i, i - 1)}>↑</button>
                    <button className="btn btn-sm btn-ghost" disabled={i === blocks.length - 1} style={{ padding: '2px 5px', minHeight: 0, fontSize: 12 }} onClick={() => moveBlock(i, i + 1)}>↓</button>
                    <button className="btn btn-sm btn-ghost" style={{ padding: '2px 5px', minHeight: 0 }} onClick={() => deleteBlock(i)} title="Excluir"><Icon name="trash" /></button>
                  </div>
                  <span className="layer-arrow">{isOpen ? '▼' : '›'}</span>
                </div>
                {isOpen && (
                  <div className="stack" style={{ padding: '0 16px 16px' }}>
                    <BlockFields block={block} onChange={(b) => updateBlock(i, b)}
                      imageUpload={blockImages[block.id]} onImageUpload={(f) => onBlockImage(block.id, f)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== Section fields per section =====

type FieldFn = (k: keyof SiteDraft, v: SiteDraft[keyof SiteDraft]) => void;

function FileButton({ accept, label, onFile, onClear, preview, previewAlt, previewStyle }: {
  accept: string; label: string;
  onFile: (f: File) => void; onClear?: () => void;
  preview?: string; previewAlt?: string;
  previewStyle?: React.CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" hidden accept={accept}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <div className="row">
        <button className="btn btn-sm" onClick={() => ref.current?.click()}>
          <Icon name="upload" /> {preview ? `Trocar ${label.toLowerCase()}` : label}
        </button>
        {preview && onClear && <button className="btn btn-sm btn-ghost" onClick={onClear}>Remover</button>}
      </div>
      {preview && <img src={preview} alt={previewAlt ?? ''} style={{ marginTop: 8, borderRadius: 8, objectFit: 'cover', width: '100%', ...previewStyle }} />}
    </>
  );
}

function SectionFields({ id, draft, setField, model, services, setDraft,
  heroUpload, logoUpload, serviceUploads, onHeroUpload, onLogoUpload, onServiceUpload }: {
  id: string;
  draft: SiteDraft;
  setField: FieldFn;
  model: SiteModel;
  services: Array<{ title: string; text: string }>;
  setDraft: (fn: (d: SiteDraft) => SiteDraft) => void;
  heroUpload?: string;
  logoUpload?: string;
  serviceUploads: Record<number, string>;
  onHeroUpload: (f: File | null) => void;
  onLogoUpload: (f: File | null) => void;
  onServiceUpload: (i: number, f: File | null) => void;
}) {
  if (id === 'hero') return (
    <>
      <label className="field"><span>Título principal</span>
        <textarea className="textarea" style={{ minHeight: 70 }} value={draft.headline ?? model.headline} maxLength={120}
          onChange={(e) => setField('headline', e.target.value)} />
      </label>
      <label className="field"><span>Subtítulo</span>
        <textarea className="textarea" style={{ minHeight: 70 }} value={draft.subheadline ?? model.subheadline} maxLength={240}
          onChange={(e) => setField('subheadline', e.target.value)} />
      </label>
      <label className="field"><span>Botão principal</span>
        <input className="input" value={draft.ctaPrimary ?? model.ctaPrimary} maxLength={40}
          onChange={(e) => setField('ctaPrimary', e.target.value)} />
      </label>
      <div className="field"><span>Foto do topo</span>
        <FileButton accept="image/png,image/jpeg,image/webp" label="Enviar foto"
          onFile={onHeroUpload} onClear={() => onHeroUpload(null)}
          preview={heroUpload ?? model.images.hero} previewAlt="Foto do topo"
          previewStyle={{ maxHeight: 120 }} />
      </div>
      <div className="field"><span>Logo</span>
        <FileButton accept="image/png,image/jpeg,image/webp" label="Enviar logo"
          onFile={onLogoUpload} onClear={() => onLogoUpload(null)}
          preview={logoUpload ?? model.images.logo} previewAlt="Logo"
          previewStyle={{ maxHeight: 80, objectFit: 'contain', background: 'var(--paper-2)', padding: 8 }} />
      </div>
    </>
  );

  if (id === 'convite') return (
    <label className="field"><span>Texto do convite</span>
      <textarea className="textarea" style={{ minHeight: 100 }} value={draft.about ?? model.about} maxLength={600}
        onChange={(e) => setField('about', e.target.value)} />
    </label>
  );

  if (id === 'sobre') return (
    <>
      <label className="field"><span>Texto de apresentação</span>
        <textarea className="textarea" style={{ minHeight: 80 }} value={draft.about ?? model.about} maxLength={600}
          onChange={(e) => setField('about', e.target.value)} />
      </label>
      {model.team.length > 0 && (
        <div className="field"><span>Equipe (do Google)</span>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: 'var(--muted)' }}>
            {model.team.map((t, i) => <li key={i}><b>{t.name}</b>{t.text ? ` — ${t.text}` : ''}</li>)}
          </ul>
        </div>
      )}
    </>
  );

  if (id === 'servicos') return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">{services.length} serviço{services.length !== 1 ? 's' : ''}</span>
        <button className="btn btn-sm btn-ghost" disabled={services.length >= 8}
          onClick={() => setField('services', [...services, { title: 'Novo serviço', text: '' }])}>
          <Icon name="plus" /> Adicionar
        </button>
      </div>
      {services.map((s, i) => (
        <div key={i} className="cb-card">
          <div className="cb-card-head" style={{ cursor: 'default' }}>
            <span className="small" style={{ flex: 1, fontWeight: 600 }}>Serviço {i + 1}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setField('services', services.filter((_, j) => j !== i))}>
              <Icon name="trash" />
            </button>
          </div>
          <div className="stack" style={{ padding: '8px 16px 16px' }}>
            <label className="field"><span>Nome</span>
              <input className="input" value={s.title} maxLength={60}
                onChange={(e) => setField('services', services.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
            </label>
            <label className="field"><span>Descrição</span>
              <textarea className="textarea" style={{ minHeight: 60 }} value={s.text} maxLength={220}
                onChange={(e) => setField('services', services.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
            </label>
            <div className="field"><span>Foto do serviço</span>
              <FileButton accept="image/png,image/jpeg,image/webp" label="Foto"
                onFile={(f) => onServiceUpload(i, f)} onClear={() => onServiceUpload(i, null)}
                preview={serviceUploads[i] ?? model.images.services[i]} previewAlt={s.title}
                previewStyle={{ maxHeight: 100 }} />
            </div>
          </div>
        </div>
      ))}
    </>
  );

  if (id === 'comofunciona') return (
    <RepeatingItems
      items={(draft.draftSteps ?? model.steps.map((s) => ({ title: s.title, text: s.text }))).map((s) => ({ title: s.title, text: s.text }))}
      isCustom={!!draft.draftSteps}
      onUseAuto={() => setDraft((d) => ({ ...d, draftSteps: undefined }))}
      onUseCustom={() => setDraft((d) => ({ ...d, draftSteps: model.steps.map((s) => ({ title: s.title, text: s.text })) }))}
      onChange={(items) => setDraft((d) => ({ ...d, draftSteps: items }))}
      newItem={{ title: 'Nova etapa', text: '' }}
      itemLabel="Etapa"
      fieldQ="Título"
      fieldA="Descrição"
      maxItems={6}
    />
  );

  if (id === 'depoimentos') return (
    <DepoimentosFields model={model} draft={draft} setDraft={setDraft} />
  );

  if (id === 'onde') return (
    <>
      {model.address && (
        <div className="field"><span className="small muted">Endereço (do Google)</span>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{model.address}</p>
        </div>
      )}
      <label className="field"><span>Horário de atendimento</span>
        <input className="input" value={draft.hours ?? ''} maxLength={120} placeholder="Seg a sex, 8h às 18h"
          onChange={(e) => setField('hours', e.target.value)} />
      </label>
      {!model.mapEmbed && (
        <p className="tiny muted" style={{ margin: 0 }}>Mapa não disponível (endereço sem coordenadas no Google).</p>
      )}
    </>
  );

  if (id === 'objecoes') return (
    <RepeatingItems
      items={draft.draftObjections ?? model.objections.map((o) => ({ title: o.title, text: o.text ?? '' }))}
      isCustom={!!draft.draftObjections}
      onUseAuto={() => setDraft((d) => ({ ...d, draftObjections: undefined }))}
      onUseCustom={() => setDraft((d) => ({ ...d, draftObjections: model.objections.map((o) => ({ title: o.title, text: o.text ?? '' })) }))}
      onChange={(items) => setDraft((d) => ({ ...d, draftObjections: items }))}
      newItem={{ title: 'Nova objeção', text: '' }}
      itemLabel="Objeção"
      fieldQ="Pergunta / título"
      fieldA="Resposta"
    />
  );

  if (id === 'duvidas') return (
    <RepeatingItems
      items={draft.draftFaq ?? model.faq}
      isCustom={!!draft.draftFaq}
      onUseAuto={() => setDraft((d) => ({ ...d, draftFaq: undefined }))}
      onUseCustom={() => setDraft((d) => ({ ...d, draftFaq: model.faq.map((f) => ({ ...f })) }))}
      onChange={(items) => setDraft((d) => ({ ...d, draftFaq: items as Array<{ q: string; a: string }> }))}
      newItem={{ q: 'Nova pergunta?', a: '' }}
      itemLabel="Pergunta"
      fieldQ="Pergunta"
      fieldA="Resposta"
      isFaq
    />
  );

  if (id === 'contato') return (
    <>
      <label className="field"><span>Texto de fechamento</span>
        <input className="input" value={draft.draftClosing ?? model.closing} maxLength={120}
          onChange={(e) => setField('draftClosing', e.target.value)} />
      </label>
      <label className="field"><span>Botão principal</span>
        <input className="input" value={draft.ctaPrimary ?? model.ctaPrimary} maxLength={40}
          onChange={(e) => setField('ctaPrimary', e.target.value)} />
      </label>
      <label className="field"><span>WhatsApp para contato (qualquer formato)</span>
        <input className="input" value={draft.draftWa ?? ''} maxLength={20} placeholder={model.waE164 ? `Atual: ${model.waE164}` : 'Ex: 47 9 9123-4567'}
          onChange={(e) => setField('draftWa', e.target.value || undefined)} />
      </label>
      <label className="field"><span>Horário de atendimento</span>
        <input className="input" value={draft.hours ?? ''} maxLength={120} placeholder="Seg a sex, 8h às 18h"
          onChange={(e) => setField('hours', e.target.value)} />
      </label>
    </>
  );

  return null;
}

// ===== Generic repeating items (steps, objections, FAQ) =====

type TitleTextItem = { title: string; text: string };
type FaqItem = { q: string; a: string };

function RepeatingItems<T extends TitleTextItem | FaqItem>({
  items, isCustom, onUseAuto, onUseCustom, onChange, newItem, itemLabel, fieldQ, fieldA, maxItems, isFaq,
}: {
  items: T[];
  isCustom: boolean;
  onUseAuto: () => void;
  onUseCustom: () => void;
  onChange: (items: T[]) => void;
  newItem: T;
  itemLabel: string;
  fieldQ: string;
  fieldA: string;
  maxItems?: number;
  isFaq?: boolean;
}) {
  const dragRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const getQ = (item: T) => isFaq ? (item as FaqItem).q : (item as TitleTextItem).title;
  const getA = (item: T) => isFaq ? (item as FaqItem).a : (item as TitleTextItem).text;
  const setQ = (item: T, v: string): T => isFaq ? { ...(item as FaqItem), q: v } as T : { ...(item as TitleTextItem), title: v } as T;
  const setA = (item: T, v: string): T => isFaq ? { ...(item as FaqItem), a: v } as T : { ...(item as TitleTextItem), text: v } as T;

  const update = (i: number, item: T) => onChange(items.map((x, j) => j === i ? item : x));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, { ...newItem }]);
  const move = (from: number, to: number) => {
    const arr = [...items];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    onChange(arr);
  };

  return (
    <>
      {!isCustom ? (
        <>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: 'var(--muted)' }}>
            {items.slice(0, 4).map((item, i) => (
              <li key={i} style={{ marginBottom: 4 }}><b>{getQ(item)}</b>{getA(item) ? ` — ${getA(item).slice(0, 60)}` : ''}</li>
            ))}
            {items.length > 4 && <li className="tiny muted">+{items.length - 4} mais</li>}
          </ul>
          <button className="btn btn-sm btn-ghost" onClick={onUseCustom} style={{ alignSelf: 'flex-start' }}>
            Personalizar {itemLabel.toLowerCase()}s
          </button>
        </>
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small" style={{ color: 'var(--accent)' }}>{itemLabel}s personalizados</span>
            <button className="btn btn-sm btn-ghost" onClick={onUseAuto}>Usar padrão</button>
          </div>
          {items.map((item, i) => (
            <div key={i} className="cb-card"
              style={{ opacity: dragOver === i ? 0.5 : 1 }}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragRef.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
              onDrop={(e) => { e.preventDefault(); if (dragRef.current !== null && dragRef.current !== i) move(dragRef.current, i); dragRef.current = null; setDragOver(null); }}
              onDragEnd={() => { dragRef.current = null; setDragOver(null); }}>
              <div className="cb-card-head" style={{ cursor: 'default', padding: '8px 12px' }}>
                <span style={{ cursor: 'grab', fontSize: 14, flexShrink: 0 }}>⠿</span>
                <span className="small" style={{ flex: 1, fontWeight: 600 }}>{itemLabel} {i + 1}</span>
                <button className="btn btn-sm btn-ghost" style={{ padding: '2px 5px', minHeight: 0 }} onClick={() => remove(i)}><Icon name="trash" /></button>
              </div>
              <div className="stack" style={{ padding: '8px 16px 12px' }}>
                <label className="field"><span>{fieldQ}</span>
                  <input className="input" value={getQ(item)} maxLength={isFaq ? 200 : 80}
                    onChange={(e) => update(i, setQ(item, e.target.value))} />
                </label>
                <label className="field"><span>{fieldA}</span>
                  <textarea className="textarea" style={{ minHeight: 60 }} value={getA(item)} maxLength={400}
                    onChange={(e) => update(i, setA(item, e.target.value))} />
                </label>
              </div>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={add} disabled={maxItems != null && items.length >= maxItems}
            style={{ alignSelf: 'flex-start' }}>
            <Icon name="plus" /> Adicionar {itemLabel.toLowerCase()}
          </button>
        </>
      )}
    </>
  );
}

// ===== Depoimentos (special: Google vs custom) =====

function DepoimentosFields({ model, draft, setDraft }: {
  model: SiteModel;
  draft: SiteDraft;
  setDraft: (fn: (d: SiteDraft) => SiteDraft) => void;
}) {
  const isCustom = Array.isArray(draft.draftReviews);
  const reviews = draft.draftReviews ?? [];
  const googleReviews = model.reviews;

  const addReview = () =>
    setDraft((d) => ({ ...d, draftReviews: [...(d.draftReviews ?? []), { author: 'Cliente', rating: 5, text: '' }] }));

  const updateReview = (i: number, patch: Partial<typeof reviews[0]>) =>
    setDraft((d) => ({ ...d, draftReviews: (d.draftReviews ?? []).map((r, j) => j === i ? { ...r, ...patch } : r) }));

  const deleteReview = (i: number) =>
    setDraft((d) => ({ ...d, draftReviews: (d.draftReviews ?? []).filter((_, j) => j !== i) }));

  const switchToCustom = () =>
    setDraft((d) => ({ ...d, draftReviews: googleReviews.length ? [...googleReviews] : [{ author: 'Cliente', rating: 5, text: '' }] }));

  const switchToGoogle = () =>
    setDraft((d) => ({ ...d, draftReviews: undefined }));

  if (!isCustom) {
    return (
      <>
        {googleReviews.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Nenhuma avaliação do Google disponível para este lead.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13, color: 'var(--muted)' }}>
            {googleReviews.slice(0, 3).map((r, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} <b>{r.author}</b> — {r.text.slice(0, 80)}{r.text.length > 80 ? '…' : ''}
              </li>
            ))}
            {googleReviews.length > 3 && <li className="tiny muted">+{googleReviews.length - 3} mais</li>}
          </ul>
        )}
        <button className="btn btn-sm btn-ghost" onClick={switchToCustom} style={{ alignSelf: 'flex-start' }}>
          Personalizar depoimentos
        </button>
      </>
    );
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small" style={{ color: 'var(--accent)' }}>Depoimentos personalizados</span>
        <button className="btn btn-sm btn-ghost" onClick={switchToGoogle}>Usar do Google</button>
      </div>
      {reviews.map((r, i) => (
        <div key={i} className="cb-card">
          <div className="cb-card-head" style={{ cursor: 'default', padding: '8px 12px' }}>
            <span className="small" style={{ flex: 1, fontWeight: 600 }}>Depoimento {i + 1}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => deleteReview(i)}><Icon name="trash" /></button>
          </div>
          <div className="stack" style={{ padding: '8px 16px 12px' }}>
            <label className="field"><span>Nome</span>
              <input className="input" value={r.author} maxLength={60}
                onChange={(e) => updateReview(i, { author: e.target.value })} />
            </label>
            <label className="field"><span>Nota (1–5)</span>
              <select className="select" value={r.rating} onChange={(e) => updateReview(i, { rating: Number(e.target.value) })}>
                {[5,4,3,2,1].map((n) => <option key={n} value={n}>{n} estrela{n !== 1 ? 's' : ''}</option>)}
              </select>
            </label>
            <label className="field"><span>Texto</span>
              <textarea className="textarea" style={{ minHeight: 70 }} value={r.text} maxLength={400}
                onChange={(e) => updateReview(i, { text: e.target.value })} />
            </label>
          </div>
        </div>
      ))}
      <button className="btn btn-sm btn-ghost" onClick={addReview} style={{ alignSelf: 'flex-start' }}>
        <Icon name="plus" /> Adicionar depoimento
      </button>
    </>
  );
}

// ===== Block fields =====

function BlockFields({ block, onChange, imageUpload, onImageUpload }: {
  block: CustomBlock;
  onChange: (b: CustomBlock) => void;
  imageUpload?: string;
  onImageUpload?: (file: File | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof CustomBlock>(k: K, v: CustomBlock[K]) => onChange({ ...block, [k]: v });

  return (
    <div className="stack">
      {(block.type === 'texto' || block.type === 'imagem') && (
        <label className="field"><span>Eyebrow (texto pequeno acima do título, opcional)</span>
          <input className="input" value={block.eyebrow ?? ''} maxLength={80}
            onChange={(e) => set('eyebrow', e.target.value || undefined)} />
        </label>
      )}
      <label className="field"><span>{block.type === 'separador' ? 'Frase de destaque' : 'Título'}</span>
        <input className="input" value={block.title ?? ''} maxLength={120}
          onChange={(e) => set('title', e.target.value || undefined)} />
      </label>
      <label className="field"><span>{block.type === 'separador' ? 'Fonte / contexto (opcional)' : 'Texto / parágrafo'}</span>
        <textarea className="textarea" style={{ minHeight: 70 }} value={block.body ?? ''} maxLength={400}
          onChange={(e) => set('body', e.target.value || undefined)} />
      </label>
      {(block.type === 'texto' || block.type === 'destaque' || block.type === 'imagem') && (
        <label className="field"><span>Texto do botão (deixe vazio para não mostrar)</span>
          <input className="input" value={block.btnLabel ?? ''} maxLength={40}
            onChange={(e) => set('btnLabel', e.target.value || undefined)} />
        </label>
      )}
      {block.type === 'texto' && (
        <label className="field"><span>Alinhamento</span>
          <select className="select" value={block.layout ?? 'center'} onChange={(e) => set('layout', e.target.value as CustomBlock['layout'])}>
            <option value="center">Centralizado</option>
            <option value="left">Esquerda</option>
            <option value="right">Direita</option>
          </select>
        </label>
      )}
      {block.type === 'imagem' && (
        <>
          <label className="field"><span>Posição da imagem</span>
            <select className="select" value={block.layout ?? 'left'} onChange={(e) => set('layout', e.target.value as CustomBlock['layout'])}>
              <option value="left">Texto à esquerda, imagem à direita</option>
              <option value="right">Imagem à esquerda, texto à direita</option>
            </select>
          </label>
          <div className="field"><span>Imagem</span>
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImageUpload?.(f); e.target.value = ''; }} />
            <div className="row">
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" /> {imageUpload ? 'Trocar imagem' : 'Escolher imagem'}
              </button>
              {imageUpload && <button className="btn btn-sm btn-ghost" onClick={() => onImageUpload?.(null)}>Remover</button>}
            </div>
            {imageUpload && <img src={imageUpload} alt="prévia" style={{ marginTop: 8, maxHeight: 120, borderRadius: 10, objectFit: 'cover' }} />}
          </div>
        </>
      )}
      <div className="grid-2">
        <label className="field"><span>Cor do texto</span>
          <div className="row" style={{ gap: 8 }}>
            <input type="color" className="input" style={{ padding: 4, height: 42, width: 60 }} value={block.textColor ?? '#000000'}
              onChange={(e) => set('textColor', e.target.value)} />
            {block.textColor && <button className="btn btn-sm btn-ghost" style={{ marginTop: 0 }} onClick={() => set('textColor', undefined)}>Padrão</button>}
          </div>
        </label>
        {(block.type === 'destaque' || block.type === 'separador') && (
          <label className="field"><span>Cor de fundo</span>
            <div className="row" style={{ gap: 8 }}>
              <input type="color" className="input" style={{ padding: 4, height: 42, width: 60 }} value={block.bgColor ?? '#1a1a2e'}
                onChange={(e) => set('bgColor', e.target.value)} />
              {block.bgColor && <button className="btn btn-sm btn-ghost" style={{ marginTop: 0 }} onClick={() => set('bgColor', undefined)}>Padrão</button>}
            </div>
          </label>
        )}
      </div>
    </div>
  );
}
