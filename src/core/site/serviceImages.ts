// Busca de foto por SERVIÇO (não por segmento): "Tosa" procura "dog grooming", "Implantes" procura "dental implant".
// Regras fixas, sem IA. A consulta vai em inglês porque os bancos gratuitos (Pexels/Openverse) indexam assim.
import { STOCK_QUERIES } from './variation';

// Cada regra vale só para o segmento dele ("Restaurações" num dentista não pode virar foto de restaurante).
const RULES: Array<[string, RegExp, string]> = [
  // Odontologia
  ['odonto', /restaur|obtura|carie/, 'dental filling dentist'],
  ['odonto', /implant/, 'dental implant dentist'],
  ['odonto', /ortodon|aparelho/, 'dental braces smile'],
  ['odonto', /clarea/, 'teeth whitening smile'],
  ['odonto', /limpeza|profilax|preven/, 'dental cleaning dentist'],
  ['odonto', /canal|endodon/, 'dentist treatment patient'],
  ['odonto', /protes|dentadura/, 'dental prosthesis'],
  ['odonto', /periodon|gengiv/, 'dental checkup'],
  ['odonto', /lente|faceta|estetica dent|harmoniz/, 'beautiful smile teeth'],
  ['odonto', /odontoped|infantil|crianc/, 'child dentist'],
  ['odonto', /avalia|consulta|urgenc/, 'dentist consultation patient'],
  ['odonto', /dent|odonto|sorriso|estetic/, 'dentist patient clinic'],
  // Pet
  ['pet', /tosa/, 'dog grooming'],
  ['pet', /banho/, 'dog bath grooming'],
  ['pet', /veterin|consulta vet|vacina/, 'veterinarian dog'],
  ['pet', /hotel|creche|hosped/, 'dogs playing daycare'],
  ['pet', /racao|aliment.*pet|petisc/, 'dog food bowl'],
  ['pet', /adestra/, 'dog training'],
  ['pet', /pet|cachorr|gato|animal/, 'happy dog'],
  // Beleza
  ['beleza', /barba/, 'barber beard'],
  ['beleza', /corte|cabelo|escova|progressiva|coloraç|mecha|luzes/, 'hair salon haircut'],
  ['beleza', /unha|manicure|pedicure/, 'manicure nails'],
  ['beleza', /sobrancel|cilio/, 'eyebrow beauty'],
  ['beleza', /maquiag/, 'makeup artist'],
  ['beleza', /massag/, 'massage spa'],
  ['beleza', /depila/, 'spa treatment'],
  ['beleza', /facial|pele|limpeza de pele|estetica/, 'facial skin care'],
  // Saúde
  ['saude', /fisio|reabilit/, 'physiotherapy'],
  ['saude', /pilates/, 'pilates'],
  ['saude', /psico|terap/, 'therapy session'],
  ['saude', /nutri|dieta/, 'healthy food nutrition'],
  ['saude', /exame|laborat/, 'medical laboratory'],
  ['saude', /consulta|medic|clinic|saude/, 'doctor patient consultation'],
  // Fitness
  ['fitness', /muscul|academia|treino/, 'gym workout weights'],
  ['fitness', /funcional|crossfit/, 'functional training'],
  ['fitness', /yoga/, 'yoga class'],
  ['fitness', /luta|jiu|muay|box/, 'martial arts training'],
  ['fitness', /danc/, 'dance class'],
  // Alimentação
  ['alimentacao', /pizza/, 'pizza'],
  ['alimentacao', /hamburg|lanche|burger/, 'burger'],
  ['alimentacao', /cafe|cafeteria/, 'coffee cup'],
  ['alimentacao', /pao|padaria/, 'bread bakery'],
  ['alimentacao', /doce|bolo|confeit|sobremesa/, 'cake dessert'],
  ['alimentacao', /sushi|japon/, 'sushi'],
  ['alimentacao', /churras|carne/, 'barbecue meat'],
  ['alimentacao', /delivery|entrega/, 'food delivery'],
  ['alimentacao', /marmit|refei|almoco|prato|cardapio|restaur|comida/, 'plated food restaurant'],
  // Automotivo
  ['automotivo', /freio/, 'car brakes'],
  ['automotivo', /suspens/, 'car suspension repair'],
  ['automotivo', /eletric|bateria/, 'car battery'],
  ['automotivo', /oleo|lubrif/, 'oil change car'],
  ['automotivo', /alinhamento|balancea|pneu/, 'car tire wheel'],
  ['automotivo', /funilaria|pintura/, 'car paint'],
  ['automotivo', /lavagem|lava|polimento|estetica auto/, 'car wash'],
  ['automotivo', /ar condicionado/, 'car air conditioning'],
  ['automotivo', /mecan|revis|oficina|motor|reparo|manuten/, 'car mechanic repair'],
  // Jurídico / contábil
  ['juridico', /trabalh/, 'lawyer meeting'],
  ['juridico', /famil|divorc|herança|inventar/, 'lawyer consultation'],
  ['juridico', /previd|aposent/, 'senior couple documents'],
  ['juridico', /contab|fiscal|imposto|folha/, 'accounting calculator'],
  ['juridico', /advoc|jurid|direito|contrato/, 'lawyer desk'],
  // Engenharia
  ['engenharia', /projeto|regulariz/, 'construction site planning'],
  ['engenharia', /laudo|vistoria|pericia/, 'construction site engineer'],
  ['engenharia', /obra|acompanh/, 'engineers construction site'],
  ['engenharia', /reforma|ampliac/, 'construction site house'],
  ['engenharia', /orcament|planejament/, 'construction site planning'],
  ['engenharia', /consultor|engenh/, 'construction site engineer'],
  // Imóveis
  ['imobiliario', /alug|locaç/, 'apartment interior'],
  ['imobiliario', /venda|compra|imov|casa|apartament/, 'house interior living room'],
];

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Consulta (inglês) para a foto de um serviço; cai na consulta do segmento quando não reconhece. */
export function serviceQuery(title: string, segId: string, index = 0, ctx = ''): string {
  const t = norm(title);
  // Barbearia é público masculino: nunca cai nas fotos de salão feminino.
  // Serviço sem foto de banco confiável (sobrancelha, química...): sem foto, o cartão usa ícone em vez de imagem errada.
  if (isBarber(ctx)) return /barba|bigode/.test(t) ? 'barber beard' : /sobrancel|pigment|quimic|hidrata|relax/.test(t) ? '' : 'barber haircut man';
  // Segmento conhecido: só as regras dele; "generico" (não reconhecido) tenta todas.
  const hit = RULES.find(([seg, re]) => (segId === 'generico' || seg === segId) && re.test(t));
  if (hit) return hit[2];
  const seg = STOCK_QUERIES[segId] ?? STOCK_QUERIES.generico;
  return seg[index % seg.length];
}

