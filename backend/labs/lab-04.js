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
  "enabled": true,
  "resourceProfile": "moderado",
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
  "verifications": [
    {
      "id": "bgp_established",
      "label": "Sessões BGP verificadas",
      "weight": 10,
      "check": { "router": "R2", "cmdPattern": "show bgp summary", "outputPattern": "Established" }
    },
    {
      "id": "confed_identifier",
      "label": "Confederation identifier configurado",
      "weight": 20,
      "check": { "router": "R2", "cmdPattern": "show running-config", "outputPattern": "bgp confederation identifier 100" }
    },
    {
      "id": "confed_peers",
      "label": "Confederation peers configurados",
      "weight": 20,
      "check": { "router": "R3", "cmdPattern": "show running-config", "outputPattern": "bgp confederation peers 65001" }
    },
    {
      "id": "internal_routes_seen",
      "label": "Rotas internas propagadas entre sub-ASes",
      "weight": 15,
      "check": { "router": "R4", "cmdPattern": "show ip bgp", "outputPattern": "1\\.1\\.1\\.0/24|2\\.2\\.2\\.0/24|3\\.3\\.3\\.0/24" }
    },
    {
      "id": "external_aspath_clean",
      "label": "R5 ve apenas o AS publico da confederacao",
      "weight": 20,
      "check": { "router": "R5", "cmdPattern": "show ip bgp", "outputPattern": "100" }
    },
    {
      "id": "confed_command_checked",
      "label": "Aluno verificou comandos de confederacao",
      "weight": 15,
      "check": { "router": "any", "cmdPattern": "show running-config.*confederation|show running-config", "outputPattern": "confederation" }
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
      "title": "Entender a Confederação",
      "theory": "Uma confederacao BGP divide um AS grande em sub-ASes menores. Internamente, os roteadores falam BGP como se existissem varios ASes privados. Para vizinhos externos, porem, tudo aparece como um unico AS publico.\n\nNeste lab, o AS publico e 100. Internamente, R1/R2 estao no sub-AS 65001 e R3/R4 no sub-AS 65002. R5 e um vizinho externo no AS 200.\n\nA vantagem e reduzir a complexidade do full-mesh iBGP: em vez de todos os roteadores do AS publico precisarem formar sessao com todos, o AS e dividido em dominios menores.",
      "description": "Antes de alterar qualquer coisa, verifique as sessoes e identifique quem esta em cada sub-AS.\n\nComandos importantes:\n- bgp confederation identifier 100: define o AS publico visto externamente.\n- bgp confederation peers 65002: diz quais sub-ASes vizinhos fazem parte da mesma confederacao.",
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
        },
        {
          "cmd": "show running-config",
          "router": "R2",
          "desc": "Veja identifier e peers da confederação"
        }
      ],
      "expected": "Sessões entre sub-ASes estabelecidas. R4 vê rotas de todos os roteadores."
    },
    {
      "id": 2,
      "title": "Verificar AS-PATH Dentro e Fora",
      "theory": "Dentro da confederacao, o AS-PATH pode carregar informacoes de sub-ASes internos, como uma sequencia de confederacao. Isso ajuda a prevenir loops e preservar a informacao do caminho interno.\n\nQuando a rota sai para um peer externo, os sub-ASes internos nao devem aparecer. O vizinho externo deve enxergar apenas o AS publico da confederacao. Neste lab, R5 deve ver AS 100, nao 65001 ou 65002.",
      "description": "Compare a visao interna com a visao externa.\n\nExemplo de verificacao:\n  show ip bgp\n  show ip bgp 4.4.4.0/24\n\nNo R5, o AS-PATH deve ser limpo: o mundo externo nao precisa conhecer os sub-ASes usados dentro da confederacao.",
      "commands": [
        {
          "cmd": "show ip bgp",
          "router": "R3",
          "desc": "Visão interna entre sub-ASes"
        },
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
    },
    {
      "id": 3,
      "title": "Revisar a Configuração Essencial",
      "theory": "A configuracao minima de confederacao tem duas partes:\n\n1. O AS local do processo BGP e o sub-AS interno:\n   router bgp 65001\n\n2. O AS publico e declarado com:\n   bgp confederation identifier 100\n\n3. Os sub-ASes vizinhos da mesma confederacao sao declarados com:\n   bgp confederation peers 65002\n\nPeers dentro do mesmo sub-AS se comportam como iBGP. Peers em outro sub-AS da mesma confederacao se parecem com eBGP em alguns aspectos, mas continuam internos ao AS publico.",
      "description": "Revise R2 e R3, pois eles fazem a fronteira entre os sub-ASes 65001 e 65002.\n\nExemplo em R2:\n  router bgp 65001\n   bgp confederation identifier 100\n   bgp confederation peers 65002\n   neighbor 3.3.3.3 remote-as 65002\n\nExemplo em R3:\n  router bgp 65002\n   bgp confederation identifier 100\n   bgp confederation peers 65001\n   neighbor 2.2.2.2 remote-as 65001",
      "commands": [
        {
          "cmd": "show running-config",
          "router": "R2",
          "desc": "Confirme sub-AS 65001 e peer 65002"
        },
        {
          "cmd": "show running-config",
          "router": "R3",
          "desc": "Confirme sub-AS 65002 e peer 65001"
        },
        {
          "cmd": "show bgp summary",
          "router": "R3",
          "desc": "Confirme sessões com R2 e R4"
        }
      ],
      "expected": "R2 e R3 devem ter identifier 100 e declarar o sub-AS vizinho como confederation peer."
    },
    {
      "id": 4,
      "title": "Pensar em Escala: Confederação vs Full-Mesh",
      "theory": "O full-mesh iBGP cresce muito rapido. A formula de sessoes em full-mesh e n*(n-1)/2. Com 50 roteadores, isso vira 1225 sessoes.\n\nConfederacoes reduzem essa pressao dividindo o AS em grupos menores. Outra solucao comum e Route Reflector. As duas tecnicas atacam o mesmo problema: escalar iBGP sem exigir que todo roteador fale com todos.",
      "description": "Use este passo para conectar a pratica com o desenho de redes reais. Confirme que R5 continua vendo uma visao simples do AS, mesmo que internamente exista mais de um sub-AS.",
      "commands": [
        {
          "cmd": "show ip bgp",
          "router": "R5",
          "desc": "Visão externa simplificada"
        },
        {
          "cmd": "show ip bgp",
          "router": "R4",
          "desc": "Visão interna da confederação"
        }
      ],
      "expected": "Internamente ha sub-ASes; externamente R5 enxerga apenas o AS publico 100."
    }
  ],
  "challenge": {
    "title": "Desafio: Validar Confederação",
    "description": "Valide e explique a confederacao atual.\n\nRequisitos:\n1. Mostre que R2/R3 possuem 'bgp confederation identifier 100'.\n2. Mostre que os sub-ASes vizinhos aparecem em 'bgp confederation peers'.\n3. Mostre que R5, como AS externo, ve apenas o AS publico 100 no AS-PATH.\n4. Responda as questoes objetivas sobre escala, AS-PATH e full-mesh.\n\nNao e necessario criar novos roteadores neste desafio.",
    "hints": [
      "bgp confederation peers deve listar todos os sub-ASes vizinhos",
      "Sub-ASes privados sao removidos automaticamente em anuncios para peers externos",
      "Compare show ip bgp em R4 com show ip bgp em R5",
      "Full-mesh iBGP cresce com a formula n*(n-1)/2"
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
