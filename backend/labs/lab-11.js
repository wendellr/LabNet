/**
 * Lab 11 — OSPF Multi-Área e Sumarização de Rotas (ABR)
 * Progressão natural depois do Lab 10 (área única): aqui a topologia já
 * nasce corretamente configurada em 3 áreas, e o desafio é otimizar —
 * reduzir o número de LSAs Type-3 cruzando o backbone via `area range`.
 */

const lab = {
  id: 11,
  protocol: "ospf",
  scenario: "Uma empresa cresceu de uma única sede para várias filiais, cada uma virando sua própria área OSPF. Cada filial pequena tem só um punhado de sub-redes locais, mas sem sumarização, CADA uma dessas sub-redes vira uma LSA Type-3 própria cruzando o backbone e sendo processada por todo roteador da rede — em uma empresa com dezenas de filiais, isso significa milhares de entradas desnecessárias no banco de dados de cada área. Sumarizar no ABR resolve isso sem perder conectividade.",
  title: "OSPF Multi-Área e Sumarização de Rotas",
  topic: "Área, ABR e Type-3 Summary LSA",
  difficulty: "Intermediário",
  duration: "60 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
    ["R3", "eth2", "R4", "eth1"],
  ],

  variables: {
    orgOctet: { pool: ["20", "21", "22", "23", "24"] },
  },

  autoGrade: [
    { id: "checked_database", label: "Verificou o banco de LSAs Type-3", cmdContains: "show ip ospf database summary" },
    { id: "area_range_applied", label: "Aplicou 'area range' em R2", cmdContains: "area 1 range" },
  ],

  verifications: [
    {
      id: "summary_configured",
      label: "'area 1 range' configurado em R2 com a supernet correta",
      weight: 35,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "area 1 range 172\\.{{orgOctet}}\\.10\\.0/24" },
    },
    {
      id: "summary_visible_r4",
      label: "R4 (do outro lado do backbone) enxerga só a rota sumarizada /24",
      weight: 40,
      check: { router: "R4", cmdPattern: "show ip ospf database summary", outputPattern: "172\\.{{orgOctet}}\\.10\\.0[\\s\\S]*?Network Mask: /24" },
    },
    {
      id: "route_still_reachable",
      label: "Os hosts de R1 continuam alcançáveis em R4 depois da sumarização",
      weight: 25,
      check: { router: "R4", cmdPattern: "show ip route 172\\.{{orgOctet}}\\.10\\.0", outputPattern: "172\\.{{orgOctet}}\\.10\\.0" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["3", "três", "tres"],
      anyOf: true,
      points: 10,
      hint: "R1 tem 3 endereços de host cobertos por 'network area 1' — cada um vira uma origem de LSA que o ABR traduz para a área 0.",
    },
    predict_step2: {
      type: "keywords",
      required: ["1", "um", "uma"],
      anyOf: true,
      points: 10,
      hint: "'area range' consolida tudo que estiver dentro da supernet em uma única LSA Type-3.",
    },
    q1: {
      type: "radio",
      correct: "Um roteador ABR (Area Border Router) traduz rotas intra-área em LSAs Type-3 (Summary) ao cruzarem para outra área",
      points: 20,
    },
    q2: {
      type: "radio",
      correct: "area <id> range <prefixo>, configurado no ABR que está enviando as rotas daquela área para as demais",
      points: 20,
    },
    q3: {
      type: "radio",
      correct: "Menos LSAs no banco de dados de cada área vizinha, reduzindo o custo de SPF e o impacto de instabilidade de rotas específicas dentro da área de origem",
      points: 20,
    },
    q4: {
      type: "radio",
      correct: "summary-address, aplicado no ASBR que está redistribuindo as rotas — area range só sumariza rotas intra-área, não rotas externas",
      points: 20,
    },
  },

  steps: [
    {
      id: 1,
      title: "Observar as LSAs Type-3 antes da sumarização",
      theory: "R1 está na área 1, com três endereços adicionais no loopback (representando três hosts/serviços distintos), cobertos por uma única 'network 172.X.10.0/24 area 1' — cada endereço vira uma origem própria de rota intra-área. R2 é o ABR entre a área 1 e a área 0 (o backbone): sempre que uma rota intra-área de uma área precisa ser conhecida por outra, o ABR a traduz em uma LSA Type-3 (Summary). Sem nenhuma configuração extra, o ABR gera uma LSA Type-3 para CADA rota individual — três hosts em R1 viram três LSAs Type-3 cruzando o backbone, mesmo que os três estejam na mesma sub-rede /24.",
      description: "Rode 'show ip ospf database summary' em R4 (do outro lado do backbone, na área 2) e conte quantas entradas aparecem para o prefixo 172.{{orgOctet}}.10.x.",
      commands: [
        { cmd: "show ip ospf database summary", router: "R4", desc: "LSAs Type-3 conhecidas por R4" },
        { cmd: "show ip route ospf", router: "R4", desc: "Tabela de rotas OSPF de R4" },
      ],
      expected: "R4 deve mostrar 3 LSAs Type-3 separadas, uma para cada host de R1 (172.{{orgOctet}}.10.1/32, .2/32, .3/32).",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar o comando, quantas LSAs Type-3 distintas você espera ver em R4 relacionadas aos hosts de R1?",
      },
    },
    {
      id: 2,
      title: "Sumarizar no ABR com 'area range'",
      theory: "O comando 'area <id> range <prefixo>' é configurado no ABR, na área de ORIGEM das rotas (aqui, área 1, em R2). Ele diz: 'em vez de anunciar cada rota intra-área desta área individualmente para as outras áreas, anuncie só esta supernet'. As rotas específicas continuam existindo dentro da área 1 normalmente — a sumarização só afeta o que é anunciado para FORA dela.",
      description: "Em R2, configure a sumarização da faixa que cobre os três hosts de R1.\n\nExemplo em R2:\n  configure terminal\n  router ospf\n   area 1 range 172.{{orgOctet}}.10.0/24\n  end",
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme a linha 'area 1 range'" },
      ],
      expected: "R2 deve mostrar 'area 1 range 172.{{orgOctet}}.10.0/24' dentro de 'router ospf'.",
    },
    {
      id: 3,
      title: "Confirmar a redução em R4",
      theory: "Depois de aplicar o range, o ABR (R2) para de anunciar as três LSAs Type-3 individuais e passa a anunciar só uma, cobrindo a supernet inteira. Isso reduz o tamanho do banco de dados de todas as outras áreas (aqui, a área 0 e a área 2) sem que os roteadores de lá percam a capacidade de alcançar os hosts — o tráfego continua chegando em R1 normalmente, só que a informação de roteamento ficou mais compacta.",
      description: "Rode novamente 'show ip ospf database summary' em R4 e confirme que agora só existe UMA entrada /24 para essa faixa, e que a rota para os hosts continua funcionando.",
      commands: [
        { cmd: "show ip ospf database summary", router: "R4", desc: "LSAs Type-3 depois da sumarização" },
        { cmd: "show ip route 172.{{orgOctet}}.10.0/24", router: "R4", desc: "Confirma que a rota sumarizada ainda existe" },
      ],
      expected: "R4 mostra uma única LSA Type-3 com Network Mask /24 para 172.{{orgOctet}}.10.0, e a rota continua presente na tabela.",
      predict: {
        id: "predict_step2",
        prompt: "Depois de configurar o 'area range', quantas LSAs Type-3 você espera ver em R4 para essa faixa?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Explique a Sumarização para a Turma",
    description: "Você já aplicou a sumarização e confirmou a redução em R4. Este desafio final consolida os conceitos por trás do que você acabou de fazer, incluindo um caso em que 'area range' NÃO seria a ferramenta certa.",
    hints: [
      "'area range' opera no ABR, sobre rotas intra-área",
      "Rotas externas (redistribuídas) usam um mecanismo de sumarização diferente",
      "Sumarizar reduz o banco de LSAs das outras áreas, não da área de origem",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "O que faz um roteador ABR no contexto de sumarização OSPF?",
        options: [
          "Troca rotas BGP com outros ASes",
          "Um roteador ABR (Area Border Router) traduz rotas intra-área em LSAs Type-3 (Summary) ao cruzarem para outra área",
          "Filtra rotas usando route-map antes de enviar para vizinhos eBGP",
          "Elege o Designated Router de uma rede broadcast",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "Qual comando e em qual roteador você configura para sumarizar rotas intra-área de uma área?",
        options: [
          "summary-address, no roteador que está na área de destino",
          "area <id> range <prefixo>, configurado no ABR que está enviando as rotas daquela área para as demais",
          "redistribute ospf, em qualquer roteador da topologia",
          "network <prefixo> area <id>, no roteador de origem da rota",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Qual o principal benefício de sumarizar rotas intra-área no ABR?",
        options: [
          "Aumenta a segurança da rede contra ataques externos",
          "Menos LSAs no banco de dados de cada área vizinha, reduzindo o custo de SPF e o impacto de instabilidade de rotas específicas dentro da área de origem",
          "Permite usar endereços IP duplicados em áreas diferentes",
          "Elimina a necessidade de área 0 (backbone)",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Se, em vez de rotas intra-área, R1 estivesse redistribuindo rotas estáticas (LSAs Type-5, externas), qual seria o comando certo para sumarizá-las?",
        options: [
          "area 1 range, do mesmo jeito",
          "network area, com uma máscara maior",
          "summary-address, aplicado no ASBR que está redistribuindo as rotas — area range só sumariza rotas intra-área, não rotas externas",
          "Não é possível sumarizar rotas externas no OSPF",
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
 ip address 172.{{orgOctet}}.10.1/32
 ip address 172.{{orgOctet}}.10.2/32
 ip address 172.{{orgOctet}}.10.3/32
!
interface eth1
 ip address 10.0.12.1/30
!
router ospf
 ospf router-id 1.1.1.1
 network 10.0.12.0/30 area 1
 network 172.{{orgOctet}}.10.0/24 area 1
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
 network 10.0.12.0/30 area 1
 network 10.0.23.0/30 area 0
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
interface eth2
 ip address 10.0.34.1/30
!
router ospf
 ospf router-id 3.3.3.3
 network 10.0.23.0/30 area 0
 network 10.0.34.0/30 area 2
!
`,
  R4: `frr version 9.0
hostname R4
!
interface lo
 ip address 4.4.4.4/32
!
interface eth1
 ip address 10.0.34.2/30
!
router ospf
 ospf router-id 4.4.4.4
 network 10.0.34.0/30 area 2
!
`,
};

module.exports = lab;
