/**
 * Lab 5 — Bestpath as-path ignore e Aggregate Address
 * Adaptado do material "BGP Routing Protocol With 16 Practice Labs".
 *
 * Objetivo da adaptação:
 * - manter 4 roteadores FRR para ser leve no servidor;
 * - ensinar dois conceitos independentes e verificáveis;
 * - evitar dependência de IOS/serial e usar ethernet + FRR/vtysh.
 */

module.exports = {
  id: 5,
  enabled: true,
  title: "Bestpath AS-PATH Ignore e Aggregate Address",
  topic: "Seleção de Caminho e Agregação",
  difficulty: "Intermediário",
  duration: "50 min",
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
 ip address 172.16.1.1/24
!
interface eth1
 ip address 10.0.12.1/30
!
interface eth2
 ip address 10.0.13.5/30
!
router bgp 1
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.12.2 remote-as 2
 neighbor 10.0.13.6 remote-as 3
 !
 address-family ipv4 unicast
  network 172.16.1.0/24
  neighbor 10.0.12.2 activate
  neighbor 10.0.13.6 activate
 exit-address-family
`,
    R2: `frr version 9.0
frr defaults traditional
hostname R2
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 22.22.22.22/32
 ip address 172.16.2.2/24
!
interface eth1
 ip address 10.0.12.2/30
!
interface eth2
 ip address 10.0.23.9/30
!
router bgp 2
 bgp router-id 22.22.22.22
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.12.1 remote-as 1
 neighbor 10.0.23.10 remote-as 3
 !
 address-family ipv4 unicast
  network 172.16.2.0/24
  neighbor 10.0.12.1 activate
  neighbor 10.0.23.10 activate
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
 ip address 172.16.3.3/24
!
interface eth1
 ip address 10.0.13.6/30
!
interface eth2
 ip address 10.0.23.10/30
!
interface eth3
 ip address 10.0.34.13/30
!
router bgp 3
 bgp router-id 3.3.3.3
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.13.5 remote-as 1
 neighbor 10.0.23.9 remote-as 2
 neighbor 10.0.34.14 remote-as 4
 !
 address-family ipv4 unicast
  network 172.16.3.0/24
  neighbor 10.0.13.5 activate
  neighbor 10.0.23.9 activate
  neighbor 10.0.34.14 activate
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
 ip address 172.16.4.4/24
!
interface eth1
 ip address 10.0.34.14/30
!
router bgp 4
 bgp router-id 4.4.4.4
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.34.13 remote-as 3
 !
 address-family ipv4 unicast
  network 172.16.4.0/24
  neighbor 10.0.34.13 activate
 exit-address-family
`,
  },

  autoGrade: [
    {
      id: "lab5_summary_checked",
      label: "Sessões BGP observadas",
      router: "R1",
      cmdContains: "show bgp summary",
      outputContains: "Established",
    },
    {
      id: "lab5_prepend_seen",
      label: "AS-PATH prepend visto em R1",
      router: "R1",
      cmdContains: "show ip bgp 172.16.4.0",
      outputPattern: "3 3 3",
    },
    {
      id: "lab5_ignore_config_seen",
      label: "bestpath as-path ignore confirmado",
      router: "R1",
      cmdContains: "show running-config",
      outputContains: "bgp bestpath as-path ignore",
    },
    {
      id: "lab5_aggregate_seen",
      label: "Agregado 172.16.0.0/16 observado",
      router: "R1",
      cmdContains: "show ip bgp 172.16.0.0",
      outputContains: "172.16.0.0/16",
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
      id: "prepend_configured",
      label: "AS-PATH prepend configurado no R3 para R1",
      weight: 15,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "as-path prepend" },
    },
    {
      id: "prepend_visible",
      label: "R1 observou caminho artificialmente mais longo",
      weight: 15,
      check: { router: "R1", cmdPattern: "show ip bgp 172\\.16\\.4\\.0", outputPattern: "3 3 3" },
    },
    {
      id: "aspath_ignore_configured",
      label: "bgp bestpath as-path ignore configurado no R1",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "bgp bestpath as-path ignore" },
    },
    {
      id: "aggregate_configured",
      label: "aggregate-address configurado no R3",
      weight: 15,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "aggregate-address 172\\.16\\.0\\.0/16 summary-only" },
    },
    {
      id: "aggregate_visible",
      label: "R1 observou o agregado 172.16.0.0/16",
      weight: 15,
      check: { router: "R1", cmdPattern: "show ip bgp 172\\.16\\.0\\.0", outputPattern: "172\\.16\\.0\\.0/16" },
    },
    {
      id: "summary_only_effect",
      label: "Aluno verificou tabela após summary-only",
      weight: 15,
      check: { router: "R1", cmdPattern: "show ip bgp", outputPattern: "172\\.16\\.0\\.0/16" },
    },
  ],

  answerKey: {
    q1: { type: "radio", correct: "Ele deixa de usar o tamanho do AS-PATH como critério de desempate na seleção do best path", points: 15 },
    q2: { type: "radio", correct: "No R3, aplicado outbound para o vizinho R1", points: 15 },
    q3: { type: "radio", correct: "Porque o caminho direto passa a parecer pior quando o AS 3 é repetido no AS-PATH", points: 15 },
    q4: { type: "radio", correct: "No R3, porque ele conhece os prefixos 172.16.x.0/24 e pode anunciar um resumo /16", points: 15 },
    q5: { type: "radio", correct: "Anuncia o prefixo agregado e suprime os prefixos mais específicos para aquele anúncio", points: 20 },
    q6: { type: "radio", correct: "Reduzir a quantidade de rotas anunciadas, simplificando a tabela BGP dos vizinhos", points: 20 },
  },

  steps: [
    {
      id: 1,
      title: "Reconhecer os caminhos",
      theory: `Este lab usa 4 roteadores e 4 ASes. R1 alcança a rede 172.16.4.0/24 de R4 por dois caminhos:

- Caminho direto via R3: AS-PATH "3 4"
- Caminho indireto via R2 e R3: AS-PATH "2 3 4"

Por padrão, o BGP prefere o menor AS-PATH. Portanto, antes de qualquer política, R1 deve preferir o caminho direto via R3.`,
      description: `Verifique as sessões BGP e observe o prefixo 172.16.4.0/24 em R1.

O objetivo inicial é entender qual caminho é escolhido antes de alterar a política.`,
      commands: [
        { router: "R1", cmd: "show bgp summary", desc: "Confirme as sessões BGP de R1" },
        { router: "R1", cmd: "show ip bgp 172.16.4.0/24", desc: "Veja os dois caminhos para a rede de R4" },
        { router: "R1", cmd: "show ip bgp", desc: "Tabela BGP completa em R1" },
      ],
      expected: "R1 deve preferir o caminho via R3 porque o AS-PATH direto é menor.",
    },
    {
      id: 2,
      title: "Tornar o caminho direto menos atrativo",
      theory: `AS-Path Prepend torna um caminho menos preferido repetindo o próprio ASN no atributo AS-PATH.

Quando R3 anuncia a rota de R4 para R1 com "set as-path prepend 3 3 3", o caminho direto deixa de parecer "3 4" e passa a parecer algo como "3 3 3 3 4".

Isso não derruba a sessão BGP; é uma política aplicada em anúncios de saída. Depois de aplicar a route-map, use "clear bgp * soft out" para reenviar os anúncios com a nova política.`,
      description: `Configure em R3 uma route-map outbound para R1:

  configure terminal
  route-map PREPEND_TO_R1 permit 10
   set as-path prepend 3 3 3
  exit
  router bgp 3
   address-family ipv4 unicast
    neighbor 10.0.13.5 route-map PREPEND_TO_R1 out
  end
  clear bgp * soft out

Depois verifique em R1 se o caminho direto ficou com AS-PATH maior.`,
      commands: [
        { router: "R3", cmd: "show running-config", desc: "Confirme a route-map e a política outbound" },
        { router: "R3", cmd: "clear bgp * soft out", desc: "Reenvie anúncios BGP com a política" },
        { router: "R1", cmd: "show ip bgp 172.16.4.0/24", desc: "Veja se o AS-PATH via R3 ficou maior" },
      ],
      expected: "R1 deve enxergar AS 3 repetido no caminho recebido diretamente de R3.",
    },
    {
      id: 3,
      title: "Ignorar o tamanho do AS-PATH",
      theory: `"bgp bestpath as-path ignore" altera a lógica de seleção do BGP no roteador onde é configurado.

Com esse comando, o roteador deixa de usar o tamanho do AS-PATH como critério de decisão. Ele não remove o atributo da tabela; apenas ignora seu tamanho na escolha do best path.

Isso é útil para demonstrar que a ordem de decisão do BGP é política local: o mesmo conjunto de rotas pode gerar escolhas diferentes quando um critério é desabilitado.`,
      description: `Configure no R1:

  configure terminal
  router bgp 1
   bgp bestpath as-path ignore
  end
  clear bgp * soft

Depois compare o best path para 172.16.4.0/24 antes e depois.`,
      commands: [
        { router: "R1", cmd: "show running-config", desc: "Confirme o comando bestpath" },
        { router: "R1", cmd: "clear bgp * soft", desc: "Força reavaliação local dos caminhos" },
        { router: "R1", cmd: "show ip bgp 172.16.4.0/24", desc: "Observe qual caminho ficou como best path" },
      ],
      expected: "R1 deve deixar de penalizar o caminho direto apenas por ele ter AS-PATH mais longo.",
    },
    {
      id: 4,
      title: "Criar um agregado BGP",
      theory: `Agregação BGP reduz a quantidade de prefixos anunciados para os vizinhos.

Se um roteador conhece várias redes dentro de 172.16.0.0/16, ele pode anunciar apenas o resumo 172.16.0.0/16. O comando é:

  aggregate-address 172.16.0.0/16 summary-only

O parâmetro "summary-only" anuncia o agregado e suprime os prefixos mais específicos naquela direção. Sem ele, o BGP pode anunciar o agregado e também continuar anunciando os /24.`,
      description: `Configure no R3:

  configure terminal
  router bgp 3
   address-family ipv4 unicast
    aggregate-address 172.16.0.0/16 summary-only
  end
  clear bgp * soft out

Depois verifique no R1 se o prefixo 172.16.0.0/16 aparece na tabela BGP.`,
      commands: [
        { router: "R3", cmd: "show running-config", desc: "Confirme o aggregate-address" },
        { router: "R3", cmd: "clear bgp * soft out", desc: "Reenvie anúncios com o agregado" },
        { router: "R1", cmd: "show ip bgp 172.16.0.0/16", desc: "Veja o agregado em R1" },
        { router: "R1", cmd: "show ip bgp", desc: "Compare agregado e prefixos específicos" },
      ],
      expected: "R1 deve aprender o agregado 172.16.0.0/16 vindo de R3.",
    },
  ],

  challenge: {
    title: "Desafio: controlar seleção e reduzir anúncios",
    description: `Complete o lab garantindo que:

1. R3 anuncie para R1 o caminho de 172.16.4.0/24 com AS-PATH prepend.
2. R1 tenha "bgp bestpath as-path ignore" configurado.
3. R3 anuncie o agregado 172.16.0.0/16 com "summary-only".
4. Você tenha verificado os resultados com "show ip bgp" e "show running-config".

As perguntas abaixo são objetivas e baseadas nos conceitos praticados no roteiro.`,
    hints: [
      "AS-Path Prepend muda o atributo anunciado; bestpath as-path ignore muda a decisão local.",
      "A route-map de prepend precisa estar outbound no vizinho para quem R3 anuncia.",
      "O agregado deve ser criado no roteador que conhece os prefixos mais específicos.",
      "summary-only evita anunciar todos os /24 junto com o /16.",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "O que o comando 'bgp bestpath as-path ignore' faz?",
        options: [
          "Ele deixa de usar o tamanho do AS-PATH como critério de desempate na seleção do best path",
          "Ele apaga o AS-PATH das rotas antes de anunciá-las",
          "Ele derruba e recria todas as sessões BGP",
          "Ele transforma eBGP em iBGP",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Onde a route-map com 'set as-path prepend 3 3 3' deve ser aplicada neste lab?",
        options: [
          "No R3, aplicado outbound para o vizinho R1",
          "No R1, aplicado inbound para o vizinho R3",
          "No R2, aplicado outbound para o vizinho R1",
          "No R4, aplicado inbound para o vizinho R3",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Por que o AS-Path Prepend pode fazer R1 deixar de preferir o caminho direto via R3?",
        options: [
          "Porque o caminho direto passa a parecer pior quando o AS 3 é repetido no AS-PATH",
          "Porque o next-hop deixa de responder ARP",
          "Porque o BGP passa a comparar MED antes de Local Preference",
          "Porque o agregado /16 remove a rota /24 localmente em R1",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Onde faz mais sentido criar o aggregate-address 172.16.0.0/16 neste lab?",
        options: [
          "No R3, porque ele conhece os prefixos 172.16.x.0/24 e pode anunciar um resumo /16",
          "No R1, porque ele é o menor ASN",
          "No R4, porque só ele possui 172.16.4.0/24",
          "Em todos os roteadores obrigatoriamente",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual é o efeito de 'summary-only' no aggregate-address?",
        options: [
          "Anuncia o prefixo agregado e suprime os prefixos mais específicos para aquele anúncio",
          "Anuncia somente os prefixos /24 e bloqueia o /16",
          "Cria uma rota default 0.0.0.0/0",
          "Ativa comunidades BGP automaticamente",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Qual é o principal benefício operacional da agregação BGP?",
        options: [
          "Reduzir a quantidade de rotas anunciadas, simplificando a tabela BGP dos vizinhos",
          "Aumentar obrigatoriamente o Local Preference",
          "Impedir que qualquer rota seja aprendida por eBGP",
          "Trocar o ASN dos vizinhos automaticamente",
        ],
      },
    ],
  },
};
