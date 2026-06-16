/**
 * Lab 4 — BGP Confederations
 * Topic: Escalabilidade BGP
 * Difficulty: Avançado
 */

const lab = {
  "id": 4,
  "title": "BGP Confederations",
  "topic": "Escalabilidade BGP",
  "difficulty": "Avançado",
  "duration": "75 min",
  "routers": [
    "R1",
    "R2",
    "R3",
    "R4",
    "R5"
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
      "R3",
      "eth2",
      "R4",
      "eth1"
    ],
    [
      "R1",
      "eth2",
      "R5",
      "eth1"
    ]
  ],
  "autoGrade": [
    {
      "id": "confed_id",
      "label": "Confederation identifier configurado",
      "cmdContains": "show running-config",
      "outputContains": "bgp confederation identifier"
    },
    {
      "id": "confed_peers",
      "label": "Confederation peers configurados",
      "cmdContains": "show running-config",
      "outputContains": "bgp confederation peers"
    },
    {
      "id": "confed_established",
      "label": "Sessões de Confederação Estabelecidas",
      "cmdContains": "show bgp summary",
      "outputContains": "Established"
    },
    {
      "id": "external_as_clean",
      "label": "R5 vê AS-PATH limpo (sem sub-ASes)",
      "router": "R5",
      "cmdContains": "show ip bgp",
      "outputPattern": "100$"
    }
  ],
  "answerKey": {
    "q1": {
      "type": "radio",
      "correct": "1225",
      "points": 15
    },
    "q2": {
      "type": "radio",
      "correct": "AS_CONFED_SEQUENCE — sequência de sub-ASes que a rota percorreu internamente",
      "points": 20
    },
    "q3": {
      "type": "radio",
      "correct": "Apenas o AS público da confederação (ex: 100), sem os sub-ASes internos",
      "points": 25
    },
    "q4": {
      "type": "radio",
      "correct": "Dividem o AS em sub-ASes menores, reduzindo o número de sessões iBGP necessárias em cada sub-AS",
      "points": 25
    },
    "q5": {
      "type": "radio",
      "correct": "show running-config | include confederation",
      "points": 15
    }
  },
  "steps": [
    {
      "id": 1,
      "title": "Deploy e Verificação",
      "description": "Verifique sessões de confederação entre sub-ASes.",
      "commands": [
        {
          "cmd": "show bgp summary",
          "router": "R2",
          "desc": "Sessões do R2 (sub-AS 65001)"
        },
        {
          "cmd": "show bgp summary",
          "router": "R3",
          "desc": "Sessões do R3 (sub-AS 65002)"
        },
        {
          "cmd": "show ip bgp",
          "router": "R4",
          "desc": "Tabela BGP dentro da confederação"
        }
      ],
      "expected": "Sessões entre sub-ASes estabelecidas. R4 vê rotas de todos os roteadores."
    },
    {
      "id": 2,
      "title": "Verificar AS-PATH Externo",
      "description": "Confirme que R5 (externo) vê AS-PATH limpo sem sub-ASes privados.",
      "commands": [
        {
          "cmd": "show ip bgp",
          "router": "R5",
          "desc": "Tabela BGP do R5 — deve ver AS100, não 65001/65002"
        },
        {
          "cmd": "show ip bgp 4.4.4.0/24",
          "router": "R5",
          "desc": "Detalhe da rota do R4 visto de fora"
        }
      ],
      "expected": "R5 mostra AS-PATH como '100' apenas, sem sub-ASes privados"
    }
  ],
  "challenge": {
    "title": "Desafio: Expandir Confederação",
    "description": "Adicione sub-AS 65003 e configure Route Reflector dentro de 65002. Garanta que R5 nunca veja sub-ASes no AS-PATH.",
    "hints": [
      "bgp confederation peers deve listar todos os sub-ASes vizinhos",
      "Route Reflector: neighbor X route-reflector-client",
      "Sub-ASes privados são removidos automaticamente em anúncios para peers externos"
    ],
    "questions": [
      {
        "id": "q1",
        "type": "radio",
        "text": "Quantas sessões iBGP são necessárias para full-mesh com 50 roteadores?",
        "options": [
          "49",
          "100",
          "1225",
          "2500"
        ]
      },
      {
        "id": "q2",
        "type": "radio",
        "text": "Qual atributo especial aparece no AS-PATH dentro de uma confederação BGP?",
        "options": [
          "CONFED_SET — lista não-ordenada de sub-ASes",
          "AS_CONFED_SEQUENCE — sequência de sub-ASes que a rota percorreu internamente",
          "CONFEDERATION_ID — identificador único da confederação",
          "LOCAL_AS — sub-AS de origem dentro da confederação"
        ]
      },
      {
        "id": "q3",
        "type": "radio",
        "text": "Quando R5 (AS externo) recebe rotas originadas dentro da confederação, o que ele vê no AS-PATH?",
        "options": [
          "Todos os sub-ASes individuais (65001, 65002, etc.) em sequência",
          "Apenas o AS público da confederação (ex: 100), sem os sub-ASes internos",
          "O AS-PATH vazio — confederações não propagam AS-PATH",
          "O AS_CONFED_SEQUENCE com todos os sub-ASes visíveis"
        ]
      },
      {
        "id": "q4",
        "type": "radio",
        "text": "Qual a principal vantagem das confederações em relação ao full-mesh iBGP?",
        "options": [
          "Eliminam completamente a necessidade de sessões iBGP",
          "Dividem o AS em sub-ASes menores, reduzindo o número de sessões iBGP necessárias em cada sub-AS",
          "Permitem usar diferentes versões do BGP dentro do mesmo AS",
          "Aumentam a velocidade de convergência BGP"
        ]
      },
      {
        "id": "q5",
        "type": "radio",
        "text": "Qual comando verifica se R1 está configurado corretamente como membro de uma confederação?",
        "options": [
          "show bgp confederation peers",
          "show running-config | include confederation",
          "show ip bgp summary",
          "show bgp neighbors"
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
 ip address 1.1.1.1/32
!
interface eth1
 ip address 10.1.1.1/30
!
interface eth2
 ip address 10.5.1.1/30
!
router bgp 65001
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 bgp confederation identifier 100
 bgp confederation peers 65002
 neighbor 2.2.2.2 remote-as 65001
 neighbor 2.2.2.2 update-source lo
 neighbor 5.5.5.5 remote-as 200
 neighbor 5.5.5.5 update-source lo
 neighbor 5.5.5.5 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 1.1.1.0/24
  neighbor 2.2.2.2 activate
  neighbor 2.2.2.2 next-hop-self
  neighbor 5.5.5.5 activate
 exit-address-family
!
ip route 2.2.2.2/32 10.1.1.2
ip route 5.5.5.5/32 10.5.1.2
`,
    R2: `frr version 9.0
hostname R2
!
interface lo
 ip address 2.2.2.2/32
!
interface eth1
 ip address 10.1.1.2/30
!
interface eth2
 ip address 10.2.1.1/30
!
router bgp 65001
 bgp router-id 2.2.2.2
 no bgp ebgp-requires-policy
 bgp confederation identifier 100
 bgp confederation peers 65002
 neighbor 1.1.1.1 remote-as 65001
 neighbor 1.1.1.1 update-source lo
 neighbor 3.3.3.3 remote-as 65002
 neighbor 3.3.3.3 update-source lo
 neighbor 3.3.3.3 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 2.2.2.0/24
  neighbor 1.1.1.1 activate
  neighbor 1.1.1.1 next-hop-self
  neighbor 3.3.3.3 activate
 exit-address-family
!
ip route 1.1.1.1/32 10.1.1.1
ip route 3.3.3.3/32 10.2.1.2
`,
    R3: `frr version 9.0
hostname R3
!
interface lo
 ip address 3.3.3.3/32
!
interface eth1
 ip address 10.2.1.2/30
!
interface eth2
 ip address 10.3.1.1/30
!
router bgp 65002
 bgp router-id 3.3.3.3
 no bgp ebgp-requires-policy
 bgp confederation identifier 100
 bgp confederation peers 65001
 neighbor 2.2.2.2 remote-as 65001
 neighbor 2.2.2.2 update-source lo
 neighbor 2.2.2.2 ebgp-multihop 2
 neighbor 4.4.4.4 remote-as 65002
 neighbor 4.4.4.4 update-source lo
 !
 address-family ipv4 unicast
  network 3.3.3.0/24
  neighbor 2.2.2.2 activate
  neighbor 4.4.4.4 activate
  neighbor 4.4.4.4 next-hop-self
 exit-address-family
!
ip route 2.2.2.2/32 10.2.1.1
ip route 4.4.4.4/32 10.3.1.2
`,
    R4: `frr version 9.0
hostname R4
!
interface lo
 ip address 4.4.4.4/32
!
interface eth1
 ip address 10.3.1.2/30
!
router bgp 65002
 bgp router-id 4.4.4.4
 no bgp ebgp-requires-policy
 bgp confederation identifier 100
 bgp confederation peers 65001
 neighbor 3.3.3.3 remote-as 65002
 neighbor 3.3.3.3 update-source lo
 !
 address-family ipv4 unicast
  network 4.4.4.0/24
  neighbor 3.3.3.3 activate
 exit-address-family
!
ip route 3.3.3.3/32 10.3.1.1
`,
    R5: `frr version 9.0
hostname R5
!
interface lo
 ip address 5.5.5.5/32
!
interface eth1
 ip address 10.5.1.2/30
!
router bgp 200
 bgp router-id 5.5.5.5
 no bgp ebgp-requires-policy
 neighbor 1.1.1.1 remote-as 100
 neighbor 1.1.1.1 update-source lo
 neighbor 1.1.1.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 5.5.5.0/24
  neighbor 1.1.1.1 activate
 exit-address-family
!
ip route 1.1.1.1/32 10.5.1.1
`
};

module.exports = lab;
