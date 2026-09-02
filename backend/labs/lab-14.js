/**
 * Lab 14 — OSPF Nível 3: Tipo de Rede e Eleição de DR/BDR
 * Preenche a lacuna do nível 3 da trilha OSPF (curriculum backlog).
 * Sem falha proposital de área/config quebrada — o foco aqui é um
 * mecanismo que acontece por padrão e precisa ser observado e depois
 * controlado deliberadamente (prioridade, tipo de rede).
 */

const lab = {
  id: 14,
  protocol: "ospf",
  level: 3,
  title: "OSPF — Tipo de Rede e Eleição de DR/BDR",
  topic: "Tipo de Rede, Prioridade e DR/BDR",
  difficulty: "Intermediário",
  duration: "50 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  scenario: "Você está desenhando a topologia de um escritório: R1 é o roteador de distribuição, conectado a R2 por um segmento que hoje é um link direto mas amanhã pode virar um switch compartilhado com mais roteadores (por isso continua como tipo broadcast), e conectado a R3 por um link dedicado ponto-a-ponto que nunca vai ter um terceiro roteador (um enlace de WAN contratado). Cada tipo de link pede um tratamento diferente do OSPF: no primeiro, a eleição de DR/BDR importa e precisa ser controlada; no segundo, ela é pura sobrecarga desnecessária.",
  routers: ["R1", "R2", "R3"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R1", "eth2", "R3", "eth1"],
  ],

  variables: {
    r1Priority: { pool: ["5", "10", "50", "100"] },
  },

  autoGrade: [
    { id: "checked_neighbors", label: "Verificou vizinhos OSPF", cmdContains: "show ip ospf neighbor" },
    { id: "checked_interface", label: "Verificou tipo de rede da interface", cmdContains: "show ip ospf interface" },
    { id: "priority_changed", label: "Alterou a prioridade de R1", cmdContains: "ip ospf priority" },
    { id: "ptp_changed", label: "Mudou o tipo de rede para point-to-point", cmdContains: "ip ospf network point-to-point" },
  ],

  verifications: [
    {
      id: "adjacencies_full",
      label: "R1 mantém adjacência Full com R2 e R3 durante todo o processo",
      weight: 15,
      check: {
        router: "R1",
        cmdPattern: "show ip ospf neighbor",
        outputPattern: "(?=[\\s\\S]*2\\.2\\.2\\.2[\\s\\S]*Full)(?=[\\s\\S]*3\\.3\\.3\\.3[\\s\\S]*Full)",
      },
    },
    {
      id: "r1_priority_configured",
      label: "R1 configurado com ip ospf priority {{r1Priority}} na interface para R2",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip ospf priority {{r1Priority}}" },
    },
    {
      id: "r1_is_dr_final",
      label: "R1 passou a ser o DR do segmento R1-R2 (visto por R2)",
      weight: 25,
      check: { router: "R2", cmdPattern: "show ip ospf neighbor", outputPattern: "1\\.1\\.1\\.1[\\s\\S]*?Full/\\s*DR" },
    },
    {
      id: "ptp_configured_r1",
      label: "R1 configurado com tipo de rede point-to-point na interface para R3",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip ospf network point-to-point" },
    },
    {
      id: "ptp_configured_r3",
      label: "R3 configurado com tipo de rede point-to-point na interface para R1",
      weight: 15,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "ip ospf network point-to-point" },
    },
    {
      id: "ptp_no_dr_bdr",
      label: "Link R1-R3 não elege mais DR/BDR (visto por R1)",
      weight: 15,
      check: { router: "R1", cmdPattern: "show ip ospf neighbor", outputPattern: "3\\.3\\.3\\.3[\\s\\S]*?Full/\\s*-" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["r2", "router id maior", "maior router-id", "2.2.2.2", "router-id maior"],
      anyOf: true,
      points: 10,
      hint: "Com prioridade igual (1) nos dois lados, o desempate é pelo maior Router ID — compare 1.1.1.1 com 2.2.2.2.",
    },
    predict_step2: {
      type: "keywords",
      required: ["não", "nao", "sem dr", "não elege", "nao elege", "não há", "nao ha"],
      anyOf: true,
      points: 10,
      hint: "Point-to-point é justamente o tipo de rede que dispensa DR/BDR — só faz sentido em links com exatamente dois roteadores.",
    },
    q1: {
      type: "radio",
      correct: "Primeiro a prioridade mais alta; em caso de empate, o maior Router ID",
      points: 16,
    },
    q2: {
      type: "radio",
      correct: "O roteador nunca se torna DR nem BDR — permanece DROTHER para sempre",
      points: 16,
    },
    q3: {
      type: "radio",
      correct: "Porque um link ponto-a-ponto nunca terá um terceiro roteador, então a eleição de DR/BDR é uma sobrecarga sem benefício",
      points: 16,
    },
    q4: {
      type: "radio",
      correct: "Não — a eleição de DR não é preemptiva; o DR atual continua sendo DR até sair do ar ou o processo OSPF reiniciar",
      points: 16,
    },
    q5: {
      type: "radio",
      correct: "ip ospf network point-to-point",
      points: 16,
    },
  },

  steps: [
    {
      id: 1,
      title: "Observar a eleição padrão de DR/BDR",
      theory: "Em segmentos de rede do tipo broadcast (o padrão para interfaces Ethernet/veth no FRR), o OSPF elege um Designated Router (DR) e um Backup Designated Router (BDR) — isso reduz o número de adjacências full-mesh que precisariam existir se houvesse muitos roteadores no mesmo segmento: os demais roteadores (DROTHER) formam adjacência completa só com o DR e o BDR, não uns com os outros.\n\nA eleição funciona assim: vence quem tiver a maior prioridade OSPF configurada na interface (padrão: 1). Em caso de empate de prioridade, desempata o maior Router ID — não o endereço IP da interface, o Router ID do processo OSPF inteiro.\n\nNeste lab, R1 (Router ID 1.1.1.1) e R2 (Router ID 2.2.2.2) estão no mesmo segmento broadcast, ambos com prioridade padrão (1).",
      description: "Antes de rodar os comandos, responda à previsão abaixo. Depois verifique quem foi eleito DR no segmento R1-R2.",
      commands: [
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Estado da adjacência com R2, incluindo o papel (DR/BDR/DROTHER)" },
        { cmd: "show ip ospf interface eth1", router: "R1", desc: "Tipo de rede, prioridade e papel local de R1 nesta interface" },
      ],
      expected: "R2 (Router ID 2.2.2.2, maior que 1.1.1.1) é eleito DR. R1 se torna BDR. Como só há dois roteadores no segmento, não há nenhum DROTHER.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar os comandos: com prioridade padrão (1) nos dois lados, qual roteador você espera que vença a eleição de DR no segmento R1-R2 — R1 ou R2? Por quê?",
      },
    },
    {
      id: 2,
      title: "Tipo de rede: broadcast × point-to-point",
      theory: "O tipo de rede OSPF de uma interface é uma propriedade configurada, não uma característica física obrigatória do link — mesmo um link ponto-a-ponto de verdade (como este entre R1 e R3) vem com tipo broadcast por padrão em interfaces Ethernet/veth, e por isso também elege DR/BDR, mesmo que nunca vá existir um terceiro roteador ali.\n\nQuando um link é sabidamente ponto-a-ponto (uma WAN contratada, por exemplo), o tipo de rede pode ser explicitamente mudado para point-to-point com 'ip ospf network point-to-point' — isso remove a eleição de DR/BDR daquele link inteiramente: os dois lados simplesmente formam Full um com o outro, sem papéis.",
      description: "Primeiro observe que o link R1-R3 também está elegendo DR/BDR por padrão (mesmo problema do passo 1, só que aqui não faz sentido nenhum). Depois mude o tipo de rede nos dois lados:\n\nEm R1:\n  configure terminal\n  interface eth2\n   ip ospf network point-to-point\n  end\n\nEm R3:\n  configure terminal\n  interface eth1\n   ip ospf network point-to-point\n  end\n\nOs dois lados de um mesmo link precisam ter o mesmo tipo de rede configurado, senão a adjacência quebra.",
      commands: [
        { cmd: "show ip ospf neighbor", router: "R1", desc: "ANTES: R3 aparece com algum papel (DR/BDR)?" },
        { cmd: "show running-config", router: "R1", desc: "Confirme 'ip ospf network point-to-point' na interface eth2" },
        { cmd: "show running-config", router: "R3", desc: "Confirme 'ip ospf network point-to-point' na interface eth1" },
        { cmd: "show ip ospf neighbor", router: "R1", desc: "DEPOIS: o papel de R3 desapareceu da adjacência?" },
        { cmd: "show ip ospf interface eth2", router: "R1", desc: "Confirme 'Network Type POINTOPOINT'" },
      ],
      expected: "Depois da mudança, R1 e R3 continuam Full um com o outro, mas sem nenhum papel de DR/BDR — o campo de estado aparece como 'Full/ -'.",
      predict: {
        id: "predict_step2",
        prompt: "Depois de mudar o tipo de rede do link R1-R3 para point-to-point nos dois lados, você espera que a eleição de DR/BDR ainda aconteça nesse link?",
      },
    },
    {
      id: 3,
      title: "Forçar R1 a vencer a eleição em R1-R2",
      theory: "Prioridade é o PRIMEIRO critério de desempate — antes até do Router ID. Um detalhe importante e pouco intuitivo: a eleição de DR não é preemptiva. Se você mudar a prioridade de um roteador depois que o DR já foi eleito, isso NÃO troca o DR na hora — o DR atual continua DR até sair do ar (interface cair, processo reiniciar) ou até uma nova eleição ser forçada manualmente. Por isso, depois de mudar a prioridade, é preciso usar 'clear ip ospf process' para forçar uma nova eleição.",
      description: "Em R1, aumente a prioridade da interface para R2 acima do padrão (1):\n\n  configure terminal\n  interface eth1\n   ip ospf priority {{r1Priority}}\n  end\n  clear ip ospf process\n\nDepois confirme em R2 que R1 passou a ser o DR.",
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme ip ospf priority {{r1Priority}} na interface eth1" },
        { cmd: "clear ip ospf process", router: "R1", desc: "Força nova eleição de DR/BDR" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "R1 (1.1.1.1) já aparece como DR?" },
      ],
      expected: "Depois de 'clear ip ospf process', R1 (prioridade {{r1Priority}}, maior que a de R2) é eleito o novo DR do segmento.",
    },
  ],

  challenge: {
    title: "Desafio: Controle de Tipo de Rede e Eleição",
    description: "Consolide o que foi observado e configurado:\n\n1. R1 deve estar com prioridade {{r1Priority}} na interface para R2, e ser o DR desse segmento.\n2. O link R1-R3 deve estar com tipo de rede point-to-point nos dois lados, sem DR/BDR.\n3. As duas adjacências (R1-R2 e R1-R3) devem continuar Full durante todo o processo.\n4. Responda as questões objetivas sobre os critérios de eleição e tipos de rede.",
    hints: [
      "A prioridade é o primeiro critério; o Router ID só desempata quando a prioridade é igual",
      "Prioridade 0 é diferente de prioridade baixa — 0 significa 'nunca virar DR/BDR'",
      "Mudar a prioridade não troca o DR sozinho — é preciso forçar nova eleição",
      "point-to-point precisa estar configurado nos DOIS lados do link",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "Qual é a ordem correta dos critérios de eleição de DR num segmento broadcast?",
        options: [
          "Primeiro a prioridade mais alta; em caso de empate, o maior Router ID",
          "Primeiro o maior Router ID; a prioridade nunca é usada",
          "Sempre o roteador que subiu primeiro, independente de prioridade",
          "Primeiro o menor endereço IP da interface",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "O que acontece quando um roteador tem prioridade OSPF configurada como 0 numa interface?",
        options: [
          "Ele sempre vence a eleição, prioridade 0 é tratada como infinita",
          "O roteador nunca se torna DR nem BDR — permanece DROTHER para sempre",
          "O OSPF é desabilitado nessa interface",
          "Ele vira automaticamente BDR, nunca DR",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Por que faz sentido configurar 'point-to-point' num link WAN dedicado que nunca terá um terceiro roteador?",
        options: [
          "Porque point-to-point aumenta a banda disponível no link",
          "Porque um link ponto-a-ponto nunca terá um terceiro roteador, então a eleição de DR/BDR é uma sobrecarga sem benefício",
          "Porque links point-to-point não podem redistribuir rotas",
          "Porque o tipo broadcast não permite formar adjacência Full",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Depois que um DR já foi eleito num segmento, mudar a prioridade de outro roteador para um valor mais alto troca o DR imediatamente?",
        options: [
          "Sim, a mudança de prioridade sempre força uma nova eleição instantânea",
          "Não — a eleição de DR não é preemptiva; o DR atual continua sendo DR até sair do ar ou o processo OSPF reiniciar",
          "Sim, mas só se o novo roteador tiver Router ID maior também",
          "Não, a prioridade só pode ser mudada uma vez por sessão OSPF",
        ],
      },
      {
        id: "q5",
        type: "radio",
        text: "Qual comando muda o tipo de rede de uma interface OSPF para eliminar a eleição de DR/BDR?",
        options: [
          "ip ospf priority 0",
          "ip ospf network point-to-point",
          "no ip ospf area",
          "ip ospf passive-interface",
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
interface eth2
 ip address 10.0.13.1/30
!
router ospf
 ospf router-id 1.1.1.1
 network 10.0.12.0/30 area 0
 network 10.0.13.0/30 area 0
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
router ospf
 ospf router-id 2.2.2.2
 network 10.0.12.0/30 area 0
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
 ip address 10.0.13.2/30
!
router ospf
 ospf router-id 3.3.3.3
 network 10.0.13.0/30 area 0
 network 3.3.3.3/32 area 0
!
`,
};

module.exports = lab;
