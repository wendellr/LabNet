/**
 * Lab 2 — BGP Local Preference
 * Topic: Controle de Tráfego de Saída
 * Difficulty: Iniciante
 */

const lab = {
  "id": 2,
  "title": "BGP Local Preference",
  "topic": "Controle de Tráfego de Saída",
  "difficulty": "Iniciante",
  "duration": "40 min",
  "enabled": true,
  "resourceProfile": "leve",
  "routers": [
    "R1",
    "R2",
    "R3",
    "R4"
  ],
  "links": [
    [
      "R1",
      "eth1",
      "R2",
      "eth1"
    ],
    [
      "R1",
      "eth2",
      "R3",
      "eth1"
    ],
    [
      "R2",
      "eth2",
      "R4",
      "eth1"
    ]
  ],
  "autoGrade": [
    {
      "id": "ibgp_up",
      "label": "iBGP estabelecido (R1-R2)",
      "cmdContains": "show bgp summary",
      "outputContains": "Established"
    },
    {
      "id": "localpref_configured",
      "label": "Local Preference configurado",
      "cmdContains": "show running-config",
      "outputContains": "local-preference"
    },
    {
      "id": "localpref_200",
      "label": "Local Preference = 200",
      "cmdContains": "show ip bgp",
      "outputContains": "200"
    }
  ],
  "verifications": [
    {
      "id": "bgp_established",
      "label": "Sessões BGP verificadas",
      "weight": 15,
      "check": { "router": "R1", "cmdPattern": "show bgp summary", "outputPattern": "Established" }
    },
    {
      "id": "localpref_configured",
      "label": "Route-map com Local Preference configurada",
      "weight": 25,
      "check": { "router": "R2", "cmdPattern": "show running-config", "outputPattern": "set local-preference 200" }
    },
    {
      "id": "localpref_applied_in",
      "label": "Política aplicada inbound no vizinho eBGP",
      "weight": 20,
      "check": { "router": "R2", "cmdPattern": "show running-config", "outputPattern": "neighbor 30\\.0\\.0\\.1 route-map .* in" }
    },
    {
      "id": "localpref_visible",
      "label": "Local Preference 200 observado na tabela BGP",
      "weight": 25,
      "check": { "router": "R1", "cmdPattern": "show ip bgp", "outputPattern": "200" }
    },
    {
      "id": "soft_reset_used",
      "label": "Soft reset inbound usado para reaplicar a política",
      "weight": 15,
      "check": { "router": "R2", "cmdPattern": "clear bgp .*soft in", "outputPattern": "" }
    }
  ],
  "answerKey": {
    "q1": {
      "type": "radio",
      "correct": "100",
      "points": 10
    },
    "q2": {
      "type": "radio",
      "correct": "Porque é propagado apenas via iBGP dentro do AS, influenciando qual saída todos os roteadores internos preferem",
      "points": 20
    },
    "q3": {
      "type": "radio",
      "correct": "O caminho via R2, porque recebeu Local Preference 200 propagado via iBGP de R1",
      "points": 20
    },
    "q4": {
      "type": "radio",
      "correct": "Local Preference é propagado via iBGP dentro do AS; Weight é local apenas ao roteador onde foi configurado",
      "points": 20
    },
    "q5": {
      "type": "radio",
      "correct": "Weight",
      "points": 15
    },
    "q6": {
      "type": "radio",
      "correct": "clear bgp * soft in",
      "points": 15
    }
  },
  "steps": [
    {
      "id": 1,
      "title": "Verificar iBGP e eBGP",
      "theory": "Local Preference e um atributo usado dentro de um AS para controlar por qual saida o trafego deve sair. Maior Local Preference vence. Diferente do AS-PATH Prepend, que tenta influenciar ASes externos, Local Preference e uma decisao interna: os roteadores do mesmo AS recebem esse valor via iBGP e passam a concordar sobre a melhor saida.\n\nNeste lab, R1 e R2 pertencem ao AS1 e formam iBGP. R1 tambem tem uma saida eBGP para o AS3, enquanto R2 tem uma saida eBGP para o AS2. Antes de alterar politica, veja quais rotas cada roteador aprende e qual caminho fica preferido.",
      "description": "Verifique sessoes iBGP (R1-R2 no AS1) e eBGP (R1-AS3, R2-AS2). Observe a tabela BGP antes de configurar qualquer politica.",
      "commands": [
        {
          "cmd": "show bgp summary",
          "router": "R1",
          "desc": "Sessões no R1"
        },
        {
          "cmd": "show bgp summary",
          "router": "R2",
          "desc": "Sessões no R2"
        },
        {
          "cmd": "show ip bgp",
          "router": "R1",
          "desc": "Tabela BGP R1"
        },
        {
          "cmd": "show ip bgp",
          "router": "R2",
          "desc": "Tabela BGP R2"
        }
      ],
      "expected": "R1 e R2 devem ter iBGP estabelecido entre si e eBGP estabelecido com seus ASes externos."
    },
    {
      "id": 2,
      "title": "Configurar Local Preference",
      "theory": "Para alterar Local Preference em rotas recebidas de um vizinho, usamos route-map na direcao de entrada (in). A route-map pode ter match opcional. Quando nao ha match, ela se aplica a todas as rotas daquele vizinho.\n\nO comando chave e \"set local-preference 200\". Como 200 e maior que o padrao 100, as rotas recebidas por esse vizinho passam a ser mais atraentes dentro do AS1.\n\nApos aplicar a route-map inbound, use \"clear bgp * soft in\" para reaplicar a politica nas rotas recebidas sem derrubar sessoes BGP.",
      "description": "Configure R2 para definir Local Preference=200 nas rotas recebidas do AS2 pelo vizinho 30.0.0.1.\n\nExemplo em R2:\n  configure terminal\n  route-map SET_LP_AS2 permit 10\n   set local-preference 200\n  exit\n  router bgp 1\n   address-family ipv4 unicast\n    neighbor 30.0.0.1 route-map SET_LP_AS2 in\n  end\n  clear bgp * soft in\n\nDepois verifique em R1 e R2 se o valor 200 aparece nas rotas aprendidas do AS2.",
      "commands": [
        {
          "cmd": "show running-config",
          "router": "R2",
          "desc": "Confirme route-map e aplicação inbound"
        },
        {
          "cmd": "clear bgp * soft in",
          "router": "R2",
          "desc": "Aplica política"
        },
        {
          "cmd": "show ip bgp",
          "router": "R1",
          "desc": "R1 deve ver Local Preference 200 propagado via iBGP"
        },
        {
          "cmd": "show ip bgp",
          "router": "R2",
          "desc": "R2 deve marcar as rotas recebidas de AS2 com Local Preference 200"
        }
      ],
      "expected": "R1 mostra Local Preference=200 para rotas de AS2 via R2"
    },
    {
      "id": 3,
      "title": "Comparar Local Preference com Weight",
      "theory": "Weight e Local Preference parecem parecidos, mas tem escopos diferentes.\n\nWeight e local ao roteador onde foi configurado e nao e anunciado para nenhum vizinho. Local Preference e propagado por iBGP dentro do AS. Por isso, Local Preference e melhor para fazer todos os roteadores de um AS preferirem a mesma saida.\n\nNa ordem de decisao BGP, Weight vem antes de Local Preference. Mas, por ser local, Weight nao resolve sozinho uma politica de saida para todo o AS.",
      "description": "Compare a tabela BGP de R1 e R2 depois da politica. O objetivo e perceber que o atributo configurado em R2 influencia a decisao de R1 porque foi carregado pelo iBGP.",
      "commands": [
        {
          "cmd": "show ip bgp",
          "router": "R1",
          "desc": "Observe Local Preference recebido via iBGP"
        },
        {
          "cmd": "show ip bgp",
          "router": "R2",
          "desc": "Compare com a tabela local de R2"
        },
        {
          "cmd": "show running-config",
          "router": "R2",
          "desc": "Releia a policy aplicada inbound"
        }
      ],
      "expected": "A politica de Local Preference deve ser visivel dentro do AS1, enquanto Weight seria apenas local ao roteador configurado."
    }
  ],
  "challenge": {
    "title": "Desafio: Política de Saída Assimétrica",
    "description": "Garanta que o AS1 use Local Preference para preferir a saida desejada para rotas externas, sem usar Weight ou AS-Path Prepend.\n\nRequisitos:\n1. A politica deve ser aplicada inbound no roteador que recebe as rotas externas.\n2. O valor usado deve ser maior que o padrao.\n3. A verificacao deve mostrar Local Preference 200 na tabela BGP.\n4. Use soft reset inbound para reaplicar a politica sem derrubar sessoes.",
    "hints": [
      "Local Preference é propagado pelo iBGP dentro do AS",
      "Configure route-maps diferentes para cada vizinho eBGP",
      "Maior Local Preference = preferido"
    ],
    "questions": [
      {
        "id": "q1",
        "type": "radio",
        "text": "Qual o valor padrão de Local Preference no BGP?",
        "options": [
          "0",
          "100",
          "200",
          "1000"
        ]
      },
      {
        "id": "q2",
        "type": "radio",
        "text": "Por que o Local Preference é eficaz para controlar o tráfego de SAÍDA do AS?",
        "options": [
          "Porque é propagado via eBGP para todos os ASes vizinhos",
          "Porque é propagado apenas via iBGP dentro do AS, influenciando qual saída todos os roteadores internos preferem",
          "Porque tem maior prioridade que o Weight na ordem de decisão BGP",
          "Porque substitui o AS-PATH na seleção de melhor caminho"
        ]
      },
      {
        "id": "q3",
        "type": "radio",
        "text": "Você configurou Local Preference 200 no R1 para rotas recebidas de R2. O que R3 (iBGP peer de R1) vai preferir?",
        "options": [
          "O caminho via R4, porque R4 tem Local Preference padrão (100)",
          "O caminho via R2, porque recebeu Local Preference 200 propagado via iBGP de R1",
          "Nenhum caminho — Local Preference não é propagado para iBGP peers",
          "Depende do AS-PATH, que tem prioridade sobre Local Preference"
        ]
      },
      {
        "id": "q4",
        "type": "radio",
        "text": "Qual a diferença entre Local Preference e Weight para influenciar seleção de rota?",
        "options": [
          "Weight é propagado via iBGP; Local Preference é local ao roteador",
          "Local Preference é propagado via iBGP dentro do AS; Weight é local apenas ao roteador onde foi configurado",
          "Ambos têm o mesmo escopo — afetam apenas o roteador local",
          "Local Preference é usado em eBGP; Weight é usado em iBGP"
        ]
      },
      {
        "id": "q5",
        "type": "radio",
        "text": "Na ordem de decisão BGP, qual atributo tem MAIOR prioridade?",
        "options": [
          "Local Preference",
          "AS-PATH",
          "Weight",
          "MED"
        ]
      },
      {
        "id": "q6",
        "type": "radio",
        "text": "Após configurar Local Preference 200 via route-map no R1, qual comando aplica a política sem derrubar sessões?",
        "options": [
          "clear bgp * hard",
          "clear bgp * soft in",
          "clear bgp * soft out",
          "reload bgp"
        ]
      }
    ]
  }
};

