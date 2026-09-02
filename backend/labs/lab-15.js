/**
 * Lab 15 — OSPF Nível 6: Virtual Links e Autenticação
 * Fecha a trilha OSPF (curriculum backlog, nível 6 "avançados").
 * Escolhidos dois dos quatro tópicos avançados listados no plano
 * (virtual links + autenticação) para manter o lab coeso em vez de
 * raso em quatro frentes; redistribuição/filtragem e timers ficam
 * para uma leva futura, quando fizer sentido combiná-los com um
 * cenário de borda (ex.: trilha OSPF+BGP).
 */

const lab = {
  id: 15,
  protocol: "ospf",
  level: 6,
  title: "OSPF — Virtual Links e Autenticação",
  topic: "Área Desconectada, Virtual Link e Autenticação MD5",
  difficulty: "Avançado",
  duration: "70 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  scenario: "Sua empresa acabou de incorporar a rede de uma filial recém-adquirida. Durante a integração, a área OSPF da filial (área 2) foi conectada apenas à área de trânsito de um datacenter regional (área 1) — ninguém percebeu que ela nunca chega à área 0 (backbone) diretamente, violando a regra fundamental do OSPF de que toda área precisa de conexão com o backbone. Em vez de recablear fisicamente a rede (caro e arriscado), você vai usar um virtual link para estender logicamente a área 0 através da área de trânsito. Como essa filial é uma aquisição recente e ainda não totalmente confiável, você também vai adicionar autenticação MD5 no link do backbone para impedir que um roteador não autorizado participe do OSPF ali.",
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
    ["R3", "eth2", "R4", "eth1"],
  ],

  variables: {
    mdKey: { pool: ["S3guraBackbone1", "Chave2024Ospf", "R00tAuthKey9", "TransitoSegur0"] },
  },

  autoGrade: [
    { id: "checked_neighbors", label: "Verificou vizinhos OSPF", cmdContains: "show ip ospf neighbor" },
    { id: "checked_route", label: "Verificou se R1 alcança a rede de R4", cmdContains: "show ip route" },
    { id: "vlink_configured", label: "Configurou o virtual link", cmdContains: "virtual-link" },
    { id: "auth_configured", label: "Configurou autenticação MD5", cmdContains: "message-digest" },
  ],

  verifications: [
    {
      id: "chain_full_r2",
      label: "R2 tem adjacência Full com R1 (área 0) e R3 (área 1)",
      weight: 10,
      check: {
        router: "R2",
        cmdPattern: "show ip ospf neighbor",
        outputPattern: "(?=[\\s\\S]*1\\.1\\.1\\.1[\\s\\S]*Full)(?=[\\s\\S]*3\\.3\\.3\\.3[\\s\\S]*Full)",
      },
    },
    {
      id: "chain_full_r3",
      label: "R3 tem adjacência Full com R2 (área 1) e R4 (área 2)",
      weight: 10,
      check: {
        router: "R3",
        cmdPattern: "show ip ospf neighbor",
        outputPattern: "(?=[\\s\\S]*2\\.2\\.2\\.2[\\s\\S]*Full)(?=[\\s\\S]*4\\.4\\.4\\.4[\\s\\S]*Full)",
      },
    },
    {
      id: "virtual_link_r2",
      label: "R2 configurado com virtual-link para R3 através da área 1",
      weight: 15,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "area 1 virtual-link 3\\.3\\.3\\.3" },
    },
    {
      id: "virtual_link_r3",
      label: "R3 configurado com virtual-link para R2 através da área 1",
      weight: 15,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "area 1 virtual-link 2\\.2\\.2\\.2" },
    },
    {
      id: "r4_route_visible_r1",
      label: "R1 (área 0) enxerga a rede de R4 (área 2) — prova de que o virtual link funcionou",
      weight: 20,
      check: { router: "R1", cmdPattern: "show ip route 4\\.4\\.4\\.4", outputPattern: "4\\.4\\.4\\.4" },
    },
    {
      id: "auth_area_configured",
      label: "Autenticação message-digest exigida na área 0",
      weight: 10,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "area 0\\.0\\.0\\.0 authentication message-digest|area 0 authentication message-digest" },
    },
    {
      id: "auth_key_r1",
      label: "R1 configurado com a chave MD5 {{mdKey}} na interface do backbone",
      weight: 10,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip ospf message-digest-key 1 md5 {{mdKey}}" },
    },
    {
      id: "auth_key_r2",
      label: "R2 configurado com a mesma chave MD5 {{mdKey}} do lado do backbone",
      weight: 10,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "ip ospf message-digest-key 1 md5 {{mdKey}}" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["não", "nao", "área 0", "area 0", "desconectada", "sem conexão", "sem conexao"],
      anyOf: true,
      points: 10,
      hint: "Toda área OSPF precisa de conexão com a área 0 (direta ou via virtual link) para suas rotas se propagarem para o resto da rede.",
    },
    predict_step3: {
      type: "keywords",
      required: ["não", "nao", "cai", "quebra", "descarta", "rejeitad"],
      anyOf: true,
      points: 10,
      hint: "Autenticação MD5 verifica cada pacote Hello — se a chave não bater dos dois lados, o pacote é descartado como se o vizinho não existisse.",
    },
    q1: {
      type: "radio",
      correct: "Porque o único ABR da área 2 (R3) não tem nenhuma interface na área 0, e toda comunicação inter-área precisa passar pela área 0",
      points: 16,
    },
    q2: {
      type: "radio",
      correct: "Cria uma adjacência lógica ponto-a-ponto que estende a área 0 através de uma área de trânsito, sem precisar de um link físico direto",
      points: 16,
    },
    q3: {
      type: "radio",
      correct: "Nos dois ABRs, referenciando a área de trânsito e o Router ID do outro ABR",
      points: 16,
    },
    q4: {
      type: "radio",
      correct: "Exige que todos os roteadores daquela área autentiquem pacotes OSPF com MD5, usando a chave configurada em cada interface",
      points: 16,
    },
    q5: {
      type: "radio",
      correct: "A adjacência não se forma (ou cai) — pacotes Hello com autenticação incorreta são descartados",
      points: 16,
    },
  },

  steps: [
    {
      id: 1,
      title: "Diagnosticar a área desconectada do backbone",
      theory: "Toda área OSPF, exceto a própria área 0 (backbone), precisa ter conexão com a área 0 — direta (um ABR com uma interface em área 0) ou lógica (um virtual link). Essa regra existe porque o OSPF só propaga rotas inter-área PASSANDO pela área 0: uma área nunca troca rotas diretamente com outra área, sempre via backbone.\n\nNeste lab: R1 está sozinho na área 0. R2 é ABR entre a área 0 e a área 1 (área de trânsito). R3 é ABR entre a área 1 e a área 2 (a filial recém-adquirida) — mas R3 NÃO tem nenhuma interface na área 0. A área 2 está, portanto, tecnicamente desconectada do backbone, mesmo com todos os links fisicamente up e todas as adjacências locais Full.",
      description: "Antes de configurar qualquer coisa, confirme que as adjacências locais estão Full (o problema não é de adjacência) e verifique se R1 já enxerga a rede de R4.",
      commands: [
        { cmd: "show ip ospf neighbor", router: "R2", desc: "R2 deve mostrar R1 e R3, ambos Full" },
        { cmd: "show ip ospf neighbor", router: "R3", desc: "R3 deve mostrar R2 e R4, ambos Full" },
        { cmd: "show ip route ospf", router: "R1", desc: "R1 enxerga alguma rota vinda da área 2?" },
        { cmd: "show ip route 4.4.4.4", router: "R1", desc: "R1 tem rota para o loopback de R4?" },
      ],
      expected: "Todas as adjacências locais (R1-R2, R2-R3, R3-R4) estão Full — o link físico e o Hello funcionam normalmente. Mesmo assim, R1 NÃO tem nenhuma rota para 4.4.4.4 (rede de R4, área 2): a área 2 está sem conexão com o backbone.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar os comandos: você espera que R1 (área 0) já enxergue a rede de R4 (área 2) via OSPF, mesmo sem nenhum roteador da área 2 conectado diretamente à área 0? Por quê?",
      },
    },
    {
      id: 2,
      title: "Configurar o Virtual Link",
      theory: "Um virtual link cria uma adjacência OSPF lógica entre dois ABRs, atravessando uma área de trânsito (que precisa ela mesma já estar conectada à área 0 — não pode ser stub). O FRR trata essa adjacência lógica como se fosse uma interface point-to-point pertencente à área 0, mesmo sem nenhum cabo físico dedicado.\n\nO comando é configurado nos DOIS ABRs das pontas, referenciando a área de trânsito e o Router ID do outro ABR:\n\n  router ospf\n   area <área-de-trânsito> virtual-link <router-id-do-outro-ABR>",
      description: "Configure o virtual link entre R2 e R3, usando a área 1 como trânsito:\n\nEm R2:\n  configure terminal\n  router ospf\n   area 1 virtual-link 3.3.3.3\n  end\n\nEm R3:\n  configure terminal\n  router ospf\n   area 1 virtual-link 2.2.2.2\n  end",
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme 'area 1 virtual-link 3.3.3.3'" },
        { cmd: "show running-config", router: "R3", desc: "Confirme 'area 1 virtual-link 2.2.2.2'" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "Deve aparecer um novo vizinho: 3.3.3.3, via a interface virtual-link" },
      ],
      expected: "R2 e R3 formam uma nova adjacência Full entre si, marcada como virtual link (área 0.0.0.0).",
    },
    {
      id: 3,
      title: "Confirmar a rota e proteger o backbone com autenticação MD5",
      theory: "Com o virtual link ativo, R3 passa a ser considerado 'conectado à área 0', e volta a originar corretamente os Summary LSAs da área 2 para dentro da área 1 — que R2 então propaga para dentro da área 0.\n\nComo esta é uma filial recém-adquirida (ainda não totalmente confiável), vale proteger o link do backbone (R1-R2) contra um roteador não autorizado tentando formar adjacência ali. Autenticação MD5 no OSPF tem duas partes: a área inteira precisa exigir autenticação ('area <id> authentication message-digest'), e cada interface daquela área precisa da chave MD5 ('ip ospf message-digest-key 1 md5 <chave>'). As duas pontas do link precisam usar a MESMA chave — se forem diferentes, os pacotes Hello são rejeitados e a adjacência cai.",
      description: "Primeiro confirme que R1 já enxerga a rede de R4. Depois configure autenticação MD5 no link R1-R2 (área 0):\n\nEm R1:\n  configure terminal\n  router ospf\n   area 0 authentication message-digest\n  interface eth1\n   ip ospf message-digest-key 1 md5 {{mdKey}}\n  end\n\nEm R2:\n  configure terminal\n  interface eth1\n   ip ospf message-digest-key 1 md5 {{mdKey}}\n  end",
      commands: [
        { cmd: "show ip route 4.4.4.4", router: "R1", desc: "Confirme que a rota de R4 agora existe" },
        { cmd: "show running-config", router: "R1", desc: "Confirme 'area 0 authentication message-digest' e a chave MD5" },
        { cmd: "show running-config", router: "R2", desc: "Confirme a mesma chave MD5 do lado de R2" },
        { cmd: "show ip ospf neighbor", router: "R1", desc: "A adjacência com R2 continua Full mesmo com autenticação ativa?" },
      ],
      expected: "R1 agora tem rota para 4.4.4.4 via OSPF inter-área. A adjacência R1-R2 continua Full — a autenticação só bloqueia vizinhos com chave incorreta ou ausente, não afeta quem já está configurado corretamente dos dois lados.",
      predict: {
        id: "predict_step3",
        prompt: "Se as chaves MD5 configuradas em R1 e R2 fossem diferentes uma da outra, você espera que a adjacência OSPF entre eles continuasse Full?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Backbone Estendido e Protegido",
    description: "Consolide a integração da filial:\n\n1. O virtual link entre R2 e R3 (área de trânsito 1) deve estar configurado nos dois lados.\n2. R1 (área 0) deve enxergar a rede de R4 (área 2) via OSPF — prova de que a área 2 está efetivamente conectada ao backbone.\n3. O link R1-R2 (backbone) deve exigir autenticação MD5 com a chave {{mdKey}} dos dois lados.\n4. Todas as adjacências (R1-R2, R2-R3, R3-R4, e a virtual do virtual link) devem continuar Full.\n5. Responda as questões objetivas sobre virtual links e autenticação OSPF.",
    hints: [
      "O virtual link é configurado nos dois ABRs, nunca no roteador do meio de uma área normal",
      "A área de trânsito de um virtual link precisa ela mesma estar conectada à área 0",
      "'area X authentication message-digest' liga a exigência de autenticação na área inteira; a chave é por interface",
      "As duas pontas de um link autenticado precisam da mesma chave MD5",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "Por que a área 2 não tinha suas rotas propagadas para a área 0 antes do virtual link ser configurado?",
        options: [
          "Porque a área 2 estava configurada como stub",
          "Porque o único ABR da área 2 (R3) não tem nenhuma interface na área 0, e toda comunicação inter-área precisa passar pela área 0",
          "Porque o custo OSPF da interface de R4 estava muito alto",
          "Porque R4 não tinha nenhum vizinho Full",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "O que um virtual link faz, na prática?",
        options: [
          "Cria um túnel IP-in-IP entre dois roteadores quaisquer da rede",
          "Cria uma adjacência lógica ponto-a-ponto que estende a área 0 através de uma área de trânsito, sem precisar de um link físico direto",
          "Substitui a necessidade de configurar áreas OSPF",
          "Aumenta a banda disponível entre duas áreas",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Onde o virtual link deve ser configurado?",
        options: [
          "Apenas no roteador mais próximo da área 0",
          "Nos dois ABRs, referenciando a área de trânsito e o Router ID do outro ABR",
          "Em todos os roteadores da área de trânsito",
          "Apenas no roteador que originou a rota problemática",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Qual é o efeito de configurar 'area 0 authentication message-digest'?",
        options: [
          "Criptografa todo o tráfego de dados que passa pelos roteadores da área",
          "Exige que todos os roteadores daquela área autentiquem pacotes OSPF com MD5, usando a chave configurada em cada interface",
          "Bloqueia toda a área para redistribuição de rotas externas",
          "Desabilita a eleição de DR/BDR na área",
        ],
      },
      {
        id: "q5",
        type: "radio",
        text: "O que acontece se as chaves MD5 dos dois lados de um link OSPF forem diferentes?",
        options: [
          "A adjacência se forma normalmente, a autenticação é só um log de auditoria",
          "A adjacência não se forma (ou cai) — pacotes Hello com autenticação incorreta são descartados",
          "O OSPF usa automaticamente a chave mais forte entre as duas",
          "Apenas as rotas externas deixam de ser aceitas, a adjacência continua",
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
 network 10.0.23.0/30 area 1
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
interface eth2
 ip address 10.0.34.1/30
!
router ospf
 ospf router-id 3.3.3.3
 network 10.0.23.0/30 area 1
 network 10.0.34.0/30 area 2
 network 3.3.3.3/32 area 1
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
 network 4.4.4.4/32 area 2
!
`,
};

module.exports = lab;
