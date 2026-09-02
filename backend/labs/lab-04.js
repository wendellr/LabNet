/**
 * Lab 4 — BGP Confederations
 * Topic: Escalabilidade BGP
 * Difficulty: Avançado
 */

const lab = {
  "id": 4,
  "protocol": "bgp",
  "level": 6,
  "scenario": "Um provedor de médio porte cresceu e hoje mantém dezenas de roteadores em full-mesh iBGP dentro do mesmo AS — cada novo roteador significa mais N sessões para configurar e manter. Confederação BGP resolve a escalabilidade dividindo o AS em sub-ASes menores (cada um com seu próprio full-mesh interno, bem menor), enquanto o mundo externo continua enxergando um único AS só, sem nenhuma mudança visível de fora.",
  "title": "BGP Confederations",
  "topic": "Escalabilidade BGP",
  "difficulty": "Avançado",
  "duration": "75 min",
  "enabled": true,
  "resourceProfile": "moderado",
  "variables": {
    "pubAS": { "pool": ["100", "300", "700"] }
  },
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
      "label": "Sessão externa R1-R5 estabelecida",
      "router": "R1",
      "cmdContains": "show bgp summary",
      "outputPattern": "\\d{2}:\\d{2}:\\d{2}\\s+\\d+"
    },
    {
      "id": "external_as_clean",
      "label": "R5 vê AS-PATH limpo (sem sub-ASes)",
      "router": "R5",
      "cmdContains": "show ip bgp",
      "outputContains": "{{pubAS}}"
    }
  ],
  "verifications": [
    {
      "id": "external_session_fixed",
      "label": "Sessão externa R1↔R5 estabelecida (estava quebrada por AS mismatch)",
      "weight": 15,
      "check": { "router": "R1", "cmdPattern": "show bgp summary", "outputPattern": "5\\.5\\.5\\.5.*\\d{2}:\\d{2}:\\d{2}\\s+\\d+" }
    },
    {
      "id": "confed_identifier_r1",
      "label": "R1 configurado com bgp confederation identifier {{pubAS}}",
      "weight": 15,
      "check": { "router": "R1", "cmdPattern": "show running-config", "outputPattern": "bgp confederation identifier {{pubAS}}" }
    },
    {
      "id": "confed_identifier_r4",
      "label": "R4 (ponta oposta da confederação) também configurado",
      "weight": 10,
      "check": { "router": "R4", "cmdPattern": "show running-config", "outputPattern": "bgp confederation identifier {{pubAS}}" }
    },
    {
      "id": "confed_peers_r2",
      "label": "R2 declara o sub-AS 65002 como confederation peer",
      "weight": 15,
      "check": { "router": "R2", "cmdPattern": "show running-config", "outputPattern": "bgp confederation peers 65002" }
    },
    {
      "id": "confed_peers_r3",
      "label": "R3 declara o sub-AS 65001 como confederation peer",
      "weight": 15,
      "check": { "router": "R3", "cmdPattern": "show running-config", "outputPattern": "bgp confederation peers 65001" }
    },
    {
      "id": "internal_routes_seen",
      "label": "Rotas internas propagadas entre sub-ASes",
      "weight": 10,
      "check": { "router": "R4", "cmdPattern": "show ip bgp", "outputPattern": "1\\.1\\.1\\.0/24|2\\.2\\.2\\.0/24|3\\.3\\.3\\.0/24" }
    },
    {
      "id": "external_aspath_clean",
      "label": "R5 vê apenas o AS público {{pubAS}} da confederação, sem os sub-ASes internos",
      "weight": 20,
      "check": { "router": "R5", "cmdPattern": "show ip bgp 4\\.4\\.4\\.0", "outputPattern": "\\n\\s*{{pubAS}}\\s*\\n" }
    }
  ],
  "answerKey": {
    "predict_step1": {
      "type": "keywords",
      "required": ["as diferente", "mismatch", "não bate", "nao bate", "confederation identifier", "65001"],
      "anyOf": true,
      "points": 10,
      "hint": "R1 está rodando 'router bgp 65001' — sem 'bgp confederation identifier', esse é o AS real que R1 anuncia. R5 espera falar com o AS público da confederação, não com o sub-AS interno."
    },
    "predict_step3": {
      "type": "keywords",
      "required": ["flap", "reinicia", "reseta", "cai e sobe", "reconecta", "renegocia"],
      "anyOf": true,
      "points": 10,
      "hint": "Alterar o AS local efetivo de um roteador (via confederation identifier) muda como ele se apresenta aos vizinhos — isso força a renegociação da sessão BGP, mesmo em peers que já estavam Established."
    },
    "q1": {
      "type": "radio",
      "correct": "1225",
      "points": 12
    },
    "q2": {
      "type": "radio",
      "correct": "AS_CONFED_SEQUENCE — sequência de sub-ASes que a rota percorreu internamente",
      "points": 16
    },
    "q3": {
      "type": "radio",
      "correct": "Apenas o AS público da confederação (ex: 100), sem os sub-ASes internos",
      "points": 20
    },
    "q4": {
      "type": "radio",
      "correct": "Dividem o AS em sub-ASes menores, reduzindo o número de sessões iBGP necessárias em cada sub-AS",
      "points": 20
    },
    "q5": {
      "type": "radio",
      "correct": "show running-config | include confederation",
      "points": 12
    }
  },
  "steps": [
    {
      "id": 1,
      "title": "Diagnosticar a sessão externa quebrada",
      "theory": "Uma confederação BGP divide um AS grande em sub-ASes menores. Internamente, os roteadores falam BGP como se existissem vários ASes privados (neste lab: R1/R2 no sub-AS 65001, R3/R4 no sub-AS 65002). Para vizinhos externos, porém, tudo deveria aparecer como um único AS público — é isso que o comando 'bgp confederation identifier' faz.\n\nR5 é um vizinho externo (AS {{pubAS}}) já configurado esperando falar com o AS público da confederação. As rotas estáticas e o 'neighbor remote-as' já estão prontos dos dois lados — mas a confederação em si ainda não foi configurada em nenhum dos quatro roteadores internos.",
      "description": "Antes de configurar qualquer coisa, verifique o estado atual das sessões. Nem todas vão estar iguais.",
      "commands": [
        {
          "cmd": "show bgp summary",
          "router": "R1",
          "desc": "Sessão de R1 com R2 (interna) e com R5 (externa) — as duas estão Established?"
        },
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
          "cmd": "show running-config",
          "router": "R1",
          "desc": "Repare que 'router bgp 65001' está configurado, mas não há nenhuma linha 'bgp confederation'"
        }
      ],
      "expected": "As sessões internas entre sub-ASes (R1-R2, R2-R3, R3-R4) tendem a subir normalmente. A sessão externa R1-R5 NÃO estabelece — R1 está se apresentando como AS 65001 (seu AS real), mas R5 espera falar com o AS público {{pubAS}}.",
      "predict": {
        "id": "predict_step1",
        "prompt": "Antes de configurar qualquer coisa: por que você acha que a sessão entre R1 e R5 não sobe, mesmo com o neighbor e as rotas estáticas já configurados dos dois lados?"
      }
    },
    {
      "id": 2,
      "title": "Entender a Configuração Essencial",
      "theory": "A configuração mínima de confederação tem três partes:\n\n1. O AS local do processo BGP já é o sub-AS interno (não muda):\n   router bgp 65001\n\n2. O AS público visto de fora é declarado com:\n   bgp confederation identifier {{pubAS}}\n\n3. Os sub-ASes vizinhos da mesma confederação são declarados com:\n   bgp confederation peers 65002\n\nPeers dentro do mesmo sub-AS se comportam como iBGP puro. Peers em outro sub-AS da mesma confederação se parecem com eBGP em alguns aspectos (troca capabilities, por exemplo), mas continuam internos ao AS público — e o AS_PATH carrega essa passagem como AS_CONFED_SEQUENCE, removido automaticamente quando a rota sai para um peer verdadeiramente externo como R5.",
      "description": "Antes de digitar os comandos, revise mentalmente o mapeamento deste lab:\n\n- R1, R2 → sub-AS 65001\n- R3, R4 → sub-AS 65002\n- AS público desta sessão → {{pubAS}}\n\nVocê vai configurar os quatro roteadores no próximo passo.",
      "commands": [
        {
          "cmd": "show running-config",
          "router": "R1",
          "desc": "Confirme mais uma vez que não há nenhuma linha 'bgp confederation' ainda"
        }
      ],
      "expected": "Nenhum dos quatro roteadores tem 'bgp confederation identifier' ou 'bgp confederation peers' configurado ainda."
    },
    {
      "id": 3,
      "title": "Configurar a Confederação nos Quatro Roteadores",
      "theory": "Cada roteador só precisa saber o AS público da confederação e quais sub-ASes vizinhos fazem parte dela — não é preciso reconfigurar os 'neighbor remote-as' já existentes, eles continuam corretos.",
      "description": "Configure os quatro roteadores. Repare que o AS público ({{pubAS}}) é o mesmo em todos; o 'confederation peers' é sempre o SUB-AS OPOSTO ao seu:\n\nEm R1 e R2 (sub-AS 65001):\n  router bgp 65001\n   bgp confederation identifier {{pubAS}}\n   bgp confederation peers 65002\n\nEm R3 e R4 (sub-AS 65002):\n  router bgp 65002\n   bgp confederation identifier {{pubAS}}\n   bgp confederation peers 65001",
      "commands": [
        {
          "cmd": "show running-config",
          "router": "R1",
          "desc": "Confirme identifier {{pubAS}} e peers 65002"
        },
        {
          "cmd": "show running-config",
          "router": "R4",
          "desc": "Confirme identifier {{pubAS}} e peers 65001 na outra ponta da confederação"
        },
        {
          "cmd": "show bgp summary",
          "router": "R1",
          "desc": "A sessão com R5 (5.5.5.5) já aparece Established?"
        }
      ],
      "expected": "Depois de configurar os quatro roteadores, R1-R5 estabelece. As sessões internas continuam de pé (podem reiniciar/flap brevemente durante a mudança).",
      "predict": {
        "id": "predict_step3",
        "prompt": "Depois de aplicar 'bgp confederation identifier' nos quatro roteadores, você espera que as sessões internas que já estavam Established (ex: R2-R3) permaneçam intactas sem nenhuma interrupção, ou que elas reiniciem/flapem antes de subir de novo?"
      }
    },
    {
      "id": 4,
      "title": "Verificar AS-PATH Limpo e Pensar em Escala",
      "theory": "Quando a rota sai para um peer verdadeiramente externo, os sub-ASes internos não devem aparecer — o vizinho externo enxerga apenas o AS público da confederação. Neste lab, R5 deve ver AS {{pubAS}}, não 65001 ou 65002.\n\nO full-mesh iBGP cresce muito rápido: a fórmula de sessões é n×(n-1)/2. Com 50 roteadores, isso vira 1225 sessões. Confederações reduzem essa pressão dividindo o AS em grupos menores — outra solução comum para o mesmo problema é Route Reflector.",
      "description": "Compare a visão interna com a visão externa, agora que a confederação está configurada.",
      "commands": [
        {
          "cmd": "show ip bgp",
          "router": "R4",
          "desc": "Visão interna da confederação — rotas de todos os roteadores"
        },
        {
          "cmd": "show ip bgp",
          "router": "R5",
          "desc": "Tabela BGP do R5 — deve ver AS {{pubAS}}, não 65001/65002"
        },
        {
          "cmd": "show ip bgp 4.4.4.0/24",
          "router": "R5",
          "desc": "Detalhe da rota do R4 visto de fora — AS-PATH deve ser só '{{pubAS}}'"
        }
      ],
      "expected": "Internamente há sub-ASes visíveis (R4 vê o caminho passando por 65001/65002); externamente R5 enxerga apenas o AS público {{pubAS}}, sem os sub-ASes privados."
    }
  ],
  "challenge": {
    "title": "Desafio: Validar Confederação",
    "description": "Configure e valide a confederação nos quatro roteadores.\n\nRequisitos:\n1. R1, R2, R3 e R4 devem ter 'bgp confederation identifier {{pubAS}}'.\n2. Os sub-ASes vizinhos devem aparecer em 'bgp confederation peers' (65002 em R1/R2, 65001 em R3/R4).\n3. Mostre que R1-R5 (sessão externa) estabelece, e que R5 vê apenas o AS público {{pubAS}} no AS-PATH.\n4. Responda as questões objetivas sobre escala, AS-PATH e full-mesh.\n\nNão é necessário criar novos roteadores neste desafio.",
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
 neighbor 1.1.1.1 remote-as {{pubAS}}
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
