/**
 * Lab 5 — BGP Nível 4: AS-PATH Ignore e Aggregate Address
 * Topic: Decisão de caminho e Agregação
 * Difficulty: Intermediário
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - R1 alcança 172.16.4.0/24 por R3 ("3 4") e por R2 ("2 3 4"); sem política
 *    escolhe R3, best (AS Path). Com prepend em R3 (só desse prefixo) R1
 *    passa a R2, best (AS Path);
 *  - `bgp bestpath as-path ignore` em R1 volta a escolher R3 — mas só se o
 *    desempate for por Router ID. Sem `bgp bestpath compare-routerid` o
 *    FRR fica com o caminho MAIS ANTIGO ("Older Path") e nada muda; o lab
 *    antigo afirmava que R1 voltava a R3 sem dizer por quê. R1 agora sobe
 *    com compare-routerid (3.3.3.3 < 22.22.22.22, R3 ganha);
 *  - `aggregate-address 172.16.0.0/16 summary-only` suprime TODAS as /24
 *    que R3 conhece (as de R1, R2 e R4, não só as suas) para todos os
 *    vizinhos: R1 perde 172.16.3.0/24 e 172.16.4.0/24 (continua com a /24
 *    de R2, que R2 anuncia direto) e alcança os hosts pela /16;
 *  - o UPDATE do agregado leva 'Atomic Aggregate' e 'Aggregator AS #3,
 *    origin 3.3.3.3' e vem junto com 'Withdrawn routes' das específicas;
 *  - o prepend do lab antigo valia para TODOS os prefixos de R3 para R1;
 *    agora é limitado a 172.16.4.0/24 por prefix-list (como no Lab 3).
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";
// Lista de prefixos de 'Updated routes:'/'Withdrawn routes:' até o prefixo procurado
const PFX_LIST = "(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?";
const ROUTES_TO = (pfx) => "Updated routes:" + PFX_LIST + "\\s+" + pfx;
const WITHDRAWN = (pfx) => "Withdrawn routes:" + PFX_LIST + "\\s+" + pfx;

// Diagramas dos slides (desenhados no frontend, ver SlideTopology.jsx). Variantes: "tour" (a rede), "caminhos"
// (como R1 chega a 172.16.4.0/24), "prepend", "ignore" e "agg" (agregado). Os sufixos _a/_b partem os passos de
// "agg" em duas etapas. Nos slides públicos não há variáveis: o prepend aparece como "3 3 3 4".
function TOPO5(variantFull) {
  const [variant, part] = variantFull.split("_");
  const YEL = "#fbbf24", GRN = "#4ade80", RED = "#f87171", CY = "#67e8f9";
  const nodes = [
    { id: "R1", x: 90, y: 215, label: "R1", sub: "AS 1" },
    { id: "R2", x: 330, y: 65, label: "R2", sub: "AS 2" },
    { id: "R3", x: 330, y: 365, label: "R3", sub: "AS 3" },
    { id: "R4", x: 640, y: 365, label: "R4", sub: "AS 4" },
  ];
  const links = [
    { id: "R1-R2", a: "R1", b: "R2", kind: "ebgp", label: "eBGP" },
    { id: "R1-R3", a: "R1", b: "R3", kind: "ebgp", label: "eBGP" },
    { id: "R2-R3", a: "R2", b: "R3", kind: "ebgp", label: "eBGP" },
    { id: "R3-R4", a: "R3", b: "R4", kind: "ebgp", label: "eBGP" },
  ];
  const badges = [
    { x: 90, y: 275, text: "172.16.1.0/24", color: YEL },
    { x: 520, y: 65, text: "172.16.2.0/24", color: YEL },
    { x: 330, y: 425, text: "172.16.3.0/24", color: YEL },
    { x: 640, y: 425, text: "172.16.4.0/24", color: YEL },
  ];
  const out = { w: 780, h: 450, nodes, links, badges };

  if (variant === "tour") {
    out.steps = [
      { caption: "R1 (AS 1) tem a sua rede, 172.16.1.0/24, e fala eBGP com R2 e com R3. É o roteador onde você vai ver as decisões.", hl: ["R1"] },
      { caption: "R2 (AS 2) tem 172.16.2.0/24 e é o caminho INDIRETO de R1 até R3 e R4.", hl: ["R2"] },
      { caption: "R3 (AS 3) tem 172.16.3.0/24 e fica no MEIO: aprende de todo mundo. Quase toda a configuração do lab é em R3.", hl: ["R3"] },
      { caption: "R4 (AS 4) é o fim da linha: origina 172.16.4.0/24 e só fala com R3.", hl: ["R4"] },
    ];
  } else if (variant === "caminhos") {
    out.steps = [
      { caption: "R4 anuncia a sua rede, 172.16.4.0/24, a R3: AS-PATH 4.", hl: ["R4"],
        packets: [{ link: "R3-R4", dir: "b>a", label: "AS-PATH 4", color: YEL }] },
      { caption: "R3 repassa a R1 e a R2, acrescentando o seu AS: AS-PATH 3 4.", hl: ["R3"],
        packets: [{ link: "R1-R3", dir: "b>a", label: "AS-PATH 3 4", color: CY }, { link: "R2-R3", dir: "b>a", label: "AS-PATH 3 4", color: CY }] },
      { caption: "R2 repassa a R1, acrescentando o AS 2: AS-PATH 2 3 4. Agora R1 tem DOIS caminhos para 172.16.4.0/24.", hl: ["R2", "R1"],
        packets: [{ link: "R1-R2", dir: "b>a", label: "AS-PATH 2 3 4", color: GRN }] },
      { caption: "R1 conta os saltos: 3 4 tem comprimento 2; 2 3 4 tem comprimento 3. O mais curto vence — best (AS Path), pelo caminho direto de R3.", hl: ["R1"],
        badges: [{ x: 90, y: 320, text: "2 saltos < 3 saltos", color: GRN }],
        links: { "R1-R3": { kind: "best", arrow: "b>a", label: "best (AS Path)", flow: "b>a" }, "R1-R2": { kind: "dim", label: "perde" } } },
    ];
  } else if (variant === "prepend") {
    out.steps = [
      { caption: "R3 aplica uma route-map de SAÍDA para R1, só para 172.16.4.0/24: ele repete o AS 3 no caminho (prepend).", hl: ["R3"],
        badges: [{ x: 520, y: 320, text: "route-map PREPEND_TO_R1 out", color: YEL }],
        packets: [{ link: "R1-R3", dir: "b>a", label: "AS-PATH 3 3 3 4", color: RED }] },
      { caption: "R1 recalcula: o caminho direto agora tem comprimento 4 (3 3 3 4); o de R2 continua com 3 (2 3 4). R1 TROCA para R2.", hl: ["R1"],
        badges: [{ x: 90, y: 320, text: "4 saltos > 3 saltos", color: RED }],
        links: { "R1-R2": { kind: "best", arrow: "b>a", label: "best (AS Path)", flow: "b>a" }, "R1-R3": { kind: "dim", label: "3 3 3 4" } } },
      { caption: "A prefix-list limita o efeito a UM prefixo: 172.16.3.0/24, de R3, continua com AS-PATH 3 (a cláusula 20, sem match, deixa o resto passar).", hl: ["R3"],
        badges: [{ x: 90, y: 320, text: "172.16.4.0/24 → R2", color: YEL }],
        packets: [{ link: "R1-R3", dir: "b>a", label: "172.16.3.0/24 · AS-PATH 3", color: GRN }],
        links: { "R1-R2": { kind: "best" }, "R1-R3": { kind: "ebgp", label: "eBGP" } } },
    ];
  } else if (variant === "ignore") {
    out.steps = [
      { caption: "Ponto de partida: por causa do prepend, R1 usa R2 (2 3 4, comprimento 3) e deixa o direto (3 3 3 4, comprimento 4) de lado.", hl: ["R1"],
        links: { "R1-R2": { kind: "best", arrow: "b>a", label: "best (AS Path)" }, "R1-R3": { kind: "dim", label: "3 3 3 4" } } },
      { caption: "Você configura em R1: bgp bestpath as-path ignore. R1 PARA de contar o tamanho do AS-PATH. É só dele: nenhum vizinho fica sabendo.", hl: ["R1"],
        badges: [{ x: 90, y: 320, text: "R1: as-path ignore", color: YEL }],
        links: { "R1-R2": { kind: "ebgp", label: "2 3 4" }, "R1-R3": { kind: "ebgp", label: "3 3 3 4" } } },
      { caption: "Sem o tamanho, os dois caminhos EMPATAM. O BGP desce a lista até o Router ID: R3 (3.3.3.3) vence R2 (22.22.22.22). R1 VOLTA a R3 — o prepend foi anulado.", hl: ["R1", "R3"],
        badges: [{ x: 90, y: 320, text: "R1: as-path ignore", color: YEL }, { x: 520, y: 405, text: "Router ID 3.3.3.3", color: GRN }, { x: 520, y: 105, text: "Router ID 22.22.22.22", color: RED }],
        links: { "R1-R3": { kind: "best", arrow: "b>a", label: "best (Router ID)", flow: "b>a" }, "R1-R2": { kind: "dim", label: "perde" } } },
    ];
  } else if (variant === "agg") {
    out.steps = [
      { caption: "R3 conhece QUATRO redes /24 dentro de 172.16.0.0/16: a sua, as de R1 e R2 (aprendidas) e a de R4.", hl: ["R3"],
        badges: [{ x: 520, y: 300, text: "R3 conhece 172.16.1–4.0/24", color: YEL }] },
      { caption: "Você cria aggregate-address 172.16.0.0/16 SEM summary-only: R3 anuncia o /16 E continua anunciando os /24. A tabela de R1 só cresce.", hl: ["R3", "R1"],
        badges: [{ x: 520, y: 300, text: "aggregate-address 172.16.0.0/16", color: YEL }, { x: 90, y: 320, text: "R1 vê: /16 + os /24", color: CY }],
        packets: [{ link: "R1-R3", dir: "b>a", label: "/16 + todos os /24", color: CY }] },
      { caption: "Agora COM summary-only: primeiro R3 RETIRA (withdrawn) os /24 que o agregado cobre — as de R3 e de R4.", hl: ["R3"],
        badges: [{ x: 520, y: 300, text: "summary-only", color: YEL }],
        packets: [{ link: "R1-R3", dir: "b>a", label: "Withdrawn: .3 e .4", color: RED }] },
      { caption: "Depois anuncia só o /16: AS-PATH 3, com Atomic Aggregate e Aggregator (quem agregou). Os ASes 1, 2 e 4 não aparecem mais.", hl: ["R3"],
        badges: [{ x: 520, y: 300, text: "/24 suprimidas (s)", color: RED }],
        packets: [{ link: "R1-R3", dir: "b>a", label: "172.16.0.0/16 · AS-PATH 3", color: CY }] },
      { caption: "Resultado em R1: a /16 (de R3), a sua .1 e a .2 de R2 (R2 a anuncia direto). As .3 e .4 SUMIRAM — mas R1 ainda alcança 172.16.4.4 pela /16.", hl: ["R1"],
        badges: [{ x: 90, y: 320, text: "R1: /16 + .1 + .2", color: GRN }],
        links: { "R1-R3": { kind: "best", arrow: "b>a", label: "usa a /16", flow: "b>a" } } },
    ];
  }
  if (part && out.steps) out.steps = part === "a" ? out.steps.slice(0, 2) : out.steps.slice(2);
  return out;
}

const lab = {
  id: 5,
  protocol: "bgp",
  level: 4,
  scenario: "Sua empresa possui vários blocos de IP pequenos e contíguos (ex.: vários /24 vizinhos) e quer anunciar um único prefixo agregado para a internet, reduzindo o tamanho da tabela de rotas global e simplificando políticas de quem recebe o anúncio. Em paralelo, times de engenharia de tráfego às vezes precisam ignorar o comprimento do AS-PATH na decisão de melhor caminho — e descobrem que isso pode desfazer, sem aviso, um AS-Path Prepend que outro time configurou. Você vai ver os dois efeitos no fio: o prepend sendo anulado e o agregado escondendo as rotas específicas.",
  title: "Bestpath AS-PATH Ignore e Aggregate Address",
  topic: "Decisão de caminho e Agregação",
  difficulty: "Intermediário",
  duration: "60 min",
  enabled: true,
  resourceProfile: "leve",
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R1", "eth2", "R3", "eth1"],
    ["R2", "eth2", "R3", "eth2"],
    ["R3", "eth3", "R4", "eth1"],
  ],

  variables: {
    // "3 3" já basta: o caminho via R3 vira "3 3 3 4" (4) contra "2 3 4" (3)
    prependArg: { pool: ["3 3", "3 3 3", "3 3 3 3"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=5). Inline: `código` e **negrito**. A teoria segue a ORDEM do
  // roteiro: cada "Passo N" diz o que fazer, o que ver e por quê. Os diagramas
  // animados (topology) usam valores genéricos (prepend "3 3 3 4"): o slide
  // público não tem sessão — o valor exato do seu lab aparece no passo.
  theorySlides: [
    {
      title: "BGP — AS-PATH Ignore e Agregação",
      subtitle: "O que você vai construir no Lab 5, passo a passo",
      points: [
        "🧭 Ver **por que** R1 escolhe um caminho (o AS-PATH mais curto)",
        "🎭 **Disfarçar** um caminho com **prepend** — e ver R1 trocar de rota",
        "🙈 **Desfazer** o prepend com `as-path ignore` — e descobrir quem desempata",
        "📦 **Agregar** vários /24 em um /16 e ver o que **some** na tabela de R1",
      ],
      note: "Estes slides seguem a **ordem do roteiro**: cada passo mostra **o que digitar, o que ver e por quê**. Os diagramas têm **Passo →** e **▶ Reproduzir**; antes de avançar, tente prever o que vem.",
    },
    {
      title: "Ponto de partida: o que já vem pronto",
      topology: TOPO5("tour"),
      points: [
        "✅ **Já configurado:** 4 roteadores, 4 ASes, sessões eBGP **R1–R2**, **R1–R3**, **R2–R3** e **R3–R4**; cada um anuncia a sua rede `172.16.N.0/24`.",
        "🔨 **Falta você fazer:** o **prepend** em R3, o **`as-path ignore`** em R1 e o **agregado** em R3.",
        "Quase tudo é em **R3** (o do meio). **R1** é onde você **observa** as decisões — e onde roda a captura.",
      ],
    },
    {
      title: "O roteiro em um olhar",
      flow: ["1 Reconhecer", "2 Prepend", "3 AS-PATH ignore", "4 Agregado", "Desafio"],
      table: {
        head: ["Passo", "Onde", "Você faz", "Você prova"],
        rows: [
          ["**1**", "R1 (olhar)", "só `show ip bgp 172.16.4.0/24`", "R1 tem **2 caminhos**; vence o **mais curto** (`3 4`)"],
          ["**2**", "R3", "`route-map` com `set as-path prepend`", "R1 **troca para R2** — `best (AS Path)`"],
          ["**3**", "R1", "`bgp bestpath as-path ignore`", "R1 **volta a R3** — `best (Router ID)`"],
          ["**4**", "R3", "`aggregate-address … summary-only`", "R1 **perde** `.3` e `.4`; só a `/16`"],
        ],
      },
      note: "📡 Abra a captura em **R1** (interface *todas*, protocolo *BGP*) no **Passo 1** e **deixe rodando até o Passo 4**: a nota confere as suas capturas.",
    },
    {
      title: "Passo 1 — Reconhecer os dois caminhos",
      topology: TOPO5("caminhos"),
      points: [
        "🎯 **Objetivo:** entender, **antes de mexer em nada**, por que R1 escolhe o caminho que escolhe.",
        "👀 **Você vê:** em R1, `show ip bgp 172.16.4.0/24` com **dois caminhos** — `3 4` (via R3) e `2 3 4` (via R2) — e o `best (AS Path)` no direto.",
        "🧠 **Por quê:** cada AS que repassa a rota **acrescenta o seu número** ao AS-PATH. Com o resto igual, o BGP prefere o **mais curto**.",
      ],
      code: "! em R1 (só observar)\nshow bgp summary\nshow ip bgp 172.16.4.0/24",
      note: "🤔 Antes de dar **Passo →**: qual dos dois caminhos R1 vai preferir? Por quê?",
    },
    {
      title: "Passo 2 — Prepend, só de um prefixo",
      topology: TOPO5("prepend"),
      flow: ["prefix-list NET_R4", "→ route-map (match)", "→ set as-path prepend", "→ cláusula 20: libera o resto", "→ out para R1", "clear bgp * soft out"],
      points: [
        "🎯 **Objetivo:** fazer R1 **abandonar** o caminho de R3 **só para `172.16.4.0/24`**, tornando-o artificialmente mais longo.",
        "⌨️ **Você digita (R3):** prefix-list + route-map com `set as-path prepend`, aplicada **outbound** ao vizinho R1 (`10.0.13.5`). O valor do prepend está no passo.",
        "👀 **Você vê:** em R1, o caminho de R3 como `3 3 3 4` e o best **trocando para R2**; na captura, o UPDATE de R3 com o `3` repetido.",
        "🧠 **Por quê:** quem muda o **anúncio** (prepend) influencia **quem recebe**. A prefix-list evita atingir os outros prefixos.",
      ],
      code: "! em R3\nip prefix-list NET_R4 seq 10 permit 172.16.4.0/24\nroute-map PREPEND_TO_R1 permit 10\n match ip address prefix-list NET_R4\n set as-path prepend 3 3        ! valor do seu passo\nroute-map PREPEND_TO_R1 permit 20\nexit\nrouter bgp 3\n address-family ipv4 unicast\n  neighbor 10.0.13.5 route-map PREPEND_TO_R1 out\nend\nclear bgp * soft out",
      note: "🤔 Antes de dar **Passo →**: com o caminho de R3 mais longo, R1 continua nele ou troca?",
    },
    {
      title: "O que procurar no tcpdump (Passo 2)",
      code: "10.0.13.6.41258 > 10.0.13.5.179: BGP\n\tUpdate Message (2)\n\t  Origin (1), length: 1, Flags [T]: IGP\n\t  AS Path (2), length: 18, Flags [TE]: 3 3 3 4\n\t  Next Hop (3), length: 4, Flags [T]: 10.0.13.6\n\t  Updated routes:\n\t    172.16.4.0/24",
      points: [
        "É o UPDATE de **R3 para R1** (`10.0.13.6 > 10.0.13.5`): o `AS Path` mostra o **`3` repetido** e o **`4`** da origem.",
        "O **AS-PATH cresce no anúncio**: quem decide é R1, que vê um caminho mais longo.",
      ],
      note: "Saída real do tcpdump em R1 (com prepend 3 3). A nota confere **o seu** valor de prepend nessa captura.",
    },
    {
      title: "Antes do Passo 3: e se o tamanho não contar?",
      flow: ["1 Weight", "2 Local Pref", "3 Rota local", "4 AS-PATH (mais curto) ← o que o prepend usa", "5 Origin", "6 MED", "7 eBGP > iBGP", "8 IGP", "9 Router ID"],
      points: [
        "O prepend funciona **só** porque o critério **4** (AS-PATH mais curto) existe. Quem **desliga** esse critério **anula** o prepend.",
        "`bgp bestpath as-path ignore` faz exatamente isso, **no roteador onde é digitado**. Ninguém mais fica sabendo.",
        "Sem o critério 4, os caminhos de R1 empatam em tudo e a decisão **desce a lista** até o **9: Router ID**.",
      ],
      note: "⚠️ Um ajuste **local** de um time pode **desfazer** o prepend que **outro** time montou.",
    },
    {
      title: "Passo 3 — Ignorar o tamanho do AS-PATH",
      topology: TOPO5("ignore"),
      table: {
        head: ["Critério (depois do AS-PATH)", "O que o FRR escreve"],
        rows: [
          ["5. Origin", "`best (Origin)`"],
          ["6. MED", "`best (MED)`"],
          ["7. eBGP sobre iBGP", "`best (Peer Type)`"],
          ["8. Métrica IGP até o next-hop", "`best (IGP Metric)`"],
          ["9. **Caminho mais antigo** (padrão do FRR)", "`best (Older Path)`"],
          ["9'. **Menor Router ID** (com `compare-routerid`)", "`best (Router ID)`"],
        ],
      },
      points: [
        "🎯 **Objetivo:** anular o prepend **sem tocar em R3**: só em **R1**.",
        "⌨️ **Você digita (R1):** `bgp bestpath as-path ignore` e `clear bgp * soft`. Compare o best **antes e depois**.",
        "👀 **Você vê:** R1 **voltando a R3**, agora com **`best (Router ID)`**: `3.3.3.3` vence `22.22.22.22`.",
        "🧠 **Por quê:** o R1 deste lab já tem `bgp bestpath compare-routerid`. **Sem ele**, o FRR ficaria com o caminho **mais antigo** (`Older Path`) e **nada mudaria**.",
      ],
      code: "! em R1\nrouter bgp 1\n bgp bestpath as-path ignore\nend\nclear bgp * soft",
      note: "🤔 Antes de dar **Passo →**: com o tamanho ignorado, o que desempata os dois caminhos?",
    },
    {
      title: "Agregação: resumir vários /24 em um /16",
      points: [
        "Um provedor com muitas redes vizinhas (`172.16.1.0/24`, `.2`, `.3`, `.4`) pode anunciar **um resumo**: `172.16.0.0/16`. Menos rotas na tabela de **todo mundo**.",
        "É o `aggregate-address 172.16.0.0/16` — digitado no roteador que **conhece** as específicas (aqui, **R3**).",
        "O agregado só existe se houver **pelo menos uma rota mais específica** dentro dele.",
        "A pergunta do passo: **o que acontece com os /24 originais?** Depende do `summary-only`.",
      ],
      flow: ["vários /24", "→ aggregate-address /16", "→ summary-only?", "→ some ou continua"],
      note: "🎮 Analogia: o agregado é o **CEP da cidade**; os /24 são os **endereços das ruas**.",
    },
    {
      title: "Passo 4 (etapa 1) — Agregar sem summary-only",
      topology: TOPO5("agg_a"),
      points: [
        "🎯 **Objetivo:** criar o agregado e ver o **efeito colateral inútil**: a tabela só **cresce**.",
        "⌨️ **Você digita (R3):** `aggregate-address 172.16.0.0/16` — **sem** `summary-only`.",
        "👀 **Você vê:** em R1, a `172.16.0.0/16` **e** todos os `/24` ainda lá.",
      ],
      code: "! em R3 — etapa 1\nrouter bgp 3\n address-family ipv4 unicast\n  aggregate-address 172.16.0.0/16\nend\nclear bgp * soft out",
      note: "🤔 Antes de dar **Passo →**: a `/16` vai **substituir** os `/24` ou **somar-se** a eles?",
    },
    {
      title: "Passo 4 (etapa 2) — summary-only: o que some?",
      topology: TOPO5("agg_b"),
      points: [
        "🎯 **Objetivo:** esconder as específicas. Com **`summary-only`**, R3 anuncia **só o /16**.",
        "👀 **Você vê:** em R1 somem `172.16.3.0/24` e `172.16.4.0/24`; em R3 as `/24` ganham a letra **`s`** (*suppressed*); na captura, **Withdrawn routes**, **Atomic Aggregate** e **Aggregator**.",
        "🧠 **Por quê:** a supressão vale para **todos** os `/24` que R3 conhece — **inclusive os de outros ASes**. R1 só mantém o `.2`, porque **R2** o anuncia direto.",
      ],
      code: "! em R3 — etapa 2\nrouter bgp 3\n address-family ipv4 unicast\n  aggregate-address 172.16.0.0/16 summary-only\nend\nclear bgp * soft out\n\n! em R1 (conferir)\nshow ip bgp\nshow ip route 172.16.4.4",
      note: "Se o FRR avisar `There is already same aggregate network`, pode ignorar: a opção foi aplicada.",
    },
    {
      title: "O que procurar no tcpdump (Passo 4)",
      code: "10.0.13.6 > 10.0.13.5: BGP\n\tUpdate Message (2)\n\t  Withdrawn routes:\n\t    172.16.3.0/24\n\t    172.16.4.0/24\n\tUpdate Message (2)\n\t  Origin (1), length: 1, Flags [T]: IGP\n\t  AS Path (2), length: 6, Flags [TE]: 3\n\t  Atomic Aggregate (6), length: 0, Flags [T]:\n\t  Aggregator (7), length: 8, Flags [OT]:  AS #3, origin 3.3.3.3\n\t  Updated routes:\n\t    172.16.0.0/16",
      points: [
        "**Withdrawn routes**: R3 **retira** as `/24` que passou a suprimir — o aviso vai **junto**, no mesmo pacote.",
        "**Atomic Aggregate**: marca que o caminho **perdeu informação** (é um resumo, não o caminho real).",
        "**Aggregator**: **quem** gerou o agregado (`AS #3, origin 3.3.3.3`).",
        "O **AS-PATH** é só `3`: os ASes 1, 2 e 4 **não aparecem**.",
      ],
      note: "Saída real do tcpdump em R1. A nota confere **os três**: o agregado, o Atomic/Aggregator e a retirada de `172.16.4.0/24`.",
    },
    {
      title: "O que R1 vê: antes e depois do summary-only",
      table: {
        head: ["Prefixo em R1", "Sem summary-only", "Com summary-only"],
        rows: [
          ["`172.16.1.0/24` (a própria de R1)", "✅", "✅"],
          ["`172.16.2.0/24` (R2, direto)", "✅", "✅ — R2 anuncia direto"],
          ["`172.16.3.0/24` (R3)", "✅", "❌ **some**"],
          ["`172.16.4.0/24` (R4)", "✅", "❌ **some**"],
          ["`172.16.0.0/16` (agregado de R3)", "✅", "✅ **a única de R3**"],
        ],
      },
      points: [
        "⚖️ **O preço:** R1 não escolhe mais caminhos diferentes para `.3` e `.4` — os dois seguem a `/16`; e o AS-PATH `3` **esconde** os ASes 1, 2 e 4.",
        "✅ **O tráfego continua chegando:** R3 mantém as **específicas** na tabela e entrega por elas (o `/24` mais específico vence o `/16`).",
      ],
      note: "A opção `as-set` preservaria os ASes de origem, mas no FRR 10.5 vem **bloqueada** (`bgp reject-as-sets`): não é usada aqui.",
    },
    {
      title: "Quem faz o quê? (resumo)",
      table: {
        head: ["Ferramenta", "Onde age", "Quem fica sabendo", "Papel no Lab 5"],
        rows: [
          ["**AS-PATH prepend**", "No **anúncio** de saída (R3)", "O vizinho (R1)", "Faz R1 **trocar** para R2"],
          ["**as-path ignore**", "Na **decisão local** (R1)", "**Ninguém**", "**Anula** o prepend; sobra o Router ID"],
          ["**aggregate-address**", "Gera o `/16` em R3", "Todos os vizinhos", "**Resume** os `/24`"],
          ["**summary-only**", "Suprime as específicas em R3", "Todos os vizinhos", "R1 **perde** `.3` e `.4`"],
        ],
      },
      note: "Prepend muda o que o **vizinho** escolhe; `as-path ignore` muda o que **eu** escolho.",
    },
    {
      title: "O que a nota confere",
      points: [
        "✅ **Na configuração:** o **prepend** (limitado a `172.16.4.0/24`, outbound para R1) em R3, o `as-path ignore` em R1 e o `aggregate-address … summary-only` em R3.",
        "✅ **No resultado:** R1 aprende o agregado (`aggregated by 3`, `atomic-aggregate`), **não vê** `.3` e `.4`, e R3 marca as `/24` com `s`.",
        "✅ **Na captura de R1:** o UPDATE de R3 com **o seu prepend**, o UPDATE do **agregado** (Atomic Aggregate + Aggregator) e a **retirada** de `172.16.4.0/24`.",
        "⚠️ Por isso a captura de R1 fica **rodando do Passo 1 ao 4** (se parar sozinha após 10 min, reinicie: o que já foi capturado continua valendo).",
      ],
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: mostrar na captura o **prepend**; explicar por que o **`as-path ignore`** devolveu R1 a R3 e **quem desempatou**; e explicar o que o **`summary-only`** escondeu — e para quem.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Antes de qualquer política, por qual caminho R1 chega a 172.16.4.0/24? Por quê?",
      lookFor: "Via R3 ('3 4'), best (AS Path): AS-PATH de comprimento 2 contra 3 do caminho via R2 ('2 3 4').",
    },
    {
      id: "e2",
      prompt: "Depois do prepend {{prependArg}} em R3, por qual caminho R1 passa a ir? Mostre na 🔬 captura o UPDATE de R3.",
      lookFor: "Via R2 ('2 3 4'), best (AS Path): o caminho via R3 virou '3 {{prependArg}} 4'. Na captura, UPDATE de 10.0.13.6 com 'AS Path ... 3 {{prependArg}} 4' para 172.16.4.0/24. Prefix-list limita o prepend a esse prefixo; cláusula 20 deixa o resto passar.",
    },
    {
      id: "e3",
      prompt: "Você ativou 'as-path ignore' em R1. O que aconteceu com o prepend de R3? Quem decidiu o desempate?",
      lookFor: "R1 voltou a R3 ('3 {{prependArg}} 4'): o comprimento do AS-PATH não conta, o prepend perdeu efeito. Empate nos demais critérios; decidiu o Router ID — best (Router ID): 3.3.3.3 < 22.22.22.22. Sem compare-routerid seria Older Path. Ajuste local desfaz engenharia de tráfego de outro AS.",
    },
    {
      id: "e4",
      prompt: "Qual a diferença, em R1, entre aggregate-address sem e com summary-only?",
      lookFor: "Sem: R1 vê o /16 e os /24 (a tabela cresce). Com: R3 suprime os /24 que cobre — 172.16.3.0/24 e 172.16.4.0/24 somem de R1; fica a /16 e a /24 de R2 (R2 anuncia direto). R3 mostra 's' nas suprimidas.",
    },
    {
      id: "e5",
      prompt: "Mostre na captura o UPDATE do agregado. O que cada campo diz?",
      lookFor: "Updated routes 172.16.0.0/16 com AS Path '3', Atomic Aggregate (o caminho perdeu informação) e Aggregator 'AS #3, origin 3.3.3.3'; no mesmo pacote, Withdrawn routes com 172.16.3.0/24 e 172.16.4.0/24 (e as de R1/R2 aprendidas por R3).",
    },
    {
      id: "e6",
      prompt: "Com o /24 de R4 suprimido, R1 ainda alcança o host 172.16.4.4? Como? E qual o custo da agregação?",
      lookFor: "Sim: R1 usa a /16 de R3 (show ip route 172.16.4.4 → 172.16.0.0/16) e R3 entrega pela /24 específica que continua na sua tabela. Custo: AS-PATH do agregado só '3' (perde 1, 2, 4), perda de granularidade e de proteção de laço; as-set bloqueado no FRR 10.5.",
    },
  ],

  autoGrade: [
    { id: "checked_paths", label: "Observou os dois caminhos de R1 para 172.16.4.0/24", router: "R1", cmdContains: "show ip bgp 172.16.4.0" },
    { id: "prepend_typed", label: "Configurou o AS-Path Prepend", cmdContains: "as-path prepend" },
    { id: "ignore_typed", label: "Ativou o as-path ignore", cmdContains: "as-path ignore" },
    { id: "aggregate_typed", label: "Configurou o aggregate-address", cmdContains: "aggregate-address" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_prepend", label: "Capturou o UPDATE de R3 com o seu prepend", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 3 {{prependArg}} 4\\s" + UPD_NT + ROUTES_TO("172\\.16\\.4\\.0/24") },
    { id: "captured_aggregate", label: "Capturou o UPDATE do agregado (Atomic Aggregate + Aggregator)", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Atomic Aggregate \\(6\\)" + UPD_NT + "Aggregator \\(7\\)[^\\n]*AS #3, origin 3\\.3\\.3\\.3" + UPD_NT + ROUTES_TO("172\\.16\\.0\\.0/16") },
    { id: "captured_withdraw", label: "Capturou a retirada de 172.16.4.0/24", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + WITHDRAWN("172\\.16\\.4\\.0/24") },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP de R1 verificadas",
      weight: 2,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    },
    {
      id: "prepend_configured",
      label: "AS-Path Prepend {{prependArg}} configurado em R3",
      weight: 8,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set as-path prepend {{prependArg}}\\s" },
    },
    {
      id: "prepend_out",
      label: "Prepend aplicado outbound em R3 (vizinho R1, 10.0.13.5)",
      weight: 4,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.13\\.5 route-map \\S+ out" },
    },
    {
      id: "prepend_prefix_list",
      label: "Prepend limitado a 172.16.4.0/24 por prefix-list",
      weight: 4,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "ip prefix-list \\S+ seq \\d+ permit 172\\.16\\.4\\.0/24" },
    },
    {
      id: "ignore_configured",
      label: "bgp bestpath as-path ignore configurado em R1",
      weight: 12,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "bgp bestpath as-path ignore" },
    },
    {
      id: "aggregate_configured",
      label: "aggregate-address 172.16.0.0/16 summary-only configurado em R3",
      weight: 14,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "aggregate-address 172\\.16\\.0\\.0/16 summary-only" },
    },
    {
      id: "aggregate_in_r1",
      label: "R1 aprende o agregado de R3 (aggregated by 3, atomic-aggregate)",
      weight: 8,
      check: { router: "R1", cmdPattern: "show ip bgp 172.16.0.0/16", outputPattern: "aggregated by 3 3\\.3\\.3\\.3[\\s\\S]*atomic-aggregate" },
    },
    {
      id: "specifics_suppressed",
      label: "R1 não enxerga mais 172.16.3.0/24 nem 172.16.4.0/24 (suprimidas), só a /16",
      weight: 12,
      check: { router: "R1", cmdPattern: "show ip bgp", outputPattern: "^(?![\\s\\S]*172\\.16\\.[34]\\.0/24)[\\s\\S]*172\\.16\\.0\\.0/16" },
    },
    {
      id: "r3_suppressed",
      label: "R3 marca as /24 como suprimidas (s) na sua tabela",
      weight: 6,
      check: { router: "R3", cmdPattern: "show ip bgp", outputPattern: "s>\\s+172\\.16\\.4\\.0/24" },
    },
    {
      id: "r1_still_reaches",
      label: "R1 ainda alcança 172.16.4.4 (pela rota /16)",
      weight: 2,
      check: { router: "R1", cmdPattern: "show ip route 172.16.4.4", outputPattern: "Routing entry for 172\\.16\\.0\\.0/16" },
    },
    {
      id: "capture_prepend",
      label: "Capturou o UPDATE de R3 para R1 com AS Path 3 {{prependArg}} 4",
      weight: 10,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 3 {{prependArg}} 4\\s" + UPD_NT + ROUTES_TO("172\\.16\\.4\\.0/24") },
    },
    {
      id: "capture_aggregate",
      label: "Capturou o UPDATE do agregado com Atomic Aggregate e Aggregator",
      weight: 10,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Atomic Aggregate \\(6\\)" + UPD_NT + "Aggregator \\(7\\)[^\\n]*AS #3, origin 3\\.3\\.3\\.3" + UPD_NT + ROUTES_TO("172\\.16\\.0\\.0/16") },
    },
    {
      id: "capture_withdraw",
      label: "Capturou a retirada (Withdrawn) de 172.16.4.0/24",
      weight: 8,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + WITHDRAWN("172\\.16\\.4\\.0/24") },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["r3", "direto", "curto", "menor"],
      anyOf: true,
      points: 6,
      hint: "O BGP prefere, por padrão, o caminho com o AS-PATH mais curto — compare 'via R3' (2 ASes) com 'via R2 e R3' (3 ASes).",
    },
    predict_step2: {
      type: "keywords",
      required: ["r2", "troca", "muda", "curto", "mais longo", "maior"],
      anyOf: true,
      points: 6,
      hint: "Com o prepend, o caminho via R3 fica com mais ASes que o via R2: R1 passa a preferir R2.",
    },
    predict_step3: {
      type: "keywords",
      required: ["r3", "router-id", "router id", "volta", "anula", "desfaz", "antig", "oldest"],
      anyOf: true,
      points: 6,
      hint: "Ignorar o AS-PATH tira o critério que o prepend usava: os dois caminhos empatam e o desempate segue (aqui, Router ID: R3 vence). O prepend perde o efeito.",
    },
    predict_step4: {
      type: "keywords",
      required: ["sumir", "somem", "suprim", "desaparece", "não aparece", "nao aparece", "só o /16", "so o /16", "apenas o /16", "1 rota", "uma rota"],
      anyOf: true,
      points: 6,
      hint: "Com summary-only, R3 suprime as /24 que o /16 cobre: 172.16.3.0/24 e 172.16.4.0/24 deixam de chegar a R1; ele fica com a /16 (e com a /24 de R2, que R2 anuncia direto).",
    },
    q1: { type: "radio", correct: "Ele deixa de usar o tamanho do AS-PATH como critério de desempate na seleção do best path", points: 10 },
    q2: { type: "radio", correct: "No R3, aplicado outbound para o vizinho R1", points: 8 },
    q3: { type: "radio", correct: "Porque o caminho direto passa a parecer pior quando o AS 3 é repetido no AS-PATH", points: 8 },
    q4: { type: "radio", correct: "No R3, porque ele conhece os prefixos 172.16.x.0/24 e pode anunciar um resumo /16", points: 6 },
    q5: { type: "radio", correct: "Anuncia o prefixo agregado e suprime os prefixos mais específicos para aquele anúncio", points: 10 },
    q6: { type: "radio", correct: "Reduzir a quantidade de rotas anunciadas, simplificando a tabela BGP dos vizinhos", points: 6 },
    q7: { type: "radio", correct: "Com as-path ignore o prepend perde efeito: os dois caminhos empatam e R1 volta a R3 pelo menor Router ID", points: 14 },
    q8: { type: "radio", correct: "Sim: pela rota /16 de R3, que entrega pela /24 específica que ainda existe na sua tabela", points: 14 },
  },

  steps: [
    {
      id: 1,
      title: "Reconhecer os caminhos",
      theory: `Este lab usa 4 roteadores e 4 ASes. R1 alcança a rede 172.16.4.0/24 de R4 por dois caminhos:

- Caminho via R3: AS-PATH "3 4"
- Caminho via R2 e R3: AS-PATH "2 3 4"

Por padrão, o BGP prefere o caminho com o AS-PATH mais curto, quando os demais atributos (weight, local preference) são iguais. O FRR escreve entre parênteses, depois de 'best', o critério que decidiu.`,
      description: `Abra a captura em R1, interface 'todas', protocolo BGP. DEIXE A CAPTURA RODANDO até o fim do passo 4 (se ela parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Responda a previsão. Depois verifique as sessões BGP e observe o prefixo 172.16.4.0/24 em R1: quantos caminhos, qual o AS-PATH de cada, qual é o best e o que diz entre parênteses.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "Sessões de R1 com R2 e R3" },
        { cmd: "show ip bgp 172.16.4.0/24", router: "R1", desc: "Dois caminhos: qual é o best? O que diz entre parênteses?" },
        { cmd: "show ip bgp", router: "R1", desc: "Todos os prefixos 172.16.x.0/24 vistos por R1" },
      ],
      expected: "Sessões Established com R2 (10.0.12.2) e R3 (10.0.13.6). R1 tem dois caminhos para 172.16.4.0/24: AS-PATH '3 4' via 10.0.13.6 (best (AS Path)) e '2 3 4' via 10.0.12.2.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de verificar, qual caminho você espera que R1 prefira até 172.16.4.0/24 — o direto via R3 ou o indireto via R2 e R3? Por quê?",
      },
    },
    {
      id: 2,
      title: "Tornar o caminho via R3 menos atrativo (prepend)",
      theory: `AS-Path Prepend torna um caminho menos preferido repetindo o próprio ASN no atributo AS-PATH.

Quando R3 anuncia a rota de R4 para R1 com "set as-path prepend {{prependArg}}", o caminho via R3 deixa de ter o AS-PATH mais curto — o AS 3 passa a se repetir no atributo recebido por R1.

Para afetar só o prefixo pedido, use uma prefix-list no match; a cláusula 20, sem match, deixa passar o resto. Depois de aplicar a route-map, use "clear bgp * soft out" para reenviar os anúncios com a nova política, sem derrubar sessões.`,
      description: `Responda a previsão e configure R3 para anunciar 172.16.4.0/24 a R1 com prepend:

  configure terminal
  ip prefix-list NET_R4 seq 10 permit 172.16.4.0/24
  route-map PREPEND_TO_R1 permit 10
   match ip address prefix-list NET_R4
   set as-path prepend {{prependArg}}
  route-map PREPEND_TO_R1 permit 20
  exit
  router bgp 3
   address-family ipv4 unicast
    neighbor 10.0.13.5 route-map PREPEND_TO_R1 out
  end
  clear bgp * soft out

Depois verifique em R1 o AS-PATH de cada caminho e quem é o best. Na captura, procure o UPDATE de 10.0.13.6 com 'AS Path' e o 3 repetido.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R3", desc: "Confirme prefix-list, route-map e route-map outbound" },
        { cmd: "clear bgp * soft out", router: "R3", desc: "Reenvia os anúncios de R3 com o prepend" },
        { cmd: "show ip bgp 172.16.4.0/24", router: "R1", desc: "Quem é o best agora? O caminho via R3 ficou com que AS-PATH?" },
        { cmd: "show ip bgp", router: "R1", desc: "Os outros prefixos continuaram como estavam?" },
      ],
      expected: "R1 vê o caminho via R3 com AS-PATH '3 {{prependArg}} 4' e passa a preferir o caminho via R2 ('2 3 4', best (AS Path)). Os outros prefixos não mudam (a prefix-list limita o prepend). Na captura: UPDATE de R3 com 'AS Path ... 3 {{prependArg}} 4' para 172.16.4.0/24.",
      predict: {
        id: "predict_step2",
        prompt: "Depois do prepend em R3 (só em 172.16.4.0/24), você espera que R1 continue indo por R3 ou que troque de caminho? Por quê?",
      },
    },
    {
      id: 3,
      title: "Ignorar o tamanho do AS-PATH",
      theory: `"bgp bestpath as-path ignore" altera a lógica de seleção do BGP no roteador onde é configurado.

Com esse comando, o roteador deixa de usar o tamanho do AS-PATH como critério de decisão. Ele não remove o atributo da tabela; apenas ignora seu tamanho na escolha do best path. É um ajuste local: o prepend de R3 perde o efeito sobre R1.

Quando os critérios anteriores empatam, o desempate vai para o fim da lista. R1 tem 'bgp bestpath compare-routerid' na configuração: o menor Router ID vence. R3 tem 3.3.3.3 e R2 tem 22.22.22.22.`,
      description: `Responda a previsão e configure R1:

  configure terminal
  router bgp 1
   bgp bestpath as-path ignore
  end
  clear bgp * soft

Compare o best path de 172.16.4.0/24 antes e depois, e leia o que o FRR escreve entre parênteses depois de 'best'. Confira também a configuração de R1 e procure a linha 'compare-routerid'.`,
      commands: [
        { cmd: "show ip bgp 172.16.4.0/24", router: "R1", desc: "ANTES: best via R2 (AS Path)" },
        { cmd: "show running-config", router: "R1", desc: "Procure 'bgp bestpath compare-routerid' e o as-path ignore novo" },
        { cmd: "clear bgp * soft", router: "R1", desc: "Reavalia os caminhos depois do as-path ignore" },
        { cmd: "show ip bgp 172.16.4.0/24", router: "R1", desc: "DEPOIS: qual é o best? O que diz entre parênteses?" },
      ],
      expected: "Depois do as-path ignore e do clear, R1 volta a preferir o caminho via R3 (10.0.13.6, AS-PATH '3 {{prependArg}} 4', mesmo com o prepend) com 'best (Router ID)': o comprimento do AS-PATH não conta, os critérios empatam e o menor Router ID (3.3.3.3 < 22.22.22.22) vence. O prepend de R3 foi anulado.",
      predict: {
        id: "predict_step3",
        prompt: "Depois de configurar 'bgp bestpath as-path ignore' em R1, o caminho via R3 (agora com prepend) volta a ser o melhor? O que decide o desempate agora que o AS-PATH deixou de contar?",
      },
    },
    {
      id: 4,
      title: "Criar um agregado BGP",
      theory: `Agregação BGP reduz a quantidade de prefixos anunciados para os vizinhos.

Se um roteador conhece várias redes dentro de 172.16.0.0/16, ele pode anunciar o resumo 172.16.0.0/16. O comando é "aggregate-address 172.16.0.0/16", com a opção "summary-only" para suprimir as rotas mais específicas. Sem ela, o BGP anuncia o agregado e também continua anunciando os /24.

O agregado carrega 'Atomic Aggregate' e 'Aggregator' no UPDATE e o AS-PATH dele é só o do roteador que o criou (aqui, 3).`,
      description: `Responda a previsão e configure R3 em DUAS etapas.

1) Primeiro sem summary-only:
  configure terminal
  router bgp 3
   address-family ipv4 unicast
    aggregate-address 172.16.0.0/16
  end
  clear bgp * soft out

Veja a tabela BGP de R1: apareceu a /16? Os /24 continuam?

2) Agora com summary-only (se o FRR avisar 'There is already same aggregate network', pode ignorar: a opção foi aplicada):
  configure terminal
  router bgp 3
   address-family ipv4 unicast
    aggregate-address 172.16.0.0/16 summary-only
  end
  clear bgp * soft out

Veja de novo a tabela de R1 e a de R3 (letra 's'). Na captura, procure o UPDATE com 'Atomic Aggregate' e 'Aggregator' e o 'Withdrawn routes'. Por fim, 'show ip route 172.16.4.4' em R1.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R3", desc: "Confirme o aggregate-address com summary-only" },
        { cmd: "clear bgp * soft out", router: "R3", desc: "Reenvia os anúncios de R3" },
        { cmd: "show ip bgp", router: "R1", desc: "Quais /24 e /16 R1 tem agora?" },
        { cmd: "show ip bgp 172.16.0.0/16", router: "R1", desc: "Detalhe do agregado: 'aggregated by' e 'atomic-aggregate'" },
        { cmd: "show ip bgp", router: "R3", desc: "As /24 suprimidas aparecem com 's'" },
        { cmd: "show ip route 172.16.4.4", router: "R1", desc: "R1 ainda tem rota para um host de R4? Qual?" },
      ],
      expected: "Sem summary-only: R1 vê a /16 e todos os /24. Com summary-only: R1 fica com 172.16.0.0/16 (AS-PATH '3', aggregated by 3 3.3.3.3, atomic-aggregate), 172.16.1.0/24 (sua) e 172.16.2.0/24 (de R2); 172.16.3.0/24 e 172.16.4.0/24 somem. Em R3 as /24 aparecem com 's>'. 'show ip route 172.16.4.4' em R1 usa a rota 172.16.0.0/16. Na captura: UPDATE da /16 com Atomic Aggregate e Aggregator (AS #3, origin 3.3.3.3), e Withdrawn routes com 172.16.4.0/24.",
      predict: {
        id: "predict_step4",
        prompt: "Depois do summary-only em R3, quais rotas 172.16.x.0 você espera ver em R1? Alguma some? Por quê?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Prepend, AS-PATH Ignore e Agregação",
    description: `Estado final esperado:

1. R3 anuncia a R1 o caminho de 172.16.4.0/24 com AS-Path Prepend (limitado por prefix-list).
2. R1 tem 'bgp bestpath as-path ignore' configurado.
3. R3 anuncia o agregado 172.16.0.0/16 com 'summary-only', e R1 não vê mais as /24 de R3 e R4.
4. Você conferiu os resultados com 'show ip bgp' e 'show running-config'.

Responda às perguntas, baseadas no que você viu nas saídas e nas capturas.`,
    hints: [
      "AS-Path Prepend muda o atributo anunciado; bestpath as-path ignore muda a decisão local.",
      "A route-map de prepend precisa estar outbound no vizinho para quem R3 anuncia.",
      "O agregado deve ser criado no roteador que conhece os prefixos mais específicos.",
      "summary-only suprime os /24 para TODOS os vizinhos, inclusive os de outros ASes que R3 aprendeu.",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "O que o comando 'bgp bestpath as-path ignore' faz?",
        options: [
          "Ele apaga o AS-PATH das rotas antes de anunciá-las",
          "Ele deixa de usar o tamanho do AS-PATH como critério de desempate na seleção do best path",
          "Ele derruba e recria todas as sessões BGP",
          "Ele transforma eBGP em iBGP",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Onde a route-map com 'set as-path prepend' deve ser aplicada neste lab?",
        options: [
          "No R1, aplicado inbound para o vizinho R3",
          "No R2, aplicado outbound para o vizinho R1",
          "No R4, aplicado inbound para o vizinho R3",
          "No R3, aplicado outbound para o vizinho R1",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Por que o AS-Path Prepend pode fazer R1 deixar de preferir o caminho via R3?",
        options: [
          "Porque o next-hop deixa de responder ARP",
          "Porque o BGP passa a comparar MED antes de Local Preference",
          "Porque o caminho direto passa a parecer pior quando o AS 3 é repetido no AS-PATH",
          "Porque o agregado /16 remove a rota /24 localmente em R1",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Onde faz mais sentido criar o aggregate-address 172.16.0.0/16 neste lab?",
        options: [
          "No R1, porque ele é o menor ASN",
          "No R3, porque ele conhece os prefixos 172.16.x.0/24 e pode anunciar um resumo /16",
          "No R4, porque só ele possui 172.16.4.0/24",
          "Em todos os roteadores obrigatoriamente",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual é o efeito de 'summary-only' no aggregate-address?",
        options: [
          "Anuncia somente os prefixos /24 e bloqueia o /16",
          "Cria uma rota default 0.0.0.0/0",
          "Anuncia o prefixo agregado e suprime os prefixos mais específicos para aquele anúncio",
          "Ativa comunidades BGP automaticamente",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Qual é o principal benefício operacional da agregação BGP?",
        options: [
          "Aumentar obrigatoriamente o Local Preference",
          "Reduzir a quantidade de rotas anunciadas, simplificando a tabela BGP dos vizinhos",
          "Impedir que qualquer rota seja aprendida por eBGP",
          "Trocar o ASN dos vizinhos automaticamente",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "O que aconteceu com o prepend de R3 depois do 'as-path ignore' em R1?",
        options: [
          "R1 passou a preferir R2 ainda mais",
          "As sessões BGP caíram",
          "Com as-path ignore o prepend perde efeito: os dois caminhos empatam e R1 volta a R3 pelo menor Router ID",
          "O prepend foi apagado da configuração de R3",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "Com o /24 de R4 suprimido, R1 ainda consegue alcançar o host 172.16.4.4?",
        options: [
          "Não: sem a rota /24 o destino fica inacessível",
          "Sim: pela rota /16 de R3, que entrega pela /24 específica que ainda existe na sua tabela",
          "Sim, mas só por R2",
          "Só se o as-path ignore for desativado",
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
 bgp bestpath compare-routerid
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
};

module.exports = lab;
