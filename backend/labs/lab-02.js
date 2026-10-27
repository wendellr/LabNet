/**
 * Lab 2 — BGP Nível 2: Local Preference (controle de tráfego de saída)
 * Sem falha proposital — o foco é uma decisão que o BGP toma sozinho em
 * cada roteador e que precisa virar consenso no AS.
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - o destino 200.200.0.0/24 é anunciado por R3 (AS3) E por R4 (AS2). O
 *    lab antigo não tinha nenhum prefixo alcançável pelos dois provedores:
 *    o Local Preference ficava visível na tabela mas nunca decidia nada;
 *  - sem política, R1 sai por R3 e R2 por R4 (best (Peer Type): eBGP vence
 *    iBGP em cada um) — dois roteadores do mesmo AS, duas saídas;
 *  - LP em R2 (entrada do vizinho R4) vira consenso: R1 passa a sair por R2
 *    (best (Local Pref)); o UPDATE iBGP leva "Local Preference (5)" e o
 *    UPDATE eBGP para o AS3 não leva nada;
 *  - Weight em R1 volta a sair por R3 (best (Weight)) e R2 não percebe:
 *    o AS fica dividido de novo; weight vem ANTES do LP e não é anunciado;
 *  - LP maior em R1 (entrada de R3) inverte o consenso para R3, e R1 fica
 *    com um caminho só (R2 prefere o caminho iBGP de R1 e o retira de R1:
 *    iBGP não repassa rota aprendida por iBGP).
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";


// Idem, e sem o atributo Local Preference no UPDATE (só aparece no iBGP)
const NO_LP = "(?:(?!Update Message)(?!Local Preference)[\\s\\S])*?";

// Diagrama de topologia dos slides (desenhado no frontend, ver SlideTopology.jsx).
// variant: "base" (a rede), "decide" (cada um sai pelo seu vizinho), "lp" (Local Preference em R2).
function TOPO_LAB2(variant) {
  const nodes = [
    { id: "R1", x: 120, y: 90, label: "R1", sub: "AS 1" },
    { id: "R2", x: 480, y: 90, label: "R2", sub: "AS 1" },
    { id: "R3", x: 120, y: 250, label: "R3", sub: "AS 3" },
    { id: "R4", x: 480, y: 250, label: "R4", sub: "AS 2" },
  ];
  const groups = [{ label: "AS 1", x: 20, y: 28, w: 560, h: 124, color: "#60a5fa" }];
  const badges = [
    { x: 120, y: 300, text: "200.200.0.0/24", color: "#fbbf24" },
    { x: 480, y: 300, text: "200.200.0.0/24", color: "#fbbf24" },
  ];
  let links;
  if (variant === "decide") {
    links = [
      { a: "R1", b: "R2", kind: "dim", label: "iBGP (perde: eBGP vence)" },
      { a: "R1", b: "R3", kind: "best", arrow: "a>b", label: "R1 sai por R3" },
      { a: "R2", b: "R4", kind: "best", arrow: "a>b", label: "R2 sai por R4" },
    ];
    badges.push({ x: 300, y: 190, text: "mesmo AS, duas saídas diferentes", color: "#f87171" });
  } else if (variant === "lp") {
    links = [
      { a: "R1", b: "R2", kind: "best", arrow: "b>a", label: "iBGP leva LocPrf 200" },
      { a: "R2", b: "R4", kind: "best", arrow: "b>a", label: "LP 200 aplicado (in)" },
      { a: "R1", b: "R3", kind: "dim", label: "eBGP: sem LP" },
    ];
    nodes[0].hl = true; nodes[1].hl = true;
    badges.push({ x: 300, y: 190, text: "R1 e R2 saem por R4", color: "#4ade80" });
  } else {
    links = [
      { a: "R1", b: "R2", kind: "ibgp", label: "iBGP" },
      { a: "R1", b: "R3", kind: "ebgp", label: "eBGP" },
      { a: "R2", b: "R4", kind: "ebgp", label: "eBGP" },
    ];
  }
  return { w: 600, h: 330, groups, nodes, links, badges };
}

const lab = {
  id: 2,
  protocol: "bgp",
  level: 2,
  scenario: "Sua empresa tem duas saídas externas para o mesmo destino remoto, uma mais barata/estável que a outra. O problema: cada roteador de borda decide sozinho — o que está ligado ao provedor A usa o provedor A, o que está ligado ao B usa o B, e o tráfego da sua rede sai pelos dois caminhos sem nenhum critério. O time de rede precisa que TODOS os roteadores internos concordem em preferir a mesma saída. Local Preference resolve exatamente isso: é propagado por iBGP dentro do AS, então uma decisão tomada em um único roteador de borda vira consenso para toda a rede interna. Você vai ver isso no fio e depois descobrir por que o Weight, que parece fazer o mesmo, quebra o consenso.",
  title: "BGP Local Preference",
  topic: "Controle de Tráfego de Saída",
  difficulty: "Iniciante",
  duration: "55 min",
  enabled: true,
  resourceProfile: "leve",
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R1", "eth2", "R3", "eth1"],
    ["R2", "eth2", "R4", "eth1"],
  ],

  variables: {
    // lpChallenge sempre > lpRoteiro: o desafio inverte a saída preferida
    lpRoteiro: { pool: ["150", "180", "200", "220"] },
    lpChallenge: { pool: ["230", "250", "270", "300"] },
    weightTrap: { pool: ["300", "500", "800", "1000"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=2). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "BGP — Local Preference",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 2",
      points: [
        "Por que o **iBGP** existe e o que ele leva para dentro do AS",
        "O problema: cada roteador de borda **decide sozinho**",
        "**Local Preference**: o atributo que vira **consenso** no AS",
        "O Local Preference **no fio**: está no iBGP, **não está** no eBGP",
        "**Weight**: parece igual, mas é **local** — e **vence** o Local Preference",
        "Por que o iBGP **não repassa** o que aprendeu por iBGP",
      ],
      note: "Este lab parte do Lab 1: AS-PATH, a ordem de decisão do BGP e a leitura de `show ip bgp`.",
    },
    {
      title: "Revisão: a ordem de decisão",
      points: [
        "Se há várias rotas para o mesmo prefixo, o BGP percorre os critérios **em ordem** e para no primeiro que desempata:",
        "**1.** **Weight** (maior) · **2.** **Local Preference** (maior) · **3.** Rota local",
        "**4.** AS-PATH (mais curto) · **5.** Origin · **6.** MED (menor)",
        "**7.** **eBGP sobre iBGP** · **8.** Menor métrica IGP até o next-hop · **9.** Menor Router ID",
        "Hoje o foco é nos **dois primeiros** — e no **7**, que explica o problema do lab.",
        "O FRR escreve o critério que decidiu: `best (Weight)`, `best (Local Pref)`, `best (Peer Type)`…",
      ],
    },
    {
      title: "eBGP e iBGP no mesmo AS",
      points: [
        "Um AS com **mais de um roteador de borda** precisa que todos eles conheçam as rotas aprendidas de fora. É para isso que serve o **iBGP**: sessão entre roteadores do **mesmo AS**.",
        "A rota aprendida por **eBGP** em R2 chega a R1 por **iBGP** — e vice-versa. Assim cada borda enxerga as saídas **das outras**.",
        "No iBGP o **AS-PATH não muda** (é o mesmo AS) e o **next-hop** continuaria sendo o do vizinho externo — por isso `neighbor ... next-hop-self`, que o lab já traz configurado.",
        "A sessão iBGP usa os **loopbacks** (`update-source lo`) e rotas estáticas entre eles — como no Lab 1.",
      ],
    },
    {
      title: "A topologia do Lab 2",
      topology: TOPO_LAB2("base"),
      points: [
        "**R1** e **R2** formam o **AS 1** e são ligados por **iBGP**. R1 tem a saída pelo **AS 3** (R3); R2 tem a saída pelo **AS 2** (R4).",
        "O destino remoto **`200.200.0.0/24`** é anunciado por **R3 e R4**: o AS 1 tem **duas saídas** para ele.",
        "A pergunta do lab: **por qual das duas** o AS 1 deve sair — e **todos** os roteadores do AS saem pela mesma?",
      ],
    },
    {
      title: "O problema: cada um decide sozinho",
      topology: TOPO_LAB2("decide"),
      code: "R1# show ip bgp 200.200.0.0/24\n  3\n    20.0.0.1 from 20.0.0.1 (20.0.0.1)\n      Origin IGP, metric 0, valid, external, best (Peer Type)\n  2\n    10.0.0.2 from 10.0.0.2 (10.0.0.2)\n      Origin IGP, metric 0, localpref 100, valid, internal",
      points: [
        "R1 tem **dois caminhos**: o eBGP (via R3, AS-PATH `3`) e o iBGP (via R2, AS-PATH `2`). Empatam em Weight, Local Pref e AS-PATH.",
        "O critério **7 — eBGP sobre iBGP** decide: `best (Peer Type)`. **R1 sai por R3.**",
        "R2 está na situação **espelhada**: o eBGP (via R4) vence o iBGP. **R2 sai por R4.**",
        "Resultado: dois roteadores do **mesmo AS**, **duas saídas**. Ninguém errou — a regra é que **cada um prefere o seu próprio vizinho externo**.",
      ],
      note: "Validado neste lab, sem nenhuma política configurada.",
    },
    {
      title: "Local Preference",
      points: [
        "**Local Preference** é um atributo **numérico**: **maior vence**. O **padrão é 100**.",
        "Fica no critério **2** — **antes** do AS-PATH e do eBGP/iBGP. Quem tem Local Pref maior ganha, **seja eBGP ou iBGP**.",
        "É **propagado por iBGP** a todos os roteadores do AS. Por isso **uma decisão em uma borda vira consenso** em toda a rede interna.",
        "**Nunca sai do AS**: não é enviado por eBGP. Por isso serve para **tráfego de saída** (para onde o **meu** AS manda), não de entrada.",
        "Configura-se com **route-map** (`set local-preference N`) aplicada **in** — na borda que **recebe** a rota externa.",
      ],
      code: "route-map SET_LP permit 10\n set local-preference 200\n!\nrouter bgp 1\n address-family ipv4 unicast\n  neighbor 30.0.0.1 route-map SET_LP in",
    },
    {
      title: "O Local Preference no fio",
      code: "10.0.0.2.179 > 10.0.0.1.46211: BGP\n\tUpdate Message (2), length: 59\n\t  Origin (1), length: 1, Flags [T]: IGP\n\t  AS Path (2), length: 6, Flags [TE]: 2\n\t  Next Hop (3), length: 4, Flags [T]: 10.0.0.2\n\t  Local Preference (5), length: 4, Flags [T]: 200\n\t  Updated routes:\n\t    200.200.0.0/24",
      points: [
        "É o **UPDATE iBGP** de R2 para R1: ao lado de **AS Path** e **Next Hop** aparece **Local Preference (5)** com o valor que R2 aplicou.",
        "**Next Hop 10.0.0.2** é o próprio R2: `next-hop-self` em ação.",
        "O mesmo prefixo, enviado por **eBGP** (de R1 para R3, AS-PATH `1 2`), **não tem** o campo Local Preference.",
        "É a prova de que o atributo **fica dentro do AS**.",
      ],
      note: "Saída real do tcpdump em R1 depois da política em R2.",
    },
    {
      title: "Como o consenso nasce",
      topology: TOPO_LAB2("lp"),
      points: [
        "**1.** R2 aplica `set local-preference 200` nas rotas recebidas de R4 (vizinho `30.0.0.1`).",
        "**2.** R2 anuncia o caminho a R1 por **iBGP**, agora com **LocPrf 200**.",
        "**3.** R1 compara: o caminho iBGP tem **LocPrf 200**; o eBGP via R3 tem o **padrão 100**. O critério 2 **vem antes** do eBGP > iBGP — **o iBGP vence**.",
        "**4.** R1 passa a sair por R2 → R4. **O AS inteiro sai pelo provedor AS 2.**",
        "O FRR confirma: `best (Local Pref)`. Em nenhum momento você mexeu em R1.",
      ],
    },
    {
      title: "Weight — local, e mais forte",
      points: [
        "**Weight** também é numérico, **maior vence** — mas **só existe no roteador** onde foi configurado. **Nunca é anunciado** a ninguém, nem por iBGP.",
        "Fica no critério **1 — antes do Local Preference**. Qualquer weight maior que 0 **vence** qualquer Local Pref.",
        "Configura-se por vizinho: `neighbor 20.0.0.1 weight N`.",
        "Consequência: se você usar Weight em R1, **R1** muda de saída, mas **R2 não fica sabendo**. O consenso do AS **se quebra**.",
        "É a armadilha do passo 4: o Weight **parece** fazer o mesmo que o Local Preference — mas só em **um** roteador.",
      ],
    },
    {
      title: "Local Preference × Weight",
      table: {
        head: ["", "Local Preference", "Weight"],
        rows: [
          ["Posição na decisão", "Critério **2**", "Critério **1** (vence o LP)"],
          ["Escopo", "**Todo o AS** (via iBGP)", "**Só** o roteador local"],
          ["Vai no UPDATE?", "**Sim** (iBGP) — nunca eBGP", "**Nunca**"],
          ["Padrão", "**100**", "0 (32768 para rotas locais)"],
          ["Serve para", "Escolher a saída **do AS inteiro**", "Ajuste **local**, pontual"],
        ],
      },
      points: [
        "Regra prática: para **coordenar uma saída**, use **Local Preference**. Weight é para um **ajuste local** que você **não** quer que o resto do AS conheça.",
      ],
    },
    {
      title: "iBGP não repassa iBGP",
      points: [
        "Regra do iBGP: um roteador **não anuncia a um peer iBGP** uma rota que **aprendeu de outro peer iBGP**. É a proteção contra **laços** dentro do AS (o AS-PATH não muda no iBGP, então ele não ajuda).",
        "Por isso o iBGP exige **malha completa** (todo mundo fala com todo mundo) ou um **Route Reflector** (Lab 9).",
        "Efeito visível no desafio: quando o AS passa a preferir a saída por R3, **R2 usa o caminho iBGP de R1**. R2 não pode reanunciá-lo a R1 — então ele **retira** o caminho que tinha dado a R1.",
        "Resultado: **R1 fica com um só caminho** (o da própria sessão eBGP). Não é erro: é a regra.",
      ],
    },
    {
      title: "Roteiro do Lab 2",
      points: [
        "**Passo 1:** ver as sessões e descobrir que **R1 e R2 saem por provedores diferentes**.",
        "**Passo 2:** **Local Preference** em R2 e a **captura** do UPDATE iBGP em R1: o consenso nasce.",
        "**Passo 3:** o Local Preference **não sai do AS**: UPDATE eBGP **sem** o campo, e a visão de R3.",
        "**Passo 4:** o **Weight** em R1: volta a sair por R3 e **R2 não percebe**. Depois, desfazer.",
        "**Desafio:** **inverter** o consenso para R3 com um Local Preference maior, e entender por que R1 fica com um caminho só.",
        "Nos passos 1, 2, 3 e 4 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas o UPDATE iBGP com o seu Local Preference, o UPDATE eBGP sem o campo e o UPDATE do desafio. Deixe a captura de R1 rodando do passo 2 ao final.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: explicar **por que R1 e R2 saíam por lugares diferentes**; mostrar o **Local Preference no UPDATE iBGP** e a **ausência no eBGP**; explicar por que **R1 mudou sem você mexer nele**; mostrar por que o **Weight quebrou o consenso**; e explicar por que **R1 ficou com um caminho só** no desafio.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "No início do lab, por qual provedor R1 sai para 200.200.0.0/24? E R2? Por que são diferentes se são do mesmo AS?",
      lookFor: "R1 por R3 (AS3), R2 por R4 (AS2). Sem política, empatam em Weight/LP/AS-PATH e decide o critério 7: eBGP vence iBGP — cada um prefere o seu vizinho externo (best (Peer Type)). Mesmo AS, duas saídas.",
    },
    {
      id: "e2",
      prompt: "Você configurou Local Preference {{lpRoteiro}} em R2. Por que R1 mudou de saída sem você mexer nele?",
      lookFor: "R2 anuncia o caminho a R1 por iBGP com LocPrf {{lpRoteiro}}; R1 compara com o eBGP via R3 (LP padrão 100). Local Pref é o critério 2, antes de eBGP>iBGP, então o caminho iBGP vence: best (Local Pref). Local Pref é propagado por iBGP.",
    },
    {
      id: "e3",
      prompt: "Mostre na 🔬 captura de R1 o Local Preference. Em qual tipo de UPDATE ele aparece e em qual não?",
      lookFor: "No UPDATE iBGP de 10.0.0.2 (AS Path 2) aparece 'Local Preference (5), length: 4 ... {{lpRoteiro}}', com Next Hop 10.0.0.2 (next-hop-self). No UPDATE eBGP de R1 para R3 (eth2, AS Path 1 2) não há Local Preference: o atributo não sai do AS.",
    },
    {
      id: "e4",
      prompt: "O que R3 vê para 200.200.0.0/24 vindo de R1? Aparece algum localpref?",
      lookFor: "O caminho via R1 (AS-PATH 1 2) sem 'localpref' — LP não é enviado por eBGP. R3 também tem o próprio prefixo (rota local).",
    },
    {
      id: "e5",
      prompt: "Você usou Weight {{weightTrap}} em R1 para o vizinho R3. O que aconteceu com R1? E com R2? Por quê?",
      lookFor: "R1 volta a sair por R3: best (Weight) — Weight é o critério 1, antes do LP {{lpRoteiro}}. R2 não percebe: weight não é anunciado, R2 segue por R4 (best Local Pref). O AS fica dividido de novo. Por isso Weight não coordena saída.",
    },
    {
      id: "e6",
      prompt: "No desafio você deu Local Preference {{lpChallenge}} em R1 (vizinho R3). Quem sai por onde agora? Por que R1 só tem um caminho?",
      lookFor: "Os dois saem por R3: R1 por eBGP (LP {{lpChallenge}}); R2 prefere o caminho iBGP de R1 ({{lpChallenge}} > {{lpRoteiro}}). R2 não pode reanunciar a R1 um caminho aprendido por iBGP, então retira o seu; R1 fica com 1 caminho. Regra do iBGP: não repassa iBGP→iBGP (full mesh/RR).",
    },
  ],

  autoGrade: [
    { id: "ibgp_up", label: "Verificou as sessões BGP", cmdContains: "show bgp summary", outputContains: "Established" },
    { id: "checked_exit", label: "Observou o caminho para 200.200.0.0/24", cmdContains: "show ip bgp 200.200.0.0" },
    { id: "localpref_typed", label: "Configurou Local Preference", cmdContains: "set local-preference" },
    { id: "weight_typed", label: "Testou o Weight", cmdContains: "weight" },
    { id: "localpref_roteiro", label: "Local Preference do roteiro aplicado", cmdContains: "show ip bgp", outputContains: "{{lpRoteiro}}" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_lp_ibgp", label: "Capturou o UPDATE iBGP com o seu Local Preference", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 2\\s" + UPD_NT + "Local Preference \\(5\\), length: 4, Flags \\[T\\]: {{lpRoteiro}}\\s" + UPD_NT + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+200\\.200\\.0\\.0/24" },
    { id: "captured_ebgp_nolp", label: "Capturou o UPDATE eBGP para o AS3 sem Local Preference", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1 2\\s" + NO_LP + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+200\\.200\\.0\\.0/24" },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP de R1 verificadas (iBGP com R2 e eBGP com R3)",
      weight: 4,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "10\\.0\\.0\\.2\\s+4\\s+1[\\s\\S]*20\\.0\\.0\\.1\\s+4\\s+3" },
    },
    {
      id: "lp_roteiro_configured",
      label: "Local Preference {{lpRoteiro}} configurado em R2 (route-map)",
      weight: 8,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "set local-preference {{lpRoteiro}}\\s" },
    },
    {
      id: "lp_roteiro_in",
      label: "Política de R2 aplicada inbound no vizinho eBGP 30.0.0.1",
      weight: 6,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "neighbor 30\\.0\\.0\\.1 route-map \\S+ in" },
    },
    {
      id: "weight_removed",
      label: "Weight desfeito em R1 (o AS volta a depender só do Local Preference)",
      weight: 6,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "^(?![\\s\\S]*neighbor \\S+ weight \\d)[\\s\\S]*router bgp 1" },
    },
    {
      id: "lp_challenge_configured",
      label: "Desafio: Local Preference {{lpChallenge}} configurado em R1 (route-map)",
      weight: 12,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "set local-preference {{lpChallenge}}\\s" },
    },
    {
      id: "lp_challenge_in",
      label: "Desafio: política de R1 aplicada inbound no vizinho eBGP 20.0.0.1",
      weight: 8,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 20\\.0\\.0\\.1 route-map \\S+ in" },
    },
    {
      id: "r1_exit_r3",
      label: "Desafio: R1 usa o caminho eBGP via R3 com o Local Preference {{lpChallenge}}",
      weight: 10,
      check: { router: "R1", cmdPattern: "show ip bgp 200.200.0.0/24", outputPattern: "20\\.0\\.0\\.1 from 20\\.0\\.0\\.1[\\s\\S]*?localpref {{lpChallenge}}, valid, external, best" },
    },
    {
      id: "r2_follows_r1",
      label: "Desafio: R2 também sai por R3 (caminho iBGP de R1 com Local Preference {{lpChallenge}})",
      weight: 12,
      check: { router: "R2", cmdPattern: "show ip bgp 200.200.0.0/24", outputPattern: "10\\.0\\.0\\.1 from 10\\.0\\.0\\.1[\\s\\S]*?localpref {{lpChallenge}}, valid, internal, best" },
    },
    {
      id: "capture_lp_ibgp",
      label: "Capturou o UPDATE iBGP de R2 com Local Preference {{lpRoteiro}}",
      weight: 14,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 2\\s" + UPD_NT + "Local Preference \\(5\\), length: 4, Flags \\[T\\]: {{lpRoteiro}}\\s" + UPD_NT + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+200\\.200\\.0\\.0/24" },
    },
    {
      id: "capture_ebgp_nolp",
      label: "Capturou o UPDATE eBGP de R1 para o AS3 (AS Path 1 2) sem Local Preference",
      weight: 10,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1 2\\s" + NO_LP + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+200\\.200\\.0\\.0/24" },
    },
    {
      id: "capture_lp_challenge",
      label: "Capturou o UPDATE de R1 para R2 com o Local Preference do desafio ({{lpChallenge}})",
      weight: 10,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 3\\s" + UPD_NT + "Local Preference \\(5\\), length: 4, Flags \\[T\\]: {{lpChallenge}}\\s" + UPD_NT + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+200\\.200\\.0\\.0/24" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["não", "nao", "diferent", "cada", "externo", "ebgp", "provedor", "sozinho"],
      anyOf: true,
      points: 6,
      hint: "Sem política, cada roteador prefere o caminho eBGP do seu próprio vizinho externo (eBGP vence iBGP): R1 por R3 e R2 por R4.",
    },
    predict_step2: {
      type: "keywords",
      required: ["sim", "propaga", "ibgp", "consenso", "local pref", "local preference"],
      anyOf: true,
      points: 6,
      hint: "Local Preference é propagado via iBGP — R1 recebe o valor de R2 e, como o critério 2 vem antes de eBGP > iBGP, passa a preferir o caminho via R2 sem nenhuma configuração em R1.",
    },
    predict_step3: {
      type: "keywords",
      required: ["não", "nao", "fora", "ebgp", "externo", "não sai", "nao sai", "só dentro", "so dentro", "somente dentro"],
      anyOf: true,
      points: 6,
      hint: "Local Preference só circula dentro do AS (iBGP). O UPDATE eBGP de R1 para R3 não leva o atributo, então R3 não vê localpref.",
    },
    predict_step4: {
      type: "keywords",
      required: ["weight", "r3", "sim", "antes", "volta", "local", "não propaga", "nao propaga", "não percebe", "nao percebe"],
      anyOf: true,
      points: 6,
      hint: "Weight é o critério 1 (antes do Local Preference): R1 volta a sair por R3. Como o weight não é anunciado, R2 continua por R4 — o AS fica dividido de novo.",
    },
    q1: { type: "radio", correct: "100", points: 8 },
    q2: { type: "radio", correct: "Porque é propagado apenas via iBGP dentro do AS, influenciando qual saída todos os roteadores internos preferem", points: 10 },
    q3: { type: "radio", correct: "R2 deve preferir o caminho via R1 para 200.200.0.0/24, porque recebeu Local Preference propagado por iBGP", points: 10 },
    q4: { type: "radio", correct: "Local Preference é propagado via iBGP dentro do AS; Weight é local apenas ao roteador onde foi configurado", points: 10 },
    q5: { type: "radio", correct: "Weight", points: 8 },
    q6: { type: "radio", correct: "clear bgp * soft in", points: 8 },
    q7: { type: "radio", correct: "Porque eBGP é preferido sobre iBGP: cada roteador prefere o caminho do seu próprio vizinho externo", points: 10 },
    q8: { type: "radio", correct: "R2 passou a preferir o caminho iBGP de R1 e um roteador iBGP não repassa a outro peer iBGP o que aprendeu por iBGP, então retirou o seu", points: 12 },
  },

  steps: [
    {
      id: 1,
      title: "Verificar as sessões e descobrir as duas saídas",
      theory: `Local Preference é um atributo usado dentro de um AS para controlar por qual saída o tráfego deve sair. Maior Local Preference vence. Diferente do AS-PATH Prepend, que tenta influenciar ASes externos, Local Preference é uma decisão interna: os roteadores do mesmo AS recebem esse valor via iBGP e passam a concordar sobre a melhor saída.

Neste lab, R1 e R2 pertencem ao AS1 e formam iBGP. R1 tem uma saída eBGP para o AS3 (R3); R2 tem uma saída eBGP para o AS2 (R4). O prefixo 200.200.0.0/24 é anunciado por R3 e por R4: o AS1 tem duas saídas para ele.

Antes de alterar política, veja por onde cada roteador está saindo.`,
      description: `Verifique as sessões iBGP (R1–R2) e eBGP (R1–R3, R2–R4). Depois olhe, em R1 e em R2, o detalhe de 200.200.0.0/24: quantos caminhos cada um tem, qual é o best e o que o FRR escreve depois de 'best'.

Antes de rodar, responda a previsão.`,
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "iBGP com R2 (10.0.0.2) e eBGP com R3 (20.0.0.1)" },
        { cmd: "show bgp summary", router: "R2", desc: "iBGP com R1 (10.0.0.1) e eBGP com R4 (30.0.0.1)" },
        { cmd: "show ip bgp 200.200.0.0/24", router: "R1", desc: "Dois caminhos: qual é o best? O que diz entre parênteses?" },
        { cmd: "show ip bgp 200.200.0.0/24", router: "R2", desc: "E em R2? É o mesmo caminho que R1 escolheu?" },
      ],
      expected: "Sessões Established: R1 com R2 (iBGP, AS1) e R3 (eBGP, AS3); R2 com R1 e R4 (eBGP, AS2). R1 tem dois caminhos para 200.200.0.0/24 — AS-PATH '3' via 20.0.0.1 (eBGP, best (Peer Type)) e AS-PATH '2' via 10.0.0.2 (iBGP, localpref 100). R2 é o espelho: best via 30.0.0.1 (AS-PATH '2', eBGP) e o iBGP via R1. R1 sai por R3 e R2 sai por R4.",
      predict: {
        id: "predict_step1",
        prompt: "R1 e R2 são do mesmo AS e têm as duas saídas disponíveis. Sem nenhuma política configurada, você espera que os dois escolham a mesma saída para 200.200.0.0/24? Por quê?",
      },
    },
    {
      id: 2,
      title: "Configurar o Local Preference em R2",
      theory: `Para alterar Local Preference nas rotas recebidas de um vizinho, usamos uma route-map na direção de entrada (in), na borda que recebe a rota externa. Sem 'match', a route-map vale para todas as rotas daquele vizinho. O comando chave é 'set local-preference VALOR'.

Como o valor é maior que o padrão 100, as rotas recebidas por aquele vizinho passam a ser mais atraentes — e como o Local Preference viaja por iBGP, os demais roteadores do AS também o enxergam.

Depois de aplicar a route-map inbound, use 'clear bgp * soft in' para reaplicar a política nas rotas já recebidas, sem derrubar sessões.`,
      description: `Abra a captura em R1, interface 'todas', protocolo BGP. DEIXE A CAPTURA RODANDO até o fim do lab (se ela parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Responda a previsão e configure R2 para definir Local Preference {{lpRoteiro}} nas rotas recebidas do AS2 pelo vizinho 30.0.0.1:

  configure terminal
  route-map SET_LP_AS2 permit 10
   set local-preference {{lpRoteiro}}
  exit
  router bgp 1
   address-family ipv4 unicast
    neighbor 30.0.0.1 route-map SET_LP_AS2 in
  end
  clear bgp * soft in

Depois olhe R1 (você NÃO configurou nada nele) e procure na captura o UPDATE vindo de 10.0.0.2: ele leva o campo 'Local Preference (5)'?`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme a route-map e a aplicação inbound" },
        { cmd: "clear bgp * soft in", router: "R2", desc: "Reaplica a política nas rotas recebidas" },
        { cmd: "show ip bgp 200.200.0.0/24", router: "R2", desc: "As rotas de R4 agora com localpref {{lpRoteiro}}" },
        { cmd: "show ip bgp 200.200.0.0/24", router: "R1", desc: "R1 mudou de saída? Qual é o best agora, e o que diz entre parênteses?" },
      ],
      expected: "R2 mostra localpref {{lpRoteiro}} no caminho de R4. R1 muda sozinho de saída: o best passa a ser 10.0.0.2 (AS-PATH '2', iBGP, 'localpref {{lpRoteiro}}', best (Local Pref)); o caminho via R3 fica como segundo. Na captura de R1: UPDATE de 10.0.0.2 com 'AS Path ... 2', 'Next Hop 10.0.0.2' e 'Local Preference (5), length: 4 ... {{lpRoteiro}}' para 200.200.0.0/24. O AS inteiro sai pelo provedor AS2.",
      predict: {
        id: "predict_step2",
        prompt: "Você vai configurar o Local Preference só em R2. Você espera que R1 passe a preferir as rotas vindas do AS2 também, mesmo sem configurar nada em R1? Por quê?",
      },
    },
    {
      id: 3,
      title: "O Local Preference não sai do AS",
      theory: `O Local Preference é propagado por iBGP, mas nunca por eBGP: ele existe para coordenar a decisão dentro de um AS, não para influenciar vizinhos externos. Por isso serve para tráfego de SAÍDA.

Na captura, isso aparece como a presença do campo 'Local Preference (5)' nos UPDATEs iBGP e a sua ausência nos UPDATEs eBGP — mesmo para o mesmo prefixo.`,
      description: `Com a captura de R1 rodando, procure os UPDATEs de 200.200.0.0/24 e compare:

  • o UPDATE iBGP que você já viu (de/para 10.0.0.2): tem 'Local Preference'?
  • um UPDATE eBGP que R1 enviou a R3 (interface eth2, 'AS Path ... 1 2'): tem 'Local Preference'?

Depois, em R3, veja o que ele recebe de R1 para 200.200.0.0/24 — aparece algum 'localpref'?

Responda a previsão antes de olhar R3. Se não achar o UPDATE eBGP, rode 'clear bgp * soft out' em R1 para reenviar os anúncios.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "clear bgp * soft out", router: "R1", desc: "Reenvia os anúncios de R1 (aparecem na captura)" },
        { cmd: "show ip bgp 200.200.0.0/24", router: "R3", desc: "O que R3 vê vindo de R1? Há localpref?" },
      ],
      expected: "Na captura, o UPDATE iBGP (10.0.0.2 ↔ 10.0.0.1) traz 'Local Preference (5)'; o UPDATE eBGP de R1 para R3 (AS Path '1 2' para 200.200.0.0/24) não traz. Em R3, o caminho via R1 aparece com AS-PATH '1 2' e sem 'localpref' (o best de R3 é a própria rota local, com weight 32768).",
      predict: {
        id: "predict_step3",
        prompt: "R2 aplicou Local Preference {{lpRoteiro}} nas rotas de R4. Você espera que R3 (outro AS) veja esse valor nas rotas que recebe do AS1? Por quê?",
      },
    },
    {
      id: 4,
      title: "A armadilha do Weight",
      theory: `Weight parece fazer o mesmo que o Local Preference, mas tem escopo diferente: é local ao roteador onde foi configurado e nunca é anunciado a nenhum vizinho. E está na ordem de decisão antes do Local Preference: qualquer weight maior que 0 vence qualquer Local Pref.

Você vai usar Weight em R1 para o vizinho R3 — e ver o que acontece com R1 e com R2. Depois, desfazer.`,
      description: `Responda a previsão e, em R1, dê um weight ao vizinho R3 (eBGP):

  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 20.0.0.1 weight {{weightTrap}}
  end
  clear bgp * soft in

Compare R1 e R2 para 200.200.0.0/24: qual é o best de cada um e o que diz entre parênteses? Na captura, procure o UPDATE que R1 manda a R2 depois da mudança: tem alguma informação do weight?

Por fim, DESFAÇA o weight (no R1: 'no neighbor 20.0.0.1 weight {{weightTrap}}' e 'clear bgp * soft in') e confirme que R1 voltou a sair por R2.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show ip bgp 200.200.0.0/24", router: "R1", desc: "ANTES do weight: best via R2 (Local Pref)" },
        { cmd: "clear bgp * soft in", router: "R1", desc: "Reavalia os caminhos com o weight" },
        { cmd: "show ip bgp 200.200.0.0/24", router: "R1", desc: "DEPOIS: qual é o best e o que diz entre parênteses?" },
        { cmd: "show ip bgp 200.200.0.0/24", router: "R2", desc: "R2 percebeu a mudança de R1?" },
        { cmd: "show running-config", router: "R1", desc: "Depois de desfazer: o weight sumiu?" },
      ],
      expected: "Com o weight {{weightTrap}} em R1: R1 volta a sair por R3 (20.0.0.1, 'weight {{weightTrap}}', best (Weight)) e o caminho via R2 (localpref {{lpRoteiro}}) fica em segundo — o weight vence o Local Preference. R2 não percebe: continua por R4 (best (Local Pref)). O AS ficou dividido de novo. Na captura, o UPDATE de R1 a R2 anuncia o caminho via R3 (AS Path 3) com 'Local Preference 100': o weight não aparece. Depois de desfazer, R1 volta a sair por R2 (best (Local Pref)).",
      predict: {
        id: "predict_step4",
        prompt: "R1 já prefere a saída por R2 (Local Preference {{lpRoteiro}}). Se você der um weight {{weightTrap}} ao vizinho R3 em R1, o que você espera que aconteça com a saída de R1? E com a de R2?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Inverter o Consenso do AS",
    description: `Sem apagar o que você já configurou (e com o weight desfeito), mude a decisão do AS1: agora o provedor preferido é o AS3 (R3).

Tarefa prática:
1. Em R1, crie uma route-map que aplique Local Preference {{lpChallenge}}.
2. Aplique essa route-map inbound no vizinho eBGP 20.0.0.1 (R3).
3. Use 'clear bgp * soft in' em R1.

Estado final esperado: R1 e R2 saem por R3 para 200.200.0.0/24. R2 prefere o caminho iBGP de R1 (Local Preference {{lpChallenge}} contra {{lpRoteiro}}).

Observe também: R1 fica com quantos caminhos para 200.200.0.0/24? Por quê?

Deixe a captura de R1 rodando: a nota confere nela o UPDATE de R1 para R2 com o seu Local Preference.`,
    hints: [
      "Local Preference é propagado pelo iBGP dentro do AS",
      "A política deve ser inbound no roteador que recebe a rota externa",
      "Maior Local Preference = preferido; o desafio precisa ser maior que o do roteiro",
      "Um roteador iBGP não repassa a outro peer iBGP o que aprendeu por iBGP",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Qual o valor padrão de Local Preference no BGP?",
        options: ["0", "200", "100", "1000"],
      },
      {
        id: "q2", type: "radio",
        text: "Por que o Local Preference é eficaz para controlar o tráfego de SAÍDA do AS?",
        options: [
          "Porque é propagado via eBGP para todos os ASes vizinhos",
          "Porque tem maior prioridade que o Weight na ordem de decisão BGP",
          "Porque substitui o AS-PATH na seleção de melhor caminho",
          "Porque é propagado apenas via iBGP dentro do AS, influenciando qual saída todos os roteadores internos preferem",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Depois de aplicar Local Preference {{lpChallenge}} em R1 para rotas recebidas do AS3, o que R2 deve preferir para chegar em 200.200.0.0/24?",
        options: [
          "Nenhum caminho — Local Preference não é propagado para iBGP peers",
          "R2 deve preferir o caminho via R1 para 200.200.0.0/24, porque recebeu Local Preference propagado por iBGP",
          "R2 deve preferir R4, porque eBGP sempre vence iBGP",
          "Depende do AS-PATH, que tem prioridade sobre Local Preference",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Qual a diferença entre Local Preference e Weight para influenciar seleção de rota?",
        options: [
          "Weight é propagado via iBGP; Local Preference é local ao roteador",
          "Ambos têm o mesmo escopo — afetam apenas o roteador local",
          "Local Preference é usado em eBGP; Weight é usado em iBGP",
          "Local Preference é propagado via iBGP dentro do AS; Weight é local apenas ao roteador onde foi configurado",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Na ordem de decisão BGP, qual atributo tem MAIOR prioridade?",
        options: ["Local Preference", "AS-PATH", "Weight", "MED"],
      },
      {
        id: "q6", type: "radio",
        text: "Após configurar Local Preference via route-map no R1, qual comando aplica a política nas rotas recebidas sem derrubar sessões?",
        options: ["clear bgp * hard", "clear bgp * soft out", "reload bgp", "clear bgp * soft in"],
      },
      {
        id: "q7", type: "radio",
        text: "No início do lab, sem política nenhuma, por que R1 saía por R3 e R2 por R4?",
        options: [
          "Porque o Router ID de R3 e de R4 é menor",
          "Porque o AS-PATH via R3 e via R4 é mais curto",
          "Porque eBGP é preferido sobre iBGP: cada roteador prefere o caminho do seu próprio vizinho externo",
          "Porque o iBGP não propaga rotas externas",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "No desafio, por que R1 ficou com um só caminho para 200.200.0.0/24?",
        options: [
          "Porque o Local Preference {{lpChallenge}} apagou o outro caminho",
          "Porque a sessão iBGP com R2 caiu",
          "R2 passou a preferir o caminho iBGP de R1 e um roteador iBGP não repassa a outro peer iBGP o que aprendeu por iBGP, então retirou o seu",
          "Porque o weight ainda estava ativo em R1",
        ],
      },
    ],
  },
};

// frr_configs como template literals (preserva formatação e evita escape de regex)
lab.frr_configs = {
    R1: `frr version 9.0
hostname R1
!
interface lo
 ip address 10.0.0.1/32
!
interface eth1
 ip address 10.1.1.1/30
!
interface eth2
 ip address 10.1.2.1/30
!
router bgp 1
 bgp router-id 10.0.0.1
 no bgp ebgp-requires-policy
 neighbor 10.0.0.2 remote-as 1
 neighbor 10.0.0.2 update-source lo
 neighbor 20.0.0.1 remote-as 3
 neighbor 20.0.0.1 update-source lo
 neighbor 20.0.0.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 10.10.0.0/24
  neighbor 10.0.0.2 activate
  neighbor 10.0.0.2 next-hop-self
  neighbor 20.0.0.1 activate
 exit-address-family
!
ip route 10.0.0.2/32 10.1.1.2
ip route 20.0.0.1/32 10.1.2.2
ip route 10.10.0.0/24 Null0
`,
    R2: `frr version 9.0
hostname R2
!
interface lo
 ip address 10.0.0.2/32
!
interface eth1
 ip address 10.1.1.2/30
!
interface eth2
 ip address 10.2.1.1/30
!
router bgp 1
 bgp router-id 10.0.0.2
 no bgp ebgp-requires-policy
 neighbor 10.0.0.1 remote-as 1
 neighbor 10.0.0.1 update-source lo
 neighbor 30.0.0.1 remote-as 2
 neighbor 30.0.0.1 update-source lo
 neighbor 30.0.0.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 10.20.0.0/24
  neighbor 10.0.0.1 activate
  neighbor 10.0.0.1 next-hop-self
  neighbor 30.0.0.1 activate
 exit-address-family
!
ip route 10.0.0.1/32 10.1.1.1
ip route 30.0.0.1/32 10.2.1.2
ip route 10.20.0.0/24 Null0
`,
    R3: `frr version 9.0
hostname R3
!
interface lo
 ip address 20.0.0.1/32
!
interface eth1
 ip address 10.1.2.2/30
!
router bgp 3
 bgp router-id 20.0.0.1
 no bgp ebgp-requires-policy
 neighbor 10.0.0.1 remote-as 1
 neighbor 10.0.0.1 update-source lo
 neighbor 10.0.0.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 20.20.0.0/24
  network 200.200.0.0/24
  neighbor 10.0.0.1 activate
 exit-address-family
!
ip route 10.0.0.1/32 10.1.2.1
ip route 20.20.0.0/24 Null0
ip route 200.200.0.0/24 Null0
`,
    R4: `frr version 9.0
hostname R4
!
interface lo
 ip address 30.0.0.1/32
!
interface eth1
 ip address 10.2.1.2/30
!
router bgp 2
 bgp router-id 30.0.0.1
 no bgp ebgp-requires-policy
 neighbor 10.0.0.2 remote-as 1
 neighbor 10.0.0.2 update-source lo
 neighbor 10.0.0.2 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 30.30.0.0/24
  network 200.200.0.0/24
  neighbor 10.0.0.2 activate
 exit-address-family
!
ip route 10.0.0.2/32 10.2.1.1
ip route 30.30.0.0/24 Null0
ip route 200.200.0.0/24 Null0
`
};

module.exports = lab;
