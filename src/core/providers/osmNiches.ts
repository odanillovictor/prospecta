// Tradução de nichos em português para tags do OpenStreetMap.
// Nichos fora da lista ainda funcionam via busca pelo nome (regex), com cobertura menor.
import { normText } from '../normalize';

export type OsmTag = [key: string, value: string];

const TABLE: Array<{ terms: string[]; tags: OsmTag[] }> = [
  { terms: ['dentista', 'odontologia', 'odontologica', 'odonto', 'clinica odontologica'], tags: [['amenity', 'dentist'], ['healthcare', 'dentist']] },
  { terms: ['restaurante', 'restaurantes'], tags: [['amenity', 'restaurant']] },
  { terms: ['pizzaria', 'pizza'], tags: [['cuisine', 'pizza']] },
  { terms: ['lanchonete', 'hamburgueria', 'hamburguer', 'fast food'], tags: [['amenity', 'fast_food']] },
  { terms: ['cafe', 'cafeteria'], tags: [['amenity', 'cafe']] },
  { terms: ['bar', 'bares', 'pub'], tags: [['amenity', 'bar'], ['amenity', 'pub']] },
  { terms: ['padaria', 'panificadora', 'confeitaria'], tags: [['shop', 'bakery'], ['shop', 'pastry']] },
  { terms: ['academia', 'crossfit', 'pilates'], tags: [['leisure', 'fitness_centre'], ['leisure', 'sports_centre']] },
  { terms: ['salao de beleza', 'cabeleireiro', 'salao', 'cabeleireira'], tags: [['shop', 'hairdresser'], ['shop', 'beauty']] },
  { terms: ['barbearia', 'barbeiro'], tags: [['shop', 'hairdresser']] },
  { terms: ['estetica', 'clinica de estetica', 'manicure', 'depilacao'], tags: [['shop', 'beauty'], ['shop', 'cosmetics']] },
  { terms: ['pet shop', 'petshop', 'banho e tosa'], tags: [['shop', 'pet'], ['shop', 'pet_grooming']] },
  { terms: ['veterinario', 'veterinaria', 'clinica veterinaria'], tags: [['amenity', 'veterinary']] },
  { terms: ['advogado', 'advocacia', 'escritorio de advocacia'], tags: [['office', 'lawyer']] },
  { terms: ['contador', 'contabilidade', 'escritorio de contabilidade'], tags: [['office', 'accountant'], ['office', 'tax_advisor']] },
  { terms: ['imobiliaria', 'corretor', 'corretor de imoveis', 'corretora'], tags: [['office', 'estate_agent']] },
  { terms: ['arquiteto', 'arquitetura'], tags: [['office', 'architect']] },
  { terms: ['oficina', 'oficina mecanica', 'mecanica', 'mecanico', 'auto center'], tags: [['shop', 'car_repair']] },
  { terms: ['autoescola', 'auto escola', 'cfc'], tags: [['amenity', 'driving_school']] },
  { terms: ['clinica', 'clinica medica', 'consultorio', 'medico'], tags: [['amenity', 'clinic'], ['amenity', 'doctors'], ['healthcare', 'clinic']] },
  { terms: ['fisioterapia', 'fisioterapeuta'], tags: [['healthcare', 'physiotherapist']] },
  { terms: ['psicologo', 'psicologia', 'terapeuta'], tags: [['healthcare', 'psychotherapist']] },
  { terms: ['farmacia', 'drogaria'], tags: [['amenity', 'pharmacy']] },
  { terms: ['otica'], tags: [['shop', 'optician']] },
  { terms: ['floricultura', 'flores'], tags: [['shop', 'florist']] },
  { terms: ['hotel', 'pousada', 'hostel'], tags: [['tourism', 'hotel'], ['tourism', 'guest_house'], ['tourism', 'hostel']] },
  { terms: ['mercado', 'supermercado', 'mercearia'], tags: [['shop', 'supermarket'], ['shop', 'convenience']] },
  { terms: ['material de construcao', 'materiais de construcao', 'ferragens'], tags: [['shop', 'hardware'], ['shop', 'doityourself']] },
  { terms: ['loja de roupas', 'roupas', 'moda', 'boutique'], tags: [['shop', 'clothes'], ['shop', 'boutique']] },
  { terms: ['escola', 'colegio'], tags: [['amenity', 'school']] },
  { terms: ['escola de idiomas', 'curso de ingles', 'idiomas'], tags: [['amenity', 'language_school']] },
  { terms: ['lavanderia'], tags: [['shop', 'laundry'], ['shop', 'dry_cleaning']] },
  { terms: ['marcenaria', 'moveis planejados', 'marceneiro'], tags: [['craft', 'carpenter'], ['shop', 'furniture']] },
  { terms: ['eletricista'], tags: [['craft', 'electrician']] },
  { terms: ['encanador'], tags: [['craft', 'plumber']] },
  { terms: ['fotografo', 'fotografia'], tags: [['craft', 'photographer'], ['shop', 'photo']] },
  { terms: ['tatuagem', 'tatuador', 'estudio de tatuagem'], tags: [['shop', 'tattoo']] },
  { terms: ['joalheria', 'relojoaria'], tags: [['shop', 'jewelry'], ['shop', 'watches']] },
  { terms: ['sorveteria', 'acai', 'acaiteria'], tags: [['amenity', 'ice_cream']] },
  { terms: ['doceria', 'doces', 'chocolateria'], tags: [['shop', 'confectionery'], ['shop', 'chocolate']] },
  { terms: ['concessionaria', 'loja de carros', 'revenda de carros'], tags: [['shop', 'car']] },
];

export function osmTagsForNiche(niche: string): OsmTag[] {
  const n = normText(niche);
  if (!n) return [];
  const found: OsmTag[] = [];
  for (const row of TABLE) {
    if (row.terms.some((t) => n === t || n.includes(t) || (t.includes(n) && n.length >= 4))) {
      for (const tag of row.tags) if (!found.some((f) => f[0] === tag[0] && f[1] === tag[1])) found.push(tag);
    }
  }
  return found;
}

/** Sanitiza texto para regex do Overpass QL: remove metacaracteres e aspas (evita injeção na query). */
export function overpassRegex(term: string): string {
  return term.replace(/[\\".*+?^${}()|[\]/;]/g, ' ').replace(/\s+/g, ' ').trim();
}
