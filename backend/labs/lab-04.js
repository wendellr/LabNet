/**
 * Lab 4 — BGP Nível 6: Confederações
 * Topic: Escalabilidade BGP
 * Difficulty: Avançado
 *
 * Falha proposital: a confederação não está configurada, então R1 se
 * apresenta a R5 com o sub-AS 65001 e R5 recusa. O aluno diagnostica pelo
 * `show bgp neighbors` e pela captura (OPEN + NOTIFICATION) e só então
 * configura.
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - sem a confederação, R1→R5 envia "my AS 65001" no OPEN e R5 responde
 *    NOTIFICATION "OPEN Message Error (2), subcode Bad Peer AS (2)"; o
 *    `show bgp neighbors` mostra "Last reset ... (OPEN Message Error/Bad
 *    Peer AS)" e R1 repete a tentativa a cada ~16 s;
 *  - mudar o `bgp confederation identifier` reinicia as sessões do roteador
 *    (R2↔R3 cai e volta); depois o OPEN de R1 diz "my AS <pubAS>";
 *  - dentro da confederação o AS-PATH tem segmento "( 65002 )" e a sessão
 *    interna é "confed-internal"/"confed-external"; para R5 sai só o AS
 *    público;
 *  - o lab antigo não originava nenhum prefixo em R5: ele não anunciava
 *    5.5.5.0/24 e a sessão ficava com 0 prefixos recebidos em R1. Agora R5
 *    tem `ip route 5.5.5.0/24 Null0` e R4 vê "(65001) 200".
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";
// Lista de prefixos de 'Updated routes:' até o prefixo procurado
const ROUTES_TO = (pfx) => "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+" + pfx;

const lab = {
  id: 4,
  protocol: "bgp",
  level: 6,
  scenario: "Um provedor de médio porte cresceu e hoje mantém dezenas de roteadores em full-mesh iBGP dentro do mesmo AS — cada novo roteador significa mais N sessões para configurar e manter. Confederação BGP resolve a escalabilidade dividindo o AS em sub-ASes menores (cada um com seu próprio full-mesh), sem que os vizinhos externos percebam essa divisão: para eles, tudo continua sendo um único AS. Neste lab a confederação ainda não foi configurada e o cliente externo (R5) não consegue estabelecer sessão. Você vai diagnosticar pelo fio por que ela cai e depois montar a confederação.",
  title: "BGP Confederations",
  topic: "Escalabilidade BGP",
  difficulty: "Avançado",
  duration: "60 min",
  enabled: true,
  resourceProfile: "moderado",
  variables: {
    pubAS: { pool: ["100", "300", "700"] },
  },
  routers: ["R1", "R2", "R3", "R4", "R5"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
    ["R3", "eth2", "R4", "eth1"],
    ["R1", "eth2", "R5", "eth1"],
  ],

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=4). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "BGP — Confederações",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 4",
      points: [
        "O problema da **escala** do iBGP: a **malha completa**",
        "A **confederação**: sub-ASes por dentro, **um AS** por fora",
        "Os **três tipos de sessão**: iBGP, confed-eBGP e eBGP",
        "O que o **OPEN** diz — e por que o R5 **recusa** o R1 no início",
        "O **AS-PATH com segmento** de confederação, no fio",
        "O que **reinicia** quando você muda o identifier",
      ],
      note: "Este lab parte do Lab 3, que já usou uma confederação como cenário. Aqui ela é o assunto.",
    },
    {
      title: "O problema: a malha completa",
      table: {
        head: ["Roteadores no AS", "Sessões iBGP em malha completa"],
        rows: [
          ["5", "**10**"],
          ["10", "**45**"],
          ["50", "**1225**"],
          ["100", "**4950**"],
        ],
      },
      points: [
        "Regra do iBGP: um roteador **não repassa** a um peer iBGP o que aprendeu de **outro** peer iBGP. Para todos conhecerem todas as rotas, **todos precisam falar com todos**: **n(n−1)/2** sessões.",
        "Cada roteador novo exige **mexer em todos os outros**. Num AS grande, é inviável.",
        "Duas soluções: **Route Reflector** (Lab 9) e **Confederação** (este lab).",
      ],
    },
    {
      title: "A confederação",
      points: [
        "Divide o AS em **sub-ASes**. Dentro de cada sub-AS, a malha completa é pequena. **Entre** sub-ASes, a sessão é **confed-eBGP**.",
        "Cada sub-AS tem um **ASN privado** (aqui **65001** e **65002**). Todos compartilham o **identifier**: o AS **público** que o mundo de fora enxerga (**100**, por exemplo).",
        "Três comandos fazem tudo: o `router bgp` com o **sub-AS**, o `bgp confederation identifier` e o `bgp confederation peers` (os sub-ASes vizinhos).",
        "Para o mundo de fora, **ninguém** vê os sub-ASes: a confederação é **um AS só**.",
      ],
    },
    {
      title: "A topologia do Lab 4",
      diagram: [
        "        AS público  (identifier)",
        "  ┌──────────────────────────────────────┐",
        "  │ sub-AS 65001          sub-AS 65002   │",
        "  │ ┌────┐   ┌────┐       ┌────┐  ┌────┐ │",
        "  │ │ R1 ├───┤ R2 ├───────┤ R3 ├──┤ R4 │ │",
        "  │ └─┬──┘   └────┘confed └────┘  └────┘ │",
        "  └───┼──────────────────────────────────┘",
        "      │ eBGP",
        "   ┌──┴──┐",
        "   │ R5  │  AS 200 (externo)",
        "   └─────┘",
      ].join("\n"),
      points: [
        "**R1** e **R2** formam o **sub-AS 65001**; **R3** e **R4**, o **65002**. R2–R3 é a sessão **entre sub-ASes**.",
        "**R5** é um vizinho **externo** (AS 200). Ele foi configurado para falar com o AS **público** — o AS que o R1 deveria apresentar, não com o sub-AS 65001.",
        "As rotas estáticas e os `neighbor` já estão prontos. **Falta só a confederação.**",
      ],
    },
    {
      title: "Três tipos de sessão",
      table: {
        head: ["", "iBGP", "confed-eBGP", "eBGP"],
        rows: [
          ["Entre", "Mesmo **sub-AS**", "**Sub-ASes** da mesma confederação", "Confederação e **AS externo**"],
          ["Neste lab", "R1–R2 e R3–R4", "R2–R3", "R1–R5"],
          ["AS-PATH", "Não muda", "Acrescenta o **sub-AS** em segmento ( )", "Remove o segmento e acrescenta o **AS público**"],
          ["Local Pref e MED", "Preservados", "**Preservados**", "Não saem do AS"],
          ["Mostrado como", "`internal`", "`confed-external` / `confed-internal`", "`external`"],
        ],
      },
      points: [
        "A sessão **entre sub-ASes** parece eBGP (ASNs diferentes), mas o **Local Preference** e o resto das decisões **continuam valendo** como se fosse um AS só.",
      ],
    },
    {
      title: "O OPEN diz quem você é",
      code: "10.5.1.1.46211 > 5.5.5.5.179: BGP\n\tOpen Message (1), length: 99\n\t  Version 4, my AS 65001, Holdtime 180s, ID 1.1.1.1\n\n5.5.5.5.179 > 10.5.1.1.46211: BGP\n\tNotification Message (3), length: 23, OPEN Message Error (2), subcode Bad Peer AS (2)",
      points: [
        "O **my AS** do OPEN é o AS com que **R1 se apresenta**. R5 compara com o seu `remote-as`.",
        "Sem a confederação, R1 diz **my AS 65001** (o seu sub-AS). R5 esperava o AS **público**: **não bate**.",
        "R5 responde com uma **NOTIFICATION**: **OPEN Message Error / Bad Peer AS**. A sessão **cai** antes de nascer, e R1 **tenta de novo** a cada ~16 s.",
        "É o mesmo erro do lab 1 (um `remote-as` errado) — visto agora **no fio**.",
      ],
      note: "Saída real do tcpdump em R1, com a confederação ainda não configurada.",
    },
    {
      title: "O que o identifier muda",
      points: [
        "`bgp confederation identifier N` faz o roteador **se apresentar como o AS N** a vizinhos **externos**. O OPEN de R1 passa a dizer **my AS N**.",
        "`bgp confederation peers 65002` diz: *\"o sub-AS 65002 é da **minha** confederação\"* — a sessão com ele é **confed-eBGP**, não eBGP.",
        "Por isso o **peers** é sempre o sub-AS **vizinho**: R1 e R2 declaram **65002**; R3 e R4 declaram **65001**.",
        "Mudar o identifier **reinicia** as sessões do roteador. Você vai ver sessões internas caírem e voltarem.",
      ],
      code: "router bgp 65001\n bgp confederation identifier 100\n bgp confederation peers 65002",
    },
    {
      title: "O AS-PATH com segmento",
      code: "R4# show ip bgp 1.1.1.0/24\n  (65001)\n    3.3.3.3 from 3.3.3.3 (3.3.3.3)\n      Origin IGP, metric 0, localpref 100, valid, confed-internal\n\nR4# show ip bgp 5.5.5.0/24\n  (65001) 200\n    3.3.3.3 from 3.3.3.3 (3.3.3.3)\n      Origin IGP, metric 0, localpref 100, valid, confed-internal",
      points: [
        "O caminho dentro da confederação tem um **segmento entre parênteses**: `(65001)` é o **sub-AS** de origem — o *AS_CONFED_SEQUENCE*.",
        "Esse segmento **não conta no comprimento** do AS-PATH (você viu no Lab 3).",
        "A rota de R5 (`5.5.5.0/24`) chega a R4 como **`(65001) 200`**: o segmento de confederação **mais** o AS externo.",
      ],
      note: "Validado neste lab, depois de a confederação estar configurada.",
    },
    {
      title: "Dentro × fora, no fio",
      code: "(R2 → R1, dentro da confederação)\n\t  AS Path (2), length: 6, Flags [TE]: ( 65002 )\n\n(R1 → R5, para fora)\n\t  AS Path (2), length: 6, Flags [TE]: 300",
      points: [
        "Dentro: o **sub-AS** entre parênteses. Fora: **só o AS público**. Os sub-ASes **não vazam**.",
        "É a razão de uso: **mudar a organização interna** (criar um sub-AS) **sem avisar** os vizinhos externos.",
        "Para R5, a rota de **R4** chega com AS-PATH `300` — como se saísse de um AS único.",
      ],
      note: "Valores reais: o AS público é o da sua sessão.",
    },
    {
      title: "Confederação × Route Reflector",
      table: {
        head: ["", "Confederação", "Route Reflector"],
        rows: [
          ["Ideia", "Vários **sub-ASes**, cada um com malha pequena", "Um RR **repassa** rotas iBGP — dispensa a malha"],
          ["Visível por fora?", "**Não** (AS público único)", "Não"],
          ["Custo", "Mudança de **ASN** e `peers` em tudo", "Configuração **local** no RR"],
          ["Quando", "Fusões, divisões **administrativas**", "Escala **simples**"],
        ],
      },
      points: [
        "O Lab 9 mostra o **Route Reflector**. Na prática, **os dois podem coexistir**: RR dentro de cada sub-AS.",
      ],
    },
    {
      title: "Roteiro do Lab 4",
      points: [
        "**Passo 1:** **diagnosticar** a sessão quebrada R1–R5: `show bgp summary`, `show bgp neighbors` e a **captura** (OPEN e NOTIFICATION).",
        "**Passo 2:** configurar a **confederação** nos 4 roteadores. Prever o que **reinicia**.",
        "**Passo 3:** comparar o **AS-PATH interno** (R4) e **externo** (R5), e ver o **OPEN** novo e os UPDATEs na captura.",
        "**Desafio:** perguntas de fechamento.",
        "Nos passos 1 e 2 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas o OPEN com o sub-AS (rejeitado), a NOTIFICATION, o OPEN com o AS público e o UPDATE de saída. Deixe a captura de R1 rodando do passo 1 ao 3.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: mostrar **por que a sessão R1–R5 caía** na captura; explicar **o que identifier e peers fazem**; dizer **o que reiniciou** ao configurar; e mostrar a **diferença entre o AS-PATH interno e o externo**.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "A sessão R1–R5 não sobe. Mostre na 🔬 captura por quê.",
      lookFor: "OPEN de R1 com 'my AS 65001' (o sub-AS), R5 espera o AS {{pubAS}}; R5 responde NOTIFICATION 'OPEN Message Error (2), subcode Bad Peer AS (2)'. show bgp neighbors 5.5.5.5: 'Last reset ... Notification received (OPEN Message Error/Bad Peer AS)'. R1 tenta de novo a cada ~16 s.",
    },
    {
      id: "e2",
      prompt: "O que fazem 'bgp confederation identifier' e 'bgp confederation peers'? Por que o peers de R1 é 65002?",
      lookFor: "identifier: AS com que o roteador se apresenta a vizinhos externos ({{pubAS}}); peers: sub-ASes da mesma confederação (sessão confed-eBGP, não eBGP). R1/R2 declaram 65002 (o sub-AS vizinho); R3/R4 declaram 65001.",
    },
    {
      id: "e3",
      prompt: "Ao configurar a confederação, o que aconteceu com as sessões? Por quê?",
      lookFor: "Mudar o identifier reinicia as sessões do roteador: R2↔R3 caiu e voltou (e as de R1/R4 na sua vez). Depois o R1–R5 estabeleceu: o OPEN de R1 passou a dizer 'my AS {{pubAS}}'.",
    },
    {
      id: "e4",
      prompt: "Mostre na captura o OPEN novo de R1 para R5. O que mudou em relação ao de antes?",
      lookFor: "'my AS {{pubAS}}' no lugar de 'my AS 65001'; R5 aceita e a sessão fica Established, com UPDATEs em seguida.",
    },
    {
      id: "e5",
      prompt: "Compare o AS-PATH de 1.1.1.0/24 em R4 com o de 4.4.4.0/24 em R5. O que cada um mostra?",
      lookFor: "R4: '(65001)' — segmento de confederação (AS_CONFED_SEQUENCE), confed-internal. R5: só '{{pubAS}}' — os sub-ASes não vazam. O segmento é removido na saída e o AS público é acrescentado.",
    },
    {
      id: "e6",
      prompt: "Qual a vantagem da confederação sobre a malha completa? E sobre o Route Reflector?",
      lookFor: "Cada sub-AS tem malha pequena (n(n-1)/2 por sub-AS, 1225 sessões para 50 roteadores em malha única); o mundo externo não vê a divisão. Contra o RR: confederação serve também para divisões administrativas, mas exige mudança de ASN/peers em todos; podem coexistir.",
    },
  ],

  autoGrade: [
    { id: "confed_id", label: "Confederation identifier configurado", cmdContains: "bgp confederation identifier" },
    { id: "confed_peers", label: "Confederation peers configurados", cmdContains: "bgp confederation peers" },
    { id: "checked_neighbor", label: "Diagnosticou a sessão R1–R5 (show bgp neighbors)", router: "R1", cmdContains: "show bgp neighbors" },
    { id: "confed_established", label: "Sessão externa R1-R5 estabelecida", router: "R1", cmdContains: "show bgp summary", outputPattern: "5\\.5\\.5\\.5.*\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    { id: "external_as_clean", label: "R5 vê AS-PATH limpo (sem sub-ASes)", router: "R5", cmdContains: "show ip bgp", outputContains: "{{pubAS}}" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_open_wrong", label: "Capturou o OPEN de R1 com o sub-AS (65001)", router: "R1", capturePattern: "Open Message \\(1\\)[\\s\\S]*?my AS 65001, Holdtime 180s, ID 1\\.1\\.1\\.1" },
    { id: "captured_bad_peer_as", label: "Capturou a NOTIFICATION Bad Peer AS", router: "R1", capturePattern: "Notification Message \\(3\\)[^\\n]*Bad Peer AS" },
    { id: "captured_open_fixed", label: "Capturou o OPEN de R1 com o AS público", router: "R1", capturePattern: "Open Message \\(1\\)[\\s\\S]*?my AS {{pubAS}}, Holdtime 180s, ID 1\\.1\\.1\\.1" },
  ],

  verifications: [
    {
      id: "external_session_fixed",
      label: "Sessão externa R1↔R5 estabelecida (estava quebrada por AS mismatch)",
      weight: 10,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "5\\.5\\.5\\.5.*\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    },
    {
      id: "confed_identifier_r1",
      label: "R1 configurado com bgp confederation identifier {{pubAS}}",
      weight: 8,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "bgp confederation identifier {{pubAS}}\\s" },
    },
    {
      id: "confed_identifier_r2",
      label: "R2 configurado com bgp confederation identifier {{pubAS}}",
      weight: 6,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "bgp confederation identifier {{pubAS}}\\s" },
    },
    {
      id: "confed_identifier_r3",
      label: "R3 configurado com bgp confederation identifier {{pubAS}}",
      weight: 6,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "bgp confederation identifier {{pubAS}}\\s" },
    },
    {
      id: "confed_identifier_r4",
      label: "R4 (ponta oposta da confederação) também configurado",
      weight: 6,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "bgp confederation identifier {{pubAS}}\\s" },
    },
    {
      id: "confed_peers_r1",
      label: "R1 declara o sub-AS 65002 como confederation peer",
      weight: 4,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "bgp confederation peers 65002\\s" },
    },
    {
      id: "confed_peers_r2",
      label: "R2 declara o sub-AS 65002 como confederation peer",
      weight: 4,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "bgp confederation peers 65002\\s" },
    },
    {
      id: "confed_peers_r3",
      label: "R3 declara o sub-AS 65001 como confederation peer",
      weight: 4,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "bgp confederation peers 65001\\s" },
    },
    {
      id: "confed_peers_r4",
      label: "R4 declara o sub-AS 65001 como confederation peer",
      weight: 4,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "bgp confederation peers 65001\\s" },
    },
    {
      id: "internal_routes_seen",
      label: "R4 enxerga a rota de R1 com o segmento de confederação (65001)",
      weight: 6,
      check: { router: "R4", cmdPattern: "show ip bgp 1.1.1.0/24", outputPattern: "\\(65001\\)[\\s\\S]*confed-internal" },
    },
    {
      id: "external_route_inside",
      label: "R4 enxerga a rota de R5 (5.5.5.0/24) com AS-PATH (65001) 200",
      weight: 6,
      check: { router: "R4", cmdPattern: "show ip bgp 5.5.5.0/24", outputPattern: "\\(65001\\) 200" },
    },
    {
      id: "external_aspath_clean",
      label: "R5 vê apenas o AS público {{pubAS}} da confederação, sem os sub-ASes internos",
      weight: 8,
      check: { router: "R5", cmdPattern: "show ip bgp 4.4.4.0/24", outputPattern: "^(?![\\s\\S]*6500[12])[\\s\\S]*\\n\\s*{{pubAS}}\\s*\\n" },
    },
    {
      id: "capture_open_wrong",
      label: "Capturou o OPEN de R1 com my AS 65001 (rejeitado por R5)",
      weight: 5,
      check: { type: "capture", router: "R1", packetPattern: "Open Message \\(1\\)[\\s\\S]*?my AS 65001, Holdtime 180s, ID 1\\.1\\.1\\.1" },
    },
    {
      id: "capture_bad_peer_as",
      label: "Capturou a NOTIFICATION 'OPEN Message Error / Bad Peer AS' de R5",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "Notification Message \\(3\\)[^\\n]*Bad Peer AS" },
    },
    {
      id: "capture_open_fixed",
      label: "Capturou o OPEN de R1 com o AS público {{pubAS}}",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "Open Message \\(1\\)[\\s\\S]*?my AS {{pubAS}}, Holdtime 180s, ID 1\\.1\\.1\\.1" },
    },
    {
      id: "capture_update_out",
      label: "Capturou o UPDATE de R1 para R5 com AS Path {{pubAS}} (sem os sub-ASes)",
      weight: 6,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: {{pubAS}}\\s" + UPD_NT + ROUTES_TO("4\\.4\\.4\\.0/24") },
    },
    {
      id: "capture_confed_seq",
      label: "Capturou um UPDATE com o segmento de confederação ( 65002 )",
      weight: 5,
      check: { type: "capture", router: "R1", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: \\( 65002 \\)" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["as diferente", "mismatch", "não bate", "nao bate", "confederation identifier", "65001", "my as", "remote-as", "bad peer"],
      anyOf: true,
      points: 10,
      hint: "R1 roda 'router bgp 65001' — sem 'bgp confederation identifier', esse é o AS que R1 anuncia no OPEN. R5 espera falar com o AS público da confederação, não com o sub-AS interno: Bad Peer AS.",
    },
    predict_step3: {
      type: "keywords",
      required: ["flap", "reinicia", "reseta", "cai e sobe", "reconecta", "renegocia", "caem", "cair", "derruba"],
      anyOf: true,
      points: 10,
      hint: "Alterar o AS local efetivo de um roteador (via confederation identifier) reinicia as sessões dele — mesmo em peers que já estavam Established.",
    },
    q1: { type: "radio", correct: "1225", points: 6 },
    q2: { type: "radio", correct: "AS_CONFED_SEQUENCE — sequência de sub-ASes que a rota percorreu internamente", points: 10 },
    q3: { type: "radio", correct: "Apenas o AS público da confederação (ex: 100), sem os sub-ASes internos", points: 12 },
    q4: { type: "radio", correct: "Dividem o AS em sub-ASes menores, reduzindo o número de sessões iBGP necessárias em cada sub-AS", points: 10 },
    q5: { type: "radio", correct: "show running-config | include confederation", points: 6 },
    q6: { type: "radio", correct: "R1 se apresentava com o sub-AS 65001 e R5 esperava o AS público: NOTIFICATION Bad Peer AS", points: 14 },
    q7: { type: "radio", correct: "Para R5 a rota chega só com o AS público; dentro da confederação o AS-PATH tem o segmento do sub-AS entre parênteses", points: 14 },
    q8: { type: "radio", correct: "Entre sub-ASes da mesma confederação: parece eBGP, mas Local Preference e decisões internas continuam valendo", points: 8 },
  },

  steps: [
    {
      id: 1,
      title: "Diagnosticar a sessão externa quebrada",
      theory: `Uma confederação BGP divide um AS grande em sub-ASes menores. Internamente os roteadores falam BGP como se existissem vários ASes privados (aqui R1/R2 no sub-AS 65001 e R3/R4 no sub-AS 65002). Para vizinhos externos, porém, tudo deve aparecer como um único AS público.

R5 é um vizinho externo (AS 200) configurado para falar com o AS {{pubAS}}. As rotas estáticas e o 'neighbor remote-as' já estão prontos dos dois lados — mas a confederação ainda não foi configurada em nenhum dos quatro roteadores internos.

Quando uma sessão BGP não sobe, o OPEN e a NOTIFICATION mostram o motivo no fio.`,
      description: `Abra a captura em R1, interface 'todas', protocolo BGP. DEIXE A CAPTURA RODANDO até o fim do passo 3 (se ela parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Responda a previsão e verifique as sessões: R1 com R2 (interna) e com R5 (externa). Depois use 'show bgp neighbors 5.5.5.5' em R1 para ver o motivo do último reset.

Na captura (R1 tenta de novo a cada ~16 s), encontre o OPEN que R1 envia a R5 e a NOTIFICATION de resposta. Qual é o 'my AS' do OPEN de R1? Qual é o subcódigo da NOTIFICATION?`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "Sessão com R2 (interna) e com R5 (externa) — as duas estão Established?" },
        { cmd: "show bgp summary", router: "R2", desc: "Sessões do R2 (sub-AS 65001)" },
        { cmd: "show bgp summary", router: "R3", desc: "Sessões do R3 (sub-AS 65002)" },
        { cmd: "show bgp neighbors 5.5.5.5", router: "R1", desc: "Estado Idle e 'Last reset ... Notification received'" },
        { cmd: "show running-config", router: "R1", desc: "Repare que 'router bgp 65001' está configurado, mas não há nenhuma linha 'bgp confederation'" },
      ],
      expected: "As sessões entre sub-ASes (R1-R2, R2-R3, R3-R4) sobem normalmente. A sessão R1-R5 fica Idle: 'show bgp neighbors 5.5.5.5' mostra 'Last reset ... Notification received (OPEN Message Error/Bad Peer AS)'. Na captura: OPEN de R1 com 'my AS 65001, Holdtime 180s, ID 1.1.1.1' e, em resposta, 'Notification Message (3) ... OPEN Message Error (2), subcode Bad Peer AS (2)'; a tentativa se repete a cada ~16 s.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de configurar qualquer coisa: por que você acha que a sessão entre R1 e R5 não sobe, mesmo com o neighbor e as rotas estáticas já configurados dos dois lados?",
      },
    },
    {
      id: 2,
      title: "Configurar a confederação nos quatro roteadores",
      theory: `A configuração mínima de confederação tem três partes:

1. O AS local do processo BGP já é o sub-AS interno (não muda): router bgp 65001.
2. O AS público visto de fora é declarado com: bgp confederation identifier {{pubAS}}.
3. Os sub-ASes vizinhos da mesma confederação são declarados com: bgp confederation peers 65002.

Peers no mesmo sub-AS se comportam como iBGP. Peers em outro sub-AS da mesma confederação parecem eBGP, mas continuam internos ao AS público — e o AS-PATH carrega essa passagem como AS_CONFED_SEQUENCE, removido quando a rota sai para um peer verdadeiramente externo como R5.

Não é preciso mexer nos 'neighbor remote-as' existentes: eles continuam corretos. Mas mudar o identifier reinicia as sessões do roteador.`,
      description: `Responda a previsão e configure os quatro roteadores. O AS público ({{pubAS}}) é o mesmo em todos; o 'confederation peers' é sempre o sub-AS VIZINHO:

Em R1 e R2 (sub-AS 65001):
  configure terminal
  router bgp 65001
   bgp confederation identifier {{pubAS}}
   bgp confederation peers 65002
  end

Em R3 e R4 (sub-AS 65002):
  configure terminal
  router bgp 65002
   bgp confederation identifier {{pubAS}}
   bgp confederation peers 65001
  end

Depois de configurar, aguarde cerca de 30 segundos e confira as sessões. Na captura de R1, procure o OPEN novo enviado a R5.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme identifier {{pubAS}} e peers 65002" },
        { cmd: "show running-config", router: "R4", desc: "Confirme identifier {{pubAS}} e peers 65001 na outra ponta" },
        { cmd: "show running-config | include confederation", router: "R2", desc: "Só as linhas de confederação" },
        { cmd: "show bgp summary", router: "R2", desc: "A sessão com R3 reiniciou? (Up/Down de poucos segundos)" },
        { cmd: "show bgp summary", router: "R1", desc: "A sessão com R5 (5.5.5.5) já aparece Established?" },
      ],
      expected: "Depois de configurar os quatro roteadores, R1–R5 estabelece. As sessões que passaram pela mudança (por exemplo R2–R3) aparecem com Up/Down de poucos segundos: reiniciaram. Na captura de R1, o OPEN para R5 agora tem 'my AS {{pubAS}}' no lugar de 'my AS 65001', e R5 não responde mais com NOTIFICATION.",
      predict: {
        id: "predict_step3",
        prompt: "Depois de aplicar 'bgp confederation identifier' nos quatro roteadores, você espera que as sessões internas que já estavam Established (ex: R2–R3) permaneçam intactas, ou que reiniciem antes de subir de novo? Por quê?",
      },
    },
    {
      id: 3,
      title: "AS-PATH interno × externo",
      theory: `Quando a rota sai para um peer verdadeiramente externo, os sub-ASes internos não devem aparecer — o vizinho externo enxerga apenas o AS público da confederação. Neste lab, R5 deve ver AS {{pubAS}}, não 65001 ou 65002.

Dentro da confederação, o AS-PATH tem o segmento (AS_CONFED_SEQUENCE) com o sub-AS de origem, entre parênteses. A rota de R5 chega a R4 como '(65001) 200': segmento de confederação mais o AS externo.

O full-mesh iBGP cresce com n×(n-1)/2: com 50 roteadores são 1225 sessões. A confederação divide isso em grupos menores — outra solução é o Route Reflector (Lab 9).`,
      description: `Compare a visão interna com a visão externa. Com a captura de R1 rodando, procure:
  • um UPDATE de R2 com 'AS Path ... ( 65002 )' (dentro da confederação);
  • um UPDATE de R1 para R5 com 'AS Path ... {{pubAS}}' para 4.4.4.0/24 (para fora).

Se não achar, rode 'clear bgp * soft out' em R1 e 'clear bgp * soft in' em R2 para reenviar os anúncios.`,
      capture: { router: "R1", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "show ip bgp 1.1.1.0/24", router: "R4", desc: "Visão interna — AS-PATH com (65001)" },
        { cmd: "show ip bgp 5.5.5.0/24", router: "R4", desc: "A rota de R5 vista de dentro — '(65001) 200'" },
        { cmd: "show ip bgp", router: "R5", desc: "Tabela do R5 — só o AS {{pubAS}}, nunca 65001/65002" },
        { cmd: "show ip bgp 4.4.4.0/24", router: "R5", desc: "Detalhe da rota de R4 vista de fora — AS-PATH só '{{pubAS}}'" },
        { cmd: "clear bgp * soft out", router: "R1", desc: "Reenvia os anúncios de R1 (aparecem na captura)" },
        { cmd: "clear bgp * soft in", router: "R2", desc: "Pede a R1/R3 que reenviem para R2" },
      ],
      expected: "R4: 1.1.1.0/24 com AS-PATH '(65001)', confed-internal; 5.5.5.0/24 com '(65001) 200'. R5: todas as rotas (1.1.1.0/24 a 4.4.4.0/24) com AS-PATH '{{pubAS}}', external — nunca 65001/65002. Na captura: UPDATE com 'Flags [TE]: ( 65002 )' dentro da confederação e UPDATE de R1 para R5 com 'Flags [TE]: {{pubAS}}'.",
    },
  ],

  challenge: {
    title: "Desafio: Validar Confederação",
    description: `Confira o estado final da confederação:

1. R1, R2, R3 e R4 com 'bgp confederation identifier {{pubAS}}'.
2. Os sub-ASes vizinhos em 'bgp confederation peers' (65002 em R1/R2, 65001 em R3/R4).
3. R5 vendo apenas o AS público {{pubAS}}, e R4 vendo a rota de R5 com '(65001) 200'.

Responda às perguntas, baseadas no que você viu nas saídas e na captura.`,
    hints: [
      "bgp confederation peers deve listar todos os sub-ASes vizinhos",
      "Sub-ASes privados são removidos automaticamente em anúncios para peers externos",
      "Compare show ip bgp em R4 com show ip bgp em R5",
      "Full-mesh iBGP cresce com a fórmula n*(n-1)/2",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Quantas sessões iBGP são necessárias para full-mesh com 50 roteadores?",
        options: ["49", "100", "1225", "2500"],
      },
      {
        id: "q2", type: "radio",
        text: "Qual atributo especial aparece no AS-PATH dentro de uma confederação BGP?",
        options: [
          "CONFED_SET — lista não-ordenada de sub-ASes",
          "CONFEDERATION_ID — identificador único da confederação",
          "AS_CONFED_SEQUENCE — sequência de sub-ASes que a rota percorreu internamente",
          "LOCAL_AS — sub-AS de origem dentro da confederação",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Quando R5 (AS externo) recebe rotas originadas dentro da confederação, o que ele vê no AS-PATH?",
        options: [
          "Todos os sub-ASes individuais (65001, 65002, etc.) em sequência",
          "O AS-PATH vazio — confederações não propagam AS-PATH",
          "O AS_CONFED_SEQUENCE com todos os sub-ASes visíveis",
          "Apenas o AS público da confederação (ex: 100), sem os sub-ASes internos",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Qual a principal vantagem das confederações em relação ao full-mesh iBGP?",
        options: [
          "Eliminam completamente a necessidade de sessões iBGP",
          "Permitem usar diferentes versões do BGP dentro do mesmo AS",
          "Aumentam a velocidade de convergência BGP",
          "Dividem o AS em sub-ASes menores, reduzindo o número de sessões iBGP necessárias em cada sub-AS",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual comando mostra só as linhas de confederação da configuração de R1?",
        options: [
          "show bgp confederation peers",
          "show ip bgp summary",
          "show running-config | include confederation",
          "show bgp neighbors",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Por que a sessão R1–R5 não subia no início do lab?",
        options: [
          "A rota estática para o loopback de R5 estava faltando",
          "R1 se apresentava com o sub-AS 65001 e R5 esperava o AS público: NOTIFICATION Bad Peer AS",
          "O ebgp-multihop estava ausente em R5",
          "R5 anunciava um prefixo inválido",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "Qual a diferença entre o AS-PATH de 1.1.1.0/24 visto em R4 e o de 4.4.4.0/24 visto em R5?",
        options: [
          "Não há diferença: os dois mostram 65001 e 65002",
          "Em R4 o AS-PATH é vazio e em R5 mostra o AS externo",
          "Para R5 a rota chega só com o AS público; dentro da confederação o AS-PATH tem o segmento do sub-AS entre parênteses",
          "Em R5 o AS-PATH mostra o segmento entre parênteses; em R4 só o AS público",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "O que é uma sessão confed-eBGP, como a de R2 com R3?",
        options: [
          "Uma sessão eBGP comum com um AS externo",
          "Entre sub-ASes da mesma confederação: parece eBGP, mas Local Preference e decisões internas continuam valendo",
          "Uma sessão iBGP dentro do mesmo sub-AS",
          "Uma sessão que só carrega rotas externas",
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
 ip address 1.1.1.1/32
 ip address 1.1.1.2/24
!
interface eth1
 ip address 10.1.1.1/30
!
interface eth2
 ip address 10.5.1.1/30
!
router bgp 65001
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 neighbor 2.2.2.2 remote-as 65001
 neighbor 2.2.2.2 update-source lo
 neighbor 5.5.5.5 remote-as 200
 neighbor 5.5.5.5 update-source lo
 neighbor 5.5.5.5 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 1.1.1.0/24
  neighbor 2.2.2.2 activate
  neighbor 2.2.2.2 next-hop-self
  neighbor 5.5.5.5 activate
 exit-address-family
!
ip route 2.2.2.2/32 10.1.1.2
ip route 5.5.5.5/32 10.5.1.2
`,
    R2: `frr version 9.0
hostname R2
!
interface lo
 ip address 2.2.2.2/32
 ip address 2.2.2.3/24
!
interface eth1
 ip address 10.1.1.2/30
!
interface eth2
 ip address 10.2.1.1/30
!
router bgp 65001
 bgp router-id 2.2.2.2
 no bgp ebgp-requires-policy
 neighbor 1.1.1.1 remote-as 65001
 neighbor 1.1.1.1 update-source lo
 neighbor 3.3.3.3 remote-as 65002
 neighbor 3.3.3.3 update-source lo
 neighbor 3.3.3.3 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 2.2.2.0/24
  neighbor 1.1.1.1 activate
  neighbor 1.1.1.1 next-hop-self
  neighbor 3.3.3.3 activate
 exit-address-family
!
ip route 1.1.1.1/32 10.1.1.1
ip route 3.3.3.3/32 10.2.1.2
`,
    R3: `frr version 9.0
hostname R3
!
interface lo
 ip address 3.3.3.3/32
 ip address 3.3.3.4/24
!
interface eth1
 ip address 10.2.1.2/30
!
interface eth2
 ip address 10.3.1.1/30
!
router bgp 65002
 bgp router-id 3.3.3.3
 no bgp ebgp-requires-policy
 neighbor 2.2.2.2 remote-as 65001
 neighbor 2.2.2.2 update-source lo
 neighbor 2.2.2.2 ebgp-multihop 2
 neighbor 4.4.4.4 remote-as 65002
 neighbor 4.4.4.4 update-source lo
 !
 address-family ipv4 unicast
  network 3.3.3.0/24
  neighbor 2.2.2.2 activate
  neighbor 4.4.4.4 activate
  neighbor 4.4.4.4 next-hop-self
 exit-address-family
!
ip route 2.2.2.2/32 10.2.1.1
ip route 4.4.4.4/32 10.3.1.2
`,
    R4: `frr version 9.0
hostname R4
!
interface lo
 ip address 4.4.4.4/32
 ip address 4.4.4.5/24
!
interface eth1
 ip address 10.3.1.2/30
!
router bgp 65002
 bgp router-id 4.4.4.4
 no bgp ebgp-requires-policy
 neighbor 3.3.3.3 remote-as 65002
 neighbor 3.3.3.3 update-source lo
 !
 address-family ipv4 unicast
  network 4.4.4.0/24
  neighbor 3.3.3.3 activate
 exit-address-family
!
ip route 3.3.3.3/32 10.3.1.1
`,
    R5: `frr version 9.0
hostname R5
!
interface lo
 ip address 5.5.5.5/32
!
interface eth1
 ip address 10.5.1.2/30
!
router bgp 200
 bgp router-id 5.5.5.5
 no bgp ebgp-requires-policy
 neighbor 1.1.1.1 remote-as {{pubAS}}
 neighbor 1.1.1.1 update-source lo
 neighbor 1.1.1.1 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 5.5.5.0/24
  neighbor 1.1.1.1 activate
 exit-address-family
!
ip route 1.1.1.1/32 10.5.1.1
ip route 5.5.5.0/24 Null0
`
};

module.exports = lab;
