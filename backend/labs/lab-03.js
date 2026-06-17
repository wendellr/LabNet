/**
 * Lab 3 — BGP Path Control
 * Adaptado do material "BGP Routing Protocol With 16 Practice Labs".
 *
 * Mantem a ideia original:
 * - AS 254 externo em R1;
 * - AS 5 como confederacao formada por R2/R3/R4;
 * - controle de caminho por Weight e ORIGIN.
 */

module.exports = {
  id: 3,
  enabled: true,
  title: "BGP Path Control",
  topic: "Weight, ORIGIN e Confederação",
  difficulty: "Intermediário",
  duration: "60 min",
  resourceProfile: "leve",
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R1", "eth2", "R3", "eth1"],
    ["R2", "eth2", "R3", "eth2"],
    ["R3", "eth3", "R4", "eth1"],
    ["R1", "eth3", "R4", "eth2"],
  ],

  frr_configs: {
    R1: `frr version 9.0
frr defaults traditional
hostname R1
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 1.1.1.1/32
!
interface eth1
 ip address 10.0.0.1/30
!
interface eth2
 ip address 10.0.0.5/30
!
interface eth3
 ip address 150.1.1.1/24
!
router bgp 254
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.0.2 remote-as 5
 neighbor 10.0.0.6 remote-as 5
 neighbor 150.1.1.4 remote-as 5
 !
 address-family ipv4 unicast
  network 150.1.1.0/24
  neighbor 10.0.0.2 activate
  neighbor 10.0.0.6 activate
  neighbor 150.1.1.4 activate
 exit-address-family
`,
    R2: `frr version 9.0
frr defaults traditional
hostname R2
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 2.2.2.2/32
 ip address 150.2.2.2/24
!
interface eth1
 ip address 10.0.0.2/30
!
interface eth2
 ip address 10.0.0.9/30
!
router bgp 65502
 bgp router-id 2.2.2.2
 bgp confederation identifier 5
 bgp confederation peers 65503
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.0.1 remote-as 254
 neighbor 10.0.0.10 remote-as 65503
 !
 address-family ipv4 unicast
  network 150.2.2.0/24
  neighbor 10.0.0.1 activate
  neighbor 10.0.0.10 activate
  neighbor 10.0.0.10 next-hop-self
 exit-address-family
`,
    R3: `frr version 9.0
frr defaults traditional
hostname R3
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 3.3.3.3/32
 ip address 150.3.3.3/24
!
interface eth1
 ip address 10.0.0.6/30
!
interface eth2
 ip address 10.0.0.10/30
!
interface eth3
 ip address 10.0.0.13/30
!
router bgp 65503
 bgp router-id 3.3.3.3
 bgp confederation identifier 5
 bgp confederation peers 65502 65504
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.0.5 remote-as 254
 neighbor 10.0.0.9 remote-as 65502
 neighbor 10.0.0.14 remote-as 65504
 !
 address-family ipv4 unicast
  network 150.3.3.0/24
  neighbor 10.0.0.5 activate
  neighbor 10.0.0.9 activate
  neighbor 10.0.0.9 next-hop-self
  neighbor 10.0.0.14 activate
  neighbor 10.0.0.14 next-hop-self
 exit-address-family
`,
    R4: `frr version 9.0
frr defaults traditional
hostname R4
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 4.4.4.4/32
!
interface eth1
 ip address 10.0.0.14/30
!
interface eth2
 ip address 150.1.1.4/24
!
router bgp 65504
 bgp router-id 4.4.4.4
 bgp confederation identifier 5
 bgp confederation peers 65503
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.0.13 remote-as 65503
 neighbor 150.1.1.1 remote-as 254
 !
 address-family ipv4 unicast
  network 150.1.1.0/24
  neighbor 10.0.0.13 activate
  neighbor 10.0.0.13 next-hop-self
  neighbor 150.1.1.1 activate
 exit-address-family
`,
  },

  autoGrade: [
    {
      id: "lab3_summary_checked",
      label: "Sessões BGP observadas",
      router: "R1",
      cmdContains: "show bgp summary",
      outputContains: "Established",
    },
    {
      id: "lab3_weight_seen",
      label: "Weight observado na rota de R1",
      router: "R2",
      cmdContains: "show ip bgp 150.1.1.0",
      outputContains: "weight 1000",
    },
    {
      id: "lab3_origin_seen",
      label: "ORIGIN manipulado observado em R1",
      router: "R1",
      cmdContains: "show ip bgp 150.3.3.0",
      outputPattern: "incomplete|egp|\\?",
    },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP verificadas",
      weight: 10,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "Established" },
    },
    {
      id: "confed_configured",
      label: "Confederação AS 5 configurada",
      weight: 10,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "bgp confederation identifier 5" },
    },
    {
      id: "weight_r2_configured",
      label: "Weight configurado no R2 para prefixo de R1",
      weight: 15,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "set weight 1000" },
    },
    {
      id: "weight_r3_configured",
      label: "Weight configurado no R3 para prefixo de R1",
      weight: 15,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set weight 1000" },
    },
    {
      id: "origin_incomplete_configured",
      label: "R3 anuncia 150.3.3.0/24 para R1 com ORIGIN incomplete",
      weight: 15,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set origin incomplete" },
    },
    {
      id: "origin_egp_configured",
      label: "R4 anuncia 150.3.3.0/24 para R1 com ORIGIN egp",
      weight: 15,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "set origin egp" },
    },
    {
      id: "r1_origin_verified",
      label: "R1 verificou múltiplos ORIGINs para 150.3.3.0/24",
      weight: 20,
      check: { router: "R1", cmdPattern: "show ip bgp 150\\.3\\.3\\.0", outputPattern: "150\\.3\\.3\\.0" },
    },
  ],

  answerKey: {
    q1: { type: "radio", correct: "Ele é local ao roteador e vence antes de Local Preference e AS-PATH", points: 15 },
    q2: { type: "radio", correct: "Inbound, no roteador que deve preferir a rota recebida de R1", points: 15 },
    q3: { type: "radio", correct: "IGP é preferido sobre EGP, e EGP é preferido sobre incomplete", points: 15 },
    q4: { type: "radio", correct: "No anúncio de saída para R1, usando route-map out", points: 15 },
    q5: { type: "radio", correct: "Os sub-ASes internos aparecem como parte da confederação, mas o AS externo enxerga apenas o AS confederado 5", points: 20 },
    q6: { type: "radio", correct: "Porque a prefix-list limita a política somente ao prefixo desejado", points: 20 },
  },

  steps: [
    {
      id: 1,
      title: "Reconhecer a confederação",
      theory: `Uma confederação BGP permite dividir um AS grande em sub-ASes internos. Para o mundo externo, todos continuam parecendo um único AS.

Neste lab, R2, R3 e R4 formam o AS confederado 5:
- R2 usa o sub-AS 65502
- R3 usa o sub-AS 65503
- R4 usa o sub-AS 65504

R1 está fora da confederação, no AS 254. Para R1, todos os vizinhos do lado direito parecem pertencer ao AS 5.`,
      description: `Verifique as sessões BGP e observe como R1 aprende rotas vindas da confederação.`,
      commands: [
        { router: "R1", cmd: "show bgp summary", desc: "R1 deve ver vizinhos no AS 5" },
        { router: "R2", cmd: "show bgp summary", desc: "R2 vê R1 externo e R3 como confederação" },
        { router: "R3", cmd: "show running-config", desc: "Confirme bgp confederation identifier/peers" },
        { router: "R1", cmd: "show ip bgp", desc: "Tabela BGP vista de fora da confederação" },
      ],
      expected: "Sessões estabelecidas e R1 vendo caminhos externos via AS 5.",
    },
    {
      id: 2,
      title: "Usar Weight para preferir R1",
      theory: `Weight é um atributo local ao roteador. Ele não é anunciado a vizinhos.

Quando um roteador tem mais de um caminho para o mesmo prefixo, o caminho com maior Weight vence antes de Local Preference, AS-PATH, ORIGIN e MED.

Como Weight é local, configurar no R2 não muda a decisão do R3. Por isso este exercício aplica a mesma lógica em R2 e R3.`,
      description: `Configure R2 e R3 para preferirem a rota 150.1.1.0/24 recebida diretamente de R1.

Exemplo no R2:
  configure terminal
  ip prefix-list NET_R1 seq 10 permit 150.1.1.0/24
  route-map WEIGHT_R1 permit 10
   match ip address prefix-list NET_R1
   set weight 1000
  route-map WEIGHT_R1 permit 20
  router bgp 65502
   address-family ipv4 unicast
    neighbor 10.0.0.1 route-map WEIGHT_R1 in
  end
  clear bgp * soft in

No R3, use a mesma ideia para o vizinho R1 em 10.0.0.5.`,
      commands: [
        { router: "R2", cmd: "show running-config", desc: "Confirme prefix-list, route-map e route-map inbound" },
        { router: "R3", cmd: "show running-config", desc: "Confirme a mesma política no R3" },
        { router: "R2", cmd: "clear bgp * soft in", desc: "Reaplica política inbound em R2" },
        { router: "R3", cmd: "clear bgp * soft in", desc: "Reaplica política inbound em R3" },
        { router: "R2", cmd: "show ip bgp 150.1.1.0/24", desc: "Rota via R1 deve mostrar weight 1000" },
        { router: "R3", cmd: "show ip bgp 150.1.1.0/24", desc: "Rota via R1 deve mostrar weight 1000" },
      ],
      expected: "R2 e R3 preferem a rota de 150.1.1.0/24 recebida diretamente de R1.",
    },
    {
      id: 3,
      title: "Controlar caminho com ORIGIN",
      theory: `ORIGIN é um atributo BGP que indica como uma rota entrou no BGP.

A ordem de preferência é:
1. IGP
2. EGP
3. Incomplete

Se vários caminhos empatarem nos critérios anteriores, o BGP prefere IGP sobre EGP, e EGP sobre incomplete. Podemos usar route-map para alterar o ORIGIN anunciado para um vizinho específico.`,
      description: `Sem mexer em R1, faça R1 preferir o caminho via R2 para 150.3.3.0/24.

Ideia:
- R2 deve anunciar a rota com ORIGIN IGP, sem alteração.
- R4 deve anunciar a rota para R1 com ORIGIN EGP.
- R3 deve anunciar a rota diretamente para R1 com ORIGIN incomplete.

Exemplo em R3:
  configure terminal
  ip prefix-list NET_R3 seq 10 permit 150.3.3.0/24
  route-map ORIGIN_TO_R1 permit 10
   match ip address prefix-list NET_R3
   set origin incomplete
  route-map ORIGIN_TO_R1 permit 20
  router bgp 65503
   address-family ipv4 unicast
    neighbor 10.0.0.5 route-map ORIGIN_TO_R1 out
  end
  clear bgp * soft out

Em R4, use "set origin egp" para o vizinho R1 em 150.1.1.1.`,
      commands: [
        { router: "R3", cmd: "show running-config", desc: "Confirme set origin incomplete para R1" },
        { router: "R4", cmd: "show running-config", desc: "Confirme set origin egp para R1" },
        { router: "R3", cmd: "clear bgp * soft out", desc: "Reenvia anúncios de R3" },
        { router: "R4", cmd: "clear bgp * soft out", desc: "Reenvia anúncios de R4" },
        { router: "R1", cmd: "show ip bgp 150.3.3.0/24", desc: "Compare ORIGIN dos caminhos" },
      ],
      expected: "R1 deve enxergar ORIGINs diferentes para 150.3.3.0/24: via R2 como IGP, via R4 como EGP e via R3 como incomplete.",
    },
  ],

  challenge: {
    title: "Desafio: controlar caminhos sem mexer no roteador de destino",
    description: `Complete as politicas do lab e responda:

1. R2 e R3 devem preferir a rota 150.1.1.0/24 recebida de R1 usando Weight.
2. R1 deve preferir o caminho via R2 para 150.3.3.0/24 usando ORIGIN.
3. As politicas devem afetar somente os prefixos pedidos, usando prefix-list.

As perguntas sao objetivas e baseadas diretamente nos exemplos do roteiro.`,
    hints: [
      "Weight e local ao roteador; por isso precisa ser configurado em cada roteador que deve mudar sua decisao.",
      "Para alterar atributos recebidos, aplique route-map inbound.",
      "Para alterar atributos anunciados a um vizinho, aplique route-map outbound.",
      "Use prefix-list para limitar a politica ao prefixo do exercicio.",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Por que Weight é eficaz para fazer R2 ou R3 preferirem a rota recebida de R1?",
        options: [
          "Ele é local ao roteador e vence antes de Local Preference e AS-PATH",
          "Ele é anunciado para todos os vizinhos e altera a decisão global",
          "Ele só funciona em rotas OSPF redistribuídas",
          "Ele remove automaticamente caminhos alternativos da tabela BGP",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Em qual direção a route-map de Weight deve ser aplicada?",
        options: [
          "Inbound, no roteador que deve preferir a rota recebida de R1",
          "Outbound, no roteador que originou o prefixo",
          "Outbound em todos os vizinhos da confederação",
          "Inbound apenas no roteador R1",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Qual é a ordem correta de preferência do atributo ORIGIN?",
        options: [
          "IGP é preferido sobre EGP, e EGP é preferido sobre incomplete",
          "Incomplete é preferido sobre EGP, e EGP é preferido sobre IGP",
          "EGP é sempre preferido sobre todos os outros",
          "ORIGIN nunca participa da seleção de melhor caminho",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Onde a política de ORIGIN deve ser aplicada para alterar o que R1 recebe?",
        options: [
          "No anúncio de saída para R1, usando route-map out",
          "No R1, usando route-map out",
          "No R2, usando route-map in para R3",
          "Somente dentro de router ospf",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual é a ideia da confederação neste lab?",
        options: [
          "Os sub-ASes internos aparecem como parte da confederação, mas o AS externo enxerga apenas o AS confederado 5",
          "Todos os roteadores passam a usar o mesmo Router-ID",
          "A confederação remove a necessidade de sessões BGP",
          "O AS externo passa a enxergar todos os sub-ASes como ASNs públicos independentes",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Por que usamos prefix-list antes da route-map?",
        options: [
          "Porque a prefix-list limita a política somente ao prefixo desejado",
          "Porque route-map não funciona em BGP sem OSPF",
          "Porque prefix-list derruba sessões BGP antigas",
          "Porque prefix-list altera automaticamente o AS-PATH",
        ],
      },
    ],
  },
};
