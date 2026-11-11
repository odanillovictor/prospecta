// "Cérebro" do robô DENTRO do app: entende a resposta do lead por regras (sem IA, sem custo, sem depender do Claude)
// e monta a próxima mensagem com os dados reais do lead. Não sabe? Passa a bola para você (handoff), nunca inventa.
// Preço, prazo e agenda só saem se VOCÊ preencheu em Robô → Minha proposta.
import type { Lead } from '../types';
import type { SellerProfile } from '../pitch';
import { isOptOut } from './guards';
import { publicPreviewUrl } from './strategy';
import { leadProfile } from './profile';

export type Intent =
  | 'parar'
  | 'preco'
  | 'prazo'
  | 'ja_tem_site'
  | 'nao_tem_site'
  | 'sem_verba'
  | 'depois'
  | 'quem_e'
  | 'como_funciona'
  | 'reuniao'
  | 'quer_ver_aqui'
  | 'interesse'
  | 'cumprimento'
  | 'tecnica'
  | 'desconhecida';

const n = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Ordem importa: o mais específico primeiro.
const RULES: Array<[Intent, RegExp]> = [
  ['prazo', /\b(prazo|quanto tempo|demora|demorado|quando fica pronto|em quantos dias)\b/],
  ['preco', /\b(quanto|valor|valores|preco|precos|custa|custo|orcamento|investimento|mensalidade|pacote|tabela)\b/],
  ['ja_tem_site', /\b(ja tenho (um )?site|tenho site|meu site|temos site|ja temos site|ja possuo|ja tenho pagina)\b/],
  ['sem_verba', /\b(caro|sem dinheiro|sem verba|nao tenho (dinheiro|verba|orcamento)|orcamento (apertado|curto)|nao posso pagar|fora do (meu )?orcamento|crise)\b/],
  ['nao_tem_site', /\b(nao (tenho|temos|possuo)(?! (interesse|tempo|como|nada))|ainda nao|nao existe|nao tem|nenhum)\b|^(nao|n)[ .!]*$/],
  ['depois', /\b(depois|mais pra frente|mais para frente|outro momento|semana que vem|mes que vem|agora nao|no momento nao|mais tarde|em breve|ano que vem)\b/],
  ['quem_e', /\b(quem (e|eh|e voce|esta falando|fala)|de onde|como (conseguiu|pegou|achou|teve)|onde (pegou|conseguiu)|qual (a )?(sua )?empresa|e golpe|e verdade)\b/],
  ['como_funciona', /\b(como funciona|como seria|o que (inclui|vem|esta incluso)|explica|me explica|detalhes|como (e|eh) feito|funciona como)\b/],
  ['quer_ver_aqui', /\b(pode (mandar|enviar)|manda(r)?( ai| aqui| por aqui| pelo zap| o link| a previa)?|me (manda|envia|mostra|passa)|por aqui|aqui mesmo|pelo (zap|whatsapp)|quero ver|queria ver|vamos ver|mostra|envia|me envie|me mande)\b/],
  ['reuniao', /\b(reuniao|call|ligar|ligacao|me liga|conversar|conversa rapida|horario|amanha|hoje a tarde|chamada|video|videochamada|agenda|agendar|marcar)\b/],
  ['tecnica', /\b(hospedagem|dominio|seo|google meu negocio|wordpress|loja virtual|e-commerce|ecommerce|trafego|anuncio|app|aplicativo|sistema|integracao)\b/],
  ['interesse', /\b(quero|tenho interesse|interessante|pode ser|vamos|bora|claro|sim|ok|beleza|show|legal|gostei|topo|combinado|pode)\b/],
  ['cumprimento', /^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|tudo bem|oie)\b/],
];

export function classifyIntent(text: string): Intent {
  if (isOptOut(text)) return 'parar';
  const t = n(text).trim();
  if (!t) return 'desconhecida';
  for (const [intent, re] of RULES) if (re.test(t)) return intent;
  return 'desconhecida';
}

export interface Proposal {
  /** O que o site inclui (1–2 frases). */
  offerText: string;
  /** Preço ou faixa. Vazio = o robô NÃO fala de preço (passa para você). */
  priceText: string;
  /** Como marcar uma conversa (horários, link da agenda, WhatsApp de voz…). Vazio = passa para você. */
  meetingText: string;
}

export type Reply =
  | { action: 'send'; text: string; intent: Intent; note: string; needsPreview?: boolean }
  | { action: 'handoff'; intent: Intent; note: string }
  | { action: 'stop'; intent: Intent; note: string };

const company = (lead: Lead) => lead.name.replace(/^\[DEMO\]\s*/, '').split(/\s[|\-–]\s/)[0].trim();

