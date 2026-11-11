// Liga cada problema encontrado ao recurso do novo site que o resolve.
// Alimenta o comparativo "hoje × novo site" usado na reunião com o cliente.
import type { Lead } from '../types';
import { hasOwnSite } from '../scoring';
import { domainOf } from '../normalize';

export interface Improvement {
  id: string;
  today: string;
  newSite: string;
  origin: 'automatico' | 'inferido' | 'dados';
}

const BY_CHECK: Record<string, { newSite: string }> = {
  https: { newSite: 'Publicado com HTTPS (cadeado) em hospedagem moderna.' },
  status: { newSite: 'Site estático e estável, sem servidor para cair.' },
  viewport: { newSite: 'Layout feito primeiro para o celular, com textos e botões no tamanho certo.' },
  velocidade: { newSite: 'Página única e leve, sem plugins: abre rápido mesmo no 4G.' },
  title: { newSite: 'Título com nome, serviço e cidade — do jeito que o Google lê.' },
  description: { newSite: 'Descrição escrita para o resultado do Google.' },
  headings: { newSite: 'Um título principal claro e seções bem organizadas.' },
  whatsapp: { newSite: 'Botão de WhatsApp fixo na tela e mensagem já preenchida.' },
  contato: { newSite: 'Telefone e WhatsApp no topo e no rodapé, a um toque.' },
  formulario: { newSite: 'Formulário de contato que abre o WhatsApp com a mensagem pronta.' },
  seo_local: { newSite: 'Dados estruturados de negócio local (endereço, telefone, avaliações).' },
  cta: { newSite: 'Chamada para ação clara no topo e ao fim de cada seção.' },
  oferta: { newSite: 'Primeira tela diz o que vocês fazem e como contratar.' },
  prova_social: { newSite: 'Seção de avaliações com a nota real do Google.' },
  info_local: { newSite: 'Mapa, endereço e link "como chegar".' },
  desatualizado: { newSite: 'Visual atual, com animações leves e identidade consistente.' },
};

export function improvementsFor(lead: Lead): Improvement[] {
  if (!hasOwnSite(lead)) {
    const list: Improvement[] = [
      { id: 'presenca', today: 'Sem site próprio: quem pesquisa encontra só o perfil no mapa (ou um concorrente).', newSite: 'Página própria com nome, serviços e cidade, encontrável no Google.', origin: 'dados' },
      { id: 'contato', today: 'Para falar com vocês, o cliente precisa procurar o número.', newSite: 'WhatsApp e telefone a um toque, com mensagem pronta.', origin: 'dados' },
      { id: 'oferta', today: 'Não há um lugar que explique os serviços e como contratar.', newSite: 'Serviços, etapas do atendimento e perguntas frequentes em uma página.', origin: 'dados' },
    ];
    if (lead.reviewCount) list.push({ id: 'prova', today: `As ${lead.reviewCount} avaliações ficam escondidas no Google.`, newSite: 'A nota real aparece em destaque, com link para as avaliações.', origin: 'dados' });
    if (lead.website) list.unshift({ id: 'rede', today: `Único link é ${domainOf(lead.website)} (rede social), que não aparece bem no Google e depende da plataforma.`, newSite: 'Endereço próprio, que é de vocês.', origin: 'dados' });
    return list;
  }
  const d = lead.diagnosis;
  if (!d?.ok) {
    return [{ id: 'sem_diag', today: d ? `Não foi possível acessar ${domainOf(lead.website)} (${d.error}).` : 'Site atual ainda não diagnosticado.', newSite: 'Rode o diagnóstico para montar o comparativo com fatos.', origin: 'dados' }];
  }
  return d.checks
    .filter((c) => (c.result === 'problema' || c.result === 'atencao') && BY_CHECK[c.id] && c.origin !== 'manual')
    .sort((a, b) => a.priority - b.priority)
    .map((c) => ({ id: c.id, today: `${c.label}: ${c.detail}`, newSite: BY_CHECK[c.id].newSite, origin: c.origin === 'automatico' ? 'automatico' : 'inferido' }));
}
