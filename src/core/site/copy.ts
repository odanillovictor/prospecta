// Quebra de objeção por segmento: as dúvidas que mais travam a decisão, respondidas em linguagem simples.
// Sem promessa de resultado, prazo ou preço: só o que o atendimento combina antes de começar.
import type { ServiceItem } from './packs';

const GENERIC: ServiceItem[] = [
  { title: 'Vai ficar caro?', text: 'Conte o que você precisa e receba a orientação de valores antes de decidir. Sem compromisso.' },
  { title: 'Não sei bem o que preciso', text: 'Tudo bem. Explique a situação e a gente indica o melhor caminho, em linguagem simples.' },
  { title: 'Não tenho tempo', text: 'A conversa começa pelo WhatsApp, no seu horário. Combinamos o resto sem perder o seu dia.' },
];

const BY_SEGMENT: Record<string, ServiceItem[]> = {
  odonto: [
    { title: 'Tenho medo de dentista', text: 'Avise no primeiro contato. Cada etapa é explicada antes de acontecer, no seu ritmo.' },
    { title: 'Vai ficar caro?', text: 'Você recebe o plano e os valores antes de começar. Nada é feito sem a sua aprovação.' },
    { title: 'Não tenho tempo', text: 'Combine pelo WhatsApp o horário que cabe na sua rotina.' },
  ],
  saude: [
    { title: 'Será que é para o meu caso?', text: 'Descreva o que você sente ou procura. A orientação inicial ajuda a definir o melhor caminho.' },
    { title: 'Vai ficar caro?', text: 'Pergunte pelos valores antes de agendar. Sem compromisso.' },
    { title: 'Não tenho tempo', text: 'Combine o horário pelo WhatsApp, sem fila nem ligação.' },
  ],
  barbearia: [
    { title: 'E se eu não gostar do corte?', text: 'Antes de começar, conversamos sobre o estilo que você quer. Você aprova cada passo.' },
    { title: 'Vou perder tempo esperando?', text: 'Com hora marcada pelo WhatsApp, você chega e é atendido no seu horário.' },
    { title: 'Quanto custa?', text: 'Pergunte pelos valores antes de reservar. Sem surpresa na hora de pagar.' },
  ],
  beleza: [
    { title: 'E se não ficar do jeito que eu quero?', text: 'A conversa vem antes do serviço: você diz o que imaginou e aprova antes de começarmos.' },
    { title: 'Vou perder tempo esperando?', text: 'Com hora marcada pelo WhatsApp, você é atendida no seu horário.' },
    { title: 'Quanto custa?', text: 'Pergunte pelos valores antes de reservar. Sem surpresa na hora de pagar.' },
  ],
  alimentacao: [
    { title: 'Como faço o pedido?', text: 'Pelo WhatsApp, em poucas mensagens. Você escolhe e combina a entrega ou a retirada.' },
    { title: 'Tem opção para o meu gosto?', text: 'Pergunte pelo cardápio do dia e pelas opções disponíveis antes de pedir.' },
    { title: 'Demora?', text: 'Confirme o tempo de preparo no pedido, antes de fechar.' },
  ],
  fitness: [
    { title: 'Nunca treinei, e agora?', text: 'O começo é orientado: você entende o que fazer e evolui no seu ritmo.' },
    { title: 'Será que vou conseguir manter?', text: 'Treino com acompanhamento e objetivo claro ajuda a criar constância.' },
    { title: 'Posso conhecer antes?', text: 'Pergunte pelo WhatsApp sobre aula experimental e horários.' },
  ],
  juridico: [
    { title: 'Será que tenho direito?', text: 'Conte o seu caso. A análise inicial mostra os caminhos possíveis antes de qualquer decisão.' },
    { title: 'Vou entender o processo?', text: 'Você recebe explicações em linguagem simples, sem juridiquês, em cada etapa.' },
    { title: 'Quanto custa?', text: 'Os honorários são combinados antes de começar. Pergunte sem compromisso.' },
  ],
  imobiliario: [
    { title: 'É seguro comprar, vender ou alugar?', text: 'A documentação é conferida e explicada antes de qualquer passo importante.' },
    { title: 'Vai demorar?', text: 'Conte seu objetivo e o prazo que você tem: o plano parte disso.' },
    { title: 'Quanto custa?', text: 'Pergunte pelas condições antes de decidir. Sem compromisso.' },
  ],
  automotivo: [
    { title: 'Vão me cobrar o que eu não pedi?', text: 'O orçamento vem antes e nenhum serviço é feito sem a sua aprovação.' },
    { title: 'Quanto tempo fica parado?', text: 'Você combina o prazo na hora do orçamento, antes de deixar o carro.' },
    { title: 'Não sei qual é o problema', text: 'Descreva o sintoma: o diagnóstico mostra o que realmente precisa ser feito.' },
  ],
  pet: [
    { title: 'Meu pet tem medo, vai ficar bem?', text: 'Avise como ele reage. O atendimento respeita o jeito e o tempo de cada animal.' },
    { title: 'Quanto custa?', text: 'Pergunte pelos valores antes de agendar. Sem surpresa.' },
    { title: 'Preciso agendar?', text: 'Reserve pelo WhatsApp para garantir o seu horário.' },
  ],
  engenharia: [
    { title: 'A obra vai estourar o orçamento?', text: 'Escopo, prazo e valor são combinados por escrito antes de começar.' },
    { title: 'Vou saber o que está acontecendo?', text: 'Cada etapa é explicada e acompanhada, para você decidir com segurança.' },
    { title: 'Não sei por onde começar', text: 'Conte o que pretende construir, reformar ou regularizar: indicamos o primeiro passo.' },
  ],
};

export function objectionsFor(packId: string): ServiceItem[] {
  return BY_SEGMENT[packId] ?? GENERIC;
}
