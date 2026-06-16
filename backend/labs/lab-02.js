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
      "R2",
      "eth2",
      "R3",
      "eth1"
    ],
    [
      "R1",
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
      "description": "Verifique sessões iBGP (R1-R2 no AS1) e eBGP (R2-R3, R1-R4).",
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
        }
      ],
      "expected": "2 sessões iBGP e 2 eBGP estabelecidas"
    },
    {
      "id": 2,
      "title": "Configurar Local Preference",
      "description": "Configure R2 para definir Local Preference=200 nas rotas recebidas de AS2.",
      "commands": [
        {
          "cmd": "conf t\nroute-map SET-LP permit 10\n set local-preference 200\n!\nrouter bgp 1\n address-family ipv4\n  neighbor 30.0.0.1 route-map SET-LP in",
          "router": "R2",
          "desc": "Configura LP=200"
        },
        {
          "cmd": "clear bgp * soft in",
          "router": "R2",
          "desc": "Aplica política"
        },
        {
          "cmd": "show ip bgp",
          "router": "R1",
          "desc": "R1 deve preferir R2 para AS2"
        }
      ],
      "expected": "R1 mostra Local Preference=200 para rotas de AS2 via R2"
    }
  ],
  "challenge": {
    "title": "Desafio: Política de Saída Assimétrica",
    "description": "Configure AS1 para que tráfego para AS2 saia pelo R1 e para AS3 saia pelo R2, usando apenas Local Preference.",
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
ip route 20.0.0.1/32 10.2.1.2
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
ip route 30.0.0.1/32 10.1.2.2
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
 neighbor 10.0.0.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 20.20.0.0/24
  neighbor 10.0.0.1 activate
 exit-address-family
!
ip route 10.0.0.1/32 10.2.1.1
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
 neighbor 10.0.0.2 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 30.30.0.0/24
  neighbor 10.0.0.2 activate
 exit-address-family
!
ip route 10.0.0.2/32 10.1.2.1
`
};

module.exports = lab;
