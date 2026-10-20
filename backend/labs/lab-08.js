/**
 * Lab 8 — BGP Nível 3: AS-Path Prepend, Weight e Default Route
 * Topic: Backup de caminho, eBGP multihop e rota default
 * Difficulty: Intermediário
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - sem ebgp-multihop a sessão R1–R3 (via R4, IP puro) não sobe: R1 manda
 *    o SYN com TTL 1 e R4 o descarta (um SYN por ciclo, sem resposta);
 *    `show bgp neighbors` diz "up to 1 hops away". Com `ebgp-multihop N` o
 *    SYN sai com TTL N e a sessão sobe — logo depois de um `clear bgp
 *    <vizinho>` (senão leva até o próximo ciclo de reconexão, ~1 min);
 *  - sem Weight R1 prefere o caminho direto por R3 (AS-PATH "3") para
 *    10.3.3.0/24; com `neighbor 10.0.12.2 weight N` prefere R2 (best (Weight));
 *  - `default-originate` simples para R3 faz R3 preferir a default DIRETA
 *    ("1") à via R2 ("2 1") — o backup viraria o primário; com
 *    `default-originate route-map` + `set as-path prepend` o set é aplicado
 *    ("1 1 1") e R3 volta a preferir R2, best (AS Path);
 *  - com R2 desligando a sessão com R1, R3 passa a usar a default direta
 *    ("1 1 1"); ao religar, volta para R2: o backup funciona de verdade.
 *    O lab antigo só "validava" que o backup existia, sem exercitá-lo.
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";
// Lista de prefixos de 'Updated routes:' até o prefixo procurado
const ROUTES_TO = (pfx) => "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+" + pfx;
// Segmento TCP SYN de R1 (14.14.14.1) para R3 (10.0.34.1:179) com o TTL dado
// Qualquer pacote que R1 (14.14.14.1) ENVIA a R3 (10.0.34.1) nessa sessão com o TTL dado: o SYN, se R1 iniciar a
// conexão, ou os pacotes BGP seguintes — quem inicia (R1 ou R3) varia de uma execução para outra
const OUT_TTL = (ttl) => "Out\\s+IP \\(tos 0xc0, ttl " + ttl + ",[^\\n]*\\n\\s*14\\.14\\.14\\.1\\.\\d+ > 10\\.0\\.34\\.1\\.\\d+:";
const SYN_TTL = (ttl) => "ttl " + ttl + ",[^\\n]*\\n\\s*14\\.14\\.14\\.1\\.\\d+ > 10\\.0\\.34\\.1\\.179: Flags \\[S\\],";

const lab = {
  id: 8,
  protocol: "bgp",
  level: 3,
  scenario: "Uma empresa contrata um provedor de trânsito IP simples (que só encaminha pacotes, sem participar do BGP) para conectar dois de seus próprios ASes. Internamente, o time de rede quer um caminho primário claramente preferido (via Weight, local a cada roteador) e um caminho de backup que só deve ser usado se o primário cair, sinalizado aos vizinhos externos via AS-Path Prepend. Você vai montar a sessão pelo trânsito, ver o TTL do eBGP no fio e testar o backup de verdade, derrubando o caminho primário.",
  title: "AS-Path Prepend, Weight e Default Route",
  topic: "Backup de caminho, eBGP multihop e rota default",
  difficulty: "Intermediário",
  duration: "60 min",
  enabled: true,
  resourceProfile: "leve",
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
    ["R3", "eth2", "R4", "eth1"],
    ["R1", "eth2", "R4", "eth2"],
  ],

  variables: {
    weightValue: { pool: ["50", "100", "150", "200"] },
    prependDefault: { pool: ["1 1", "1 1 1", "1 1 1 1"] },
    // R1→R4→R3 são 2 saltos; qualquer valor >= 2 serve — o valor aparece no TTL do SYN
    multihopTtl: { pool: ["3", "4", "5", "6"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=8). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "BGP — Multihop, Weight e Backup",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 8",
      points: [
        "**eBGP multihop**: sessão entre roteadores que **não** estão no mesmo enlace",
        "O **TTL** do eBGP — e o que o `tcpdump` mostra",
        "**Weight**: o caminho **primário**, local ao roteador",
        "**default-originate** com **prepend**: a default de **backup**",
        "**Testar** o backup: derrubar o primário e ver o que acontece",
      ],
      note: "Este lab parte dos Labs 1, 2 e 5: prepend, Weight × Local Preference e default-originate.",
    },
    {
      title: "A topologia do Lab 8",
      diagram: [
        "              10.0.12.0/30",
        "  ┌────┐ .1             .2 ┌────┐ .1   .2 ┌────┐",
        "  │ R1 ├─eth1───────eth1─┤ R2 ├─eth2─eth1┤ R3 │",
        "  │AS 1│                  │AS 2│ 10.0.23.0/30│AS 3│",
        "  └─┬──┘                  └────┘          └─┬──┘",
        "eth2│ 14.14.14.1/24                 10.0.34.1/30│eth2",
        "    │                                          │",
        "    └─ .4 eth2 ┌──────────┐ eth1 .2 ──────────┘",
        "               │    R4    │",
        "               │ sem BGP  │  só encaminha IP",
        "               └──────────┘",
      ].join("\n"),
      points: [
        "A cadeia **R1 — R2 — R3** é o caminho **primário**: ASes 1, 2 e 3 com sessões eBGP diretas.",
        "**R4** não fala BGP: só **encaminha IP** entre R1 (`14.14.14.0/24`) e R3 (`10.0.34.0/30`). É o enlace de **backup**.",
        "O desafio: montar **uma sessão eBGP R1–R3 através de R4**, sem os dois estarem no mesmo enlace.",
      ],
    },
    {
      title: "eBGP multihop",
      points: [
        "Por padrão o eBGP assume que o vizinho está **a 1 salto** (mesmo enlace) e envia os pacotes com **TTL 1**. Um roteador no meio **descarta** o pacote: a sessão **nunca sobe**.",
        "`neighbor X ebgp-multihop N` envia com **TTL N**. R1–R4–R3 são **2 saltos**: precisa de **N ≥ 2**.",
        "Mais duas coisas, que o lab pede: uma **rota IP** até o endereço do vizinho (`ip route 10.0.34.1/32 14.14.14.4`) e o **`update-source eth2`**, para as duas pontas usarem **endereços que o outro alcança**.",
        "Os dois lados precisam combinar: R1 aponta para `10.0.34.1` e R3 aponta para `14.14.14.1`.",
      ],
      code: "ip route 10.0.34.1/32 14.14.14.4\nrouter bgp 1\n neighbor 10.0.34.1 remote-as 3\n neighbor 10.0.34.1 update-source eth2\n neighbor 10.0.34.1 ebgp-multihop 5\n address-family ipv4 unicast\n  neighbor 10.0.34.1 activate",
    },
    {
      title: "O TTL no fio",
      code: "(sem multihop)\n  Out IP (tos 0xc0, ttl 1, ...)\n    14.14.14.1.37257 > 10.0.34.1.179: Flags [S], ...\n  (nenhuma resposta: R4 descartou o pacote)\n\n(com ebgp-multihop 4)\n  Out IP (tos 0xc0, ttl 4, ...)\n    14.14.14.1.33387 > 10.0.34.1.179: Flags [S], ...\n  In  IP (tos 0xc0, ttl 254, ...)\n    10.0.34.1.179 > 14.14.14.1.33387: Flags [S.], ...",
      points: [
        "O **SYN** é o primeiro pacote do TCP. Sem multihop sai com **`ttl 1`** — e **não há SYN-ACK**.",
        "Com multihop, o SYN sai com o **TTL que você configurou** e a resposta **chega** (`Flags [S.]`). A sessão sobe e começa o OPEN.",
        "`show bgp neighbors` confirma: `External BGP neighbor may be up to 1 hops away` antes, `up to N hops away` depois.",
        "Depois de mudar a configuração, `clear bgp <vizinho>` faz o FRR **tentar de novo agora**; sem ele, a próxima tentativa só vem no ciclo de reconexão (cerca de **1 minuto**).",
      ],
      note: "Valores reais do tcpdump em R1; o TTL é o do seu multihop.",
    },
    {
      title: "Weight — o primário",
      points: [
        "Para **10.3.3.0/24**, R1 tem **dois caminhos**: o **direto** por R3 (AS-PATH `3`) e o por **R2** (AS-PATH `2 3`). O direto é **mais curto** e vence — **o backup viraria o primário**.",
        "`neighbor 10.0.12.2 weight N` dá **peso local** a **tudo** que R1 recebe de R2. **Weight** é o critério **1**: vence o AS-PATH.",
        "Sem route-map, é um comando **simples** por vizinho. Vale para **todos** os prefixos vindos de R2.",
        "Weight **não é anunciado** (Lab 2): só R1 muda — que é o que se quer aqui.",
      ],
    },
    {
      title: "A default de backup",
      points: [
        "R1 já anuncia uma **default** a R2 (que a passa a R3): é o caminho **primário** da default (`2 1`, comprimento 2).",
        "Para R3 ter um **backup**, R1 anuncia a default **também** pela sessão multihop: `neighbor 10.0.34.1 default-originate`.",
        "Mas **sozinha** ela faz R3 preferir a default **direta** (`1`, comprimento 1) à via R2 (`2 1`): o backup passa a ser o **primário**. Validado neste lab.",
        "A solução é **prepend** só nessa default: `default-originate route-map PREPEND_DEFAULT`, com `set as-path prepend`. O FRR **aplica** o set: a default direta vira `1 1 1`, **mais longa** que `2 1`.",
      ],
      code: "route-map PREPEND_DEFAULT permit 10\n set as-path prepend 1 1\n!\nrouter bgp 1\n address-family ipv4 unicast\n  neighbor 10.0.34.1 default-originate route-map PREPEND_DEFAULT",
    },
    {
      title: "Testar o backup de verdade",
      points: [
        "Um backup **não testado** é só esperança. Aqui dá para testar **sem risco**: cada aluno tem a **sua própria rede**.",
        "Em R2, `neighbor 10.0.12.1 shutdown` derruba a sessão R1–R2. R3 perde a default `2 1` e passa a usar a **direta**, `1 1 1`.",
        "Ao religar (`no neighbor 10.0.12.1 shutdown`), R3 **volta** para a via R2, por causa do **AS-PATH mais curto**.",
        "No fio, o R1 vê o **NOTIFICATION** que R2 manda ao desligar a sessão.",
      ],
      note: "Validado neste lab: com a sessão R1–R2 desligada, R3 mostra a default via 14.14.14.1 como best.",
    },
    {
      title: "Roteiro do Lab 8",
      points: [
        "**Passo 1:** a **default** de R1 para R2, e R3 aprendendo por R2.",
        "**Passo 2:** a sessão **multihop** R1–R3: primeiro **sem** `ebgp-multihop` (veja o **TTL 1** e nenhuma resposta), depois **com**.",
        "**Passo 3:** **Weight** em R1: o primário volta a ser R2.",
        "**Passo 4:** **default de backup** com prepend: sem e com o route-map.",
        "**Passo 5:** **derrubar** o primário e ver o backup assumir.",
        "Nos passos 2, 3, 4 e 5 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas o SYN com TTL 1, um pacote com o TTL do seu multihop, a default para R2, a default com prepend e o NOTIFICATION do shutdown. Deixe a captura de R1 rodando do passo 1 ao 5.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: mostrar na captura o **TTL do SYN** antes e depois do multihop; explicar **por que o Weight** devolveu o primário a R2; explicar **por que a default direta precisou do prepend**; e mostrar o **backup assumindo** quando R2 cai.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Por que a sessão R1–R3 não subia sem o ebgp-multihop? Mostre na 🔬 captura.",
      lookFor: "O eBGP envia com TTL 1; R4 está no meio (2 saltos) e descarta. Captura de R1: SYN de 14.14.14.1 para 10.0.34.1:179 com 'ttl 1' e nenhum SYN-ACK. show bgp neighbors: 'up to 1 hops away'. Estado Active.",
    },
    {
      id: "e2",
      prompt: "Depois do ebgp-multihop {{multihopTtl}}, o que mudou no SYN? Que outras peças a sessão precisou?",
      lookFor: "O SYN sai com 'ttl {{multihopTtl}}' e chega SYN-ACK; a sessão sobe (clear bgp acelera). Também precisou da rota IP até o endereço do vizinho (static /32 por R4) e do update-source eth2, e a configuração dos dois lados apontando para os endereços corretos.",
    },
    {
      id: "e3",
      prompt: "Antes do Weight, por qual caminho R1 chega a 10.3.3.0/24? E depois do weight {{weightValue}}? Por quê?",
      lookFor: "Antes: direto por R3 (AS-PATH '3'), best (AS Path). Depois: por R2 ('2 3'), best (Weight). Weight é o critério 1 (antes do AS-PATH), local a R1, vale para tudo recebido de R2.",
    },
    {
      id: "e4",
      prompt: "O que acontece com a default em R3 se R1 anunciar default-originate simples pela sessão multihop? Por quê o prepend?",
      lookFor: "R3 passa a preferir a default DIRETA ('1', mais curta que '2 1'), best (AS Path): o backup viraria primário. Com default-originate route-map + set as-path prepend {{prependDefault}} a default direta fica '1 {{prependDefault}}' (mais longa) e R3 volta a R2.",
    },
    {
      id: "e5",
      prompt: "Mostre na captura o UPDATE da default que R1 manda a R3. O que ele mostra no AS Path?",
      lookFor: "UPDATE de R1 para 10.0.34.1 com 'AS Path ... 1 {{prependDefault}}' e 'Updated routes: 0.0.0.0/0': o prepend aplicado pelo default-originate route-map.",
    },
    {
      id: "e6",
      prompt: "Você derrubou a sessão R1–R2 em R2. O que R3 fez com a default? O que aconteceu ao religar?",
      lookFor: "R3 perdeu a default '2 1' e passou a usar a direta ('1 {{prependDefault}}'); na captura de R1, NOTIFICATION Cease do shutdown. Ao religar, a default via R2 volta a ser a best (AS Path mais curto). O backup funcionou.",
    },
  ],

  autoGrade: [
    { id: "checked_default", label: "Observou a default de R1 em R3", router: "R3", cmdContains: "show ip bgp 0.0.0.0" },
    { id: "multihop_typed", label: "Configurou o ebgp-multihop", cmdContains: "ebgp-multihop" },
    { id: "weight_typed", label: "Configurou o Weight", router: "R1", cmdContains: "weight" },
    { id: "prepend_typed", label: "Configurou o prepend na default", router: "R1", cmdContains: "as-path prepend" },
    { id: "shutdown_typed", label: "Derrubou a sessão primária para testar o backup", router: "R2", cmdContains: "neighbor 10.0.12.1 shutdown" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_default_r2", label: "Capturou a default de R1 para R2", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1\\s" + UPD_NT + ROUTES_TO("0\\.0\\.0\\.0/0") },
    { id: "captured_syn_ttl1", label: "Capturou o SYN de R1 com TTL 1 (sem multihop)", router: "R1", capturePattern: SYN_TTL("1") },
    { id: "captured_syn_multihop", label: "Capturou um pacote de R1 para R3 com o TTL do seu multihop", router: "R1", capturePattern: OUT_TTL("{{multihopTtl}}") },
    { id: "captured_default_prepend", label: "Capturou a default de R1 para R3 com o seu prepend", router: "R1", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1 {{prependDefault}}\\s" + UPD_NT + ROUTES_TO("0\\.0\\.0\\.0/0") },
  ],

  verifications: [
    {
      id: "ebgp_multihop_session",
      label: "Sessão eBGP multihop R1–R3 (10.0.34.1) estabelecida",
      weight: 10,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "10\\.0\\.34\\.1\\s+4\\s+3\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    },
    {
      id: "multihop_r1",
      label: "ebgp-multihop {{multihopTtl}} configurado em R1",
      weight: 5,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.34\\.1 ebgp-multihop {{multihopTtl}}\\s" },
    },
    {
      id: "multihop_r3",
      label: "ebgp-multihop {{multihopTtl}} configurado em R3",
      weight: 5,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "neighbor 14\\.14\\.14\\.1 ebgp-multihop {{multihopTtl}}\\s" },
    },
    {
      id: "static_r1",
      label: "Rota estática de R1 para 10.0.34.1/32 via R4",
      weight: 3,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip route 10\\.0\\.34\\.1/32 14\\.14\\.14\\.4" },
    },
    {
      id: "static_r3",
      label: "Rota estática de R3 para 14.14.14.1/32 via R4",
      weight: 3,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "ip route 14\\.14\\.14\\.1/32 10\\.0\\.34\\.2" },
    },
    {
      id: "update_source_r1",
      label: "update-source eth2 em R1 para o vizinho multihop",
      weight: 2,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.34\\.1 update-source eth2" },
    },
    {
      id: "update_source_r3",
      label: "update-source eth2 em R3 para o vizinho multihop",
      weight: 2,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "neighbor 14\\.14\\.14\\.1 update-source eth2" },
    },
    {
      id: "weight_configured",
      label: "Weight {{weightValue}} configurado em R1 para o vizinho R2",
      weight: 8,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.12\\.2 weight {{weightValue}}" },
    },
    {
      id: "r1_prefers_r2",
      label: "R1 chega a 10.3.3.0/24 por R2 (best Weight), não pelo caminho direto",
      weight: 8,
      check: { router: "R1", cmdPattern: "show ip bgp 10.3.3.0/24", outputPattern: "2 3\\s+10\\.0\\.12\\.2 from 10\\.0\\.12\\.2[\\s\\S]*?weight {{weightValue}}, valid, external, best \\(Weight\\)" },
    },
    {
      id: "default_to_r2",
      label: "default-originate configurado para R2 (10.0.12.2)",
      weight: 4,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.12\\.2 default-originate" },
    },
    {
      id: "default_route_map",
      label: "default-originate para R3 com route-map",
      weight: 6,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.34\\.1 default-originate route-map \\S+" },
    },
    {
      id: "prepend_default_configured",
      label: "Prepend {{prependDefault}} na default de backup",
      weight: 6,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "set as-path prepend {{prependDefault}}\\s" },
    },
    {
      id: "r3_prefers_r2_default",
      label: "R3 prefere a default via R2 (best AS Path)",
      weight: 8,
      check: { router: "R3", cmdPattern: "show ip bgp 0.0.0.0/0", outputPattern: "2 1\\s+10\\.0\\.23\\.1 from 10\\.0\\.23\\.1[\\s\\S]*?best \\(AS Path\\)" },
    },
    {
      id: "r3_backup_default",
      label: "R3 mantém a default direta de R1 com o prepend como backup",
      weight: 6,
      check: { router: "R3", cmdPattern: "show ip bgp 0.0.0.0/0", outputPattern: "1 {{prependDefault}}\\s+14\\.14\\.14\\.1 from 14\\.14\\.14\\.1" },
    },
    {
      id: "capture_syn_ttl1",
      label: "Capturou o SYN de R1 para R3 com TTL 1 (sem multihop)",
      weight: 4,
      check: { type: "capture", router: "R1", packetPattern: SYN_TTL("1") },
    },
    {
      id: "capture_syn_multihop",
      label: "Capturou um pacote de R1 para R3 com TTL {{multihopTtl}} (o seu multihop)",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: OUT_TTL("{{multihopTtl}}") },
    },
    {
      id: "capture_default_r2",
      label: "Capturou o UPDATE da default de R1 para R2",
      weight: 4,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1\\s" + UPD_NT + ROUTES_TO("0\\.0\\.0\\.0/0") },
    },
    {
      id: "capture_default_prepend",
      label: "Capturou o UPDATE da default de R1 para R3 com AS Path 1 {{prependDefault}}",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1 {{prependDefault}}\\s" + UPD_NT + ROUTES_TO("0\\.0\\.0\\.0/0") },
    },
    {
      id: "capture_shutdown",
      label: "Capturou a NOTIFICATION Cease da sessão R1–R2 desligada",
      weight: 4,
      check: { type: "capture", router: "R1", packetPattern: "Notification Message \\(3\\), length: 23, Cease" },
    },
  ],

  answerKey: {
    predict_step2: {
      type: "keywords",
      required: ["não", "nao", "ttl", "1 salto", "diretamente", "descart", "r4"],
      anyOf: true,
      points: 6,
      hint: "O eBGP envia os pacotes com TTL 1; R4 está no meio e descarta o SYN — a sessão não sobe. Precisa de ebgp-multihop.",
    },
    predict_weight_direct: {
      type: "keywords",
      required: ["direto", "r3", "muda", "sim"],
      anyOf: true,
      points: 6,
      hint: "Sem Weight, AS-PATH decide e o caminho direto (mais curto) venceria. Weight é comparado ANTES de AS-PATH, então muda a decisão.",
    },
    predict_default_backup: {
      type: "keywords",
      required: ["r2", "via r2", "direta", "direto", "mais curta", "prepend"],
      anyOf: true,
      points: 6,
      hint: "Sem prepend, a default direta (AS-PATH '1') é mais curta que a via R2 ('2 1') e R3 prefere o backup. Com o AS-Path Prepend a direta fica mais longa e R3 prefere R2.",
    },
    predict_failover: {
      type: "keywords",
      required: ["direta", "direto", "r1", "backup", "assume", "usa"],
      anyOf: true,
      points: 6,
      hint: "Sem a sessão R1–R2, R3 perde a default via R2 e passa a usar a default direta de R1 (a de backup, com prepend).",
    },
    q1: { type: "radio", correct: "Porque a sessão BGP usa endereços que não estão diretamente conectados", points: 6 },
    q2: { type: "radio", correct: "ebgp-multihop e update-source", points: 10 },
    q3: { type: "radio", correct: "Weight é local ao roteador e vence antes de AS-PATH", points: 10 },
    q4: { type: "radio", correct: "Para manter R1 preferindo o caminho primário via R2 quando ele estiver disponível", points: 6 },
    q5: { type: "radio", correct: "Ele torna a default anunciada pelo caminho direto menos preferida", points: 10 },
    q6: { type: "radio", correct: "R4 apenas encaminha IP entre R1 e R3; ele não participa do BGP", points: 6 },
    q7: { type: "radio", correct: "O eBGP envia com TTL 1; o SYN chega a R4, que o descarta, e não há SYN-ACK", points: 14 },
    q8: { type: "radio", correct: "R3 passa a usar a default direta de R1 (com o prepend) e, ao religar R2, volta para a via R2", points: 14 },
  },

  steps: [
    {
      id: 1,
      title: "Verificar o caminho primário",
      theory: `A topologia começa com BGP em cadeia:

- R1 no AS 1
- R2 no AS 2
- R3 no AS 3
- R4 como roteador de trânsito sem BGP

R2 anuncia 10.2.2.0/24 e R3 anuncia 10.3.3.0/24. R1 anuncia uma default route para R2, e R2 repassa essa default para R3: é o caminho primário.`,
      description: `Abra a captura em R1, interface 'todas', protocolo BGP. DEIXE A CAPTURA RODANDO até o fim do passo 5 (se ela parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Configure a default de R1 para R2 e observe em R3:

No R1:
  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 default-originate
  end
  clear bgp * soft out

Na captura de R1, procure o UPDATE com 'Updated routes: 0.0.0.0/0'. Em R3, qual o AS-PATH da default?`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "R1 só tem a sessão com R2" },
        { cmd: "show bgp summary", router: "R3", desc: "R3 só tem a sessão com R2" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R3", desc: "A default de R1, chegando por R2" },
      ],
      expected: "R3 aprende 0.0.0.0/0 pelo caminho R3–R2–R1: AS-PATH '2 1', next-hop 10.0.23.1. Na captura de R1: UPDATE para 10.0.12.2 com 'AS Path ... 1' e 'Updated routes: 0.0.0.0/0'.",
    },
    {
      id: 2,
      title: "Criar eBGP multihop via R4",
      theory: `eBGP normalmente exige que os peers estejam diretamente conectados: ele envia os pacotes com TTL 1. Quando os endereços usados para a sessão não estão no mesmo enlace, precisamos de:

- rota IP até o endereço remoto;
- "update-source" para fixar o endereço de origem da sessão;
- "ebgp-multihop N" para permitir TTL maior que 1.

Neste lab, R4 não participa do BGP. Ele apenas encaminha IP entre R1 e R3 (2 saltos entre os dois).`,
      description: `Responda a previsão. Configure primeiro SEM o multihop e observe.

No R1:
  configure terminal
  ip route 10.0.34.1/32 14.14.14.4
  router bgp 1
   neighbor 10.0.34.1 remote-as 3
   neighbor 10.0.34.1 update-source eth2
   address-family ipv4 unicast
    neighbor 10.0.34.1 activate
  end

No R3:
  configure terminal
  ip route 14.14.14.1/32 10.0.34.2
  router bgp 3
   neighbor 14.14.14.1 remote-as 1
   neighbor 14.14.14.1 update-source eth2
   address-family ipv4 unicast
    neighbor 14.14.14.1 activate
  end

Espere uns 20 segundos: o estado fica Active. Procure na captura de R1 o SYN para 10.0.34.1 porta 179 e leia o TTL. Use 'show bgp neighbors 10.0.34.1' em R1.

Agora acrescente o multihop com o valor {{multihopTtl}}, nos dois lados, e force uma nova tentativa:
  em R1: router bgp 1 → neighbor 10.0.34.1 ebgp-multihop {{multihopTtl}}
  em R3: router bgp 3 → neighbor 14.14.14.1 ebgp-multihop {{multihopTtl}}
  em R1: clear bgp 10.0.34.1

Compare o TTL dos pacotes de R1 na captura (o SYN, se R1 iniciar; senão o OPEN).`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme a rota estática, o update-source e o multihop" },
        { cmd: "show bgp neighbors 10.0.34.1", router: "R1", desc: "Estado e 'up to N hops away'" },
        { cmd: "show bgp summary", router: "R1", desc: "A sessão com 10.0.34.1: Active ou Established?" },
        { cmd: "clear bgp 10.0.34.1", router: "R1", desc: "Força uma nova tentativa depois do multihop" },
        { cmd: "show bgp summary", router: "R3", desc: "O outro lado (14.14.14.1) também subiu?" },
      ],
      expected: "Sem o multihop: a sessão fica Active; 'show bgp neighbors' diz 'External BGP neighbor may be up to 1 hops away'; na captura, SYN de 14.14.14.1 para 10.0.34.1:179 com 'ttl 1' e nenhuma resposta (R4 descarta). Com 'ebgp-multihop {{multihopTtl}}' nos dois lados e o clear: pacotes de R1 com 'ttl {{multihopTtl}}' (o SYN, se R1 iniciar a conexão; senão o OPEN e o resto da sessão), resposta de volta, 'up to {{multihopTtl}} hops away' e a sessão Established nos dois lados.",
      predict: {
        id: "predict_step2",
        prompt: "Você vai configurar a sessão eBGP entre R1 e R3, que passa por R4, SEM o ebgp-multihop. A sessão sobe? O que você espera ver no pacote que R1 envia?",
      },
    },
    {
      id: 3,
      title: "Manter R2 como caminho preferido usando Weight",
      theory: `Depois que R1 fala diretamente com R3 por eBGP multihop, R1 passa a ter um caminho direto para 10.3.3.0/24 com AS-PATH mais curto ('3') que o caminho via R2 ('2 3'): o backup viraria o primário.

Como a regra do exercício evita route-map, usamos o comando simples "neighbor X weight VALOR". Weight é local ao roteador e vence antes de AS-PATH. Assim, todos os prefixos recebidos de R2 em R1 ganham preferência local.`,
      description: `Responda a previsão. Veja primeiro o caminho de R1 para 10.3.3.0/24 (qual é o best e o que diz entre parênteses?). Depois configure no R1:

  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 weight {{weightValue}}
  end
  clear bgp * soft in

Compare o caminho para 10.3.3.0/24 antes e depois.`,
      commands: [
        { cmd: "show ip bgp 10.3.3.0/24", router: "R1", desc: "ANTES: best direto por R3 (AS Path)" },
        { cmd: "show running-config", router: "R1", desc: "Confirme o weight no vizinho R2" },
        { cmd: "clear bgp * soft in", router: "R1", desc: "Reavalia os caminhos recebidos" },
        { cmd: "show ip bgp 10.3.3.0/24", router: "R1", desc: "DEPOIS: qual é o best e o que diz entre parênteses?" },
      ],
      expected: "ANTES: R1 prefere o caminho direto via R3 (AS-PATH '3', best (AS Path)). DEPOIS: o caminho via R2 ('2 3') mostra 'weight {{weightValue}}' e é o best, 'best (Weight)'; o caminho direto fica como segundo.",
      predict: {
        id: "predict_weight_direct",
        prompt: "Antes de configurar o Weight, o caminho direto via eBGP multihop (R1-R3) tem AS-PATH mais curto que o caminho via R2. Sem o Weight, qual caminho R1 preferiria? Depois de configurar o Weight, isso muda?",
      },
    },
    {
      id: 4,
      title: "Anunciar default também pelo backup",
      theory: `Para que R3 tenha uma default de backup via R1–R4, R1 pode anunciar default também para o peer eBGP multihop.

Mas quando o caminho primário via R2 está ativo, queremos que R3 prefira a default via R2. Sem nenhuma política, a default direta (AS-PATH '1') é mais curta que a via R2 ('2 1') e R3 a preferiria. Para evitar isso, aplicamos AS-Path Prepend somente na default anunciada diretamente de R1 para R3, com "default-originate route-map".`,
      description: `Responda a previsão. Faça em DUAS etapas.

1) Primeiro, a default simples, e veja em R3 qual é o best:
  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.34.1 default-originate
  end
  clear bgp * soft out

2) Agora com o prepend (a route-map só precisa do 'set'):
  configure terminal
  route-map PREPEND_DEFAULT permit 10
   set as-path prepend {{prependDefault}}
  exit
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.34.1 default-originate route-map PREPEND_DEFAULT
  end
  clear bgp * soft out

Veja de novo as duas defaults em R3. Na captura de R1, procure o UPDATE com 'Updated routes: 0.0.0.0/0' enviado a R3: qual o AS Path?`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme default-originate e a route-map" },
        { cmd: "clear bgp * soft out", router: "R1", desc: "Reenvia os anúncios" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R3", desc: "As duas defaults: qual é o best?" },
      ],
      expected: "Etapa 1 (sem prepend): R3 prefere a default DIRETA de R1 (AS-PATH '1', best (AS Path)) — o backup virou o primário. Etapa 2 (com o prepend): a default direta aparece com AS-PATH '1 {{prependDefault}}' e R3 volta a preferir a default via R2 ('2 1', best (AS Path)), mantendo a direta como alternativa. Na captura: UPDATE de R1 para 10.0.34.1 com 'AS Path ... 1 {{prependDefault}}' e 0.0.0.0/0.",
      predict: {
        id: "predict_default_backup",
        prompt: "Se R1 anunciar a default a R3 pela sessão multihop SEM nenhum prepend, qual default R3 prefere — a via R2 ou a direta? E depois do AS-Path Prepend na default direta?",
      },
    },
    {
      id: 5,
      title: "Testar o backup de verdade",
      theory: `Um bom desenho de backup precisa ser testado. Como cada aluno tem a sua própria rede, dá para derrubar o caminho primário sem risco: em R2, 'neighbor 10.0.12.1 shutdown' desliga a sessão R1–R2.

Sem ela, R3 perde a default via R2 e deve passar a usar a default de backup, pelo caminho direto de R1 via R4. Ao religar, o caminho primário volta, por ter o AS-PATH mais curto.`,
      description: `Responda a previsão e derrube a sessão primária em R2:

  configure terminal
  router bgp 2
   neighbor 10.0.12.1 shutdown
  end

Em R3, o que acontece com a default? E em R1, o estado da sessão com R2? Na captura de R1, procure a NOTIFICATION que R2 manda.

Depois RELIGUE e confirme que R3 volta ao caminho primário:
  configure terminal
  router bgp 2
   no neighbor 10.0.12.1 shutdown
  end`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show ip bgp 0.0.0.0/0", router: "R3", desc: "ANTES: best via R2" },
        { cmd: "show bgp summary", router: "R1", desc: "A sessão com R2 (10.0.12.2) e a multihop com R3" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R3", desc: "DURANTE: qual default sobrou? Com que AS-PATH?" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R3", desc: "DEPOIS de religar R2: voltou ao primário?" },
        { cmd: "show ip bgp 10.2.2.0/24", router: "R1", desc: "R1 ainda alcança R2? Por onde?" },
      ],
      expected: "Com a sessão desligada, R3 fica só com a default direta (via 14.14.14.1, AS-PATH '1 {{prependDefault}}') como best; R1 mostra a sessão com 10.0.12.2 fora de Established. Na captura de R1: 'Notification Message (3) ... Cease'. Depois de religar (e esperar uns 15 s), R3 volta a preferir a default via R2 ('2 1', best (AS Path)). O backup funcionou.",
      predict: {
        id: "predict_failover",
        prompt: "Se a sessão R1–R2 cair, qual default você espera que R3 passe a usar? E ao religar?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Primário, Backup e Teste",
    description: `Estado final esperado:

1. R1 anuncia default para R2 (primário).
2. R1 e R3 formam eBGP multihop atravessando R4, com ebgp-multihop {{multihopTtl}}.
3. R1 prefere as rotas vindas de R2 por Weight {{weightValue}}.
4. R1 anuncia default para R3 com AS-Path Prepend {{prependDefault}}, mantendo-a como backup.
5. Você testou o backup derrubando a sessão R1–R2 e religou.

Responda às perguntas, baseadas no que você viu nas saídas e na captura.`,
    hints: [
      "eBGP multihop precisa de rota IP até o endereço remoto.",
      "O eBGP envia com TTL 1; o ebgp-multihop define o TTL.",
      "Weight é local e vence antes do AS-PATH.",
      "default-originate simples faria o backup virar primário; o prepend resolve.",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Por que precisamos de rotas /32 para a sessão eBGP multihop R1-R3?",
        options: [
          "Porque BGP não aceita interfaces Ethernet",
          "Porque a sessão BGP usa endereços que não estão diretamente conectados",
          "Porque Weight só funciona com rota estática",
          "Porque R4 precisa virar route-reflector",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Quais comandos tornam possível uma sessão eBGP entre vizinhos não diretamente conectados?",
        options: [
          "next-hop-self e no-advertise",
          "aggregate-address e summary-only",
          "ebgp-multihop e update-source",
          "route-reflector-client e cluster-id",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Por que Weight faz R1 preferir o caminho via R2?",
        options: [
          "Weight é anunciado para R3 e muda o AS-PATH",
          "Weight cria uma rota default automaticamente",
          "Weight é local ao roteador e vence antes de AS-PATH",
          "Weight reduz a distância administrativa do OSPF",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Qual é o objetivo de aplicar Weight no vizinho R2 em R1?",
        options: [
          "Para impedir que R1 forme sessão com R3",
          "Para anunciar 14.14.14.0/24 em BGP",
          "Para transformar R4 em BGP speaker",
          "Para manter R1 preferindo o caminho primário via R2 quando ele estiver disponível",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual é o efeito do AS-Path Prepend na default anunciada diretamente de R1 para R3?",
        options: [
          "Ele remove a default da tabela BGP",
          "Ele torna a default anunciada pelo caminho direto menos preferida",
          "Ele aumenta o Weight da rota",
          "Ele troca o ASN de R3",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Qual é o papel de R4 nesta adaptação do lab?",
        options: [
          "R4 é o route-reflector do AS 1",
          "R4 anuncia todas as rotas por OSPF",
          "R4 aplica Local Preference em R1",
          "R4 apenas encaminha IP entre R1 e R3; ele não participa do BGP",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "Por que a sessão R1–R3 não subia sem o ebgp-multihop?",
        options: [
          "A rota estática estava errada",
          "O eBGP envia com TTL 1; o SYN chega a R4, que o descarta, e não há SYN-ACK",
          "R3 não tinha o prefixo de R1",
          "O Weight bloqueava a sessão",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "O que aconteceu em R3 quando você derrubou a sessão R1–R2?",
        options: [
          "R3 ficou sem nenhuma default",
          "R3 passa a usar a default direta de R1 (com o prepend) e, ao religar R2, volta para a via R2",
          "R3 derrubou a sessão com R1 também",
          "R3 trocou de AS",
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
!
interface eth1
 ip address 10.0.12.1/30
!
interface eth2
 ip address 14.14.14.1/24
!
router bgp 1
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.12.2 remote-as 2
 !
 address-family ipv4 unicast
  neighbor 10.0.12.2 activate
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
 ip address 10.0.23.2/30
!
interface eth2
 ip address 10.0.34.1/30
!
router bgp 3
 bgp router-id 3.3.3.3
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.23.1 remote-as 2
 !
 address-family ipv4 unicast
  network 10.3.3.0/24
  neighbor 10.0.23.1 activate
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
 ip address 10.0.34.2/30
!
interface eth2
 ip address 14.14.14.4/24
!
ip route 10.2.2.0/24 10.0.34.1
ip route 10.3.3.0/24 10.0.34.1
`,
  },
};

module.exports = lab;
