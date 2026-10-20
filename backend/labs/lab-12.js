/**
 * Lab 12 — OSPF Nível 5: Área Stub e Totally Stubby
 * Topic: Escopo de flooding de LSA Type-4/5 e rota default
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - antes do stub R1 recebe Summary (3), ASBR Summary (4) e External (5)
 *    (rota O E2) — as quatro LSAs aparecem num LS-Update capturado em R1
 *    depois de um `clear ip ospf process`;
 *  - o Hello leva o E-bit: 'Options [External]'; com `area 1 stub` só em R1
 *    ele sai com 'Options [none]' e a adjacência cai depois do Dead Timer
 *    (~40 s), não na hora; ao configurar R2 ela volta Full;
 *  - o FRR NÃO descarta as LSAs externas/ASBR que R1 já tinha quando a área
 *    vira stub: só um `clear ip ospf process` em R1 refaz o banco (sem
 *    Type-4/5, com a default 0.0.0.0/0 numa Summary LSA de R2);
 *  - `area 1 default-cost N` muda a métrica da Summary 0.0.0.0/0;
 *  - `area 1 stub no-summary` (só no ABR) tira também as Summary LSAs comuns:
 *    R1 fica só com a default, e a rota 10.0.23.0/30 some (outro `clear` em
 *    R1 para refletir);
 *  - no contêiner a default do kernel (gerência, eth0, distância 0) vence a
 *    default OSPF em `show ip route 0.0.0.0/0`: a evidência é a LSA Summary
 *    e `show ip route ospf`.
 */

// Dentro de um mesmo LS-Update (um pacote traz várias LSAs): não atravessa para o seguinte
const LSA_NT = "(?:(?!LSA #)[\\s\\S])*?";