// frr_configs como template literals (preserva formatação e evita escape de regex)
lab.frr_configs = {
    R1: `frr version 9.0
hostname R1
!
interface lo
 ip address 10.0.0.1/32
!
interface eth1
 ip address 10.1.1.1/30
!
interface eth2
 ip address 10.1.2.1/30
!
router bgp 1
 bgp router-id 10.0.0.1
 no bgp ebgp-requires-policy
 neighbor 10.0.0.2 remote-as 1
 neighbor 10.0.0.2 update-source lo
 neighbor 20.0.0.1 remote-as 3
 neighbor 20.0.0.1 update-source lo
 neighbor 20.0.0.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 10.10.0.0/24
  neighbor 10.0.0.2 activate
  neighbor 10.0.0.2 next-hop-self
  neighbor 20.0.0.1 activate
 exit-address-family
!
ip route 10.0.0.2/32 10.1.1.2
ip route 20.0.0.1/32 10.1.2.2
ip route 10.10.0.0/24 Null0
`,
    R2: `frr version 9.0
hostname R2
!
interface lo
 ip address 10.0.0.2/32
!
interface eth1
 ip address 10.1.1.2/30
!
interface eth2
 ip address 10.2.1.1/30
!
router bgp 1
 bgp router-id 10.0.0.2
 no bgp ebgp-requires-policy
 neighbor 10.0.0.1 remote-as 1
 neighbor 10.0.0.1 update-source lo
 neighbor 30.0.0.1 remote-as 2
 neighbor 30.0.0.1 update-source lo
 neighbor 30.0.0.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 10.20.0.0/24
  neighbor 10.0.0.1 activate
  neighbor 10.0.0.1 next-hop-self
  neighbor 30.0.0.1 activate
 exit-address-family
!
ip route 10.0.0.1/32 10.1.1.1
ip route 30.0.0.1/32 10.2.1.2
ip route 10.20.0.0/24 Null0
`,
    R3: `frr version 9.0
hostname R3
!
interface lo
 ip address 20.0.0.1/32
!
interface eth1
 ip address 10.1.2.2/30
!
router bgp 3
 bgp router-id 20.0.0.1
 no bgp ebgp-requires-policy
 neighbor 10.0.0.1 remote-as 1
 neighbor 10.0.0.1 update-source lo
 neighbor 10.0.0.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 20.20.0.0/24
  neighbor 10.0.0.1 activate
 exit-address-family
!
ip route 10.0.0.1/32 10.1.2.1
ip route 20.20.0.0/24 Null0
`,
    R4: `frr version 9.0
hostname R4
!
interface lo
 ip address 30.0.0.1/32
!
interface eth1
 ip address 10.2.1.2/30
!
router bgp 2
 bgp router-id 30.0.0.1
 no bgp ebgp-requires-policy
 neighbor 10.0.0.2 remote-as 1
 neighbor 10.0.0.2 update-source lo
 neighbor 10.0.0.2 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 30.30.0.0/24
  neighbor 10.0.0.2 activate
 exit-address-family
!
ip route 10.0.0.2/32 10.2.1.1
ip route 30.30.0.0/24 Null0
`
};

module.exports = lab;
