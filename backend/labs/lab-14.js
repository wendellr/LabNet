/**
 * Lab 14 — OSPF Nível 3: Tipo de Rede e Eleição de DR/BDR
 * Sem falha proposital — o foco é um mecanismo que acontece por padrão e
 * precisa ser observado e depois controlado (tipo de rede, prioridade).
 * Comportamentos validados no FRR 10.5 (containerlab + tcpdump):
 *  - eleição não preemptiva: prioridade nova + clear só no próprio
 *    roteador não muda nada;
 *  - quando o DR cai, o BDR assume sem nova eleição (R1 vira DR ao
 *    reiniciar R2 mesmo com prioridade 1 — a prioridade só decide
 *    numa eleição do zero, depois do Wait de 40 s);
 *  - broadcast × point-to-point nas pontas chega a Full, mas o SPF não
 *    usa o enlace (rotas somem).
 */

const lab = {
  id: 14,
  protocol: "ospf",
  level: 3,
  title: "OSPF — Tipo de Rede e Eleição de DR/BDR",
  topic: "Tipo de Rede, Prioridade e DR/BDR",
  difficulty: "Intermediário",
  duration: "50 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  scenario: "Você está desenhando a topologia de um escritório: R1 é o roteador de distribuição, conectado a R2 por um segmento que hoje é um link direto mas amanhã pode virar um switch compartilhado com mais roteadores (por isso continua como tipo broadcast), e conectado a R3 por um link dedicado ponto-a-ponto que nunca vai ter um terceiro roteador (um enlace de WAN contratado). Cada tipo de link pede um tratamento diferente do OSPF: no primeiro, a eleição de DR/BDR importa e precisa ser controlada; no segundo, ela é pura sobrecarga desnecessária.",
  routers: ["R1", "R2", "R3"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R1", "eth2", "R3", "eth1"],
  ],

  variables: {
    r1Priority: { pool: ["5", "10", "50", "100"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=14). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "OSPF — Tipo de Rede e Eleição de DR/BDR",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 14",
      points: [
        "Por que o OSPF elege um **DR** e um **BDR** — e quando isso é desperdício",
        "Os **tipos de rede**: broadcast × ponto a ponto",
        "As regras da **eleição** — e por que ela **não é preemptiva**",
        "O que acontece quando o **DR cai**",
        "Como a eleição e o tipo de rede aparecem **no fio**: Hellos e LSAs",
        "A armadilha dos **tipos diferentes** nas duas pontas",
      ],
      note: "Este lab parte do Lab 13 (Hello, estados, LSDB) e do Lab 10 (diagnóstico na captura).",
    },
    {
      title: "A topologia do Lab 14",
      diagram: [
        "        10.0.12.0/30                 10.0.13.0/30",
        "  ┌────┐ .2           .1 ┌────┐ .1           .2 ┌────┐",
        "  │ R2 ├─eth1───────eth1─┤ R1 ├─eth2───────eth1─┤ R3 │",
        "  └────┘                 └────┘                 └────┘",
        "  RID 2.2.2.2            RID 1.1.1.1            RID 3.3.3.3",
        "",
        "  └── segmento LAN ──────┘└── WAN dedicada ────────┘",
        "    (pode virar switch)     (sempre só 2 roteadores)",
      ].join("\n"),
      points: [
        "R1 está no meio. Os dois enlaces começam como **broadcast** — o padrão nas interfaces Ethernet.",
        "**R1–R2** é um segmento LAN que pode ganhar mais roteadores: lá você vai **controlar** quem é o DR.",
        "**R1–R3** é uma WAN que nunca terá um terceiro roteador: lá você vai **eliminar** a eleição.",
      ],
    },
    {
      title: "Por que existe DR e BDR",
      points: [
        "Num switch com **n** roteadores, se todos formassem adjacência Full com todos, seriam **n(n−1)/2** adjacências — 10 roteadores = **45**, cada uma trocando as mesmas LSAs.",
        "Com um **DR** (Designated Router), cada roteador forma Full **só com o DR e o BDR**. Os demais (**DROther**) ficam em **2-Way** entre si.",
        "O DR recebe as LSAs (no multicast `224.0.0.6`, AllDRouters) e as redistribui para todos (`224.0.0.5`).",
        "O **BDR** acompanha tudo e assume na hora se o DR cair.",
        "O DR também gera a **Network LSA (Type 2)** do segmento, listando quem está conectado nele.",
      ],
    },
    {
      title: "Tipos de rede",
      table: {
        head: ["", "broadcast", "point-to-point"],
        rows: [
          ["Padrão em", "Ethernet (inclusive as veth do lab)", "Configurado à mão (ou seriais/túneis)"],
          ["Elege DR/BDR?", "Sim", "Não"],
          ["Network LSA (Type 2)?", "Sim, gerada pelo DR", "Não existe"],
          ["Estado do vizinho", "`Full/DR`, `Full/Backup`, `Full/DROther`", "`Full/-`"],
          ["Enlace na Router LSA", "Liga a uma **rede de trânsito** (a Network LSA)", "Liga **direto ao roteador vizinho** + uma rede stub"],
        ],
      },
      points: [
        "O tipo de rede é uma **configuração da interface**, não uma propriedade física. Um enlace com só dois roteadores continua sendo broadcast — e elegendo DR — até alguém mudar.",
      ],
      code: "interface eth2\n ip ospf network point-to-point",
    },
    {
      title: "As regras da eleição",
      points: [
        "Só participa quem tem **prioridade > 0** na interface (0 a 255; padrão **1**). Prioridade **0** = nunca será DR nem BDR.",
        "Vence a **maior prioridade**. Empate → **maior Router ID** (o do processo OSPF, não o IP da interface).",
        "Ao subir a interface, o roteador **espera** o Wait Timer (= Dead, **40 s**) ouvindo Hellos antes de eleger — a menos que um vizinho já anuncie DR/BDR.",
        "Primeiro se elege o **BDR**, depois o **DR**. Num segmento com só 2 roteadores, um é DR e o outro BDR — não sobra DROther.",
      ],
    },
    {
      title: "A eleição não é preemptiva",
      table: {
        head: ["Evento", "O que acontece com o DR"],
        rows: [
          ["Você aumenta a prioridade de outro roteador", "**Nada.** O DR atual continua"],
          ["O roteador de prioridade alta reinicia", "Volta e **aceita** o DR que já está anunciado"],
          ["O **DR cai** (ou reinicia)", "O **BDR vira DR** na hora, sem esperar — elege-se só um novo BDR"],
          ["**Todos** sobem juntos (eleição do zero)", "Aí sim: vence a maior prioridade, depois de ~40 s"],
        ],
      },
      points: [
        "Ou seja: a prioridade **não toma** o papel de ninguém. Ela decide eleições **do zero** e diz quem **pode** ser DR/BDR.",
        "Na prática, isso significa que o DR muda de mão quando o DR atual cai — e quem assume é o **BDR**, seja qual for a prioridade dele.",
      ],
      note: "Validado neste lab: com R1 em prioridade 50 e DR, reiniciar R1 fez R2 (prioridade 1, o BDR) virar DR — e R1 voltou como Backup.",
    },
    {
      title: "A eleição no fio: o Hello",
      code: "10.0.12.1 > 224.0.0.5: OSPFv2, Hello, length 48\n\tRouter-ID 1.1.1.1, Backbone Area, Authentication Type: none (0)\n\t  Hello Timer 10s, Dead Timer 40s, Mask 255.255.255.252, Priority 1\n\t  Designated Router 10.0.12.2, Backup Designated Router 10.0.12.1\n\t  Neighbor List:\n\t    2.2.2.2",
      points: [
        "**Priority**: a prioridade **deste** roteador nesta interface.",
        "**Designated Router / Backup Designated Router**: quem ele acha que são o DR e o BDR — identificados pelo **IP da interface** no segmento, não pelo Router ID.",
        "Se o campo **não aparece**, é porque ainda não há DR/BDR (por exemplo, durante o Wait de 40 s).",
        "Em ponto a ponto, esses campos **somem** de vez.",
      ],
      note: "Saída real do tcpdump num Hello de R1 logo após a partida do lab.",
    },
    {
      title: "Uma eleição do zero, capturada",
      code: "11:29:52  10.0.12.2 > 224.0.0.5: Hello  Priority 1    (sem DR/BDR)\n11:29:52  10.0.12.1 > 224.0.0.5: Hello  Priority 50   (sem DR/BDR)\n11:30:02  ... Neighbor List preenchida, ainda sem DR ...\n11:30:12  ... idem ...\n11:30:22  ... idem ...\n11:30:32  10.0.12.1 > 224.0.0.5: Hello  Priority 50\n            Designated Router 10.0.12.1, Backup Designated Router 10.0.12.2",
      points: [
        "Os dois roteadores reiniciaram **juntos**: ninguém anunciava DR, então os dois esperaram o **Wait Timer** (40 s).",
        "Depois disso, vence a **maior prioridade**: R1 (50) vira DR e R2 (1) vira BDR.",
        "Compare com o que você vai ver no passo 5, quando só o DR reinicia: lá a troca acontece em **menos de 1 s**.",
      ],
      note: "Captura real (resumida) feita na validação deste lab.",
    },
    {
      title: "Network LSA (Type 2)",
      code: "Advertising Router 2.2.2.2, seq 0x80000001, age 1s, length 12\n  Network LSA (2), LSA-ID: 10.0.12.2\n  Mask 255.255.255.252\n  Connected Routers:\n    1.1.1.1\n    2.2.2.2",
      points: [
        "Gerada **pelo DR** de cada segmento broadcast.",
        "O **LSA-ID** é o **IP da interface do DR** no segmento; o **Advertising Router** é o Router ID dele.",
        "Lista os **Connected Routers** do segmento — é o \"nó\" que representa o switch no mapa do SPF.",
        "Se o DR muda, a LSA antiga é **retirada** (reenviada com **age 3600**) e o novo DR gera outra, com o IP dele.",
      ],
    },
    {
      title: "O enlace na Router LSA",
      code: "Router LSA (1), LSA-ID: 1.1.1.1\n  Neighbor Network-ID: 10.0.12.2, Interface Address: 10.0.12.1   ← broadcast (trânsito)\n    topology default (0), metric 10\n  Neighbor Router-ID: 3.3.3.3, Interface Address: 10.0.13.1     ← ponto a ponto\n    topology default (0), metric 10\n  Stub Network: 10.0.13.0, Mask: 255.255.255.252                ← a sub-rede do p2p\n    topology default (0), metric 10",
      points: [
        "**Broadcast:** o enlace aponta para a **rede de trânsito** — o ID é o IP do DR, ou seja, a Network LSA.",
        "**Ponto a ponto:** o enlace aponta **direto para o Router ID do vizinho**, e a sub-rede vira uma **Stub Network** à parte.",
      ],
      note: "Saída real de R1 depois de mudar eth2 para point-to-point (eth1 continua broadcast).",
    },
    {
      title: "Tipos diferentes nas pontas: Full, mas sem rota",
      points: [
        "Se só **um** lado vira point-to-point, os Hellos ainda batem (tipo de rede **não** está entre os campos verificados no Hello).",
        "Validado neste lab: com R1 em p2p e R3 em broadcast, a adjacência chega a **Full** (às vezes depois de um tempo em **ExStart**)…",
        "…mas **R1, R2 e R3 perdem as rotas** um para o outro por esse enlace. R1 descreve um enlace ponto a ponto até 3.3.3.3; R3 descreve um enlace de trânsito até uma Network LSA. O SPF exige que **as duas pontas concordem** sobre o enlace — e descarta.",
        "Lição: **Full não garante rota**. Depois de mexer em tipo de rede, confira a **tabela de rotas**.",
      ],
    },
    {
      title: "Comandos de configuração",
      code: "R1# configure terminal\nR1(config)# interface eth1\nR1(config-if)# ip ospf priority <0-255>\nR1(config-if)# exit\nR1(config)# interface eth2\nR1(config-if)# ip ospf network point-to-point\nR1(config-if)# end\nR1# clear ip ospf process",
      points: [
        "As duas configurações são **por interface** — não vão em `router ospf`.",
        "`clear ip ospf process` reinicia **todas** as adjacências daquele roteador — use com consciência do que ele faz com a eleição.",
      ],
    },
    {
      title: "Comandos de verificação",
      table: {
        head: ["Comando", "Responde à pergunta"],
        rows: [
          ["`show ip ospf neighbor`", "Estado e **papel do vizinho** (DR, Backup, DROther, `-`) e a prioridade dele"],
          ["`show ip ospf interface <if>`", "**Network Type**, **State** (meu papel), **Priority**, quem é DR/BDR"],
          ["`show ip ospf database`", "Quantas **Net Link States** (Type 2) existem e quem as gerou"],
          ["`show ip route <prefixo>`", "O enlace está sendo **usado** pelo SPF?"],
        ],
      },
      note: "Atenção: no show ip ospf neighbor, a coluna State mostra o papel do VIZINHO, não o seu. Seu papel está no State do show ip ospf interface.",
    },
    {
      title: "Captura neste lab — e o que vale nota",
      points: [
        "Capture em **R1, interface \"todas\"** — assim você vê os dois enlaces. A captura para sozinha depois de 10 min: se parou, inicie de novo (o roteiro tem o botão em cada passo).",
        "**Passo 2:** os campos Priority / DR / BDR nos Hellos de cada enlace.",
        "**Passo 3:** os Hellos de eth2 perdendo DR/BDR, a Network LSA de R3 sendo retirada e a Router LSA de R1 com o enlace ponto a ponto.",
        "**Passo 4:** R1 anunciando a prioridade nova — e o DR **não** mudando.",
        "**Passo 5:** o DR trocando de mão e a Network LSA do segmento sendo trocada.",
      ],
      note: "A nota confere nas SUAS capturas o Hello de R1 com a prioridade nova e R2 ainda DR, e a Router LSA de R1 com o enlace ponto a ponto; uma pergunta pede o seq dessa LSA, que muda a cada sessão.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: explicar **quem venceu** a eleição padrão e por quê; mostrar a eleição **no Hello**; justificar o **ponto a ponto** e mostrar o que mudou nas LSAs; explicar por que a prioridade **não trocou** o DR — e por que reiniciar R2 trocou.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` é o que o
  // professor espera ouvir — só aparece no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Na partida do lab, quem foi DR em cada enlace de R1, e por quê?",
      lookFor: "R1–R2: R2 DR, R1 Backup; R1–R3: R3 DR, R1 Backup. Prioridades iguais (1), desempate pelo maior Router ID. Sabe que no show ip ospf neighbor o State é o papel do vizinho.",
    },
    {
      id: "e2",
      prompt: "Mostre na 🔬 captura um Hello de R1 no enlace com R2. Onde está a eleição nesse pacote?",
      lookFor: "Campos Priority, Designated Router 10.0.12.2 e Backup Designated Router 10.0.12.1. DR/BDR identificados pelo IP da interface, não pelo Router ID.",
    },
    {
      id: "e3",
      prompt: "Por que mudar R1–R3 para ponto a ponto? O que mudou no neighbor, nos Hellos e no banco de dados?",
      lookFor: "Enlace com só 2 roteadores para sempre — DR/BDR é sobrecarga. Vizinho Full/-, Hellos de eth2 sem DR/BDR, Network LSA 10.0.13.2 de R3 retirada (age 3600), Router LSA de R1 com 'Neighbor Router-ID: 3.3.3.3' + Stub Network 10.0.13.0.",
    },
    {
      id: "e4",
      prompt: "O que aconteceu enquanto só R1 estava em point-to-point?",
      lookFor: "Adjacência ficou em ExStart e/ou chegou a Full, mas as rotas pelo enlace sumiram: as duas pontas descrevem o enlace de forma incompatível nas Router LSAs e o SPF não o usa. Full não garante rota.",
    },
    {
      id: "e5",
      prompt: "Você deu prioridade {{r1Priority}} a R1 e reiniciou R1. Por que ele não virou DR? Mostre na captura.",
      lookFor: "Eleição não preemptiva: R2 continuava anunciando-se DR e R1 aceitou. Na captura, Hello de R1 com Priority {{r1Priority}} e ainda 'Designated Router 10.0.12.2'.",
    },
    {
      id: "e6",
      prompt: "Ao reiniciar R2, R1 virou DR em menos de 1 segundo. Foi por causa da prioridade?",
      lookFor: "Não: R1 era o BDR, e quando o DR cai o BDR assume sem nova eleição — teria acontecido com prioridade 1. A prioridade só decide eleição do zero (todos juntos, após o Wait de 40 s). Se agora reiniciar R1, R2 (BDR) vira DR.",
    },
    {
      id: "e7",
      prompt: "O que mudou no banco de dados quando o DR do segmento R1–R2 trocou?",
      lookFor: "A Network LSA 10.0.12.2 (gerada por R2) foi retirada com age 3600 e R1 gerou uma nova Network LSA com LSA-ID 10.0.12.1. Os Hellos passaram a anunciar Designated Router 10.0.12.1.",
    },
  ],

  autoGrade: [
    { id: "checked_neighbors", label: "Verificou vizinhos OSPF", cmdContains: "show ip ospf neighbor" },
    { id: "checked_interface", label: "Verificou tipo de rede da interface", cmdContains: "show ip ospf interface" },
    { id: "checked_database", label: "Verificou as Network LSAs", cmdContains: "show ip ospf database" },
    { id: "ptp_changed", label: "Mudou o tipo de rede para point-to-point", cmdContains: "ip ospf network point-to-point" },
    { id: "priority_changed", label: "Alterou a prioridade de R1", cmdContains: "ip ospf priority" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_dr_hello", label: "Viu DR e BDR anunciados num Hello", router: "R1", capturePattern: "Designated Router 10\\.0\\.1[23]\\.\\d, Backup Designated Router" },
    { id: "captured_ptp_lsa", label: "Capturou a Router LSA de R1 com o enlace ponto a ponto", router: "R1", capturePattern: "Advertising Router 1\\.1\\.1\\.1[\\s\\S]*Neighbor Router-ID: 3\\.3\\.3\\.3, Interface Address: 10\\.0\\.13\\.1" },
    { id: "captured_priority_hello", label: "Capturou R1 anunciando a prioridade nova sem virar DR", router: "R1", capturePattern: "10\\.0\\.12\\.1 > 224\\.0\\.0\\.5: OSPFv2, Hello[\\s\\S]*Priority {{r1Priority}}\\s+Designated Router 10\\.0\\.12\\.2," },
    { id: "captured_new_dr_hello", label: "Viu R1 assumir como DR no Hello", router: "R1", capturePattern: "Priority {{r1Priority}}\\s+Designated Router 10\\.0\\.12\\.1\\b" },
  ],

  verifications: [
    {
      id: "adjacencies_full",
      label: "R1 com adjacência Full com R2 e R3",
      weight: 10,
      check: {
        router: "R1",
        cmdPattern: "show ip ospf neighbor",
        outputPattern: "(?=[\\s\\S]*2\\.2\\.2\\.2[\\s\\S]*Full)(?=[\\s\\S]*3\\.3\\.3\\.3[\\s\\S]*Full)",
      },
    },
    {
      id: "ptp_configured_r1",
      label: "R1 com point-to-point na interface para R3 (eth2)",
      weight: 10,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "interface eth2\\n(?: .*\\n)*? ip ospf network point-to-point" },
    },
    {
      id: "ptp_configured_r3",
      label: "R3 com point-to-point na interface para R1 (eth1)",
      weight: 10,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "interface eth1\\n(?: .*\\n)*? ip ospf network point-to-point" },
    },
    {
      id: "ptp_no_dr_bdr",
      label: "Enlace R1–R3 sem DR/BDR (visto por R1)",
      weight: 10,
      check: { router: "R1", cmdPattern: "show ip ospf neighbor", outputPattern: "3\\.3\\.3\\.3[\\s\\S]*?Full/\\s*-" },
    },
    {
      id: "routes_ok",
      label: "R2 alcança o loopback de R3 via OSPF (enlace p2p sendo usado pelo SPF)",
      weight: 10,
      check: { router: "R2", cmdPattern: "show ip route 3\\.3\\.3\\.3/32", outputPattern: "Known via \"ospf\"" },
    },
    {
      id: "r1_priority_configured",
      label: "R1 com ip ospf priority {{r1Priority}} na interface para R2 (eth1)",
      weight: 10,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "interface eth1\\n(?: .*\\n)*? ip ospf priority {{r1Priority}}\\s" },
    },
    {
      id: "r1_is_dr_final",
      label: "R1 é o DR do segmento R1–R2 (visto por R2)",
      weight: 15,
      check: { router: "R2", cmdPattern: "show ip ospf neighbor", outputPattern: "1\\.1\\.1\\.1[\\s\\S]*?Full/\\s*DR" },
    },
    {
      id: "capture_nonpreempt",
      label: "Capturou R1 anunciando prioridade {{r1Priority}} com R2 ainda DR (não preempção)",
      weight: 15,
      check: { type: "capture", router: "R1", packetPattern: "10\\.0\\.12\\.1 > 224\\.0\\.0\\.5: OSPFv2, Hello[\\s\\S]*Priority {{r1Priority}}\\s+Designated Router 10\\.0\\.12\\.2," },
    },
    {
      id: "capture_ptp_lsa",
      label: "Capturou a Router LSA de R1 descrevendo o enlace com R3 como ponto a ponto",
      weight: 10,
      check: { type: "capture", router: "R1", packetPattern: "Advertising Router 1\\.1\\.1\\.1[\\s\\S]*Neighbor Router-ID: 3\\.3\\.3\\.3, Interface Address: 10\\.0\\.13\\.1" },
    },
  ],

  answerKey: {
    // Previsões do roteiro: o que se espera ANTES de olhar
    predict_step1: {
      type: "keywords",
      required: ["r2", "router id maior", "maior router-id", "2.2.2.2", "router-id maior", "maior router id"],
      anyOf: true,
      points: 10,
      hint: "Com prioridade igual (1) nos dois lados, o desempate é pelo maior Router ID — compare 1.1.1.1 com 2.2.2.2.",
    },
    predict_netlsa: {
      type: "keywords",
      required: ["2", "duas", "dois"],
      anyOf: true,
      points: 10,
      hint: "Uma Network LSA por segmento broadcast, gerada pelo DR de cada um — e R1 tem dois segmentos broadcast.",
    },
    predict_step2: {
      type: "keywords",
      required: ["não", "nao", "sem dr", "não elege", "nao elege", "não há", "nao ha"],
      anyOf: true,
      points: 10,
      hint: "Point-to-point é justamente o tipo de rede que dispensa DR/BDR — só faz sentido em links com exatamente dois roteadores.",
    },
    predict_priority: {
      type: "keywords",
      required: ["r2", "2.2.2.2", "continua", "não muda", "nao muda", "não troca", "nao troca", "não vira", "nao vira", "preempt"],
      anyOf: true,
      points: 10,
      hint: "A eleição não é preemptiva: R2 continua anunciando-se DR, e R1 aceita ao voltar.",
    },
    q1: {
      type: "radio",
      correct: "Primeiro a prioridade mais alta; em caso de empate, o maior Router ID",
      points: 10,
    },
    q2: {
      type: "radio",
      correct: "O roteador nunca se torna DR nem BDR — permanece DROTHER para sempre",
      points: 10,
    },
    q3: {
      type: "radio",
      correct: "Porque um link ponto-a-ponto nunca terá um terceiro roteador, então a eleição de DR/BDR é uma sobrecarga sem benefício",
      points: 10,
    },
    q4: {
      type: "radio",
      correct: "Não — a eleição de DR não é preemptiva; o DR atual continua sendo DR mesmo que o outro lado passe a ter prioridade maior",
      points: 10,
    },
    q5: {
      type: "radio",
      correct: "Porque R1 era o BDR: quando o DR cai, o BDR assume sem nova eleição — teria acontecido mesmo com prioridade 1",
      points: 15,
    },
    q6: {
      type: "radio",
      correct: "R2, que é o BDR, vira DR — e R1 volta como Backup, mesmo com prioridade maior",
      points: 15,
    },
    q7: {
      type: "radio",
      correct: "A adjacência pode chegar a Full, mas as rotas por esse enlace somem: as duas pontas descrevem o enlace de forma diferente nas Router LSAs e o SPF não o usa",
      points: 15,
    },
    q8: {
      type: "radio",
      correct: "R3 a retirou (reenviou com age 3600): enlace ponto a ponto não tem DR, então não tem Network LSA",
      points: 10,
    },
    // Conferido contra a captura do próprio aluno — muda a cada sessão
    q9: {
      type: "capture",
      router: "R1",
      packetPattern: "LS-Update",
      blockSplit: "LSA #",
      blockPattern: "Advertising Router 1\\.1\\.1\\.1[\\s\\S]*Neighbor Router-ID: 3\\.3\\.3\\.3, Interface Address: 10\\.0\\.13\\.1",
      valuePattern: "seq (0x[0-9a-f]+)",
      first: true, // a 1ª versão (passo 3); depois do clear do passo 4 o seq recomeça
      points: 15,
      hint: "Capture em R1 (todas as interfaces) durante o passo 3 e abra o PRIMEIRO LS-Update cuja Router LSA (Advertising Router 1.1.1.1) tem 'Neighbor Router-ID: 3.3.3.3'. Copie o seq (ex.: 0x8000000d).",
    },
  },

  steps: [
    {
      id: 1,
      title: "Observar a eleição padrão de DR/BDR",
      theory: "Em segmentos de rede do tipo broadcast (o padrão para interfaces Ethernet/veth no FRR), o OSPF elege um Designated Router (DR) e um Backup Designated Router (BDR) — isso reduz o número de adjacências que precisariam existir se houvesse muitos roteadores no mesmo segmento: os demais roteadores (DROther) formam adjacência completa só com o DR e o BDR, não uns com os outros.\n\nA eleição funciona assim: vence quem tiver a maior prioridade OSPF configurada na interface (padrão: 1). Em caso de empate de prioridade, desempata o maior Router ID — não o endereço IP da interface, o Router ID do processo OSPF.\n\nNeste lab, os dois enlaces de R1 começam como broadcast, com prioridade padrão (1) em todo mundo.\n\nAtenção ao ler o 'show ip ospf neighbor': a coluna State mostra o papel do VIZINHO naquele segmento, não o seu. O seu papel aparece no campo State do 'show ip ospf interface'.",
      description: "Antes de rodar os comandos, responda à previsão abaixo. Depois verifique quem foi eleito DR em cada enlace de R1.",
      commands: [
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Papel de R2 e de R3 em cada segmento" },
        { cmd: "show ip ospf interface eth1", router: "R1", desc: "Tipo de rede, prioridade e papel de R1 no segmento com R2" },
      ],
      expected: "No segmento R1–R2, R2 (Router ID 2.2.2.2, maior que 1.1.1.1) é o DR e R1 é o BDR. No enlace R1–R3, pelo mesmo motivo, R3 é o DR e R1 o BDR. No 'show ip ospf interface eth1' de R1: Network Type BROADCAST, State Backup, Priority 1.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar os comandos: com prioridade padrão (1) nos dois lados, qual roteador você espera que vença a eleição de DR no segmento R1-R2 — R1 ou R2? Por quê?",
      },
    },
    {
      id: 2,
      title: "Ver a eleição no fio (captura)",
      theory: "A eleição não é um comando: ela acontece dentro dos Hellos. Cada Hello carrega a prioridade de quem envia e quem ele acha que são o DR e o BDR do segmento — identificados pelo IP da interface no segmento, não pelo Router ID.\n\nO DR de cada segmento broadcast também gera uma Network LSA (Type 2), cujo LSA-ID é o IP da interface dele e que lista os roteadores conectados no segmento. No 'show ip ospf database' elas aparecem em 'Net Link States'.",
      description: "Abra a captura em R1, interface 'todas', protocolo OSPF, e espere uns 20 segundos. DEIXE A CAPTURA RODANDO pelos próximos passos (se ela parar sozinha depois de 10 min, inicie de novo).\n\nAbra um Hello de R1 em cada enlace (origem 10.0.12.1 e 10.0.13.1) e encontre:\n  • a Priority\n  • o Designated Router e o Backup Designated Router\n  • a Neighbor List\n\nCompare o DR/BDR anunciado com o que o 'show ip ospf neighbor' mostrou. Depois rode 'show ip ospf database' em R1 e veja as Net Link States.",
      capture: { router: "R1", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show ip ospf database", router: "R1", desc: "Router LSAs e Network LSAs (Net Link States)" },
      ],
      expected: "Hello de R1 em eth1: Priority 1, 'Designated Router 10.0.12.2, Backup Designated Router 10.0.12.1'. Em eth2: DR 10.0.13.2, BDR 10.0.13.1. No banco: 3 Router LSAs e 2 Network LSAs — 10.0.12.2 (gerada por 2.2.2.2) e 10.0.13.2 (gerada por 3.3.3.3), uma por segmento, cada uma pelo seu DR.",
      predict: {
        id: "predict_netlsa",
        prompt: "Antes de olhar o banco: quantas Network LSAs (Type 2) você espera encontrar, e quem gera cada uma?",
      },
    },
    {
      id: 3,
      title: "Tornar o enlace R1–R3 ponto a ponto",
      theory: "O tipo de rede OSPF é uma configuração da interface, não uma característica física do link — mesmo um link que nunca terá mais de dois roteadores (como este entre R1 e R3, uma WAN contratada) vem como broadcast por padrão e elege DR/BDR à toa.\n\nCom 'ip ospf network point-to-point', a eleição desaparece: os Hellos deixam de carregar DR/BDR, o vizinho aparece como 'Full/-' e não existe mais Network LSA para esse enlace. Na Router LSA, o enlace passa a apontar direto para o Router ID do vizinho, com a sub-rede como Stub Network à parte.\n\nAs duas pontas precisam ter o mesmo tipo. Se só uma muda, os Hellos ainda batem e a adjacência pode até chegar a Full — mas as duas pontas descrevem o enlace de formas incompatíveis e o SPF deixa de usá-lo: as rotas somem.",
      description: "Com a captura em R1 rodando:\n\n1) Configure SÓ R1 e observe por cerca de 1 minuto:\n  configure terminal\n  interface eth2\n   ip ospf network point-to-point\n  end\n\n   Rode 'show ip ospf neighbor' em R1 e 'show ip route 3.3.3.3/32' em R2 algumas vezes. O que acontece com o vizinho? E com a rota?\n\n2) Agora configure R3:\n  configure terminal\n  interface eth1\n   ip ospf network point-to-point\n  end\n\n3) Na captura, encontre:\n  • um Hello de eth2 (10.0.13.x) sem os campos DR/BDR\n  • o LS-Update em que R3 retira a Network LSA 10.0.13.2 (age 3600s)\n  • o PRIMEIRO LS-Update com a Router LSA de R1 (Advertising Router 1.1.1.1) contendo 'Neighbor Router-ID: 3.3.3.3' — anote o seq: o desafio pede esse valor da SUA captura (depois do passo 4 o seq de R1 recomeça, então anote agora)",
      capture: { router: "R1", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Estado de R3 durante e depois da mudança" },
        { cmd: "show ip route 3.3.3.3/32", router: "R2", desc: "R2 alcança R3? (rode com só um lado em p2p e depois)" },
        { cmd: "show ip ospf interface eth2", router: "R1", desc: "Confirme 'Network Type POINTOPOINT'" },
        { cmd: "show ip ospf database", router: "R1", desc: "Quantas Net Link States sobraram?" },
      ],
      expected: "Com só R1 em point-to-point, R3 aparece como Full (às vezes depois de um tempo em ExStart) — mas R2 não tem rota para 3.3.3.3/32 ('Network not in table'). Com os dois lados em point-to-point: R3 aparece como 'Full/-', a rota volta, eth2 mostra Network Type POINTOPOINT e o banco fica com uma única Network LSA (10.0.12.2). Na captura: Hellos de eth2 sem DR/BDR, a Network LSA 10.0.13.2 com age 3600s e a Router LSA de R1 com 'Neighbor Router-ID: 3.3.3.3' e 'Stub Network: 10.0.13.0'.",
      predict: {
        id: "predict_step2",
        prompt: "Depois de mudar o tipo de rede do link R1-R3 para point-to-point nos dois lados, você espera que a eleição de DR/BDR ainda aconteça nesse link?",
      },
    },
    {
      id: 4,
      title: "Aumentar a prioridade de R1 — e ver que nada muda",
      theory: "Prioridade é o PRIMEIRO critério da eleição — antes do Router ID. Mas a eleição de DR não é preemptiva: mudar a prioridade não derruba o DR atual.\n\nE reiniciar só o roteador de prioridade alta também não adianta: ao voltar, ele ouve o vizinho se anunciando DR e simplesmente aceita, sem contestar. A prioridade só decide quando ninguém está no papel — numa eleição do zero.",
      description: "Com a captura em R1 rodando, aumente a prioridade de R1 no segmento com R2 e reinicie o OSPF SÓ em R1:\n\n  configure terminal\n  interface eth1\n   ip ospf priority {{r1Priority}}\n  end\n  clear ip ospf process\n\nAguarde a adjacência voltar e confira quem é o DR. Na captura, encontre um Hello de R1 (10.0.12.1) com a Priority nova e veja quem ele anuncia como Designated Router.",
      capture: { router: "R1", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "show ip ospf interface eth1", router: "R1", desc: "Priority {{r1Priority}} — e o State de R1?" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "Que papel R2 vê para R1?" },
      ],
      expected: "R1 continua Backup, agora com Priority {{r1Priority}}; R2 continua DR. Na captura: Hello de R1 com 'Priority {{r1Priority}}' e 'Designated Router 10.0.12.2' — a prioridade mudou, o DR não.",
      predict: {
        id: "predict_priority",
        prompt: "Depois de dar prioridade {{r1Priority}} a R1 e reiniciar só R1, quem você espera que seja o DR do segmento R1–R2?",
      },
    },
    {
      id: 5,
      title: "Quando o DR cai, o BDR assume",
      theory: "Se o DR sai do ar (ou reinicia o processo OSPF), o BDR assume o papel de DR imediatamente, sem esperar nenhum timer — é para isso que ele existe. Só o papel de BDR é eleito de novo.\n\nRepare: isso não tem nada a ver com prioridade. R1 vai virar DR porque é o BDR. Com prioridade 1, o resultado seria o mesmo.\n\nE o contrário também vale: se depois disso você reiniciar R1, R2 (que terá virado BDR) assume como DR — mesmo com prioridade menor. Por isso, depois deste passo, NÃO rode 'clear ip ospf process' em R1.",
      description: "Com a captura em R1 rodando, reinicie o OSPF em R2 (o DR atual):\n\n  clear ip ospf process\n\nConfira em seguida quem é o DR. Na captura, encontre:\n  • o primeiro Hello de R1 anunciando 'Designated Router 10.0.12.1'\n  • o LS-Update com a Network LSA 10.0.12.2 sendo retirada (age 3600s)\n  • a nova Network LSA, com LSA-ID 10.0.12.1, gerada por 1.1.1.1",
      capture: { router: "R1", iface: "any", filter: "ospf" },
      commands: [
        { cmd: "clear ip ospf process", router: "R2", desc: "Reinicia o OSPF no DR atual" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "R1 (1.1.1.1) aparece como DR?" },
        { cmd: "show ip ospf database", router: "R1", desc: "Qual Network LSA existe agora para o segmento R1–R2?" },
      ],
      expected: "Em menos de um segundo R1 vira DR (Full/DR visto por R2) e R2 volta como Backup. No banco, a Network LSA do segmento passa a ser 10.0.12.1, gerada por 1.1.1.1 (a antiga 10.0.12.2 aparece com age 3600 até sumir). Na captura, os Hellos passam a anunciar 'Designated Router 10.0.12.1'.",
    },
  ],

  challenge: {
    title: "Desafio: Controle de Tipo de Rede e Eleição",
    description: "Consolide o que foi observado e configurado. O estado final esperado:\n\n1. R1 com prioridade {{r1Priority}} na interface para R2, e DR desse segmento.\n2. O enlace R1–R3 em point-to-point nos dois lados, sem DR/BDR — e com as rotas funcionando.\n3. As duas adjacências de R1 em Full.\n\nAtenção: se você reiniciar o OSPF em R1 agora, R2 (o BDR) assume como DR — a prioridade não impede isso. Se aconteceu, reinicie R2 para que R1 (então BDR) volte a assumir.\n\nParte das respostas vem das SUAS capturas — e a nota também confere se você capturou R1 anunciando a prioridade nova com R2 ainda DR, e a Router LSA de R1 com o enlace ponto a ponto.",
    hints: [
      "A prioridade é o primeiro critério; o Router ID só desempata quando a prioridade é igual",
      "Prioridade 0 é diferente de prioridade baixa — 0 significa 'nunca virar DR/BDR'",
      "Mudar a prioridade não troca o DR — e quando o DR cai, quem assume é o BDR",
      "point-to-point precisa estar configurado nos DOIS lados do link",
      "Full não garante rota: confira a tabela de rotas depois de mexer em tipo de rede",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "Numa eleição do zero, qual é a ordem dos critérios para escolher o DR num segmento broadcast?",
        options: [
          "Primeiro a prioridade mais alta; em caso de empate, o maior Router ID",
          "Primeiro o maior Router ID; a prioridade nunca é usada",
          "Sempre o roteador que subiu primeiro, independente de prioridade",
          "Primeiro o menor endereço IP da interface",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "O que acontece quando um roteador tem prioridade OSPF configurada como 0 numa interface?",
        options: [
          "Ele sempre vence a eleição, prioridade 0 é tratada como infinita",
          "O roteador nunca se torna DR nem BDR — permanece DROTHER para sempre",
          "O OSPF é desabilitado nessa interface",
          "Ele vira automaticamente BDR, nunca DR",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Por que faz sentido configurar 'point-to-point' num link WAN dedicado que nunca terá um terceiro roteador?",
        options: [
          "Porque point-to-point aumenta a banda disponível no link",
          "Porque um link ponto-a-ponto nunca terá um terceiro roteador, então a eleição de DR/BDR é uma sobrecarga sem benefício",
          "Porque links point-to-point não podem redistribuir rotas",
          "Porque o tipo broadcast não permite formar adjacência Full",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Depois que um DR já foi eleito, aumentar a prioridade de outro roteador do segmento troca o DR?",
        options: [
          "Sim, a mudança de prioridade sempre força uma nova eleição instantânea",
          "Não — a eleição de DR não é preemptiva; o DR atual continua sendo DR mesmo que o outro lado passe a ter prioridade maior",
          "Sim, mas só se o novo roteador tiver Router ID maior também",
          "Não, a prioridade só pode ser mudada uma vez por sessão OSPF",
        ],
      },
      {
        id: "q5",
        type: "radio",
        text: "No passo 5, ao reiniciar R2, R1 virou DR em menos de um segundo. Por quê?",
        options: [
          "Porque a prioridade de R1 era maior e forçou uma nova eleição",
          "Porque R1 era o BDR: quando o DR cai, o BDR assume sem nova eleição — teria acontecido mesmo com prioridade 1",
          "Porque R1 tem o menor Router ID",
          "Porque R2 desligou o OSPF de vez",
        ],
      },
      {
        id: "q6",
        type: "radio",
        text: "Com R1 como DR (prioridade {{r1Priority}}) e R2 como BDR (prioridade 1), o que acontece se você rodar 'clear ip ospf process' em R1?",
        options: [
          "R1 volta e retoma o papel de DR, porque tem prioridade maior",
          "R2, que é o BDR, vira DR — e R1 volta como Backup, mesmo com prioridade maior",
          "O segmento fica sem DR até alguém reiniciar R2",
          "A adjacência entre R1 e R2 não volta mais",
        ],
      },
      {
        id: "q7",
        type: "radio",
        text: "O que aconteceu enquanto R1 estava em point-to-point e R3 ainda em broadcast?",
        options: [
          "Nada: o OSPF ajusta o tipo de rede automaticamente",
          "Os Hellos foram descartados e a adjacência nunca saiu de Down",
          "A adjacência pode chegar a Full, mas as rotas por esse enlace somem: as duas pontas descrevem o enlace de forma diferente nas Router LSAs e o SPF não o usa",
          "R3 foi eleito DR e passou a gerar duas Network LSAs",
        ],
      },
      {
        id: "q8",
        type: "radio",
        text: "Quando o enlace R1–R3 virou ponto a ponto, o que aconteceu com a Network LSA 10.0.13.2?",
        options: [
          "Continuou existindo, porque toda sub-rede tem uma Network LSA",
          "R3 a retirou (reenviou com age 3600): enlace ponto a ponto não tem DR, então não tem Network LSA",
          "Passou a ser gerada por R1",
          "Virou uma Summary LSA (Type 3)",
        ],
      },
      {
        id: "q9",
        type: "text",
        text: "Qual é o seq da PRIMEIRA Router LSA de R1 que descreveu o enlace com R3 como ponto a ponto ('Neighbor Router-ID: 3.3.3.3'), na SUA captura? (ex.: 0x8000000d)",
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
interface eth2
 ip address 10.0.13.1/30
!
router ospf
 ospf router-id 1.1.1.1
 network 10.0.12.0/30 area 0
 network 10.0.13.0/30 area 0
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
router ospf
 ospf router-id 2.2.2.2
 network 10.0.12.0/30 area 0
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
 ip address 10.0.13.2/30
!
router ospf
 ospf router-id 3.3.3.3
 network 10.0.13.0/30 area 0
 network 3.3.3.3/32 area 0
!
`,
};

module.exports = lab;
