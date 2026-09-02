/**
 * Lab 10 — OSPF: Diagnóstico de Falha de Adjacência e Seleção de Caminho
 * Piloto do novo padrão pedagógico: falha proposital (aleatorizada por
 * sessão), previsão antes de verificar, e desafio de custo OSPF.
 */

const lab = {
  id: 10,
  protocol: "ospf",
  title: "OSPF — Diagnóstico de Falha de Adjacência e Seleção de Caminho",
  topic: "Área OSPF, Adjacências e Custo",
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
    ["R1", "eth2", "R3", "eth1"],
    ["R2", "eth2", "R4", "eth1"],
    ["R3", "eth2", "R4", "eth2"],
  ],

  // Cada sessão resolve estes valores de forma determinística — o número de
  // área errada e o custo do desafio mudam de aluno para aluno.
  variables: {
    wrongArea: { pool: ["1", "2", "3", "4"] },
    preferCost: { pool: ["15", "25", "40", "60"] }, // sempre > 10 (custo padrão destes links)
  },

  autoGrade: [
    { id: "checked_neighbors", label: "Verificou vizinhos OSPF", cmdContains: "show ip ospf neighbor" },
    { id: "checked_interface", label: "Investigou área da interface", cmdContains: "show ip ospf interface" },
    { id: "area_fixed_live", label: "Área corrigida para 0 em R2", cmdContains: "network 10.0.12.0/30 area 0" },
    { id: "cost_applied_live", label: "Aplicou custo OSPF", cmdContains: "ip ospf cost" },
  ],

  verifications: [
    {
      id: "ospf_both_full",
      label: "Adjacências OSPF Full com R2 e R3 confirmadas em R1",
      weight: 25,
      check: {
        router: "R1",
        cmdPattern: "show ip ospf neighbor",
        outputPattern: "(?=[\\s\\S]*2\\.2\\.2\\.2[\\s\\S]*Full)(?=[\\s\\S]*3\\.3\\.3\\.3[\\s\\S]*Full)",
      },
    },
    {
      id: "area_corrected",
      label: "Área OSPF corrigida para 0 na rede 10.0.12.0/30 em R2",
      weight: 20,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "network 10\\.0\\.12\\.0/30 area 0" },
    },
    {
      id: "challenge_path_via_r2",
      label: "R1 passou a preferir o caminho via R2 para 172.16.40.0/24 (desafio)",
      weight: 25,
      check: { router: "R1", cmdPattern: "show ip route 172\\.16\\.40\\.0", outputPattern: "10\\.0\\.12\\.2" },
    },
    {
      id: "cost_applied_r1",
      label: "Custo OSPF aumentado na interface de R1 voltada para R3",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip ospf cost" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["área", "area", "hello"],
      anyOf: true,
      points: 10,
      hint: "Pense no que o pacote Hello carrega e no que acontece quando ele não bate dos dois lados.",
    },
    predict_step2: {
      type: "keywords",
      required: ["diferente", "mismatch", "errada", "incompatível"],
      anyOf: true,
      points: 10,
      hint: "Compare literalmente o valor de área mostrado em cada ponta do link.",
    },
    q1: {
      type: "radio",
      correct: "Porque a Area ID configurada nas duas pontas do link é diferente, e o pacote Hello com Area ID incompatível é descartado silenciosamente",
      points: 20,
    },
    q2: {
      type: "radio",
      correct: "show ip ospf interface",
      points: 15,
    },
    q3: {
      type: "radio",
      correct: "Banda de referência dividida pela banda da interface",
      points: 15,
    },
    q4: {
      type: "radio",
      correct: "ECMP — Equal-Cost Multi-Path, balanceamento entre caminhos de custo igual",
      points: 15,
    },
    q5: {
      type: "radio",
      correct: "Aumentar o custo OSPF na interface de R1 voltada para R3",
      points: 15,
    },
  },

  steps: [
    {
      id: 1,
      title: "Verificar adjacências OSPF",
      theory: "OSPF forma adjacências trocando pacotes Hello entre roteadores conectados diretamente. Para a adjacência se formar, vários parâmetros precisam bater nos dois lados do link: a Area ID, a máscara de rede (em redes broadcast), o intervalo de Hello/Dead, entre outros. Quando a Area ID configurada localmente na interface não bate com a do vizinho, o roteador que recebe o Hello simplesmente descarta o pacote — não há nenhuma mensagem de erro visível, o vizinho apenas nunca aparece.\n\nNeste lab, R1 se conecta diretamente a R2 e a R3. Os dois links deveriam estar na área 0. Antes de mexer em qualquer configuração, observe o que já está funcionando e o que não está.",
      description: "Rode 'show ip ospf neighbor' em R1, R2, R3 e R4. Anote quais adjacências aparecem como Full e quais roteadores diretamente conectados simplesmente não aparecem na lista.",
      commands: [
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Vizinhos de R1" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "Vizinhos de R2" },
        { cmd: "show ip ospf neighbor", router: "R3", desc: "Vizinhos de R3" },
        { cmd: "show ip ospf neighbor", router: "R4", desc: "Vizinhos de R4" },
      ],
      expected: "R1 deve mostrar R3 (3.3.3.3) como Full. R2 não deve aparecer na lista de vizinhos de R1, mesmo com o link fisicamente conectado.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar os comandos acima, quantos vizinhos você espera ver em R1 (ele está conectado diretamente a R2 e R3)? Escreva sua expectativa e o motivo.",
      },
    },
    {
      id: 2,
      title: "Investigar a interface suspeita",
      theory: "O comando 'show ip ospf interface <nome>' mostra, entre outras coisas, a Area ID configurada localmente naquela interface, o custo OSPF, o tipo de rede e o estado (DR/BDR/DROTHER). É o comando certo para investigar uma adjacência que deveria existir e não existe: compare a área mostrada em cada ponta do mesmo link.",
      description: "Rode 'show ip ospf interface eth1' em R1 e em R2 (a interface voltada uma para a outra). Compare o valor de 'Area' nos dois outputs.",
      commands: [
        { cmd: "show ip ospf interface eth1", router: "R1", desc: "Área configurada em R1" },
        { cmd: "show ip ospf interface eth1", router: "R2", desc: "Área configurada em R2" },
      ],
      expected: "A área mostrada em R1 para esta interface é 0.0.0.0 (área 0). A área mostrada em R2 é diferente — esse é o motivo da adjacência não se formar.",
      predict: {
        id: "predict_step2",
        prompt: "Compare a área que você espera encontrar em R1 e em R2 para este link. Elas deveriam ser iguais ou diferentes para a adjacência funcionar?",
      },
    },
    {
      id: 3,
      title: "Corrigir a área e confirmar a adjacência",
      theory: "O FRR não deixa reemitir 'network <prefixo> area <area>' com uma área diferente por cima de uma já existente para o mesmo prefixo — ele recusa com 'There is already same network statement'. É preciso remover a associação errada primeiro com 'no network <prefixo> area <área-errada>' e só depois adicionar a correta. Depois de corrigir, use 'clear ip ospf process' para forçar o OSPF a reiniciar as adjacências sem precisar reiniciar o roteador inteiro.",
      description: "Em R2, entre em 'router ospf' e remova a associação de área errada que você encontrou no passo anterior com 'no network 10.0.12.0/30 area <área-errada>', depois adicione a correta com 'network 10.0.12.0/30 area 0'. Rode 'clear ip ospf process' e confirme que R1 e R2 formam adjacência Full (a eleição de DR/BDR pode levar uns 20-30s).\n\nExemplo em R2 (substitua <área-errada> pelo valor que você viu em 'show ip ospf interface'):\n  configure terminal\n  router ospf\n   no network 10.0.12.0/30 area <área-errada>\n   network 10.0.12.0/30 area 0\n  end\n  clear ip ospf process",
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme a área corrigida" },
        { cmd: "show ip ospf neighbor", router: "R1", desc: "R1 deve agora mostrar R2 e R3, ambos Full" },
      ],
      expected: "R1 mostra dois vizinhos Full: 2.2.2.2 (R2) e 3.3.3.3 (R3).",
    },
    {
      id: 4,
      title: "Observar ECMP antes de mexer no custo",
      theory: "A rede 172.16.40.0/24 não é uma interface OSPF de verdade em R4 — é uma rota estática (para Null0) redistribuída no OSPF via 'redistribute static', o que a torna uma rota externa (Type-5 / E2 na tabela de rotas). Rotas E2 são comparadas primeiro pelo custo externo (igual nos dois caminhos, pois é a mesma rota redistribuída); em caso de empate, o desempate é o custo interno até o ASBR que originou a rota — no caso, R4. Como as quatro interfaces do lab têm a mesma banda e portanto o mesmo custo OSPF padrão, esse custo interno também empata entre o caminho via R2 e via R3, e o OSPF instala os dois simultaneamente na tabela de rotas — isso se chama ECMP (Equal-Cost Multi-Path). É exatamente esse desempate por custo interno que o desafio a seguir vai explorar.",
      description: "Verifique a tabela de rotas de R1 para 172.16.40.0/24 e observe quantos next-hops aparecem.",
      commands: [
        { cmd: "show ip route 172.16.40.0/24", router: "R1", desc: "Rota(s) para a rede de R4" },
        { cmd: "show ip ospf route", router: "R1", desc: "Tabela de rotas OSPF completa" },
      ],
      expected: "R1 mostra 172.16.40.0/24 alcançável por dois next-hops de custo igual: via R2 (10.0.12.2) e via R3 (10.0.13.2).",
    },
  ],

  challenge: {
    title: "Desafio: Forçar o Caminho via R2",
    description: "Objetivo: depois de corrigir a adjacência e observar o ECMP, force R1 a preferir exclusivamente o caminho via R2 para alcançar 172.16.40.0/24 — sem desligar nenhum link.\n\nO custo OSPF é por interface e por sentido: o que importa para a decisão de R1 é o custo das interfaces DELE MESMO (R1), não das interfaces de R2 ou R3. Em R1, aumente o custo da interface voltada para R3 (eth2) para um valor maior que o padrão (10), usando 'ip ospf cost {{preferCost}}'. Isso torna o caminho via R3 menos atrativo, sem precisar mexer em nada em R2 ou R3.\n\nExemplo em R1:\n  configure terminal\n  interface eth2\n   ip ospf cost {{preferCost}}\n  end\n\nDepois de aplicar, confirme com 'show ip route 172.16.40.0/24' em R1 que sobrou apenas um next-hop: 10.0.12.2 (via R2).",
    hints: [
      "O comando 'ip ospf cost' é aplicado dentro do modo de configuração da interface, não dentro de 'router ospf'",
      "O custo que importa é o da interface do PRÓPRIO roteador que está decidindo o caminho (R1), não da outra ponta do link",
      "Maior custo = caminho menos atrativo no OSPF",
      "Depois de mudar o custo pode ser necessário aguardar alguns segundos para o SPF recalcular",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "Por que a adjacência OSPF entre R1 e R2 não se formava mesmo com o link fisicamente conectado?",
        options: [
          "Porque o endereço IP das interfaces estava em sub-redes diferentes",
          "Porque a Area ID configurada nas duas pontas do link é diferente, e o pacote Hello com Area ID incompatível é descartado silenciosamente",
          "Porque o daemon ospfd estava desligado em R2",
          "Porque o custo da interface estava configurado como 0",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "Qual comando revela a área OSPF configurada localmente em cada interface?",
        options: [
          "show ip ospf database",
          "show ip route ospf",
          "show ip ospf interface",
          "show ip ospf summary",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Como o FRR calcula o custo OSPF padrão de uma interface?",
        options: [
          "Sempre fixo em 10, independente da banda",
          "Banda de referência dividida pela banda da interface",
          "Número de saltos até o destino",
          "Prioridade configurada na interface",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Depois de igualar as áreas, R1 tinha dois caminhos de mesmo custo para 172.16.40.0/24. O que isso caracteriza?",
        options: [
          "Um loop de roteamento",
          "Split horizon",
          "ECMP — Equal-Cost Multi-Path, balanceamento entre caminhos de custo igual",
          "Route flapping",
        ],
      },
      {
        id: "q5",
        type: "radio",
        text: "Para forçar R1 a preferir o caminho via R2, qual abordagem funciona?",
        options: [
          "Aumentar o custo OSPF na interface de R1 voltada para R3",
          "Aumentar o custo OSPF na interface de R2 voltada para R1",
          "Configurar Local Preference maior em R2",
          "Desligar o OSPF em R3",
        ],
      },
    ],
  },
};

// frr_configs como template literals — {{wrongArea}} e {{preferCost}} são
// resolvidos por sessão (ver lab.variables e materializeLab em server.js).
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
 ip address 10.0.24.1/30
!
router ospf
 ospf router-id 2.2.2.2
 network 10.0.12.0/30 area {{wrongArea}}
 network 10.0.24.0/30 area 0
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
interface eth2
 ip address 10.0.34.1/30
!
router ospf
 ospf router-id 3.3.3.3
 network 10.0.13.0/30 area 0
 network 10.0.34.0/30 area 0
!
`,
  R4: `frr version 9.0
hostname R4
!
interface lo
 ip address 4.4.4.4/32
!
interface eth1
 ip address 10.0.24.2/30
!
interface eth2
 ip address 10.0.34.2/30
!
router ospf
 ospf router-id 4.4.4.4
 network 10.0.24.0/30 area 0
 network 10.0.34.0/30 area 0
 redistribute static
!
ip route 172.16.40.0/24 Null0
`,
};

module.exports = lab;
