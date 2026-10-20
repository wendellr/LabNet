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
      points: [
        "**Confederação**: dividir um AS grande em sub-ASes — e o que o mundo de fora enxerga",
        "Por que **R2 e R3 não escolhem** o caminho direto de R1 (e o que o AS-PATH de confederação esconde)",
        "**Weight**: poder **local** e o critério número 1",
        "**ORIGIN**: IGP, EGP e incomplete — e quando ele desempata",
        "Tudo isso **no fio**: os UPDATEs mostram a confederação e o Origin",
      ],
      note: "Este lab parte dos Labs 1 e 2: AS-PATH, a ordem de decisão e Local Preference × Weight.",
    },
    {
      title: "Confederação: o problema que ela resolve",
      points: [
        "O iBGP exige **malha completa**: todo roteador do AS fala com todos os outros. Com **n** roteadores são **n(n−1)/2** sessões. Num AS grande, isso explode.",
        "A **confederação** divide o AS em **sub-ASes**. Dentro de cada sub-AS vale o iBGP normal; **entre** sub-ASes a sessão é **confed-eBGP** — parecida com eBGP, mas o AS continua sendo **um só** por dentro.",
        "Os sub-ASes usam **ASNs privados** (aqui 65502, 65503, 65504). Para o mundo de fora, **todos** são o **AS 5** (o `bgp confederation identifier`).",
        "(O **Lab 4** é só sobre isso — aqui a confederação é o cenário em que o Weight e o ORIGIN vão agir.)",
      ],
    },
    {
      title: "A topologia do Lab 3",
      diagram: [
        "                    AS 254",
        "                   ┌────┐",
        "         ┌─────────┤ R1 ├─────────┐",
        "         │eth1     └─┬──┘eth2     │",
        "         │       eth3│            │",
        "   ┌─────┴┐          │150.1.1.0/24│",
        "   │  R2  │          │            │",
        "   │65502 │       ┌──┴─┐       ┌──┴───┐",
        "   └──┬───┘       │ R4 │       │  R3  │",
        "      │eth2       │65504│      │ 65503│",
        "      └───────────┤    ├───────┤      │",
        "     (confed)     └────┘ eth1   └──────┘",
        "          AS 5 = R2 + R3 + R4  (confederação)",
      ].join("\n"),
      points: [
        "**R1** (AS 254) fica **fora** e fala com **R2**, **R3** e **R4**. Para ele, os três são o **AS 5**.",
        "**R2, R3 e R4** formam o **AS 5**: sub-ASes **65502**, **65503**, **65504**, com sessões confed-eBGP entre eles.",
        "**R1 e R4 anunciam o mesmo prefixo**: `150.1.1.0/24` (R4 tem uma interface nessa rede). Isso cria a dúvida do passo 1.",
        "Cada um anuncia um prefixo próprio: R2 `150.2.2.0/24`, R3 `150.3.3.0/24`.",
      ],
    },
    {
      title: "O AS-PATH de confederação",
      code: "R2# show ip bgp 150.1.1.0/24\n  (65503 65504)\n    10.0.0.10 from 10.0.0.10 (3.3.3.3)\n      Origin IGP, metric 0, localpref 100, valid, confed-external, best (AS Path)\n  254\n    10.0.0.1 from 10.0.0.1 (1.1.1.1)\n      Origin IGP, metric 0, valid, external",
      points: [
        "O caminho interno aparece **entre parênteses**: `(65503 65504)` é um **segmento de confederação**. Ele registra os sub-ASes pelos quais a rota passou.",
        "Esse segmento **não conta no comprimento** do AS-PATH: `(65503 65504)` tem comprimento **0**; o caminho direto de R1, `254`, tem comprimento **1**.",
        "Por isso o BGP prefere o caminho pela confederação — `best (AS Path)` — **mesmo sendo mais longo** na prática.",
        "**Ao sair do AS 5**, o segmento é **removido** e o AS 5 é acrescentado: R1 vê `5`, nunca os sub-ASes.",
      ],
      note: "Validado neste lab: sem política, R2 escolhe a rota de R3 e R3 escolhe a de R4 para 150.1.1.0/24.",
    },
    {
      title: "A confederação no fio",
      code: "(R3 → R2, dentro da confederação)\n\t  AS Path (2), length: 6, Flags [TE]: ( 65503 )\n\t  Updated routes:\n\t    150.3.3.0/24\n\n(R2 → R1, para fora)\n\t  AS Path (2), length: 6, Flags [TE]: 5\n\t  Updated routes:\n\t    150.3.3.0/24",
      points: [
        "O **mesmo prefixo**, dois UPDATEs: **( 65503 )** entre sub-ASes e **5** para R1.",
        "Os parênteses no `tcpdump` marcam o **segmento de confederação**.",
        "É a prova de que a divisão em sub-ASes **não vaza** para fora.",
      ],
      note: "Saída real do tcpdump em R2.",
    },
    {
      title: "Weight — local e o critério número 1",
      points: [
        "**Weight** é um valor **por roteador**: **maior vence**. **Nunca é anunciado** a nenhum vizinho — nem confed-eBGP, nem iBGP.",
        "Fica no critério **1** da decisão: **antes** do Local Preference e do AS-PATH.",
        "Rotas **originadas** pelo roteador ganham **32768** automaticamente (por isso `best (Weight)` aparece em rotas locais).",
        "Configura-se com **route-map** (`set weight N`) aplicada **in** ao vizinho: o roteador marca o que **recebe**.",
        "Consequência: **cada roteador** que deve mudar precisa ser configurado — o Weight de R2 **não ajuda** R3.",
      ],
      code: "ip prefix-list NET_R1 seq 10 permit 150.1.1.0/24\n!\nroute-map WEIGHT_R1 permit 10\n match ip address prefix-list NET_R1\n set weight 800\nroute-map WEIGHT_R1 permit 20\n!\nrouter bgp 65502\n address-family ipv4 unicast\n  neighbor 10.0.0.1 route-map WEIGHT_R1 in",
    },
    {
      title: "prefix-list + route-map: limitando a política",
      points: [
        "Sem `match`, a route-map vale para **todos** os prefixos do vizinho. Para afetar **só um**, usa-se uma **prefix-list** no `match ip address prefix-list`.",
        "A cláusula **10** casa o prefixo e aplica o `set`. A cláusula **20** (sem `match`) deixa **passar tudo o mais**, sem alterar.",
        "Se a cláusula 20 **não existisse**, as demais rotas seriam **descartadas** pelo *deny implícito* do final da route-map.",
        "Resultado: o Weight vale **só** para `150.1.1.0/24`; as outras rotas de R1 seguem como estão.",
      ],
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
      points: [
        "Está no critério **5**: depois de Weight, LP, AS-PATH — e **antes** do MED.",
        "Só desempata quando os critérios anteriores **empataram**. Aqui, todos os caminhos de R1 para `150.3.3.0/24` têm AS-PATH `5`.",
        "É um atributo **transitivo**: viaja com a rota. No UPDATE aparece como `Origin (1): IGP | EGP | Incomplete`.",
      ],
    },
    {
      title: "O ponto de partida de R1",
      code: "R1# show ip bgp\n *>  150.3.3.0/24     10.0.0.2                               0 5 i\n *=                  10.0.0.6                 0             0 5 i\n *=                  150.1.1.4                              0 5 i\n\nR1# show ip bgp 150.3.3.0/24\n  5\n    10.0.0.2 from 10.0.0.2 (2.2.2.2)\n      Origin IGP, valid, external, multipath, best (Router ID)",
      points: [
        "R1 aprende `150.3.3.0/24` por **três caminhos iguais** (R2, R3 e R4), todos com AS-PATH `5`. O FRR usa os três (**multipath**, o `=` na tabela).",
        "O `best` é desempatado por **Router ID** — o menor, **R2**.",
        "Se você manipular o **ORIGIN** dos caminhos, o BGP volta a decidir **antes** do Router ID — e o multipath se desfaz.",
      ],
      note: "Validado neste lab, sem nenhuma política configurada.",
    },
    {
      title: "Alterar o que R1 recebe: route-map out",
      points: [
        "**Weight** altera como **eu** vejo uma rota (route-map **in**). O **ORIGIN** quer mudar como **R1** vê as rotas — então a política vai **na saída dos vizinhos** (route-map **out**).",
        "Cada vizinho de R1 reescreve o Origin do **seu** anúncio: o que R2 mandar a R1 não depende do que R3 mandar.",
        "O desafio: escolher **quem recebe qual Origin** para R1 acabar preferindo **só um** caminho — o que ficar **IGP**, o único que não for rebaixado.",
      ],
      code: "route-map ORIGIN_R1 permit 10\n match ip address prefix-list NET_R3\n set origin incomplete\nroute-map ORIGIN_R1 permit 20\n!\nrouter bgp 65502\n address-family ipv4 unicast\n  neighbor 10.0.0.1 route-map ORIGIN_R1 out",
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
      title: "Roteiro do Lab 3",
      points: [
        "**Passo 1:** reconhecer a **confederação**, ver o **AS-PATH com parênteses** e **capturar** o UPDATE interno × externo em R2.",
        "**Passo 2:** **Weight** em R2 e R3 para preferirem o caminho direto de R1 — primeiro **só em R2**, para ver que R3 não muda.",
        "**Passo 3:** **ORIGIN** nos anúncios de R2 e R3 para R1: R1 muda para um caminho **que não era o preferido**. Com **captura** em R1.",
        "**Desafio:** perguntas de fechamento.",
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
