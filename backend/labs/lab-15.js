/**
 * Lab 15 — OSPF Nível 6: Virtual Link e Autenticação MD5
 * Falha proposital: a área 2 está ligada só à área 1, sem passar pelo
 * backbone. O aluno diagnostica, corrige com um virtual link e depois
 * protege o backbone com MD5.
 *
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - todas as adjacências sobem Full, mas R3 não se considera ABR ('show ip
 *    ospf' sem 'This router is an ABR') e R1 não tem 4.4.4.4 nem 10.0.34.0/30
 *    (R4 também não tem as rotas de R1): sem backbone, a área 2 fica isolada;
 *  - o virtual link sobe em segundos ('VLINK0 Full/DROther' no neighbor); o
 *    Hello vai em UNICAST pela interface da área de trânsito, com 'Backbone
 *    Area' no cabeçalho e 'Mask 0.0.0.0'; a Router LSA de R3 na área 1 passa
 *    a 'Flags: 0x5 : ABR VL-endpoint'; R1 ganha 4.4.4.4/32 (custo 30);
 *  - MD5 no Hello: 'Authentication Type: MD5 (2)', 'Key-ID', 'Crypto
 *    Sequence Number' (a chave não aparece, só o digest);
 *  - MD5 só em R1: a adjacência R1–R2 cai no Dead Timer (~40 s) e R1 perde
 *    a rota de 4.4.4.4 (fica sem o resto da rede);
 *  - o lab antigo mandava configurar em R2 só 'ip ospf message-digest-key':
 *    sem 'area 0 authentication message-digest' (ou o comando por interface)
 *    R2 continua sem autenticação e a adjacência NÃO volta;
 *  - o virtual link continuou Full mesmo com a área 0 em MD5 só nas
 *    interfaces físicas de R1–R2.
 */

