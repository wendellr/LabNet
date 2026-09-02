/**
 * Lab 12 — OSPF Área Stub: Escopo de Flooding de LSA Type-5
 * Complementa o Lab 11 (sumarização): aqui o problema não é o NÚMERO de
 * LSAs, é o TIPO — uma área pequena não precisa conhecer cada rota
 * externa em detalhe, só precisar de um jeito de sair.
 */

const lab = {
  id: 12,
  protocol: "ospf",
  level: 5,
  scenario: "Uma filial pequena, conectada por um link mais fraco e com um roteador de baixo custo, não precisa (e mal aguenta) manter um banco de dados com cada rota externa da internet que a matriz redistribui no OSPF — ela só precisa de UM jeito de sair. Área stub existe exatamente para esse cenário: simplifica drasticamente o que a filial precisa processar, sem cortar sua conectividade com o resto do mundo.",
  title: "OSPF Área Stub — Escopo de Flooding de LSA Type-5",
  topic: "Área Stub, ASBR e Rota Default Automática",
  difficulty: "Intermediário",
  duration: "55 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  routers: ["R1", "R2", "R3"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
  ],

  variables: {
    extNet: { pool: ["203.0.113", "198.51.100", "192.0.2", "203.0.114"] },
  },

  autoGrade: [
    { id: "checked_external", label: "Verificou LSAs Type-5 em R1", cmdContains: "show ip ospf database external" },
    { id: "stub_configured_live", label: "Configurou 'area 1 stub'", cmdContains: "area 1 stub" },
  ],

  verifications: [
    {
      id: "stub_r1",
      label: "'area 1 stub' configurado em R1",
      weight: 25,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "area 1 stub" },
    },
    {
      id: "stub_r2",
      label: "'area 1 stub' configurado em R2 (o ABR — precisa bater dos dois lados)",
      weight: 25,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "area 1 stub" },
    },
    {
      id: "default_route_in_r1",
      label: "R1 recebeu a rota default automática injetada pelo ABR da área stub",
      weight: 50,
      check: { router: "R1", cmdPattern: "show ip route 0\\.0\\.0\\.0/0", outputPattern: "0\\.0\\.0\\.0/0[\\s\\S]*ospf|via 10\\.0\\.12\\.2" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["externa", "type-5", "tipo 5", "redistribuída", "redistribuida"],
      anyOf: true,
      points: 10,
      hint: "R3 é o ASBR — ele redistribui uma rota estática, o que gera LSA Type-5 flooding para todas as áreas normais.",
    },
    predict_step2: {
      type: "keywords",
      required: ["default", "0.0.0.0"],
      anyOf: true,
      points: 10,
      hint: "É assim que uma área stub continua tendo saída sem precisar conhecer cada rota externa individualmente.",
    },
    q1: {
      type: "radio",
      correct: "Um ASBR (Autonomous System Boundary Router) — um roteador que redistribui rotas de fora do OSPF, gerando LSAs Type-5",
      points: 20,
    },
    q2: {
      type: "radio",
      correct: "As LSAs Type-5 (externas) inundam todas as áreas normais por padrão, independente de a área precisar delas",
      points: 20,
    },
    q3: {
      type: "radio",
      correct: "O E-bit do pacote Hello indica capacidade de rotas externas; se não bater entre os roteadores do segmento, a adjacência não se forma",
      points: 20,
    },
    q4: {
      type: "radio",
      correct: "Uma rota default (0.0.0.0/0) automática, originada pelo ABR da área stub",
      points: 20,
    },
  },

  steps: [
    {
      id: 1,
      title: "Observar o flooding de LSAs externas",
      theory: "R3 é um ASBR: ele redistribui uma rota estática (representando uma rede externa, tipo 'internet') no OSPF via 'redistribute static'. Isso gera uma LSA Type-5 (AS-External), que por padrão é inundada para TODAS as áreas normais da topologia — inclusive a área 1, onde R1 está, mesmo que R1 não precise conhecer o destino específico, só precise de um jeito de sair da área.",
      description: "Rode 'show ip ospf database external' em R1 e confirme que a rota externa de R3 já chega até lá, mesmo sendo uma área diferente.",
      commands: [
        { cmd: "show ip ospf database external", router: "R1", desc: "LSAs Type-5 conhecidas por R1" },
        { cmd: "show ip route ospf", router: "R1", desc: "Tabela de rotas OSPF de R1" },
      ],
      expected: "R1 mostra a LSA Type-5 de R3 para {{extNet}}.0/24, e uma rota O E2 específica na tabela.",
      predict: {
        id: "predict_step1",
        prompt: "Que tipo de LSA você espera encontrar em R1 para a rede redistribuída por R3, mesmo estando em outra área?",
      },
    },
    {
      id: 2,
      title: "Configurar a área 1 como stub",
      theory: "'area <id> stub' bloqueia a entrada de LSAs Type-5 naquela área — os roteadores de dentro dela deixam de precisar de um banco de dados com cada rota externa. Só que essa configuração precisa bater nos dois lados de cada link daquela área: o E-bit (capacidade de rotas externas) viaja no pacote Hello, e se um lado disser 'normal' e o outro 'stub', a adjacência simplesmente não se forma — o mesmo tipo de problema de parâmetros incompatíveis que você já viu com a Area ID.",
      description: "Configure 'area 1 stub' tanto em R1 quanto em R2 (o ABR da área 1).\n\nExemplo em R1 e em R2:\n  configure terminal\n  router ospf\n   area 1 stub\n  end",
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme 'area 1 stub' em R1" },
        { cmd: "show running-config", router: "R2", desc: "Confirme 'area 1 stub' em R2" },
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Confirme que a adjacência com R2 continua Full" },
      ],
      expected: "R1 e R2 mostram 'area 1 stub' na configuração, e a adjacência entre eles continua Full depois da mudança.",
    },
    {
      id: 3,
      title: "Confirmar a rota default automática",
      theory: "Depois que a área 1 vira stub, o ABR (R2) para de inundar LSAs Type-5 nela e passa a originar automaticamente uma rota default (0.0.0.0/0) via LSA Type-3 — assim, R1 continua com um caminho de saída para qualquer destino externo, só que sem precisar de uma entrada específica para cada rota redistribuída.",
      description: "Rode 'show ip route 0.0.0.0/0' em R1 e confirme que a rota default chegou automaticamente, sem você ter configurado nada de rota estática.",
      commands: [
        { cmd: "show ip route 0.0.0.0/0", router: "R1", desc: "Rota default em R1" },
        { cmd: "show ip ospf database external", router: "R1", desc: "Confirma que as LSAs Type-5 não chegam mais" },
      ],
      expected: "R1 mostra uma rota 0.0.0.0/0 via R2, aprendida por OSPF, sem nenhuma LSA Type-5 no banco de dados.",
      predict: {
        id: "predict_step2",
        prompt: "Depois de configurar a área 1 como stub, o que você espera que substitua as rotas externas específicas em R1?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Justifique o Design de Área Stub",
    description: "Você já configurou a área stub e confirmou a rota default automática. Este desafio consolida os conceitos de ASBR, LSA Type-5 e compatibilidade de parâmetros de área.",
    hints: [
      "O E-bit do Hello precisa bater nos dois lados de cada link da área",
      "Área stub não impede a área de SAIR da rede, só de conhecer cada rota externa em detalhe",
      "A rota default injetada é uma LSA Type-3, não Type-5",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "O que caracteriza um roteador ASBR?",
        options: [
          "Um roteador que faz fronteira entre duas áreas OSPF",
          "Um ASBR (Autonomous System Boundary Router) — um roteador que redistribui rotas de fora do OSPF, gerando LSAs Type-5",
          "O roteador eleito Designated Router em uma rede broadcast",
          "Um roteador que só participa da área 0 (backbone)",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "Por que uma rota redistribuída em R3 (outra área) chegava até R1 antes de configurar a área stub?",
        options: [
          "Porque R1 tinha uma rota estática apontando para R3",
          "As LSAs Type-5 (externas) inundam todas as áreas normais por padrão, independente de a área precisar delas",
          "Porque R1 e R3 estavam na mesma área",
          "Porque BGP estava redistribuindo a rota",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Por que a adjacência quebra se só um dos lados de um link configurar 'area stub'?",
        options: [
          "Porque a Area ID muda automaticamente ao ativar stub",
          "O E-bit do pacote Hello indica capacidade de rotas externas; se não bater entre os roteadores do segmento, a adjacência não se forma",
          "Porque o custo da interface muda para 0",
          "Isso não acontece — área stub nunca afeta a adjacência",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "O que substitui as rotas externas específicas depois que uma área vira stub?",
        options: [
          "Nada — a área perde a capacidade de sair para fora",
          "Uma rota default (0.0.0.0/0) automática, originada pelo ABR da área stub",
          "Uma rota BGP injetada manualmente",
          "As rotas externas continuam chegando, só que compactadas",
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
 network 10.0.12.0/30 area 1
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
router ospf
 ospf router-id 3.3.3.3
 network 10.0.23.0/30 area 0
 redistribute static
!
ip route {{extNet}}.0/24 Null0
`,
};

module.exports = lab;
