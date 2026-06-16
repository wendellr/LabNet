/**
 * Lab 1 — MED e AS-Path Prepend
 * Topic: Atributos de Seleção de Caminho
 * Difficulty: Iniciante
 * Duration: 45 min
 */

module.exports = {
  id: 1,
  title: "MED e AS-Path Prepend",
  topic: "Atributos de Seleção de Caminho",
  difficulty: "Iniciante",
  duration: "45 min",
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
 ip address 10.0.0.1/30
!
interface eth2
 ip address 10.0.0.5/30
!
router bgp 1
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 2.2.2.2 remote-as 2
 neighbor 2.2.2.2 update-source lo
 neighbor 2.2.2.2 ebgp-multihop 2
 neighbor 4.4.4.4 remote-as 4
 neighbor 4.4.4.4 update-source lo
 neighbor 4.4.4.4 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 150.1.1.0/24
  neighbor 2.2.2.2 activate
  neighbor 4.4.4.4 activate
 exit-address-family
!
ip route 2.2.2.2/32 10.0.0.2
ip route 4.4.4.4/32 10.0.0.6
ip route 150.1.1.0/24 Null0
`,
    R2: `frr version 9.0
frr defaults traditional
hostname R2
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 2.2.2.2/32
!
interface eth1
 ip address 10.0.0.2/30
!
interface eth2
 ip address 10.0.0.9/30
!
router bgp 2
 bgp router-id 2.2.2.2
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 1.1.1.1 remote-as 1
 neighbor 1.1.1.1 update-source lo
 neighbor 1.1.1.1 ebgp-multihop 2
 neighbor 3.3.3.3 remote-as 3
 neighbor 3.3.3.3 update-source lo
 neighbor 3.3.3.3 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 150.2.2.0/24
  neighbor 1.1.1.1 activate
  neighbor 3.3.3.3 activate
 exit-address-family
!
ip route 1.1.1.1/32 10.0.0.1
ip route 3.3.3.3/32 10.0.0.10
ip route 150.2.2.0/24 Null0
`,
    R3: `frr version 9.0
frr defaults traditional
hostname R3
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 3.3.3.3/32
!
interface eth1
 ip address 10.0.0.10/30
!
interface eth2
 ip address 10.0.0.13/30
!
router bgp 3
 bgp router-id 3.3.3.3
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 2.2.2.2 remote-as 2
 neighbor 2.2.2.2 update-source lo
 neighbor 2.2.2.2 ebgp-multihop 2
 neighbor 4.4.4.4 remote-as 4
 neighbor 4.4.4.4 update-source lo
 neighbor 4.4.4.4 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 150.3.3.0/24
  neighbor 2.2.2.2 activate
  neighbor 4.4.4.4 activate
 exit-address-family
!
ip route 2.2.2.2/32 10.0.0.9
ip route 4.4.4.4/32 10.0.0.14
ip route 150.3.3.0/24 Null0
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
 ip address 10.0.0.6/30
!
router bgp 4
 bgp router-id 4.4.4.4
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 1.1.1.1 remote-as 1
 neighbor 1.1.1.1 update-source lo
 neighbor 1.1.1.1 ebgp-multihop 2
 neighbor 3.3.3.3 remote-as 3
 neighbor 3.3.3.3 update-source lo
 neighbor 3.3.3.3 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 150.4.4.0/24
  neighbor 1.1.1.1 activate
  neighbor 3.3.3.3 activate
 exit-address-family
!
ip route 1.1.1.1/32 10.0.0.5
ip route 3.3.3.3/32 10.0.0.13
ip route 150.4.4.0/24 Null0
`,
  },

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP verificadas (show bgp summary)",
      weight: 10,
      check: { router: "any", cmdPattern: "show bgp summary", outputPattern: "Established" },
    },
    {
      id: "bgp_table_multiple_paths",
      label: "Tabela BGP com múltiplos caminhos observada",
      weight: 10,
      check: { router: "R3", cmdPattern: "show ip bgp 150.1.1.0", outputPattern: "\\*\\s+150\\.1\\.1\\.0" },
    },
    {
      id: "aspath_prepend_configured",
      label: "AS-Path Prepend configurado no R1",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "as-path prepend" },
    },
    {
      id: "aspath_prepend_applied",
      label: "AS-Path Prepend aplicado — R4 vê caminho mais longo via R1",
      weight: 15,
      check: { router: "R4", cmdPattern: "show ip bgp 150.1.1.0", outputPattern: "1 1 1" },
    },
    {
      id: "r4_prefers_r3",
      label: "R4 prefere caminho via R3",
      weight: 15,
      check: { router: "R4", cmdPattern: "show ip bgp", outputPattern: ">\\s+150\\.1\\.1\\.0\\s+3\\.3\\.3\\.3" },
    },
    {
      id: "med_configured_r2",
      label: "MED configurado no R2 (set metric)",
      weight: 10,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "set metric" },
    },
    {
      id: "med_configured_r4",
      label: "MED configurado no R4 (set metric)",
      weight: 10,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "set metric" },
    },
    {
      id: "always_compare_med",
      label: "bgp always-compare-med ativo no R3",
      weight: 10,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "always-compare-med" },
    },
    {
      id: "r3_prefers_r2_med",
      label: "R3 prefere caminho via R2 pelo menor MED",
      weight: 15,
      check: { router: "R3", cmdPattern: "show ip bgp 150.1.1.0", outputPattern: ">\\s+150\\.1\\.1\\.0\\s+2\\.2\\.2\\.2\\s+2" },
    },
  ],

  answerKey: {
    q1: { type: "radio", correct: "No R3, direção out para o vizinho 1.1.1.1", points: 15 },
    q2: { type: "radio", correct: "Porque por padrão o BGP só compara MED entre rotas do mesmo AS vizinho", points: 15 },
    q3: { type: "radio", correct: "Após o AS-PATH e após o Origin", points: 15 },
    q4: { type: "radio", correct: "O BGP volta a comparar comprimento de AS-PATH antes do MED, podendo mudar o best path", points: 15 },
    q5: { type: "radio", correct: "MED afeta só o vizinho diretamente conectado; AS-Path Prepend é visível por todos os ASes no caminho", points: 20 },
    q6: { type: "radio", correct: "bgp always-compare-med + bgp bestpath as-path ignore", points: 20 },
  },

  steps: [
    {
      id: 1,
      title: "Reconhecimento da Topologia",
      theory: `O BGP (Border Gateway Protocol) é o protocolo de roteamento que interliga os sistemas autônomos (ASes) da internet. Cada AS é identificado por um número único (ASN) e anuncia seus prefixos IP para os vizinhos BGP.

Uma sessão BGP é estabelecida via TCP na porta 179. Quando dois roteadores trocam mensagens OPEN e chegam ao estado ESTABLISHED, eles passam a trocar tabelas de rotas (UPDATEs). O estado da sessão é visível com o comando "show bgp summary".

Neste lab, cada roteador representa um AS diferente. Antes de qualquer configuração de política, você precisa entender o estado atual da rede — quais sessões existem, quais prefixos estão sendo anunciados e qual caminho o BGP escolheu como melhor.`,
      description: `A topologia tem 4 ASes (AS1=R1, AS2=R2, AS3=R3, AS4=R4).
R3 recebe o prefixo 150.1.1.0/24 por dois caminhos: via R2 (AS2→AS1) e via R4 (AS4→AS1).

Execute os comandos abaixo e anote:
- Quantas sessões BGP cada roteador mantém?
- Quais prefixos estão na tabela BGP de R3 e R4?
- Qual caminho está sendo preferido (*>) para 150.1.1.0/24 no R3?`,
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "Estado das sessões BGP de R1" },
        { cmd: "show bgp summary", router: "R3", desc: "Estado das sessões BGP de R3" },
        { cmd: "show ip bgp", router: "R3", desc: "Tabela BGP de R3 — quais caminhos para 150.1.1.0?" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "Detalhe: quantos caminhos? Qual o AS-PATH de cada?" },
      ],
      expected: "Todas as sessões em 'Established'. R3 vê 150.1.1.0/24 por dois caminhos com AS-PATH de mesmo comprimento.",
    },
    {
      id: 2,
      title: "Análise: por que R3 prefere este caminho?",
      theory: `O BGP usa um processo de seleção de melhor caminho com múltiplos critérios em ordem de prioridade:

1. Weight (Cisco) — maior é melhor, local ao roteador
2. Local Preference — maior é melhor, propagado dentro do AS
3. Rota originada localmente — preferida
4. AS-PATH — caminho mais CURTO é preferido
5. Origin — IGP > EGP > Incomplete
6. MED — menor é melhor (comparado entre rotas do mesmo AS vizinho)
7. eBGP sobre iBGP
8. Menor métrica IGP até o next-hop
9. Menor Router-ID do vizinho

Quando dois caminhos emparam em todos os critérios anteriores, o BGP usa o Router-ID do vizinho como desempate final — preferindo o menor valor numérico.`,
      description: `Observe a saída de 'show ip bgp 150.1.1.0/24' no R3.

O símbolo *> indica o best path. Como ambos os caminhos têm AS-PATH de mesmo comprimento (2 hops), o BGP usa o Router-ID do vizinho como desempate — prefere o menor.

Verifique qual vizinho tem o menor Router-ID:
- Caminho via R2: next-hop 2.2.2.2
- Caminho via R4: next-hop 4.4.4.4

Por enquanto, apenas observe e entenda o comportamento atual. Não configure nada ainda.`,
      commands: [
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "Confirme: qual o Router-ID do vizinho preferido (*>)?" },
        { cmd: "show ip bgp 150.3.3.0/24", router: "R1", desc: "E no R1? Qual caminho é preferido para 150.3.3.0?" },
      ],
      expected: "R3 prefere 150.1.1.0 via next-hop com menor valor numérico (2.2.2.2 < 4.4.4.4).",
    },
    {
      id: 3,
      title: "Configurar AS-Path Prepend",
      theory: `O AS-Path Prepend é uma técnica de engenharia de tráfego de ENTRADA (inbound traffic engineering). Ao repetir o próprio ASN no AS-PATH dos anúncios de saída, o roteador faz aquele caminho parecer mais longo para os vizinhos externos — tornando-o menos preferido.

É amplamente usado quando uma organização tem múltiplos uplinks para a internet e quer controlar por qual link o tráfego entra. Por exemplo, se um AS tem dois provedores (ISP-A e ISP-B) e quer receber tráfego principalmente pelo ISP-A, ele anuncia seus prefixos para o ISP-B com AS-PATH mais longo.

Importante: o AS-Path Prepend afeta todos os ASes ao longo do caminho que receberem o anúncio — é uma sinalização global, não apenas para o vizinho direto.`,
      description: `Objetivo: fazer R4 preferir o caminho via R3 (em vez de R1 diretamente) para prefixos do AS1.

Sintaxe no FRR/vtysh:
  configure terminal
  route-map PREPEND_R4 permit 10
   set as-path prepend 1 1 1
  exit
  router bgp 1
   address-family ipv4 unicast
    neighbor 4.4.4.4 route-map PREPEND_R4 out
  exit

Após configurar, aplique o soft-reset e verifique R4.
⚠️ Não copie — digite você mesmo e adapte o nome da route-map se quiser.`,
      commands: [
        { cmd: "show ip bgp 150.1.1.0/24", router: "R4", desc: "ANTES: anote o AS-PATH atual via R1 (1.1.1.1)" },
        { cmd: "show running-config", router: "R1", desc: "Confirme que sua route-map foi criada" },
        { cmd: "clear bgp * soft out", router: "R1", desc: "Aplica políticas de saída sem derrubar sessões" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R4", desc: "DEPOIS: o AS-PATH via R1 está mais longo agora?" },
      ],
      expected: "R4 deve ver AS-PATH '1 1 1 1' (ou similar) pelo caminho via R1. O caminho via R3 deve ser preferido (*>) por ser mais curto.",
    },
    {
      id: 4,
      title: "Observar o MED — antes de configurar",
      theory: `O MED (Multi-Exit Discriminator) indica para o AS vizinho qual ponto de entrada preferir.
Menor MED = mais preferido. É um atributo NÃO-TRANSITIVO (não é repassado além do AS vizinho direto).

Importante: por padrão, o BGP só compara MED entre rotas recebidas do MESMO AS vizinho.
R3 recebe 150.1.1.0/24 de R2 (AS2) e de R4 (AS4) — ASes diferentes — então MED não é comparado.

Antes de configurar qualquer MED, observe o estado atual:`,
      commands: [
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "Há algum valor de 'metric' nos caminhos? Qual é o *>?" },
        { cmd: "show ip bgp 150.2.2.0/24", router: "R3", desc: "Mesmo padrão para outro prefixo" },
      ],
      expected: "MED deve aparecer como 0 ou ausente. R3 seleciona caminho por Router-ID, não por MED.",
    },
    {
      id: 5,
      title: "Configurar MED em R2 e R4",
      theory: `Para anunciar um MED específico para um vizinho, usa-se uma route-map com o comando "set metric VALOR" aplicada na direção de saída (out) para o vizinho desejado.

A route-map é uma ferramenta poderosa do BGP que permite filtrar e modificar atributos de rotas. Ela funciona como uma lista de regras sequenciais — cada cláusula tem um número de sequência, uma ação (permit/deny) e condições de match opcionais.

Quando nenhuma condição de match é especificada, a regra se aplica a TODAS as rotas. O comando "set metric" modifica o atributo MED das rotas que passam por aquela cláusula.

Após aplicar a route-map, é necessário fazer um soft-reset com "clear bgp * soft out" para que o roteador reenvie todos os anúncios com a nova política sem derrubar as sessões BGP.`,
      description: `Configure:
- R2 anuncia para R3 com MED = 2 (mais preferido)
- R4 anuncia para R3 com MED = 4 (menos preferido)

Em cada roteador, crie uma route-map com 'set metric VALOR' e aplique como política out para o vizinho 3.3.3.3.

Após configurar ambos, verifique R3 — o caminho preferido provavelmente NÃO vai mudar ainda. Isso é esperado!`,
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme a route-map de MED no R2" },
        { cmd: "clear bgp * soft out", router: "R2", desc: "Aplica políticas no R2" },
        { cmd: "show running-config", router: "R4", desc: "Confirme a route-map de MED no R4" },
        { cmd: "clear bgp * soft out", router: "R4", desc: "Aplica políticas no R4" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "Veja os valores de metric — o caminho preferido mudou?" },
      ],
      expected: "R3 deve mostrar 'metric 2' via R2 e 'metric 4' via R4. Mas o best path (*>) provavelmente não mudou ainda.",
    },
    {
      id: 6,
      title: "Resolver os dois problemas do MED entre ASes",
      theory: `Dois comandos especiais do BGP modificam o comportamento padrão da seleção de melhor caminho:

"bgp always-compare-med" — força o roteador a comparar o MED mesmo entre rotas recebidas de ASes vizinhos diferentes. Sem este comando, o BGP ignora o MED quando as rotas vêm de ASes distintos (comportamento RFC 4271 padrão).

"bgp bestpath as-path ignore" — remove o comprimento do AS-PATH como critério de seleção. Normalmente o BGP compara AS-PATH ANTES do MED na ordem de decisão. Com este comando, o BGP pula essa comparação e avança para o MED mais cedo na sequência.

A combinação dos dois faz com que o MED se torne o critério determinante para a seleção entre caminhos de ASes diferentes.`,
      description: `Configure AMBOS os comandos no R3:
  configure terminal
  router bgp 3
   bgp always-compare-med
   bgp bestpath as-path ignore

Depois compare o resultado antes e depois.`,
      commands: [
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "ANTES: observe qual caminho é preferido" },
        { cmd: "show running-config", router: "R3", desc: "Confirme os dois comandos bgp no R3" },
        { cmd: "clear bgp * soft", router: "R3", desc: "Aplica mudanças de decisão de caminho localmente" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "DEPOIS: R3 agora prefere via R2 (metric=2)?" },
        { cmd: "show ip bgp", router: "R3", desc: "Todos os prefixos preferem via R2 agora?" },
      ],
      expected: "Após os dois comandos, R3 deve preferir (*>) todos os prefixos via R2 (next-hop 2.2.2.2, metric 2).",
    },
  ],

  challenge: {
    title: "Desafio: Engenharia de Tráfego Assimétrica",
    description: `Sem apagar o que você já configurou, complete estes requisitos ADICIONAIS:

1. Faça R1 preferir o caminho via R4 (não via R2) para alcançar 150.3.3.0/24.
   Dica: onde e em qual direção aplicar AS-Path Prepend?

2. Verifique assimetria: R3→R1 deve usar um caminho diferente de R1→R3.
   Compare 'show ip bgp 150.1.1.0/24' no R3 com 'show ip bgp 150.3.3.0/24' no R1.

3. Experimento: remova temporariamente 'bgp bestpath as-path ignore' do R3.
   Execute 'clear bgp * soft', observe o que mudou, depois restaure.
   O que aconteceu com a seleção de rotas?`,
    hints: [
      "Para o requisito 1: quem precisa anunciar com AS-PATH mais longo? Para qual vizinho?",
      "Para verificar assimetria: o next-hop preferido no R3 deve ser diferente do next-hop preferido no R1",
      "Remover 'bgp bestpath as-path ignore' faz o BGP voltar a comparar comprimento de AS-PATH antes do MED",
      "Use 'clear bgp * soft' (sem in/out) para forçar reavaliação dos caminhos após mudanças",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Para fazer R1 preferir o caminho via R4 para 150.3.3.0/24, onde você aplicou o AS-Path Prepend?",
        options: [
          "No R3, direção out para o vizinho 1.1.1.1",
          "No R1, direção in recebendo de R2",
          "No R2, direção out para o vizinho 1.1.1.1",
          "No R4, direção out para o vizinho 1.1.1.1",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Por que o MED não surtiu efeito no R3 logo após configurar 'set metric' em R2 e R4?",
        options: [
          "Porque 'clear bgp * soft out' não foi executado",
          "Porque por padrão o BGP só compara MED entre rotas do mesmo AS vizinho",
          "Porque o MED tem menor prioridade que o Router-ID sempre",
          "Porque o MED só funciona em sessões iBGP",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Na ordem de decisão do BGP, em qual posição o MED é comparado?",
        options: [
          "Antes do AS-PATH",
          "Antes do Local Preference",
          "Após o AS-PATH e após o Origin",
          "Somente após o Router-ID",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "O que acontece no R3 ao remover 'bgp bestpath as-path ignore'?",
        options: [
          "O MED passa a ser ignorado completamente",
          "O BGP volta a comparar comprimento de AS-PATH antes do MED, podendo mudar o best path",
          "As sessões BGP caem e precisam ser reestabelecidas",
          "O 'always-compare-med' também deixa de funcionar automaticamente",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual a principal diferença entre AS-Path Prepend e MED?",
        options: [
          "AS-Path Prepend afeta só o vizinho direto; MED é propagado por toda a internet",
          "MED afeta só o vizinho diretamente conectado; AS-Path Prepend é visível por todos os ASes no caminho",
          "AS-Path Prepend só funciona em eBGP; MED só funciona em iBGP",
          "Não há diferença — ambos afetam o tráfego da mesma forma",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Qual par de comandos foi necessário no R3 para que o MED funcionasse como critério de seleção entre R2 e R4?",
        options: [
          "bgp always-compare-med + bgp bestpath med-confed",
          "bgp always-compare-med + bgp bestpath as-path ignore",
          "bgp bestpath as-path ignore + bgp bestpath compare-routerid",
          "bgp always-compare-med + no bgp default local-preference",
        ],
      },
    ],
  },
};
