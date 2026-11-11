// Personalização determinística por empresa: dois leads do mesmo segmento não saem iguais.
// A escolha é estável (mesma empresa → mesmo resultado) e o usuário pode trocar tudo no construtor.
import type { Lead } from '../types';
import { normText } from '../normalize';
import type { SegmentPack, ServiceItem } from './packs';
import { confirmService, type ServiceEvidence } from './evidence';

export type HeroLayout = 'fullbleed' | 'editorial' | 'centered' | 'split';
export type ServicesLayout = 'grid' | 'list';

export interface Variation {
  themeId: string;
  accent: string;
  hero: HeroLayout;
  services: ServicesLayout;
  headline: string;
}

/** Hash FNV-1a 32 bits com finalização "fmix32" (boa dispersão mesmo para textos parecidos). */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return mix(h);
}

function mix(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Índice independente por "dimensão" (tema, cor, layout...), a partir da mesma semente. */
function choose(seed: number, dim: number, n: number): number {
  return mix(seed + Math.imul(dim + 1, 0x9e3779b9)) % n;
}

/** Estilos compatíveis por segmento e paletas de destaque curadas (contraste testado com o fundo de cada tema). */
const SEGMENT_THEMES: Record<string, string[]> = {
  odonto: ['clinico', 'oceano', 'sobrio', 'terracota'],
  saude: ['clinico', 'oceano', 'sobrio'],
  beleza: ['terracota', 'noturno', 'grafite', 'clinico'],
  barbearia: ['noturno', 'grafite', 'sobrio'],
  alimentacao: ['noturno', 'terracota'],
  fitness: ['esportivo', 'noturno'],
  juridico: ['sobrio', 'grafite', 'clinico'],
  imobiliario: ['sobrio', 'grafite', 'terracota', 'noturno'],
  automotivo: ['noturno', 'grafite', 'esportivo'],
  pet: ['terracota', 'oceano', 'clinico'],
  engenharia: ['sobrio', 'grafite', 'oceano', 'esportivo'],
  generico: ['sobrio', 'clinico', 'oceano', 'terracota', 'noturno', 'grafite'],
};

const ACCENTS: Record<string, string[]> = {
  clinico: ['#0f6e5c', '#1d5f8a', '#6a4fa3', '#0f7c8a', '#a2453a'],
  sobrio: ['#1e3a5f', '#7a1f2b', '#2f5d50', '#5b3a87', '#8a5a14'],
  terracota: ['#bd4b26', '#9a3b5c', '#2f6f5e', '#a8661b', '#4a5ba8'],
  noturno: ['#e8a33d', '#e06a4f', '#7fc8a9', '#d9b8ff', '#f2d16b'],
  grafite: ['#dfa968', '#c9d6df', '#e0b36a', '#b8c7a0', '#e8967a'],
  oceano: ['#0b6b8a', '#1f7a5c', '#5b4fa3', '#b4532a', '#14597a'],
  esportivo: ['#c6f432', '#ff5a36', '#38d9f5', '#ffd23f', '#ff4fa3'],
};

/** Títulos alternativos por segmento. Tokens: {nome} {bairro} {cidade} {local}. */
const HEADLINES: Record<string, string[]> = {
  odonto: ['Tratamento explicado do começo ao fim.', 'Seu sorriso cuidado com calma e clareza.', 'Odontologia que ouve antes de tratar.', 'Sorria com confiança, etapa por etapa.'],
  saude: ['Cuidado que começa por ouvir você.', 'Atendimento atento, com acompanhamento de verdade.', 'Saúde com escuta, explicação e continuidade.'],
  beleza: ['Seu horário, do seu jeito.', 'Você sai do jeito que imaginou.', 'Beleza com atenção aos detalhes.', 'Cuidado e estilo em cada detalhe.'],
  alimentacao: ['Comida feita com cuidado, do seu jeito.', 'Sabor que dá vontade de voltar.', 'Peça agora e receba do nosso jeito.', 'O sabor que você lembra, em cada prato.'],
  fitness: ['Treine com orientação e constância.', 'Seu próximo nível começa aqui.', 'Mais força, mais saúde, mais você.'],
  juridico: ['Orientação clara para decisões importantes.', 'Seu direito tratado com seriedade.', 'Você entende o seu caso antes de decidir.'],
  imobiliario: ['O imóvel certo começa com a conversa certa.', 'Comprar, vender ou alugar sem dor de cabeça.', 'Do primeiro contato às chaves, com acompanhamento.'],
  automotivo: ['Diagnóstico honesto, serviço bem feito.', 'Seu carro em mãos de confiança.', 'Reparo sem surpresa no orçamento.'],
  pet: ['Cuidado de verdade para quem é da família.', 'Seu pet bem cuidado, você tranquilo.', 'Carinho e cuidado em cada atendimento.'],
  engenharia: ['Escopo, prazo e valor combinados antes da obra.', 'Do projeto à entrega, com acompanhamento técnico.', 'Engenharia clara para você decidir com segurança.', 'Cada etapa da obra explicada antes de executar.'],
  generico: ['Atendimento próximo e serviço bem feito.', 'Do primeiro contato ao resultado, sem surpresas.', 'Você sabe o que será feito antes de começar.'],
};

/** Categorias do Google Maps (já em português) → serviço específico do negócio. */
const CATEGORY_SERVICES: Array<[RegExp, ServiceItem]> = [
  [/ortodont/i, { title: 'Ortodontia', text: 'Aparelhos e alinhadores com acompanhamento até o resultado.' }],
  [/implante/i, { title: 'Implantes dentários', text: 'Reabilitação com planejamento e explicação de cada etapa.' }],
  [/bucomaxilo|cirurgi.o oral|cirurgia/i, { title: 'Cirurgia oral', text: 'Extrações e procedimentos cirúrgicos com segurança.' }],
  [/est.tic/i, { title: 'Estética', text: 'Procedimentos estéticos planejados com você.' }],
  [/pediatr|odontopediatr/i, { title: 'Atendimento infantil', text: 'Cuidado e paciência para os pequenos.' }],
  [/endodont|canal/i, { title: 'Tratamento de canal', text: 'Alívio da dor e preservação do dente.' }],
  [/periodont/i, { title: 'Gengiva e periodontia', text: 'Prevenção e tratamento das gengivas.' }],
  [/escrit.rio de advocacia|advogad/i, { title: 'Consultoria jurídica', text: 'Análise do seu caso e caminhos possíveis.' }],
  [/trabalhist/i, { title: 'Direito trabalhista', text: 'Orientação para empregados e empresas.' }],
  [/fam.lia|div.rcio/i, { title: 'Direito de família', text: 'Divórcio, guarda e pensão com cuidado.' }],
  [/previdenci|inss/i, { title: 'Direito previdenciário', text: 'Aposentadorias e benefícios do INSS.' }],
  [/imobili.ria|corretor/i, { title: 'Compra e venda de imóveis', text: 'Do anúncio à escritura, com acompanhamento.' }],
  [/consultor imobili/i, { title: 'Consultoria imobiliária', text: 'Avaliação e estratégia para o seu imóvel.' }],
  [/barbearia/i, { title: 'Barba e cabelo', text: 'Corte, barba e acabamento no seu estilo.' }],
  [/manicure|unha/i, { title: 'Manicure e pedicure', text: 'Unhas bem cuidadas, com capricho.' }],
  [/sal.o de beleza|cabeleireir/i, { title: 'Cabelo', text: 'Corte, cor e tratamentos.' }],
  [/pizzaria/i, { title: 'Pizzas', text: 'Massa e ingredientes escolhidos com cuidado.' }],
  [/hamburgu/i, { title: 'Hambúrgueres', text: 'Artesanais, do jeito que você pede.' }],
  [/padaria/i, { title: 'Pães e confeitaria', text: 'Fornadas frescas todos os dias.' }],
  [/caf/i, { title: 'Cafés', text: 'Cafés especiais e acompanhamentos.' }],
  [/banho e tosa|pet groom/i, { title: 'Banho e tosa', text: 'Higiene e cuidado com carinho.' }],
  [/veterin/i, { title: 'Clínica veterinária', text: 'Consultas e cuidados para o seu pet.' }],
  [/pilates/i, { title: 'Pilates', text: 'Postura, força e flexibilidade.' }],
  [/academia/i, { title: 'Musculação', text: 'Treinos orientados para o seu objetivo.' }],
  [/oficina|mec.nic/i, { title: 'Mecânica geral', text: 'Diagnóstico e reparo com orçamento antes.' }],
  [/fisioterap/i, { title: 'Fisioterapia', text: 'Reabilitação e alívio de dores.' }],
  [/psic/i, { title: 'Psicoterapia', text: 'Escuta e acompanhamento individual.' }],
  [/nutri/i, { title: 'Nutrição', text: 'Plano alimentar pensado para você.' }],
  [/contab/i, { title: 'Contabilidade', text: 'Rotina contábil e fiscal em dia.' }],
  [/arquitet/i, { title: 'Projetos de arquitetura', text: 'Do conceito à obra, com você.' }],
  [/fotograf/i, { title: 'Ensaios fotográficos', text: 'Fotos que contam a sua história.' }],
  [/tatuag/i, { title: 'Tatuagem', text: 'Arte autoral e projetos personalizados.' }],
];

/** Termos neutros para fotos ilustrativas (nada de fachadas ou pessoas identificáveis de outros negócios). */
export const STOCK_QUERIES: Record<string, string[]> = {
  odonto: ['dentist equipment', 'dental office', 'smile teeth'],
  saude: ['stethoscope', 'doctor office', 'wellness'],
  beleza: ['hair salon', 'manicure', 'barber'],
  barbearia: ['barber haircut man', 'barbershop barber', 'barber beard'],
  alimentacao: ['plated food', 'restaurant dish', 'pizza'],
  fitness: ['dumbbells', 'gym workout', 'yoga'],
  juridico: ['gavel', 'justice scales', 'bookshelf'],
  imobiliario: ['living room interior', 'house keys', 'kitchen interior'],
  automotivo: ['car engine', 'mechanic tools', 'car repair'],
  pet: ['puppy', 'dog', 'cat'],
  engenharia: ['construction site engineer', 'construction site planning', 'construction site house'],
  generico: ['office desk', 'workspace', 'teamwork'],
};

/** Serviços específicos a partir das categorias reais do Maps, completados pelo pacote do segmento. */
export function servicesFrom(lead: Lead, pack: SegmentPack): ServiceItem[] {
  // Catálogo do WhatsApp Business: o próprio negócio publicou serviços, preços e fotos. É a fonte mais confiável.
  const cat = lead.catalog?.items.filter((i) => i.title.trim());
  if (cat?.length) return cat.slice(0, 8).map((i) => ({ title: i.title, text: i.text ?? '', ...(i.price ? { price: i.price } : {}) }));
  const cats = [...(lead.categories ?? []), lead.category ?? ''].filter(Boolean);
  const specific: ServiceItem[] = [];
  for (const c of cats) {
    for (const [re, item] of CATEGORY_SERVICES) {
      if (re.test(c) && !specific.some((s) => s.title === item.title)) specific.push(item);
    }
  }
  const out = [...specific];
  for (const [i, s] of pack.services.entries()) {
    if (out.length >= 6) break;
    // Só entra o que tem evidência (Maps, site do cliente) ou é o essencial do segmento.
    if (!out.some((o) => normText(o.title) === normText(s.title)) && confirmService(lead, s, i)) out.push(s);
  }
  return out.slice(0, 6);
}

/** Relatório para o construtor: o que foi confirmado (e por qual fonte) e o que ficou de fora. */
export function servicesReport(lead: Lead, pack: SegmentPack): { confirmed: ServiceEvidence[]; hidden: string[] } {
  const shown = servicesFrom(lead, pack);
  if (lead.catalog?.items.length) return { confirmed: shown.map((s) => ({ title: s.title, source: 'whatsapp' as const })), hidden: [] };
  const cats = [...(lead.categories ?? []), lead.category ?? ''];
  const confirmed: ServiceEvidence[] = shown.map((s) => {
    const idx = pack.services.findIndex((p) => normText(p.title) === normText(s.title));
    const fromCat = idx < 0 || cats.some((c) => CATEGORY_SERVICES.some(([re, it]) => re.test(c) && it.title === s.title));
    return { title: s.title, source: confirmService(lead, s, idx < 0 ? 99 : idx, fromCat) ?? 'essencial' };
  });
  const hidden = pack.services.filter((p) => !shown.some((s) => normText(s.title) === normText(p.title))).map((p) => p.title);
  return { confirmed, hidden };
}

export function variationFor(lead: Lead, pack: SegmentPack, hasPhoto: boolean, shuffle = 0): Variation {
  // `shuffle` muda a combinação quando o usuário pede "Outra combinação" no construtor.
  const seed = seedOf(`${normText(lead.name)}|${lead.id}|${shuffle}`);
  const themes = SEGMENT_THEMES[pack.id] ?? SEGMENT_THEMES.generico;
  const themeId = themes[choose(seed, 1, themes.length)];
  const accents = ACCENTS[themeId] ?? ACCENTS.sobrio;
  const accent = accents[choose(seed, 2, accents.length)];
  // Com foto, o topo mostra a foto já na primeira dobra (nada de título solto com a foto lá embaixo).
  const heroes: HeroLayout[] = hasPhoto ? ['fullbleed', 'editorial'] : ['split', 'centered'];
  const hero = heroes[choose(seed, 3, heroes.length)];
  const services: ServicesLayout = choose(seed, 4, 2) ? 'list' : 'grid';
  const heads = HEADLINES[pack.id] ?? HEADLINES.generico;
  const headline = heads[choose(seed, 5, heads.length)];
  return { themeId, accent, hero, services, headline };
}

export function fillHeadline(template: string, lead: Lead): string {
  const local = lead.neighborhood && lead.city ? `${lead.neighborhood}, ${lead.city}` : lead.city || lead.neighborhood || 'sua região';
  return template
    .replace(/\{nome\}/g, lead.name)
    .replace(/\{bairro\}/g, lead.neighborhood || lead.city || 'sua região')
    .replace(/\{cidade\}/g, lead.city || 'sua cidade')
    .replace(/\{local\}/g, local);
}
