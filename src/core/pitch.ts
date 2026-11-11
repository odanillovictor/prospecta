// Geração determinística de abordagens comerciais (sem IA, sem custo de tokens).
// Baseada SOMENTE em sinais confirmados ou inferidos; nunca promete resultado.
import type { Lead, ScoreResult, SignalId } from './types';
import { domainOf } from './normalize';
import { hasOwnSite } from './scoring';

export interface SellerProfile {
  name: string;
  company: string;
}

export interface Pitch {
  headline: string;
  mainArgument: string;
  whatsappMessage: string;
  callScript: string[];
  nextAction: string;
  secondary: string[];
  basedOn: string[];
}

function audienceWord(niche: string): string {
  const n = niche.toLowerCase();
  if (/dent|odonto|clinic|clínic|médic|medic|psic|fisio|nutri|estétic|estetic|derma|ortop|pediat|veterin/.test(n)) return 'pacientes';
  if (/academia|escola|curso|idioma|auto ?escola|pilates|crossfit|dança|danca|música|musica/.test(n)) return 'alunos';
  if (/restaurante|pizzaria|lanchonete|hamburg|bar|café|cafe|padaria|doceria|confeitaria|delivery/.test(n)) return 'clientes que procuram onde comer';
  if (/advoga|contab|contador|consult/.test(n)) return 'clientes que buscam um especialista';
  if (/imobili|corretor/.test(n)) return 'compradores e inquilinos';
  return 'clientes';
}

const PROBLEM_PHRASE: Partial<Record<SignalId, string>> = {
  sem_https: 'o navegador mostra o aviso de "não seguro"',
  nao_responsivo: 'no celular a página não se ajusta à tela',
  lento: 'a página demora para abrir',
  seo_basico: 'faltam informações básicas para o Google entender a página',
  sem_cta: 'não há um botão claro para pedir orçamento ou agendar',
  contato_escondido: 'o contato fica difícil de achar',
  sem_whatsapp_site: 'não tem botão de WhatsApp',
  desatualizado: 'o visual sugere um site antigo',
  oferta_confusa: 'nos primeiros segundos não fica claro o que vocês oferecem',
};

const SECONDARY: Partial<Record<SignalId, string>> = {
  baixa_presenca: 'Otimização do Perfil da Empresa no Google (poucas avaliações)',
  seo_basico: 'SEO local (title, description, dados estruturados)',
  sem_cta: 'Landing page focada em orçamento/agendamento',
  oferta_confusa: 'Melhorias de conversão na página principal',
  boa_reputacao: 'Artes para redes sociais destacando as avaliações',
};

export function buildPitch(lead: Lead, score: ScoreResult, seller: SellerProfile): Pitch {
  const yes = new Set(score.signals.filter((s) => s.state === 'sim').map((s) => s.id));
  const own = hasOwnSite(lead);
  const place = lead.neighborhood || lead.city || 'sua região';
  const niche = lead.niche || lead.category || 'seu segmento';
  const who = seller.name?.trim() || '[seu nome]';
  const from = seller.company?.trim() ? ` da ${seller.company.trim()}` : '';
  const audience = audienceWord(niche);
  const goodRep = yes.has('boa_reputacao') && lead.rating != null && lead.reviewCount != null;
  const basedOn = score.signals.filter((s) => s.state === 'sim' && s.points > 0).map((s) => s.label);

  const problems = (Object.keys(PROBLEM_PHRASE) as SignalId[])
    .filter((id) => yes.has(id))
    .sort((a, b) => (score.signals.find((s) => s.id === b)?.weight ?? 0) - (score.signals.find((s) => s.id === a)?.weight ?? 0))
    .slice(0, 2)
    .map((id) => PROBLEM_PHRASE[id]!);

  let headline: string;
  let mainArgument: string;
  let whatsappMessage: string;
  let callScript: string[];
  let nextAction: string;

  if (!own) {
    headline = 'Criar o primeiro site';
    mainArgument =
      `Quem procura ${niche} em ${place} no Google encontra concorrentes com site; ${lead.name} não aparece com uma página própria. ` +
      `Um site simples, com WhatsApp e localização, ajuda ${audience} a escolherem vocês com mais confiança.` +
      (goodRep ? ' A boa reputação já existe — falta um lugar para mostrá-la.' : '');
    whatsappMessage =
      `Olá, tudo bem? Aqui é ${who}${from}, eu crio sites para empresas. ` +
      `Vi que a ${lead.name} ainda não tem um site próprio e preparei um pensado para vocês. ` +
      'Quando podemos marcar uma conversa rápida para eu te mostrar e explicar como ele pode ajudar? Sem compromisso.';
    callScript = [
      `Apresente-se: "${who}${from}, eu crio sites para empresas."`,
      goodRep ? `Elogio concreto: nota ${lead.rating!.toFixed(1)} com ${lead.reviewCount} avaliações.` : 'Mostre que pesquisou: cite o serviço principal da empresa.',
      `Fato: "Vi que vocês ainda não têm um site próprio e preparei um para vocês."`,
      `Pergunta aberta: "Hoje, como os novos ${audience} chegam até vocês?"`,
      'Proposta: reunião de 15 min para mostrar o site pronto, sem compromisso.',
      'Se pedirem preço: dê uma faixa e explique o que está incluso; não pressione.',
    ];
    nextAction = lead.phone || lead.whatsapp ? 'Construir o site e enviar a mensagem de abertura' : 'Encontrar um telefone (Google/Instagram) antes de abordar';
  } else {
    const domain = domainOf(lead.website) ?? lead.website;
    headline = problems.length ? 'Melhorar o site atual' : 'Avaliar site atual';
    mainArgument = problems.length
      ? `O site ${domain} existe, mas ${problems.join(' e ')}. São pontos que costumam afastar quem chega pelo celular. ` +
        'A proposta é corrigir o essencial primeiro, com foco em contato e orçamento.'
      : `O site ${domain} não mostrou problemas técnicos óbvios na verificação automática. ` +
        'Valide manualmente a experiência no celular e a clareza da oferta antes de abordar.';
    whatsappMessage =
      `Olá, tudo bem? Aqui é ${who}${from}, eu crio e melhoro sites para empresas. ` +
      (problems.length
        ? `Analisei o site da ${lead.name} e encontrei melhorias que podem ajudar no caso de vocês — por exemplo, ${problems[0]}. `
        : `Analisei o site da ${lead.name} e vi pontos que podem trazer mais contatos. `) +
      'Preparei uma nova versão. Quando podemos marcar uma conversa rápida para eu te mostrar e comparar com o site atual? Sem compromisso.';
    callScript = [
      `Apresente-se: "${who}${from}, eu crio e melhoro sites para empresas."`,
      problems.length ? `Cite 1 melhoria concreta: "${problems[0]}".` : 'Pergunte se o site traz pedidos hoje.',
      'Pergunte quem cuida do site hoje e se está satisfeito.',
      'Diga que preparou uma nova versão e quer mostrar lado a lado com a atual.',
      'Proponha uma reunião de 15 min, sem compromisso.',
    ];
    nextAction = problems.length ? 'Construir a nova versão e marcar a apresentação' : 'Validar manualmente o site no celular';
  }

  const secondary = (Object.keys(SECONDARY) as SignalId[])
    .filter((id) => yes.has(id))
    .map((id) => SECONDARY[id]!)
    .slice(0, 2);
  if (own && !secondary.length) secondary.push('Manutenção mensal do site');

  return { headline, mainArgument, whatsappMessage, callScript, nextAction, secondary, basedOn };
}
