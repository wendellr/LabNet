/**
 * Lab 7 — BGP+OSPF Nível 1: BGP Backdoor e AS-Path Prepend
 * Topic: Distância administrativa, redistribuição e backdoor
 * Difficulty: Intermediário
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - R1 e R4 são do mesmo AS 1, sem iBGP entre eles; sem política, R3 prefere
 *    a default direta de R4 ("1", best AS Path); com `default-originate
 *    route-map` + `set as-path prepend` o set é aplicado ("1 1 1") e R3 passa
 *    a preferir a via R2 ("2 1");
 *  - o comando do lab antigo `redistribute bgp 1` NÃO existe no ospfd do
 *    FRR ("% Unknown command"): é `redistribute bgp [metric N]`. Com o
 *    comando errado o OSPF não leva nenhuma rota externa e o backdoor não
 *    tem o que preferir;
 *  - com `redistribute bgp metric N` em R1 e R4, a LSA External (E2) chega
 *    com `type 2, metric N`; em R4 a rota O 10.2.2.0/24 [110/N] fica
 *    conhecida mas NÃO instalada: a eBGP (distância 20) vence;
 *  - `network 10.2.2.0/24 backdoor` não muda nada sozinho: a distância da
 *    rota BGP já instalada só passa a 200 depois de `clear bgp *` (um
 *    `clear bgp * soft` não basta); aí a OSPF (110) é a instalada e a BGP
 *    fica como B [200/0];
 *  - se o enlace R1–R4 cai, a rota BGP volta a ser a usada (fallback).
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";
// Lista de prefixos de 'Updated routes:' até o prefixo procurado
const ROUTES_TO = (pfx) => "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+" + pfx;

const lab = {
  id: 7,
  protocol: "bgp+ospf",
  level: 1,
  scenario: "Duas filiais de uma mesma empresa têm um link interno próprio (via OSPF) além da conexão via internet/BGP entre elas. Por padrão, BGP venceria pela distância administrativa menor, mesmo o link interno sendo mais barato e confiável — desperdiçando banda paga de trânsito para tráfego que poderia ficar 100% dentro da rede da empresa. BGP Backdoor resolve isso, fazendo o roteador preferir o caminho IGP interno sempre que ele estiver disponível. Você vai ver a rota OSPF existir e perder para o BGP, aplicar o backdoor e testar o fallback derrubando o enlace interno.",
  title: "BGP Backdoor e AS-Path Prepend",
  topic: "Distância administrativa, redistribuição e backdoor",
  difficulty: "Intermediário",
  duration: "70 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
  },
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
    ["R3", "eth2", "R4", "eth1"],
    ["R1", "eth2", "R4", "eth2"],
  ],

  variables: {
    prependArg: { pool: ["1 1", "1 1 1", "1 1 1 1"] },
    // métrica E2 da redistribuição BGP→OSPF (aparece na LSA e em [110/N])
    redistMetric: { pool: ["20", "30", "40", "50"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=7). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "BGP Backdoor — Prepend e OSPF",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 7",
      points: [
        "**Distância administrativa**: por que o eBGP vence o OSPF",
        "A topologia: dois roteadores do **mesmo AS**, **sem iBGP**, ligados por um enlace **interno**",
        "**default-originate** + **prepend** (revisão) para escolher a saída",
        "**Redistribuir BGP no OSPF** — e o comando que **muda** no FRR",
        "**`network ... backdoor`**: mudar a distância da rota BGP",
        "O **fallback**: o BGP assume se o enlace interno cai",
      ],
      note: "Este lab parte dos Labs 5, 6 e 8: default-originate, prepend e prefix-list. Aqui entra o OSPF.",
    },
    {
      title: "A topologia do Lab 7",
      diagram: [
        "  AS 1                AS 2          AS 3               AS 1",
        "  ┌────┐ 10.0.12.0/30 ┌────┐ 10.0.23.0/30 ┌────┐ 10.0.34.0/30 ┌────┐",
        "  │ R1 ├──────────────┤ R2 ├──────────────┤ R3 ├──────────────┤ R4 │",
        "  └─┬──┘              └────┘              └────┘              └─┬──┘",
        "    │                                                           │",
        "    └────────────── 14.0.0.0/24 (OSPF, backdoor) ───────────────┘",
      ].join("\n"),
      points: [
        "**R1** e **R4** são do **mesmo AS 1**, mas **não formam iBGP** entre si. Cada um fala eBGP só com o seu vizinho (R2 e R3).",
        "Os dois também compartilham o enlace **`14.0.0.0/24`**: o caminho **interno**, onde vai rodar **OSPF**.",
        "**R2** anuncia `10.2.2.0/24` e **R3** anuncia `10.3.3.0/24`. R4 aprende essas rotas **por R3** (eBGP) e vai poder aprendê-las **por R1** (OSPF).",
      ],
    },
    {
      title: "Quem vence: a distância administrativa",
      table: {
        head: ["Origem da rota", "Distância administrativa"],
        rows: [
          ["Conectada", "0"],
          ["Estática", "1"],
          ["**eBGP**", "**20**"],
          ["**OSPF**", "**110**"],
          ["iBGP", "200"],
        ],
      },
      points: [
        "Quando **dois protocolos** oferecem rota para **o mesmo prefixo**, vence a **menor distância**. É anterior a qualquer métrica.",
        "Por isso, **eBGP (20) vence OSPF (110)** — **mesmo** que o OSPF seja o caminho barato e interno.",
        "O objetivo do lab: **inverter** isso para dois prefixos específicos, **sem desligar o BGP**.",
      ],
    },
    {
      title: "Defaults e prepend (revisão)",
      points: [
        "R1 anuncia uma **default** a R2 e R4 anuncia uma **default** a R3 (`neighbor X default-originate`). Assim R2 e R3 alcançam o enlace `14.0.0.0/24` **sem** que ele esteja no BGP.",
        "R3 recebe **duas defaults**: a direta de R4 (AS-PATH `1`) e a que vem por R2 (AS-PATH `2 1`). A direta é **mais curta** e **vence**.",
        "Com **prepend** na default de R4 (`default-originate route-map` + `set as-path prepend`), a direta fica `1 1 1` (ou mais) e R3 **prefere a via R2**. Validado no Lab 8.",
      ],
      code: "route-map PREPEND_DEFAULT permit 10\n set as-path prepend 1 1\n!\nrouter bgp 1\n address-family ipv4 unicast\n  neighbor 10.0.34.1 default-originate route-map PREPEND_DEFAULT",
    },
    {
      title: "OSPF entre R1 e R4 e a redistribuição",
      points: [
        "**OSPF** na rede `14.0.0.0/24` (área 0) dá a R1 e R4 um **caminho IGP** entre si.",
        "Para o OSPF **levar** as rotas que cada um aprendeu por BGP, **redistribui-se BGP no OSPF**: R1 anuncia `10.2.2.0/24` e `10.3.3.0/24` (que aprendeu de R2) e R4 faz o mesmo.",
        "**Cuidado com a sintaxe:** no FRR o comando é **`redistribute bgp`** (ou `redistribute bgp metric N`) — **sem** o número do AS. Escrever `redistribute bgp 1` dá **\"% Unknown command\"**. Validado neste lab.",
        "As rotas redistribuídas viram **LSAs External (Type 5, E2)** com a **métrica** que você der (`type 2, metric N`).",
      ],
      code: "router ospf\n network 14.0.0.0/24 area 0\n redistribute bgp metric 30",
    },
    {
      title: "A LSA externa no fio",
      code: "14.0.0.1 > 14.0.0.4: OSPFv2, LS-Update\n\t  Advertising Router 1.1.1.1, seq 0x80000001, age 41s, length 16\n\t    External LSA (5), LSA-ID: 10.2.2.0\n\t    Mask 255.255.255.0\n\t\ttopology default (0), type 2, metric 30",
      points: [
        "É o LS-Update de **R1** para **R4**: a rota `10.2.2.0/24` que R1 aprendeu por BGP chega a R4 **como rota externa do OSPF**.",
        "**type 2** = **E2**: a métrica **não soma** o custo interno do caminho. É a que você configurou (`metric N`).",
        "R4 também **anuncia as dele** a R1 (e vice-versa): os dois redistribuem.",
      ],
      note: "Saída real do tcpdump em R4 (com redistribute bgp metric 30).",
    },
    {
      title: "O problema: a rota OSPF existe, mas não vale",
      code: "R4# show ip route ospf\nO   10.2.2.0/24 [110/30] via 14.0.0.1, eth2\nO   10.3.3.0/24 [110/30] via 14.0.0.1, eth2\n\nR4# show ip route 10.2.2.0/24\n  Known via \"bgp\", distance 20 ... best\n  Known via \"ospf\", distance 110, metric 30",
      points: [
        "Depois do OSPF, R4 **conhece** a rota por R1 — mas **sem** `>*` na tabela: ela **não está instalada**.",
        "A **eBGP** (distância 20) vence a **OSPF** (110). O tráfego continua indo pelo **trânsito pago**.",
        "Aumentar a métrica do OSPF não adianta: a **distância** vence **antes** da métrica.",
        "É o que o **backdoor** resolve.",
      ],
      note: "Validado neste lab: com OSPF Full e as LSAs externas no banco, R4 ainda usava a rota BGP.",
    },
    {
      title: "network ... backdoor",
      points: [
        "`network 10.2.2.0/24 backdoor` diz ao BGP: *\"este prefixo tem um caminho IGP — trate a minha rota eBGP dele como **de reserva**\"*.",
        "Efeito prático: a **distância** da rota **eBGP** desses prefixos passa de **20 para 200**. Como 200 > 110, a **OSPF vence**.",
        "O comando **não anuncia** o prefixo e **não cria** rota: só **muda a distância** da rota BGP que já existe.",
        "Se a rota IGP **some**, a BGP (200) volta a ser a **única** — é o **fallback**.",
      ],
      code: "router bgp 1\n address-family ipv4 unicast\n  network 10.2.2.0/24 backdoor\n  network 10.3.3.0/24 backdoor",
    },
    {
      title: "A distância só muda depois de clear bgp *",
      points: [
        "Marcar o prefixo como backdoor **não recalcula** a distância de uma rota BGP **já instalada**. Em `show ip route 10.2.2.0/24` continua **`distance 20`**.",
        "**`clear bgp * soft`** também **não basta**: ele só reenvia/reaplica políticas, não reinstala a rota.",
        "É preciso **`clear bgp *`** (reset das sessões): as rotas voltam com **`distance 200`** e a **OSPF** assume.",
        "Como a OSPF só aparece com `>*` na tabela, **`show ip route`** mostra os **dois** protocolos: `B ... [200/0]` e `O>* ... [110/N]`.",
      ],
      note: "Validado neste lab: sem o clear, a rota BGP seguiu com distância 20; com `clear bgp *`, passou a 200 e a OSPF ficou instalada.",
    },
    {
      title: "O fallback: testar de verdade",
      points: [
        "O BGP backdoor **não desliga** o BGP: a rota fica **guardada**, com distância 200.",
        "Para testar: em R4, `interface eth2` → `shutdown`. A rota OSPF **some** e a rota **BGP volta a ser a instalada** (`Known via \"bgp\", distance 200, best`).",
        "Ao religar (`no shutdown`), o OSPF precisa **reconstruir** a adjacência com R1 (**dezenas de segundos**) e então **retoma**.",
        "Esse é o desenho: **IGP interno primeiro**, **trânsito pago de reserva**.",
      ],
      note: "Validado neste lab: com eth2 de R4 em shutdown, 10.2.2.0/24 voltou a ser BGP com distance 200.",
    },
    {
      title: "Roteiro do Lab 7",
      points: [
        "**Passo 1:** reconhecer a topologia — **mesmo AS sem iBGP**.",
        "**Passo 2:** **defaults** de R1 e R4; R3 prefere a direta.",
        "**Passo 3:** **prepend** em R4: R3 passa a preferir a via R2. Com captura.",
        "**Passo 4:** **OSPF** R1–R4 e **`redistribute bgp metric N`**: a rota OSPF existe, mas **não vale**.",
        "**Passo 5:** **backdoor** + `clear bgp *`: a OSPF assume; depois o **fallback**.",
        "Nos passos 2, 3, 4 e 5 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas a default de R4 com o seu prepend e a LSA External de R1 com a sua métrica. Deixe a captura de R4 (OSPF + BGP) rodando do passo 3 ao 5.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: explicar **por que a OSPF não era instalada**; mostrar a **LSA externa** com a sua métrica; explicar **o que o backdoor muda** (e por que precisou do `clear bgp *`); e mostrar o **fallback**.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "R1 e R4 são do mesmo AS. Por que não há iBGP entre eles, e como cada um aprende as rotas de R2 e R3?",
      lookFor: "O lab evita iBGP direto: cada um tem só eBGP com o seu vizinho (R1–R2, R4–R3). R1 aprende 10.2.2.0 por R2 ('2') e 10.3.3.0 por R2 ('2 3'); R4 aprende por R3 (10.3.3.0 '3', 10.2.2.0 '3 2'). O enlace 14.0.0.0/24 é o caminho interno, que vira OSPF.",
    },
    {
      id: "e2",
      prompt: "R3 recebe duas defaults. Qual prefere antes do prepend ({{prependArg}}) e qual depois? Mostre na captura.",
      lookFor: "Antes: a direta de R4 ('1'), best (AS Path), mais curta que a via R2 ('2 1'). Depois do default-originate route-map com prepend: '1 {{prependArg}}' (mais longa) e R3 prefere a via R2. Captura: UPDATE de R4 para R3 com 'AS Path ... 1 {{prependArg}}' e 0.0.0.0/0.",
    },
    {
      id: "e3",
      prompt: "Você tentou 'redistribute bgp 1' no OSPF. O que aconteceu? Qual o comando certo?",
      lookFor: "'% Unknown command': no ospfd do FRR é 'redistribute bgp' (opcionalmente metric N), sem o número do AS. Com o comando errado o OSPF não anuncia nenhuma rota BGP e não aparece LSA externa. Certo: 'redistribute bgp metric {{redistMetric}}'.",
    },
    {
      id: "e4",
      prompt: "Com o OSPF Full entre R1 e R4, a rota OSPF para 10.2.2.0/24 estava instalada em R4? Por quê? Mostre a LSA na captura.",
      lookFor: "Não: aparece como 'O 10.2.2.0/24 [110/{{redistMetric}}]' sem '>*'; a eBGP (distância 20) vence a OSPF (110). Captura: LS-Update de R1 com 'External LSA (5), LSA-ID: 10.2.2.0 ... type 2, metric {{redistMetric}}' — E2 com a métrica que o aluno escolheu.",
    },
    {
      id: "e5",
      prompt: "O que o 'network ... backdoor' faz? Por que foi preciso 'clear bgp *'?",
      lookFor: "Muda a distância da rota eBGP desse prefixo de 20 para 200 (não anuncia nem cria rota). A distância da rota já instalada só é recalculada num reset da sessão: 'clear bgp * soft' não basta. Depois, 'show ip route': B [200/0] e O>* [110/{{redistMetric}}] — a OSPF assume.",
    },
    {
      id: "e6",
      prompt: "Você derrubou eth2 de R4. O que aconteceu com 10.2.2.0/24? E ao religar?",
      lookFor: "A rota OSPF sumiu e a BGP (distância 200) voltou a ser a instalada: fallback pelo trânsito. Ao religar, o OSPF precisa reconstruir a adjacência (dezenas de segundos) e a rota OSPF retoma. IGP interno primeiro, trânsito pago de reserva.",
    },
  ],

  autoGrade: [
    { id: "checked_sessions", label: "Verificou as sessões BGP", cmdContains: "show bgp summary" },
    { id: "default_typed", label: "Configurou o default-originate", cmdContains: "default-originate" },
    { id: "prepend_typed", label: "Configurou o prepend na default de R4", router: "R4", cmdContains: "as-path prepend" },
    { id: "redistribute_typed", label: "Redistribuiu BGP no OSPF", cmdContains: "redistribute bgp" },
    { id: "backdoor_typed", label: "Configurou o network backdoor", router: "R4", cmdContains: "backdoor" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_default_prepend", label: "Capturou a default de R4 com o seu prepend", router: "R4", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1 {{prependArg}}\\s" + UPD_NT + ROUTES_TO("0\\.0\\.0\\.0/0") },
    { id: "captured_external_lsa", label: "Capturou a LSA External de R1 com a sua métrica", router: "R4", capturePattern: "OSPFv2, LS-Update[\\s\\S]*Advertising Router 1\\.1\\.1\\.1[^\\n]*\\n\\s*External LSA \\(5\\), LSA-ID: 10\\.2\\.2\\.0\\s+Options:[^\\n]*\\s+Mask[^\\n]*\\s+topology default \\(0\\), type 2, metric {{redistMetric}}" },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP de R2 verificadas",
      weight: 2,
      check: { router: "R2", cmdPattern: "show bgp summary", outputPattern: "\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    },
    {
      id: "default_originate_r1",
      label: "R1 anuncia default a R2 (default-originate)",
      weight: 4,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.12\\.2 default-originate" },
    },
    {
      id: "default_originate_r4",
      label: "R4 anuncia default a R3 com route-map",
      weight: 6,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "neighbor 10\\.0\\.34\\.1 default-originate route-map \\S+" },
    },
    {
      id: "prepend_default",
      label: "Prepend {{prependArg}} na default de R4",
      weight: 6,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "set as-path prepend {{prependArg}}\\s" },
    },
    {
      id: "r3_prefers_indirect_default",
      label: "R3 prefere a default via R2/R1 (best AS Path)",
      weight: 8,
      check: { router: "R3", cmdPattern: "show ip bgp 0.0.0.0/0", outputPattern: "2 1\\s+10\\.0\\.23\\.1 from 10\\.0\\.23\\.1[\\s\\S]*?best \\(AS Path\\)" },
    },
    {
      id: "ospf_neighbor",
      label: "Adjacência OSPF R4–R1 em Full",
      weight: 6,
      check: { router: "R4", cmdPattern: "show ip ospf neighbor", outputPattern: "1\\.1\\.1\\.1[\\s\\S]*?Full" },
    },
    {
      id: "redistribute_r1",
      label: "R1 redistribui BGP no OSPF com metric {{redistMetric}}",
      weight: 5,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "redistribute bgp metric {{redistMetric}}" },
    },
    {
      id: "redistribute_r4",
      label: "R4 redistribui BGP no OSPF com metric {{redistMetric}}",
      weight: 5,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "redistribute bgp metric {{redistMetric}}" },
    },
    {
      id: "external_lsa_in_r4",
      label: "R4 recebe a LSA External de R1 para 10.2.2.0 com Metric {{redistMetric}}",
      weight: 6,
      check: { router: "R4", cmdPattern: "show ip ospf database external", outputPattern: "Link State ID: 10\\.2\\.2\\.0[\\s\\S]*?Advertising Router: 1\\.1\\.1\\.1[\\s\\S]*?Metric: {{redistMetric}}\\b" },
    },
    {
      id: "backdoor_10_2_2",
      label: "network 10.2.2.0/24 backdoor configurado em R4",
      weight: 5,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "network 10\\.2\\.2\\.0/24 backdoor" },
    },
    {
      id: "backdoor_10_3_3",
      label: "network 10.3.3.0/24 backdoor configurado em R4",
      weight: 5,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "network 10\\.3\\.3\\.0/24 backdoor" },
    },
    {
      id: "ospf_wins_10_2_2",
      label: "R4 instala a rota OSPF para 10.2.2.0/24 (o BGP backdoor vale)",
      weight: 12,
      check: { router: "R4", cmdPattern: "show ip route 10.2.2.0/24", outputPattern: "Known via \"ospf\", distance 110, metric {{redistMetric}}, best" },
    },
    {
      id: "ospf_wins_10_3_3",
      label: "R4 instala a rota OSPF para 10.3.3.0/24 (o BGP backdoor vale)",
      weight: 12,
      check: { router: "R4", cmdPattern: "show ip route 10.3.3.0/24", outputPattern: "Known via \"ospf\", distance 110, metric {{redistMetric}}, best" },
    },
    {
      id: "bgp_fallback_kept",
      label: "R4 mantém o caminho BGP de 10.2.2.0/24 como alternativa (distância 200)",
      weight: 4,
      check: { router: "R4", cmdPattern: "show ip route 10.2.2.0/24", outputPattern: "Known via \"bgp\", distance 200" },
    },
    {
      id: "capture_default_prepend",
      label: "Capturou a default de R4 para R3 com AS Path 1 {{prependArg}}",
      weight: 7,
      check: { type: "capture", router: "R4", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1 {{prependArg}}\\s" + UPD_NT + ROUTES_TO("0\\.0\\.0\\.0/0") },
    },
    {
      id: "capture_external_lsa",
      label: "Capturou a LSA External (E2) de R1 para 10.2.2.0 com metric {{redistMetric}}",
      weight: 7,
      check: { type: "capture", router: "R4", packetPattern: "OSPFv2, LS-Update[\\s\\S]*Advertising Router 1\\.1\\.1\\.1[^\\n]*\\n\\s*External LSA \\(5\\), LSA-ID: 10\\.2\\.2\\.0\\s+Options:[^\\n]*\\s+Mask[^\\n]*\\s+topology default \\(0\\), type 2, metric {{redistMetric}}" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["não", "nao", "sem sessão", "sem sessao", "ibgp", "só", "so", "cada"],
      anyOf: true,
      points: 6,
      hint: "R1 e R4 são do mesmo AS, mas não têm sessão entre si: cada um tem só eBGP com o seu vizinho. Não trocam rotas por BGP.",
    },
    predict_step2: {
      type: "keywords",
      required: ["r4", "direto", "curto", "menor"],
      anyOf: true,
      points: 6,
      hint: "A default originada diretamente por R4 tem AS-PATH de 1 salto só (o próprio AS de R4); a que vem via R2 já chega com 2 ASes no caminho (R2 e R1).",
    },
    predict_step4: {
      type: "keywords",
      required: ["ebgp", "bgp", "20", "distância", "distancia", "não instal", "nao instal", "vence"],
      anyOf: true,
      points: 8,
      hint: "A rota OSPF existe mas não é instalada: eBGP (distância 20) vence OSPF (110) mesmo com o vizinho OSPF Full.",
    },
    predict_step5: {
      type: "keywords",
      required: ["clear", "reset", "não muda", "nao muda", "200", "distância", "distancia"],
      anyOf: true,
      points: 8,
      hint: "A distância da rota BGP já instalada só passa a 200 depois de um 'clear bgp *' (reset da sessão); um clear soft não basta.",
    },
    q1: { type: "radio", correct: "Porque R1 e R4 estão no mesmo AS, mas o lab quer evitar iBGP direto entre eles", points: 10 },
    q2: { type: "radio", correct: "default-originate", points: 8 },
    q3: { type: "radio", correct: "Aplicar AS-Path Prepend na default anunciada por R4 para R3", points: 8 },
    q4: { type: "radio", correct: "Ele aumenta a distância administrativa da rota eBGP específica para 200, permitindo preferir uma rota IGP", points: 10 },
    q5: { type: "radio", correct: "OSPF fornece o caminho interno alternativo entre R1 e R4", points: 8 },
    q6: { type: "radio", correct: "A rota BGP volta a ser usada como fallback quando a rota IGP desaparece", points: 8 },
    q7: { type: "radio", correct: "No ospfd do FRR o comando é 'redistribute bgp' (sem o número do AS); 'redistribute bgp 1' dá Unknown command", points: 10 },
    q8: { type: "radio", correct: "A rota BGP já instalada só passa à distância 200 depois de 'clear bgp *'; um 'clear bgp * soft' não basta", points: 10 },
  },

  steps: [
    {
      id: 1,
      title: "Reconhecer AS duplicado sem iBGP",
      theory: `R1 e R4 pertencem ao mesmo AS 1, mas não formam sessão iBGP entre si. Eles estão conectados pela rede 14.0.0.0/24, que representa uma ligação interna/backdoor.

R2 e R3 são ASes intermediários. O lab usa default routes para permitir que R2 e R3 alcancem a rede 14.0.0.0/24 sem anunciar essa rede explicitamente no BGP.`,
      description: `Responda a previsão e verifique as sessões BGP. Observe que R1 fala apenas com R2, e R4 fala apenas com R3. Compare as tabelas BGP de R1 e R4: o que cada um aprendeu e com qual AS-PATH?`,
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "Só a sessão com R2" },
        { cmd: "show bgp summary", router: "R4", desc: "Só a sessão com R3" },
        { cmd: "show ip bgp", router: "R1", desc: "10.2.2.0/24 e 10.3.3.0/24, ambos por R2" },
        { cmd: "show ip bgp", router: "R4", desc: "10.2.2.0/24 e 10.3.3.0/24, ambos por R3" },
        { cmd: "show bgp summary", router: "R2", desc: "R2 tem sessões com R1 e R3" },
        { cmd: "show bgp summary", router: "R3", desc: "R3 tem sessões com R2 e R4" },
      ],
      expected: "Sessões estabelecidas ao longo da cadeia R1–R2–R3–R4, sem sessão entre R1 e R4. R1 aprende 10.2.2.0/24 (AS-PATH '2') e 10.3.3.0/24 ('2 3') por R2; R4 aprende 10.3.3.0/24 ('3') e 10.2.2.0/24 ('3 2') por R3.",
      predict: {
        id: "predict_step1",
        prompt: "R1 e R4 são do mesmo AS 1, mas sem nenhuma sessão iBGP entre eles. Você espera que R1 e R4 troquem rotas por BGP? Por quê?",
      },
    },
    {
      id: 2,
      title: "Anunciar default route pelas bordas do AS 1",
      theory: `"neighbor X default-originate" anuncia 0.0.0.0/0 para um vizinho BGP.

Neste lab, R1 anuncia default para R2 e R4 anuncia default para R3. Assim R2 e R3 conseguem alcançar a rede 14.0.0.0/24 por uma saída genérica, sem que 14.0.0.0/24 seja anunciado diretamente em BGP.`,
      description: `Responda a previsão e configure:

No R1:
  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.12.2 default-originate
  end
  clear bgp * soft out

No R4:
  configure terminal
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.34.1 default-originate
  end
  clear bgp * soft out

Depois veja as defaults em R2 e R3: quantas cada um recebe e qual é a best?`,
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme o default-originate" },
        { cmd: "show running-config", router: "R4", desc: "Confirme o default-originate" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R2", desc: "As defaults de R2" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R3", desc: "Duas defaults: a direta de R4 e a via R2 — qual é a best?" },
      ],
      expected: "R2 e R3 veem a default por BGP. R3 recebe duas: a direta de R4 (AS-PATH '1') e a vinda de R2 (AS-PATH '2 1'); a direta é a best, 'best (AS Path)'.",
      predict: {
        id: "predict_step2",
        prompt: "Antes de aplicar qualquer prepend: das duas defaults que R3 recebe (uma direto de R4, outra via R2/R1), qual você espera que R3 prefira, e por quê?",
      },
    },
    {
      id: 3,
      title: "Influenciar a default com AS-Path Prepend",
      theory: `AS-Path Prepend torna um caminho menos preferido repetindo o ASN no AS-PATH.

R3 hoje prefere a default vinda direto de R4, porque ela tem o AS-PATH mais curto. Se R4 anunciar essa default com o AS 1 repetido, ela passa a ter AS-PATH mais longo que a alternativa via R2/R1 — e R3 deve trocar de preferência. O route-map no default-originate só precisa do 'set'.`,
      description: `Abra a captura em R4, interface 'todas', protocolo OSPF + BGP, e deixe-a rodando até o fim do lab (se parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Configure em R4:

  configure terminal
  route-map PREPEND_DEFAULT permit 10
   set as-path prepend {{prependArg}}
  exit
  router bgp 1
   address-family ipv4 unicast
    neighbor 10.0.34.1 default-originate route-map PREPEND_DEFAULT
  end
  clear bgp * soft out

Depois compare em R3 os AS-PATHs das duas defaults. Na captura, procure o UPDATE de R4 para R3 com 0.0.0.0/0.`,
      capture: { router: "R4", iface: "any", filter: "all" },
      commands: [
        { cmd: "show running-config", router: "R4", desc: "Confirme a route-map e o default-originate com route-map" },
        { cmd: "clear bgp * soft out", router: "R4", desc: "Reenvia a default com o prepend" },
        { cmd: "show ip bgp 0.0.0.0/0", router: "R3", desc: "Qual default é a best agora e com qual AS-PATH?" },
      ],
      expected: "R3 enxerga a default de R4 com AS-PATH '1 {{prependArg}}' (mais longo) e passa a preferir a vinda de R2 ('2 1', best (AS Path)). Na captura: UPDATE de R4 para 10.0.34.1 com 'AS Path ... 1 {{prependArg}}' e 0.0.0.0/0.",
    },
    {
      id: 4,
      title: "Criar o caminho IGP pelo enlace backdoor",
      theory: `Backdoor, neste contexto, é um caminho interno alternativo entre dois roteadores do mesmo AS.

Vamos usar OSPF entre R1 e R4 pela rede 14.0.0.0/24. Depois, R1 e R4 redistribuem rotas BGP para OSPF. Isso permite que R4 veja redes como 10.2.2.0/24 e 10.3.3.0/24 também via OSPF, além do caminho eBGP.

Atenção à sintaxe do FRR: 'redistribute bgp' não leva o número do AS. A métrica das rotas externas (E2) é a que você der com 'metric N'.`,
      description: `Responda a previsão e configure OSPF em R1 e R4:

No R1:
  configure terminal
  router ospf
   ospf router-id 1.1.1.1
   network 14.0.0.0/24 area 0
   redistribute bgp metric {{redistMetric}}
  end

No R4:
  configure terminal
  router ospf
   ospf router-id 4.4.4.4
   network 14.0.0.0/24 area 0
   redistribute bgp metric {{redistMetric}}
  end

(Se você digitar 'redistribute bgp 1', o FRR responde 'Unknown command': veja a diferença.)

Espere uns 50 segundos. Confira a vizinhança, o banco de LSAs externas de R4 e a tabela de rotas: a rota OSPF para 10.2.2.0/24 está INSTALADA ('>*')? Na captura, procure o LS-Update de R1 com 'External LSA (5)' de 10.2.2.0.`,
      capture: { router: "R4", iface: "any", filter: "all" },
      commands: [
        { cmd: "show running-config", router: "R4", desc: "Confirme 'redistribute bgp metric {{redistMetric}}' no router ospf" },
        { cmd: "show ip ospf neighbor", router: "R4", desc: "R1 (1.1.1.1) em Full?" },
        { cmd: "show ip ospf database external", router: "R4", desc: "As LSAs externas de R1 e R4, Metric {{redistMetric}}" },
        { cmd: "show ip route ospf", router: "R4", desc: "A rota O 10.2.2.0/24 [110/{{redistMetric}}] tem '>*'?" },
        { cmd: "show ip route 10.2.2.0/24", router: "R4", desc: "Quem é 'best': bgp ou ospf?" },
      ],
      expected: "OSPF forma vizinhança Full entre R1 e R4. R4 tem as LSAs externas de 10.2.2.0 e 10.3.3.0 (Advertising Router 1.1.1.1 e 4.4.4.4, Metric Type 2, Metric {{redistMetric}}) e 'O 10.2.2.0/24 [110/{{redistMetric}}] via 14.0.0.1' — mas SEM '>*': 'show ip route 10.2.2.0/24' diz 'Known via \"bgp\", distance 20 ... best' (a eBGP vence pela distância). Na captura: LS-Update de R1 com 'External LSA (5), LSA-ID: 10.2.2.0 ... type 2, metric {{redistMetric}}'.",
      predict: {
        id: "predict_step4",
        prompt: "Com o OSPF Full entre R1 e R4 e a rota OSPF conhecida, qual rota você espera que esteja INSTALADA (não só conhecida) em R4 para 10.2.2.0/24 — a eBGP ou a OSPF? Por quê?",
      },
    },
    {
      id: 5,
      title: "Aplicar BGP Backdoor e testar o fallback",
      theory: `Por padrão, eBGP tem distância administrativa 20, enquanto OSPF tem 110. Mesmo que exista um caminho interno OSPF, a rota eBGP normalmente vence.

O comando "network PREFIX backdoor" marca aquele prefixo como backdoor no BGP. O efeito prático é aumentar a distância administrativa da rota eBGP específica para 200. Assim, se existir uma rota IGP para o mesmo prefixo, ela passa a ser preferida. Se o IGP desaparecer, o BGP ainda serve como fallback.

Detalhe importante: marcar o prefixo como backdoor NÃO recalcula na hora a distância de uma rota BGP que já estava instalada. Um "clear bgp * soft" não basta: é preciso "clear bgp *" (reset das sessões).`,
      description: `Responda a previsão. Configure em R4, e PRIMEIRO olhe a rota SEM fazer o clear:

  configure terminal
  router bgp 1
   address-family ipv4 unicast
    network 10.2.2.0/24 backdoor
    network 10.3.3.0/24 backdoor
  end

Rode 'show ip route 10.2.2.0/24': qual a distância da rota BGP? Mudou? Agora aplique o reset completo:

  clear bgp *

Espere uns 20 segundos e veja de novo 'show ip route 10.2.2.0/24' e 'show ip route': quais rotas estão instaladas ('>*')?

Por fim, teste o fallback derrubando o enlace interno em R4:
  configure terminal
  interface eth2
   shutdown
  end
Veja 'show ip route 10.2.2.0/24'. Depois religue ('no shutdown') e espere uns 90 segundos: a OSPF volta?`,
      capture: { router: "R4", iface: "any", filter: "all" },
      commands: [
        { cmd: "show running-config", router: "R4", desc: "Confirme os dois 'network ... backdoor'" },
        { cmd: "show ip route 10.2.2.0/24", router: "R4", desc: "SEM o clear: a distância da BGP mudou?" },
        { cmd: "clear bgp *", router: "R4", desc: "Reset completo das sessões de R4" },
        { cmd: "show ip route 10.2.2.0/24", router: "R4", desc: "DEPOIS: bgp com distance 200 e ospf instalada?" },
        { cmd: "show ip route 10.3.3.0/24", router: "R4", desc: "O mesmo para 10.3.3.0/24" },
        { cmd: "show ip bgp 10.2.2.0/24", router: "R4", desc: "O caminho BGP continua guardado" },
        { cmd: "show ip route", router: "R4", desc: "Todas as rotas: B [200/0] e O>* [110/{{redistMetric}}]" },
      ],
      expected: "Sem o clear, 'show ip route 10.2.2.0/24' ainda diz 'Known via \"bgp\", distance 20'. Depois de 'clear bgp *': a rota BGP aparece como 'distance 200' (sem '>*') e a OSPF como 'Known via \"ospf\", distance 110, metric {{redistMetric}}, best' via 14.0.0.1; o caminho BGP continua em 'show ip bgp'. Com eth2 de R4 em shutdown, a rota OSPF some e 10.2.2.0/24 volta a ser 'Known via \"bgp\", distance 200 ... best' (fallback); ao religar, a OSPF retoma depois de dezenas de segundos.",
      predict: {
        id: "predict_step5",
        prompt: "Você configura 'network 10.2.2.0/24 backdoor' em R4 mas ainda NÃO faz clear bgp. A distância da rota BGP de 10.2.2.0/24 muda na hora? E depois de um 'clear bgp *'?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Backdoor, Prepend e Fallback",
    description: `Estado final esperado:

1. R1 e R4 anunciam default a R2 e R3; R4 aplica AS-Path Prepend {{prependArg}} na default anunciada a R3.
2. R1 e R4 formam OSPF pela rede 14.0.0.0/24, redistribuindo BGP com metric {{redistMetric}}.
3. R4 usa BGP backdoor para preferir OSPF em 10.2.2.0/24 e 10.3.3.0/24 (rotas O>* instaladas, BGP como alternativa).
4. Você testou o fallback derrubando o enlace e o religou.

Responda às perguntas, baseadas no que você viu nas saídas e na captura.`,
    hints: [
      "O eBGP tem distância 20 e o OSPF 110: o backdoor leva o eBGP a 200",
      "No FRR 'redistribute bgp' não leva o número do AS",
      "A distância só muda depois de 'clear bgp *'",
      "Se o IGP some, a rota BGP volta a ser usada",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Por que R1 e R4 não formam iBGP diretamente neste lab?",
        options: [
          "Porque BGP não funciona em roteadores do mesmo AS",
          "Porque R1 e R4 estão no mesmo AS, mas o lab quer evitar iBGP direto entre eles",
          "Porque OSPF substitui completamente o BGP",
          "Porque R1 e R4 não possuem conectividade IP",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Qual comando anuncia uma rota default para um vizinho BGP?",
        options: [
          "network 14.0.0.0/24 backdoor",
          "redistribute bgp",
          "next-hop-self",
          "default-originate",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Como fazer R3 preferir a default que chega via R2/R1 em vez da default direta via R4?",
        options: [
          "Aplicar no-advertise em todas as rotas de R1",
          "Criar iBGP entre R1 e R4",
          "Remover a sessão BGP entre R2 e R3",
          "Aplicar AS-Path Prepend na default anunciada por R4 para R3",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Qual é o efeito prático do BGP backdoor?",
        options: [
          "Ele anuncia automaticamente a rota para todos os peers",
          "Ele aumenta a distância administrativa da rota eBGP específica para 200, permitindo preferir uma rota IGP",
          "Ele cria uma community no-export",
          "Ele reduz a distância administrativa do eBGP para 1",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual é o papel do OSPF neste lab?",
        options: [
          "OSPF cria as sessões BGP",
          "OSPF remove os AS-PATHs",
          "OSPF envia communities BGP",
          "OSPF fornece o caminho interno alternativo entre R1 e R4",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "O que acontece com uma rota backdoor se a rota IGP desaparecer?",
        options: [
          "A rota fica permanentemente bloqueada",
          "A sessão BGP é encerrada",
          "A rota BGP volta a ser usada como fallback quando a rota IGP desaparece",
          "O prefixo vira rota default automaticamente",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "Qual a sintaxe correta para redistribuir BGP no OSPF no FRR?",
        options: [
          "redistribute bgp 1 metric 30",
          "No ospfd do FRR o comando é 'redistribute bgp' (sem o número do AS); 'redistribute bgp 1' dá Unknown command",
          "redistribute ospf bgp",
          "router ospf redistribute-bgp 1",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "Por que foi preciso 'clear bgp *' depois do 'network ... backdoor'?",
        options: [
          "Porque o backdoor só vale depois de reiniciar o roteador",
          "A rota BGP já instalada só passa à distância 200 depois de 'clear bgp *'; um 'clear bgp * soft' não basta",
          "Porque o clear anuncia o prefixo ao OSPF",
          "Porque o OSPF precisa de um novo Router ID",
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
 ip address 14.0.0.1/24
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
 neighbor 10.0.34.2 remote-as 1
 !
 address-family ipv4 unicast
  network 10.3.3.0/24
  neighbor 10.0.23.1 activate
  neighbor 10.0.34.2 activate
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
 ip address 14.0.0.4/24
!
router bgp 1
 bgp router-id 4.4.4.4
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 10.0.34.1 remote-as 3
 !
 address-family ipv4 unicast
  neighbor 10.0.34.1 activate
 exit-address-family
`,
  },
};

module.exports = lab;
