/**
 * Lab 9 — BGP Nível 6: Route Reflector e Communities
 * Topic: Escalabilidade iBGP e políticas por community
 * Difficulty: Avançado
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - sem `route-reflector-client` o RR vê tudo mas não reflete: R1 só vê as
 *    rotas de R3 e R2 só as de R4;
 *  - com os clientes, R2 recebe 192.168.3.0/24 e o UPDATE traz 'Originator ID
 *    (9)' (10.0.0.2, o R1) e 'Cluster List (10)' (o cluster-id do RR); o RR NÃO
 *    reescreve o next-hop das rotas refletidas (R2 vê 10.0.0.2);
 *  - mudar o `bgp cluster-id` troca o valor do Cluster List;
 *  - no-export de R3 chega a R1, ao RR e a R2 (iBGP não é bloqueado), mas R2
 *    não anuncia a R4 (eBGP); no-advertise para em R1: nem o RR nem R2 recebem;
 *  - Local Preference 200 aplicado em R1 (route-map in com community-list)
 *    viaja por iBGP e chega a R2 pelo RR; o simétrico (R4 marca, R2 aplica
 *    LP 50) chega a R1;
 *  - `send-community` já é o padrão no FRR 10.5 (não aparece na configuração);
 *    o lab antigo dizia que o FRR removeria a community sem ele.
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";
// Lista de prefixos de 'Updated routes:' até o prefixo procurado
const ROUTES_TO = (pfx) => "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+" + pfx;

const lab = {
  id: 9,
  protocol: "bgp",
  level: 6,
  scenario: "Um AS grande, com dezenas de roteadores iBGP, não aguenta mais manter full-mesh — o mesmo problema de escalabilidade do Lab 4, resolvido de outra forma: Route Reflectors permitem que um roteador central reflita rotas para seus clientes, eliminando a necessidade de cada par de roteadores ter uma sessão direta entre si. Communities continuam sendo a ferramenta para aplicar políticas diferenciadas conforme a rota se propaga pela rede refletida. Você vai ver no fio os atributos que o RR acrescenta e como uma community viaja pelo AS.",
  title: "Route Reflector e BGP Communities",
  topic: "Escalabilidade iBGP e políticas por community",
  difficulty: "Avançado",
  duration: "75 min",
  enabled: true,
  resourceProfile: "moderado",
  variables: {
    commHigh: { pool: ["1:100", "1:150", "1:250"] },
    commBackup: { pool: ["1:200", "1:280", "1:333"] },
    // Cluster-ID: distinto dos Router IDs do AS (10.0.0.1 a 10.0.0.3)
    clusterId: { pool: ["100.0.0.1", "100.0.0.2", "100.0.0.3", "100.0.0.4"] },
  },
  routers: ["RR", "R1", "R2", "R3", "R4"],
  links: [
    ["RR", "eth1", "R1", "eth1"],
    ["RR", "eth2", "R2", "eth1"],
    ["R1", "eth2", "R3", "eth1"],
    ["R2", "eth2", "R4", "eth1"],
  ],

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=9). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "BGP — Route Reflector e Communities",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 9",
      points: [
        "A **regra do iBGP** e o problema da **malha completa** (revisão)",
        "O **Route Reflector**: **clientes** e as regras de **reflexão**",
        "**ORIGINATOR_ID** e **CLUSTER_LIST**: a proteção contra laços, **no fio**",
        "**Communities** que viajam pelo AS: **no-export**, **no-advertise** e as **customizadas**",
        "**community-list** + route-map: política que **reage** à etiqueta",
      ],
      note: "Este lab parte dos Labs 2, 4 e 6: iBGP, confederações e communities.",
    },
    {
      title: "O problema, de novo: a malha completa",
      points: [
        "**Regra do iBGP:** um roteador **não repassa** a um peer iBGP o que aprendeu de **outro** peer iBGP. Para todos conhecerem todas as rotas, **todos falam com todos**: **n(n−1)/2** sessões.",
        "O Lab 4 resolveu com **confederações** (sub-ASes). O **Route Reflector** é a outra solução — e a mais usada.",
        "Ideia: um roteador (o **RR**) ganha **permissão** de **refletir** rotas entre **seus clientes**. Os clientes só precisam de **uma sessão: com o RR**.",
      ],
    },
    {
      title: "As regras de reflexão",
      table: {
        head: ["O RR recebeu a rota de…", "Ele reflete para…"],
        rows: [
          ["Um **cliente** iBGP", "**Todos** os outros clientes **e** os peers não-clientes"],
          ["Um peer iBGP **não-cliente**", "**Só os clientes**"],
          ["Um peer **eBGP**", "**Todos** (iBGP e eBGP)"],
        ],
      },
      points: [
        "É a **quebra controlada** do split-horizon: só o RR pode reencaminhar iBGP→iBGP, e só dentro do **cluster** (o RR + seus clientes).",
        "Sem `route-reflector-client`, **nenhum peer é cliente**: o RR **recebe** tudo mas **não reflete**.",
      ],
    },
    {
      title: "A topologia do Lab 9",
      diagram: [
        "                  AS 1",
        "   ┌─────────────────────────────────┐",
        "   │         ┌──────┐                │",
        "   │         │  RR  │ 10.0.0.1       │",
        "   │         └┬────┬┘                │",
        "   │    iBGP  │    │  iBGP           │",
        "   │      ┌───┴┐  ┌┴───┐             │",
        "   │      │ R1 │  │ R2 │             │",
        "   │      └─┬──┘  └──┬─┘             │",
        "   └────────┼────────┼───────────────┘",
        "       eBGP │        │ eBGP",
        "         ┌──┴─┐   ┌──┴─┐",
        "         │ R3 │   │ R4 │",
        "         │AS 3│   │AS 4│",
        "         └────┘   └────┘",
      ].join("\n"),
      points: [
        "**RR**, **R1** e **R2** formam o **AS 1** por iBGP (sessões entre loopbacks). **R1** e **R2** são os candidatos a **clientes**.",
        "**R3** (AS 3) e **R4** (AS 4) são vizinhos **eBGP** de R1 e R2. Cada um anuncia dois prefixos: R3 `192.168.3.0/24` e `.30.0/24`; R4 `192.168.4.0/24` e `.40.0/24`.",
        "Nenhuma sessão **entre R1 e R2**: é isso que o RR vai resolver.",
      ],
    },
    {
      title: "O estado inicial",
      table: {
        head: ["Roteador", "Rotas de R3", "Rotas de R4"],
        rows: [
          ["**RR**", "Sim (via R1)", "Sim (via R2)"],
          ["**R1**", "Sim (eBGP)", "**Não**"],
          ["**R2**", "**Não**", "Sim (eBGP)"],
        ],
      },
      points: [
        "O RR **vê tudo**: recebe de R1 e de R2. Mas **não reflete**, porque R1 e R2 **não são clientes**.",
        "R1 manda as rotas de R3 ao RR; o RR **não as repassa** a R2 (iBGP→iBGP). E vice-versa para R4.",
        "É o problema do full-mesh **sem** a malha — e é o que `route-reflector-client` conserta.",
      ],
      note: "Validado neste lab, sem nenhuma configuração.",
    },
    {
      title: "route-reflector-client",
      code: "router bgp 1\n address-family ipv4 unicast\n  neighbor 10.0.0.2 route-reflector-client\n  neighbor 10.0.0.3 route-reflector-client",
      points: [
        "**Um comando por cliente**, **só no RR**. Os clientes **não sabem** que são clientes — continuam com uma sessão iBGP normal com o RR.",
        "Depois do `clear bgp * soft`, R1 passa a ver as rotas de R4 e R2 as de R3, **sem sessão entre eles**.",
        "O **RR não reescreve o next-hop** das rotas refletidas: R2 vê as rotas de R3 com next-hop **10.0.0.2** (o R1). Os clientes precisam **alcançar** esse endereço.",
      ],
    },
    {
      title: "ORIGINATOR_ID e CLUSTER_LIST no fio",
      code: "(RR → R2)\n\t  AS Path (2), length: 6, Flags [TE]: 3\n\t  Next Hop (3), length: 4, Flags [T]: 10.0.0.2\n\t  Local Preference (5), length: 4, Flags [T]: 100\n\t  Originator ID (9), length: 4, Flags [O]: 10.0.0.2\n\t  Cluster List (10), length: 4, Flags [O]: 10.0.0.1\n\t  Updated routes:\n\t    192.168.3.0/24",
      points: [
        "Ao **refletir**, o RR acrescenta **dois atributos**, **opcionais não-transitivos**.",
        "**ORIGINATOR_ID**: o **Router ID** do roteador que **introduziu** a rota no AS (aqui `10.0.0.2`, o R1). Se uma rota voltar ao **próprio originador**, ele a **descarta**.",
        "**CLUSTER_LIST**: a lista de **cluster-ids** pelos quais a rota passou. Se um RR vir o **seu próprio** cluster-id na lista, **descarta** a rota — protege contra laços **entre RRs**.",
        "Por padrão o **cluster-id é o Router ID do RR** (`10.0.0.1`). Pode ser mudado com `bgp cluster-id`.",
      ],
      note: "Saída real do tcpdump em R2, depois de o RR refletir a rota de R3.",
    },
    {
      title: "Communities: no-export e no-advertise",
      table: {
        head: ["Community", "Quem para de anunciar", "Neste lab"],
        rows: [
          ["`no-export`", "A peers **eBGP** (continua por iBGP)", "Chega a R1, ao RR e a **R2**; R2 **não** manda a **R4**"],
          ["`no-advertise`", "A **qualquer** peer (eBGP e iBGP)", "**Para em R1**: nem o RR nem R2 recebem"],
          ["`local-AS`", "Fora do AS (e da confederação)", "—"],
        ],
      },
      points: [
        "R3 marca `192.168.30.0/24` com **no-export** na saída para R1. A rota **atravessa o iBGP** (R1 → RR → R2), mas **R2 não a repassa a R4**.",
        "Trocando por **no-advertise**, a rota fica **só em R1**: R1 **não a anuncia nem ao RR**.",
        "**send-community:** no FRR 10.5 já é o **padrão** (como no Lab 6) — a community viaja pelo iBGP sem comando extra.",
      ],
      note: "Validado neste lab: com no-export, R4 não vê 192.168.30.0/24; com no-advertise, o RR e R2 também não.",
    },
    {
      title: "Communities customizadas e community-list",
      points: [
        "Formato `AS:valor` (ex.: `1:150`): **você define o significado**. Aqui **{{commHigh}}** = *alta prioridade* e **{{commBackup}}** = *backup* — exemplos que variam por aluno.",
        "Para **reagir** a uma community, usa-se uma **community-list**, que a route-map referencia com `match community`.",
        "Fluxo: **R3 marca** a rota → **R1 reconhece** → R1 aplica **Local Preference 200** → o **LP viaja por iBGP** → **R2 recebe 200 pelo RR**.",
        "A community identifica **o que é a rota**; a **política** (LP, bloqueio, prepend) fica nos roteadores que **reagem**.",
      ],
      code: "bgp community-list standard HIGH permit 1:150\n!\nroute-map IN-FROM-R3 permit 10\n match community HIGH\n set local-preference 200\nroute-map IN-FROM-R3 permit 20\n!\nrouter bgp 1\n address-family ipv4 unicast\n  neighbor 10.2.1.2 route-map IN-FROM-R3 in",
    },
    {
      title: "A política que viaja pelo RR",
      points: [
        "**Local Preference** é carregado no UPDATE iBGP e o **RR o preserva** ao refletir. R2 recebe `192.168.3.0/24` com **LP 200** — sem ter configurado nada.",
        "O caminho inverso funciona igual: **R4** marca `192.168.40.0/24` com a community de **backup**; **R2** reage com **LP 50**; **R1** recebe a rota com **LP 50** pelo RR.",
        "É o poder do conjunto: **uma etiqueta na origem**, **uma reação na borda**, **propagada pelo RR** a todo o AS.",
      ],
      note: "Validado neste lab: R2 vê LP 200 em 192.168.3.0/24 e R1 vê LP 50 em 192.168.40.0/24.",
    },
    {
      title: "Roteiro do Lab 9",
      points: [
        "**Passo 1:** entender o problema: R1 só vê R3, R2 só vê R4. Previsão.",
        "**Passo 2:** `route-reflector-client` no RR: R2 passa a ver R3 — **captura** em R2 com **Originator** e **Cluster List**.",
        "**Passo 3:** os atributos de laço e o **`bgp cluster-id`** do RR.",
        "**Passo 4:** **no-export** em R3: a rota chega a R2 e **não** a R4.",
        "**Passo 5:** **community customizada** + community-list: **LP 200** em R1 vira LP 200 em R2.",
        "**Desafio:** o **backup** com LP 50 (R4/R2/R1) e a diferença entre **no-export** e **no-advertise**.",
        "Nos passos 1, 2, 4 e 5 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas o Originator ID e o Cluster List (com o seu cluster-id), a community no-export refletida e o UPDATE com o seu LP 200 e a sua community. Deixe a captura de R2 rodando do passo 2 ao final.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: explicar **por que R2 não via R3** antes; mostrar **Originator e Cluster List** na captura; explicar **por que o no-export não bloqueou o iBGP** mas bloqueou R4; e mostrar **como o LP 200 de R1 chegou a R2**.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "No início, por que R2 não via as rotas de R3, se o RR via? E por que o RR 'via' mas não passava adiante?",
      lookFor: "R1 aprende por eBGP e manda ao RR por iBGP; o RR não repassa iBGP→iBGP (split-horizon). Sem 'route-reflector-client', nenhum peer é cliente e o RR não reflete. R1 só via R3 e R2 só via R4.",
    },
    {
      id: "e2",
      prompt: "Mostre na 🔬 captura de R2 o UPDATE de 192.168.3.0/24. Que atributos o RR acrescentou e o que cada um faz?",
      lookFor: "'Originator ID (9)' = 10.0.0.2 (o Router ID do R1, que introduziu a rota) e 'Cluster List (10)' = cluster-id do RR ({{clusterId}} depois da mudança). Proteção contra laço: o originador descarta a rota que volta; o RR descarta se vir o próprio cluster-id. O next-hop não é reescrito (10.0.0.2).",
    },
    {
      id: "e3",
      prompt: "Você mudou o cluster-id do RR para {{clusterId}}. O que mudou no UPDATE e por quê esse valor importa?",
      lookFor: "O Cluster List passa a mostrar {{clusterId}} em vez de 10.0.0.1 (o Router ID do RR é o padrão). Importa com mais de um RR: um RR descarta rotas cujo Cluster List já tem o seu cluster-id; RRs do mesmo cluster usam o mesmo valor, de clusters diferentes usam valores diferentes.",
    },
    {
      id: "e4",
      prompt: "R3 marcou 192.168.30.0/24 com no-export. Quem recebeu a rota e quem não? Por quê?",
      lookFor: "R1, RR e R2 receberam (no-export não bloqueia iBGP; a community viaja pelo RR); R2 não anunciou a R4 (peer eBGP). R4 não tem 192.168.30.0/24. Na captura de R2: 'Community (8) ... NO_EXPORT' no UPDATE refletido.",
    },
    {
      id: "e5",
      prompt: "Como o Local Preference 200, configurado só em R1, apareceu em R2? Mostre.",
      lookFor: "R3 marca 192.168.3.0/24 com {{commHigh}}; R1 tem community-list que casa e route-map in com set local-preference 200; o LP viaja no UPDATE iBGP, o RR reflete preservando o LP e R2 recebe com LP 200. Captura de R2: 'Local Preference (5) ... 200' e 'Community ... {{commHigh}}'.",
    },
    {
      id: "e6",
      prompt: "No desafio, qual a diferença entre usar no-export e no-advertise em 192.168.30.0/24? Onde cada uma para?",
      lookFor: "no-export: a rota chega a R1, RR e R2 e só não sai por eBGP (R4 não recebe). no-advertise: R1 não a anuncia a ninguém — nem ao RR, que também não a tem, e R2 não vê. Diferença: no-advertise bloqueia iBGP também.",
    },
  ],

  autoGrade: [
    { id: "checked_initial", label: "Observou que R2 não vê as rotas de R3", router: "R2", cmdContains: "show ip bgp" },
    { id: "rr_client_typed", label: "Configurou route-reflector-client", router: "RR", cmdContains: "route-reflector-client" },
    { id: "cluster_typed", label: "Configurou o cluster-id", router: "RR", cmdContains: "cluster-id" },
    { id: "community_typed", label: "Configurou uma community", cmdContains: "set community" },
    { id: "community_list_typed", label: "Criou a community-list", router: "R1", cmdContains: "community-list" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_originator", label: "Capturou o UPDATE refletido com Originator ID e Cluster List", router: "R2", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Originator ID \\(9\\)[^\\n]*10\\.0\\.0\\.2" + UPD_NT + "Cluster List \\(10\\)[^\\n]*{{clusterId}}" + UPD_NT + ROUTES_TO("192\\.168\\.3\\.0/24") },
    { id: "captured_noexport", label: "Capturou a community NO_EXPORT refletida pelo RR", router: "R2", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Community \\(8\\), length: 4, Flags \\[OT\\]:\\s+NO_EXPORT" + UPD_NT + ROUTES_TO("192\\.168\\.30\\.0/24") },
    { id: "captured_lp_community", label: "Capturou o UPDATE com o seu LP 200 e a sua community", router: "R2", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Local Preference \\(5\\), length: 4, Flags \\[T\\]: 200" + UPD_NT + "Community \\(8\\)[^\\n]*{{commHigh}}" + UPD_NT + ROUTES_TO("192\\.168\\.3\\.0/24") },
  ],

  verifications: [
    {
      id: "bgp_established_rr",
      label: "Sessões iBGP do RR com R1 e R2 verificadas",
      weight: 2,
      check: { router: "RR", cmdPattern: "show bgp summary", outputPattern: "10\\.0\\.0\\.2[\\s\\S]*\\d{2}:\\d{2}:\\d{2}\\s+\\d+[\\s\\S]*10\\.0\\.0\\.3[\\s\\S]*\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    },
    {
      id: "rr_client_r1",
      label: "RR: R1 (10.0.0.2) configurado como route-reflector-client",
      weight: 6,
      check: { router: "RR", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.0\\.2 route-reflector-client" },
    },
    {
      id: "rr_client_r2",
      label: "RR: R2 (10.0.0.3) configurado como route-reflector-client",
      weight: 6,
      check: { router: "RR", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.0\\.3 route-reflector-client" },
    },
    {
      id: "r2_sees_r3_routes",
      label: "R2 vê as rotas de R3 (refletidas pelo RR)",
      weight: 4,
      check: { router: "R2", cmdPattern: "show ip bgp", outputPattern: "192\\.168\\.3\\.0/24" },
    },
    {
      id: "r1_sees_r4_routes",
      label: "R1 vê as rotas de R4 (refletidas pelo RR)",
      weight: 4,
      check: { router: "R1", cmdPattern: "show ip bgp", outputPattern: "192\\.168\\.4\\.0/24" },
    },
    {
      id: "cluster_id_configured",
      label: "RR com bgp cluster-id {{clusterId}}",
      weight: 6,
      check: { router: "RR", cmdPattern: "show running-config", outputPattern: "bgp cluster-id {{clusterId}}" },
    },
    {
      id: "cluster_list_seen",
      label: "R2 vê a rota refletida com o Cluster list {{clusterId}} e Originator 10.0.0.2",
      weight: 6,
      check: { router: "R2", cmdPattern: "show ip bgp 192.168.3.0/24", outputPattern: "Originator: 10\\.0\\.0\\.2, Cluster list: {{clusterId}}" },
    },
    {
      id: "noexport_configured",
      label: "R3 marca 192.168.30.0/24 com community no-export",
      weight: 6,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set community no-export" },
    },
    {
      id: "noexport_r2",
      label: "R2 recebe 192.168.30.0/24 com a community no-export (o iBGP não bloqueia)",
      weight: 6,
      check: { router: "R2", cmdPattern: "show ip bgp 192.168.30.0/24", outputPattern: "Community: no-export" },
    },
    {
      id: "noexport_r4",
      label: "R4 não vê 192.168.30.0/24 (R2 não anuncia no-export por eBGP), mas vê as outras rotas de R3",
      weight: 6,
      check: { router: "R4", cmdPattern: "show ip bgp", outputPattern: "^(?![\\s\\S]*192\\.168\\.30\\.0/24)[\\s\\S]*192\\.168\\.3\\.0/24" },
    },
    {
      id: "community_custom",
      label: "R3 marca 192.168.3.0/24 com a community {{commHigh}}",
      weight: 5,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "set community {{commHigh}}" },
    },
    {
      id: "community_list_filter",
      label: "R1: community-list reconhece {{commHigh}}",
      weight: 5,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "bgp community-list standard \\S+ (?:seq \\d+ )?permit {{commHigh}}" },
    },
    {
      id: "r1_lp_200",
      label: "R1: 192.168.3.0/24 com Local Preference 200",
      weight: 4,
      check: { router: "R1", cmdPattern: "show ip bgp 192.168.3.0/24", outputPattern: "localpref 200" },
    },
    {
      id: "r2_lp_200",
      label: "R2 recebe 192.168.3.0/24 com Local Preference 200 pelo RR",
      weight: 6,
      check: { router: "R2", cmdPattern: "show ip bgp 192.168.3.0/24", outputPattern: "localpref 200, valid, internal" },
    },
    {
      id: "backup_lp_50",
      label: "Desafio: R2 aplica LP 50 às rotas com a community {{commBackup}} e R1 as recebe com LP 50",
      weight: 8,
      check: { router: "R1", cmdPattern: "show ip bgp 192.168.40.0/24", outputPattern: "localpref 50, valid, internal" },
    },
    {
      id: "capture_originator",
      label: "Capturou o UPDATE refletido com Originator ID 10.0.0.2 e Cluster List {{clusterId}}",
      weight: 8,
      check: { type: "capture", router: "R2", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Originator ID \\(9\\)[^\\n]*10\\.0\\.0\\.2" + UPD_NT + "Cluster List \\(10\\)[^\\n]*{{clusterId}}" + UPD_NT + ROUTES_TO("192\\.168\\.3\\.0/24") },
    },
    {
      id: "capture_noexport",
      label: "Capturou a community NO_EXPORT em 192.168.30.0/24 refletida pelo RR",
      weight: 6,
      check: { type: "capture", router: "R2", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Community \\(8\\), length: 4, Flags \\[OT\\]:\\s+NO_EXPORT" + UPD_NT + ROUTES_TO("192\\.168\\.30\\.0/24") },
    },
    {
      id: "capture_lp_community",
      label: "Capturou o UPDATE para R2 com Local Preference 200 e a community {{commHigh}}",
      weight: 6,
      check: { type: "capture", router: "R2", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Local Preference \\(5\\), length: 4, Flags \\[T\\]: 200" + UPD_NT + "Community \\(8\\)[^\\n]*{{commHigh}}" + UPD_NT + ROUTES_TO("192\\.168\\.3\\.0/24") },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["split", "ibgp", "não reflete", "nao reflete", "cliente", "repassa", "refletir"],
      anyOf: true,
      points: 6,
      hint: "R1 manda as rotas de R3 ao RR por iBGP, e o RR não as repassa a R2: pela regra do iBGP um roteador não repassa o que aprendeu de outro peer iBGP — a menos que seja um Route Reflector com clientes configurados.",
    },
    predict_step2: {
      type: "keywords",
      required: ["originator", "cluster", "atributo", "loop", "laço", "laco"],
      anyOf: true,
      points: 6,
      hint: "Ao refletir, o RR acrescenta ORIGINATOR_ID (quem originou a rota no AS) e CLUSTER_LIST (os clusters pelos quais passou): são a proteção contra laços da reflexão.",
    },
    predict_step4: {
      type: "keywords",
      required: ["não", "nao", "r2", "ebgp", "export"],
      anyOf: true,
      points: 6,
      hint: "No-export bloqueia o anúncio a peers eBGP, mas não o iBGP: a rota chega a R2 pelo RR, e R2 deixa de anunciá-la a R4 (eBGP).",
    },
    predict_step5: {
      type: "keywords",
      required: ["200", "sim", "propaga", "ibgp", "rr", "reflet"],
      anyOf: true,
      points: 6,
      hint: "O Local Preference é carregado no UPDATE iBGP e o RR o preserva ao refletir: R2 recebe a rota com LP 200 sem nenhuma configuração.",
    },
    q1: { type: "radio", correct: "O Route Reflector reflete rotas entre clientes iBGP, eliminando a necessidade de full-mesh entre eles", points: 8 },
    q2: { type: "radio", correct: "Originator-ID e Cluster-List — previnem loops de reflexão", points: 8 },
    q3: { type: "radio", correct: "no-export (65535:65281) — impede que a rota seja anunciada para peers eBGP", points: 8 },
    q4: { type: "radio", correct: "R2 recebe a rota via RR normalmente, mas não a repassa para R4, pois no-export impede o anúncio para qualquer peer eBGP", points: 8 },
    q5: { type: "radio", correct: "No FRR 10.5 o send-community já é o padrão; só 'no neighbor X send-community' impede o envio da community", points: 8 },
    q6: { type: "radio", correct: "bgp community-list standard NOME permit 1:100", points: 8 },
    q7: { type: "radio", correct: "A rota chega a R1, ao RR e a R2 (o iBGP não é bloqueado) e só não sai por eBGP; com no-advertise ela para em R1", points: 16 },
    q8: { type: "radio", correct: "O Cluster List guarda os cluster-ids pelos quais a rota passou: um RR que vê o seu próprio cluster-id descarta a rota, evitando laços entre RRs", points: 12 },
  },

  steps: [
    {
      id: 1,
      title: "Entendendo o problema do full-mesh iBGP",
      theory: `O iBGP tem uma regra fundamental, o split-horizon: um roteador BGP NÃO pode repassar para um peer iBGP uma rota que aprendeu de outro peer iBGP. Isso evita loops, mas cria um problema de escala.

Para que todos os roteadores internos de um AS conheçam todas as rotas, seria necessário criar sessões iBGP entre TODOS os pares — o full-mesh: n(n-1)/2 sessões. Com 10 roteadores, 45; com 100, 4950.

O Route Reflector (RR) é a solução: um roteador designado que tem permissão para refletir rotas recebidas de um cliente iBGP para outros clientes iBGP — quebrando o split-horizon de forma controlada.

Neste lab o roteador RR é o Route Reflector. R1 e R2 são candidatos a clientes; R3 e R4 são peers eBGP externos.`,
      description: `Antes de configurar o Route Reflector, observe o estado atual da rede. Responda a previsão e verifique as sessões BGP em cada roteador. Compare a tabela de R1, R2 e RR: quem vê as rotas de quem?`,
      commands: [
        { cmd: "show bgp summary", router: "RR", desc: "Duas sessões iBGP: R1 (10.0.0.2) e R2 (10.0.0.3)" },
        { cmd: "show ip bgp", router: "R1", desc: "R1 vê as rotas de R3. E as de R4?" },
        { cmd: "show ip bgp", router: "R2", desc: "R2 vê as rotas de R4. E as de R3?" },
        { cmd: "show ip bgp", router: "RR", desc: "O RR vê as rotas dos dois lados?" },
      ],
      expected: "R1 vê as rotas de R3 (192.168.3.0/24 e .30.0/24) mas NÃO as de R4; R2 vê as de R4 mas NÃO as de R3. O RR vê as quatro (via R1 e R2) mas não as reflete: R1 e R2 ainda não são clientes.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar os comandos: por que você espera que R2 não veja as rotas de R3, mesmo que o RR já veja rotas dos dois lados?",
      },
    },
    {
      id: 2,
      title: "Configurar o Route Reflector",
      theory: `Para configurar um Route Reflector no FRR, basta um comando por cliente, no RR:

  neighbor X.X.X.X route-reflector-client

Ele diz ao RR: "este vizinho é meu cliente — posso refletir para ele rotas que aprendi de outros clientes".

Ao refletir, o RR acrescenta dois atributos opcionais: ORIGINATOR_ID (o Router ID de quem introduziu a rota no AS) e CLUSTER_LIST (os cluster-ids pelos quais a rota passou). Eles previnem laços: se um roteador recebe uma rota com o seu próprio Router ID no ORIGINATOR_ID, descarta. Por padrão o cluster-id do RR é o seu Router ID.

O RR não reescreve o next-hop das rotas refletidas.`,
      description: `Abra a captura em R2, interface 'todas', protocolo BGP, e deixe-a rodando até o fim do lab (se parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Responda a previsão e, no RR, dentro da address-family ipv4 unicast:
  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.0.2 route-reflector-client
    neighbor 10.0.0.3 route-reflector-client
  end
  clear bgp * soft

Depois veja as tabelas de R1 e R2 e o detalhe de 192.168.3.0/24 em R2: quais campos novos aparecem? Na captura de R2, procure o UPDATE com 'Originator ID' e 'Cluster List'.`,
      capture: { router: "R2", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "RR", desc: "Confirme route-reflector-client nos dois vizinhos" },
        { cmd: "clear bgp * soft", router: "RR", desc: "Reaplica e reenvia" },
        { cmd: "show ip bgp", router: "R2", desc: "R2 agora vê as rotas de R3?" },
        { cmd: "show ip bgp", router: "R1", desc: "R1 agora vê as rotas de R4?" },
        { cmd: "show ip bgp 192.168.3.0/24", router: "R2", desc: "Procure 'Originator' e 'Cluster list'" },
      ],
      expected: "Depois do route-reflector-client, R1 e R2 vêem as rotas de ambos os lados. Em R2, 192.168.3.0/24 aparece com next-hop 10.0.0.2 (R1) e 'Originator: 10.0.0.2, Cluster list: 10.0.0.1'. Na captura de R2: UPDATE do RR com 'Originator ID (9) ... 10.0.0.2' e 'Cluster List (10) ... 10.0.0.1'.",
      predict: {
        id: "predict_step2",
        prompt: "Depois que o RR passar a refletir as rotas, que informação nova você espera ver nas rotas que R2 recebe de R3 (via R1 e RR)? Para que serve?",
      },
    },
    {
      id: 3,
      title: "Os atributos de prevenção de laço e o cluster-id",
      theory: `ORIGINATOR_ID e CLUSTER_LIST são os dois atributos anti-laço do RR. O Cluster List é uma lista: cada RR que reflete a rota acrescenta o seu cluster-id. Um RR que receba uma rota cujo Cluster List já contém o seu cluster-id a descarta — protege contra laços entre RRs.

Por padrão o cluster-id é o Router ID do RR (10.0.0.1). Com mais de um RR no mesmo cluster usa-se o mesmo cluster-id; clusters diferentes usam valores diferentes. O comando é 'bgp cluster-id X.X.X.X'.`,
      description: `No RR, troque o cluster-id pelo valor {{clusterId}} e reenvie:

  configure terminal
  router bgp 1
   bgp cluster-id {{clusterId}}
  end
  clear bgp * soft out

Em R2, veja o detalhe de 192.168.3.0/24: o que mudou no Cluster list? Em R1, veja o detalhe de 192.168.4.0/24: qual o Originator? Na captura de R2, encontre o UPDATE novo com o Cluster List.`,
      capture: { router: "R2", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "RR", desc: "Confirme 'bgp cluster-id {{clusterId}}'" },
        { cmd: "clear bgp * soft out", router: "RR", desc: "Reenvia as rotas refletidas" },
        { cmd: "show ip bgp 192.168.3.0/24", router: "R2", desc: "Originator e Cluster list da rota de R3" },
        { cmd: "show ip bgp 192.168.4.0/24", router: "R1", desc: "Originator e Cluster list da rota de R4" },
        { cmd: "show bgp neighbors 10.0.0.3", router: "RR", desc: "O RR trata R2 como cliente" },
      ],
      expected: "R2 vê 192.168.3.0/24 com 'Originator: 10.0.0.2, Cluster list: {{clusterId}}' (antes mostrava 10.0.0.1). R1 vê 192.168.4.0/24 com 'Originator: 10.0.0.3' (o R2) e o mesmo Cluster list. Na captura de R2: UPDATE do RR com 'Cluster List (10) ... {{clusterId}}'.",
    },
    {
      id: 4,
      title: "Configurar Community no-export em R3",
      theory: `Para configurar Communities no FRR, usa-se uma route-map com 'set community':

  route-map SET-COMM permit 10
   set community no-export

Depois aplica-se a route-map na direção de saída para o peer: neighbor X.X.X.X route-map SET-COMM out.

Communities well-known: no-export (65535:65281) não anuncia a peers eBGP; no-advertise (65535:65282) não anuncia a NENHUM peer; local-AS (65535:65283) não sai do AS.

No FRR 10.5 o send-community já é o padrão: a community viaja pelo iBGP e pelo RR sem comando extra.`,
      description: `Responda a previsão e configure R3 para marcar 192.168.30.0/24 com no-export na saída para R1:

  configure terminal
  ip prefix-list NET30 seq 10 permit 192.168.30.0/24
  route-map SET-COMM permit 10
   match ip address prefix-list NET30
   set community no-export
  route-map SET-COMM permit 20
  exit
  router bgp 3
   address-family ipv4 unicast
    neighbor 10.2.1.1 route-map SET-COMM out
  end
  clear bgp * soft out

Veja 192.168.30.0/24 em R1 e em R2, e a tabela de R4. Na captura de R2, procure a community no UPDATE refletido.`,
      capture: { router: "R2", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R3", desc: "Confirme prefix-list, route-map e route-map out" },
        { cmd: "clear bgp * soft out", router: "R3", desc: "Reenvia os anúncios de R3" },
        { cmd: "show ip bgp 192.168.30.0/24", router: "R1", desc: "A community chegou a R1?" },
        { cmd: "show ip bgp 192.168.30.0/24", router: "R2", desc: "E a R2, via RR?" },
        { cmd: "show ip bgp", router: "R4", desc: "R4 vê 192.168.30.0/24? E 192.168.3.0/24?" },
      ],
      expected: "192.168.30.0/24 aparece em R1 e em R2 (via RR) com 'Community: no-export'. R4 NÃO vê 192.168.30.0/24 — R2 respeitou o no-export e não a anunciou ao peer eBGP — mas vê 192.168.3.0/24 (AS-PATH '1 3'). Na captura de R2: 'Community (8) ... NO_EXPORT' no UPDATE do RR.",
      predict: {
        id: "predict_step4",
        prompt: "Depois de marcar 192.168.30.0/24 com no-export em R3, você espera que R4 (peer eBGP de R2) receba essa rota quando R2 tentar anunciá-la? Por quê?",
      },
    },
    {
      id: 5,
      title: "Community customizada e community-list",
      theory: `Communities customizadas seguem o formato ASN:valor, onde você define o significado: por exemplo {{commHigh}} = "rota de alta prioridade" e {{commBackup}} = "rota de backup".

Para reagir a uma community usa-se uma community-list:

  bgp community-list standard NOME permit {{commHigh}}

e, na route-map:
  route-map FILTRO permit 10
   match community NOME
   set local-preference 200

R3 marca as suas rotas; R1 reconhece a etiqueta e aplica a política. O Local Preference viaja por iBGP e o RR o preserva ao refletir.`,
      description: `Responda a previsão e faça em duas partes.

1) Em R3, marque 192.168.3.0/24 com a community {{commHigh}} (adicione uma cláusula antes da do no-export):
  configure terminal
  ip prefix-list NET3 seq 10 permit 192.168.3.0/24
  route-map SET-COMM permit 5
   match ip address prefix-list NET3
   set community {{commHigh}}
  end
  clear bgp * soft out

2) Em R1, reconheça a community e aplique Local Preference 200 às rotas que chegam de R3:
  configure terminal
  bgp community-list standard HIGH permit {{commHigh}}
  route-map IN-FROM-R3 permit 10
   match community HIGH
   set local-preference 200
  route-map IN-FROM-R3 permit 20
  exit
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.2.1.2 route-map IN-FROM-R3 in
  end
  clear bgp * soft

Veja 192.168.3.0/24 em R1 e em R2 (você NÃO configurou nada em R2). Na captura de R2, procure o UPDATE com 'Local Preference ... 200' e a community.`,
      capture: { router: "R2", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R3", desc: "Confirme 'set community {{commHigh}}'" },
        { cmd: "show running-config", router: "R1", desc: "Confirme community-list e route-map IN-FROM-R3" },
        { cmd: "show ip bgp 192.168.3.0/24", router: "R1", desc: "localpref 200 e a community" },
        { cmd: "show ip bgp 192.168.3.0/24", router: "R2", desc: "R2 recebe LP 200 pelo RR?" },
        { cmd: "show ip bgp", router: "RR", desc: "Visão do RR: a coluna LocPrf" },
      ],
      expected: "R1 mostra 192.168.3.0/24 com 'localpref 200' e 'Community: {{commHigh}}'. R2 recebe a mesma rota pelo RR com 'localpref 200' e a community, sem nenhuma configuração própria. Na captura de R2: UPDATE do RR com 'Local Preference (5) ... 200', 'Community (8) ... {{commHigh}}', Originator 10.0.0.2 e Cluster List.",
      predict: {
        id: "predict_step5",
        prompt: "Você aplicou o Local Preference 200 só em R1, para as rotas com a community {{commHigh}}. Você espera que R2, que não foi configurado, também veja essa rota com LP 200? Por quê?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Backup por Community e a Diferença entre no-export e no-advertise",
    description: `Com o Route Reflector funcionando e as communities configuradas, implemente:

1. Configure R4 para marcar as suas rotas com a community {{commBackup}} (rota de backup) na saída para R2.
   Em R2, crie uma community-list e uma route-map in que aplique Local Preference 50 às rotas com {{commBackup}}.
   Verifique que R1 também recebe 192.168.40.0/24 com LP 50, via RR.

2. Troque, em R3, o no-export de 192.168.30.0/24 por no-advertise e observe a diferença: com no-advertise a rota não chega nem ao RR nem a R2. Depois RESTAURE o no-export.

Estado final: o item 1 aplicado e o no-export restaurado. Responda às perguntas, baseadas no que você viu.`,
    hints: [
      "A community é marcada na saída do roteador de origem (route-map out) e reconhecida na entrada do roteador que reage (route-map in)",
      "O Local Preference viaja por iBGP e o RR o preserva",
      "no-advertise bloqueia o anúncio a qualquer peer, inclusive o iBGP com o RR",
      "Para restaurar o no-export: 'set community no-export' na mesma cláusula",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Qual a principal função do Route Reflector no BGP?",
        options: [
          "Substituir o protocolo OSPF dentro do AS",
          "Converter rotas eBGP em iBGP dentro do AS",
          "O Route Reflector reflete rotas entre clientes iBGP, eliminando a necessidade de full-mesh entre eles",
          "Filtrar rotas externas antes de distribuir internamente",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Quais atributos o Route Reflector adiciona automaticamente para prevenir loops?",
        options: [
          "MED e Local Preference — controlam o caminho de retorno",
          "AS-PATH e NEXT_HOP — identificam a origem da rota",
          "Weight e Community — controlam a propagação local",
          "Originator-ID e Cluster-List — previnem loops de reflexão",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "O que a Community no-export (65535:65281) instrui os roteadores a fazer?",
        options: [
          "Remover a rota da tabela BGP local",
          "Não anunciar a rota para NENHUM peer, incluindo iBGP",
          "Anunciar a rota apenas para Route Reflectors",
          "no-export (65535:65281) — impede que a rota seja anunciada para peers eBGP",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Depois de marcar 192.168.30.0/24 com no-export em R3 e essa rota chegar via RR a R2, o que acontece quando R2 tenta anunciá-la a R4?",
        options: [
          "R4 recebe a rota normalmente, porque no-export só afeta o roteador que recebeu diretamente",
          "R2 não recebe a rota via RR, pois o RR também respeita o no-export para reflexão iBGP",
          "R2 recebe a rota via RR normalmente, mas não a repassa para R4, pois no-export impede o anúncio para qualquer peer eBGP",
          "R4 recebe a rota, mas com o atributo no-export removido pelo RR",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "O que se observou sobre 'send-community' no FRR 10.5?",
        options: [
          "Sem ele a community nunca é enviada, como no IOS",
          "ip bgp-community new-format é obrigatório",
          "No FRR 10.5 o send-community já é o padrão; só 'no neighbor X send-community' impede o envio da community",
          "neighbor X.X.X.X community-allow é obrigatório",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Qual é a sintaxe correta para criar uma community-list que reconhece a Community 1:100?",
        options: [
          "bgp community-list 1:100 permit",
          "match community 1 100 exact",
          "set community-filter AS1 value 100",
          "bgp community-list standard NOME permit 1:100",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "Qual a diferença entre no-export e no-advertise neste lab?",
        options: [
          "Nenhuma: as duas bloqueiam a rota em R1",
          "no-advertise só vale para eBGP e no-export para iBGP",
          "A rota chega a R1, ao RR e a R2 (o iBGP não é bloqueado) e só não sai por eBGP; com no-advertise ela para em R1",
          "Com no-export a rota nem chega a R1",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "Para que serve o Cluster List?",
        options: [
          "Guarda o Router ID de quem originou a rota",
          "O Cluster List guarda os cluster-ids pelos quais a rota passou: um RR que vê o seu próprio cluster-id descarta a rota, evitando laços entre RRs",
          "Define quais communities o RR aceita",
          "Substitui o AS-PATH dentro do AS",
        ],
      },
    ],
  },

  frr_configs: {
    "RR": "frr version 9.0\nfrr defaults traditional\nhostname RR\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 10.0.0.1/32\n!\ninterface eth1\n ip address 10.1.1.1/30\n!\ninterface eth2\n ip address 10.1.2.1/30\n!\nrouter bgp 1\n bgp router-id 10.0.0.1\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.0.0.2 remote-as 1\n neighbor 10.0.0.2 update-source lo\n neighbor 10.0.0.3 remote-as 1\n neighbor 10.0.0.3 update-source lo\n !\n address-family ipv4 unicast\n  neighbor 10.0.0.2 activate\n  neighbor 10.0.0.2 next-hop-self\n  neighbor 10.0.0.3 activate\n  neighbor 10.0.0.3 next-hop-self\n exit-address-family\n!\nip route 10.0.0.2/32 10.1.1.2\nip route 10.0.0.3/32 10.1.2.2\n",
    "R1": "frr version 9.0\nfrr defaults traditional\nhostname R1\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 10.0.0.2/32\n!\ninterface eth1\n ip address 10.1.1.2/30\n!\ninterface eth2\n ip address 10.2.1.1/30\n!\nrouter bgp 1\n bgp router-id 10.0.0.2\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.0.0.1 remote-as 1\n neighbor 10.0.0.1 update-source lo\n neighbor 10.2.1.2 remote-as 3\n !\n address-family ipv4 unicast\n  neighbor 10.0.0.1 activate\n  neighbor 10.0.0.1 next-hop-self\n  neighbor 10.2.1.2 activate\n  neighbor 10.2.1.2 send-community\n exit-address-family\n!\nip route 10.0.0.1/32 10.1.1.1\n",
    "R2": "frr version 9.0\nfrr defaults traditional\nhostname R2\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 10.0.0.3/32\n!\ninterface eth1\n ip address 10.1.2.2/30\n!\ninterface eth2\n ip address 10.3.1.1/30\n!\nrouter bgp 1\n bgp router-id 10.0.0.3\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.0.0.1 remote-as 1\n neighbor 10.0.0.1 update-source lo\n neighbor 10.3.1.2 remote-as 4\n !\n address-family ipv4 unicast\n  neighbor 10.0.0.1 activate\n  neighbor 10.0.0.1 next-hop-self\n  neighbor 10.3.1.2 activate\n  neighbor 10.3.1.2 send-community\n exit-address-family\n!\nip route 10.0.0.1/32 10.1.2.1\n",
    "R3": "frr version 9.0\nfrr defaults traditional\nhostname R3\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 30.0.0.1/32\n ip address 192.168.3.1/24\n ip address 192.168.30.1/24\n!\ninterface eth1\n ip address 10.2.1.2/30\n!\nrouter bgp 3\n bgp router-id 30.0.0.1\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.2.1.1 remote-as 1\n !\n address-family ipv4 unicast\n  network 192.168.3.0/24\n  network 192.168.30.0/24\n  neighbor 10.2.1.1 activate\n  neighbor 10.2.1.1 send-community\n exit-address-family\n!\nip prefix-list NETS seq 10 permit 192.168.3.0/24\nip prefix-list NETS seq 20 permit 192.168.30.0/24\n",
    "R4": "frr version 9.0\nfrr defaults traditional\nhostname R4\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 40.0.0.1/32\n ip address 192.168.4.1/24\n ip address 192.168.40.1/24\n!\ninterface eth1\n ip address 10.3.1.2/30\n!\nrouter bgp 4\n bgp router-id 40.0.0.1\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.3.1.1 remote-as 1\n !\n address-family ipv4 unicast\n  network 192.168.4.0/24\n  network 192.168.40.0/24\n  neighbor 10.3.1.1 activate\n  neighbor 10.3.1.1 send-community\n exit-address-family\n!\nip prefix-list NETS seq 10 permit 192.168.4.0/24\nip prefix-list NETS seq 20 permit 192.168.40.0/24\n"
  },
};

module.exports = lab;
