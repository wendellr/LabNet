/**
 * Lab 7 — BGP Backdoor e AS-Path Prepend
 * Adaptado do material "BGP Routing Protocol With 16 Practice Labs".
 *
 * Este lab habilita OSPF apenas para esta topologia. O objetivo e demonstrar:
 * - default-originate como caminho generico;
 * - AS-Path Prepend aplicado a uma default route;
 * - BGP backdoor para preferir IGP quando houver rota alternativa.
 */

module.exports = {
  id: 7,
  enabled: true,
  title: "BGP Backdoor e AS-Path Prepend",
  topic: "Backdoor, Default Route e IGP/BGP",
  difficulty: "Avançado",
  duration: "70 min",
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
  },
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
    ["R3", "eth2", "R4", "eth1"],
    ["R1", "eth2", "R4", "eth2"],
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
 ip address 10.0.12.1/30
!
interface eth2
 ip address 14.0.0.1/24
!
router bgp 1
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.12.2 remote-as 2
 !
 address-family ipv4 unicast
  neighbor 10.0.12.2 activate
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
 ip address 10.0.23.2/30
!
interface eth2
 ip address 10.0.34.1/30
!
router bgp 3
 bgp router-id 3.3.3.3
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.23.1 remote-as 2
 neighbor 10.0.34.2 remote-as 1
 !
 address-family ipv4 unicast
  network 10.3.3.0/24
  neighbor 10.0.23.1 activate
  neighbor 10.0.34.2 activate
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
 ip address 10.0.34.2/30
!
interface eth2
 ip address 14.0.0.4/24
!
router bgp 1
 bgp router-id 4.4.4.4
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.34.1 remote-as 3
 !
 address-family ipv4 unicast
  neighbor 10.0.34.1 activate
 exit-address-family
`,
  },

  autoGrade: [
    {
      id: "lab7_summary_checked",
      label: "Sessões BGP observadas",
      router: "R2",
      cmdContains: "show bgp summary",
      outputContains: "Established",
    },
    {
      id: "lab7_default_seen",
      label: "Default route observada em R3",
      router: "R3",
      cmdContains: "show ip bgp 0.0.0.0",
      outputContains: "0.0.0.0/0",
    },
    {
      id: "lab7_ospf_seen",
      label: "OSPF observado entre R1 e R4",
      router: "R4",
      cmdContains: "show ip ospf neighbor",
      outputContains: "Full",
    },
    {
      id: "lab7_backdoor_seen",
      label: "Backdoor configurado em R4",
      router: "R4",
      cmdContains: "show running-config",
      outputContains: "backdoor",
    },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP verificadas",
      weight: 10,
      check: { router: "R2", cmdPattern: "show bgp summary", outputPattern: "Established" },
    },
    {
      id: "default_originate",
      label: "R1 e R4 anunciam default route",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "default-originate" },
    },
    {
      id: "prepend_default",
      label: "R4 usa AS-Path Prepend na default anunciada para R3",
      weight: 15,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "as-path prepend 1 1 1" },
    },
    {
      id: "r3_default_verified",
      label: "R3 verificou a escolha da default route",
      weight: 10,
      check: { router: "R3", cmdPattern: "show ip bgp 0\\.0\\.0\\.0", outputPattern: "0\\.0\\.0\\.0/0" },
    },
    {
      id: "ospf_neighbor",
      label: "OSPF estabelecido entre R1 e R4",
      weight: 15,
      check: { router: "R4", cmdPattern: "show ip ospf neighbor", outputPattern: "Full" },
    },
    {
      id: "redistribute_bgp",
      label: "BGP redistribuido no OSPF",
      weight: 10,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "redistribute bgp 1" },
    },
    {
      id: "backdoor_configured",
      label: "BGP backdoor configurado em R4",
      weight: 15,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "backdoor" },
    },
    {
      id: "route_checked",
      label: "R4 verificou a rota para as LANs remotas",
      weight: 10,
      check: { router: "R4", cmdPattern: "show ip route 10\\.2\\.2\\.0|show ip route 10\\.3\\.3\\.0", outputPattern: "10\\.[23]\\.2?3?\\.?.*0/24|10\\.2\\.2\\.0|10\\.3\\.3\\.0" },
    },
  ],

  answerKey: {
    q1: { type: "radio", correct: "Porque R1 e R4 estão no mesmo AS, mas o lab quer evitar iBGP direto entre eles", points: 15 },
    q2: { type: "radio", correct: "default-originate", points: 15 },
    q3: { type: "radio", correct: "Aplicar AS-Path Prepend na default anunciada por R4 para R3", points: 15 },
    q4: { type: "radio", correct: "Ele aumenta a distância administrativa da rota eBGP específica para 200, permitindo preferir uma rota IGP", points: 20 },
    q5: { type: "radio", correct: "OSPF fornece o caminho interno alternativo entre R1 e R4", points: 15 },
    q6: { type: "radio", correct: "A rota BGP volta a ser usada como fallback quando a rota IGP desaparece", points: 20 },
  },

  steps: [
    {
      id: 1,
      title: "Reconhecer AS duplicado sem iBGP",
      theory: `R1 e R4 pertencem ao mesmo AS 1, mas não formam sessão iBGP entre si. Eles estão conectados pela rede 14.0.0.0/24, que representa uma ligação interna/backdoor.

