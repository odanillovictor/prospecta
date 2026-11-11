// Conteúdo base por segmento para o gerador de sites. É a "inteligência arquivada": regras e textos
// escritos uma vez, reaproveitados sem IA. Regra de ouro: nada de fatos inventados (anos de mercado,
// número de clientes, depoimentos). Números só aparecem quando vêm dos dados reais do lead.
import { normText } from '../normalize';

export interface ServiceItem {
  title: string;
  text: string;
  /** Preço publicado pelo negócio (catálogo do WhatsApp). Nunca inventado. */
  price?: string;
}

export interface SegmentPack {
  id: string;
  label: string;
  /** Termos (sem acento) que identificam o segmento no nicho/categoria. */
  match: string[];
  audience: string;
  headline: string; // {nome}, {local}
  subheadline: string;
  /** Frase sob "O que fazemos": o que o negócio entrega e como. */
  servicesLead: string;
  /** Chamada final (antes do rodapé): convite, não o nome do botão. */
  closing: string;
  ctaPrimary: string;
  ctaMessage: string; // mensagem pré-preenchida do WhatsApp do site
  services: ServiceItem[];
  steps: ServiceItem[];
  about: string;
  /** "Quem somos": {nome} e {local}. Completado no gerador com dados reais (nota, especialidades). */
  whoWeAre: string;
  /** Para quem é / para quem não é: deixa claro o perfil de cliente certo (copy honesta, sem promessas). */
  forWho: string[];
  notFor: string[];
  faq: Array<{ q: string; a: string }>;
  theme: string;
}

const COMMON_FAQ = [
  { q: 'Como faço para agendar?', a: 'Chame no WhatsApp ou ligue. Respondemos o mais rápido possível e combinamos o melhor horário para você.' },
  { q: 'Onde vocês ficam?', a: 'O endereço completo e o mapa estão logo abaixo, na seção de localização.' },
];