/** Resposta pronta para a última mensagem do lead (ou handoff). */
export function replyFor(lead: Lead, lastInbound: string, seller: SellerProfile, proposal: Proposal): Reply {
  const intent = classifyIntent(lastInbound);
  const nome = company(lead);
  const preview = publicPreviewUrl(lead);
  const verPrevia = preview ? `Aqui está a prévia: ${preview}` : 'Vou montar a prévia e já te envio por aqui.';
  const meeting = proposal.meetingText.trim();
  const eu = seller.name ? `${seller.name}${seller.company ? `, da ${seller.company}` : ''}` : 'um criador de sites';

  switch (intent) {
    case 'parar':
      return { action: 'stop', intent, note: 'Pediu para parar.' };
    case 'cumprimento':
      return { action: 'send', intent, note: 'Cumprimento', text: `Olá! Tudo bem? Sobre a minha mensagem: preparei uma ideia de site para a ${nome}. ${verPrevia} Se fizer sentido, me diga o que achou.` };
    case 'quer_ver_aqui':
      return preview
        ? { action: 'send', intent, note: 'Quer ver por mensagem', text: `Claro! ${verPrevia} Dá uma olhada com calma e me diga o que achou, posso ajustar o que você quiser.${meeting ? `\n\nE se preferir conversar sobre ele: ${meeting}` : ''}` }
        : { action: 'send', intent, needsPreview: true, note: 'Quer ver por mensagem: falta gerar a prévia', text: 'Claro! Vou montar a prévia do site e já te envio por aqui. Dá só um instante.' };
    case 'interesse':
      return { action: 'send', intent, note: 'Interesse: perguntar a preferência', text: `Que bom! Prefere que eu te mostre numa conversa rápida (uns 15 minutos) ou que eu te envie a prévia por aqui para você ver com calma?${meeting ? `\n\n${meeting}` : ''}` };
    case 'quem_e':
      return { action: 'send', intent, note: 'Quem é você', text: `Sou ${eu}. Faço sites para negócios locais e vi o perfil da ${nome} no Google, por isso preparei uma ideia. Não quero incomodar: se preferir que eu pare, é só avisar.` };
    case 'como_funciona':
      return { action: 'send', intent, note: 'Como funciona', text: `${proposal.offerText.trim() || `Eu monto o site com a identidade da ${nome} (logo, cores, fotos e serviços), você aprova a prévia e depois publicamos.`} ${preview ? `Dá para ver a prévia aqui: ${preview}` : 'Quer ver uma prévia?'}` };
    case 'nao_tem_site': {
      // Momento 2: o pitch do Danillo, com o protótipo já pronto (sem compromisso) e convite para uma conversa.
      const base = `Opa, tudo bem? Aqui é ${eu}. Pesquisei no Google e encontrei o perfil da ${nome} no Google Meu Negócio, e percebi que não tem o botão de site ali. Ele ajuda as pessoas a entrarem em contato já sabendo o que você faz, e dá mais relevância para a ${nome} nas buscas do Google. Por isso tomei a liberdade de criar um protótipo de site para vocês, sem compromisso.`;
      const fim = `Se tiver interesse, podemos marcar uma conversa rápida para eu te apresentar e deixar o site ligado ao seu perfil do Google.${meeting ? ` ${meeting}` : ' Teria interesse?'}`;
      return preview
        ? { action: 'send', intent, note: 'Não tem site: pitch com o protótipo', text: `${base} Te mandei uma ideia aqui: ${preview}

${fim}` }
        : { action: 'send', intent, needsPreview: true, note: 'Não tem site: pitch (falta gerar a prévia pública)', text: `${base} Já te mando a ideia por aqui.

${fim}` };
    }
    case 'ja_tem_site': {
      const pf = leadProfile(lead);
      // Não achamos site no Google: pede o endereço em vez de insistir que não existe.
      if (pf.kind === 'sem_site' || pf.kind === 'rede_social')
        return { action: 'send', intent, note: 'Diz que já tem site (não achamos no Google)', text: `Entendi! Não encontrei o site no perfil de vocês no Google. Pode me passar o endereço? Se ele não aparece lá, também vale ligar o site ao perfil para as pessoas acharem.` };
      return { action: 'send', intent, note: 'Já tem site', text: `Entendi! Olhei o site de vocês${pf.problems[0] ? ` e vi um ponto que pode estar custando clientes: ${pf.problems[0]}` : ' e acho que dá para deixá-lo mais atual e personalizado'}. Posso te mostrar como ficaria uma versão melhorada, sem compromisso?` };
    }
    case 'sem_verba':
      return { action: 'send', intent, note: 'Objeção de preço', text: `Entendo. A ideia é justamente o site ajudar a trazer mais contatos para a ${nome}. Posso te mostrar a prévia antes de falarmos em valores? Se não fizer sentido, sem problema.` };
    case 'depois':
      return { action: 'send', intent, note: 'Pediu para depois', text: 'Combinado! Fico por aqui e, se fizer sentido mais adiante, é só me chamar. Sucesso!' };
    case 'preco':
      if (proposal.priceText.trim()) return { action: 'send', intent, note: 'Preço (sua proposta)', text: `${proposal.priceText.trim()} Posso te explicar o que está incluso?` };
      return { action: 'handoff', intent, note: 'Perguntou preço: você responde (preencha "Minha proposta" para o robô responder).' };
    case 'prazo':
      return { action: 'send', intent, note: 'Prazo', text: `O prazo depende do que você precisa, mas como já deixei uma base pronta para a ${nome}, costuma ser rápido. Posso te explicar as etapas?` };
    case 'reuniao':
      if (meeting) return { action: 'send', intent, note: 'Reunião (sua agenda)', text: `Perfeito! ${meeting}` };
      return { action: 'handoff', intent, note: 'Pediu conversa/horário: você responde (preencha "Minha proposta" → como marcar).' };
    case 'tecnica':
      return { action: 'handoff', intent, note: 'Pergunta técnica: melhor você responder.' };
    default:
      return { action: 'handoff', intent, note: 'Não entendi a resposta: você assume.' };
  }
}
