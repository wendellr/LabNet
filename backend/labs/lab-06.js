/**
 * Lab 6 — BGP Nível 5: Community, AS-Path Prepend e Default Route
 * Topic: Políticas de roteamento BGP
 * Difficulty: Avançado
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - R3→R4 (iBGP) reescreve o next-hop para 10.0.34.1 (next-hop-self); no
 *    UPDATE de R1→R3 ele ainda é 10.0.13.1;
 *  - prepend de R3 para R1 só em 10.4.4.0/24: R1 passa de R3 ("3") para R2
 *    ("2 3"), best (AS Path);
 *  - filtrar na origem NÃO basta: com os filtros de R1 (R2 só recebe o /32
 *    A e R3 só o /32 B), R3 repassa o B para R2 e para R4, e R2 repassa o
 *    A para R3 — R4 acaba com os dois. Só com no-advertise (R2 e R3 não
 *    reanunciam) o vazamento para: R2 só A, R3 só B, R4 nenhum;
 *  - no FRR 10.5 `send-community` já é o padrão: o comando é aceito e não
 *    aparece na configuração, e só `no neighbor X send-community` faz a
 *    community deixar de chegar (o lab antigo dizia que era preciso
 *    habilitá-lo, como no IOS);
 *  - o UPDATE leva "Community (8) ... NO_ADVERTISE";
 *  - o default-originate chega a R4 (via R3) pela tabela BGP; na RIB do
 *    contêiner a default do kernel (eth0, gerência, distância 0) vence a
 *    BGP (200), então 'show ip route 0.0.0.0/0' não é o lugar de olhar.
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";
// Lista de prefixos de 'Updated routes:' até o prefixo procurado
const ROUTES_TO = (pfx) => "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+" + pfx;

const lab = {
  id: 6,
  protocol: "bgp",
  level: 5,
  scenario: "Um provedor de trânsito atende clientes com necessidades de política diferentes — alguns não podem ter suas rotas reanunciadas para terceiros (community no-advertise), outros precisam que um caminho de backup seja usado só em último caso (AS-Path Prepend). Para simplificar a tabela de roteamento de clientes menores que não precisam da tabela completa da internet, o provedor injeta uma rota default em vez de dezenas de milhares de rotas específicas. Você vai descobrir que filtrar na origem não impede que a rota vaze por outro provedor, e como a community resolve isso.",
  title: "Community, AS-Path Prepend e Default Route",
  topic: "Políticas de roteamento BGP",
  difficulty: "Avançado",
  duration: "65 min",
  enabled: true,
  resourceProfile: "leve",
  variables: {
    prependArg: { pool: ["3 3", "3 3 3", "3 3 3 3"] },
    loA: { pool: ["192.168.11.1", "192.168.22.1", "192.168.33.1"] },
    loB: { pool: ["172.20.11.1", "172.20.22.1", "172.20.33.1"] },
  },
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R1", "eth2", "R3", "eth1"],
    ["R2", "eth2", "R3", "eth2"],
    ["R3", "eth3", "R4", "eth1"],
  ],

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=6). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "BGP — Community, Prepend e Default",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 6",
      points: [
        "**next-hop-self** no iBGP — e o que o UPDATE mostra",
        "**Prepend** de novo, agora para escolher entre **dois provedores**",
        "Por que **filtrar na origem não basta**",
        "**Communities**: etiquetas que viajam com a rota — e a **no-advertise**",
        "**default-originate**: a rota default por BGP",
        "Tudo isso **no fio**, em UPDATEs reais",
      ],
      note: "Este lab parte dos Labs 1, 2, 3 e 5: prepend, iBGP com next-hop-self, prefix-list + route-map.",
    },
    {
      title: "A topologia do Lab 6",
      diagram: [
        "        10.0.12.0/30",
        "  ┌────┐ .1        .2 ┌────┐",
        "  │ R1 ├─eth1────eth1─┤ R2 │",
        "  │AS 1│              │AS 2│",
        "  └─┬──┘              └─┬──┘",
        "eth2│ .1                │ eth2",
        "    │ 10.0.13.0/30      │ 10.0.23.0/30",
        "eth1│ .2                │ .2",
        "  ┌─┴───────────────────┴─┐",
        "  │       R3  (AS 3)      │",
        "  └───────────┬───────────┘",
        "         eth3 │ 10.0.34.0/30  iBGP",
        "          ┌───┴──┐",
        "          │  R4  │ AS 3",
        "          └──────┘",
      ].join("\n"),
      points: [
        "**R1** (AS 1) e **R2** (AS 2) são clientes/provedores; **R3** e **R4** formam o **AS 3** (R3 é a borda, R4 fica atrás).",
        "R3 tem **eBGP** com R1 e R2 e **iBGP** com R4.",
        "Cada um anuncia um prefixo `10.X.X.0/24`. R1 vai criar dois endereços extras no loopback para os experimentos de community.",
      ],
    },
    {
      title: "next-hop-self",
      code: "(R1 → R3, eBGP)\n\t  AS Path (2), length: 6, Flags [TE]: 1\n\t  Next Hop (3), length: 4, Flags [T]: 10.0.13.1\n\t  Updated routes:\n\t    10.1.1.0/24\n\n(R3 → R4, iBGP)\n\t  AS Path (2), length: 6, Flags [TE]: 1\n\t  Next Hop (3), length: 4, Flags [T]: 10.0.34.1\n\t  Updated routes:\n\t    10.1.1.0/24",
      points: [
        "Uma rota aprendida por **eBGP** chega ao iBGP **com o next-hop original** (`10.0.13.1`, o R1). R4 **não alcança** esse endereço.",
        "**`neighbor 10.0.34.2 next-hop-self`** em R3 faz R3 anunciar **a si mesmo** (`10.0.34.1`) como next-hop a R4.",
        "É o mesmo mecanismo que você viu no Lab 2. Aqui já vem **configurado** — o passo 1 é para **ver** o efeito no fio.",
      ],
      note: "Saída real do tcpdump em R3.",
    },
    {
      title: "Prepend: escolhendo entre dois provedores",
      points: [
        "R1 chega a `10.4.4.0/24` por **R3** (AS-PATH `3`) e por **R2** (AS-PATH `2 3`). O caminho **direto** é mais curto e **vence**.",
        "Para fazer R1 **preferir R2**, R3 anuncia a R1 com **prepend**: o caminho via R3 vira `3 3 3` ou mais, contra `2 3`.",
        "A política é **outbound em R3** para R1, limitada a `10.4.4.0/24` por **prefix-list** (a cláusula 20 deixa passar o resto).",
      ],
      code: "ip prefix-list R4_LAN seq 10 permit 10.4.4.0/24\n!\nroute-map PATH_PREPEND permit 10\n match ip address prefix-list R4_LAN\n set as-path prepend 3 3\nroute-map PATH_PREPEND permit 20\n!\nrouter bgp 3\n address-family ipv4 unicast\n  neighbor 10.0.13.1 route-map PATH_PREPEND out",
    },
    {
      title: "Filtrar na origem não basta",
      table: {
        head: ["Quem", "O que R1 manda", "O que o roteador vê (com filtro, sem community)"],
        rows: [
          ["**R2**", "só o /32 **A** (`192.168.x.1`)", "A (de R1) **e B** (via R3, `3 1`)"],
          ["**R3**", "só o /32 **B** (`172.20.x.1`)", "B (de R1) **e A** (via R2, `2 1`)"],
          ["**R4**", "nada direto", "**A e B** — via R3"],
        ],
      },
      points: [
        "R1 aplica filtros diferentes a cada vizinho: R2 só recebe **A**; R3 só recebe **B**.",
        "Mas R2 e R3 **trocam rotas entre si** (e R3 passa tudo para R4). **O que R1 escondeu de um, o outro entrega.**",
        "O filtro de saída de R1 controla **o que R1 manda** — não **o que os vizinhos reanunciam**.",
      ],
      note: "Validado neste lab: com só prefix-list e route-map, R4 aprende os dois /32.",
    },
    {
      title: "Communities",
      points: [
        "**Community** é uma **etiqueta** de 32 bits que **viaja com a rota**. Quem a recebe pode **agir** sobre ela (filtrar, mudar preferência, reanunciar ou não).",
        "Formato `AS:valor` (ex.: `65001:100`) e algumas **well-known**, com significado fixo:",
        "**`no-export`** — não anunciar a vizinhos **eBGP** · **`no-advertise`** — não anunciar a **nenhum** vizinho (eBGP nem iBGP) · **`local-AS`** — não sair do AS (nem da confederação)",
        "É **transitiva**: segue pela rede até alguém removê-la — ou alguém **parar** de enviá-la.",
        "Configura-se com `set community ...` numa route-map.",
      ],
      code: "route-map OUT_TO_R2 permit 20\n match ip address prefix-list LO-192\n set community no-advertise",
    },
    {
      title: "no-advertise: a community que fecha o vazamento",
      points: [
        "R1 marca cada /32 com **`no-advertise`** ao mandá-lo ao seu único vizinho permitido.",
        "R2 recebe **A** com a community e **não reanuncia** — nem a R3, nem a ninguém. R3 faz o mesmo com **B**.",
        "Resultado: **R2 só tem A**, **R3 só tem B** e **R4 não tem nenhum**. É a policy que a prefix-list sozinha **não** conseguia.",
        "Diferente de `no-export`, o **no-advertise** também bloqueia o **iBGP**: é por isso que R4 fica de fora.",
      ],
      note: "Validado neste lab: depois do no-advertise, R2 mostra só `192.168.x.1/32`, R3 só `172.20.x.1/32` e R4 nenhum dos dois.",
    },
    {
      title: "A community no fio e o send-community",
      code: "10.0.12.1 > 10.0.12.2: BGP\n\tUpdate Message (2)\n\t  Origin (1), length: 1, Flags [T]: IGP\n\t  AS Path (2), length: 6, Flags [TE]: 1\n\t  Next Hop (3), length: 4, Flags [T]: 10.0.12.1\n\t  Multi Exit Discriminator (4), length: 4, Flags [O]: 0\n\t  Community (8), length: 4, Flags [OT]:  NO_ADVERTISE\n\t  Updated routes:\n\t    192.168.11.1/32",
      points: [
        "O atributo aparece como **`Community (8)`** no UPDATE, com o valor (`NO_ADVERTISE`). Flags **OT**: opcional e transitivo.",
        "**send-community:** em **Cisco IOS** é preciso habilitar por vizinho; no **FRR 10.5** é o **padrão** — o comando é aceito, mas **não aparece** na configuração.",
        "Só `no neighbor X send-community` **impede** o envio. Validado neste lab: com o `no`, R2 deixa de ver a community.",
      ],
      note: "Saída real do tcpdump em R1.",
    },
    {
      title: "default-originate",
      points: [
        "`neighbor X default-originate` faz o roteador **anunciar `0.0.0.0/0`** àquele vizinho, **mesmo sem ter** uma default.",
        "Serve a **clientes pequenos**: em vez de milhares de rotas, **uma** default para o provedor.",
        "A default de R1 **não passa** pelo route-map de saída (a não ser que se use `default-originate route-map`): por isso ela **não leva** a community no-advertise e **chega a R4**.",
        "R3 recebe a default de R1 e de R2 e a **reanuncia por iBGP** a R4 (com next-hop-self).",
      ],
      code: "router bgp 1\n address-family ipv4 unicast\n  neighbor 10.0.12.2 default-originate\n  neighbor 10.0.13.2 default-originate",
    },
    {
      title: "Onde olhar a default",
      points: [
        "Em R4, a default por BGP está em **`show ip bgp 0.0.0.0/0`**: um caminho, via `10.0.34.1` (R3).",
        "**Cuidado com a tabela de rotas:** nos contêineres do lab existe uma **default do kernel** (interface de gerência, `eth0`, **distância 0**). Ela **vence** a default BGP (distância **200** no iBGP) em `show ip route`.",
        "Por isso, **neste ambiente**, a evidência de que R4 aprendeu a default é a **tabela BGP**, não a RIB.",
        "Numa rede real, sem essa default de gerência, a rota BGP seria instalada normalmente.",
      ],
    },
    {
      title: "Roteiro do Lab 6",
      points: [
        "**Passo 1:** ver o **next-hop-self** no fio (UPDATE R1→R3 e R3→R4), com captura em R3.",
        "**Passo 2:** **prepend** em R3: R1 troca para R2.",
        "**Passo 3:** **prefix-list + route-map** em R1 — e ver que o filtro **vaza** por R3 e R2.",
        "**Passo 4:** **no-advertise** — o vazamento **fecha**. Captura do UPDATE com a community.",
        "**Passo 5:** **default-originate** e a default em R4.",
        "**Desafio:** perguntas de fechamento.",
        "Nos passos 2, 3, 4 e 5 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas o next-hop reescrito, o UPDATE com o seu prepend, o UPDATE com a community e a default. Deixe a captura de R1 rodando do passo 2 ao 5.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: mostrar o **next-hop reescrito** no fio; explicar **por que R1 trocou de provedor** com o prepend; explicar **por que o filtro vazou** e **como a community fechou**; e mostrar a **community** e a **default** na captura.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Mostre na 🔬 captura de R3 o next-hop de 10.1.1.0/24 chegando de R1 e saindo para R4. Por quê?",
      lookFor: "R1→R3 (eBGP): Next Hop 10.0.13.1 (o próprio R1). R3→R4 (iBGP): Next Hop 10.0.34.1 (R3), por causa do next-hop-self. Sem isso R4 receberia o next-hop externo, que não alcança.",
    },
    {
      id: "e2",
      prompt: "Depois do prepend {{prependArg}} em R3, por qual caminho R1 chega a 10.4.4.0/24? Por quê?",
      lookFor: "Por R2 ('2 3'), best (AS Path): o caminho via R3 virou '3 {{prependArg}}' (mais longo que 2 ASes). Prepend é outbound em R3 para R1, limitado por prefix-list a 10.4.4.0/24.",
    },
    {
      id: "e3",
      prompt: "Com só a prefix-list e a route-map de R1, R4 aprendeu os /32? Por quê?",
      lookFor: "Sim, os dois: R1 manda A só a R2 e B só a R3, mas R3 repassa B a R2 e a R4, e R2 repassa A a R3 (que repassa a R4). O filtro de saída controla o que R1 manda, não o que os vizinhos reanunciam.",
    },
    {
      id: "e4",
      prompt: "Como a community no-advertise fechou o vazamento? Mostre na captura.",
      lookFor: "R2 e R3 recebem o /32 com 'Community (8) ... NO_ADVERTISE' e não reanunciam a ninguém (eBGP nem iBGP): R2 só A, R3 só B, R4 nenhum. UPDATE de R1 com a community para {{loA}}/32 e {{loB}}/32.",
    },
    {
      id: "e5",
      prompt: "É preciso 'send-community' no FRR? E no Cisco?",
      lookFor: "No FRR 10.5 send-community é o padrão (o comando é aceito mas não aparece na config; 'no neighbor X send-community' impede o envio). No IOS é preciso habilitar por vizinho.",
    },
    {
      id: "e6",
      prompt: "A default de R1 chegou a R4 com a community no-advertise? Por quê? Onde você a viu?",
      lookFor: "Não: a default do default-originate não passa pelo route-map de saída (nem leva a community), então R3 a reanuncia por iBGP a R4. Em 'show ip bgp 0.0.0.0/0' via 10.0.34.1. Na RIB a default do kernel (gerência, eth0, AD 0) vence a BGP (AD 200).",
    },
  ],

  autoGrade: [
    { id: "checked_nexthop", label: "Verificou as rotas BGP em R4", router: "R4", cmdContains: "show ip bgp" },
    { id: "prepend_typed", label: "Configurou o AS-Path Prepend", cmdContains: "as-path prepend" },
    { id: "filters_typed", label: "Criou os filtros seletivos em R1", router: "R1", cmdContains: "route-map OUT_TO" },
    { id: "community_typed", label: "Marcou as rotas com no-advertise", cmdContains: "set community no-advertise" },
    { id: "default_typed", label: "Configurou o default-originate", cmdContains: "default-originate" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_nexthop_in", label: "Capturou o UPDATE de R1 para R3 com o next-hop de R1", router: "R3", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Next Hop \\(3\\), length: 4, Flags \\[T\\]: 10\\.0\\.13\\.1\\s" + UPD_NT + ROUTES_TO("10\\.1\\.1\\.0/24") },
    { id: "captured_nexthop_self", label: "Capturou o UPDATE de R3 para R4 com o next-hop reescrito", router: "R3", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Next Hop \\(3\\), length: 4, Flags \\[T\\]: 10\\.0\\.34\\.1\\s" + UPD_NT + ROUTES_TO("10\\.1\\.1\\.0/24") },
    { id: "captured_prepend", label: "Capturou o UPDATE de R3 com o seu prepend", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: {{prependArg}}\\s" + UPD_NT + ROUTES_TO("10\\.4\\.4\\.0/24") },
    { id: "captured_community", label: "Capturou o UPDATE com a community NO_ADVERTISE", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Community \\(8\\), length: 4, Flags \\[OT\\]:\\s+NO_ADVERTISE" + UPD_NT + ROUTES_TO("{{loA}}/32") },
    { id: "captured_default", label: "Capturou o UPDATE com a rota default", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + ROUTES_TO("0\\.0\\.0\\.0/0") },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP de R1 verificadas",
      weight: 2,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    },
    {
      id: "r4_nexthop_r3",
      label: "R4 aprende as rotas externas com next-hop 10.0.34.1 (R3, next-hop-self)",
      weight: 4,
      check: { router: "R4", cmdPattern: "show ip bgp 10.1.1.0/24", outputPattern: "10\\.0\\.34\\.1 from 10\\.0\\.34\\.1" },
    },
    {
      id: "prepend_configured",
      label: "AS-Path Prepend {{prependArg}} configurado em R3",
      weight: 8,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set as-path prepend {{prependArg}}\\s" },
    },
    {
      id: "prepend_out",
      label: "Prepend aplicado outbound em R3 (vizinho R1, 10.0.13.1)",
      weight: 4,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.13\\.1 route-map \\S+ out" },
    },
    {
      id: "r1_prefers_r2",
      label: "R1 chega a 10.4.4.0/24 por R2 (AS-PATH 2 3, best AS Path)",
      weight: 8,
      check: { router: "R1", cmdPattern: "show ip bgp 10.4.4.0/24", outputPattern: "\\n\\s*2 3\\s*\\n\\s*10\\.0\\.12\\.2 from 10\\.0\\.12\\.2[\\s\\S]*?best \\(AS Path\\)" },
    },
    {
      id: "selective_filters_a",
      label: "Prefix-list de {{loA}}/32 criada em R1",
      weight: 4,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip prefix-list \\S+ seq \\d+ permit {{loA}}/32" },
    },
    {
      id: "selective_filters_b",
      label: "Prefix-list de {{loB}}/32 criada em R1",
      weight: 4,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip prefix-list \\S+ seq \\d+ permit {{loB}}/32" },
    },
    {
      id: "community_no_advertise",
      label: "R1 marca as rotas com set community no-advertise (nas duas route-maps)",
      weight: 6,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "set community no-advertise[\\s\\S]*set community no-advertise" },
    },
    {
      id: "r2_only_a",
      label: "R2 tem só {{loA}}/32 (e a community no-advertise), sem {{loB}}/32",
      weight: 11,
      check: { router: "R2", cmdPattern: "show ip bgp", outputPattern: "^(?![\\s\\S]*{{loB}}/32)[\\s\\S]*{{loA}}/32" },
    },
    {
      id: "r3_only_b",
      label: "R3 tem só {{loB}}/32 (e a community no-advertise), sem {{loA}}/32",
      weight: 11,
      check: { router: "R3", cmdPattern: "show ip bgp", outputPattern: "^(?![\\s\\S]*{{loA}}/32)[\\s\\S]*{{loB}}/32" },
    },
    {
      id: "r4_none",
      label: "R4 não aprende nenhum dos dois /32 (no-advertise vale também para o iBGP)",
      weight: 2,
      check: { router: "R4", cmdPattern: "show ip bgp", outputPattern: "^(?![\\s\\S]*{{loA}}/32)(?![\\s\\S]*{{loB}}/32)[\\s\\S]*10\\.4\\.4\\.0/24" },
    },
    {
      id: "default_originate_r2",
      label: "default-originate configurado para R2 (10.0.12.2)",
      weight: 3,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.12\\.2 default-originate" },
    },
    {
      id: "default_originate_r3",
      label: "default-originate configurado para R3 (10.0.13.2)",
      weight: 3,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.13\\.2 default-originate" },
    },
    {
      id: "r4_default_verified",
      label: "R4 aprende 0.0.0.0/0 por BGP, via R3 (10.0.34.1)",
      weight: 8,
      check: { router: "R4", cmdPattern: "show ip bgp 0.0.0.0/0", outputPattern: "10\\.0\\.34\\.1 from 10\\.0\\.34\\.1" },
    },
    {
      id: "capture_nexthop_self",
      label: "Capturou o UPDATE de R3 para R4 com o next-hop reescrito (10.0.34.1)",
      weight: 6,
      check: { type: "capture", router: "R3", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Next Hop \\(3\\), length: 4, Flags \\[T\\]: 10\\.0\\.34\\.1\\s" + UPD_NT + ROUTES_TO("10\\.1\\.1\\.0/24") },
    },
    {
      id: "capture_prepend",
      label: "Capturou o UPDATE de R3 para R1 com o seu prepend ({{prependArg}})",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: {{prependArg}}\\s" + UPD_NT + ROUTES_TO("10\\.4\\.4\\.0/24") },
    },
    {
      id: "capture_community",
      label: "Capturou o UPDATE de R1 com a community NO_ADVERTISE para {{loA}}/32",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Community \\(8\\), length: 4, Flags \\[OT\\]:\\s+NO_ADVERTISE" + UPD_NT + ROUTES_TO("{{loA}}/32") },
    },
    {
      id: "capture_default",
      label: "Capturou o UPDATE de R1 com a rota default 0.0.0.0/0",
      weight: 4,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + ROUTES_TO("0\\.0\\.0\\.0/0") },
    },
  ],

  answerKey: {
    predict_step2: {
      type: "keywords",
      required: ["r2", "via r2", "indireto", "troca", "muda", "mais longo"],
      anyOf: true,
      points: 6,
      hint: "O prepend torna o caminho via R3 mais longo que o caminho via R2 — o AS-PATH mais curto passa a ser o via R2.",
    },
    predict_step3: {
      type: "keywords",
      required: ["sim", "vaza", "reanuncia", "reanunci", "r3", "r2", "outro"],
      anyOf: true,
      points: 7,
      hint: "Sim: R1 filtra o que manda a cada vizinho, mas R3 repassa o B a R2 e a R4, e R2 repassa o A a R3. O filtro de saída de R1 não controla o que os vizinhos reanunciam.",
    },
    predict_step4: {
      type: "keywords",
      required: ["não", "nao", "todos", "qualquer", "ibgp"],
      anyOf: true,
      points: 7,
      hint: "no-advertise é uma community well-known BGP-wide: bloqueia o reanúncio para QUALQUER peer, inclusive peers iBGP como R4 — não é uma restrição só de eBGP.",
    },
    q1: { type: "radio", correct: "Ele reescreve o next-hop das rotas enviadas ao peer iBGP para que R4 alcance os prefixos externos", points: 10 },
    q2: { type: "radio", correct: "Outbound em R3 para o vizinho R1", points: 8 },
    q3: { type: "radio", correct: "Ela impede que a rota seja anunciada a qualquer peer BGP", points: 12 },
    q4: { type: "radio", correct: "No FRR 10.5 o send-community já é o padrão (no IOS é preciso habilitar); só 'no neighbor X send-community' impede o envio", points: 8 },
    q5: { type: "radio", correct: "default-originate", points: 8 },
    q6: { type: "radio", correct: "Prefix-list seleciona a rota; route-map decide negar, permitir ou alterar atributos", points: 8 },
    q7: { type: "radio", correct: "Porque R3 repassa o prefixo que R1 mandou a R3 para R2 e R4, e R2 repassa o que recebeu para R3: o filtro de saída de R1 não controla os reanúncios", points: 14 },
    q8: { type: "radio", correct: "Não: a default do default-originate não passa pela route-map de saída, então chega sem a community e é reanunciada a R4", points: 12 },
  },

  steps: [
    {
      id: 1,
      title: "Verificar a topologia e o next-hop",
      theory: `Este lab tem quatro roteadores:

- R1 no AS 1
- R2 no AS 2
- R3 e R4 no AS 3

R3 tem eBGP com R1 e R2, e iBGP com R4. Quando um roteador eBGP aprende uma rota e repassa para um peer iBGP, o next-hop original continuaria apontando para o vizinho externo. Por isso R3 usa "next-hop-self": reescreve o next-hop para si mesmo ao anunciar rotas a R4. Aqui ele já está configurado — você vai ver o efeito no fio.`,
      description: `Abra a captura em R3, interface 'todas', protocolo BGP. Confirme as sessões e veja a tabela de R4: quais rotas e com qual next-hop?

Para ver o next-hop no fio, peça o reenvio dos anúncios com a captura rodando:
  em R1:  clear bgp * soft out
  em R3:  clear bgp * soft out

Na captura de R3, encontre 10.1.1.0/24 em dois UPDATEs: o que chega de R1 (eBGP) e o que sai para R4 (iBGP). Compare o 'Next Hop' de cada um.`,
      capture: { router: "R3", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "Sessões de R1 com R2 e R3" },
        { cmd: "show bgp summary", router: "R3", desc: "eBGP com R1 e R2, iBGP com R4" },
        { cmd: "show running-config", router: "R3", desc: "Procure 'neighbor 10.0.34.2 next-hop-self'" },
        { cmd: "clear bgp * soft out", router: "R1", desc: "R1 reenvia os anúncios a R3" },
        { cmd: "clear bgp * soft out", router: "R3", desc: "R3 reenvia os anúncios a R2, R1 e R4" },
        { cmd: "show ip bgp", router: "R4", desc: "Next-hop de cada rota externa em R4" },
      ],
      expected: "Sessões estabelecidas. R4 aprende 10.1.1.0/24, 10.2.2.0/24 e 10.3.3.0/24, todas com next-hop 10.0.34.1 (R3). Na captura de R3: UPDATE de R1 com 'Next Hop ... 10.0.13.1' para 10.1.1.0/24 e UPDATE para R4 com 'Next Hop ... 10.0.34.1' para o mesmo prefixo.",
    },
    {
      id: 2,
      title: "Forçar R1 a preferir o caminho via R2",
      theory: `AS-Path Prepend aumenta artificialmente o tamanho do AS-PATH anunciado a um vizinho. O BGP prefere AS-PATH mais curto quando critérios anteriores empatam.

R1 chega a 10.4.4.0/24 diretamente via R3 (AS-PATH "3", pois R3 e R4 estão no mesmo AS) ou via R2 (AS-PATH "2 3"). Ao fazer R3 anunciar 10.4.4.0/24 a R1 com "set as-path prepend {{prependArg}}", o caminho via R3 repete o AS 3 e passa a ser mais longo que os 2 saltos via R2.`,
      description: `Abra a captura em R1, interface 'todas', protocolo BGP, e deixe-a rodando até o fim do passo 5 (se parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Veja primeiro o best path de R1 para 10.4.4.0/24. Responda a previsão e configure R3:

  configure terminal
  ip prefix-list R4_LAN seq 10 permit 10.4.4.0/24
  route-map PATH_PREPEND permit 10
   match ip address prefix-list R4_LAN
   set as-path prepend {{prependArg}}
  route-map PATH_PREPEND permit 20
  exit
  router bgp 3
   address-family ipv4 unicast
    neighbor 10.0.13.1 route-map PATH_PREPEND out
  end
  clear bgp * soft out

Depois verifique em R1 e procure na captura o UPDATE de R3 com o 3 repetido.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show ip bgp 10.4.4.0/24", router: "R1", desc: "ANTES: best via R3 (AS Path)" },
        { cmd: "show running-config", router: "R3", desc: "Confirme prefix-list, route-map e route-map outbound" },
        { cmd: "clear bgp * soft out", router: "R3", desc: "Reenvia os anúncios de R3 com o prepend" },
        { cmd: "show ip bgp 10.4.4.0/24", router: "R1", desc: "DEPOIS: qual caminho é o best e com que AS-PATH?" },
      ],
      expected: "ANTES: R1 usa o caminho via R3 (AS-PATH '3'). DEPOIS: o caminho via R3 aparece com AS-PATH '3 {{prependArg}}' (o 3 repetido) e R1 passa a preferir o caminho via R2 ('2 3', best (AS Path)). Na captura: UPDATE de R3 para R1 com 'AS Path ... {{prependArg}}' para 10.4.4.0/24.",
      predict: {
        id: "predict_step2",
        prompt: "Depois de aplicar esse AS-Path Prepend em R3, qual caminho você espera que R1 prefira até 10.4.4.0/24 — o direto via R3 ou o indireto via R2?",
      },
    },
    {
      id: 3,
      title: "Anunciar prefixos seletivos com prefix-list e route-map",
      theory: `Prefix-list identifica prefixos. Route-map aplica uma decisão ou alteração sobre as rotas que casam com a prefix-list.

Uma route-map outbound pode negar um prefixo para um vizinho e permitir outros. Isso permite anunciar rotas diferentes para cada peer sem criar novas sessões BGP.

Mas atenção: o filtro de R1 controla o que R1 manda. Ele não controla o que R2 e R3 reanunciam entre si e para R4.`,
      description: `Responda a previsão e, no R1, crie dois endereços extras na loopback e anuncie no BGP:

  configure terminal
  interface lo
   ip address {{loA}}/32
   ip address {{loB}}/32
  exit
  ip prefix-list LO-192 seq 10 permit {{loA}}/32
  ip prefix-list LO-172 seq 10 permit {{loB}}/32
  route-map OUT_TO_R2 deny 10
   match ip address prefix-list LO-172
  route-map OUT_TO_R2 permit 20
  route-map OUT_TO_R3 deny 10
   match ip address prefix-list LO-192
  route-map OUT_TO_R3 permit 20
  exit
  router bgp 1
   address-family ipv4 unicast
    network {{loA}}/32
    network {{loB}}/32
    neighbor 10.0.12.2 route-map OUT_TO_R2 out
    neighbor 10.0.13.2 route-map OUT_TO_R3 out
  end
  clear bgp * soft out

O que R1 anuncia a R2 e a R3? Depois olhe a tabela de R2, R3 e R4: quem aprendeu qual /32?`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme prefix-lists e route-maps" },
        { cmd: "clear bgp * soft out", router: "R1", desc: "Aplica as políticas de saída" },
        { cmd: "show ip bgp neighbors 10.0.12.2 advertised-routes", router: "R1", desc: "O que R1 anuncia a R2" },
        { cmd: "show ip bgp neighbors 10.0.13.2 advertised-routes", router: "R1", desc: "O que R1 anuncia a R3" },
        { cmd: "show ip bgp", router: "R2", desc: "R2 vê só {{loA}}/32? Ou também {{loB}}/32?" },
        { cmd: "show ip bgp", router: "R3", desc: "R3 vê só {{loB}}/32? Ou também {{loA}}/32?" },
        { cmd: "show ip bgp", router: "R4", desc: "R4 aprendeu algum dos dois?" },
      ],
      expected: "R1 anuncia {{loA}}/32 só a R2 e {{loB}}/32 só a R3. Mas R2 e R3 trocam rotas: R2 vê {{loA}}/32 (de R1) e também {{loB}}/32 (via R3, AS-PATH '3 1'); R3 vê {{loB}}/32 (de R1) e {{loA}}/32 (via R2, '2 1'); R4 aprende os dois via R3. O filtro de R1 foi contornado pelos reanúncios.",
      predict: {
        id: "predict_step3",
        prompt: "R1 anuncia o /32 A só a R2 e o /32 B só a R3. Você espera que R4 (atrás de R3) acabe aprendendo algum dos dois? Por quê?",
      },
    },
    {
      id: 4,
      title: "Usar community no-advertise",
      theory: `Communities são tags BGP transportadas junto com as rotas. A community well-known "no-advertise" instrui o roteador receptor a não anunciar aquela rota a nenhum outro peer BGP — eBGP nem iBGP.

Aplicada pelo R1 em cada /32, ela impede o reanúncio por R2 e por R3: o vazamento do passo anterior se fecha.

No FRR 10.5 o "send-community" já é o padrão (no Cisco IOS é preciso habilitar). O comando é aceito mas não aparece na configuração.`,
      description: `Responda a previsão e ajuste as route-maps do R1 para marcar as rotas permitidas com no-advertise:

  configure terminal
  route-map OUT_TO_R2 permit 20
   match ip address prefix-list LO-192
   set community no-advertise
  route-map OUT_TO_R2 permit 30
  route-map OUT_TO_R3 permit 20
   match ip address prefix-list LO-172
   set community no-advertise
  route-map OUT_TO_R3 permit 30
  exit
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 send-community
    neighbor 10.0.13.2 send-community
  end
  clear bgp * soft out

Depois compare R2, R3 e R4 com o passo 3. Na captura de R1, procure o UPDATE com 'Community (8) ... NO_ADVERTISE'.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme 'set community no-advertise' nas duas route-maps" },
        { cmd: "clear bgp * soft out", router: "R1", desc: "Reenvia os anúncios com a community" },
        { cmd: "show ip bgp {{loA}}/32", router: "R2", desc: "Community: no-advertise" },
        { cmd: "show ip bgp {{loB}}/32", router: "R3", desc: "Community: no-advertise" },
        { cmd: "show ip bgp", router: "R4", desc: "R4 ainda aprende algum /32?" },
      ],
      expected: "R2 recebe só {{loA}}/32 e R3 só {{loB}}/32, cada um marcado com 'Community: no-advertise' (o vazamento do passo 3 sumiu); R4 não aprende nenhum dos dois — a community bloqueia o reanúncio para QUALQUER peer, inclusive o iBGP com R4. Na captura: UPDATE de R1 com 'Community (8), length: 4, Flags [OT]: NO_ADVERTISE' para {{loA}}/32 e {{loB}}/32.",
      predict: {
        id: "predict_step4",
        prompt: "A community no-advertise foi aplicada só nas route-maps de saída de R1 para R2 e R3. Você espera que R4 (peer iBGP de R3) aprenda esses dois /32 por BGP? Por quê?",
      },
    },
    {
      id: 5,
      title: "Origem de rota default",
      theory: `Quando uma rede não deve receber todos os prefixos específicos, uma rota default pode fornecer caminho de saída genérico.

Em BGP, "neighbor X default-originate" faz o roteador anunciar 0.0.0.0/0 àquele vizinho, mesmo sem ter uma default. Aqui R1 anuncia a default a R2 e R3, dando a R4 um caminho genérico para os prefixos que não foram propagados por causa do no-advertise.

A default do default-originate não passa pela route-map de saída: por isso ela chega sem a community.`,
      description: `Configure no R1:

  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 default-originate
    neighbor 10.0.13.2 default-originate
  end
  clear bgp * soft out

Depois verifique em R4, na TABELA BGP, se a rota 0.0.0.0/0 foi aprendida e por qual next-hop. (No contêiner, a tabela de rotas tem também uma default do kernel pela interface de gerência, com distância 0, que vence a BGP: por isso a evidência é a tabela BGP.) Na captura de R1, procure o UPDATE com 0.0.0.0/0.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme default-originate para R2 e R3" },
        { cmd: "clear bgp * soft out", router: "R1", desc: "Reenvia os anúncios, agora com a default" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R4", desc: "Tabela BGP de R4: a default chegou? Por qual next-hop?" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R3", desc: "R3 recebe a default de R1 e de R2: qual é o best?" },
      ],
      expected: "R4 aprende 0.0.0.0/0 por BGP, via 10.0.34.1 (R3, iBGP). R3 recebe a default de R1 (AS-PATH '1') e de R2 ('2 1') e anuncia a melhor a R4. A default não leva a community no-advertise. Na captura de R1: UPDATE com 'Updated routes: 0.0.0.0/0' para 10.0.12.2 e 10.0.13.2.",
    },
  ],

  challenge: {
    title: "Desafio: Política Completa de Community, Prepend e Default",
    description: `Estado final esperado:

1. R1 prefere chegar em 10.4.4.0/24 via R2, usando AS-Path Prepend em R3 para o vizinho R1.
2. R1 anuncia {{loA}}/32 somente a R2 e {{loB}}/32 somente a R3.
3. Esses /32 estão marcados com community no-advertise: R4 não aprende nenhum dos dois.
4. R1 anuncia rota default a R2 e R3, e R4 a aprende pela tabela BGP.

Responda às perguntas, baseadas no que você viu nas saídas e nas capturas.`,
    hints: [
      "O prepend vai outbound em R3, para o vizinho R1",
      "O filtro de saída de R1 não controla o que R2 e R3 reanunciam",
      "no-advertise bloqueia eBGP e iBGP; no-export só eBGP",
      "A default do default-originate não passa pela route-map de saída",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Qual é a função de 'next-hop-self' no peer R3-R4?",
        options: [
          "Ele força R4 a virar eBGP",
          "Ele apaga communities das rotas recebidas",
          "Ele reescreve o next-hop das rotas enviadas ao peer iBGP para que R4 alcance os prefixos externos",
          "Ele cria automaticamente uma rota default",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Onde aplicar o AS-Path Prepend para fazer R1 preferir o caminho via R2 até 10.4.4.0/24?",
        options: [
          "Inbound em R1 vindo de R2",
          "Outbound em R3 para o vizinho R1",
          "Outbound em R2 para R3",
          "Inbound em R4 vindo de R3",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "O que a community well-known 'no-advertise' faz?",
        options: [
          "Ela permite anunciar a rota apenas para eBGP",
          "Ela transforma a rota em default",
          "Ela impede que a rota seja anunciada a qualquer peer BGP",
          "Ela aumenta o Local Preference para 200",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "O que se observou sobre 'send-community' no FRR 10.5?",
        options: [
          "Sem ele a community nunca é enviada, como no IOS",
          "Ele habilita o AS-Path Prepend",
          "No FRR 10.5 o send-community já é o padrão (no IOS é preciso habilitar); só 'no neighbor X send-community' impede o envio",
          "Ele derruba a sessão para limpar atributos antigos",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual comando BGP anuncia 0.0.0.0/0 a um vizinho?",
        options: [
          "aggregate-address summary-only",
          "set community no-export",
          "next-hop-self",
          "default-originate",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Qual é a relação entre prefix-list e route-map?",
        options: [
          "Prefix-list altera AS-PATH; route-map só mostra rotas",
          "Route-map cria interfaces; prefix-list anuncia default",
          "Prefix-list seleciona a rota; route-map decide negar, permitir ou alterar atributos",
          "As duas são equivalentes e nunca devem ser usadas juntas",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "Por que, só com prefix-list e route-map em R1, R4 acabou aprendendo os /32?",
        options: [
          "Porque o R4 também tem sessão com R1",
          "Porque o filtro não foi aplicado com clear bgp",
          "Porque R3 repassa o prefixo que R1 mandou a R3 para R2 e R4, e R2 repassa o que recebeu para R3: o filtro de saída de R1 não controla os reanúncios",
          "Porque prefix-list não funciona em /32",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "A rota default de R1 chegou a R4 com a community no-advertise?",
        options: [
          "Sim: toda rota de R1 leva a community",
          "Não: a default do default-originate não passa pela route-map de saída, então chega sem a community e é reanunciada a R4",
          "Sim, por isso R4 não a usa",
          "Não, porque o default-originate não funciona com iBGP",
        ],
      },
    ],
  },

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
};

module.exports = lab;