R2 e R3 são ASes intermediários. O lab usa default routes para permitir que R2 e R3 alcancem a rede 14.0.0.0/24 sem anunciar essa rede explicitamente no BGP.`,
      description: `Verifique as sessões BGP. Observe que R1 fala apenas com R2, e R4 fala apenas com R3.`,
      commands: [
        { router: "R1", cmd: "show bgp summary", desc: "R1 deve ter sessão com R2" },
        { router: "R2", cmd: "show bgp summary", desc: "R2 deve ter sessões com R1 e R3" },
        { router: "R3", cmd: "show bgp summary", desc: "R3 deve ter sessões com R2 e R4" },
        { router: "R4", cmd: "show bgp summary", desc: "R4 deve ter sessão com R3" },
      ],
      expected: "Sessões BGP estabelecidas ao longo da cadeia R1-R2-R3-R4.",
    },
    {
      id: 2,
      title: "Anunciar default route pelas bordas do AS 1",
      theory: `"neighbor X default-originate" anuncia 0.0.0.0/0 para um vizinho BGP.

Neste lab, R1 anuncia default para R2 e R4 anuncia default para R3. Assim R2 e R3 conseguem alcançar a rede 14.0.0.0/24 por uma saída genérica, sem que 14.0.0.0/24 seja anunciado diretamente em BGP.`,
      description: `Configure:

No R1:
  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 default-originate
  end
  clear bgp * soft out

No R4:
  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.34.1 default-originate
  end
  clear bgp * soft out`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme default-originate para R2" },
        { router: "R4", cmd: "show running-config", desc: "Confirme default-originate para R3" },
        { router: "R2", cmd: "show ip bgp 0.0.0.0/0", desc: "R2 deve ver default por R1 e por R3/R4" },
        { router: "R3", cmd: "show ip bgp 0.0.0.0/0", desc: "R3 deve ver default por R4 e por R2/R1" },
      ],
      expected: "R2 e R3 veem default routes via BGP.",
    },
    {
      id: 3,
      title: "Influenciar a default com AS-Path Prepend",
      theory: `AS-Path Prepend torna um caminho menos preferido repetindo o ASN no AS-PATH.

Se R4 anuncia default para R3 com AS 1 repetido, a default recebida via R4 passa a parecer mais longa. R3 então tende a preferir a default que chega pelo caminho R2->R1.`,
      description: `Configure em R4:

  configure terminal
  route-map PREPEND_DEFAULT permit 10
   set as-path prepend 1 1 1 1
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.34.1 default-originate route-map PREPEND_DEFAULT
  end
  clear bgp * soft out

Depois compare em R3 os AS-PATHs das rotas default.`,
      commands: [
        { router: "R4", cmd: "show running-config", desc: "Confirme route-map e default-originate com route-map" },
        { router: "R4", cmd: "clear bgp * soft out", desc: "Reenvia default com prepend" },
        { router: "R3", cmd: "show ip bgp 0.0.0.0/0", desc: "Compare a default via R4 e via R2" },
      ],
      expected: "R3 deve enxergar a default via R4 com AS-PATH mais longo.",
    },
    {
      id: 4,
      title: "Criar o caminho IGP pelo enlace backdoor",
      theory: `Backdoor, neste contexto, é um caminho interno alternativo entre dois roteadores do mesmo AS.

Vamos usar OSPF entre R1 e R4 pela rede 14.0.0.0/24. Depois, R1 e R4 redistribuem rotas BGP para OSPF. Isso permite que R4 veja redes como 10.2.2.0/24 e 10.3.3.0/24 também via OSPF, além do caminho eBGP.`,
      description: `Configure OSPF em R1 e R4.

No R1:
  configure terminal
  router ospf
   ospf router-id 1.1.1.1
   network 14.0.0.0/24 area 0
   redistribute bgp 1
  end