const lab = {
  id: 12,
  protocol: "ospf",
  level: 5,
  scenario: "Uma filial pequena, conectada por um link mais fraco e com um roteador de baixo custo, não precisa (e mal aguenta) manter um banco de dados com cada rota externa da internet que a matriz redistribui no OSPF — ela só precisa de UM jeito de sair. Área stub existe exatamente para esse cenário: simplifica drasticamente o que a filial precisa processar, sem cortar sua conectividade com o resto do mundo. Você vai ver as LSAs externas chegando à filial, o que acontece quando só um lado vira stub e quanto o banco encolhe com a área stub e com a totally stubby.",
  title: "OSPF Área Stub — Escopo de Flooding de LSA Type-5",
  topic: "Área Stub, Totally Stubby e rota default",
  difficulty: "Avançado",
  duration: "60 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  routers: ["R1", "R2", "R3"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
  ],

  variables: {
    extNet: { pool: ["203.0.113", "198.51.100", "192.0.2", "203.0.114"] },
    // custo da default anunciada à área stub (aparece na Summary 0.0.0.0/0)
    defaultCost: { pool: ["20", "30", "40", "50"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=12). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "OSPF — Área Stub e Totally Stubby",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 12",
      points: [
        "As LSAs que **chegam** a uma filial: **Type 3, 4 e 5**",
        "O **ASBR** e a LSA **Type 5** (externa)",
        "**`area stub`**: o que ela **bloqueia** e o que ela **cria**",
        "O **E-bit** no Hello — e o que acontece com **um lado só**",
        "A armadilha das LSAs **que ficam** no banco",
        "**`no-summary`** (totally stubby) e o **custo da default**",
      ],
      note: "Este lab parte do Lab 11: ABR, Type-3 e a leitura das LSAs no fio.",
    },
    {
      title: "A topologia do Lab 12",
      diagram: [
        "   ÁREA 1             ÁREA 0 (backbone)",
        "  10.0.12.0/30          10.0.23.0/30",
        "  ┌────┐ .1     .2 ┌────┐ .1       .2 ┌────┐",
        "  │ R1 ├─eth1─eth1─┤ R2 ├─eth2─eth1──┤ R3 │",
        "  └────┘           └────┘            └─┬──┘",
        "  filial           ABR                 │ ASBR",
        "  (interno)                  redistribute static",
        "                             192.0.2.0/24 → Null0",
      ].join("\n"),
      points: [
        "**R1** é a **filial**, sozinha na área 1. **R2** é o **ABR** entre a área 1 e o backbone.",
        "**R3** é o **ASBR**: redistribui uma rota **estática** (`ip route <rede externa> Null0`) no OSPF — a \"internet\" do exemplo.",
        "A pergunta do lab: **R1 precisa conhecer essa rota externa específica?** Ou basta saber **sair**?",
      ],
    },
    {
      title: "Quais LSAs chegam a R1",
      table: {
        head: ["LSA", "Quem origina", "Para quê"],
        rows: [
          ["**Type 3** Summary", "O ABR (R2)", "Rotas **de outras áreas** (`10.0.23.0/30`)"],
          ["**Type 4** ASBR Summary", "O ABR (R2)", "**Onde está o ASBR** (R3): sem isso, R1 não sabe chegar a quem anunciou a externa"],
          ["**Type 5** External", "O ASBR (R3)", "A rota **externa** em si (`E2`)"],
        ],
      },
      points: [
        "A **Type 5** é **global**: inunda **todas as áreas normais**. A **Type 4** existe só para as outras áreas **alcançarem o ASBR**.",
        "Cada rota externa nova = **uma LSA a mais** em **todos** os roteadores de **todas** as áreas — até na filial pequena.",
        "No FRR: `show ip ospf database` mostra **Summary**, **ASBR-Summary** e **AS External**.",
      ],
    },
    {
      title: "As LSAs no fio",
      code: "10.0.12.2 > 10.0.12.1: OSPFv2, LS-Update\n\t  Summary LSA (3), LSA-ID: 10.0.23.0\n\t    Options: [External]\n\t  ASBR Summary LSA (4), LSA-ID: 3.3.3.3\n\t    Options: [External]\n\t  External LSA (5), LSA-ID: 198.51.100.0\n\t    Options: [External]",
      points: [
        "Um **LS-Update** de R2 para R1 leva as três: **Summary (3)**, **ASBR Summary (4)** e **External (5)**.",
        "O `LSA-ID` da Type 5 é a **rede externa**; o da Type 4 é o **Router ID do ASBR** (`3.3.3.3`).",
        "Para ver isso na captura, force uma **nova sincronização**: `clear ip ospf process` em R1 com a captura rodando.",
      ],
      note: "Saída real do tcpdump em R1, antes de a área virar stub.",
    },
    {
      title: "area stub",
      points: [
        "**`area 1 stub`** diz: *\"esta área **não recebe** LSAs de fora do AS\"*. O ABR **para de passar** as **Type 4 e 5** para ela.",
        "Em troca, o ABR **cria uma rota default** `0.0.0.0/0` como **Summary LSA (Type 3)**. R1 sai por ela para **qualquer** destino externo.",
        "R1 passa a ter **menos LSAs** e **menos rotas**: a externa específica **some**, substituída pela **default**.",
        "Restrição: um **ASBR não pode estar numa área stub** (ela não carrega Type 5). Por isso R3 fica no backbone.",
      ],
      code: "router ospf\n area 1 stub",
    },
    {
      title: "O E-bit: tem que bater nos dois lados",
      code: "(antes)\n10.0.12.1 > 224.0.0.5: OSPFv2, Hello\n\tRouter-ID 1.1.1.1, Area 0.0.0.1\n\tOptions [External]\n\n(R1 com area 1 stub)\n10.0.12.1 > 224.0.0.5: OSPFv2, Hello\n\tRouter-ID 1.1.1.1, Area 0.0.0.1\n\tOptions [none]",
      points: [
        "O **E-bit** (*External routing capability*) viaja no **Hello**, no campo **Options**. **`[External]`** = a área aceita rotas externas; **`[none]`** = **stub**.",
        "Os dois lados do enlace **precisam concordar**. Se R1 virar stub e R2 não, os Hellos **não batem** e a adjacência **não se mantém**.",
        "A queda **não é instantânea**: a adjacência existente só **expira no Dead Timer** (**40 s**). Por isso você vai **esperar** e olhar o `show ip ospf neighbor`.",
        "Quando R2 também vira stub, os Hellos voltam a bater e a adjacência **volta a Full**.",
      ],
      note: "Validado neste lab: com stub só em R1, a adjacência continuou Full por ~30 s e depois foi refeita ao configurar R2.",
    },
    {
      title: "A armadilha: as LSAs que ficam",
      points: [
        "Depois que **os dois lados** são stub, esperar-se-ia que R1 perdesse as **Type 4 e 5**. **No FRR, não perde.**",
        "O banco de R1 **continua mostrando** a External (5) que ele já tinha. A rota não está mais na **tabela de rotas**, mas a **LSA fica**.",
        "Para o banco refletir a nova realidade: **`clear ip ospf process` em R1**. Aí sim: sem Type 4/5 e só a **default** vinda de R2.",
        "É um detalhe de implementação, mas **cai em prova** e **em produção**: *\"configurei o stub e a LSA continua lá\"*.",
      ],
      note: "Validado neste lab: depois do `clear ip ospf process` em R1, o banco ficou com a Summary 0.0.0.0/0 e sem External nem ASBR Summary.",
    },
    {
      title: "A default: custo e onde olhar",
      points: [
        "A Summary `0.0.0.0/0` que R2 cria tem **custo padrão 1**. `area 1 default-cost N` **muda** esse custo — útil se houver **dois ABRs** e você quiser **preferir um**.",
        "Em R1, a rota default tem **custo = N + 10** (o enlace R1–R2). Na LSA, em `show ip ospf database summary`, o campo **Metric** mostra **N**.",
        "**Cuidado com a RIB:** nos contêineres do lab existe uma **default do kernel** (gerência, `eth0`, **distância 0**). Ela **vence** a default OSPF (110) em `show ip route 0.0.0.0/0`.",
        "A evidência aqui é a **Summary LSA** e `show ip route ospf` — não a default da RIB.",
      ],
      code: "router ospf\n area 1 default-cost 30",
    },
    {
      title: "Totally stubby: no-summary",
      table: {
        head: ["Tipo de área", "Type 3 (outras áreas)", "Type 4/5 (externas)", "Default"],
        rows: [
          ["**Normal**", "Sim", "Sim", "Não"],
          ["**Stub**", "**Sim**", "**Não**", "**Sim** (Type 3)"],
          ["**Totally stubby**", "**Não**", "**Não**", "**Sim**, **a única**"],
        ],
      },
      points: [
        "**`area 1 stub no-summary`** (**só no ABR**) vai além: bloqueia também as Summary LSAs **comuns**. R1 só conhece **a sua área** e a **default**.",
        "O banco da filial fica **mínimo**: `10.0.23.0/30` **desaparece** da tabela de R1 — só a default leva ao resto.",
        "O **R1 continua só com `area 1 stub`**: o `no-summary` é uma decisão do **ABR**.",
        "De novo: `clear ip ospf process` em R1 para o banco refletir.",
      ],
      code: "(em R2, o ABR)\nrouter ospf\n area 1 stub no-summary",
    },
    {
      title: "Roteiro do Lab 12",
      points: [
        "**Passo 1:** ver as **Type 3, 4 e 5** em R1 e **capturá-las** no fio.",
        "**Passo 2:** stub **só em R1**: o **E-bit** no Hello e a adjacência caindo. Depois stub em **R2**.",
        "**Passo 3:** a **default** no lugar da externa — e as LSAs **que ficam** (`clear ip ospf process`). **default-cost**.",
        "**Passo 4:** **totally stubby**: R1 só com a default.",
        "Nos passos 1, 2, 3 e 4 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas a External (5) e a ASBR Summary (4) chegando a R1, o Hello com Options [none] e a Summary 0.0.0.0/0. Deixe a captura de R1 rodando do passo 1 ao 4.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: mostrar as **LSAs 3, 4 e 5** na captura; explicar o **E-bit** e por que a adjacência **caiu com um lado só**; explicar por que a External **continuou no banco** e como resolveu; e dizer **o que R1 perde** com o `no-summary`.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Mostre na 🔬 captura de R1 as LSAs que chegam antes do stub. Para que serve cada uma?",
      lookFor: "Summary (3) 10.0.23.0 (rota de outra área), ASBR Summary (4) 3.3.3.3 (onde está o ASBR) e External (5) {{extNet}}.0 (a rota externa, E2). Type 5 é global; a Type 4 permite alcançar o ASBR a partir de outra área.",
    },
    {
      id: "e2",
      prompt: "Você configurou 'area 1 stub' só em R1. O que apareceu no Hello de R1? O que aconteceu com a adjacência e quando?",
      lookFor: "Hello de R1 com 'Options [none]' (E-bit zerado) enquanto o de R2 ainda tinha '[External]'. A adjacência não caiu na hora: expirou no Dead Timer (~40 s) e ficou fora até R2 também virar stub. O E-bit tem que bater nos dois lados.",
    },
    {
      id: "e3",
      prompt: "Depois dos dois lados em stub, a External ainda estava no banco de R1? Como você resolveu?",
      lookFor: "Sim: o FRR não descarta as LSAs que já tinha (a rota some da RIB, a LSA fica). 'clear ip ospf process' em R1 refaz o banco: sem Type 4/5 e só a Summary 0.0.0.0/0 de R2.",
    },
    {
      id: "e4",
      prompt: "O que substitui a rota externa em R1? Qual o custo e por quê?",
      lookFor: "A default 0.0.0.0/0 numa Summary LSA (Type 3) criada por R2. A Metric na LSA é {{defaultCost}} (area 1 default-cost) e a rota em R1 custa {{defaultCost}} + 10 do enlace R1–R2. Na RIB do contêiner a default do kernel (gerência) vence — evidência é a LSA e show ip route ospf.",
    },
    {
      id: "e5",
      prompt: "Com 'area 1 stub no-summary' em R2, o que R1 perdeu? Por que só em R2?",
      lookFor: "As Summary LSAs comuns: 10.0.23.0/30 sumiu; fica só a default 0.0.0.0/0. no-summary é decisão do ABR (só R2); R1 segue com 'area 1 stub'. Precisa de clear ip ospf process em R1 para refletir.",
    },
    {
      id: "e6",
      prompt: "Por que o ASBR R3 não poderia estar na área 1 (stub)?",
      lookFor: "Área stub não carrega Type 5 (externas) — o ASBR precisa gerá-las e inundá-las. Por isso o ASBR fica no backbone (ou numa área normal); numa stub só caberia com NSSA (Type 7, fora do escopo).",
    },
  ],

  autoGrade: [
    { id: "checked_external", label: "Verificou as LSAs externas em R1", router: "R1", cmdContains: "show ip ospf database external" },
    { id: "stub_typed", label: "Configurou area stub", cmdContains: "stub" },
    { id: "default_cost_typed", label: "Configurou o default-cost", router: "R2", cmdContains: "default-cost" },
    { id: "no_summary_typed", label: "Configurou o stub no-summary", router: "R2", cmdContains: "no-summary" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_type5", label: "Capturou a LSA External (Type 5) chegando a R1", router: "R1", capturePattern: "OSPFv2, LS-Update[\\s\\S]*External LSA \\(5\\), LSA-ID: {{extNet}}\\.0" },
    { id: "captured_type4", label: "Capturou a ASBR Summary (Type 4) chegando a R1", router: "R1", capturePattern: "OSPFv2, LS-Update[\\s\\S]*ASBR Summary LSA \\(4\\), LSA-ID: 3\\.3\\.3\\.3" },
    { id: "captured_hello_stub", label: "Capturou o Hello de R1 com o E-bit zerado (Options [none])", router: "R1", capturePattern: "10\\.0\\.12\\.1 > 224\\.0\\.0\\.5: OSPFv2, Hello[\\s\\S]*Options \\[none\\]" },
    { id: "captured_default", label: "Capturou a Summary LSA da default 0.0.0.0", router: "R1", capturePattern: "OSPFv2, LS-Update[\\s\\S]*Summary LSA \\(3\\), LSA-ID: 0\\.0\\.0\\.0" },
  ],

  verifications: [
    {
      id: "adjacency_full",
      label: "Adjacência R1–R2 em Full",
      weight: 4,
      check: { router: "R1", cmdPattern: "show ip ospf neighbor", outputPattern: "2\\.2\\.2\\.2[\\s\\S]*Full" },
    },
    {
      id: "stub_r1",
      label: "R1 com 'area 1 stub'",
      weight: 8,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "area 1 stub" },
    },
    {
      id: "stub_r2_no_summary",
      label: "R2 (ABR) com 'area 1 stub no-summary'",
      weight: 8,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "area 1 stub no-summary" },
    },
    {
      id: "default_cost_configured",
      label: "R2 com 'area 1 default-cost {{defaultCost}}'",
      weight: 6,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "area 1 default-cost {{defaultCost}}\\s" },
    },
    {
      id: "area_is_stub",
      label: "R1 reconhece a área 1 como Stub",
      weight: 8,
      check: { router: "R1", cmdPattern: "show ip ospf", outputPattern: "Area ID: 0\\.0\\.0\\.1 \\(Stub\\)" },
    },
    {
      id: "default_lsa_cost",
      label: "R1 recebe a Summary 0.0.0.0/0 com Metric {{defaultCost}}",
      weight: 12,
      check: { router: "R1", cmdPattern: "show ip ospf database summary", outputPattern: "Link State ID: 0\\.0\\.0\\.0[\\s\\S]*?Metric: {{defaultCost}}\\b" },
    },
    {
      id: "no_type5_in_r1",
      label: "R1 sem LSAs External (Type 5) no banco",
      weight: 8,
      check: { router: "R1", cmdPattern: "show ip ospf database external", outputPattern: "^(?![\\s\\S]*{{extNet}}\\.0)" },
    },
    {
      id: "no_type4_in_r1",
      label: "R1 sem ASBR Summary (Type 4) no banco",
      weight: 6,
      check: { router: "R1", cmdPattern: "show ip ospf database asbr-summary", outputPattern: "^(?![\\s\\S]*3\\.3\\.3\\.3)" },
    },
    {
      id: "only_default_in_r1",
      label: "R1 só com a default OSPF: sem 10.0.23.0/30 (totally stubby) e sem a rota externa",
      weight: 8,
      check: { router: "R1", cmdPattern: "show ip route ospf", outputPattern: "^(?![\\s\\S]*10\\.0\\.23\\.0/30)(?![\\s\\S]*{{extNet}}\\.0/24)[\\s\\S]*O\\s+0\\.0\\.0\\.0/0" },
    },
    {
      id: "capture_type5",
      label: "Capturou a LSA External (5) de {{extNet}}.0 chegando a R1",
      weight: 10,
      check: { type: "capture", router: "R1", packetPattern: "OSPFv2, LS-Update[\\s\\S]*External LSA \\(5\\), LSA-ID: {{extNet}}\\.0" },
    },
    {
      id: "capture_type4",
      label: "Capturou a ASBR Summary (4) do ASBR 3.3.3.3 chegando a R1",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "OSPFv2, LS-Update[\\s\\S]*ASBR Summary LSA \\(4\\), LSA-ID: 3\\.3\\.3\\.3" },
    },
    {
      id: "capture_hello_stub",
      label: "Capturou o Hello de R1 com o E-bit zerado (Options [none])",
      weight: 10,
      check: { type: "capture", router: "R1", packetPattern: "10\\.0\\.12\\.1 > 224\\.0\\.0\\.5: OSPFv2, Hello[\\s\\S]*Options \\[none\\]" },
    },
    {
      id: "capture_default",
      label: "Capturou a Summary LSA da default 0.0.0.0 chegando a R1",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "OSPFv2, LS-Update[\\s\\S]*Summary LSA \\(3\\), LSA-ID: 0\\.0\\.0\\.0" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["externa", "type-5", "tipo 5", "type 5", "redistribuída", "redistribuida", "5"],
      anyOf: true,
      points: 6,
      hint: "R3 é o ASBR — ele redistribui uma rota estática, o que gera LSA Type-5 (External) inundada para todas as áreas normais, mais a Type-4 para alcançar o ASBR.",
    },
    predict_step2: {
      type: "keywords",
      required: ["cai", "caem", "quebra", "não forma", "nao forma", "expira", "dead", "perde", "e-bit", "options"],
      anyOf: true,
      points: 6,
      hint: "O E-bit do Hello não bate entre R1 (stub) e R2 (normal): a adjacência não se mantém — expira no Dead Timer — até R2 também virar stub.",
    },
    predict_step3: {
      type: "keywords",
      required: ["default", "0.0.0.0"],
      anyOf: true,
      points: 6,
      hint: "O ABR passa a originar uma rota default (0.0.0.0/0) em uma Summary LSA, e R1 sai por ela sem conhecer cada externa.",
    },
    predict_step4: {
      type: "keywords",
      required: ["10.0.23", "outra área", "outras áreas", "summary", "type-3", "type 3", "perde", "some"],
      anyOf: true,
      points: 6,
      hint: "Com no-summary o ABR também deixa de passar as Summary LSAs comuns: R1 perde a rota 10.0.23.0/30 e fica só com a default.",
    },
    q1: { type: "radio", correct: "Um ASBR (Autonomous System Boundary Router) — um roteador que redistribui rotas de fora do OSPF, gerando LSAs Type-5", points: 8 },
    q2: { type: "radio", correct: "As LSAs Type-5 (externas) inundam todas as áreas normais por padrão, independente de a área precisar delas", points: 8 },
    q3: { type: "radio", correct: "O E-bit do pacote Hello indica capacidade de rotas externas; se não bater entre os roteadores do segmento, a adjacência não se mantém", points: 10 },
    q4: { type: "radio", correct: "Uma rota default (0.0.0.0/0) automática, originada pelo ABR da área stub", points: 8 },
    q5: { type: "radio", correct: "O FRR mantém no banco as LSAs que já tinha; 'clear ip ospf process' em R1 refaz o banco sem as Type 4 e 5", points: 10 },
    q6: { type: "radio", correct: "As Summary LSAs comuns (como 10.0.23.0/30): R1 fica só com a default", points: 10 },
    q7: { type: "radio", correct: "Hello com 'Options [External]' é área normal; com 'Options [none]' o E-bit está zerado (stub)", points: 12 },
    q8: { type: "radio", correct: "Mudar a métrica da Summary 0.0.0.0/0 que o ABR anuncia à área stub (útil para preferir um ABR)", points: 10 },
  },

  steps: [
    {
      id: 1,
      title: "Observar o flooding de LSAs externas",
      theory: `R3 é um ASBR: ele redistribui uma rota estática (representando uma rede externa, tipo 'internet') no OSPF via 'redistribute static'. Isso gera uma LSA Type-5 (AS-External), que por padrão é inundada para TODAS as áreas normais da topologia — inclusive a área 1, onde R1 está, mesmo que R1 não precise conhecer o destino específico, só precise de um jeito de sair da área.

Para R1 alcançar o ASBR, o ABR (R2) também gera uma LSA Type-4 (ASBR Summary) dentro da área 1.`,
      description: `Abra a captura em R1, interface 'todas', protocolo OSPF. DEIXE A CAPTURA RODANDO até o fim do passo 4 (se ela parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Responda a previsão e rode 'show ip ospf database' em R1: que tipos de LSA aparecem? Confira também a rota na tabela.

Para ver as LSAs no fio, force uma nova sincronização com a captura rodando:
  em R1:  clear ip ospf process
  (espere uns 30 segundos)

Na captura, encontre um LS-Update de R2 com a Summary (3), a ASBR Summary (4) e a External (5) de {{extNet}}.0.`,
      capture: { router: "R1", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show ip ospf database", router: "R1", desc: "Router, Net, Summary, ASBR-Summary e AS External" },
        { cmd: "show ip ospf database external", router: "R1", desc: "A LSA Type-5 de R3 para {{extNet}}.0/24" },
        { cmd: "show ip route ospf", router: "R1", desc: "A rota O E2 específica" },
        { cmd: "clear ip ospf process", router: "R1", desc: "Reinicia o OSPF de R1 (gera o LS-Update na captura)" },
      ],
      expected: "R1 mostra Summary (10.0.23.0/30), ASBR-Summary (3.3.3.3, de R2) e AS External ({{extNet}}.0, de 3.3.3.3, E2), e uma rota O E2 para {{extNet}}.0/24 via R2. Na captura de R1: LS-Update de R2 com 'Summary LSA (3)', 'ASBR Summary LSA (4), LSA-ID: 3.3.3.3' e 'External LSA (5), LSA-ID: {{extNet}}.0'.",
      predict: {
        id: "predict_step1",
        prompt: "Que tipo de LSA você espera encontrar em R1 para a rede redistribuída por R3, mesmo estando em outra área?",
      },
    },
    {
      id: 2,
      title: "Configurar a área 1 como stub — um lado de cada vez",
      theory: `'area <id> stub' bloqueia a entrada de LSAs Type-5 (e Type-4) naquela área — os roteadores de dentro dela deixam de precisar de um banco com cada rota externa. Só que a configuração precisa bater nos dois lados de cada link: o E-bit (capacidade de rotas externas) viaja no Hello, em 'Options'. Se um lado disser 'normal' e o outro 'stub', os Hellos não batem e a adjacência não se mantém.

A queda não é instantânea: a adjacência existente expira no Dead Timer (40 s).`,
      description: `Responda a previsão. Configure PRIMEIRO só o R1:

  configure terminal
  router ospf
   area 1 stub
  end

Na captura de R1, compare o campo 'Options' do Hello de R1 (10.0.12.1) com o de R2 (10.0.12.2). Espere cerca de 45 segundos e rode 'show ip ospf neighbor' em R1 e em R2: o que aconteceu com a adjacência?

Agora configure também o R2 (o ABR da área 1):
  configure terminal
  router ospf
   area 1 stub
  end

Espere uns 45 segundos: a adjacência volta a Full? E o 'Options' dos Hellos?`,
      capture: { router: "R1", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme 'area 1 stub' em R1" },
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Rode logo depois e de novo ~45 s depois: a adjacência caiu?" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "O mesmo, visto de R2" },
        { cmd: "show running-config", router: "R2", desc: "Depois de configurar R2: 'area 1 stub'" },
        { cmd: "show ip ospf", router: "R1", desc: "'Area ID: 0.0.0.1 (Stub)'" },
      ],
      expected: "Só com R1 em stub: o Hello de R1 sai com 'Options [none]' e o de R2 continua 'Options [External]'; a adjacência não cai na hora — expira no Dead Timer (~40 s) e fica fora. Depois de configurar R2 também, os Hellos de R2 passam a 'Options [none]', a adjacência volta a Full/DR (ou Backup) em poucos segundos e 'show ip ospf' em R1 mostra 'Area ID: 0.0.0.1 (Stub)'.",
      predict: {
        id: "predict_step2",
        prompt: "Se você configurar 'area 1 stub' só em R1 (R2 ainda normal), o que você espera que aconteça com a adjacência R1–R2? Por quê?",
      },
    },
    {
      id: 3,
      title: "A rota default no lugar das externas",
      theory: `Depois que a área 1 vira stub, o ABR (R2) para de inundar LSAs Type-4 e 5 nela e passa a originar automaticamente uma rota default (0.0.0.0/0) via LSA Type-3 — assim, R1 continua com um caminho de saída para qualquer destino externo, só que sem uma entrada para cada rota redistribuída. O custo da default pode ser ajustado com 'area 1 default-cost N'.

Atenção: o FRR não descarta as LSAs externas que R1 já tinha. Para o banco refletir a nova realidade, reinicie o OSPF em R1.`,
      description: `Responda a previsão. Primeiro ajuste o custo da default em R2:

  configure terminal
  router ospf
   area 1 default-cost {{defaultCost}}
  end

Depois, em R1, rode 'show ip ospf database' e 'show ip route ospf' ANTES de reiniciar: a LSA External ainda aparece? Agora reinicie e compare:

  clear ip ospf process

Espere ~30 segundos. Veja de novo o banco de R1 e a Summary 0.0.0.0 (qual o Metric?). Na captura, procure o LS-Update com 'Summary LSA (3), LSA-ID: 0.0.0.0'. (No contêiner, 'show ip route 0.0.0.0/0' também mostra a default do kernel da gerência, que tem preferência: use 'show ip route ospf'.)`,
      capture: { router: "R1", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme o default-cost {{defaultCost}}" },
        { cmd: "show ip ospf database external", router: "R1", desc: "ANTES do clear: a External ainda está no banco?" },
        { cmd: "clear ip ospf process", router: "R1", desc: "Refaz o banco de R1" },
        { cmd: "show ip ospf database", router: "R1", desc: "DEPOIS: sem External e sem ASBR-Summary" },
        { cmd: "show ip ospf database summary", router: "R1", desc: "A Summary 0.0.0.0/0 e o seu Metric" },
        { cmd: "show ip route ospf", router: "R1", desc: "A default O 0.0.0.0/0 no lugar da rota externa" },
      ],
      expected: "Antes do clear, a LSA External ainda aparece no banco de R1 (mas a rota O E2 já saiu da tabela). Depois do clear: sem External e sem ASBR Summary; Summary (3) 0.0.0.0/0 de 2.2.2.2 com Metric {{defaultCost}}; 'show ip route ospf' mostra 'O 0.0.0.0/0' via 10.0.12.2 (custo {{defaultCost}} + 10). Na captura: LS-Update com 'Summary LSA (3), LSA-ID: 0.0.0.0'.",
      predict: {
        id: "predict_step3",
        prompt: "Depois de configurar a área 1 como stub, o que você espera que substitua as rotas externas específicas em R1?",
      },
    },
    {
      id: 4,
      title: "Totally stubby: no-summary no ABR",
      theory: `A área stub continua recebendo as Summary LSAs (Type 3) das outras áreas. 'area 1 stub no-summary', configurado só no ABR, vai além: bloqueia também as Summary LSAs comuns e deixa passar só a default. Esse tipo de área é a totally stubby.

R1 mantém só 'area 1 stub'; o no-summary é decisão do ABR. De novo, reinicie o OSPF em R1 para o banco refletir.`,
      description: `Responda a previsão. Em R2 (o ABR):

  configure terminal
  router ospf
   area 1 stub no-summary
  end

Em R1, antes de reiniciar, olhe 'show ip route ospf' e o banco (Summary). Depois:

  clear ip ospf process

Espere ~30 segundos e compare: qual rota R1 perdeu? O que sobrou no banco e na tabela?`,
      capture: { router: "R1", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme 'area 1 stub no-summary' e o default-cost" },
        { cmd: "show ip route ospf", router: "R1", desc: "ANTES do clear: 10.0.23.0/30 ainda está lá?" },
        { cmd: "clear ip ospf process", router: "R1", desc: "Refaz o banco de R1" },
        { cmd: "show ip ospf database summary", router: "R1", desc: "Só a Summary 0.0.0.0/0?" },
        { cmd: "show ip route ospf", router: "R1", desc: "10.0.23.0/30 sumiu? Só a default?" },
      ],
      expected: "Antes do clear, a Summary 10.0.23.0 ainda está no banco e a rota na tabela. Depois do clear: o banco só tem a Summary 0.0.0.0/0 (Metric {{defaultCost}}) além das LSAs da área; 'show ip route ospf' só tem 'O 0.0.0.0/0' e a rede do enlace — 10.0.23.0/30 e a rota externa não existem mais em R1.",
      predict: {
        id: "predict_step4",
        prompt: "Com 'area 1 stub no-summary' no ABR, além das externas, o que mais você espera que R1 deixe de ver?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Stub, Totally Stubby e a Armadilha das LSAs",
    description: `Estado final esperado:

1. R1 com 'area 1 stub'; R2 (ABR) com 'area 1 stub no-summary' e 'area 1 default-cost {{defaultCost}}'.
2. O banco de R1 sem External (Type 5) nem ASBR Summary (Type 4), só com a Summary 0.0.0.0/0 (Metric {{defaultCost}}).
3. A tabela de R1 só com a default OSPF e a rede do enlace.

Responda às perguntas, baseadas no que você viu nas saídas e na captura.`,
    hints: [
      "O E-bit viaja no Hello: Options [External] ou [none]",
      "A LSA que o FRR já tinha não some sozinha: reinicie o OSPF no roteador da stub",
      "no-summary é configurado só no ABR",
      "O ASBR não pode estar numa área stub",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "O que caracteriza um roteador ASBR?",
        options: [
          "Um roteador que faz fronteira entre duas áreas OSPF",
          "O roteador eleito Designated Router em uma rede broadcast",
          "Um ASBR (Autonomous System Boundary Router) — um roteador que redistribui rotas de fora do OSPF, gerando LSAs Type-5",
          "Um roteador que só participa da área 0 (backbone)",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Por que uma rota redistribuída em R3 chegava até R1 antes de configurar a área stub?",
        options: [
          "Porque R1 tinha uma rota estática apontando para R3",
          "Porque R1 e R3 estavam na mesma área",
          "Porque BGP estava redistribuindo a rota",
          "As LSAs Type-5 (externas) inundam todas as áreas normais por padrão, independente de a área precisar delas",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Por que a adjacência cai se só um dos lados de um link configurar 'area stub'?",
        options: [
          "Porque a Area ID muda automaticamente ao ativar stub",
          "Porque o custo da interface muda para 0",
          "Isso não acontece — área stub nunca afeta a adjacência",
          "O E-bit do pacote Hello indica capacidade de rotas externas; se não bater entre os roteadores do segmento, a adjacência não se mantém",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "O que substitui as rotas externas específicas depois que uma área vira stub?",
        options: [
          "Nada — a área perde a capacidade de sair para fora",
          "Uma rota BGP injetada manualmente",
          "Uma rota default (0.0.0.0/0) automática, originada pelo ABR da área stub",
          "As rotas externas continuam chegando, só que compactadas",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Por que a LSA External ainda aparecia no banco de R1 depois de os dois lados virarem stub?",
        options: [
          "Porque a área não era realmente stub",
          "O FRR mantém no banco as LSAs que já tinha; 'clear ip ospf process' em R1 refaz o banco sem as Type 4 e 5",
          "Porque R3 continuava inundando a LSA na área 1",
          "Porque a adjacência estava em 2-Way",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "O que R1 deixa de ver com 'area 1 stub no-summary' no ABR, além das externas?",
        options: [
          "A rota do próprio enlace R1–R2",
          "A Summary da default",
          "As LSAs da própria área 1",
          "As Summary LSAs comuns (como 10.0.23.0/30): R1 fica só com a default",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "Como o E-bit aparece no Hello capturado?",
        options: [
          "Hello com 'Options [External]' é área normal; com 'Options [none]' o E-bit está zerado (stub)",
          "Hello com 'Options [none]' é área normal",
          "O E-bit só aparece em LS-Update",
          "O E-bit aparece como 'Priority 0'",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "Para que serve 'area 1 default-cost N'?",
        options: [
          "Define o custo da interface de R1",
          "Mudar a métrica da Summary 0.0.0.0/0 que o ABR anuncia à área stub (útil para preferir um ABR)",
          "Apaga a rota default da área",
          "Ativa o no-summary",
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
!
interface eth1
 ip address 10.0.12.1/30
!
router ospf
 ospf router-id 1.1.1.1
 network 10.0.12.0/30 area 1
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
router ospf
 ospf router-id 3.3.3.3
 network 10.0.23.0/30 area 0
 redistribute static
!
ip route {{extNet}}.0/24 Null0
`,
};

module.exports = lab;
