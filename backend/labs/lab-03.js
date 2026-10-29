/**
 * Lab 3 — BGP Nível 3: Path Control (Weight, ORIGIN e Confederação)
 * Adaptado do material "BGP Routing Protocol With 16 Practice Labs".
 *
 * Topologia: AS 254 externo em R1; AS 5 como confederação formada por
 * R2 (65502), R3 (65503) e R4 (65504). R1 e R4 originam 150.1.1.0/24.
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - sem política, R2 e R3 chegam a 150.1.1.0/24 pela confederação (R3 e
 *    R4), não pelo caminho direto de R1: o segmento de confederação não
 *    conta no comprimento do AS-PATH ("(65503 65504)" tem comprimento 0
 *    contra 1 do "254") — best (AS Path);
 *  - Weight só em R2 não muda R3; precisa ser feito nos dois (best (Weight));
 *  - R1 enxerga 150.3.3.0/24 por 3 caminhos iguais (multipath, best (Router
 *    ID) via R2). O lab antigo punha R2 como o único IGP e o resultado
 *    "R1 prefere R2" já era o padrão — a política de ORIGIN não mudava nada.
 *    Agora R2 anuncia incomplete e R3 anuncia EGP: R1 passa a R4, o único
 *    IGP (best (Origin)) — troca de verdade, e o multipath some;
 *  - o UPDATE no fio mostra a confederação: "( 65503 )" dentro dela e "5"
 *    para R1; e o Origin ("EGP", "Incomplete") antes do AS Path;
 *  - R1 sobe com `bgp bestpath compare-routerid` para o desempate inicial
 *    não depender de qual UPDATE chegou primeiro.
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";
// Lista de prefixos de 'Updated routes:' até o prefixo procurado
const ROUTES_TO = (pfx) => "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+" + pfx;

// Diagramas dos slides (desenhados no frontend, ver SlideTopology.jsx). Variantes:
// "base" (a rede), "origem" (as duas origens de 150.1.1.0/24), "caminho" (o AS-PATH a cada salto),
// "weight" (Weight só em R2, depois em R3) e "origin" (ORIGIN rebaixado em R2 e R3).
function TOPO3(variant) {
  const nodes = [
    { id: "R1", x: 95, y: 210, label: "R1", sub: "AS 254" },
    { id: "R2", x: 470, y: 70, label: "R2", sub: "sub-AS 65502" },
    { id: "R3", x: 470, y: 210, label: "R3", sub: "sub-AS 65503" },
    { id: "R4", x: 470, y: 350, label: "R4", sub: "sub-AS 65504" },
  ];
  const groups = [
    { label: "AS 254", x: 15, y: 140, w: 160, h: 140, color: "#fb923c" },
    { label: "AS 5 (confederação)", x: 275, y: 10, w: 475, h: 400, color: "#60a5fa" },
    { label: "", x: 330, y: 36, w: 260, h: 68, color: "#67e8f9" },
    { label: "", x: 330, y: 176, w: 260, h: 68, color: "#67e8f9" },
    { label: "", x: 330, y: 316, w: 260, h: 68, color: "#67e8f9" },
  ];
  const badges = [
    { x: 675, y: 70, text: "150.2.2.0/24", color: "#fbbf24" },
    { x: 675, y: 210, text: "150.3.3.0/24", color: "#fbbf24" },
    { x: 675, y: 350, text: "150.1.1.0/24", color: "#fbbf24" },
    { x: 95, y: 312, text: "150.1.1.0/24", color: "#fbbf24" },
  ];
  const links = [
    { id: "R1-R2", a: "R1", b: "R2", kind: "ebgp", label: "eBGP" },
    { id: "R1-R3", a: "R1", b: "R3", kind: "ebgp", label: "eBGP" },
    { id: "R1-R4", a: "R1", b: "R4", kind: "ebgp", label: "eBGP" },
    { id: "R2-R3", a: "R2", b: "R3", kind: "confed", label: "confed-eBGP" },
    { id: "R3-R4", a: "R3", b: "R4", kind: "confed", label: "confed-eBGP" },
  ];
  const out = { w: 760, h: 420, groups, nodes, links, badges };
  const YEL = "#fbbf24", GRN = "#4ade80", RED = "#f87171", CY = "#67e8f9";

  if (variant === "origem") {
    out.badges = [{ x: 675, y: 350, text: "150.1.1.0/24", color: GRN }, { x: 95, y: 312, text: "150.1.1.0/24", color: GRN },
      { x: 675, y: 70, text: "150.2.2.0/24", color: "#475569" }, { x: 675, y: 210, text: "150.3.3.0/24", color: "#475569" }];
    out.steps = [
      { caption: "R1 e R4 anunciam o MESMO prefixo, 150.1.1.0/24. Vamos ver o que R2 e R3 recebem.", hl: ["R1", "R4"],
        packets: [{ link: "R1-R2", dir: "a>b", label: "254", color: YEL }, { link: "R3-R4", dir: "b>a", label: "( 65504 )", color: CY }] },
      { caption: "R2 recebe DUAS opções: a direta de R1, com AS-PATH 254 (comprimento 1), e a da confederação, com ( 65503 65504 ) — um segmento entre parênteses.", hl: ["R2"],
        packets: [{ link: "R1-R2", dir: "a>b", label: "254 · comp. 1", color: YEL }, { link: "R2-R3", dir: "b>a", label: "( 65503 65504 ) · comp. 0", color: CY }] },
      { caption: "O segmento de confederação NÃO conta no comprimento: 0 < 1. R2 escolhe a rota pela confederação — best (AS Path). O caminho direto de R1 perde.", hl: ["R2"],
        links: { "R1-R2": { kind: "dim", label: "perde", arrow: undefined }, "R2-R3": { kind: "best", arrow: "b>a", label: "R2 usa R3" } } },
      { caption: "R3 faz a mesma conta: a direta de R1 (254) contra a de R4, ( 65504 ), de comprimento 0.", hl: ["R3"],
        packets: [{ link: "R1-R3", dir: "a>b", label: "254 · comp. 1", color: YEL }, { link: "R3-R4", dir: "b>a", label: "( 65504 ) · comp. 0", color: CY }],
        links: { "R1-R2": { kind: "dim", label: "perde" }, "R2-R3": { kind: "best", arrow: "b>a", label: "R2 usa R3" } } },
      { caption: "Resultado: R2 usa R3 e R3 usa R4. As rotas diretas de R1 foram ignoradas — por isso o Weight será necessário no passo 2.", hl: ["R2", "R3"],
        links: { "R1-R2": { kind: "dim", label: "perde" }, "R1-R3": { kind: "dim", label: "perde" }, "R2-R3": { kind: "best", arrow: "b>a", label: "R2 usa R3" }, "R3-R4": { kind: "best", arrow: "b>a", label: "R3 usa R4" } } },
    ];
  } else if (variant === "caminho") {
    out.badges = [{ x: 675, y: 210, text: "150.3.3.0/24", color: GRN }, { x: 675, y: 70, text: "150.2.2.0/24", color: "#475569" },
      { x: 675, y: 350, text: "150.1.1.0/24", color: "#475569" }, { x: 95, y: 312, text: "150.1.1.0/24", color: "#475569" }];
    out.steps = [
      { caption: "R3 origina 150.3.3.0/24 e o anuncia a R2 DENTRO da confederação: o sub-AS entra entre parênteses.", hl: ["R3"],
        packets: [{ link: "R2-R3", dir: "b>a", label: "AS-PATH ( 65503 )", color: CY }] },
      { caption: "R2 anuncia a R1, FORA da confederação: os parênteses somem e entra o AS 5. R1 só vê '5'.", hl: ["R2"],
        packets: [{ link: "R1-R2", dir: "b>a", label: "AS-PATH 5", color: YEL }],
        links: { "R2-R3": { kind: "best", arrow: "b>a" } } },
      { caption: "R3 também anuncia direto a R1: de novo, AS-PATH 5.", hl: ["R3"],
        packets: [{ link: "R1-R3", dir: "b>a", label: "AS-PATH 5", color: YEL }],
        links: { "R1-R2": { kind: "best", arrow: "b>a", label: "5" } } },
      { caption: "E R4, que aprendeu de R3 dentro da confederação, anuncia a R1: AS-PATH 5. Os TRÊS caminhos de R1 são idênticos no AS-PATH — o ORIGIN vai desempatar no passo 3.", hl: ["R1"],
        packets: [{ link: "R1-R4", dir: "b>a", label: "AS-PATH 5", color: YEL }, { link: "R3-R4", dir: "a>b", label: "( 65503 )", color: CY }],
        links: { "R1-R2": { kind: "best", arrow: "b>a", label: "5" }, "R1-R3": { kind: "best", arrow: "b>a", label: "5" } } },
    ];
  } else if (variant === "weight") {
    out.badges = [{ x: 675, y: 350, text: "150.1.1.0/24", color: GRN }, { x: 95, y: 312, text: "150.1.1.0/24", color: GRN },
      { x: 675, y: 70, text: "150.2.2.0/24", color: "#475569" }, { x: 675, y: 210, text: "150.3.3.0/24", color: "#475569" }];
    out.links = links.map((l) => ({ ...l }));
    out.steps = [
      { caption: "Ponto de partida: R2 usa R3 e R3 usa R4 para 150.1.1.0/24 (AS-PATH de confederação, comprimento 0).",
        links: { "R1-R2": { kind: "dim" }, "R1-R3": { kind: "dim" }, "R2-R3": { kind: "best", arrow: "b>a", label: "R2 usa R3" }, "R3-R4": { kind: "best", arrow: "b>a", label: "R3 usa R4" } } },
      { caption: "Você configura SÓ o R2: weight 800 nas rotas que chegam de R1 (route-map in). R2 passa a usar a rota direta de R1 — best (Weight).", hl: ["R2"],
        badges: [{ x: 190, y: 66, text: "R2: weight 800 (local)", color: YEL }],
        links: { "R1-R2": { kind: "best", arrow: "b>a", label: "R2 usa R1", flow: "b>a" }, "R2-R3": { kind: "dim" }, "R3-R4": { kind: "best", arrow: "b>a", label: "R3 usa R4" } } },
      { caption: "Mas o Weight NÃO sai de R2. R3 não é avisado: continua usando R4. O AS ficou dividido.", hl: ["R2"],
        badges: [{ x: 190, y: 66, text: "R2: weight 800 (local)", color: YEL }],
        links: { "R1-R2": { kind: "best", arrow: "b>a", label: "R2 usa R1" }, "R2-R3": { kind: "blocked", label: "weight não é anunciado" }, "R3-R4": { kind: "best", arrow: "b>a", label: "R3 usa R4", flow: "b>a" } } },
      { caption: "Para R3 também preferir R1, configure o weight em R3. Cada roteador decide por si.", hl: ["R2", "R3"],
        badges: [{ x: 190, y: 66, text: "R2: weight 800", color: YEL }, { x: 380, y: 246, text: "R3: weight 800", color: YEL }],
        links: { "R1-R2": { kind: "best", arrow: "b>a", label: "R2 usa R1" }, "R1-R3": { kind: "best", arrow: "b>a", label: "R3 usa R1", flow: "b>a" }, "R2-R3": { kind: "dim" }, "R3-R4": { kind: "dim" } } },
    ];
  } else if (variant === "origin") {
    out.badges = [{ x: 675, y: 210, text: "150.3.3.0/24", color: GRN }, { x: 675, y: 70, text: "150.2.2.0/24", color: "#475569" },
      { x: 675, y: 350, text: "150.1.1.0/24", color: "#475569" }, { x: 95, y: 312, text: "150.1.1.0/24", color: "#475569" }];
    out.steps = [
      { caption: "Antes: R1 tem TRÊS caminhos iguais para 150.3.3.0/24 — AS-PATH 5, Origin IGP (i) nos três. O FRR usa os três (multipath) e escolhe o best pelo Router ID: R2.", hl: ["R1"],
        packets: [{ link: "R1-R2", dir: "b>a", label: "5 · i", color: GRN }, { link: "R1-R3", dir: "b>a", label: "5 · i", color: GRN }, { link: "R1-R4", dir: "b>a", label: "5 · i", color: GRN }],
        links: { "R1-R2": { kind: "best", label: "best (Router ID)" }, "R1-R3": { kind: "best", label: "multipath" }, "R1-R4": { kind: "best", label: "multipath" } } },
      { caption: "Você rebaixa o Origin nos anúncios de saída: R2 anuncia incomplete (?), R3 anuncia EGP (e). R4 não é tocado e continua IGP (i).", hl: ["R2", "R3"],
        badges: [{ x: 190, y: 66, text: "R2: set origin incomplete", color: RED }, { x: 380, y: 246, text: "R3: set origin egp", color: YEL }],
        packets: [{ link: "R1-R2", dir: "b>a", label: "5 · ?", color: RED }, { link: "R1-R3", dir: "b>a", label: "5 · e", color: YEL }, { link: "R1-R4", dir: "b>a", label: "5 · i", color: GRN }],
        links: { "R1-R2": { kind: "dim", label: "incomplete" }, "R1-R3": { kind: "dim", label: "EGP" }, "R1-R4": { kind: "best", label: "IGP" } } },
      { caption: "R1 prefere o ÚNICO caminho IGP: R4. O BGP decide pelo Origin — best (Origin) — ANTES do Router ID, e o multipath se desfaz.", hl: ["R1", "R4"],
        badges: [{ x: 190, y: 66, text: "R2: set origin incomplete", color: RED }, { x: 380, y: 246, text: "R3: set origin egp", color: YEL }],
        links: { "R1-R2": { kind: "dim", label: "incomplete" }, "R1-R3": { kind: "dim", label: "EGP" }, "R1-R4": { kind: "best", arrow: "b>a", label: "best (Origin)", flow: "b>a" } } },
    ];
  }
  return out;
}

module.exports = {
  id: 3,
  protocol: "bgp",
  level: 3,
  scenario: "Um roteador de borda específico precisa preferir um caminho só para si mesmo, sem afetar o resto do AS — diferente de Local Preference, que é consenso de toda a rede interna. Weight resolve isso: é local ao roteador, nunca é anunciado a ninguém. Combinado com ORIGIN (que distingue rotas geradas internamente de rotas redistribuídas) e Confederação (que organiza um AS grande em sub-ASes sem expor essa divisão para fora), o time de rede ganha controle fino sobre decisões de caminho em pontos específicos da topologia. Você vai ver a confederação e o ORIGIN no fio, e descobrir por que dois roteadores do mesmo AS não escolhem o caminho que você imaginava.",
  enabled: true,
  variables: {
    weightValue: { pool: ["500", "800", "1200", "1500"] },
  },
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

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=3). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "BGP — Weight, ORIGIN e Confederação",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 3",
      topology: TOPO3("base"),
      points: [
        "**Confederação**: um AS grande dividido em sub-ASes — e o que o mundo de fora enxerga",
        "Por que **R2 e R3 não escolhem** o caminho direto de R1",
        "**Weight**: poder **local** e o critério número 1",
        "**ORIGIN**: IGP, EGP e incomplete — e quando ele desempata",
        "Tudo isso **no fio**: os UPDATEs mostram a confederação e o Origin",
      ],
      note: "Este lab parte dos Labs 1 e 2: AS-PATH, a ordem de decisão e Local Preference × Weight. Nos diagramas com botões, use **Passo →** ou **▶ Reproduzir**.",
    },
    {
      title: "Duas perguntas para guiar o lab",
      points: [
        "**1.** Por que R2 e R3 **ignoram** a rota direta de R1 e vão pela confederação? E como **fazê-los** usar R1?",
        "**2.** Como fazer R1 **preferir um** entre três caminhos que parecem **idênticos**?",
        "A **pergunta 1** se resolve com **Weight** (passo 2). A **pergunta 2**, com **ORIGIN** (passo 3).",
        "Entre as duas, vem a **confederação** (passo 1): é ela que explica o comportamento surpreendente da pergunta 1.",
      ],
      flow: ["Passo 1: ler a confederação", "Passo 2: Weight", "Passo 3: ORIGIN"],
      note: "Dica de estudo: antes de cada passo do roteiro há uma **previsão**. Tente responder olhando só para o diagrama — errar faz parte.",
    },
    {
      title: "Confederação: o problema que ela resolve",
      points: [
        "O iBGP exige **malha completa**: todo roteador do AS fala com todos os outros. Com **n** roteadores são **n(n−1)/2** sessões. Num AS grande, isso explode.",
        "A **confederação** divide o AS em **sub-ASes**. Dentro de cada sub-AS vale o iBGP normal; **entre** sub-ASes a sessão é **confed-eBGP** — parecida com eBGP, mas o AS continua sendo **um só** por dentro.",
        "Os sub-ASes usam **ASNs privados** (aqui 65502, 65503, 65504). Para o mundo de fora, **todos** são o **AS 5** (o `bgp confederation identifier`).",
        "(O **Lab 4** é só sobre isso — aqui a confederação é o cenário em que o Weight e o ORIGIN vão agir.)",
      ],
      table: {
        head: ["Roteadores", "Sessões em malha completa"],
        rows: [["5", "**10**"], ["10", "**45**"], ["50", "**1225**"]],
      },
    },
    {
      title: "A topologia do Lab 3",
      topology: TOPO3("base"),
      points: [
        "**R1** (AS 254) fica **fora** e fala com **R2**, **R3** e **R4**. Para ele, os três são o **AS 5**.",
        "**R2, R3 e R4** formam o **AS 5**: sub-ASes **65502**, **65503**, **65504**, com sessões **confed-eBGP** (laranja tracejado) entre eles.",
        "**R1 e R4 anunciam o mesmo prefixo**: `150.1.1.0/24` (R4 tem uma interface nessa rede). Essa é a origem da dúvida do passo 1.",
        "Cada um anuncia um prefixo próprio: R2 `150.2.2.0/24`, R3 `150.3.3.0/24`.",
      ],
    },
    {
      title: "Quem vence? A ordem de decisão",
      flow: ["1 Weight (maior)", "2 Local Pref (maior)", "3 Rota local", "4 AS-PATH (mais curto)", "5 ORIGIN (i < e < ?)", "6 MED (menor)", "7 eBGP > iBGP", "8 Métrica IGP", "9 Router ID"],
      points: [
        "O BGP percorre a lista **de cima para baixo** e **para no primeiro critério que desempata**.",
        "Hoje usamos três: **AS-PATH (4)** — explica o comportamento surpreendente; **Weight (1)** — o que **vence** tudo; e **ORIGIN (5)** — o que desempata quando **nada mais** diferencia.",
        "O FRR escreve o critério que decidiu: `best (AS Path)`, `best (Weight)`, `best (Origin)`, `best (Router ID)`.",
      ],
      note: "Leitura rápida: quanto **mais para a esquerda**, **mais poder**. Weight vence o AS-PATH; o AS-PATH vence o ORIGIN.",
    },
    {
      title: "Passo 1 · Por que R2 e R3 ignoram o caminho direto?",
      topology: TOPO3("origem"),
      points: [
        "O prefixo `150.1.1.0/24` existe em **dois lugares**: em **R1** e em **R4**. R2 e R3 têm **duas opções** cada.",
        "O caminho direto de R1 tem AS-PATH `254` — **comprimento 1**. O caminho pela confederação tem um **segmento entre parênteses**, e ele **não conta** — comprimento **0**.",
        "**0 < 1**: o BGP prefere a rota pela confederação — `best (AS Path)`. R2 usa R3; R3 usa R4.",
      ],
      note: "Validado neste lab: sem política, R2 escolhe a rota de R3 e R3 escolhe a de R4 para 150.1.1.0/24.",
    },
    {
      title: "O AS-PATH de confederação",
      code: "R2# show ip bgp 150.1.1.0/24\n  (65503 65504)\n    10.0.0.10 from 10.0.0.10 (3.3.3.3)\n      Origin IGP, metric 0, localpref 100, valid, confed-external, best (AS Path)\n  254\n    10.0.0.1 from 10.0.0.1 (1.1.1.1)\n      Origin IGP, metric 0, valid, external",
      points: [
        "O caminho interno aparece **entre parênteses**: `(65503 65504)` é um **segmento de confederação**. Ele registra os sub-ASes pelos quais a rota passou.",
        "Esse segmento **não conta no comprimento** do AS-PATH: `(65503 65504)` tem comprimento **0**; o caminho direto de R1, `254`, tem comprimento **1**.",
        "**Ao sair do AS 5**, o segmento é **removido** e o AS 5 é acrescentado: R1 vê `5`, nunca os sub-ASes.",
      ],
    },
    {
      title: "A confederação no fio: o AS-PATH muda a cada salto",
      topology: TOPO3("caminho"),
      points: [
        "Dentro da confederação, cada **sub-AS** é acrescentado **entre parênteses**: `( 65503 )`.",
        "Ao **sair** para R1, os parênteses somem e entra o **AS 5**: **R1 só vê `5`**.",
        "Resultado: os **três** caminhos de R1 para `150.3.3.0/24` têm o **mesmo AS-PATH** (`5`) — o assunto do passo 3.",
      ],
      code: "(R3 → R2, dentro da confederação)\n\t  AS Path (2), length: 6, Flags [TE]: ( 65503 )\n\t  Updated routes:\n\t    150.3.3.0/24\n\n(R2 → R1, para fora)\n\t  AS Path (2), length: 6, Flags [TE]: 5\n\t  Updated routes:\n\t    150.3.3.0/24",
      note: "Saída real do tcpdump em R2. Os parênteses no `tcpdump` marcam o segmento de confederação.",
    },
    {
      title: "Passo 2 · Weight: poder local",
      topology: TOPO3("weight"),
      points: [
        "**Weight** é um valor **por roteador**: **maior vence**. Fica no critério **1** — **antes** do AS-PATH.",
        "Configurar o Weight em **R2** muda **só a decisão de R2**. **Nunca é anunciado** — nem por confed-eBGP, nem por iBGP.",
        "**R3** não fica sabendo: continua usando R4. Para mudar R3, é preciso configurá-lo **também**.",
      ],
      note: "Regra prática: se **todo o AS** precisa concordar, use **Local Preference** (Lab 2). Weight é para um ajuste **local**.",
    },
    {
      title: "prefix-list + route-map: limitando a política",
      flow: ["Rota recebida de R1", "prefix-list casa 150.1.1.0/24?", "cláusula 10: set weight", "cláusula 20: passa sem alterar"],
      points: [
        "Sem `match`, a route-map vale para **todos** os prefixos do vizinho. Para afetar **só um**, usa-se uma **prefix-list** no `match ip address prefix-list`.",
        "A cláusula **10** casa o prefixo e aplica o `set`. A cláusula **20** (sem `match`) deixa **passar tudo o mais**, sem alterar.",
        "Se a cláusula 20 **não existisse**, as demais rotas seriam **descartadas** pelo *deny implícito* do final da route-map.",
        "Resultado: o Weight vale **só** para `150.1.1.0/24`; as outras rotas de R1 seguem como estão.",
      ],
      code: "ip prefix-list NET_R1 seq 10 permit 150.1.1.0/24\n!\nroute-map WEIGHT_R1 permit 10\n match ip address prefix-list NET_R1\n set weight 800\nroute-map WEIGHT_R1 permit 20\n!\nrouter bgp 65502\n address-family ipv4 unicast\n  neighbor 10.0.0.1 route-map WEIGHT_R1 in",
    },
    {
      title: "ORIGIN — como a rota entrou no BGP",
      table: {
        head: ["Valor", "Letra em show ip bgp", "Como surge", "Preferência"],
        rows: [
          ["**IGP**", "`i`", "Comando `network` (ou rota vinda de um IGP)", "**Melhor**"],
          ["**EGP**", "`e`", "Herança do protocolo EGP (extinto); usado com `set origin egp`", "Meio"],
          ["**Incomplete**", "`?`", "`redistribute` (a origem é desconhecida)", "**Pior**"],
        ],
      },
      flow: ["i  IGP", "e  EGP", "?  incomplete"],
      points: [
        "Está no critério **5**: depois de Weight, LP, AS-PATH — e **antes** do MED.",
        "Só desempata quando os critérios anteriores **empataram**. Aqui, todos os caminhos de R1 para `150.3.3.0/24` têm AS-PATH `5`.",
        "É um atributo **transitivo**: viaja com a rota. No UPDATE aparece como `Origin (1): IGP | EGP | Incomplete`.",
      ],
    },
    {
      title: "Passo 3 · Mudar o caminho de R1 sem tocar em R1",
      topology: TOPO3("origin"),
      points: [
        "R1 aprende `150.3.3.0/24` por **três caminhos iguais** (R2, R3 e R4, todos com AS-PATH `5`). O FRR usa os três (**multipath**) e o `best` sai por **Router ID** — o menor, **R2**.",
        "Quem muda o Origin é **cada vizinho**, na **saída** (route-map **out**): **R2** manda `incomplete`, **R3** manda `EGP`, e **R4 não é tocado**.",
        "Sobra **um só IGP**: **R4**. O BGP decide **antes** do Router ID — `best (Origin)` — e o multipath se desfaz.",
      ],
      code: "route-map ORIGIN_R1 permit 10\n match ip address prefix-list NET_R3\n set origin incomplete\nroute-map ORIGIN_R1 permit 20\n!\nrouter bgp 65502\n address-family ipv4 unicast\n  neighbor 10.0.0.1 route-map ORIGIN_R1 out",
      note: "Validado neste lab: depois da política, R1 mudou de R2 para R4 e o multipath sumiu.",
    },
    {
      title: "O ORIGIN no fio",
      code: "(R2 → R1, depois da política)\n\t  Origin (1), length: 1, Flags [T]: Incomplete\n\t  AS Path (2), length: 6, Flags [TE]: 5\n\t  Updated routes:\n\t    150.3.3.0/24\n\n(R3 → R1, depois da política)\n\t  Origin (1), length: 1, Flags [T]: EGP\n\t  AS Path (2), length: 6, Flags [TE]: 5\n\t  Updated routes:\n\t    150.3.3.0/24",
      points: [
        "O **Origin** vem **antes** do AS Path no UPDATE — é o primeiro atributo.",
        "Em `show ip bgp 150.3.3.0/24`, R1 passa a ver `Origin incomplete` (via R2), `Origin EGP` (via R3) e `Origin IGP` (via R4).",
        "O FRR confirma o critério: `best (Origin)`.",
      ],
      note: "Saída real do tcpdump em R1 depois da política.",
    },
    {
      title: "Resumo: o que cada ferramenta faz",
      table: {
        head: ["Ferramenta", "Onde configurar", "Quem enxerga", "Para quê"],
        rows: [
          ["**Weight**", "route-map **in**", "**Só** o roteador local", "Preferir uma entrada **neste** roteador"],
          ["**ORIGIN**", "route-map **out** (no vizinho que anuncia)", "**Quem recebe** (e adiante)", "Rebaixar um caminho para **desempatar**"],
          ["**AS-PATH de confederação**", "Automático", "Dentro do AS 5; **some** na saída", "Evitar laços entre sub-ASes"],
        ],
      },
      points: [
        "Se o resultado **não mudou**, olhe **o que diz depois de `best`**: ele mostra **qual critério decidiu**.",
        "Se mudou em **um** roteador e **não** em outro: provavelmente é **Weight** (local).",
      ],
    },
    {
      title: "Roteiro do Lab 3",
      flow: ["Passo 1: confederação e capturas", "Passo 2: Weight em R2 e R3", "Passo 3: ORIGIN em R2 e R3", "Desafio: perguntas"],
      points: [
        "**Passo 1:** reconhecer a **confederação**, ver o **AS-PATH com parênteses** e **capturar** o UPDATE interno × externo em R2.",
        "**Passo 2:** **Weight** em R2 e R3 para preferirem o caminho direto de R1 — primeiro **só em R2**, para ver que R3 não muda.",
        "**Passo 3:** **ORIGIN** nos anúncios de R2 e R3 para R1: R1 muda para um caminho **que não era o preferido**. Com **captura** em R1.",
        "Nos passos 1, 2 e 3 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas o UPDATE com segmento de confederação, o UPDATE para fora com AS 5 e os UPDATEs com Origin Incomplete e EGP.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: explicar **por que R2 e R3 escolhiam a confederação**; mostrar a **confederação no fio**; justificar por que o **Weight de R2 não afetou R3**; e explicar **qual caminho R1 passou a preferir** depois do ORIGIN, e por quê.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Antes de qualquer política, por qual caminho R2 chega a 150.1.1.0/24? E R3? Por que não pelo caminho direto de R1?",
      lookFor: "R2 pela rota de R3 '(65503 65504)' e R3 pela rota de R4 '(65504)': segmento de confederação não conta no comprimento do AS-PATH (comprimento 0 contra 1 do '254') → best (AS Path). R1 e R4 originam o mesmo prefixo.",
    },
    {
      id: "e2",
      prompt: "Mostre na 🔬 captura de R2 o mesmo prefixo em dois UPDATEs. O que difere no AS Path e por quê?",
      lookFor: "R3→R2: 'AS Path ... ( 65503 )' (segmento de confederação, entre parênteses); R2→R1: 'AS Path ... 5'. O sub-AS não vaza: ao sair da confederação o segmento é removido e o AS 5 é acrescentado.",
    },
    {
      id: "e3",
      prompt: "Você configurou Weight {{weightValue}} só em R2. O que aconteceu com R3? Por quê?",
      lookFor: "R2 passa a usar a rota de R1 (best (Weight)); R3 continua pela confederação via R4 (best (AS Path)). Weight é local e não é anunciado a ninguém — precisa ser configurado em cada roteador.",
    },
    {
      id: "e4",
      prompt: "Para que servem a prefix-list e a cláusula 20 da route-map?",
      lookFor: "A prefix-list restringe o set a 150.1.1.0/24 (clause 10); a cláusula 20 sem match deixa passar o resto sem alterar. Sem ela, o deny implícito descartaria as outras rotas do vizinho.",
    },
    {
      id: "e5",
      prompt: "Antes da política de ORIGIN, quantos caminhos R1 tem para 150.3.3.0/24 e qual é o best? Por quê?",
      lookFor: "Três caminhos iguais (R2, R3, R4), AS-PATH '5', Origin IGP — multipath, best (Router ID): o menor, R2 (2.2.2.2). Nada diferencia os caminhos antes do Router ID.",
    },
    {
      id: "e6",
      prompt: "Depois de R2 anunciar 'incomplete' e R3 'egp', qual caminho R1 passou a preferir e por quê? Mostre na captura.",
      lookFor: "R4 (150.1.1.4): único com Origin IGP, best (Origin) — IGP > EGP > incomplete; o multipath some. Captura de R1: UPDATE de 10.0.0.2 com 'Origin ... Incomplete' e de 10.0.0.6 com 'Origin ... EGP' para 150.3.3.0/24. Policy foi route-map out nos vizinhos que anunciam.",
    },
  ],

  autoGrade: [
    { id: "ibgp_up", label: "Verificou as sessões BGP", router: "R1", cmdContains: "show bgp summary", outputContains: "Established" },
    { id: "checked_paths", label: "Observou os caminhos de 150.1.1.0/24 em R2", router: "R2", cmdContains: "show ip bgp 150.1.1.0" },
    { id: "weight_typed", label: "Configurou Weight", cmdContains: "set weight" },
    { id: "lab3_weight_seen", label: "Weight observado na rota de R1", router: "R2", cmdContains: "show ip bgp 150.1.1.0", outputContains: "weight {{weightValue}}" },
    { id: "origin_typed", label: "Configurou ORIGIN", cmdContains: "set origin" },
    { id: "lab3_origin_seen", label: "ORIGIN manipulado observado em R1", router: "R1", cmdContains: "show ip bgp 150.3.3.0", outputPattern: "incomplete|egp|\\?" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_confed_in", label: "Capturou o UPDATE com segmento de confederação (65503)", router: "R2", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: \\( 65503 \\)\\s" + UPD_NT + ROUTES_TO("150\\.3\\.3\\.0/24") },
    { id: "captured_confed_out", label: "Capturou o UPDATE para R1 com AS 5", router: "R2", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 5\\s" + UPD_NT + ROUTES_TO("150\\.3\\.3\\.0/24") },
    { id: "captured_origin_incomplete", label: "Capturou o UPDATE com Origin Incomplete", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[T\\]: Incomplete\\s" + UPD_NT + ROUTES_TO("150\\.3\\.3\\.0/24") },
    { id: "captured_origin_egp", label: "Capturou o UPDATE com Origin EGP", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[T\\]: EGP\\s" + UPD_NT + ROUTES_TO("150\\.3\\.3\\.0/24") },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP de R1 verificadas",
      weight: 4,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    },
    {
      id: "weight_r2_configured",
      label: "Weight {{weightValue}} configurado em R2 para o prefixo de R1",
      weight: 8,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "set weight {{weightValue}}\\s" },
    },
    {
      id: "weight_r3_configured",
      label: "Weight {{weightValue}} configurado em R3 para o prefixo de R1",
      weight: 8,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set weight {{weightValue}}\\s" },
    },
    {
      id: "weight_r2_in",
      label: "Política de Weight aplicada inbound em R2 (vizinho R1, 10.0.0.1)",
      weight: 4,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.0\\.1 route-map \\S+ in" },
    },
    {
      id: "weight_r3_in",
      label: "Política de Weight aplicada inbound em R3 (vizinho R1, 10.0.0.5)",
      weight: 4,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.0\\.5 route-map \\S+ in" },
    },
    {
      id: "r2_uses_r1",
      label: "R2 usa o caminho direto de R1 para 150.1.1.0/24 (best Weight)",
      weight: 8,
      check: { router: "R2", cmdPattern: "show ip bgp 150.1.1.0/24", outputPattern: "254\\s+10\\.0\\.0\\.1 from 10\\.0\\.0\\.1[\\s\\S]*?weight {{weightValue}}, valid, external, best \\(Weight\\)" },
    },
    {
      id: "r3_uses_r1",
      label: "R3 usa o caminho direto de R1 para 150.1.1.0/24 (best Weight)",
      weight: 8,
      check: { router: "R3", cmdPattern: "show ip bgp 150.1.1.0/24", outputPattern: "254\\s+10\\.0\\.0\\.5 from 10\\.0\\.0\\.5[\\s\\S]*?weight {{weightValue}}, valid, external, best \\(Weight\\)" },
    },
    {
      id: "origin_incomplete_configured",
      label: "R2 anuncia 150.3.3.0/24 a R1 com ORIGIN incomplete",
      weight: 6,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "set origin incomplete" },
    },
    {
      id: "origin_egp_configured",
      label: "R3 anuncia 150.3.3.0/24 a R1 com ORIGIN egp",
      weight: 6,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set origin egp" },
    },
    {
      id: "origin_r2_out",
      label: "Política de ORIGIN aplicada outbound em R2 (vizinho R1)",
      weight: 3,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.0\\.1 route-map \\S+ out" },
    },
    {
      id: "origin_r3_out",
      label: "Política de ORIGIN aplicada outbound em R3 (vizinho R1)",
      weight: 3,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.0\\.5 route-map \\S+ out" },
    },
    {
      id: "r1_prefers_igp_origin",
      label: "R1 prefere o caminho via R4 (o único com ORIGIN IGP) para 150.3.3.0/24",
      weight: 12,
      check: { router: "R1", cmdPattern: "show ip bgp 150.3.3.0/24", outputPattern: "150\\.1\\.1\\.4 from 150\\.1\\.1\\.4[\\s\\S]*?Origin IGP[\\s\\S]*?best \\(Origin\\)" },
    },
    {
      id: "capture_confed_in",
      label: "Capturou em R2 o UPDATE de 150.3.3.0/24 com o segmento de confederação ( 65503 )",
      weight: 8,
      check: { type: "capture", router: "R2", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: \\( 65503 \\)\\s" + UPD_NT + ROUTES_TO("150\\.3\\.3\\.0/24") },
    },
    {
      id: "capture_confed_out",
      label: "Capturou em R2 o UPDATE de 150.3.3.0/24 para fora com AS Path 5",
      weight: 6,
      check: { type: "capture", router: "R2", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 5\\s" + UPD_NT + ROUTES_TO("150\\.3\\.3\\.0/24") },
    },
    {
      id: "capture_origin_incomplete",
      label: "Capturou em R1 o UPDATE de 150.3.3.0/24 com Origin Incomplete",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[T\\]: Incomplete\\s" + UPD_NT + ROUTES_TO("150\\.3\\.3\\.0/24") },
    },
    {
      id: "capture_origin_egp",
      label: "Capturou em R1 o UPDATE de 150.3.3.0/24 com Origin EGP",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[T\\]: EGP\\s" + UPD_NT + ROUTES_TO("150\\.3\\.3\\.0/24") },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["confedera", "r4", "r3", "mais curto", "as-path", "as path", "segmento"],
      anyOf: true,
      points: 6,
      hint: "Pela confederação: o segmento de confederação não conta no comprimento do AS-PATH, então o caminho interno (comprimento 0) vence o direto de R1 (comprimento 1).",
    },
    predict_weight_scope: {
      type: "keywords",
      required: ["não", "nao", "local", "só r2", "so r2", "continua", "mantém", "mantem"],
      anyOf: true,
      points: 6,
      hint: "Weight é local ao roteador onde foi configurado — nunca é anunciado a nenhum vizinho, nem dentro da própria confederação. R3 continua pela rota de R4.",
    },
    predict_origin_winner: {
      type: "keywords",
      required: ["r4", "igp", "150.1.1.4", "único", "unico"],
      anyOf: true,
      points: 8,
      hint: "R2 passa a anunciar incomplete e R3 EGP: o único caminho que continua IGP é o de R4. IGP > EGP > incomplete, então R1 passa a preferir R4 — antes do desempate por Router ID.",
    },
    q1: { type: "radio", correct: "Ele é local ao roteador e vence antes de Local Preference e AS-PATH", points: 10 },
    q2: { type: "radio", correct: "Inbound, no roteador que deve preferir a rota recebida de R1", points: 8 },
    q3: { type: "radio", correct: "IGP é preferido sobre EGP, e EGP é preferido sobre incomplete", points: 8 },
    q4: { type: "radio", correct: "No anúncio de saída para R1, usando route-map out", points: 8 },
    q5: { type: "radio", correct: "Os sub-ASes internos aparecem como parte da confederação, mas o AS externo enxerga apenas o AS confederado 5", points: 12 },
    q6: { type: "radio", correct: "Porque a prefix-list limita a política somente ao prefixo desejado", points: 8 },
    q7: { type: "radio", correct: "O segmento de confederação não conta no comprimento do AS-PATH: (65503 65504) vale 0 contra 1 do caminho direto de R1", points: 12 },
    q8: { type: "radio", correct: "R4, o único caminho que continuou com ORIGIN IGP: R2 (incomplete) e R3 (EGP) foram rebaixados", points: 14 },
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
 bgp bestpath compare-routerid
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


  steps: [
    {
      id: 1,
      title: "Reconhecer a confederação e as duas origens",
      theory: `Uma confederação BGP divide um AS grande em sub-ASes internos. Para o mundo externo, todos continuam parecendo um único AS.

Neste lab, R2, R3 e R4 formam o AS confederado 5 (sub-ASes 65502, 65503 e 65504). R1 está fora, no AS 254: para ele, os três vizinhos do outro lado são o AS 5.

Dentro da confederação o AS-PATH carrega um segmento entre parênteses, como (65503 65504). Esse segmento não conta no comprimento do caminho, e é removido quando a rota sai do AS 5.`,
      description: `Abra a captura em R2, interface 'todas', protocolo BGP. Depois verifique as sessões e responda a previsão antes de olhar 150.1.1.0/24 (R1 e R4 anunciam esse prefixo) em R2 e em R3.

Para ver a confederação no fio, reinicie as sessões de R2 com a captura rodando:
  clear bgp *

Na captura de R2, procure o prefixo 150.3.3.0/24 em dois UPDATEs: um vindo de R3 e outro enviado a R1. Compare o 'AS Path' de cada um.`,
      capture: { router: "R2", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "R1 vê os três vizinhos no AS 5" },
        { cmd: "show bgp summary", router: "R2", desc: "R2: R1 externo e R3 como confederação" },
        { cmd: "show running-config", router: "R3", desc: "Confirme bgp confederation identifier/peers" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R2", desc: "Qual caminho é o best? Que AS-PATH tem? O que diz depois de best?" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "E em R3?" },
        { cmd: "clear bgp *", router: "R2", desc: "Reinicia as sessões de R2 (gera os UPDATEs na captura)" },
      ],
      expected: "R1 mostra três vizinhos no AS 5. Em R2, 150.1.1.0/24 tem best via 10.0.0.10 (R3), AS-PATH '(65503 65504)', confed-external, best (AS Path); o caminho direto de R1 ('254') é o segundo. Em R3, best via 10.0.0.14 (R4), AS-PATH '(65504)'. Na captura de R2: UPDATE de R3 com 'AS Path ... ( 65503 )' e UPDATE para R1 com 'AS Path ... 5', ambos para 150.3.3.0/24.",
      predict: {
        id: "predict_step1",
        prompt: "R1 e R4 anunciam 150.1.1.0/24. R2 e R3 têm o caminho direto de R1 (AS-PATH '254', comprimento 1) e o caminho pela confederação. Qual você espera que eles escolham, sem política nenhuma? Por quê?",
      },
    },
    {
      id: 2,
      title: "Weight: R2 e R3 preferem o caminho de R1",
      theory: `Weight é um atributo local ao roteador: não é anunciado a vizinhos. O caminho com maior Weight vence antes de Local Preference, AS-PATH, ORIGIN e MED.

Como é local, configurar em R2 não muda a decisão de R3. Por isso a mesma política precisa ser feita nos dois. Para afetar só o prefixo pedido, use uma prefix-list no match; a cláusula 20, sem match, deixa passar o resto sem alterar (sem ela, o deny implícito descartaria as outras rotas).`,
      description: `Responda a previsão e configure PRIMEIRO só o R2:
  configure terminal
  ip prefix-list NET_R1 seq 10 permit 150.1.1.0/24
  route-map WEIGHT_R1 permit 10
   match ip address prefix-list NET_R1
   set weight {{weightValue}}
  route-map WEIGHT_R1 permit 20
  exit
  router bgp 65502
   address-family ipv4 unicast
    neighbor 10.0.0.1 route-map WEIGHT_R1 in
  end
  clear bgp * soft in

Olhe R2 e R3 para 150.1.1.0/24. Depois faça o mesmo em R3 (router bgp 65503, vizinho 10.0.0.5) e olhe de novo.`,
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme prefix-list, route-map e route-map inbound" },
        { cmd: "clear bgp * soft in", router: "R2", desc: "Reaplica a política em R2" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R2", desc: "R2 mudou? weight {{weightValue}}?" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "R3 mudou só porque R2 mudou?" },
        { cmd: "show running-config", router: "R3", desc: "Depois de configurar R3: confirme a mesma política" },
        { cmd: "clear bgp * soft in", router: "R3", desc: "Reaplica a política em R3" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "Agora R3 usa R1?" },
      ],
      expected: "Só com R2 configurado: R2 passa a usar a rota de R1 (10.0.0.1, AS-PATH '254', weight {{weightValue}}, best (Weight)); R3 continua pela rota de R4, best (AS Path). Depois de configurar R3: R3 também usa R1 (10.0.0.5, weight {{weightValue}}, best (Weight)). O Weight não é anunciado a ninguém.",
      predict: {
        id: "predict_weight_scope",
        prompt: "Se você configurar Weight só em R2 (não em R3), você espera que R3 também mude sua decisão de melhor caminho? Por quê?",
      },
    },
    {
      id: 3,
      title: "ORIGIN: mudar o caminho de R1 sem tocar em R1",
      theory: `ORIGIN indica como uma rota entrou no BGP: IGP (i) > EGP (e) > incomplete (?). Fica no critério 5: só desempata quando Weight, Local Preference e AS-PATH empatam.

R1 recebe 150.3.3.0/24 por três caminhos iguais (R2, R3 e R4, todos com AS-PATH 5): o FRR usa os três (multipath) e o best sai por Router ID, o menor — R2. Para mudar isso sem mexer em R1, cada vizinho reescreve o Origin do seu anúncio com uma route-map out.`,
      description: `Responda a previsão. Depois rebaixe o ORIGIN de 150.3.3.0/24 nos anúncios de R2 e R3 para R1 (R4 não é tocado):

Em R2 (anuncia 'incomplete'):
  configure terminal
  ip prefix-list NET_R3 seq 10 permit 150.3.3.0/24
  route-map ORIGIN_R1 permit 10
   match ip address prefix-list NET_R3
   set origin incomplete
  route-map ORIGIN_R1 permit 20
  exit
  router bgp 65502
   address-family ipv4 unicast
    neighbor 10.0.0.1 route-map ORIGIN_R1 out
  end
  clear bgp * soft out

Em R3, o mesmo com 'set origin egp', 'router bgp 65503' e o vizinho 10.0.0.5.

Antes de configurar, abra a captura em R1 (interface 'todas', BGP) e olhe 'show ip bgp 150.3.3.0/24' em R1 para anotar o best e quantos caminhos estão em uso. Depois da política, compare — e procure na captura os UPDATEs com 'Origin ... Incomplete' e 'Origin ... EGP'.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show ip bgp 150.3.3.0/24", router: "R1", desc: "ANTES: três caminhos, best (Router ID)" },
        { cmd: "show running-config", router: "R2", desc: "Confirme set origin incomplete e a route-map out" },
        { cmd: "show running-config", router: "R3", desc: "Confirme set origin egp e a route-map out" },
        { cmd: "clear bgp * soft out", router: "R2", desc: "Reenvia os anúncios de R2" },
        { cmd: "clear bgp * soft out", router: "R3", desc: "Reenvia os anúncios de R3" },
        { cmd: "show ip bgp 150.3.3.0/24", router: "R1", desc: "DEPOIS: Origin de cada caminho e o novo best" },
        { cmd: "show ip bgp", router: "R1", desc: "Os outros prefixos continuaram como estavam?" },
      ],
      expected: "ANTES: três caminhos (via 10.0.0.2, 10.0.0.6 e 150.1.1.4), todos 'Origin IGP', best (Router ID) via R2, multipath. DEPOIS: via R2 'Origin incomplete', via R3 'Origin EGP' e via R4 (150.1.1.4) 'Origin IGP' — o best passa a ser R4, best (Origin), e só ele é usado. Os outros prefixos não mudam (a prefix-list limita a política a 150.3.3.0/24). Na captura de R1: UPDATE de 10.0.0.2 com 'Origin (1) ... Incomplete' e de 10.0.0.6 com 'Origin (1) ... EGP'.",
      predict: {
        id: "predict_origin_winner",
        prompt: "R2 passará a anunciar 150.3.3.0/24 a R1 como 'incomplete' e R3 como 'egp'; R4 não será alterado (IGP). Qual caminho você espera que R1 prefira? Por quê?",
      },
    },
  ],

  challenge: {
    title: "Desafio: controlar caminhos sem mexer no roteador de destino",
    description: `Estado final esperado das políticas do lab:

1. R2 e R3 usam a rota 150.1.1.0/24 recebida diretamente de R1 (Weight {{weightValue}}).
2. R1 prefere o caminho via R4 para 150.3.3.0/24 (ORIGIN rebaixado em R2 e R3).
3. As políticas afetam somente os prefixos pedidos, por prefix-list.

Responda às perguntas, baseadas no que você viu nas saídas e nas capturas.`,
    hints: [
      "Weight é local ao roteador; precisa ser configurado em cada roteador que deve mudar sua decisão.",
      "Para alterar atributos recebidos, aplique route-map inbound.",
      "Para alterar atributos anunciados a um vizinho, aplique route-map outbound.",
      "Segmentos de confederação não contam no comprimento do AS-PATH.",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Por que Weight é eficaz para fazer R2 ou R3 preferirem a rota recebida de R1?",
        options: [
          "Ele é anunciado para todos os vizinhos e altera a decisão global",
          "Ele é local ao roteador e vence antes de Local Preference e AS-PATH",
          "Ele só funciona em rotas OSPF redistribuídas",
          "Ele remove automaticamente caminhos alternativos da tabela BGP",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Em qual direção a route-map de Weight deve ser aplicada?",
        options: [
          "Outbound, no roteador que originou o prefixo",
          "Outbound em todos os vizinhos da confederação",
          "Inbound, no roteador que deve preferir a rota recebida de R1",
          "Inbound apenas no roteador R1",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Qual é a ordem correta de preferência do atributo ORIGIN?",
        options: [
          "Incomplete é preferido sobre EGP, e EGP é preferido sobre IGP",
          "EGP é sempre preferido sobre todos os outros",
          "ORIGIN nunca participa da seleção de melhor caminho",
          "IGP é preferido sobre EGP, e EGP é preferido sobre incomplete",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Onde a política de ORIGIN deve ser aplicada para alterar o que R1 recebe?",
        options: [
          "No R1, usando route-map out",
          "No anúncio de saída para R1, usando route-map out",
          "No R2, usando route-map in para R3",
          "Somente dentro de router ospf",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual é a ideia da confederação neste lab?",
        options: [
          "Todos os roteadores passam a usar o mesmo Router-ID",
          "A confederação remove a necessidade de sessões BGP",
          "Os sub-ASes internos aparecem como parte da confederação, mas o AS externo enxerga apenas o AS confederado 5",
          "O AS externo passa a enxergar todos os sub-ASes como ASNs públicos independentes",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Por que usamos prefix-list antes da route-map?",
        options: [
          "Porque route-map não funciona em BGP sem OSPF",
          "Porque prefix-list derruba sessões BGP antigas",
          "Porque a prefix-list limita a política somente ao prefixo desejado",
          "Porque prefix-list altera automaticamente o AS-PATH",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "Sem política, por que R2 escolhia o caminho pela confederação e não o direto de R1 para 150.1.1.0/24?",
        options: [
          "Porque o Router ID de R3 é menor que o de R1",
          "O segmento de confederação não conta no comprimento do AS-PATH: (65503 65504) vale 0 contra 1 do caminho direto de R1",
          "Porque sessões confed-eBGP têm Weight maior por padrão",
          "Porque R1 e R4 anunciam o mesmo prefixo e R2 prefere sempre R4",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "Depois de R2 anunciar 150.3.3.0/24 como incomplete e R3 como EGP, qual caminho R1 passou a preferir e por quê?",
        options: [
          "R2, porque tem o menor Router ID",
          "R3, porque é o caminho direto e mais curto",
          "R4, o único caminho que continuou com ORIGIN IGP: R2 (incomplete) e R3 (EGP) foram rebaixados",
          "Nenhum: R1 continua usando os três caminhos",
        ],
      },
    ],
  },
};
