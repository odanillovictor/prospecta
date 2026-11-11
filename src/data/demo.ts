// Dados FICTÍCIOS para conhecer a interface. Sempre marcados com isDemo=true e provider "demo";
// nunca são fundidos com dados reais nem enviados ao vault-sites.
import type { Lead, RawBusiness, SiteFacts } from '../core/types';
import { leadFromRaw } from '../core/dedupe';
import { diagnosisFromFacts } from '../core/diagnosis';

const now = new Date().toISOString();
const src = (id: string): RawBusiness['source'] => ({ provider: 'demo', externalId: id, collectedAt: now, query: 'demonstração' });

const RAW: Array<RawBusiness & { niche: string }> = [
  { niche: 'dentista', name: '[DEMO] Sorriso Vivo Odontologia', category: 'Dentista', phone: '5541990000001', city: 'Curitiba', neighborhood: 'Água Verde', state: 'PR', rating: 4.8, reviewCount: 132, source: src('d1') },
  { niche: 'dentista', name: '[DEMO] Clínica Dental Centro', category: 'Dentista', phone: '5541330000002', website: 'http://clinicadentalcentro.example', city: 'Curitiba', neighborhood: 'Centro', state: 'PR', rating: 4.1, reviewCount: 9, source: src('d2') },
  { niche: 'restaurante', name: '[DEMO] Cantina da Nonna', category: 'Restaurante italiano', phone: '5541990000003', whatsapp: '5541990000003', city: 'Curitiba', neighborhood: 'Santa Felicidade', state: 'PR', rating: 4.6, reviewCount: 410, source: src('d3') },
  { niche: 'corretor de imóveis', name: '[DEMO] Elias Corretor de Imóveis', category: 'Corretor', phone: '5542990000004', city: 'Telêmaco Borba', state: 'PR', rating: 5, reviewCount: 18, source: src('d4') },
  { niche: 'academia', name: '[DEMO] Academia Força Total', category: 'Academia', phone: '5541990000005', website: 'https://instagram.com/forcatotal.example', city: 'Curitiba', neighborhood: 'Portão', state: 'PR', source: src('d5') },
  { niche: 'pet shop', name: '[DEMO] Pet Feliz Banho e Tosa', category: 'Pet shop', city: 'Curitiba', neighborhood: 'Boqueirão', state: 'PR', rating: 4.4, reviewCount: 57, source: src('d6') },
  { niche: 'advogado', name: '[DEMO] Moraes & Lima Advocacia', category: 'Advogado', phone: '5541330000007', website: 'https://moraeslima.example', city: 'Curitiba', neighborhood: 'Batel', state: 'PR', rating: 4.9, reviewCount: 33, source: src('d7') },
];

const BASE_FACTS: Omit<SiteFacts, 'requestedUrl' | 'finalUrl'> = {
  httpStatus: 200, https: false, redirects: 0, responseMs: 3400, htmlBytes: 420_000, truncated: false,
  title: 'Home', metaDescription: undefined, hasViewport: false, lang: 'pt-br', h1: [], h2Count: 2,
  hasTelLink: false, hasWhatsAppLink: false, hasMailto: true, formCount: 0, ctaKeywords: [], socialProofKeywords: [],
  localInfoKeywords: ['endereço'], phonesInText: 1, copyrightYear: 2016, generator: undefined, hasSchemaLocalBusiness: false,
  hasOpenGraph: false, imgCount: 14, imgWithoutAlt: 12, usesTablesForLayout: true, usesFlash: false, pagespeed: undefined,
};

export function buildDemoLeads(): Lead[] {
  return RAW.map(({ niche, ...raw }) => {
    const lead = leadFromRaw(raw, niche);
    if (raw.website === 'http://clinicadentalcentro.example') {
      lead.diagnosis = diagnosisFromFacts({ ...BASE_FACTS, requestedUrl: raw.website, finalUrl: raw.website + '/' });
    }
    if (raw.website === 'https://moraeslima.example') {
      lead.diagnosis = diagnosisFromFacts({
        ...BASE_FACTS, requestedUrl: raw.website, finalUrl: raw.website + '/', https: true, responseMs: 640, hasViewport: true,
        title: 'Moraes & Lima Advocacia | Direito Empresarial em Curitiba', metaDescription: 'Escritório de advocacia empresarial no Batel, Curitiba.',
        h1: ['Advocacia empresarial em Curitiba'], hasTelLink: true, formCount: 1, ctaKeywords: ['fale conosco', 'agende'],
        socialProofKeywords: ['anos de experiência'], localInfoKeywords: ['endereço', 'como chegar'], copyrightYear: new Date().getFullYear(),
        usesTablesForLayout: false, imgWithoutAlt: 1,
      });
      lead.status = 'contatado';
      lead.lastContactAt = now;
      lead.nextAction = 'Retornar com diagnóstico';
    }
    return lead;
  });
}
