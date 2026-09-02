/**
 * Lab 13 — OSPF Nível 1: Adjacência Básica e Tabela de Rotas
 * Primeira exposição real ao protocolo — sem falha proposital de
 * propósito (introduzir troubleshooting antes de mostrar o que é
 * "normal" seria didaticamente invertido). Foco: estados de vizinhança,
 * custo padrão, e o mecanismo básico de anunciar uma rede nova.
 */

const lab = {
  id: 13,
  protocol: "ospf",
  level: 1,
  title: "OSPF — Adjacência Básica e Tabela de Rotas",
  topic: "Primeiros Passos com OSPF",
  difficulty: "Iniciante",
  duration: "40 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  scenario: "Você acabou de assumir a operação de uma rede pequena com três roteadores em sequência, rodando OSPF em área única. Antes de qualquer diagnóstico avançado ou desenho de área, o primeiro trabalho de qualquer engenheiro de rede é o mais básico: confirmar que as adjacências estão saudáveis, entender como o custo padrão é calculado, e saber como uma rede nova entra no domínio de roteamento quando a empresa expande.",
  routers: ["R1", "R2", "R3"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
  ],

  variables: {
    newNet: { pool: ["172.30.50", "172.30.60", "172.30.70", "172.30.80"] },
  },

  autoGrade: [
    { id: "checked_neighbors", label: "Verificou vizinhos OSPF", cmdContains: "show ip ospf neighbor" },
    { id: "checked_interface", label: "Verificou custo da interface", cmdContains: "show ip ospf interface" },
    { id: "checked_database", label: "Verificou o banco de LSAs", cmdContains: "show ip ospf database" },
    { id: "new_network_added", label: "Adicionou a rede nova em R3", cmdContains: "network {{newNet}}" },
  ],

  verifications: [
    {
      id: "ospf_full_chain",
      label: "R2 tem adjacência Full com R1 e R3 (os dois vizinhos da cadeia)",
      weight: 30,
      check: {
        router: "R2",
        cmdPattern: "show ip ospf neighbor",
        outputPattern: "(?=[\\s\\S]*1\\.1\\.1\\.1[\\s\\S]*Full)(?=[\\s\\S]*3\\.3\\.3\\.3[\\s\\S]*Full)",
      },
    },
    {
      id: "new_network_configured",
      label: "Rede nova coberta por 'network area 0' em R3",
      weight: 30,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "network {{newNet}}\\.0/24 area 0" },
    },
    {
      id: "new_network_visible_r1",
      label: "R1 (do outro lado da cadeia) já enxerga a rede nova via OSPF",
      weight: 40,
      check: { router: "R1", cmdPattern: "show ip route {{newNet}}\\.1", outputPattern: "{{newNet}}\\.1" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["2", "dois", "duas"],
      anyOf: true,
      points: 15,
      hint: "R2 está no meio da cadeia — conectado diretamente a R1 e a R3.",
    },
    predict_step2: {
      type: "keywords",
      required: ["sim", "propaga", "área", "area", "toda"],
      anyOf: true,
      points: 15,
      hint: "OSPF distribui informação de roteamento para todos os roteadores da mesma área — não é preciso configurar nada em R1 ou R2.",
    },
    q1: {
      type: "radio",
      correct: "Down → Init → 2-Way → ExStart → Exchange → Loading → Full",
      points: 20,
    },
    q2: {
      type: "radio",
      correct: "Full — os dois roteadores trocaram e sincronizaram completamente seus bancos de dados de estado de enlace",
      points: 20,
    },
    q3: {
      type: "radio",
      correct: "Banda de referência dividida pela banda da interface",
      points: 20,
    },
    q4: {
      type: "radio",
      correct: "Não — basta que a nova rede esteja coberta por um 'network area' em qualquer roteador da área; o OSPF propaga automaticamente",
      points: 10,
    },
  },

  steps: [
    {
      id: 1,
      title: "Verificar as adjacências da cadeia",
      theory: "Antes de uma adjacência OSPF chegar a Full (totalmente sincronizada), os dois roteadores passam por uma sequência de estados: Down (nenhum contato) → Init (Hello recebido, mas ainda não bidirecional) → 2-Way (bidirecional — nesse ponto, numa rede broadcast com mais de 2 roteadores, ocorre a eleição de DR/BDR) → ExStart (negociando quem começa a troca) → Exchange (trocando descrições do banco de dados) → Loading (pedindo as LSAs que faltam) → Full (sincronizado). Só em Full a adjacência está pronta para uso.\n\nNesta topologia, R1—R2—R3 formam uma cadeia simples em área única (área 0). R2 é o único roteador com dois vizinhos diretos.",
      description: "Rode 'show ip ospf neighbor' nos três roteadores e confirme que todas as adjacências estão em Full.",
      commands: [
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Vizinhos de R1" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "Vizinhos de R2" },
        { cmd: "show ip ospf neighbor", router: "R3", desc: "Vizinhos de R3" },
      ],
      expected: "R2 mostra dois vizinhos em Full (1.1.1.1 e 3.3.3.3). R1 e R3 mostram um vizinho cada, também Full.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar o comando, quantos vizinhos Full você espera ver em R2?",
      },
    },
    {
      id: 2,
      title: "Entender o custo e o banco de dados",
      theory: "O custo OSPF de uma interface, por padrão, é calculado como (banda de referência) ÷ (banda da interface) — quanto maior a banda, menor o custo, e menor custo é sempre preferido na escolha de caminho. O comando 'show ip ospf interface' mostra o custo aplicado a cada interface. Já 'show ip ospf database' mostra o banco de LSAs conhecido — numa área única, sem ABRs, você só verá LSAs Type-1 (Router LSA), uma por roteador, cada uma descrevendo os enlaces daquele roteador.",
      description: "Rode 'show ip ospf interface' e 'show ip ospf database' em R2 e observe o custo das duas interfaces e as entradas do banco de dados.",
      commands: [
        { cmd: "show ip ospf interface", router: "R2", desc: "Custo das interfaces de R2" },
        { cmd: "show ip ospf database", router: "R2", desc: "Banco de LSAs conhecido por R2" },
        { cmd: "show ip route ospf", router: "R1", desc: "Rotas aprendidas por OSPF em R1" },
      ],
      expected: "R2 mostra o custo de cada interface. O banco de dados mostra 3 Router LSAs (uma por roteador da área). R1 já tem rota para a rede de R3, aprendida via R2.",
    },
    {
      id: 3,
      title: "Anunciar uma rede nova",
      theory: "Quando a empresa cresce e uma rede nova precisa entrar no domínio OSPF, o processo é simples: qualquer roteador com uma interface (ou endereço adicional) naquela faixa adiciona um 'network <prefixo> area <área>' correspondente dentro de 'router ospf'. Não é preciso configurar nada nos outros roteadores — a informação se propaga automaticamente para toda a área através das LSAs.\n\nDetalhe importante do FRR: endereços em interface de loopback são sempre anunciados como rota de HOST (/32), não importa a máscara configurada — mesmo cobrindo com 'network .../24 area 0'. Por isso, depois de configurar, procure pelo endereço /32 específico na tabela de rotas, não pelo /24.",
      description: "Em R3, adicione um endereço adicional no loopback representando a rede nova e cubra com 'network area 0'.\n\nExemplo em R3:\n  configure terminal\n  interface lo\n   ip address {{newNet}}.1/32\n  exit\n  router ospf\n   network {{newNet}}.0/24 area 0\n  end",
      commands: [
        { cmd: "show running-config", router: "R3", desc: "Confirme a rede nova configurada" },
        { cmd: "show ip route {{newNet}}.1/32", router: "R1", desc: "Confirme que R1 já enxerga a rede nova (é uma rota /32, não /24 — loopback)" },
      ],
      expected: "R1, do outro lado da cadeia, já mostra uma rota OSPF /32 para {{newNet}}.1 — sem nenhuma configuração adicional em R1 ou R2.",
      predict: {
        id: "predict_step2",
        prompt: "Depois de configurar a rede nova só em R3, você espera que ela apareça na tabela de rotas de R1? Por quê?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Consolide os Fundamentos",
    description: "Você já confirmou as adjacências, entendeu custo e banco de dados, e anunciou uma rede nova de ponta a ponta. Este desafio consolida os conceitos fundamentais antes dos próximos labs, que vão explorar diagnóstico de falhas e engenharia de custo.",
    hints: [
      "A sequência de estados de adjacência é sempre a mesma, não importa a topologia",
      "Custo menor é sempre preferido",
      "Uma rede nova só precisa ser configurada em UM roteador da área",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "Qual é a sequência correta de estados até uma adjacência OSPF chegar a Full?",
        options: [
          "Down → Full → Init → 2-Way",
          "Down → Init → 2-Way → ExStart → Exchange → Loading → Full",
          "Init → Down → Full",
          "2-Way → Down → Init → Full",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "O que significa uma adjacência estar em estado Full?",
        options: [
          "Que o link está com uso de banda no máximo",
          "Full — os dois roteadores trocaram e sincronizaram completamente seus bancos de dados de estado de enlace",
          "Que o roteador foi eleito DR",
          "Que a interface está desligada",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Como o FRR calcula o custo OSPF padrão de uma interface?",
        options: [
          "Sempre fixo em 1, independente da banda",
          "Banda de referência dividida pela banda da interface",
          "Número de saltos até o destino",
          "Baseado na prioridade da interface",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Para uma rede nova entrar no domínio OSPF, é preciso configurar 'network area' em todos os roteadores da área?",
        options: [
          "Sim, em todos, senão a rota não se propaga",
          "Não — basta que a nova rede esteja coberta por um 'network area' em qualquer roteador da área; o OSPF propaga automaticamente",
          "Sim, mas só nos roteadores ABR",
          "Não é possível adicionar redes novas sem reiniciar o OSPF",
        ],
      },
    ],
  },
};

lab.frr_configs = {
  R1: `frr version 9.0
hostname R1
!
interface lo
 ip address 1.1.1.1/32
!
interface eth1
 ip address 10.0.12.1/30
!
router ospf
 ospf router-id 1.1.1.1
 network 10.0.12.0/30 area 0
 network 1.1.1.1/32 area 0
!
`,
  R2: `frr version 9.0
hostname R2
!
interface lo
 ip address 2.2.2.2/32
!
interface eth1
 ip address 10.0.12.2/30
!
interface eth2
 ip address 10.0.23.1/30
!
router ospf
 ospf router-id 2.2.2.2
 network 10.0.12.0/30 area 0
 network 10.0.23.0/30 area 0
 network 2.2.2.2/32 area 0
!
`,
  R3: `frr version 9.0
hostname R3
!
interface lo
 ip address 3.3.3.3/32
!
interface eth1
 ip address 10.0.23.2/30
!
router ospf
 ospf router-id 3.3.3.3
 network 10.0.23.0/30 area 0
 network 3.3.3.3/32 area 0
!
`,
};

module.exports = lab;