No R4:
  configure terminal
  router ospf
   ospf router-id 4.4.4.4
   network 14.0.0.0/24 area 0
   redistribute bgp 1
  end`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme OSPF e redistribute bgp em R1" },
        { router: "R4", cmd: "show running-config", desc: "Confirme OSPF e redistribute bgp em R4" },
        { router: "R4", cmd: "show ip ospf neighbor", desc: "OSPF deve estar Full com R1" },
        { router: "R4", cmd: "show ip route 10.2.2.0/24", desc: "Antes do backdoor, eBGP ainda pode vencer" },
      ],
      expected: "OSPF forma vizinhança entre R1 e R4, mas rotas eBGP ainda podem vencer pela distância administrativa menor.",
    },
    {
      id: 5,
      title: "Aplicar BGP Backdoor",
      theory: `Por padrão, eBGP tem distância administrativa 20, enquanto OSPF tem 110. Mesmo que exista um caminho interno OSPF, a rota eBGP normalmente vence.

O comando "network PREFIX backdoor" marca aquele prefixo como backdoor no BGP. O efeito prático é aumentar a distância administrativa da rota eBGP específica para 200. Assim, se existir uma rota IGP para o mesmo prefixo, a rota IGP passa a ser preferida. Se o IGP desaparecer, o BGP ainda serve como fallback.`,
      description: `Configure em R4:

  configure terminal
  router bgp 1
   address-family ipv4 unicast
    network 10.2.2.0/24 backdoor
    network 10.3.3.0/24 backdoor
  end

Depois verifique se R4 passa a preferir as rotas via OSPF para 10.2.2.0/24 e 10.3.3.0/24.`,
      commands: [
        { router: "R4", cmd: "show running-config", desc: "Confirme network ... backdoor" },
        { router: "R4", cmd: "show ip bgp 10.2.2.0/24", desc: "A rota BGP continua existindo" },
        { router: "R4", cmd: "show ip route 10.2.2.0/24", desc: "A rota instalada deve preferir OSPF se disponível" },
        { router: "R4", cmd: "show ip route 10.3.3.0/24", desc: "Repita a verificação para 10.3.3.0/24" },
      ],
      expected: "R4 deve instalar a rota OSPF para os prefixos marcados como backdoor, mantendo BGP como alternativa.",
    },
  ],

  challenge: {
    title: "Desafio: preferir o caminho interno sem perder fallback",
    description: `Complete o lab garantindo que:

1. R1 e R4 anunciem default route para R2 e R3.
2. R4 aplique AS-Path Prepend na default anunciada a R3.
3. R1 e R4 formem OSPF pela rede 14.0.0.0/24.
4. R4 use BGP backdoor para preferir OSPF em 10.2.2.0/24 e 10.3.3.0/24.

As perguntas abaixo são objetivas e baseadas diretamente no roteiro.`,
    hints: [
      "default-originate cria 0.0.0.0/0 para o vizinho BGP.",
      "AS-Path Prepend deve ser aplicado na direção de saída da rota que você quer tornar menos preferida.",
      "Backdoor não remove a rota BGP; ele faz a rota IGP vencer quando estiver presente.",
      "Use show ip route e show ip bgp para separar rota conhecida de rota instalada.",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Por que R1 e R4 não formam iBGP diretamente neste lab?",
        options: [
          "Porque R1 e R4 estão no mesmo AS, mas o lab quer evitar iBGP direto entre eles",
          "Porque BGP não funciona em roteadores do mesmo AS",
          "Porque OSPF substitui completamente o BGP",
          "Porque R1 e R4 não possuem conectividade IP",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Qual comando anuncia uma rota default para um vizinho BGP?",
        options: [
          "default-originate",
          "network 14.0.0.0/24 backdoor",
          "redistribute bgp",
          "next-hop-self",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Como fazer R3 preferir a default que chega via R2/R1 em vez da default direta via R4?",
        options: [
          "Aplicar AS-Path Prepend na default anunciada por R4 para R3",
          "Aplicar no-advertise em todas as rotas de R1",
          "Criar iBGP entre R1 e R4",
          "Remover a sessão BGP entre R2 e R3",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Qual é o efeito prático do BGP backdoor?",
        options: [
          "Ele aumenta a distância administrativa da rota eBGP específica para 200, permitindo preferir uma rota IGP",
          "Ele anuncia automaticamente a rota para todos os peers",
          "Ele cria uma community no-export",
          "Ele reduz a distância administrativa do eBGP para 1",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual é o papel do OSPF neste lab?",
        options: [
          "OSPF fornece o caminho interno alternativo entre R1 e R4",
          "OSPF cria as sessões BGP",
          "OSPF remove os AS-PATHs",
          "OSPF envia communities BGP",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "O que acontece com uma rota backdoor se a rota IGP desaparecer?",
        options: [
          "A rota BGP volta a ser usada como fallback quando a rota IGP desaparece",
          "A rota fica permanentemente bloqueada",
          "A sessão BGP é encerrada",
          "O prefixo vira rota default automaticamente",
        ],
      },
    ],
  },
};
