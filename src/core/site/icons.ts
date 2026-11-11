// Ícones de traço (estilo Lucide: 24×24, traço 1.75, pontas arredondadas), inline e sem dependências.
// Um único estilo para o site inteiro — nada de misturar preenchidos, emojis e ilustrações.

const P: Record<string, string> = {
  tooth: '<path d="M7 3c-2.5 0-4 2-4 4.5 0 2.2 1 3.6 1.6 5.2.7 2 .9 4.3 1.6 6.3.4 1.2 1.9 1.3 2.4.1.6-1.6.8-4.6 3.4-4.6s2.8 3 3.4 4.6c.5 1.2 2 1.1 2.4-.1.7-2 .9-4.3 1.6-6.3.6-1.6 1.6-3 1.6-5.2C21 5 19.5 3 17 3c-2 0-3 1.2-5 1.2S9 3 7 3Z"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  stethoscope: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v2a6 6 0 0 0 12 0v-1"/><circle cx="20" cy="11" r="2"/>',
  heart: '<path d="M20.8 6.6a5 5 0 0 0-8.1-1.4L12 6l-.7-.8a5 5 0 0 0-7.1 7.1L12 20l7.8-7.7a5 5 0 0 0 1-5.7z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  brush: '<path d="M18 2l4 4-9.5 9.5-4-4z"/><path d="M8.5 11.5C5 12 4 14 4 16c0 2-1 3-2 4 3 0 7 0 8.5-2.5 1-1.6.5-3.5-.5-4.5"/>',
  utensils: '<path d="M3 2v7a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V2M6 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  coffee: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  dumbbell: '<path d="M6.5 6.5l11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L2 10l8-8z" transform="scale(.9) translate(1.3 1.3)"/>',
  car: '<path d="M5 17h14M5 17a2 2 0 1 1-4 0v-4l2-5a2 2 0 0 1 2-1.4h14A2 2 0 0 1 21 8l2 5v4a2 2 0 1 1-4 0"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.8 1.2 3.5 3.5 0 0 0-2.5-2.3A3.5 3.5 0 0 1 4 12.7 3.5 3.5 0 0 1 9 10z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  star: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  quote: '<path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
};

export type IconName = keyof typeof P;

export function icon(name: IconName | string, cls = 'ic'): string {
  const body = P[name] ?? P.check;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Ícone mais adequado para um serviço, pelo nome (sem acento). */
const RULES: Array<[RegExp, IconName]> = [
  [/dent|odont|implant|canal|ortodon|alinhador|faceta|clarea|restaura|gengiv|periodont|protese/, 'tooth'],
  [/estetic|sorriso|beleza|harmoniz/, 'sparkles'],
  [/urgenc|emergenc|seguran|garanti/, 'shield'],
  [/consult|avalia|exame|saude|medic|clinic|fisio|psico|nutri|terap/, 'stethoscope'],
  [/infantil|crianc|pediatr|famil|cuidado/, 'heart'],
  [/pet|banho|veterin|cachorr|gato/, 'paw'],
  [/corte|cabelo|barba/, 'scissors'],
  [/unha|manicure|maquiag|sobrancel|cor|tratament/, 'brush'],
  [/cardapio|prato|comida|restaur|refei|pizza|hamburg|delivery|encomend/, 'utensils'],
  [/cafe|bebida|padaria|pao|doce|confeit/, 'coffee'],
  [/treino|muscul|academia|pilates|aula|funcional|crossfit|yoga/, 'dumbbell'],
  [/jurid|direito|advoca|trabalh|previd|consultoria jur/, 'scale'],
  [/contab|fiscal|documento|contrato|escritura/, 'file'],
  [/comprar|vender|alugar|imovel|imoveis|casa|apartament/, 'home'],
  [/avaliacao de imovel|chave/, 'key'],
  [/mecan|revis|freio|suspens|eletric|reparo|manuten|oficina/, 'wrench'],
  [/carro|veicul|auto/, 'car'],
  [/agend|horario|reserva/, 'calendar'],
  [/produto|loja|venda/, 'bag'],
  [/entrega|retirada/, 'truck'],
  [/foto|ensaio/, 'camera'],
  [/empresa|negocio|projeto|arquitet/, 'briefcase'],
];

export function iconFor(title: string): IconName {
  const t = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return RULES.find(([re]) => re.test(t))?.[1] ?? 'check';
}