const lab = {
  id: 15,
  protocol: "ospf",
  level: 6,
  scenario: "Sua empresa acabou de incorporar a rede de uma filial recém-adquirida. Durante a integração, a área OSPF da filial (área 2) foi conectada apenas à área de trânsito de um datacenter regional (área 1) — ninguém percebeu que ela nunca chega à área 0 (backbone) diretamente, violando a regra fundamental do OSPF de que toda área precisa de conexão com o backbone. Em vez de recablear fisicamente a rede (caro e arriscado), você vai usar um virtual link para estender logicamente a área 0 através da área de trânsito. Como essa filial é uma aquisição recente e ainda não totalmente confiável, você também vai adicionar autenticação MD5 no link do backbone para impedir que um roteador não autorizado forme adjacência ali — e descobrir o que acontece se só um lado for configurado.",
  title: "OSPF — Virtual Links e Autenticação",
  topic: "Virtual Link, regra da área 0 e Autenticação MD5",
  difficulty: "Avançado",
  duration: "70 min",
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
    mdKey: { pool: ["S3guraBackbone1", "Chave2024Ospf", "R00tAuthKey9", "TransitoSegur0"] },
    // Key-ID visível no Hello capturado ('Key-ID: N')
    keyId: { pool: ["1", "5", "10", "20"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=15). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "OSPF — Virtual Link e Autenticação",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 15",
      points: [
        "A **regra da área 0** e o que acontece quando ela é violada",
        "O **virtual link**: estender o backbone **logicamente**",
        "O virtual link **no fio**: Hello **unicast** com *Backbone Area*",
        "**Autenticação MD5**: as **duas partes** e o que viaja no Hello",
        "O que acontece quando **só um lado** é configurado",
      ],
      note: "Este lab parte dos Labs 11 e 12: áreas, ABRs e Summary LSAs.",
    },
    {
      title: "A regra da área 0",
      points: [
        "Toda área OSPF, **exceto a 0**, precisa estar **conectada ao backbone**: por um ABR com **interface na área 0** ou, **logicamente**, por um **virtual link**.",
        "Motivo: o OSPF só leva rotas **entre áreas** passando pela **área 0**. Uma área **nunca** troca rotas diretamente com outra.",
        "Só um **ABR conectado ao backbone** gera as **Summary LSAs (Type 3)** que levam as rotas de uma área às outras.",
        "Se a regra é violada, **nada avisa**: as adjacências sobem, os Hellos funcionam — mas as rotas **não cruzam**.",
      ],
    },
    {
      title: "A topologia do Lab 15",
      diagram: [
        "  ÁREA 0         ÁREA 1 (trânsito)     ÁREA 2 (filial)",
        "  10.0.12.0/30      10.0.23.0/30        10.0.34.0/30",
        "  ┌────┐ .1   .2 ┌────┐ .1       .2 ┌────┐ .1   .2 ┌────┐",
        "  │ R1 ├─eth1─eth1┤ R2 ├─eth2─eth1──┤ R3 ├─eth2─eth1┤ R4 │",
        "  └────┘         └────┘             └────┘         └────┘",
        "  RID 1.1.1.1    RID 2.2.2.2        RID 3.3.3.3    RID 4.4.4.4",
        "                  ABR 0/1            ABR 1/2",
        "                                  (sem interface na área 0)",
      ].join("\n"),
      points: [
        "**R1** está sozinho na **área 0**. **R2** liga a **área 0** à **área 1**. **R3** liga a **área 1** à **área 2**.",
        "**R3 não tem nenhuma interface na área 0**: a **área 2 não está conectada ao backbone**.",
        "O virtual link vai **de R2 a R3**, usando a **área 1 como trânsito**.",
      ],
    },
    {
      title: "O problema, no banco e na tabela",
      points: [
        "As adjacências R1–R2, R2–R3 e R3–R4 estão **todas Full**. O problema **não é de adjacência**.",
        "**R3 não se considera ABR:** `show ip ospf` **não** mostra `This router is an ABR` (R2 mostra). Sem backbone, ele **não faz** o papel de ABR.",
        "Resultado: **R3 não gera as Summary LSAs** entre a área 2 e a área 1. **R1 não tem** `4.4.4.4/32` nem `10.0.34.0/30`.",
        "**R4 também não** enxerga `1.1.1.1` — o problema é **simétrico**.",
        "Um detalhe do contêiner: `show ip route 4.4.4.4` em R1 devolve a **default do kernel** (gerência), não \"rota não encontrada\". Use **`show ip route ospf`**.",
      ],
      note: "Validado neste lab, sem nenhuma configuração.",
    },
    {
      title: "Virtual link",
      points: [
        "Uma **adjacência OSPF lógica** entre dois **ABRs**, **atravessando uma área de trânsito**. O FRR a trata como uma interface **ponto a ponto** da **área 0**, sem cabo.",
        "Configura-se **nos dois ABRs das pontas**: a **área de trânsito** e o **Router ID do outro**.",
        "A área de trânsito **precisa estar conectada ao backbone** e **não pode ser stub** (virtual link não atravessa área stub).",
        "Depois dele, R3 passa a ser um **ABR de verdade**: a Router LSA dele na área 1 ganha **`ABR VL-endpoint`**.",
      ],
      code: "(R2)\nrouter ospf\n area 1 virtual-link 3.3.3.3\n\n(R3)\nrouter ospf\n area 1 virtual-link 2.2.2.2",
    },
    {
      title: "O virtual link no fio",
      code: "10.0.23.1 > 10.0.23.2: OSPFv2, Hello, length 44\n\tRouter-ID 2.2.2.2, Backbone Area, Authentication Type: none (0)\n\t  Hello Timer 10s, Dead Timer 40s, Mask 0.0.0.0, Priority 1\n\n(show ip ospf neighbor em R2)\n3.3.3.3  1 Full/DROther  ...  10.0.23.2  VLINK0",
      points: [
        "Hellos de virtual link são **unicast** (de `10.0.23.1` para `10.0.23.2`), **não** vão ao multicast `224.0.0.5`.",
        "Saem pela interface da **área 1** (`eth2`), mas o cabeçalho diz **`Backbone Area`**: pertencem à **área 0**.",
        "**Mask 0.0.0.0**: o virtual link **não tem rede** associada — é só uma adjacência.",
        "Em `show ip ospf neighbor`, aparece como **`VLINK0`**, com estado **`Full/DROther`**.",
      ],
      note: "Saída real do tcpdump em R2, logo depois de configurar o virtual link.",
    },
    {
      title: "O efeito: as rotas cruzam",
      points: [
        "Com o virtual link, **R3 é conectado à área 0** e passa a gerar as Summary LSAs entre as áreas. **R1 recebe** `4.4.4.4/32` (custo **30**) e `10.0.34.0/30`.",
        "E o caminho inverso: **R4 passa a ver** `1.1.1.1/32`. A rede está **inteira**.",
        "O virtual link sobe em **poucos segundos**: não espera nenhum timer longo.",
        "Prova de que **o problema era o backbone**: nada mudou nas interfaces, nas áreas dos enlaces ou nas adjacências físicas.",
      ],
      note: "Validado neste lab: R1 ganhou 4.4.4.4/32 [110/30] via 10.0.12.2.",
    },
    {
      title: "Autenticação OSPF: duas partes",
      table: {
        head: ["Tipo", "O que viaja no Hello", "Proteção"],
        rows: [
          ["**Null** (0)", "Nada", "Nenhuma — qualquer roteador forma adjacência"],
          ["**Simple** (1)", "A senha **em texto claro**", "Fraca: **qualquer um com captura lê**"],
          ["**MD5** (2)", "**Key-ID**, **sequência** e um **digest**", "A chave **não trafega**; a sequência impede **replay**"],
        ],
      },
      points: [
        "MD5 no FRR tem **duas partes**, e **as duas são necessárias**: `area 0 authentication message-digest` e a chave na interface (`ip ospf message-digest-key <id> md5 <chave>`).",
        "**Só a chave não basta:** sem a área (ou `ip ospf authentication message-digest` na interface), o roteador **continua sem autenticação**. Validado neste lab.",
        "As duas pontas precisam do **mesmo Key-ID** e da **mesma chave**.",
      ],
      code: "router ospf\n area 0 authentication message-digest\n!\ninterface eth1\n ip ospf message-digest-key 1 md5 MinhaChave",
    },
    {
      title: "MD5 no fio",
      code: "10.0.12.1 > 224.0.0.5: OSPFv2, Hello, length 48\n\tRouter-ID 1.1.1.1, Backbone Area, Authentication Type: MD5 (2)\n\tKey-ID: 1, Auth-Length: 16, Crypto Sequence Number: 0x6ad7f569\n\tOptions [External]\n\t  Hello Timer 10s, Dead Timer 40s, Mask 255.255.255.252, Priority 1",
      points: [
        "**`Authentication Type: MD5 (2)`** no cabeçalho — antes era **`none (0)`**.",
        "**Key-ID** diz **qual chave** o emissor usou; **Auth-Length 16** é o tamanho do digest MD5.",
        "**Crypto Sequence Number** **aumenta a cada pacote**: quem repete um pacote antigo (**replay**) é descartado.",
        "A **chave não aparece**. Dois Hellos com o mesmo Key-ID mas **chaves diferentes** parecem **iguais** no fio: só o digest difere — e o receptor **rejeita**.",
      ],
      note: "Saída real do tcpdump em R2.",
    },
    {
      title: "Um lado só: o backbone quebra",
      points: [
        "Se **só R1** ativa o MD5, os Hellos de R1 saem **com MD5** e os de R2 **sem**. Cada lado **descarta** o que não confere.",
        "A adjacência **não cai na hora**: expira no **Dead Timer** (**40 s**). Por isso você espera uns **50 s**.",
        "O custo é grande: **R1 fica isolado do resto** — perde a rota de `4.4.4.4`, `3.3.3.3`... e só enxerga a si mesmo.",
        "Ao configurar **R2 completo** (área **e** chave), os Hellos voltam a bater e a adjacência volta a **Full**.",
        "O virtual link R2–R3 **continuou Full** o tempo todo: a autenticação aqui foi só no enlace R1–R2.",
      ],
      note: "Validado neste lab: com MD5 só em R1, a adjacência foi embora em ~50 s e R1 perdeu 4.4.4.4; com a chave sozinha em R2, ela continuou fora; com a área em R2, voltou.",
    },
    {
      title: "Roteiro do Lab 15",
      points: [
        "**Passo 1:** **diagnosticar**: adjacências Full, mas R1 não vê R4 e R3 não é ABR.",
        "**Passo 2:** o **virtual link** entre R2 e R3 — e o **Hello unicast** com *Backbone Area* na captura.",
        "**Passo 3:** **MD5 só em R1** primeiro: o backbone **quebra**. Depois **R2** completo.",
        "Nos passos 1, 2 e 3 há uma **previsão** antes de rodar.",
      ],
      note: "A nota confere nas SUAS capturas o Hello do virtual link e os Hellos MD5 de R1 e de R2 com o seu Key-ID. Deixe a captura de R2 rodando do passo 2 ao 3.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: explicar **por que R1 não via R4** apesar de tudo Full; mostrar o **virtual link no fio**; explicar **o que o MD5 só em R1 fez** e **por que a chave sozinha não bastou**.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Todas as adjacências estavam Full, mas R1 não via a rede de R4. Por quê? O que R3 não fazia?",
      lookFor: "A área 2 não está ligada ao backbone: R3 não tem interface na área 0, não se considera ABR ('show ip ospf' sem 'This router is an ABR') e não gera as Summary LSAs entre as áreas. Sem Type 3, R1 não tem 4.4.4.4 nem 10.0.34.0/30; R4 também não vê R1. Adjacência Full não garante rota.",
    },
    {
      id: "e2",
      prompt: "Mostre na 🔬 captura de R2 o Hello do virtual link. O que o diferencia de um Hello comum?",
      lookFor: "Hello UNICAST (10.0.23.1 → 10.0.23.2, não 224.0.0.5), na interface da área 1 mas com 'Backbone Area' no cabeçalho e 'Mask 0.0.0.0'. Em show ip ospf neighbor: VLINK0, Full/DROther. A Router LSA de R3 na área 1 ganha 'ABR VL-endpoint'.",
    },
    {
      id: "e3",
      prompt: "O que mudou em R1 depois do virtual link? Por quê?",
      lookFor: "R1 recebeu 4.4.4.4/32 (custo 30) e 10.0.34.0/30: com o virtual link R3 passou a ser ABR conectado ao backbone e gera as Summary LSAs; as rotas atravessam a área 0. Não mudou nenhuma interface nem área de enlace — o problema era a conexão com o backbone.",
    },
    {
      id: "e4",
      prompt: "Você ativou o MD5 só em R1 (com area 0 authentication e a chave {{keyId}}). O que aconteceu e quando? Mostre na captura.",
      lookFor: "R1 passou a mandar Hello com 'Authentication Type: MD5 (2), Key-ID: {{keyId}}' enquanto R2 seguia com 'none (0)'; a adjacência não caiu na hora, expirou no Dead Timer (~40 s) e R1 perdeu as rotas (4.4.4.4 etc.). O digest/crypto sequence viajam; a chave não.",
    },
    {
      id: "e5",
      prompt: "Em R2 você tentou só 'ip ospf message-digest-key'. A adjacência voltou? Por que a chave sozinha não bastou?",
      lookFor: "Não voltou: sem 'area 0 authentication message-digest' (ou 'ip ospf authentication message-digest' na interface) o roteador continua enviando 'none (0)'. MD5 tem duas partes: ativar o tipo de autenticação e a chave por interface; Key-ID e chave iguais nas duas pontas.",
    },
    {
      id: "e6",
      prompt: "Dois Hellos MD5 com o mesmo Key-ID mas chaves diferentes: dá para distinguir na captura? E o que o receptor faz?",
      lookFor: "Não: a chave não trafega, só o Key-ID, o tamanho (16) e o digest; na captura os dois parecem iguais. O receptor recalcula o digest com a chave dele, não bate, e descarta o Hello como se o vizinho não existisse. A adjacência expira no Dead Timer.",
    },
  ],

  autoGrade: [
    { id: "checked_chain", label: "Verificou as adjacências Full", router: "R2", cmdContains: "show ip ospf neighbor" },
    { id: "vlink_typed", label: "Configurou o virtual link", cmdContains: "virtual-link" },
    { id: "auth_typed", label: "Ativou a autenticação MD5 na área", cmdContains: "authentication message-digest" },
    { id: "key_typed", label: "Configurou a chave MD5 na interface", cmdContains: "message-digest-key" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_vlink_hello", label: "Capturou o Hello unicast do virtual link (Backbone Area)", router: "R2", capturePattern: "10\\.0\\.23\\.[12] > 10\\.0\\.23\\.[12]: OSPFv2, Hello[^\\n]*\\n\\s*Router-ID [23]\\.[23]\\.[23]\\.[23], Backbone Area" },
    { id: "captured_md5_r1", label: "Capturou o Hello MD5 de R1 com o seu Key-ID", router: "R2", capturePattern: "10\\.0\\.12\\.1 > 224\\.0\\.0\\.5: OSPFv2, Hello[^\\n]*\\n\\s*Router-ID 1\\.1\\.1\\.1, Backbone Area, Authentication Type: MD5 \\(2\\)\\s+Key-ID: {{keyId}}," },
    { id: "captured_md5_r2", label: "Capturou o Hello MD5 de R2 com o seu Key-ID", router: "R2", capturePattern: "10\\.0\\.12\\.2 > 224\\.0\\.0\\.5: OSPFv2, Hello[^\\n]*\\n\\s*Router-ID 2\\.2\\.2\\.2, Backbone Area, Authentication Type: MD5 \\(2\\)\\s+Key-ID: {{keyId}}," },
  ],

  verifications: [
    {
      id: "virtual_link_r2",
      label: "Virtual link configurado em R2 (área de trânsito 1, ponta 3.3.3.3)",
      weight: 8,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "area 1 virtual-link 3\\.3\\.3\\.3" },
    },
    {
      id: "virtual_link_r3",
      label: "Virtual link configurado em R3 (área de trânsito 1, ponta 2.2.2.2)",
      weight: 8,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "area 1 virtual-link 2\\.2\\.2\\.2" },
    },
    {
      id: "vlink_up",
      label: "Virtual link R2–R3 em Full (VLINK0)",
      weight: 10,
      check: { router: "R2", cmdPattern: "show ip ospf neighbor", outputPattern: "3\\.3\\.3\\.3\\s+\\d+\\s+Full/\\S+\\s+\\S+\\s+\\S+\\s+10\\.0\\.23\\.2\\s+VLINK0" },
    },
    {
      id: "r4_route_visible_r1",
      label: "R1 tem a rota 4.4.4.4/32 via OSPF (área 2 conectada ao backbone)",
      weight: 12,
      check: { router: "R1", cmdPattern: "show ip route ospf", outputPattern: "O>\\* 4\\.4\\.4\\.4/32" },
    },
    {
      id: "r4_sees_r1",
      label: "R4 tem a rota 1.1.1.1/32 (o caminho inverso funciona)",
      weight: 6,
      check: { router: "R4", cmdPattern: "show ip route ospf", outputPattern: "O>\\* 1\\.1\\.1\\.1/32" },
    },
    {
      id: "auth_area_r1",
      label: "R1 exige MD5 na área 0 (area 0 authentication message-digest)",
      weight: 6,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "area 0 authentication message-digest" },
    },
    {
      id: "auth_area_r2",
      label: "R2 exige MD5 na área 0 (a chave sozinha não basta)",
      weight: 6,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "area 0 authentication message-digest" },
    },
    {
      id: "auth_key_r1",
      label: "R1 com a chave MD5 {{keyId}} na interface eth1",
      weight: 6,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "ip ospf message-digest-key {{keyId}} md5 {{mdKey}}" },
    },
    {
      id: "auth_key_r2",
      label: "R2 com a mesma chave MD5 {{keyId}} na interface eth1",
      weight: 6,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "ip ospf message-digest-key {{keyId}} md5 {{mdKey}}" },
    },
    {
      id: "capture_vlink_hello",
      label: "Capturou o Hello unicast do virtual link com 'Backbone Area'",
      weight: 12,
      check: { type: "capture", router: "R2", packetPattern: "10\\.0\\.23\\.[12] > 10\\.0\\.23\\.[12]: OSPFv2, Hello[^\\n]*\\n\\s*Router-ID [23]\\.[23]\\.[23]\\.[23], Backbone Area" },
    },
    {
      id: "capture_md5_r1",
      label: "Capturou o Hello MD5 de R1 com Key-ID {{keyId}}",
      weight: 10,
      check: { type: "capture", router: "R2", packetPattern: "10\\.0\\.12\\.1 > 224\\.0\\.0\\.5: OSPFv2, Hello[^\\n]*\\n\\s*Router-ID 1\\.1\\.1\\.1, Backbone Area, Authentication Type: MD5 \\(2\\)\\s+Key-ID: {{keyId}}," },
    },
    {
      id: "capture_md5_r2",
      label: "Capturou o Hello MD5 de R2 com Key-ID {{keyId}} (R2 também autenticando)",
      weight: 10,
      check: { type: "capture", router: "R2", packetPattern: "10\\.0\\.12\\.2 > 224\\.0\\.0\\.5: OSPFv2, Hello[^\\n]*\\n\\s*Router-ID 2\\.2\\.2\\.2, Backbone Area, Authentication Type: MD5 \\(2\\)\\s+Key-ID: {{keyId}}," },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["não", "nao", "área 0", "area 0", "desconectada", "sem conexão", "sem conexao", "backbone"],
      anyOf: true,
      points: 6,
      hint: "Toda área OSPF precisa de conexão com a área 0 (direta ou via virtual link) para suas rotas se propagarem. R3 não tem interface na área 0: não gera Summary LSAs entre as áreas.",
    },
    predict_step2: {
      type: "keywords",
      required: ["unicast", "backbone", "área 0", "area 0", "vlink", "virtual", "adjacência", "adjacencia"],
      anyOf: true,
      points: 6,
      hint: "O virtual link é uma adjacência lógica da área 0 entre R2 e R3, atravessando a área 1; o Hello vai em unicast, com 'Backbone Area' no cabeçalho.",
    },
    predict_step3: {
      type: "keywords",
      required: ["cai", "caem", "dead", "perde", "isolado", "não", "nao", "40"],
      anyOf: true,
      points: 6,
      hint: "Com MD5 só em R1, os Hellos não conferem: a adjacência R1–R2 expira no Dead Timer (~40 s) e R1 perde as rotas do resto da rede.",
    },
    predict_step3b: {
      type: "keywords",
      required: ["não", "nao", "continua", "área", "area", "authentication", "tipo"],
      anyOf: true,
      points: 6,
      hint: "A chave sozinha não ativa o MD5: sem 'area 0 authentication message-digest' (ou o comando por interface) R2 continua sem autenticação e os Hellos seguem não batendo.",
    },
    q1: { type: "radio", correct: "Porque o único ABR da área 2 (R3) não tem nenhuma interface na área 0, e toda comunicação inter-área precisa passar pela área 0", points: 8 },
    q2: { type: "radio", correct: "Cria uma adjacência lógica ponto-a-ponto que estende a área 0 através de uma área de trânsito, sem precisar de um link físico direto", points: 8 },
    q3: { type: "radio", correct: "Nos dois ABRs, referenciando a área de trânsito e o Router ID do outro ABR", points: 8 },
    q4: { type: "radio", correct: "Exige que todos os roteadores daquela área autentiquem pacotes OSPF com MD5, usando a chave configurada em cada interface", points: 8 },
    q5: { type: "radio", correct: "A adjacência não se forma (ou cai) — pacotes Hello com autenticação incorreta são descartados", points: 8 },
    q6: { type: "radio", correct: "A adjacência R1–R2 expira no Dead Timer (~40 s) e R1 perde as rotas do resto da rede", points: 12 },
    q7: { type: "radio", correct: "Não: sem 'area 0 authentication message-digest' (ou o comando na interface) o roteador continua sem autenticação, mesmo com a chave configurada", points: 10 },
    q8: { type: "radio", correct: "Um Hello unicast na interface da área de trânsito, com 'Backbone Area' no cabeçalho e Mask 0.0.0.0", points: 14 },
  },

  steps: [
    {
      id: 1,
      title: "Diagnosticar a área desconectada do backbone",
      theory: `Toda área OSPF, exceto a própria área 0 (backbone), precisa ter conexão com a área 0 — direta (um ABR com uma interface em área 0) ou lógica (um virtual link). Essa regra existe porque o OSPF só propaga rotas inter-área PASSANDO pela área 0: uma área nunca troca rotas diretamente com outra, sempre via backbone.

Neste lab: R1 está sozinho na área 0. R2 é ABR entre a área 0 e a área 1 (área de trânsito). R3 é ABR entre a área 1 e a área 2 (a filial recém-adquirida) — mas R3 NÃO tem nenhuma interface na área 0. A área 2 está, portanto, tecnicamente desconectada do backbone, mesmo com todos os links fisicamente up e todas as adjacências locais Full.`,
      description: `Responda a previsão. Antes de configurar qualquer coisa, confirme que as adjacências locais estão Full (o problema não é de adjacência). Depois verifique se R1 enxerga a rede de R4 — use 'show ip route ospf' (no contêiner, 'show ip route 4.4.4.4' devolve a default do kernel). Veja também se R3 se considera um ABR ('show ip ospf') e compare com R2.`,
      commands: [
        { cmd: "show ip ospf neighbor", router: "R2", desc: "R1 e R3 em Full?" },
        { cmd: "show ip ospf neighbor", router: "R3", desc: "R2 e R4 em Full?" },
        { cmd: "show ip route ospf", router: "R1", desc: "R1 tem 4.4.4.4/32 e 10.0.34.0/30?" },
        { cmd: "show ip route ospf", router: "R4", desc: "R4 tem 1.1.1.1/32?" },
        { cmd: "show ip ospf", router: "R3", desc: "Procure 'This router is an ABR'" },
        { cmd: "show ip ospf", router: "R2", desc: "R2 se considera ABR?" },
      ],
      expected: "Todas as adjacências locais (R1-R2, R2-R3, R3-R4) estão Full — o link físico e o Hello funcionam. Mesmo assim, R1 NÃO tem 4.4.4.4/32 nem 10.0.34.0/30 (só as rotas das áreas 0 e 1) e R4 não tem 1.1.1.1/32: a área 2 está sem conexão com o backbone. 'show ip ospf' em R2 mostra 'This router is an ABR'; em R3 não mostra: sem interface na área 0 ele não gera as Summary LSAs entre as áreas.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar os comandos: você espera que R1 (área 0) já enxergue a rede de R4 (área 2) via OSPF, mesmo sem nenhum roteador da área 2 conectado diretamente à área 0? Por quê?",
      },
    },
    {
      id: 2,
      title: "Configurar o Virtual Link",
      theory: `Um virtual link cria uma adjacência OSPF lógica entre dois ABRs, atravessando uma área de trânsito (que precisa ela mesma já estar conectada à área 0 — não pode ser stub). O FRR trata essa adjacência lógica como se fosse uma interface ponto a ponto pertencente à área 0, mesmo sem nenhum cabo físico dedicado.

O comando é configurado nos DOIS ABRs das pontas, referenciando a área de trânsito e o Router ID do outro ABR:

  router ospf
   area <área-de-trânsito> virtual-link <router-id-do-outro-ABR>`,
      description: `Abra a captura em R2, interface 'todas', protocolo OSPF, e deixe-a rodando até o fim do lab (se parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Responda a previsão e configure o virtual link entre R2 e R3, usando a área 1 como trânsito:

Em R2:
  configure terminal
  router ospf
   area 1 virtual-link 3.3.3.3
  end

Em R3:
  configure terminal
  router ospf
   area 1 virtual-link 2.2.2.2
  end

Espere uns 20 segundos. Em R2, 'show ip ospf neighbor': aparece uma linha nova? Na captura, procure o Hello entre 10.0.23.1 e 10.0.23.2: é multicast? Que área aparece no cabeçalho? Depois veja o que R1 ganhou.`,
      capture: { router: "R2", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme 'area 1 virtual-link 3.3.3.3'" },
        { cmd: "show running-config", router: "R3", desc: "Confirme 'area 1 virtual-link 2.2.2.2'" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "Uma linha nova com interface VLINK0" },
        { cmd: "show ip ospf", router: "R3", desc: "R3 agora se considera ABR?" },
        { cmd: "show ip route ospf", router: "R1", desc: "R1 ganhou 4.4.4.4/32 e 10.0.34.0/30?" },
        { cmd: "show ip route ospf", router: "R4", desc: "R4 ganhou 1.1.1.1/32?" },
      ],
      expected: "R2 e R3 formam uma nova adjacência Full entre si, na interface VLINK0 (Full/DROther). R3 passa a se considerar ABR. R1 ganha 4.4.4.4/32 (custo 30, via 10.0.12.2) e 10.0.34.0/30, e R4 ganha 1.1.1.1/32. Na captura de R2: Hello UNICAST de 10.0.23.1 para 10.0.23.2 (e o inverso), com 'Backbone Area' no cabeçalho e 'Mask 0.0.0.0'.",
      predict: {
        id: "predict_step2",
        prompt: "Depois de configurar o virtual link, que tipo de adjacência você espera ver entre R2 e R3, e o que ela terá de diferente na captura em comparação com a adjacência normal da área 1?",
      },
    },
    {
      id: 3,
      title: "Proteger o backbone com autenticação MD5 — um lado de cada vez",
      theory: `Com o virtual link ativo, R3 passa a ser considerado 'conectado à área 0' e volta a originar corretamente as Summary LSAs da área 2 para a área 1 — que R2 propaga para a área 0.

Como a filial é uma aquisição recente, vale proteger o link do backbone (R1–R2). Autenticação MD5 no OSPF tem duas partes: a área inteira exige autenticação ('area <id> authentication message-digest') e cada interface da área recebe a chave MD5 ('ip ospf message-digest-key <id> md5 <chave>'). As duas pontas precisam usar o mesmo Key-ID e a mesma chave — se forem diferentes, os Hellos são rejeitados e a adjacência cai.`,
      description: `Responda as previsões. Configure PRIMEIRO só o R1 (área e chave, Key-ID {{keyId}}):

  configure terminal
  router ospf
   area 0 authentication message-digest
  exit
  interface eth1
   ip ospf message-digest-key {{keyId}} md5 {{mdKey}}
  end

Na captura de R2, compare o cabeçalho do Hello de R1 (10.0.12.1) com o de R2 (10.0.12.2). Espere uns 50 segundos e rode 'show ip ospf neighbor' em R1 e 'show ip route ospf' em R1: o que aconteceu?

Agora em R2, faça PRIMEIRO só a chave (como se esquecesse a área):
  configure terminal
  interface eth1
   ip ospf message-digest-key {{keyId}} md5 {{mdKey}}
  end
Espere uns 50 segundos: a adjacência voltou?

Por fim complete o R2:
  configure terminal
  router ospf
   area 0 authentication message-digest
  end
Espere uns 50 segundos: voltou? E a rota de R1 para 4.4.4.4/32? Na captura, procure o Hello MD5 de R2.`,
      capture: { router: "R2", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show running-config", router: "R1", desc: "Confirme 'area 0 authentication message-digest' e a chave" },
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Rode logo depois e ~50 s depois: R2 continua Full?" },
        { cmd: "show ip route ospf", router: "R1", desc: "R1 ainda tem 4.4.4.4/32?" },
        { cmd: "show running-config", router: "R2", desc: "Confirme a chave e (depois) a área" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "R1 e o virtual link (VLINK0): quem está Full?" },
      ],
      expected: "Com MD5 só em R1: o Hello de R1 sai com 'Authentication Type: MD5 (2), Key-ID: {{keyId}}, Auth-Length: 16' e o de R2 continua 'none (0)'; a adjacência R1–R2 expira no Dead Timer (~40 s) e R1 perde 4.4.4.4/32 e o resto da rede. Com só a chave em R2 (sem 'area 0 authentication message-digest'), nada muda: ainda sem adjacência. Com a área em R2 também, os Hellos de R2 passam a MD5 com o mesmo Key-ID e a adjacência volta a Full (e a rota de R1 para 4.4.4.4/32 volta). O virtual link R2–R3 continua Full durante todo o passo.",
      predict: {
        id: "predict_step3",
        prompt: "Você ativa o MD5 (área e chave) só em R1 e deixa R2 como está. O que você espera que aconteça com a adjacência R1–R2 e com as rotas de R1? Quanto tempo leva?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Integrar a Filial com Segurança",
    description: `Estado final esperado:

1. O virtual link entre R2 e R3 (área de trânsito 1) configurado nos dois lados e em Full.
2. R1 (área 0) enxergando a rede de R4 (área 2) via OSPF, e R4 enxergando R1.
3. O link R1-R2 (backbone) exigindo autenticação MD5 (Key-ID {{keyId}}, chave {{mdKey}}) dos dois lados — com 'area 0 authentication message-digest' em R1 e em R2.
4. Todas as adjacências (R1-R2, R2-R3, R3-R4 e o virtual link) em Full.

Responda às perguntas, baseadas no que você viu nas saídas e nas capturas.`,
    hints: [
      "Toda área precisa de conexão com a área 0, direta ou via virtual link",
      "O virtual link é configurado nos dois ABRs, com a área de trânsito e o Router ID do outro",
      "MD5 tem duas partes: a área (ou a interface) e a chave",
      "A autenticação com um lado só derruba a adjacência no Dead Timer",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Por que a área 2 não tinha suas rotas propagadas para a área 0 antes do virtual link ser configurado?",
        options: [
          "Porque a área 2 estava configurada como stub",
          "Porque o único ABR da área 2 (R3) não tem nenhuma interface na área 0, e toda comunicação inter-área precisa passar pela área 0",
          "Porque o custo OSPF da interface de R4 estava muito alto",
          "Porque R4 não tinha nenhum vizinho Full",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "O que um virtual link faz, na prática?",
        options: [
          "Cria um túnel IP-in-IP entre dois roteadores quaisquer da rede",
          "Substitui a necessidade de configurar áreas OSPF",
          "Cria uma adjacência lógica ponto-a-ponto que estende a área 0 através de uma área de trânsito, sem precisar de um link físico direto",
          "Aumenta a banda disponível entre duas áreas",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Onde o virtual link deve ser configurado?",
        options: [
          "Apenas no roteador mais próximo da área 0",
          "Em todos os roteadores da área de trânsito",
          "Nos dois ABRs, referenciando a área de trânsito e o Router ID do outro ABR",
          "Apenas no roteador que originou a rota problemática",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "Qual é o efeito de configurar 'area 0 authentication message-digest'?",
        options: [
          "Criptografa todo o tráfego de dados que passa pelos roteadores da área",
          "Bloqueia toda a área para redistribuição de rotas externas",
          "Exige que todos os roteadores daquela área autentiquem pacotes OSPF com MD5, usando a chave configurada em cada interface",
          "Desabilita a eleição de DR/BDR na área",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "O que acontece se as chaves MD5 dos dois lados de um link OSPF forem diferentes?",
        options: [
          "A adjacência se forma normalmente, a autenticação é só um log de auditoria",
          "O OSPF usa automaticamente a chave mais forte entre as duas",
          "Apenas as rotas externas deixam de ser aceitas, a adjacência continua",
          "A adjacência não se forma (ou cai) — pacotes Hello com autenticação incorreta são descartados",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "O que aconteceu quando só R1 ativou o MD5?",
        options: [
          "A adjacência caiu na hora e voltou sozinha",
          "A adjacência R1–R2 expira no Dead Timer (~40 s) e R1 perde as rotas do resto da rede",
          "Nada: o MD5 só vale depois de um reload",
          "O virtual link caiu",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "R2 recebeu só 'ip ospf message-digest-key' (sem a área). A adjacência voltou?",
        options: [
          "Sim: a chave ativa o MD5 sozinha",
          "Sim, mas só depois de um clear",
          "Não: sem 'area 0 authentication message-digest' (ou o comando na interface) o roteador continua sem autenticação, mesmo com a chave configurada",
          "Não, porque a chave estava curta demais",
        ],
      },
      {
        id: "q8", type: "radio",
        text: "Como o virtual link aparece na captura?",
        options: [
          "Um Hello unicast na interface da área de trânsito, com 'Backbone Area' no cabeçalho e Mask 0.0.0.0",
          "Um Hello multicast em 224.0.0.5 com Area 0.0.0.1",
          "Uma LS-Update com a chave MD5",
          "Um pacote BGP entre R2 e R3",
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
 network 10.0.12.0/30 area 0
 network 1.1.1.1/32 area 0
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
 network 10.0.12.0/30 area 0
 network 10.0.23.0/30 area 1
 network 2.2.2.2/32 area 0
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
 network 10.0.23.0/30 area 1
 network 10.0.34.0/30 area 2
 network 3.3.3.3/32 area 1
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
 network 4.4.4.4/32 area 2
!
`,
};

module.exports = lab;