export const PACKS: SegmentPack[] = [
  {
    id: 'odonto',
    label: 'Odontologia',
    match: ['dent', 'odonto', 'ortodon', 'implante'],
    audience: 'pacientes',
    headline: 'Cuidado com o seu sorriso, do primeiro atendimento ao resultado.',
    subheadline: 'Clínica odontológica para famílias e adultos: prevenção, estética, ortodontia e implantes, com avaliação clara antes de começar.',
    servicesLead: 'Do cuidado de rotina aos tratamentos mais complexos, com plano e valores combinados antes de começar.',

    closing: 'Pronto para cuidar do seu sorriso?',
    ctaPrimary: 'Agendar avaliação',
    ctaMessage: 'Olá! Vim pelo site e gostaria de agendar uma avaliação.',
    services: [
      { title: 'Avaliação e prevenção', text: 'Consulta completa, limpeza e orientação para manter a saúde bucal em dia.' },
      { title: 'Restaurações', text: 'Tratamento de cáries e reparos com materiais da cor do dente.' },
      { title: 'Estética do sorriso', text: 'Clareamento e ajustes estéticos planejados com você.' },
      { title: 'Ortodontia', text: 'Alinhamento dos dentes com acompanhamento periódico.' },
      { title: 'Implantes e próteses', text: 'Reabilitação para devolver função e confiança ao sorrir.' },
      { title: 'Urgências', text: 'Dor ou imprevisto? Fale com a gente para orientação e encaixe.' },
    ],
    steps: [
      { title: 'Conversa inicial', text: 'Você conta o que precisa pelo WhatsApp ou telefone.' },
      { title: 'Avaliação', text: 'Exame clínico e explicação das opções, sem pressa.' },
      { title: 'Plano de tratamento', text: 'Etapas, prazos e valores claros antes de começar.' },
    ],
    about: 'Acreditamos que um bom tratamento começa por ouvir o paciente. Por isso explicamos cada etapa e respeitamos o seu tempo.',
    whoWeAre: '{nome} é uma clínica odontológica que trata cada paciente com escuta, explicação e acompanhamento. O objetivo é simples: você entender o que será feito e por quê, e decidir com tranquilidade.',
    forWho: ["Quem quer entender o tratamento antes de começar", "Quem está há tempo sem ir ao dentista e quer recomeçar com calma", "Famílias que buscam um consultório de confiança perto de casa", "Quem quer cuidar da estética do sorriso com segurança"],
    notFor: ["Quem procura resultado milagroso em uma única sessão", "Quem quer escolher o tratamento só pelo preço, sem avaliação", "Quem não pode voltar para as consultas de acompanhamento"],
    faq: [{ q: 'A primeira consulta é uma avaliação?', a: 'Sim. Na avaliação entendemos o seu caso e apresentamos as opções de tratamento.' }, ...COMMON_FAQ],
    theme: 'clinico',
  },
  {
    id: 'saude',
    label: 'Saúde',
    match: ['clinic', 'medic', 'consultorio', 'fisio', 'psicolog', 'nutri', 'terapeut', 'fonoaud', 'saude', 'doctors', 'physiotherapist', 'psychotherapist'],
    audience: 'pacientes',
    headline: 'Atendimento atento, perto de você.',
    subheadline: 'Atendimento individual com escuta, orientação clara e acompanhamento ao longo do tratamento.',
    servicesLead: 'Consultas e acompanhamento pensados para o seu caso, sem pressa e com orientação clara.',

    closing: 'Vamos cuidar de você?',
    ctaPrimary: 'Agendar consulta',
    ctaMessage: 'Olá! Vim pelo site e gostaria de agendar uma consulta.',
    services: [
      { title: 'Consultas', text: 'Atendimento individual, com tempo para entender o seu caso.' },
      { title: 'Avaliação inicial', text: 'Levantamento completo para definir o melhor caminho.' },
      { title: 'Acompanhamento', text: 'Retornos planejados para acompanhar a evolução.' },
      { title: 'Orientação', text: 'Explicações claras sobre cada etapa do cuidado.' },
    ],
    steps: [
      { title: 'Contato', text: 'Chame no WhatsApp e escolha o melhor horário.' },
      { title: 'Consulta', text: 'Escuta, avaliação e definição do plano.' },
      { title: 'Acompanhamento', text: 'Retornos para ajustar o que for preciso.' },
    ],
    about: 'Nosso trabalho é baseado em escuta e acompanhamento próximo, com um atendimento que respeita a sua história.',
    whoWeAre: '{nome} oferece atendimento em saúde com escuta atenta e acompanhamento de cada etapa. Você sai da consulta sabendo o que foi avaliado, o que fazer e quando voltar.',
    forWho: ["Quem quer ser ouvido com atenção na consulta", "Quem busca acompanhamento contínuo, não só uma consulta", "Quem prefere ser atendido perto de casa", "Quem quer orientações claras para seguir no dia a dia"],
    notFor: ["Quem procura resultado imediato sem acompanhamento", "Quem não pretende seguir as orientações combinadas", "Emergências: nesses casos, procure um pronto-socorro"],
    faq: COMMON_FAQ,
    theme: 'clinico',
  },
  {
    id: 'barbearia',
    label: 'Barbearia',
    match: ['barbear', 'barber'],
    audience: 'clientes',
    headline: 'Corte de verdade, no seu horário.',
    subheadline: 'Corte, barba e cuidados masculinos com hora marcada e atenção ao que você pediu.',
    servicesLead: 'Serviços feitos com capricho, conversando antes para chegar ao estilo que você quer.',
    closing: 'Vamos marcar o seu horário?',
    ctaPrimary: 'Reservar horário',
    ctaMessage: 'Olá! Vim pelo site e quero reservar um horário.',
    services: [
      { title: 'Corte masculino', text: 'Corte pensado para o seu estilo e a sua rotina.' },
      { title: 'Barba', text: 'Modelagem e acabamento com toalha quente e navalha.' },
      { title: 'Corte e barba', text: 'Os dois no mesmo horário, saindo pronto.' },
      { title: 'Acabamento e pezinho', text: 'Detalhe que mantém o corte em dia entre uma visita e outra.' },
      { title: 'Sobrancelha', text: 'Design discreto que valoriza o rosto.' },
    ],
    steps: [
      { title: 'Escolha o serviço', text: 'Veja as opções e chame no WhatsApp.' },
      { title: 'Reserve', text: 'Combinamos dia e horário que funcionam para você.' },
      { title: 'Aproveite', text: 'Chegue, relaxe e saia do jeito que queria.' },
    ],
    about: 'Cada atendimento começa com uma conversa: entendemos o estilo que você quer antes de começar.',
    whoWeAre: '{nome} é uma barbearia onde cada atendimento começa entendendo o que você quer. Hora marcada, cuidado no detalhe e resultado combinado antes.',
    forWho: ['Quem quer um corte com a sua cara, sem padrão pronto', 'Quem valoriza capricho e atenção aos detalhes', 'Quem gosta de horário marcado e pontualidade', 'Quem procura um lugar de confiança para voltar sempre'],
    notFor: ['Quem quer o serviço mais rápido possível, sem conversa', 'Quem não gosta de marcar horário', 'Quem busca mudanças radicais sem avaliação antes'],
    faq: [{ q: 'Preciso agendar?', a: 'Recomendamos reservar pelo WhatsApp para garantir o seu horário.' }, ...COMMON_FAQ.slice(1)],
    theme: 'noturno',
  },
  {
    id: 'beleza',
    label: 'Beleza e estética',
    match: ['salao', 'cabelei', 'barbear', 'estetic', 'beleza', 'manicure', 'sobrancelha', 'depila', 'hairdresser', 'beauty', 'tattoo', 'tatu'],
    audience: 'clientes',
    headline: 'Seu horário, do seu jeito.',
    subheadline: 'Cabelo, unhas e cuidados de beleza com hora marcada e atenção ao que você pediu.',
    servicesLead: 'Serviços feitos com capricho, conversando antes para chegar ao resultado que você quer.',

    closing: 'Vamos marcar o seu horário?',
    ctaPrimary: 'Reservar horário',
    ctaMessage: 'Olá! Vim pelo site e quero reservar um horário.',
    services: [
      { title: 'Corte e finalização', text: 'Corte pensado para o seu estilo e a sua rotina.' },
      { title: 'Coloração', text: 'Cor planejada com você, do retoque à transformação.' },
      { title: 'Tratamentos', text: 'Cuidados para recuperar brilho, força e maciez.' },
      { title: 'Unhas e mãos', text: 'Manicure e pedicure com capricho.' },
      { title: 'Sobrancelhas', text: 'Design que valoriza o seu rosto.' },
      { title: 'Ocasiões especiais', text: 'Produção para eventos, com horário reservado.' },
    ],
    steps: [
      { title: 'Escolha o serviço', text: 'Veja as opções e chame no WhatsApp.' },
      { title: 'Reserve', text: 'Combinamos dia e horário que funcionam para você.' },
      { title: 'Aproveite', text: 'Chegue, relaxe e saia do jeito que queria.' },
    ],
    about: 'Cada atendimento começa com uma conversa: entendemos o que você quer antes de começar.',
    whoWeAre: '{nome} é um espaço de beleza onde cada atendimento começa entendendo o que você quer. Hora marcada, cuidado no detalhe e resultado combinado antes.',
    forWho: ["Quem quer um resultado com a sua cara, sem padrão pronto", "Quem valoriza capricho e atenção aos detalhes", "Quem gosta de horário marcado e pontualidade", "Quem procura um lugar de confiança para voltar sempre"],
    notFor: ["Quem quer o serviço mais rápido possível, sem conversa", "Quem não gosta de marcar horário", "Quem busca mudanças radicais sem avaliação antes"],
    faq: [{ q: 'Preciso agendar?', a: 'Recomendamos reservar pelo WhatsApp para garantir o seu horário.' }, ...COMMON_FAQ.slice(1)],
    theme: 'terracota',
  },
  {
    id: 'alimentacao',
    label: 'Alimentação',
    match: ['restaurant', 'pizza', 'lanchonete', 'hamburg', 'cafe', 'padaria', 'confeitaria', 'doceria', 'bar', 'fast food', 'acai', 'sorvet', 'bakery', 'marmit', 'ice cream'],
    audience: 'clientes',
    headline: 'Comida feita com cuidado, do jeito que você gosta.',
    subheadline: 'Pratos preparados com ingredientes escolhidos. Peça pelo WhatsApp ou venha comer com a gente.',
    servicesLead: 'Do prato do dia ao pedido por encomenda: preparo sem pressa e ingredientes escolhidos.',

    closing: 'Bateu a fome? Peça agora.',
    ctaPrimary: 'Fazer pedido',
    ctaMessage: 'Olá! Vim pelo site e gostaria de fazer um pedido.',
    services: [
      { title: 'Cardápio do dia', text: 'Pratos preparados na hora. Peça o cardápio atualizado pelo WhatsApp.' },
      { title: 'Delivery', text: 'Peça de casa ou do trabalho e receba quentinho.' },
      { title: 'Retirada no local', text: 'Faça o pedido antes e retire sem espera.' },
      { title: 'Encomendas', text: 'Pedidos para eventos e datas especiais com antecedência.' },
    ],
    steps: [
      { title: 'Escolha', text: 'Peça o cardápio ou diga o que deseja.' },
      { title: 'Confirme', text: 'Combinamos valor, entrega ou retirada.' },
      { title: 'Aproveite', text: 'Preparado na hora, do nosso jeito.' },
    ],
    about: 'Cozinhamos como gostamos de comer: ingredientes escolhidos com atenção e preparo sem pressa.',
    whoWeAre: '{nome} serve comida preparada com atenção, ingredientes escolhidos e preparo sem pressa. Peça pelo WhatsApp ou venha experimentar.',
    forWho: ["Quem gosta de comida bem feita e caprichada", "Quem quer pedir com praticidade pelo WhatsApp", "Famílias e amigos procurando um lugar para se encontrar", "Quem valoriza atendimento simpático"],
    notFor: ["Quem procura comida padronizada de rede", "Quem espera preparo instantâneo em horário de pico", "Quem não abre mão de pratos fora do cardápio"],
    faq: [{ q: 'Vocês entregam?', a: 'Consulte a área de entrega pelo WhatsApp.' }, ...COMMON_FAQ.slice(1)],
    theme: 'noturno',
  },
  {
    id: 'fitness',
    label: 'Academia e esporte',
    match: ['academia', 'crossfit', 'pilates', 'fitness', 'yoga', 'luta', 'personal', 'funcional', 'sports'],
    audience: 'alunos',
    headline: 'Treine com orientação e constância.',
    subheadline: 'Treino orientado e acompanhamento para você evoluir no seu ritmo, com segurança.',
    servicesLead: 'Modalidades e acompanhamento para quem está começando e para quem quer evoluir.',

    closing: 'Pronto para começar a treinar?',
    ctaPrimary: 'Agendar aula experimental',
    ctaMessage: 'Olá! Vim pelo site e quero agendar uma aula experimental.',
    services: [
      { title: 'Musculação', text: 'Treinos orientados para força e condicionamento.' },
      { title: 'Aulas coletivas', text: 'Energia de grupo com acompanhamento de professor.' },
      { title: 'Avaliação', text: 'Ponto de partida para montar o seu treino.' },
      { title: 'Planos flexíveis', text: 'Consulte as opções que cabem na sua rotina.' },
    ],
    steps: [
      { title: 'Aula experimental', text: 'Conheça o espaço e a equipe.' },
      { title: 'Avaliação', text: 'Definimos objetivos e ponto de partida.' },
      { title: 'Rotina', text: 'Treinos com acompanhamento e ajustes.' },
    ],
    about: 'Aqui o foco é constância: um ambiente que ajuda você a manter o hábito e evoluir com segurança.',
    whoWeAre: '{nome} é um espaço de treino com foco em constância, técnica e evolução segura. Você treina com orientação, no seu ritmo e com objetivo definido.',
    forWho: ["Quem quer criar o hábito de treinar", "Iniciantes que precisam de orientação", "Quem quer evoluir com segurança e acompanhamento", "Quem busca um ambiente motivador perto de casa"],
    notFor: ["Quem procura resultado rápido sem disciplina", "Quem não quer seguir orientação técnica", "Quem espera fórmulas mágicas"],
    faq: [{ q: 'Posso fazer uma aula experimental?', a: 'Sim, agende pelo WhatsApp.' }, ...COMMON_FAQ.slice(1)],
    theme: 'esportivo',
  },
  {
    id: 'juridico',
    label: 'Advocacia e contabilidade',
    match: ['advoga', 'advocacia', 'juridic', 'contab', 'contador', 'lawyer', 'accountant', 'consultor', 'tax advisor'],
    audience: 'clientes',
    headline: 'Orientação clara para decisões importantes.',
    subheadline: 'Assessoria jurídica em linguagem simples: análise do caso, caminhos possíveis e acompanhamento em cada etapa.',
    servicesLead: 'Atuação nas áreas em que você precisa de apoio, com orientação objetiva desde a primeira conversa.',

    closing: 'Vamos conversar sobre o seu caso?',
    ctaPrimary: 'Agendar conversa',
    ctaMessage: 'Olá! Vim pelo site e gostaria de agendar uma conversa.',
    services: [
      { title: 'Consultoria', text: 'Análise do seu caso e explicação das alternativas.' },
      { title: 'Acompanhamento', text: 'Você sabe o que está acontecendo em cada fase.' },
      { title: 'Empresas', text: 'Apoio para a rotina e as decisões do seu negócio.' },
      { title: 'Pessoas físicas', text: 'Orientação para questões do dia a dia.' },
    ],
    steps: [
      { title: 'Primeiro contato', text: 'Conte brevemente a situação pelo WhatsApp.' },
      { title: 'Reunião', text: 'Entendemos o caso e apresentamos o caminho.' },
      { title: 'Execução', text: 'Acompanhamento com retornos periódicos.' },
    ],
    about: 'Trabalhamos com transparência: você entende o que está sendo feito e por quê.',
    whoWeAre: '{nome} presta assessoria jurídica com transparência: você entende o que está sendo feito, por quê e quais são os caminhos possíveis, sem promessa de resultado.',
    forWho: ["Quem precisa de orientação clara antes de decidir", "Pessoas e empresas que querem acompanhamento próximo", "Quem valoriza transparência em prazos e valores", "Quem prefere ser atendido por alguém da região"],
    notFor: ["Quem procura promessa de resultado garantido", "Quem quer resolver tudo sem apresentar documentos", "Quem busca atalhos fora da lei"],
    faq: [{ q: 'A primeira conversa tem custo?', a: 'Consulte as condições pelo WhatsApp antes de agendar.' }, ...COMMON_FAQ.slice(1)],
    theme: 'sobrio',
  },
  {
    id: 'imobiliario',
    label: 'Imóveis',
    match: ['imobili', 'corretor', 'imove', 'estate agent'],
    audience: 'compradores e proprietários',
    headline: 'O imóvel certo começa com a conversa certa.',
    subheadline: 'Compra, venda e locação com atendimento próximo, documentação organizada e apoio até o fechamento.',
    servicesLead: 'Apoio completo para quem quer comprar, vender, alugar ou saber quanto vale o seu imóvel.',

    closing: 'Vamos encontrar o seu imóvel?',
    ctaPrimary: 'Falar com o corretor',
    ctaMessage: 'Olá! Vim pelo site e gostaria de falar sobre imóveis.',
    services: [
      { title: 'Comprar', text: 'Seleção de imóveis de acordo com o seu perfil e orçamento.' },
      { title: 'Vender', text: 'Avaliação, divulgação e acompanhamento até a assinatura.' },
      { title: 'Alugar', text: 'Opções para morar ou investir, com processo simples.' },
      { title: 'Avaliação de imóvel', text: 'Descubra quanto vale o seu imóvel hoje.' },
    ],
    steps: [
      { title: 'Conversa', text: 'Entendemos o que você procura.' },
      { title: 'Seleção', text: 'Apresentamos opções que fazem sentido.' },
      { title: 'Fechamento', text: 'Acompanhamos visitas, negociação e documentação.' },
    ],
    about: 'Conhecemos a região e acompanhamos cada etapa, da primeira visita à entrega das chaves.',
    whoWeAre: '{nome} atua no mercado imobiliário acompanhando cada etapa, da primeira visita à entrega das chaves, com informação clara e documentação em ordem.',
    forWho: ["Quem quer comprar, vender ou alugar com segurança", "Quem precisa de alguém que conheça a região", "Proprietários que querem anunciar com boa apresentação", "Quem quer ajuda com a documentação"],
    notFor: ["Quem quer negociar sem documentação em ordem", "Quem não quer visitar o imóvel antes de fechar", "Quem busca negócio fora do preço de mercado"],
    faq: COMMON_FAQ,
    theme: 'sobrio',
  },
  {
    id: 'automotivo',
    label: 'Automotivo',
    match: ['oficina', 'mecanic', 'auto center', 'funilaria', 'car repair', 'autopecas', 'lava', 'car wash', 'pneu'],
    audience: 'clientes',
    headline: 'Seu carro em mãos de confiança.',
    subheadline: 'Mecânica e manutenção com diagnóstico claro e orçamento aprovado por você antes de qualquer serviço.',
    servicesLead: 'Revisão, reparo e manutenção: explicamos o que o carro precisa e só fazemos com a sua aprovação.',

    closing: 'Seu carro precisa de atenção? Peça um orçamento.',
    ctaPrimary: 'Pedir orçamento',
    ctaMessage: 'Olá! Vim pelo site e gostaria de um orçamento.',
    services: [
      { title: 'Revisão', text: 'Manutenção preventiva para evitar surpresas.' },
      { title: 'Diagnóstico', text: 'Identificamos o problema antes de trocar peças.' },
      { title: 'Freios e suspensão', text: 'Segurança e conforto ao dirigir.' },
      { title: 'Elétrica', text: 'Bateria, alternador e sistema elétrico.' },
    ],
    steps: [
      { title: 'Contato', text: 'Descreva o problema pelo WhatsApp.' },
      { title: 'Orçamento', text: 'Você aprova antes de começarmos.' },
      { title: 'Entrega', text: 'Carro pronto, com explicação do que foi feito.' },
    ],
    about: 'Explicamos o que o carro precisa e só executamos o serviço com a sua aprovação.',
    whoWeAre: '{nome} cuida do seu carro com transparência: explicamos o que ele precisa, passamos o orçamento antes e só fazemos o serviço com a sua aprovação.',
    forWho: ["Quem quer saber exatamente o que vai ser feito no carro", "Quem faz revisão preventiva para evitar gastos maiores", "Quem precisa de orçamento claro antes do serviço", "Quem procura uma oficina de confiança na região"],
    notFor: ["Quem procura a peça mais barata, sem garantia", "Quem quer o serviço sem diagnóstico antes", "Quem não pode deixar o carro pelo tempo necessário"],
    faq: [{ q: 'Vocês fazem orçamento antes?', a: 'Sim. Nenhum serviço é feito sem a sua aprovação.' }, ...COMMON_FAQ.slice(1)],
    theme: 'noturno',
  },
  {
    id: 'pet',
    label: 'Pet',
    match: ['pet', 'veterin', 'banho e tosa', 'tosa', 'veterinary'],
    audience: 'tutores',
    headline: 'Cuidado de verdade para quem é da família.',
    subheadline: 'Banho, tosa e cuidados com paciência, carinho e respeito ao jeito de cada animal.',
    servicesLead: 'Serviços para o bem-estar do seu pet, feitos com calma e atenção ao comportamento de cada um.',

    closing: 'Seu pet merece esse cuidado.',
    ctaPrimary: 'Agendar horário',
    ctaMessage: 'Olá! Vim pelo site e gostaria de agendar um horário para o meu pet.',
    services: [
      { title: 'Banho', text: 'Produtos adequados e secagem com cuidado.' },
      { title: 'Tosa', text: 'Higiênica ou na tesoura, como você preferir.' },
      { title: 'Consultas', text: 'Atenção à saúde e ao bem-estar do seu pet.' },
      { title: 'Produtos', text: 'Rações e acessórios. Consulte disponibilidade.' },
    ],
    steps: [
      { title: 'Agende', text: 'Escolha o serviço e o horário pelo WhatsApp.' },
      { title: 'Cuidamos', text: 'Seu pet recebe atenção do início ao fim.' },
      { title: 'Retire', text: 'Avisamos quando estiver pronto.' },
    ],
    about: 'Tratamos cada animal com paciência e carinho, respeitando o jeito de cada um.',
    whoWeAre: '{nome} cuida do seu pet com paciência, carinho e respeito ao jeito de cada animal, para você deixar e buscar com tranquilidade.',
    forWho: ["Tutores que tratam o pet como parte da família", "Quem quer banho, tosa e cuidados feitos com atenção", "Pets agitados ou medrosos que precisam de paciência", "Quem gosta de saber como foi o atendimento"],
    notFor: ["Quem quer o atendimento mais rápido a qualquer custo", "Quem não mantém a vacinação do pet em dia", "Emergências graves: procure um plantão veterinário 24h"],
    faq: COMMON_FAQ,
    theme: 'terracota',
  },
  {
    id: 'engenharia',
    label: 'Engenharia e construção',
    match: ['engenhe', 'engenharia', 'arquitet', 'construtor', 'construcao', 'reforma', 'empreiteir', 'pedreiro', 'topograf'],
    audience: 'proprietários e empresas',
    headline: 'Projeto e obra com planejamento, prazo e valor combinados antes de começar.',
    subheadline: 'Projetos, laudos e acompanhamento de obra para quem vai construir, reformar ou regularizar um imóvel.',
    servicesLead: 'Da planta à entrega: projeto, vistoria e acompanhamento com escopo definido por escrito.',

    closing: 'Vamos tirar o seu projeto do papel?',
    ctaPrimary: 'Pedir orçamento',
    ctaMessage: 'Olá! Vim pelo site e gostaria de um orçamento.',
    services: [
      { title: 'Projetos e regularização', text: 'Projetos, aprovações e documentação do seu imóvel em dia.' },
      { title: 'Laudos e vistorias', text: 'Avaliação técnica do imóvel com relatório claro.' },
      { title: 'Acompanhamento de obra', text: 'Visitas técnicas para a obra seguir o projeto e o prazo combinado.' },
      { title: 'Reformas e ampliações', text: 'Planejamento e execução com escopo definido por escrito.' },
      { title: 'Orçamento e planejamento', text: 'Quantitativos e cronograma para você decidir com segurança.' },
      { title: 'Consultoria técnica', text: 'Orientação para dúvidas sobre construção, reforma e compra de imóveis.' },
    ],
    steps: [
      { title: 'Conversa inicial', text: 'Você conta o que precisa pelo WhatsApp ou telefone.' },
      { title: 'Visita e orçamento', text: 'Avaliação do local, escopo, prazos e valores por escrito.' },
      { title: 'Execução acompanhada', text: 'Etapas combinadas e você informado a cada fase.' },
    ],
    about: 'Trabalhamos com escopo, prazo e valores combinados por escrito. Assim você acompanha cada etapa da obra sem surpresas.',
    whoWeAre: '{nome} atua com engenharia e construção unindo planejamento, acompanhamento técnico e comunicação clara. Você sabe o que será feito, em quanto tempo e por quanto, antes de começar.',
    forWho: ['Quem vai construir, reformar ou regularizar um imóvel', 'Quem quer orçamento e prazo claros antes de começar', 'Quem precisa de laudo ou vistoria técnica', 'Quem quer acompanhamento profissional durante a obra'],
    notFor: ['Quem busca obra sem projeto nem documentação', 'Quem quer decidir só pelo menor preço', 'Quem não pode combinar escopo e prazo antes de começar'],
    faq: [{ q: 'Vocês fazem visita técnica?', a: 'Combine pelo WhatsApp: a visita ao local ajuda a definir escopo, prazo e valores.' }, ...COMMON_FAQ],
    theme: 'sobrio',
  },
];