/** Valida a consulta recebida pela API (só letras minúsculas e espaços; evita abuso do endpoint). */
export function cleanStockQuery(q: string | null): string | undefined {
  const v = (q ?? '').trim().toLowerCase();
  return /^[a-z][a-z ]{2,40}$/.test(v) ? v : undefined;
}

/** Foto de topo por segmento quando a do cliente não serve (calma, sem texto, coerente com o negócio). */
const HERO_QUERIES: Record<string, string> = {
  odonto: 'dentist smile patient',
  saude: 'doctor patient consultation',
  beleza: 'beauty salon woman hair',
  alimentacao: 'restaurant food table',
  fitness: 'gym workout training',
  juridico: 'lawyer office meeting',
  imobiliario: 'modern living room interior',
  automotivo: 'car mechanic workshop',
  pet: 'happy dog grooming',
  engenharia: 'construction site engineer',
  generico: 'office workspace desk',
};

/** Contexto (nicho/categoria do lead) que pede foto masculina. */
export const isBarber = (ctx: string) => /barbear|barber/.test(norm(ctx));

export function heroQuery(segId: string, ctx = ''): string {
  if (isBarber(ctx)) return 'barbershop barber';
  return HERO_QUERIES[segId] ?? HERO_QUERIES.generico;
}

const OFF_TOPIC = /\b(brain|robot|cartoon|illustration|vector|icon|3d|render|painting|drawing|logo|silhouette|abstract)\b/i;
const WEAK_WORDS = new Set(['man', 'woman', 'patient', 'site', 'clinic', 'office', 'shop', 'happy', 'beautiful', 'house', 'interior']);

/** Ordena as fotos do banco pela coerência das tags com a consulta e descarta as fora do assunto. */
export function rankStock<T extends { title?: string }>(photos: T[], query: string, strict = false): T[] {
  const keys = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !WEAK_WORDS.has(w));
  const clean = photos.filter((p) => !OFF_TOPIC.test(p.title ?? ''));
  const score = (p: T) => keys.filter((k) => (p.title ?? '').toLowerCase().includes(k.slice(0, Math.max(4, k.length - 2)))).length;
  const scored = clean.map((p, i) => ({ p, s: score(p), i }));
  const good = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
  if (strict) return good.map((x) => x.p); // serviço: só foto cujas tags batem com o assunto
  return (good.length >= 2 ? good : scored).map((x) => x.p);
}
