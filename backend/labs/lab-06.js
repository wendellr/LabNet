/**
 * Lab 6 — Community, AS-Path Prepend e Default Route
 * Adaptado do material "BGP Routing Protocol With 16 Practice Labs".
 *
 * Mantem 4 roteadores para ser leve:
 * - R1 em AS 1
 * - R2 em AS 2
 * - R3 e R4 em AS 3
 */

module.exports = {
  id: 6,
  enabled: true,
  title: "Community, AS-Path Prepend e Default Route",
  topic: "Communities e Políticas BGP",
  difficulty: "Intermediário",
  duration: "65 min",
  resourceProfile: "leve",
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R1", "eth2", "R3", "eth1"],
    ["R2", "eth2", "R3", "eth2"],
    ["R3", "eth3", "R4", "eth1"],
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
 ip address 10.1.1.1/24
!
interface eth1
 ip address 10.0.12.1/30
!
interface eth2
 ip address 10.0.13.1/30
!
router bgp 1
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.12.2 remote-as 2
 neighbor 10.0.13.2 remote-as 3
 !
 address-family ipv4 unicast
  network 10.1.1.0/24
  neighbor 10.0.12.2 activate
  neighbor 10.0.13.2 activate
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
 ip address 10.2.2.2/24
!
interface eth1
 ip address 10.0.12.2/30
!
interface eth2
 ip address 10.0.23.1/30
!
router bgp 2
 bgp router-id 2.2.2.2
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.12.1 remote-as 1
 neighbor 10.0.23.2 remote-as 3
 !
 address-family ipv4 unicast
  network 10.2.2.0/24
  neighbor 10.0.12.1 activate
  neighbor 10.0.23.2 activate
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
 ip address 10.3.3.3/24
!
interface eth1
 ip address 10.0.13.2/30
!
interface eth2
 ip address 10.0.23.2/30
!
interface eth3
 ip address 10.0.34.1/30
!
router bgp 3
 bgp router-id 3.3.3.3
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.13.1 remote-as 1
 neighbor 10.0.23.1 remote-as 2
 neighbor 10.0.34.2 remote-as 3
 !
 address-family ipv4 unicast
  network 10.3.3.0/24
  neighbor 10.0.13.1 activate
  neighbor 10.0.23.1 activate
  neighbor 10.0.34.2 activate
  neighbor 10.0.34.2 next-hop-self
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
 ip address 10.4.4.4/24
!
interface eth1
 ip address 10.0.34.2/30
!
router bgp 3
 bgp router-id 4.4.4.4
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.34.1 remote-as 3
 !
 address-family ipv4 unicast
  network 10.4.4.0/24
  neighbor 10.0.34.1 activate
 exit-address-family
`,
  },

  autoGrade: [
    {
      id: "lab6_summary_checked",
      label: "Sessões BGP observadas",
      router: "R1",
      cmdContains: "show bgp summary",
      outputContains: "Established",
    },
    {
      id: "lab6_prepend_seen",
      label: "AS-PATH prepend observado em R1",
      router: "R1",
      cmdContains: "show ip bgp 10.4.4.0",
      outputPattern: "3 3 3",
    },
    {
      id: "lab6_community_seen",
      label: "Community no-advertise observada",
      router: "R2",
      cmdContains: "show ip bgp 192.168.1.1",
      outputContains: "no-advertise",
    },
    {
      id: "lab6_default_seen",
      label: "Default route observada em R4",
      router: "R4",
      cmdContains: "show ip bgp 0.0.0.0",
      outputContains: "0.0.0.0/0",
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
      id: "next_hop_self",
      label: "R3 usa next-hop-self para o peer iBGP R4",
      weight: 10,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.34\\.2 next-hop-self" },
    },
    {
      id: "prepend_configured",
      label: "AS-Path Prepend aplicado por R3 para R1",
      weight: 15,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set as-path prepend 3 3" },
    },
    {
      id: "selective_filters",
      label: "R1 usa prefix-lists e route-maps seletivas",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip prefix-list LO-192|ip prefix-list LO_192" },
    },
    {
      id: "community_no_advertise",
      label: "Community no-advertise configurada",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "set community no-advertise" },
    },
    {
      id: "send_community",
      label: "R1 envia communities aos vizinhos",
      weight: 10,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "send-community" },
    },
    {
      id: "default_originate",
      label: "R1 origina rota default para R2 e R3",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "default-originate" },
    },
    {
      id: "r4_default_verified",
      label: "R4 verificou a default route via BGP",
      weight: 10,
      check: { router: "R4", cmdPattern: "show ip bgp 0\\.0\\.0\\.0", outputPattern: "0\\.0\\.0\\.0/0" },
    },
  ],

  answerKey: {
    q1: { type: "radio", correct: "Ele reescreve o next-hop das rotas enviadas ao peer iBGP para que R4 alcance os prefixos externos", points: 15 },
    q2: { type: "radio", correct: "Outbound em R3 para o vizinho R1", points: 15 },
    q3: { type: "radio", correct: "Ela impede que a rota seja anunciada a qualquer peer BGP", points: 20 },
    q4: { type: "radio", correct: "Porque communities só são enviadas ao vizinho quando send-community está habilitado", points: 15 },
    q5: { type: "radio", correct: "default-originate", points: 15 },
    q6: { type: "radio", correct: "Prefix-list seleciona a rota; route-map decide negar, permitir ou alterar atributos", points: 20 },
  },

  steps: [
    {
      id: 1,
      title: "Verificar a topologia e o next-hop",
      theory: `Este lab tem quatro roteadores:

- R1 no AS 1
- R2 no AS 2
- R3 e R4 no AS 3

R3 tem eBGP com R1 e R2, e iBGP com R4. Quando um roteador eBGP aprende uma rota e repassa para um peer iBGP, o next-hop original pode continuar apontando para o vizinho externo. Por isso usamos "next-hop-self": R3 reescreve o next-hop para si mesmo ao anunciar rotas a R4.`,
      description: `Confirme que as sessões estão estabelecidas e que R4 aprende as redes externas através de R3.`,
      commands: [
        { router: "R1", cmd: "show bgp summary", desc: "Sessões de R1 com R2 e R3" },
        { router: "R3", cmd: "show bgp summary", desc: "Sessões eBGP e iBGP de R3" },
        { router: "R3", cmd: "show running-config", desc: "Confirme next-hop-self para R4" },
        { router: "R4", cmd: "show ip bgp", desc: "R4 deve aprender redes 10.1.1.0/24, 10.2.2.0/24 e 10.3.3.0/24" },
      ],
      expected: "R4 aprende rotas externas via R3, com next-hop alcançável.",
    },
    {
      id: 2,
      title: "Forçar R1 a preferir o caminho via R2",
      theory: `AS-Path Prepend aumenta artificialmente o tamanho do AS-PATH anunciado a um vizinho. O BGP prefere AS-PATH mais curto quando critérios anteriores empatam.

Neste lab, R1 pode chegar a 10.4.4.0/24 diretamente via R3 ou indiretamente via R2->R3. Como o caminho via R3 é mais curto, ele tende a ser preferido. Ao fazer R3 anunciar 10.4.4.0/24 para R1 com "set as-path prepend 3 3", esse caminho passa a parecer mais longo.`,
      description: `Configure em R3:

  configure terminal
  ip prefix-list R4_LAN seq 10 permit 10.4.4.0/24
  route-map PATH_PREPEND permit 10
   match ip address prefix-list R4_LAN
   set as-path prepend 3 3
  route-map PATH_PREPEND permit 20
  router bgp 3
   address-family ipv4 unicast
    neighbor 10.0.13.1 route-map PATH_PREPEND out
  end
  clear bgp * soft out

Depois verifique em R1.`,
      commands: [
        { router: "R3", cmd: "show running-config", desc: "Confirme a route-map de prepend" },
        { router: "R3", cmd: "clear bgp * soft out", desc: "Reenvia anúncios a R1" },
        { router: "R1", cmd: "show ip bgp 10.4.4.0/24", desc: "Compare os AS-PATHs via R2 e via R3" },
      ],
      expected: "R1 deve ver AS 3 repetido no caminho via R3 e preferir o caminho via R2.",
    },
    {
      id: 3,
      title: "Anunciar prefixos seletivos com prefix-list e route-map",
      theory: `Prefix-list identifica prefixos. Route-map aplica uma decisão ou alteração sobre as rotas que casam com a prefix-list.

Uma route-map outbound pode negar um prefixo para um vizinho e permitir outros. Isso permite anunciar rotas diferentes para cada peer sem criar novas sessões BGP.`,
      description: `No R1, crie dois endereços extras na loopback e anuncie no BGP:

  configure terminal
  interface lo
   ip address 192.168.1.1/32
   ip address 172.16.1.1/32
  exit
  ip prefix-list LO-192 seq 10 permit 192.168.1.1/32
  ip prefix-list LO-172 seq 10 permit 172.16.1.1/32
  route-map OUT_TO_R2 deny 10
   match ip address prefix-list LO-172
  route-map OUT_TO_R2 permit 20
  route-map OUT_TO_R3 deny 10
   match ip address prefix-list LO-192
  route-map OUT_TO_R3 permit 20
  router bgp 1
   address-family ipv4 unicast
    network 192.168.1.1/32
    network 172.16.1.1/32
    neighbor 10.0.12.2 route-map OUT_TO_R2 out
    neighbor 10.0.13.2 route-map OUT_TO_R3 out
  end
  clear bgp * soft out`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme prefix-lists, route-maps e networks" },
        { router: "R1", cmd: "clear bgp * soft out", desc: "Reenvia anúncios filtrados" },
        { router: "R1", cmd: "show ip bgp neighbors 10.0.12.2 advertised-routes", desc: "Veja o que R1 anuncia para R2" },
        { router: "R1", cmd: "show ip bgp neighbors 10.0.13.2 advertised-routes", desc: "Veja o que R1 anuncia para R3" },
      ],
      expected: "R2 recebe 192.168.1.1/32; R3 recebe 172.16.1.1/32.",
    },
    {
      id: 4,
      title: "Usar community no-advertise",
      theory: `Communities são tags BGP transportadas junto com rotas. A community well-known "no-advertise" instrui o roteador receptor a não anunciar aquela rota para nenhum outro peer BGP.

Importante: em BGP, communities não são necessariamente enviadas por padrão em todos os ambientes. Por isso habilitamos "send-community" no vizinho.`,
      description: `Ajuste as route-maps do R1 para marcar as rotas permitidas com no-advertise:

  configure terminal
  route-map OUT_TO_R2 permit 20
   match ip address prefix-list LO-192
   set community no-advertise
  route-map OUT_TO_R2 permit 30
  route-map OUT_TO_R3 permit 20
   match ip address prefix-list LO-172
   set community no-advertise
  route-map OUT_TO_R3 permit 30
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 send-community
    neighbor 10.0.13.2 send-community
  end
  clear bgp * soft out`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme set community e send-community" },
        { router: "R2", cmd: "show ip bgp 192.168.1.1/32", desc: "R2 deve ver community no-advertise" },
        { router: "R3", cmd: "show ip bgp 172.16.1.1/32", desc: "R3 deve ver community no-advertise" },
        { router: "R4", cmd: "show ip bgp", desc: "R4 não deve aprender esses /32 por BGP" },
      ],
      expected: "R2 e R3 recebem seus /32 marcados com no-advertise; R4 não aprende os /32 por BGP.",
    },
    {
      id: 5,
      title: "Origem de rota default",
      theory: `Quando uma rede não deve receber todos os prefixos específicos, uma rota default pode fornecer caminho de saída genérico.

Em BGP, "neighbor X default-originate" faz o roteador anunciar 0.0.0.0/0 para aquele vizinho. Neste lab, R1 anuncia default para R2 e R3, permitindo que R4 tenha um caminho genérico para prefixos que não foram propagados por causa de no-advertise.`,
      description: `Configure no R1:

  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 default-originate
    neighbor 10.0.13.2 default-originate
  end
  clear bgp * soft out

Depois verifique em R4 se a rota 0.0.0.0/0 foi aprendida via BGP.`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme default-originate para R2 e R3" },
        { router: "R1", cmd: "clear bgp * soft out", desc: "Reenvia anúncios de default" },
        { router: "R4", cmd: "show ip bgp 0.0.0.0/0", desc: "R4 deve aprender default via R3" },
        { router: "R4", cmd: "show ip route 0.0.0.0/0", desc: "Confirme instalação da default no RIB" },
      ],
      expected: "R4 aprende 0.0.0.0/0 por BGP através de R3.",
    },
  ],

  challenge: {
    title: "Desafio: políticas de anúncio controlado",
    description: `Complete as políticas do lab:

1. R1 deve preferir chegar em 10.4.4.0/24 via R2, usando AS-Path Prepend em R3 para o vizinho R1.
2. R1 deve anunciar 192.168.1.1/32 somente a R2 e 172.16.1.1/32 somente a R3.
3. Esses /32 devem ser marcados com community no-advertise.
4. R1 deve anunciar rota default para R2 e R3.

As perguntas são objetivas e baseadas nos comandos do roteiro.`,
    hints: [
      "Use route-map out quando quiser alterar o que um vizinho recebe.",
      "Use prefix-list para selecionar somente o prefixo que a política deve afetar.",
      "no-advertise precisa ser enviado com send-community.",
      "default-originate anuncia 0.0.0.0/0 para um vizinho BGP.",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Qual é a função de 'next-hop-self' no peer R3-R4?",
        options: [
          "Ele reescreve o next-hop das rotas enviadas ao peer iBGP para que R4 alcance os prefixos externos",
          "Ele força R4 a virar eBGP",
          "Ele apaga communities das rotas recebidas",
          "Ele cria automaticamente uma rota default",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Onde aplicar o AS-Path Prepend para fazer R1 preferir o caminho via R2 até 10.4.4.0/24?",
        options: [
          "Outbound em R3 para o vizinho R1",
          "Inbound em R1 vindo de R2",
          "Outbound em R2 para R3",
          "Inbound em R4 vindo de R3",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "O que a community well-known 'no-advertise' faz?",
        options: [
          "Ela impede que a rota seja anunciada a qualquer peer BGP",
          "Ela permite anunciar a rota apenas para eBGP",
          "Ela transforma a rota em default",
          "Ela aumenta o Local Preference para 200",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Por que usamos 'send-community' neste lab?",
        options: [
          "Porque communities só são enviadas ao vizinho quando send-community está habilitado",
          "Porque ele habilita AS-Path Prepend",
          "Porque ele substitui prefix-list",
          "Porque ele derruba a sessão para limpar atributos antigos",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual comando BGP anuncia 0.0.0.0/0 a um vizinho?",
        options: [
          "default-originate",
          "aggregate-address summary-only",
          "set community no-export",
          "next-hop-self",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Qual é a relação entre prefix-list e route-map?",
        options: [
          "Prefix-list seleciona a rota; route-map decide negar, permitir ou alterar atributos",
          "Prefix-list altera AS-PATH; route-map só mostra rotas",
          "Route-map cria interfaces; prefix-list anuncia default",
          "As duas são equivalentes e nunca devem ser usadas juntas",
        ],
      },
    ],
  },
};