export const GENERIC_PACK: SegmentPack = {
  id: 'generico',
  label: 'Negócio local',
  match: [],
  audience: 'clientes',
  headline: 'Atendimento próximo e serviço bem feito.',
  subheadline: 'Atendimento direto, orçamento claro e trabalho combinado antes de começar.',
  servicesLead: 'Como trabalhamos: conversa, proposta clara e entrega acompanhada.',

  closing: 'Vamos conversar sobre o que você precisa?',
  ctaPrimary: 'Falar no WhatsApp',
  ctaMessage: 'Olá! Vim pelo site e gostaria de mais informações.',
  services: [
    { title: 'Atendimento', text: 'Entendemos o que você precisa antes de propor qualquer coisa.' },
    { title: 'Orçamento', text: 'Valores e prazos claros, sem surpresas.' },
    { title: 'Execução', text: 'Trabalho feito com cuidado e dentro do combinado.' },
    { title: 'Pós-atendimento', text: 'Seguimos disponíveis depois da entrega.' },
  ],
  steps: [
    { title: 'Contato', text: 'Chame no WhatsApp ou ligue.' },
    { title: 'Proposta', text: 'Explicamos opções, prazos e valores.' },
    { title: 'Entrega', text: 'Executamos e acompanhamos o resultado.' },
  ],
  about: 'Somos um negócio local que valoriza atendimento próximo e trabalho bem feito.',
  whoWeAre: '{nome} é um negócio local que valoriza atendimento próximo, orçamento claro e trabalho bem feito.',
  forWho: ["Quem quer ser atendido com atenção", "Quem precisa de orçamento claro antes de começar", "Quem prefere um negócio da própria região", "Quem valoriza que o combinado seja cumprido"],
  notFor: ["Quem procura apenas o menor preço", "Quem precisa de tudo para agora, sem planejamento", "Quem não quer conversar antes de fechar"],
  faq: COMMON_FAQ,
  theme: 'sobrio',
};

export function packFor(niche: string, category?: string): SegmentPack {
  const text = normText(`${niche} ${category ?? ''}`);
  return PACKS.find((p) => p.match.some((m) => text.includes(m))) ?? GENERIC_PACK;
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
