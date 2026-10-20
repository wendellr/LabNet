/**
 * Lab 11 — OSPF Nível 4: Multi-Área e Sumarização de Rotas (ABR)
 * Sem falha proposital — a topologia nasce em 3 áreas e o desafio é entender
 * o que o ABR faz (Type-3) e o que a sumarização esconde.
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - R4 (área 2) só recebe LSAs Type-3 anunciadas por R3 ("Area 0.0.0.2",
 *    Advertising Router 3.3.3.3): o ABR re-origina, R4 nunca vê R2;
 *  - sem sumarização, um host de R1 que some vira um flush (age 3600s) que
 *    atravessa as duas áreas até R4; com `area 1 range` a faixa não muda e
 *    R4 não recebe nada;
 *  - o `area range` leva ~5 s para valer; as Type-3 /32 antigas ficam no
 *    banco de R4 com "LS age: 3600" por ~50 s antes de sumirem;
 *  - R2 instala a faixa como rota de descarte ("unreachable (blackhole)");
 *    as rotas /32 continuam em R2 (a sumarização só afeta o que sai da área);
 *  - `area 0 range` (área errada) não muda nada: as /32 seguem em R4;
 *  - `cost 100` no range: LSA com metric 110 em R4, rota com metric 120.
 */

const lab = {
  id: 11,
  protocol: "ospf",
  level: 4,
  scenario: "Uma empresa cresceu de uma única sede para várias filiais, cada uma virando sua própria área OSPF. Cada filial pequena tem só um punhado de sub-redes locais, mas sem sumarização, CADA uma dessas sub-redes vira uma LSA Type-3 própria cruzando o backbone e sendo processada por todo roteador da rede — e cada vez que um serviço da filial cai ou volta, essa instabilidade viaja por todas as áreas. Sumarizar no ABR resolve os dois problemas sem perder conectividade. Neste lab você vai ver as LSAs cruzando as áreas no fio, provocar uma instabilidade antes e depois de sumarizar e comparar.",
  title: "OSPF Multi-Área e Sumarização de Rotas",
  topic: "Área, ABR e Type-3 Summary LSA",
  difficulty: "Intermediário",
  duration: "60 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
    ["R3", "eth2", "R4", "eth1"],
  ],

  variables: {
    orgOctet: { pool: ["20", "21", "22", "23", "24"] },
    // Qual host de R1 vai "cair" no experimento (sempre sobram 2 na faixa)
    flapHost: { pool: ["1", "2", "3"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=11). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "OSPF Multi-Área e Sumarização",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 11",
      points: [
        "Por que o OSPF se divide em **áreas** — e a regra da **área 0**",
        "O **ABR** e as LSAs que cruzam áreas: a **Type-3 (Summary)**",
        "Quem anuncia o quê: a Type-3 **no fio**",
        "O custo de **não sumarizar**: uma LSA por rota e a instabilidade que viaja",
        "**`area range`**: onde configurar, o que muda, a rota de **descarte**",
        "As armadilhas: **área errada**, LSAs **MaxAge** e o que o range **não** sumariza",
      ],
      note: "Este lab parte do Lab 13 (Hello, estados, LSDB) e do Lab 14 (LSAs no fio).",
    },
    {
      title: "A topologia do Lab 11",
      diagram: [
        "   ÁREA 1           ÁREA 0 (backbone)         ÁREA 2",
        "  10.0.12.0/30        10.0.23.0/30         10.0.34.0/30",
        "  ┌────┐ .1   .2 ┌────┐ .1       .2 ┌────┐ .1   .2 ┌────┐",
        "  │ R1 ├─eth1─eth1┤ R2 ├─eth2─eth1──┤ R3 ├─eth2─eth1┤ R4 │",
        "  └────┘         └────┘             └────┘         └────┘",
        "  RID 1.1.1.1    RID 2.2.2.2        RID 3.3.3.3    RID 4.4.4.4",
        "  172.X.10.1-3         ABR                ABR",
        "  (3 hosts em lo)",
      ].join("\n"),
      points: [
        "**R2** liga a área 1 ao backbone; **R3** liga o backbone à área 2. Os dois são **ABRs**.",
        "**R1** tem três endereços `/32` no loopback (`172.X.10.1`, `.2`, `.3`) — três serviços da filial, cobertos por `network 172.X.10.0/24 area 1`.",
        "**R4** está do **outro lado do backbone**: é de lá que você vai observar o efeito de tudo.",
      ],
    },
    {
      title: "Por que existem áreas",
      points: [
        "Numa única área, **todo roteador** tem o mesmo banco de dados (LSDB) e roda o SPF sobre **toda** a topologia. Numa rede grande, isso não escala.",
        "Dividindo em **áreas**, cada roteador mantém o detalhe topológico **só da sua área**. Uma mudança dentro de uma área refaz o SPF **só ali**.",
        "Regra de ouro: toda área precisa estar ligada à **área 0 (backbone)**. O tráfego entre áreas **passa pelo backbone**.",
        "Neste lab: área 1 — backbone — área 2. R1 e R4 nunca se falam diretamente; passam por R2 e R3.",
      ],
    },
    {
      title: "Tipos de roteador e o ABR",
      table: {
        head: ["Tipo", "Onde está", "Neste lab"],
        rows: [
          ["**Internal**", "Todas as interfaces na **mesma** área", "R1 (área 1) e R4 (área 2)"],
          ["**Backbone**", "Tem interface na **área 0**", "R2 e R3"],
          ["**ABR** (Area Border Router)", "Interfaces em **duas ou mais** áreas", "R2 (1 e 0) e R3 (0 e 2)"],
          ["**ASBR**", "Injeta rotas **externas** (redistribute)", "Nenhum aqui"],
        ],
      },
      points: [
        "O ABR tem **um banco de dados por área** e é quem **liga** as áreas.",
        "No FRR: `show ip ospf` diz `This router is an ABR`; na Router LSA o ABR aparece com `Flags: 0x1 : ABR`.",
      ],
    },
    {
      title: "As LSAs e seus escopos",
      table: {
        head: ["Tipo", "Nome", "Quem origina", "Até onde vai"],
        rows: [
          ["**1**", "Router LSA", "Todo roteador", "Só a **sua área**"],
          ["**2**", "Network LSA", "O DR", "Só a **sua área**"],
          ["**3**", "Summary LSA", "O **ABR**", "As **outras áreas**"],
          ["**4**", "ASBR-Summary", "O ABR", "Outras áreas (localiza o ASBR)"],
          ["**5**", "AS-External", "O ASBR", "**Todo o AS** (menos áreas stub)"],
        ],
      },
      points: [
        "Detalhe **topológico** (Type 1 e 2) **não atravessa** o ABR. O que atravessa são **prefixos e custos**: a Type-3.",
        "Por isso o ABR é também um **ponto de sumarização natural**.",
      ],
    },
    {
      title: "A Type-3 (Summary LSA)",
      points: [
        "Para cada rota intra-área, o ABR gera **uma Type-3** na outra área: o **prefixo**, a **máscara** e a **métrica** (custo até o prefixo, vista do ABR).",
        "Uma Type-3 **não carrega topologia** — é como um vetor de distância entre áreas: o roteador sabe o custo **até o ABR** e o custo **do ABR até o prefixo**.",
        "**O ABR re-origina:** R2 anuncia na área 0; R3 pega isso e **gera uma Type-3 nova** na área 2, com **ele** como Advertising Router.",
        "Resultado: R4 vê todas as Type-3 de fora da área 2 anunciadas por **3.3.3.3** (R3) — **nunca por R2**.",
      ],
    },
    {
      title: "A Type-3 no fio",
      code: "10.0.34.1 > 224.0.0.5: OSPFv2, LS-Update, length 140\n\tRouter-ID 3.3.3.3, Area 0.0.0.2, Authentication Type: none (0), 4 LSAs\n\t  LSA #1\n\t  Advertising Router 3.3.3.3, seq 0x80000001, age 1s, length 8\n\t    Summary LSA (3), LSA-ID: 172.20.10.0\n\t    Mask 255.255.255.0\n\t\ttopology default (0) metric 20",
      points: [
        "**Area 0.0.0.2**: o pacote pertence à área 2 — é a única que R4 enxerga.",
        "**Router-ID 3.3.3.3** e **Advertising Router 3.3.3.3**: quem originou nesta área.",
        "**Summary LSA (3)** + **LSA-ID** (o prefixo) + **Mask** + **metric**: a rota inteira cabe em uma LSA de 8 bytes de corpo.",
        "**age**: 1s numa LSA nova. Uma LSA com **age 3600s** (MaxAge) está sendo **retirada**.",
      ],
      note: "Saída real do tcpdump em R4 logo depois de configurar o area range.",
    },
    {
      title: "O problema: uma LSA por rota",
      points: [
        "Sem sumarização, **cada** prefixo intra-área vira uma Type-3 em **cada** área. Três hosts em R1 = **três LSAs** cruzando o backbone até R4.",
        "Numa empresa com dezenas de filiais, são **milhares** de entradas em cada LSDB — e cada uma consome memória e SPF.",
        "Pior: **cada mudança viaja**. Se um host da filial cai, R1 atualiza a sua Router LSA, R2 **retira** a Type-3 dele da área 0, R3 retira da área 2... e **todo** roteador de **todas** as áreas processa.",
        "Instabilidade numa filial deixa de ser um problema **local**.",
      ],
    },
    {
      title: "A instabilidade, capturada",
      code: "10.0.34.1 > 224.0.0.5: OSPFv2, LS-Update, length 56\n\tRouter-ID 3.3.3.3, Area 0.0.0.2, Authentication Type: none (0), 1 LSA\n\t  LSA #1\n\t  Advertising Router 3.3.3.3, seq 0x80000001, age 3600s, length 8\n\t    Summary LSA (3), LSA-ID: 172.20.10.3\n\t    Mask 255.255.255.255\n\t\ttopology default (0) metric 20",
      points: [
        "É o que R4 recebe quando o host `172.X.10.3` **some** de R1: a Type-3 **/32** dele chega com **age 3600s** — o **flush**.",
        "Quando o host **volta**, chega a mesma LSA com **seq 0x80000002** e **age 1s**.",
        "R4 **nem tem relação** com esse host — mas processa os dois pacotes mesmo assim.",
      ],
      note: "Validado neste lab: R1 retira o /32 do loopback e o flush chega a R4 em menos de 1 segundo.",
    },
    {
      title: "area range — sumarizando no ABR",
      code: "router ospf\n area 1 range 172.20.10.0/24",
      points: [
        "Configura-se **no ABR** (R2), na **área de origem** das rotas (área **1**): *\"as rotas desta área, anuncie só esta faixa para fora\"*.",
        "O ABR passa a gerar **uma** Type-3 `/24` no lugar das três `/32`, e **retira** as três antigas.",
        "A **métrica** da faixa é a **maior** entre as rotas cobertas (RFC 2328), a menos que se force com `cost N`.",
        "Opções: `cost N` (fixa o custo) e `not-advertise` (suprime a faixa — usada para **esconder** prefixos).",
        "As rotas **dentro da área 1** não mudam: R1 e R2 continuam com as `/32`. A sumarização só afeta o que **sai** da área.",
      ],
      note: "O `area range` leva alguns segundos (~5 s) para valer: o ABR espera um instante antes de reoriginar.",
    },
    {
      title: "A rota de descarte (blackhole)",
      code: "R2# show ip route 172.20.10.0/24\nRouting entry for 172.20.10.0/24\n  Known via \"ospf\", distance 110, metric 0, best\n  * unreachable (blackhole), weight 1",
      points: [
        "O ABR instala a faixa como **rota de descarte** (`unreachable (blackhole)`).",
        "Por quê: a faixa é **maior** que as rotas reais. Se um host sumir, o ABR continua anunciando a faixa — e o tráfego para o endereço que **não existe** poderia **voltar** ao ABR em **loop**.",
        "A rota de descarte tem a **menor preferência** (é uma `/24`; as `/32` reais, mais específicas, ganham). Só pega o que **sobra**.",
        "É o preço da sumarização: se **todos** os hosts caírem, o resto da rede **não percebe** — o tráfego vai até o ABR e morre ali.",
      ],
    },
    {
      title: "Depois da sumarização: a mesma instabilidade",
      points: [
        "Com `area 1 range`, o host `172.X.10.N` some de R1 → R1 atualiza a Router LSA **na área 1** → R2 recalcula... e a faixa **continua válida** (restam 2 hosts).",
        "Nada muda na Type-3 `/24`: **nem a métrica**. **Nenhuma LSA nova** sai de R2, nem de R3. **R4 não recebe nada.**",
        "A instabilidade ficou **contida na área 1**. Esse é o ganho real: não é só ter menos entradas, é **isolar mudanças**.",
        "Na captura de R4, você vai **procurar** o flush — e **não vai achá-lo**.",
      ],
    },
    {
      title: "Armadilhas",
      points: [
        "**Área errada:** o `area N range` vale para as rotas **originadas na área N**. `area 0 range 172.X.10.0/24` em R2 **não faz nada** — os hosts estão na área **1**. Validado neste lab: as três `/32` seguem em R4.",
        "**LSAs MaxAge:** depois do range, as `/32` antigas ficam no banco de R4 com **LS age: 3600** por **~50 s** antes de sumirem. Não conte essas como ativas.",
        "**Só intra-área:** `area range` **não** sumariza rotas **externas** (Type-5, de `redistribute`). Para isso é o `summary-address`, no **ASBR**.",
        "**Faixas contíguas:** sumarize onde o endereçamento foi **planejado** para isso. Uma faixa que cobre endereços que **não existem** vira buraco negro.",
      ],
    },
    {
      title: "Roteiro do Lab 11",
      points: [
        "**Passo 1:** reconhecer as áreas e os **ABRs** (`show ip ospf`).",
        "**Passo 2:** contar as **Type-3 em R4** — e ver **quem** as anuncia.",
        "**Passo 3:** com a **captura em R4**, tirar um host de R1 e ver o **flush** viajar — depois restaurar.",
        "**Passo 4:** sumarizar em **R2** com `area range`.",
        "**Passo 5:** conferir **R4** (uma LSA `/24`), **R2** (rota de descarte, `/32` ainda lá) e a conectividade.",
        "**Passo 6:** repetir o experimento **com a faixa** e ver que **R4 não recebe nada**.",
        "**Desafio:** fixar o **custo** da faixa e responder às perguntas finais.",
        "Nos passos 2, 3, 4 e 6 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas o flush do seu host e a Type-3 /24 da faixa. Deixe a captura de R4 rodando do passo 3 ao 6.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: mostrar **quem são os ABRs**; explicar **por que R4 vê as Type-3 de R3 e não de R2**; mostrar o **flush** na captura; justificar **onde e em qual área** configurou o range; explicar a **rota de descarte**; e mostrar que, **depois da sumarização, a instabilidade não chega a R4**.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` é o que o
  // professor espera ouvir — só aparece no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Quais roteadores são ABR e como você sabe? Em que áreas cada um tem interfaces?",
      lookFor: "R2 (áreas 1 e 0) e R3 (áreas 0 e 2). show ip ospf mostra 'This router is an ABR'; na Router LSA, 'Flags: 0x1 : ABR'. R1 e R4 são internos (uma só área).",
    },
    {
      id: "e2",
      prompt: "Mostre na 🔬 captura de R4 uma Type-3. Quem a anuncia, e por que não é o R2?",
      lookFor: "Summary LSA (3) no LS-Update com 'Router-ID 3.3.3.3, Area 0.0.0.2' e 'Advertising Router 3.3.3.3'. O ABR re-origina: R2 anuncia na área 0, R3 gera Type-3 nova na área 2. R4 só enxerga a área 2.",
    },
    {
      id: "e3",
      prompt: "Você tirou o host 172.{{orgOctet}}.10.{{flapHost}} de R1 antes de sumarizar. O que R4 recebeu? Mostre na captura.",
      lookFor: "LS-Update com a Summary LSA 172.{{orgOctet}}.10.{{flapHost}} (Mask 255.255.255.255) com age 3600s — o flush da Type-3 /32, anunciado por 3.3.3.3. Ao devolver o host, a LSA volta com seq maior e age 1s. R4 processa mudança de um host que nem lhe diz respeito.",
    },
    {
      id: "e4",
      prompt: "Em qual roteador e em qual área você configurou o area range? Por que não 'area 0'?",
      lookFor: "No R2, 'area 1 range 172.{{orgOctet}}.10.0/24': R2 é o ABR de saída da área 1 e os hosts são rotas da área 1. area N range vale para as rotas originadas na área N — 'area 0 range' em R2 não muda nada (as /32 seguem em R4).",
    },
    {
      id: "e5",
      prompt: "O que mudou em R4 depois do range? E em R2 — as rotas /32 continuam lá?",
      lookFor: "R4: uma única Type-3 172.{{orgOctet}}.10.0 /24 (anunciada por 3.3.3.3) e uma rota /24 só; as /32 sumiram (viram LS age 3600 por ~50 s). R2 continua com as três /32 intra-área: a sumarização só afeta o que sai da área. Percebe o atraso de ~5 s.",
    },
    {
      id: "e6",
      prompt: "O que é a rota 'unreachable (blackhole)' que apareceu em R2? Por que o ABR a instala?",
      lookFor: "Rota de descarte da faixa sumarizada (172.{{orgOctet}}.10.0/24, metric 0). Evita loop: se um host sumir, o ABR segue anunciando a faixa e o tráfego pro endereço inexistente não pode voltar ao ABR. É menos específica que as /32 — só pega o que sobra. Custo: queda total dos hosts não é percebida fora da área.",
    },
    {
      id: "e7",
      prompt: "Com o range ativo, você repetiu o experimento com o host {{flapHost}}. Por que R4 não recebeu nada? Quando isso deixaria de valer?",
      lookFor: "A faixa /24 continua válida (restam 2 hosts) e com a mesma métrica; a mudança fica contida na área 1, sem LSA nova em R2/R3. Deixaria de valer se TODOS os hosts sumissem (a faixa seria retirada) ou se a métrica mudasse. Ganho: instabilidade isolada, não só menos entradas.",
    },
  ],

  autoGrade: [
    { id: "checked_abr", label: "Verificou que R2 é um ABR", cmdContains: "show ip ospf" },
    { id: "checked_database", label: "Verificou o banco de LSAs Type-3", cmdContains: "show ip ospf database summary" },
    { id: "host_removed", label: "Removeu um host do loopback de R1", router: "R1", cmdContains: "no ip address 172." },
    { id: "area_range_applied", label: "Aplicou 'area range' em R2", cmdContains: "area 1 range" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_type3", label: "Capturou uma Type-3 anunciada por R3 na área 2", router: "R4", capturePattern: "Router-ID 3\\.3\\.3\\.3, Area 0\\.0\\.0\\.2[\\s\\S]*Summary LSA \\(3\\)" },
    { id: "captured_flush", label: "Capturou o flush da Type-3 do host removido", router: "R4", capturePattern: "OSPFv2, LS-Update[\\s\\S]*age 3600s[^\\n]*\\n\\s*Summary LSA \\(3\\), LSA-ID: 172\\.{{orgOctet}}\\.10\\.{{flapHost}}\\s" },
    { id: "captured_range_lsa", label: "Capturou a Type-3 /24 da faixa sumarizada", router: "R4", capturePattern: "OSPFv2, LS-Update[\\s\\S]*Summary LSA \\(3\\), LSA-ID: 172\\.{{orgOctet}}\\.10\\.0\\s+Options: \\[[^\\]]*\\]\\s+Mask 255\\.255\\.255\\.0\\b" },
  ],

  verifications: [
    {
      id: "adjacencies_full",
      label: "Adjacências de R2 com R1 e R3 em Full",
      weight: 6,
      check: { router: "R2", cmdPattern: "show ip ospf neighbor", outputPattern: "1\\.1\\.1\\.1[\\s\\S]*Full[\\s\\S]*3\\.3\\.3\\.3[\\s\\S]*Full" },
    },
    {
      id: "abr_r2",
      label: "R2 reconhecido como ABR (show ip ospf)",
      weight: 4,
      check: { router: "R2", cmdPattern: "show ip ospf", outputPattern: "This router is an ABR" },
    },
    {
      id: "host_restored",
      label: "Host 172.{{orgOctet}}.10.{{flapHost}} devolvido ao loopback de R1",
      weight: 4,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip address 172\\.{{orgOctet}}\\.10\\.{{flapHost}}/32" },
    },
    {
      id: "summary_configured",
      label: "'area 1 range' configurado em R2 com a faixa correta",
      weight: 16,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "area 1 range 172\\.{{orgOctet}}\\.10\\.0/24" },
    },
    {
      id: "summary_visible_r4",
      label: "R4 (do outro lado do backbone) enxerga só a Type-3 /24, sem as /32",
      weight: 18,
      check: { router: "R4", cmdPattern: "show ip ospf database summary", outputPattern: "^(?![\\s\\S]*Link State ID: 172\\.{{orgOctet}}\\.10\\.[1-9])[\\s\\S]*Link State ID: 172\\.{{orgOctet}}\\.10\\.0 [\\s\\S]*?Network Mask: /24" },
    },
    {
      id: "route_r4",
      label: "R4 tem uma única rota /24 para a faixa (sem /32)",
      weight: 10,
      check: { router: "R4", cmdPattern: "show ip route ospf", outputPattern: "^(?![\\s\\S]*172\\.{{orgOctet}}\\.10\\.[1-9]/32)[\\s\\S]*O>\\* 172\\.{{orgOctet}}\\.10\\.0/24" },
    },
    {
      id: "discard_route_r2",
      label: "R2 instalou a faixa como rota de descarte (blackhole)",
      weight: 8,
      check: { router: "R2", cmdPattern: "show ip route 172.{{orgOctet}}.10.0/24", outputPattern: "unreachable \\(blackhole\\)" },
    },
    {
      id: "specifics_kept_r2",
      label: "R2 continua com as rotas /32 da área 1",
      weight: 6,
      check: { router: "R2", cmdPattern: "show ip route ospf", outputPattern: "O>\\* 172\\.{{orgOctet}}\\.10\\.1/32[\\s\\S]*172\\.{{orgOctet}}\\.10\\.2/32[\\s\\S]*172\\.{{orgOctet}}\\.10\\.3/32" },
    },
    {
      id: "capture_type3",
      label: "Capturou uma Type-3 anunciada por R3 (Area 0.0.0.2) em R4",
      weight: 4,
      check: { type: "capture", router: "R4", packetPattern: "Router-ID 3\\.3\\.3\\.3, Area 0\\.0\\.0\\.2[\\s\\S]*Summary LSA \\(3\\)" },
    },
    {
      id: "capture_flush",
      label: "Capturou o flush (age 3600s) da Type-3 de 172.{{orgOctet}}.10.{{flapHost}}",
      weight: 10,
      check: { type: "capture", router: "R4", packetPattern: "OSPFv2, LS-Update[\\s\\S]*age 3600s[^\\n]*\\n\\s*Summary LSA \\(3\\), LSA-ID: 172\\.{{orgOctet}}\\.10\\.{{flapHost}}\\s" },
    },
    {
      id: "capture_range_lsa",
      label: "Capturou a Type-3 172.{{orgOctet}}.10.0 com máscara /24",
      weight: 14,
      check: { type: "capture", router: "R4", packetPattern: "OSPFv2, LS-Update[\\s\\S]*Summary LSA \\(3\\), LSA-ID: 172\\.{{orgOctet}}\\.10\\.0\\s+Options: \\[[^\\]]*\\]\\s+Mask 255\\.255\\.255\\.0\\b" },
    },
  ],

  answerKey: {
    predict_step2: {
      type: "keywords",
      required: ["3", "três", "tres", "5", "cinco"],
      anyOf: true,
      points: 6,
      hint: "Cada host /32 de R1 vira uma Type-3 própria; além deles, R4 vê as Type-3 das redes de enlace de fora da área 2 (10.0.12.0 e 10.0.23.0).",
    },
    predict_flap: {
      type: "keywords",
      required: ["sim", "flush", "retir", "remov", "lsa", "age", "3600", "recebe", "atualiz"],
      anyOf: true,
      points: 6,
      hint: "Sim: R1 atualiza a Router LSA, R2 retira a Type-3 /32 da área 0 e R3 a retira da área 2 — R4 recebe a LSA com age 3600 (flush).",
    },
    predict_range: {
      type: "keywords",
      required: ["uma", "única", "unica", "1 lsa", "1 entrada", "apenas 1", "só 1", "so 1", "um só", "um so"],
      anyOf: true,
      points: 6,
      hint: "O 'area range' consolida tudo que está dentro da faixa em uma única Type-3 /24 — as três /32 são retiradas.",
    },
    predict_flap_after: {
      type: "keywords",
      required: ["não", "nao", "nada", "contid", "escond", "isol", "sem lsa", "igual", "mesma"],
      anyOf: true,
      points: 6,
      hint: "A faixa /24 continua válida (restam dois hosts) e com a mesma métrica: nenhuma LSA nova sai de R2, e R4 não recebe nada.",
    },
    q1: {
      type: "radio",
      correct: "Um roteador ABR (Area Border Router) traduz rotas intra-área em LSAs Type-3 (Summary) ao cruzarem para outra área",
      points: 10,
    },
    q2: {
      type: "radio",
      correct: "area <id> range <prefixo>, configurado no ABR que está enviando as rotas daquela área para as demais",
      points: 10,
    },
    q3: {
      type: "radio",
      correct: "Menos LSAs no banco de dados de cada área vizinha, reduzindo o custo de SPF e o impacto de instabilidade de rotas específicas dentro da área de origem",
      points: 10,
    },
    q4: {
      type: "radio",
      correct: "summary-address, aplicado no ASBR que está redistribuindo as rotas — area range só sumariza rotas intra-área, não rotas externas",
      points: 10,
    },
    q5: {
      type: "radio",
      correct: "Nada muda: area 0 range sumariza rotas da área 0 e os hosts estão na área 1",
      points: 12,
    },
    q6: {
      type: "radio",
      correct: "Rota de descarte: evita loop quando um endereço da faixa não existe e o ABR continua anunciando a faixa inteira",
      points: 12,
    },
    q7: {
      type: "radio",
      correct: "120: o custo 100 da faixa mais 10 do enlace R2–R3 e 10 do enlace R3–R4",
      points: 12,
    },
  },

  steps: [
    {
      id: 1,
      title: "Reconhecer as áreas e os ABRs",
      theory: "O OSPF divide a rede em áreas para limitar o tamanho do banco de dados de cada roteador e o alcance de cada SPF. Todo roteador mantém um banco de LSAs por área em que tem interface; roteadores de uma área só conhecem a topologia detalhada dela.\n\nO roteador que liga duas áreas é o ABR (Area Border Router). Aqui R2 liga a área 1 ao backbone (área 0) e R3 liga o backbone à área 2. R1 e R4 são roteadores internos: todas as interfaces estão numa só área.",
      description: "Rode os comandos e responda: quais roteadores são ABR? O que muda na saída de 'show ip ospf' de R1 em relação a R2? No banco de R2, quantos blocos 'Router Link States' existem, e de que áreas?",
      commands: [
        { cmd: "show ip ospf", router: "R2", desc: "Procure 'This router is an ABR' e a lista de áreas" },
        { cmd: "show ip ospf", router: "R1", desc: "R1 também é ABR? Quantas áreas tem?" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "Vizinhos de R2 — um em cada lado" },
        { cmd: "show ip ospf database", router: "R2", desc: "Um bloco de LSAs por área (Router, Net, Summary)" },
      ],
      expected: "R2 mostra 'This router is an ABR' com as áreas 0.0.0.0 (backbone) e 0.0.0.1; R1 não (é um roteador interno, só na área 1). R2 tem adjacências Full com R1 (eth1) e R3 (eth2). No banco de R2 aparecem os blocos Router/Net/Summary 'Link States' da área 0.0.0.0 e da área 0.0.0.1 — um banco por área.",
    },
    {
      id: 2,
      title: "Contar as Type-3 em R4",
      theory: "R4 está na área 2, do outro lado do backbone. Ele não conhece a topologia da área 1 — só recebe LSAs Type-3 (Summary), que descrevem prefixos e custos de fora da sua área.\n\nO ABR re-origina: R2 anuncia as rotas da área 1 na área 0; R3 pega essas rotas e gera Type-3 novas na área 2, com ele próprio como Advertising Router. Por isso R4 vê as Type-3 de fora da área 2 sempre anunciadas por 3.3.3.3, nunca por 2.2.2.2.\n\nSem nenhuma sumarização, o ABR gera uma Type-3 para cada rota intra-área.",
      description: "R1 tem três hosts /32 no loopback (172.{{orgOctet}}.10.1, .2 e .3). Antes de rodar o comando, responda a previsão. Depois, em R4, conte as Type-3 que aparecem e veja quem é o 'Advertising Router' de cada uma.",
      commands: [
        { cmd: "show ip ospf database summary", router: "R4", desc: "Type-3 conhecidas por R4 — conte e veja o Advertising Router" },
        { cmd: "show ip route ospf", router: "R4", desc: "Rotas OSPF de R4 — uma por Type-3" },
      ],
      expected: "R4 mostra 5 Type-3, todas com Advertising Router 3.3.3.3: as três /32 dos hosts de R1 (172.{{orgOctet}}.10.1, .2 e .3, Network Mask /32) mais 10.0.12.0/30 e 10.0.23.0/30 (as redes de enlace de fora da área 2). A tabela de rotas tem uma entrada O para cada uma, via 10.0.34.1.",
      predict: {
        id: "predict_step2",
        prompt: "Antes de rodar: quantas LSAs Type-3 você espera ver em R4 só para os hosts de R1 (172.{{orgOctet}}.10.x)?",
      },
    },
    {
      id: 3,
      title: "Provocar uma instabilidade e capturar o flush",
      theory: "Sem sumarização, cada host da filial é uma Type-3 própria em cada área. Se um deles some, a mudança viaja: R1 atualiza a sua Router LSA (área 1), R2 retira a Type-3 do host na área 0 e R3 a retira na área 2. Retirar uma LSA é reenviá-la com age 3600s (MaxAge): o flush.\n\nVocê vai observar isso no fio, em R4 — que nem tem relação com o host.",
      description: "Abra a captura em R4, interface 'todas', protocolo OSPF, e espere uns 20 segundos. DEIXE A CAPTURA RODANDO até o fim do passo 6 (se ela parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).\n\nResponda a previsão e, em R1, tire UM host do loopback:\n  configure terminal\n  interface lo\n   no ip address 172.{{orgOctet}}.10.{{flapHost}}/32\n  end\n\nEm R4, rode 'show ip route ospf' e procure a Type-3 na captura:\n  • um LS-Update com 'age 3600s' e 'Summary LSA (3), LSA-ID: 172.{{orgOctet}}.10.{{flapHost}}';\n  • 'Router-ID 3.3.3.3, Area 0.0.0.2' no cabeçalho — quem anunciou.\n\nPor fim DEVOLVA o host (a captura vai mostrar a LSA voltando com seq maior e age 1s):\n  configure terminal\n  interface lo\n   ip address 172.{{orgOctet}}.10.{{flapHost}}/32\n  end\n\nAtenção: a Type-3 'sumida' pode continuar listada no banco de R4 por alguns segundos, com 'LS age: 3600'. Para saber se a rota existe, olhe a tabela de rotas.",
      capture: { router: "R4", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme os três hosts no loopback antes de mexer" },
        { cmd: "show ip route ospf", router: "R4", desc: "A rota do host removido saiu? (rode também depois de devolver)" },
        { cmd: "show ip ospf database summary", router: "R4", desc: "A Type-3 do host aparece com LS age 3600?" },
      ],
      expected: "Na captura, em menos de 1 segundo depois do 'no ip address': LS-Update com 'Router-ID 3.3.3.3, Area 0.0.0.2' e a Summary LSA 172.{{orgOctet}}.10.{{flapHost}} (Mask 255.255.255.255) com 'age 3600s'. A rota /32 some da tabela de R4. Ao devolver o host, a mesma LSA reaparece com seq 0x80000002 e 'age 1s', e a rota volta.",
      predict: {
        id: "predict_flap",
        prompt: "R4 está na área 2 e não tem nenhuma relação com os hosts de R1. Quando um desses hosts sumir, você espera que R4 receba alguma coisa? O quê?",
      },
    },
    {
      id: 4,
      title: "Sumarizar em R2 com area range",
      theory: "O comando 'area <id> range <prefixo>' é configurado no ABR, na área de ORIGEM das rotas (aqui, área 1, em R2). Ele diz: 'em vez de anunciar cada rota intra-área desta área individualmente para as outras áreas, anuncie só esta faixa'. O ABR retira as Type-3 individuais e gera uma só.\n\nAs rotas específicas continuam existindo dentro da área 1 normalmente — a sumarização só afeta o que é anunciado para FORA dela. O efeito leva alguns segundos para valer.",
      description: "Em R2, configure a sumarização da faixa que cobre os três hosts de R1:\n\n  configure terminal\n  router ospf\n   area 1 range 172.{{orgOctet}}.10.0/24\n  end\n\nEspere uns 10 segundos. Na captura de R4, procure o LS-Update com a Type-3 'LSA-ID: 172.{{orgOctet}}.10.0' e 'Mask 255.255.255.0' — e repare que, no mesmo pacote, as três /32 chegam com 'age 3600s' (são retiradas).",
      capture: { router: "R4", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme a linha 'area 1 range' dentro de 'router ospf'" },
        { cmd: "show ip ospf database summary", router: "R4", desc: "A Type-3 /24 apareceu? (as /32 podem ainda estar com LS age 3600)" },
      ],
      expected: "R2 mostra 'area 1 range 172.{{orgOctet}}.10.0/24' em router ospf. Depois de ~5 s, a captura de R4 mostra um LS-Update (Area 0.0.0.2, Advertising Router 3.3.3.3) com a Summary LSA 172.{{orgOctet}}.10.0, Mask 255.255.255.0, e as três /32 com age 3600s.",
      predict: {
        id: "predict_range",
        prompt: "Depois do 'area range', quantas LSAs Type-3 você espera ver em R4 para a faixa 172.{{orgOctet}}.10.x?",
      },
    },
    {
      id: 5,
      title: "Conferir o efeito: R4, R2 e a conectividade",
      theory: "Depois do range, o ABR retirou as três /32 e passou a anunciar só a /24. Aguarde cerca de 1 minuto: as /32 antigas ficam no banco de R4 com 'LS age: 3600' (MaxAge) até serem removidas.\n\nO ABR também instala a faixa como rota de descarte ('unreachable (blackhole)'), para evitar loops quando alguém tenta chegar num endereço da faixa que não existe. As rotas /32 reais, mais específicas, ganham dela — a de descarte só pega o que sobra.",
      description: "Aguarde cerca de 1 minuto depois do range e confira:\n\n1) R4: o banco tem só UMA Type-3 para a faixa (Network Mask /24)? Sobraram /32 sem 'LS age: 3600'? E a tabela de rotas?\n2) R2 (o ABR): 'show ip route 172.{{orgOctet}}.10.0/24' — que tipo de rota é? E as /32, ainda estão na tabela?\n3) Conectividade: R4 ainda tem caminho para os hosts de R1? Use 'show ip route 172.{{orgOctet}}.10.2' para ver qual rota e qual next-hop atendem o host .2.",
      commands: [
        { cmd: "show ip ospf database summary", router: "R4", desc: "Só uma Type-3 172.X.10.0 /24? (sem /32 ativas)" },
        { cmd: "show ip route ospf", router: "R4", desc: "Uma rota /24 em lugar das três /32" },
        { cmd: "show ip route 172.{{orgOctet}}.10.0/24", router: "R2", desc: "A rota de descarte (blackhole) do ABR" },
        { cmd: "show ip route ospf", router: "R2", desc: "As /32 da área 1 continuam em R2?" },
        { cmd: "show ip route 172.{{orgOctet}}.10.2", router: "R4", desc: "R4 ainda chega ao host .2? Qual o next-hop?" },
      ],
      expected: "R4: uma única Type-3 172.{{orgOctet}}.10.0 com 'Network Mask: /24', Advertising Router 3.3.3.3, Metric 20 (as /32 antigas somem do banco em ~1 min) e uma rota 'O>* 172.{{orgOctet}}.10.0/24 via 10.0.34.1'. R2: 'unreachable (blackhole)' para 172.{{orgOctet}}.10.0/24 (metric 0) e as três /32 ainda presentes (via 10.0.12.1, eth1). Para o host .2, R4 ainda tem rota — agora a /24.",
    },
    {
      id: 6,
      title: "Repetir a instabilidade com a faixa ativa",
      theory: "Com a faixa ativa, o host que some de R1 continua dentro de uma /24 válida — restam dois hosts, e a métrica da faixa não muda. O ABR não precisa gerar nenhuma LSA nova: a mudança fica contida na área 1.\n\nEsse é o ganho real da sumarização: não é só ter menos entradas no banco, é isolar a instabilidade.",
      description: "Com a captura de R4 ainda rodando e as /32 antigas já removidas do banco (passo 5), repita o experimento do passo 3 com o MESMO host: responda a previsão, remova 172.{{orgOctet}}.10.{{flapHost}}/32 do loopback de R1, espere uns 10 segundos e DEVOLVA o host.\n\nCompare com o passo 3: a captura de R4 recebeu algum LS-Update com a LSA desse host? E a rota /24 de R4 mudou?\n\nLogo depois de remover o host, rode 'show ip route ospf' em R2: a /32 dele saiu? A instabilidade aconteceu na área 1 — só ficou escondida de R4.",
      capture: { router: "R4", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show ip route ospf", router: "R2", desc: "A /32 do host sumiu em R2? (rode durante e depois)" },
        { cmd: "show ip ospf database summary", router: "R4", desc: "A Type-3 /24 continua igual (mesma Metric, mesmo seq)?" },
        { cmd: "show ip route ospf", router: "R4", desc: "A rota /24 não mudou" },
      ],
      expected: "Em R2, a rota /32 do host sai e volta (a instabilidade existe na área 1). Em R4 nada muda: a captura não mostra nenhum LS-Update novo para 172.{{orgOctet}}.10.{{flapHost}} nem para a faixa, e a Type-3 /24 mantém a mesma Metric e o mesmo seq. A instabilidade ficou contida.",
      predict: {
        id: "predict_flap_after",
        prompt: "Agora a faixa 172.{{orgOctet}}.10.0/24 está sumarizada em R2. Quando o host {{flapHost}} sumir de R1 de novo, você espera que R4 receba alguma coisa? Por quê?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Explique a Sumarização para a Turma",
    description: "Você já aplicou a sumarização e comparou a instabilidade antes e depois. Estado final esperado:\n\n1. 'area 1 range 172.{{orgOctet}}.10.0/24' em R2, e R4 com uma única Type-3 /24.\n2. O host 172.{{orgOctet}}.10.{{flapHost}} de volta ao loopback de R1.\n\nExperimento extra (opcional, vale para a última pergunta): em R2, fixe o custo da faixa com 'area 1 range 172.{{orgOctet}}.10.0/24 cost 100', espere uns 10 segundos e olhe a Type-3 e a rota /24 em R4.\n\nDepois responda às perguntas, incluindo um caso em que 'area range' NÃO seria a ferramenta certa.",
    hints: [
      "'area range' opera no ABR, sobre rotas intra-área",
      "O número depois de 'area' é a área das rotas que você quer sumarizar, não a de destino",
      "Rotas externas (redistribuídas) usam um mecanismo de sumarização diferente",
      "A faixa é anunciada com um custo; cada enlace até R4 soma o seu",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "O que faz um roteador ABR no contexto de sumarização OSPF?",
        options: [
          "Troca rotas BGP com outros ASes",
          "Um roteador ABR (Area Border Router) traduz rotas intra-área em LSAs Type-3 (Summary) ao cruzarem para outra área",
          "Filtra rotas usando route-map antes de enviar para vizinhos eBGP",
          "Elege o Designated Router de uma rede broadcast",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "Qual comando e em qual roteador você configura para sumarizar rotas intra-área de uma área?",
        options: [
          "summary-address, no roteador que está na área de destino",
          "area <id> range <prefixo>, configurado no ABR que está enviando as rotas daquela área para as demais",
          "redistribute ospf, em qualquer roteador da topologia",
          "network <prefixo> area <id>, no roteador de origem da rota",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Qual o principal benefício de sumarizar rotas intra-área no ABR?",
        options: [
          "Aumenta a segurança da rede contra ataques externos",
          "Permite usar endereços IP duplicados em áreas diferentes",
          "Elimina a necessidade de área 0 (backbone)",
          "Menos LSAs no banco de dados de cada área vizinha, reduzindo o custo de SPF e o impacto de instabilidade de rotas específicas dentro da área de origem",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Se, em vez de rotas intra-área, R1 estivesse redistribuindo rotas estáticas (LSAs Type-5, externas), qual seria o comando certo para sumarizá-las?",
        options: [
          "area 1 range, do mesmo jeito",
          "network area, com uma máscara maior",
          "summary-address, aplicado no ASBR que está redistribuindo as rotas — area range só sumariza rotas intra-área, não rotas externas",
          "Não é possível sumarizar rotas externas no OSPF",
        ],
      },
      {
        id: "q5",
        type: "radio",
        text: "O que acontece se, em R2, você configurar 'area 0 range 172.X.10.0/24' em vez de 'area 1 range ...'?",
        options: [
          "Nada muda: area 0 range sumariza rotas da área 0 e os hosts estão na área 1",
          "A sumarização funciona do mesmo jeito, só que na área do backbone",
          "O OSPF rejeita o comando",
          "R4 deixa de enxergar os hosts",
        ],
      },
      {
        id: "q6",
        type: "radio",
        text: "Por que o ABR instalou 172.X.10.0/24 como 'unreachable (blackhole)' em R2?",
        options: [
          "É um erro: o ABR perdeu a rota para a faixa",
          "Para bloquear o tráfego vindo de R4 por segurança",
          "Rota de descarte: evita loop quando um endereço da faixa não existe e o ABR continua anunciando a faixa inteira",
          "Porque o range só vale depois que a rota é instalada na RIB",
        ],
      },
      {
        id: "q7",
        type: "radio",
        text: "Com 'area 1 range 172.X.10.0/24 cost 100', o LSA da faixa chega a R4 com metric 110. Qual a métrica da rota /24 na tabela de R4?",
        options: [
          "100: o custo fixado no range",
          "110: igual à métrica do LSA",
          "120: o custo 100 da faixa mais 10 do enlace R2–R3 e 10 do enlace R3–R4",
          "20: o cost é ignorado em rotas inter-área",
        ],
      },
    ],
  },
};

lab.frr_configs = {
  R1: `frr version 9.0
hostname R1
!
interface lo
 ip address 1.1.1.1/32
 ip address 172.{{orgOctet}}.10.1/32
 ip address 172.{{orgOctet}}.10.2/32
 ip address 172.{{orgOctet}}.10.3/32
!
interface eth1
 ip address 10.0.12.1/30
!
router ospf
 ospf router-id 1.1.1.1
 network 10.0.12.0/30 area 1
 network 172.{{orgOctet}}.10.0/24 area 1
!
`,
  R2: `frr version 9.0
hostname R2
!
interface lo
 ip address 2.2.2.2/32
!
interface eth1
 ip address 10.0.12.2/30
!
interface eth2
 ip address 10.0.23.1/30
!
router ospf
 ospf router-id 2.2.2.2
 network 10.0.12.0/30 area 1
 network 10.0.23.0/30 area 0
!
`,
  R3: `frr version 9.0
hostname R3
!
interface lo
 ip address 3.3.3.3/32
!
interface eth1
 ip address 10.0.23.2/30
!
interface eth2
 ip address 10.0.34.1/30
!
router ospf
 ospf router-id 3.3.3.3
 network 10.0.23.0/30 area 0
 network 10.0.34.0/30 area 2
!
`,
  R4: `frr version 9.0
hostname R4
!
interface lo
 ip address 4.4.4.4/32
!
interface eth1
 ip address 10.0.34.2/30
!
router ospf
 ospf router-id 4.4.4.4
 network 10.0.34.0/30 area 2
!
`,
};

module.exports = lab;
