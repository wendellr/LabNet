/**
 * Lab 8 — AS-Path Prepend, Weight e Default Route
 * Adaptado do material "BGP Routing Protocol With 16 Practice Labs".
 *
 * ODR/CDP do Cisco IOS foi substituido por um modelo FRR viavel:
 * - R4 atua como roteador de transito IP, sem BGP;
 * - R1 e R3 formam eBGP multihop atraves de R4;
 * - Weight mantem o caminho primario via R2;
 * - AS-Path Prepend controla a default route de backup.
 */

module.exports = {
  id: 8,
  enabled: true,
  title: "AS-Path Prepend, Weight e Default Route",
  topic: "eBGP Multihop e Preferência Local",
  difficulty: "Intermediário",
  duration: "60 min",
  resourceProfile: "leve",
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
 ip address 14.14.14.1/24
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
 !
 address-family ipv4 unicast
  network 10.3.3.0/24
  neighbor 10.0.23.1 activate
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
 ip address 14.14.14.4/24
!
ip route 10.2.2.0/24 10.0.34.1
ip route 10.3.3.0/24 10.0.34.1
`,
  },

  autoGrade: [
    {
      id: "lab8_summary_checked",
      label: "Sessões BGP observadas",
      router: "R1",
      cmdContains: "show bgp summary",
      outputContains: "Established",
    },
    {
      id: "lab8_multihop_seen",
      label: "eBGP multihop R1-R3 estabelecido",
      router: "R1",
      cmdContains: "show bgp summary",
      outputContains: "10.0.34.1",
    },
    {
      id: "lab8_weight_seen",
      label: "Weight configurado no vizinho R2",
      router: "R1",
      cmdContains: "show running-config",
      outputContains: "weight",
    },
    {
      id: "lab8_default_seen",
      label: "Default route observada em R3",
      router: "R3",
      cmdContains: "show ip bgp 0.0.0.0",
      outputContains: "0.0.0.0/0",
    },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP iniciais verificadas",
      weight: 10,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "Established" },
    },
    {
      id: "host_routes_configured",
      label: "Rotas /32 para eBGP multihop configuradas",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip route 10\\.0\\.34\\.1/32" },
    },
    {
      id: "multihop_configured",
      label: "eBGP multihop R1-R3 configurado",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ebgp-multihop" },
    },
    {
      id: "weight_configured",
      label: "Weight aplicado ao vizinho R2 em R1",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.12\\.2 weight" },
    },
    {
      id: "direct_multihop_path_seen",
      label: "R1 verificou caminho direto via eBGP multihop",
      weight: 10,
      check: { router: "R1", cmdPattern: "show ip bgp 10\\.3\\.3\\.0", outputPattern: "10\\.0\\.34\\.1" },
    },
    {
      id: "default_originate_configured",
      label: "R1 anuncia default para R2 e R3",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "default-originate" },
    },
    {
      id: "prepend_default_configured",
      label: "Default via R3 recebe AS-Path Prepend",
      weight: 10,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "as-path prepend 1 1" },
    },
    {
      id: "r3_default_verified",
      label: "R3 verificou a default route e seus caminhos",
      weight: 10,
      check: { router: "R3", cmdPattern: "show ip bgp 0\\.0\\.0\\.0", outputPattern: "0\\.0\\.0\\.0/0" },
    },
  ],

  answerKey: {
    q1: { type: "radio", correct: "Porque a sessão BGP usa endereços que não estão diretamente conectados", points: 15 },
    q2: { type: "radio", correct: "ebgp-multihop e update-source", points: 15 },
    q3: { type: "radio", correct: "Weight é local ao roteador e vence antes de AS-PATH", points: 20 },
    q4: { type: "radio", correct: "Para manter R1 preferindo o caminho primário via R2 quando ele estiver disponível", points: 15 },
    q5: { type: "radio", correct: "Ele torna a default anunciada pelo caminho direto menos preferida", points: 15 },
    q6: { type: "radio", correct: "R4 apenas encaminha IP entre R1 e R3; ele não participa do BGP", points: 20 },
  },

  steps: [
    {
      id: 1,
      title: "Verificar o caminho primário",
      theory: `A topologia começa com BGP em cadeia:

- R1 no AS 1
- R2 no AS 2
- R3 no AS 3
- R4 como roteador de trânsito sem BGP

R2 anuncia 10.2.2.0/24 e R3 anuncia 10.3.3.0/24. R1 anuncia uma default route para R2, e R2 repassa essa default para R3.`,
      description: `Configure a default de R1 para R2 e observe a conectividade BGP inicial.

No R1:
  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 default-originate
  end
  clear bgp * soft out`,
      commands: [
        { router: "R1", cmd: "show bgp summary", desc: "Sessão R1-R2" },
        { router: "R2", cmd: "show bgp summary", desc: "Sessões R2-R1/R3" },
        { router: "R3", cmd: "show bgp summary", desc: "Sessão R3-R2" },
        { router: "R3", cmd: "show ip bgp 0.0.0.0/0", desc: "R3 deve aprender default via R2" },
      ],
      expected: "R3 aprende 0.0.0.0/0 pelo caminho R3-R2-R1.",
    },
    {
      id: 2,
      title: "Criar eBGP multihop via R4",
      theory: `eBGP normalmente exige que os peers estejam diretamente conectados. Quando os endereços usados para a sessão não estão no mesmo enlace, precisamos de:

- rota IP até o endereço remoto;
- "update-source" para fixar o endereço de origem da sessão;
- "ebgp-multihop" para permitir TTL maior que 1.

Neste lab, R4 não participa do BGP. Ele apenas encaminha IP entre R1 e R3.`,
      description: `Configure uma sessão eBGP entre R1 e R3 passando por R4.

No R1:
  configure terminal
  ip route 10.0.34.1/32 14.14.14.4
  router bgp 1
   neighbor 10.0.34.1 remote-as 3
   neighbor 10.0.34.1 update-source eth2
   neighbor 10.0.34.1 ebgp-multihop 5
   address-family ipv4 unicast
    neighbor 10.0.34.1 activate
  end

No R3:
  configure terminal
  ip route 14.14.14.1/32 10.0.34.2
  router bgp 3
   neighbor 14.14.14.1 remote-as 1
   neighbor 14.14.14.1 update-source eth2
   neighbor 14.14.14.1 ebgp-multihop 5
   address-family ipv4 unicast
    neighbor 14.14.14.1 activate
  end`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme rota /32 e neighbor multihop" },
        { router: "R3", cmd: "show running-config", desc: "Confirme rota /32 e neighbor multihop" },
        { router: "R1", cmd: "show bgp summary", desc: "R1 deve ver o peer 10.0.34.1" },
        { router: "R3", cmd: "show bgp summary", desc: "R3 deve ver o peer 14.14.14.1" },
      ],
      expected: "A sessão eBGP multihop R1-R3 deve ficar Established.",
    },
    {
      id: 3,
      title: "Manter R2 como caminho preferido usando Weight",
      theory: `Depois que R1 fala diretamente com R3 por eBGP multihop, R1 pode preferir o caminho direto para 10.3.3.0/24 porque o AS-PATH é mais curto.

Como a regra do exercício evita route-map, usamos o comando simples "neighbor X weight VALOR". Weight é local ao roteador e vence antes de AS-PATH. Assim, todos os prefixos recebidos de R2 em R1 ganham preferência local.`,
      description: `Configure no R1:

  configure terminal
  router bgp 1
   neighbor 10.0.12.2 weight 100
  end
  clear bgp * soft in

Depois compare o caminho para 10.3.3.0/24.`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme neighbor 10.0.12.2 weight 100" },
        { router: "R1", cmd: "clear bgp * soft in", desc: "Reaplica política inbound" },
        { router: "R1", cmd: "show ip bgp 10.3.3.0/24", desc: "R1 deve preferir via R2 mesmo com caminho direto disponível" },
      ],
      expected: "R1 mantém o caminho via R2 como preferido por causa do Weight.",
    },
    {
      id: 4,
      title: "Anunciar default também pelo backup",
      theory: `Para que R3 tenha uma default de backup via R1-R4, R1 pode anunciar default também para o peer eBGP multihop.

Mas quando o caminho primário via R2 está ativo, queremos que R3 prefira a default via R2. Para isso, aplicamos AS-Path Prepend somente na default anunciada diretamente de R1 para R3.`,
      description: `Configure no R1:

  configure terminal
  route-map PREPEND_DEFAULT permit 10
   set as-path prepend 1 1
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.34.1 default-originate route-map PREPEND_DEFAULT
  end
  clear bgp * soft out

Depois veja as duas opções de default em R3.`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme default-originate com route-map" },
        { router: "R1", cmd: "clear bgp * soft out", desc: "Reenvia default com prepend" },
        { router: "R3", cmd: "show ip bgp 0.0.0.0/0", desc: "Compare default via R2 e via eBGP multihop" },
      ],
      expected: "R3 deve preferir a default via R2, enquanto mantém a default direta via R1 como alternativa menos preferida.",
    },
    {
      id: 5,
      title: "Validar o plano de backup",
      theory: `Um bom desenho de backup não precisa derrubar links durante o exercício para ser validado. Podemos verificar se:

- a sessão eBGP multihop está ativa;
- R1 conhece 10.2.2.0/24 e 10.3.3.0/24 pelo peer R3;
- R4 tem rota IP para encaminhar tráfego em direção a R3;
- R3 mantém uma default alternativa via R1.

Isso demonstra que o caminho de backup existe sem prejudicar outros alunos nem a estabilidade da sessão.`,
      description: `Faça as verificações finais.`,
      commands: [
        { router: "R1", cmd: "show ip bgp 10.2.2.0/24", desc: "R1 deve conhecer alternativa via R3" },
        { router: "R1", cmd: "show ip bgp 10.3.3.0/24", desc: "R1 deve ver caminho direto e via R2" },
        { router: "R4", cmd: "show ip route 10.2.2.0/24", desc: "R4 encaminha para R3" },
        { router: "R3", cmd: "show ip bgp 0.0.0.0/0", desc: "R3 mantém default primária e backup" },
      ],
      expected: "O caminho primário continua preferido, e o caminho de backup está presente nas tabelas.",
    },
  ],

  challenge: {
    title: "Desafio: eBGP multihop com preferência controlada",
    description: `Complete as políticas do lab:

1. R1 deve anunciar default para R2.
2. R1 e R3 devem formar eBGP multihop atravessando R4.
3. R1 deve preferir rotas vindas de R2 usando Weight.
4. R1 deve anunciar default para R3 com AS-Path Prepend, mantendo-a como backup.

As perguntas são objetivas e baseadas no roteiro.`,
    hints: [
      "eBGP multihop precisa de rota IP até o endereço remoto.",
      "update-source fixa o IP usado como origem da sessão BGP.",
      "Weight é local e vence antes do AS-PATH.",
      "AS-Path Prepend torna a default direta menos preferida.",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Por que precisamos de rotas /32 para a sessão eBGP multihop R1-R3?",
        options: [
          "Porque a sessão BGP usa endereços que não estão diretamente conectados",
          "Porque BGP não aceita interfaces Ethernet",
          "Porque Weight só funciona com rota estática",
          "Porque R4 precisa virar route-reflector",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Quais comandos tornam possível uma sessão eBGP entre vizinhos não diretamente conectados?",
        options: [
          "ebgp-multihop e update-source",
          "next-hop-self e no-advertise",
          "aggregate-address e summary-only",
          "route-reflector-client e cluster-id",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Por que Weight faz R1 preferir o caminho via R2?",
        options: [
          "Weight é local ao roteador e vence antes de AS-PATH",
          "Weight é anunciado para R3 e muda o AS-PATH",
          "Weight cria uma rota default automaticamente",
          "Weight reduz a distância administrativa do OSPF",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Qual é o objetivo de aplicar Weight no vizinho R2 em R1?",
        options: [
          "Para manter R1 preferindo o caminho primário via R2 quando ele estiver disponível",
          "Para impedir que R1 forme sessão com R3",
          "Para anunciar 14.14.14.0/24 em BGP",
          "Para transformar R4 em BGP speaker",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual é o efeito do AS-Path Prepend na default anunciada diretamente de R1 para R3?",
        options: [
          "Ele torna a default anunciada pelo caminho direto menos preferida",
          "Ele remove a default da tabela BGP",
          "Ele aumenta o Weight da rota",
          "Ele troca o ASN de R3",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Qual é o papel de R4 nesta adaptação do lab?",
        options: [
          "R4 apenas encaminha IP entre R1 e R3; ele não participa do BGP",
          "R4 é o route-reflector do AS 1",
          "R4 anuncia todas as rotas por OSPF",
          "R4 aplica Local Preference em R1",
        ],
      },
    ],
  },
};
