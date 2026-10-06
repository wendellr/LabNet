/**
 * Lab 10 — OSPF: Diagnóstico de Falha de Adjacência e Seleção de Caminho
 * Falha proposital (área errada, aleatorizada por sessão), diagnóstico pelo
 * comando E pela captura de pacotes, e desafio de custo OSPF. A avaliação
 * confere valores das capturas do próprio aluno (área e seq mudam a cada
 * sessão) — não dá para copiar do colega.
 */

const lab = {
  id: 10,
  protocol: "ospf",
  level: 2,
  scenario: "O time de operações reporta que, depois de uma manutenção de madrugada, um roteador 'sumiu' do IGP — outros roteadores diretamente conectados a ele não conseguem mais trocar rotas, sem nenhum alarme óbvio disparando. Esse é um dos erros mais comuns e mais silenciosos em OSPF: um técnico digitou a área errada numa interface durante a manutenção. Depois de corrigir, o time de engenharia de tráfego também precisa garantir que o caminho mais barato/rápido entre dois links redundantes seja o preferido — daí o desafio de custo OSPF.",
  title: "OSPF — Diagnóstico de Falha de Adjacência e Seleção de Caminho",
  topic: "Área OSPF, Adjacências e Custo",
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
    ["R1", "eth2", "R3", "eth1"],
    ["R2", "eth2", "R4", "eth1"],
    ["R3", "eth2", "R4", "eth2"],
  ],

  // Cada sessão resolve estes valores de forma determinística — o número de
  // área errada e o custo do desafio mudam de aluno para aluno.
  variables: {
    wrongArea: { pool: ["1", "2", "3", "4"] },
    // Sempre > 20: além de tirar R3 do caminho para 172.16.40.0/24, garante
    // que 10.0.34.0/30 também passa a ir via R2 (30 < custo + 10) — q9
    preferCost: { pool: ["25", "40", "60", "100"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=10). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "OSPF — Diagnóstico e Seleção de Caminho",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 10",
      points: [
        "Onde a **área** viaja dentro de cada pacote OSPF — e o que acontece quando ela não bate",
        "Como **diagnosticar** uma adjacência que não sobe: comandos `show` **e** captura de pacotes",
        "Como **corrigir** a área no FRR e ver a **sincronização** acontecer no fio",
        "**Rotas externas** (E2), **ASBR** e **ECMP**",
        "Como o **custo** por interface decide o caminho — e como mudá-lo",
        "Ver a mudança de custo **viajar numa LSA** na captura",
      ],
      note: "Este lab parte do Lab 13 (estados de adjacência, LSDB, captura). Se ainda não fez, comece por ele.",
    },
    {
      title: "A topologia do Lab 10",
      diagram: [
        "          10.0.12.0/30             10.0.24.0/30",
        "  ┌────┐ .1           .2 ┌────┐ .1           .2 ┌────┐",
        "  │    ├─eth1───────eth1─┤ R2 ├─eth2───────eth1─┤    │",
        "  │ R1 │                 └────┘                 │ R4 ├── 172.16.40.0/24",
        "  │    │                 ┌────┐                 │    │   (estática → OSPF)",
        "  │    ├─eth2───────eth1─┤ R3 ├─eth2───────eth2─┤    │",
        "  └────┘ .1           .2 └────┘ .1           .2 └────┘",
        "          10.0.13.0/30             10.0.34.0/30",
        "",
        "  RIDs: R1 = 1.1.1.1 · R2 = 2.2.2.2 · R3 = 3.3.3.3 · R4 = 4.4.4.4",
      ].join("\n"),
      points: [
        "Um **quadrado**: R1 tem dois caminhos até R4 — por R2 e por R3. Todos os enlaces deveriam estar na **área 0**.",
        "R4 anuncia a rede **172.16.40.0/24**, uma rota estática **redistribuída** no OSPF.",
        "Depois da \"manutenção\", **uma** interface ficou na área errada. Seu trabalho: achar qual, provar no fio, corrigir — e depois escolher o caminho.",
      ],
    },
    {
      title: "Revisão: o que precisa bater no Hello",
      points: [
        "Para formar adjacência, os dois lados do enlace precisam **concordar** em: **área**, **sub-rede/máscara**, **Hello/Dead interval**, **autenticação**, **tipo de área** (stub etc.) e **MTU** (este trava mais adiante, na troca de DBD).",
        "A **área não é só configuração local**: ela vai no **cabeçalho de todo pacote OSPF** (campo Area ID), ao lado do Router-ID.",
        "Na captura, o tcpdump mostra a área 0 como `Backbone Area` e as outras como `Area 0.0.0.X`.",
      ],
      code: "10.0.12.1 > 224.0.0.5: OSPFv2, Hello, length 44\n\tRouter-ID 1.1.1.1, Backbone Area, Authentication Type: none (0)\n\t  Hello Timer 10s, Dead Timer 40s, Mask 255.255.255.252, Priority 1",
      note: "Saída real do tcpdump num Hello de R1. Compare com o Hello que chega de R2 no seu lab.",
    },
    {
      title: "Área diferente: o descarte silencioso",
      points: [
        "Quando chega um Hello com Area ID **diferente** da área da interface que o recebeu, o roteador **descarta o pacote** — sem responder, sem erro no `show`.",
        "Consequência: o vizinho **nunca entra** na Neighbor List. A adjacência não passa de **Down** — nem chega a **Init**.",
        "Os dois lados continuam mandando Hellos normalmente, cada um **sozinho** no segmento: cada um se elege **DR** e a **Neighbor List** sai **vazia**.",
        "Por isso o problema é tão traiçoeiro: o enlace está **up**, o ping no IP do vizinho funciona, e o `show ip ospf neighbor` simplesmente **não lista** o vizinho.",
      ],
    },
    {
      title: "Método de diagnóstico",
      table: {
        head: ["Pergunta", "Onde olhar", "O que procurar"],
        rows: [
          ["O vizinho aparece?", "`show ip ospf neighbor`", "Vizinho ausente (ou travado em Init/ExStart)"],
          ["O OSPF está ativo nas duas pontas?", "`show ip ospf interface <if>`", "Campo **Area**, custo, timers, tipo de rede"],
          ["O vizinho está mandando Hello?", "🔬 Captura na interface", "Hellos dele chegando — e com que **Area**"],
          ["O que diverge?", "Captura: Hello de cada lado", "Area ID, máscara, timers no cabeçalho"],
        ],
      },
      points: [
        "**Comando mostra o que o roteador acha; a captura mostra o que de fato trafega.** Use os dois.",
        "**Diagnostique antes de corrigir:** depois da correção, os Hellos com a área errada **não existem mais** para capturar — e a avaliação pede essa evidência.",
      ],
    },
    {
      title: "Efeito colateral: R2 virou ABR",
      points: [
        "Com uma interface na área errada, **R2 passa a ter interfaces em duas áreas** — ele vira um **ABR** (Area Border Router) sem ninguém querer.",
        "ABRs resumem uma área para a outra com **Summary LSAs (Type 3)**. R2 começa a gerar Type 3 sobre a rede 10.0.12.0/30 para a área 0.",
        "Ao corrigir, a área extra some e R2 **retira** essas LSAs: ele as reenvia com **age 3600** (MaxAge), o que manda todos apagarem.",
        "Fique de olho: na captura da correção aparece um LS-Update com uma Summary LSA de `age 3600s`.",
      ],
    },
    {
      title: "Corrigindo a área no FRR",
      code: "R2# configure terminal\nR2(config)# router ospf\nR2(config-router)# network 10.0.12.0/30 area 0\nThere is already same network statement.\nR2(config-router)# no network 10.0.12.0/30 area <área-errada>\nR2(config-router)# network 10.0.12.0/30 area 0\nR2(config-router)# end\nR2# clear ip ospf process",
      points: [
        "O FRR **não sobrescreve** a área de um `network` existente: recusa com `There is already same network statement`.",
        "É preciso **remover** a associação errada (`no network ... area <errada>`) e só depois **adicionar** a certa.",
        "`clear ip ospf process` reinicia as adjacências sem reiniciar o roteador. A eleição de DR/BDR pode levar de 20 a 40 s.",
      ],
    },
    {
      title: "A sincronização no fio",
      table: {
        head: ["Pacote na captura", "Estado", "O que mostra"],
        rows: [
          ["Hello com `Neighbor List: 2.2.2.2`", "Init → 2-Way", "R1 agora ouve R2 — e diz isso no Hello"],
          ["Database Description `[Init, More, Master]`", "ExStart", "Negociação de quem conduz (maior RID vira mestre)"],
          ["Database Description com a lista de LSAs", "Exchange", "Resumo do LSDB: `Advertising Router`, `seq`, `age`"],
          ["LS-Request", "Loading", "\"Me manda as LSAs que eu não tenho / tenho velhas\""],
          ["LS-Update + LS-Ack", "Loading → Full", "As LSAs em si, e a confirmação de recebimento"],
        ],
      },
      note: "Deixe a captura rodando ANTES de corrigir — a sincronização dura menos de um segundo.",
    },
    {
      title: "Rotas externas: redistribute, ASBR e E2",
      points: [
        "A rede 172.16.40.0/24 não é interface OSPF: é uma **rota estática** que R4 injeta no OSPF com `redistribute static`. Isso faz de R4 um **ASBR**.",
        "Rotas redistribuídas viajam em **AS External LSAs (Type 5)** — veja em `show ip ospf database external`.",
        "O padrão do FRR é **E2** com métrica externa **20**: a métrica externa é a mesma em qualquer ponto da rede — não soma o custo interno.",
        "Entre dois caminhos para a mesma rota E2, o **desempate** é o **custo interno até o ASBR**.",
      ],
      code: "R1# show ip ospf route\n...\nR    4.4.4.4               [20] area: 0.0.0.0, ASBR\n...\nN E2 172.16.40.0/24        [20/20] tag: 0\n                           via ...",
      note: "Em [20/20], o primeiro número é o custo interno até o ASBR; o segundo é a métrica externa (E2).",
    },
    {
      title: "ECMP — caminhos de custo igual",
      points: [
        "Nos enlaces deste lab, cada interface tem **custo 10** (como no Lab 13 — confira em `show ip ospf interface`).",
        "De R1 até R4: via R2 = 10 + 10 = **20**; via R3 = 10 + 10 = **20**. **Empate.**",
        "No empate, o OSPF **instala os dois caminhos** e divide o tráfego entre eles: **ECMP** (Equal-Cost Multi-Path).",
        "Na tabela de rotas, ECMP aparece como **dois next-hops** marcados com `*` para o mesmo prefixo.",
      ],
    },
    {
      title: "Custo: por interface e por sentido",
      points: [
        "O custo é configurado **na interface**, com `ip ospf cost <valor>` — no modo de interface, não em `router ospf`.",
        "Ele vale para o tráfego que **sai** por aquela interface. O caminho que R1 escolhe depende dos custos das interfaces de saída **ao longo do caminho, a partir de R1**.",
        "Para R1 evitar R3, aumente o custo da interface de **R1** voltada para R3. Mexer em R3 ou em R2 não muda a primeira saída de R1.",
        "Atenção: o custo novo vale para **toda** rota que saía por aquela interface — não só a que você queria mudar. Confira a tabela inteira depois.",
      ],
      code: "R1# configure terminal\nR1(config)# interface eth2\nR1(config-if)# ip ospf cost <valor>\nR1(config-if)# end",
    },
    {
      title: "A mudança de custo vira uma LSA",
      points: [
        "O custo de cada enlace faz parte da **Router LSA (Type 1)** de quem o configurou.",
        "Ao mudar o custo, R1 gera uma **nova versão** da sua Router LSA (**seq** maior) e a inunda pela área num **LS-Update**.",
        "Todos os roteadores rodam o SPF de novo com o mapa atualizado — é assim que R2, R3 e R4 \"ficam sabendo\".",
      ],
      code: "10.0.12.1 > 224.0.0.5: OSPFv2, LS-Update, length 76\n\tRouter-ID 1.1.1.1, Backbone Area, ... 1 LSA\n\t  Advertising Router 1.1.1.1, seq 0x8000000?, age 1s, length 28\n\t    Router LSA (1), LSA-ID: 1.1.1.1\n\t      Neighbor Network-ID: 10.0.12.1, Interface Address: 10.0.12.1\n\t\ttopology default (0), metric 10\n\t      Neighbor Network-ID: 10.0.13.2, Interface Address: 10.0.13.1\n\t\ttopology default (0), metric <custo novo>",
      note: "Saída real (resumida). O seq da sua captura é diferente — e é ele que a avaliação pede.",
    },
    {
      title: "Comandos que você vai usar",
      table: {
        head: ["Comando", "Responde à pergunta"],
        rows: [
          ["`show ip ospf neighbor`", "Com quem eu formei adjacência, e em que estado?"],
          ["`show ip ospf interface <if>`", "Qual a área, o custo e os timers desta interface?"],
          ["`show ip ospf route`", "Rotas OSPF por tipo (intra-área, ASBR, externas E1/E2)"],
          ["`show ip ospf database external`", "As LSAs Type 5 — quem redistribuiu o quê"],
          ["`show ip route <prefixo>`", "Quais next-hops estão instalados para este destino?"],
          ["`clear ip ospf process`", "Reinicia as adjacências OSPF"],
        ],
      },
    },
    {
      title: "Captura neste lab — e o que vale nota",
      points: [
        "**Passo 2:** capture em **R1, eth1** (↔ R2) e veja o Hello de R2 chegando com a área errada. **Deixe a captura rodando.**",
        "**Passo 4:** corrija com a captura ainda ligada e veja DBD, LS-Request, LS-Update e LS-Ack até chegar a Full.",
        "**Desafio:** capture em R1 o LS-Update com o **custo novo** na Router LSA de R1.",
      ],
      note: "A nota confere nas SUAS capturas o Hello com a área errada e o LS-Update com o custo novo, e duas perguntas pedem valores que mudam a cada sessão (a área errada e o seq da LSA). Corrigir antes de capturar = perder essa evidência.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: mostrar o **sintoma**; apontar **na captura** o campo que denunciou o problema; explicar a **correção**; ler a rota **E2** e o **ECMP**; justificar **onde** mudou o custo; e mostrar o **LS-Update** com o custo novo.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` é o que o
  // professor espera ouvir — só aparece no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Qual era o sintoma em R1 antes da correção? Por que nenhum comando mostrava um erro?",
      lookFor: "R1 só via 3.3.3.3 em Full; R2 nem aparecia, mesmo com o enlace up. Hello com área diferente é descartado em silêncio — o vizinho nunca entra na Neighbor List, não chega nem a Init.",
    },
    {
      id: "e2",
      prompt: "Mostre na 🔬 captura um Hello de R2 chegando em R1 antes da correção. Qual campo denunciou o problema, e o que mais você reparou no Hello?",
      lookFor: "Hello de 10.0.12.2 com 'Router-ID 2.2.2.2, Area 0.0.0.{{wrongArea}}' contra 'Backbone Area' no Hello de R1. Neighbor List vazia dos dois lados e cada um DR de si mesmo — um não ouve o outro.",
    },
    {
      id: "e3",
      prompt: "Mostre a correção em R2. Por que o FRR exigiu o 'no network' antes do comando certo?",
      lookFor: "no network 10.0.12.0/30 area {{wrongArea}} e depois network 10.0.12.0/30 area 0. O FRR recusa outra área para o mesmo prefixo ('There is already same network statement'). Bônus: R2 era ABR por acidente e retirou a Summary LSA (age 3600).",
    },
    {
      id: "e4",
      prompt: "Que pacotes apareceram na captura entre a correção e o Full? Relacione cada um com um estado da adjacência.",
      lookFor: "Hello com Neighbor List 2.2.2.2 (2-Way), DBD com flags Init/More/Master (ExStart), DBD com a lista de LSAs (Exchange), LS-Request e LS-Update (Loading), LS-Ack → Full.",
    },
    {
      id: "e5",
      prompt: "Explique a rota 172.16.40.0/24 em R1: de onde ela vem, o que é E2 e por que havia dois next-hops.",
      lookFor: "Estática redistribuída por R4 (ASBR), LSA Type 5. E2: métrica externa 20 fixa; [20/20] = custo até o ASBR / métrica externa. Custo até R4 empatava em 20 por R2 e por R3 → ECMP com dois next-hops.",
    },
    {
      id: "e6",
      prompt: "Por que o custo foi alterado na interface de R1, e não em R3 ou R2? Mostre a rota depois.",
      lookFor: "O custo vale para o tráfego que sai pela interface; quem decide é R1, então muda-se a saída de R1 para R3 (eth2, custo {{preferCost}}). Rota: só via 10.0.12.2.",
    },
    {
      id: "e7",
      prompt: "Mostre na captura o LS-Update com o custo novo. Quem gerou, o que mudou na LSA, e que outra rota de R1 mudou de caminho?",
      lookFor: "Router LSA de 1.1.1.1 com seq maior, enlace 'Interface Address: 10.0.13.1 ... metric {{preferCost}}'. Efeito colateral: 10.0.34.0/30 passou a ir via R2 com custo 30 (antes direto por eth2 com 20).",
    },
  ],

  autoGrade: [
    { id: "checked_neighbors", label: "Verificou vizinhos OSPF", cmdContains: "show ip ospf neighbor" },
    { id: "checked_interface", label: "Investigou área da interface", cmdContains: "show ip ospf interface" },
    { id: "area_fixed_live", label: "Área corrigida para 0 em R2", cmdContains: "network 10.0.12.0/30 area 0" },
    { id: "checked_ospf_route", label: "Examinou as rotas OSPF (E2/ASBR)", cmdContains: "show ip ospf route" },
    { id: "cost_applied_live", label: "Aplicou custo OSPF", cmdContains: "ip ospf cost" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_wrong_area", label: "Capturou em R1 o Hello de R2 com a área errada", router: "R1", capturePattern: "Router-ID 2\\.2\\.2\\.2, Area 0\\.0\\.0\\.{{wrongArea}}," },
    { id: "captured_dbd", label: "Viu a troca de Database Description", router: "R1", capturePattern: "OSPFv2, Database Description" },
    { id: "captured_cost_lsu", label: "Capturou o LS-Update com o custo novo", router: "R1", capturePattern: "Advertising Router 1\\.1\\.1\\.1[\\s\\S]*Interface Address: 10\\.0\\.13\\.1\\s+topology default \\(0\\), metric {{preferCost}}\\b" },
  ],

  verifications: [
    {
      id: "capture_wrong_area",
      label: "Capturou em R1 o Hello de R2 com a área errada (diagnóstico no fio)",
      weight: 15,
      check: { type: "capture", router: "R1", packetPattern: "Router-ID 2\\.2\\.2\\.2, Area 0\\.0\\.0\\.{{wrongArea}}," },
    },
    {
      id: "ospf_both_full",
      label: "Adjacências OSPF Full com R2 e R3 confirmadas em R1",
      weight: 20,
      check: {
        router: "R1",
        cmdPattern: "show ip ospf neighbor",
        outputPattern: "(?=[\\s\\S]*2\\.2\\.2\\.2[\\s\\S]*Full)(?=[\\s\\S]*3\\.3\\.3\\.3[\\s\\S]*Full)",
      },
    },
    {
      id: "area_corrected",
      label: "Área OSPF corrigida para 0 na rede 10.0.12.0/30 em R2",
      weight: 15,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "network 10\\.0\\.12\\.0/30 area 0" },
    },
    {
      id: "challenge_path_via_r2",
      label: "R1 passou a preferir só o caminho via R2 para 172.16.40.0/24 (desafio)",
      weight: 20,
      check: {
        router: "R1",
        cmdPattern: "show ip route 172\\.16\\.40\\.0",
        // via R2 e NÃO via R3 — com ECMP os dois aparecem
        outputPattern: "^(?![\\s\\S]*10\\.0\\.13\\.2)[\\s\\S]*10\\.0\\.12\\.2",
      },
    },
    {
      id: "cost_applied_r1",
      label: "Custo {{preferCost}} aplicado na interface de R1 voltada para R3 (eth2)",
      weight: 15,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "interface eth2\\n(?: .*\\n)*? ip ospf cost {{preferCost}}\\s" },
    },
    {
      id: "capture_cost_lsu",
      label: "Capturou em R1 o LS-Update com a Router LSA de R1 levando o custo novo",
      weight: 15,
      check: { type: "capture", router: "R1", packetPattern: "Advertising Router 1\\.1\\.1\\.1[\\s\\S]*Interface Address: 10\\.0\\.13\\.1\\s+topology default \\(0\\), metric {{preferCost}}\\b" },
    },
  ],

  answerKey: {
    // Previsões do roteiro: o que se espera ANTES de olhar
    predict_step1: {
      type: "keywords",
      required: ["2", "dois", "duas"],
      anyOf: true,
      points: 10,
      hint: "R1 está ligado diretamente a R2 e a R3 — a expectativa ingênua é ver os dois. O roteiro mostra por que não é o que acontece.",
    },
    predict_capture: {
      type: "keywords",
      required: ["sim", "chega", "chegam", "descarta", "ignora", "área", "area"],
      anyOf: true,
      points: 10,
      hint: "R2 continua mandando Hellos normalmente — o problema não é o Hello não chegar, é o que R1 faz com ele.",
    },
    predict_step2: {
      type: "keywords",
      required: ["iguais", "igual", "mesma", "mesmo"],
      anyOf: true,
      points: 10,
      hint: "A área precisa ser a MESMA nas duas pontas do enlace para a adjacência subir.",
    },
    q1: {
      type: "radio",
      correct: "Porque a Area ID configurada nas duas pontas do link é diferente, e o pacote Hello com Area ID incompatível é descartado silenciosamente",
      points: 15,
    },
    q2: {
      type: "radio",
      correct: "show ip ospf interface",
      points: 10,
    },
    q3: {
      type: "radio",
      correct: "Descarta o Hello sem responder — R2 nunca entra na Neighbor List de R1 e a adjacência não sai de Down",
      points: 10,
    },
    q4: {
      type: "radio",
      correct: "ECMP — Equal-Cost Multi-Path, balanceamento entre caminhos de custo igual",
      points: 10,
    },
    q5: {
      type: "radio",
      correct: "Aumentar o custo OSPF na interface de R1 voltada para R3",
      points: 15,
    },
    q6: {
      type: "radio",
      correct: "Custo interno de R1 até o ASBR (R4) / métrica externa, que não soma o custo interno",
      points: 10,
    },
    // Conferidos contra a captura do próprio aluno — mudam a cada sessão
    q7: {
      type: "capture",
      router: "R1",
      packetPattern: "OSPFv2, Hello",
      valuePattern: "Router-ID 2\\.2\\.2\\.2, Area (0\\.0\\.0\\.\\d+),",
      points: 15,
      hint: "Capture em R1 (eth1) ANTES de corrigir e abra um Hello vindo de 10.0.12.2: a área aparece logo depois do Router-ID.",
    },
    q8: {
      type: "capture",
      router: "R1",
      packetPattern: "LS-Update",
      blockSplit: "LSA #",
      blockPattern: "Advertising Router 1\\.1\\.1\\.1[\\s\\S]*Interface Address: 10\\.0\\.13\\.1\\s+topology default \\(0\\), metric {{preferCost}}\\b",
      valuePattern: "seq (0x[0-9a-f]+)",
      points: 15,
      hint: "Deixe a captura de R1 rodando, aplique o custo e abra o LS-Update cuja Router LSA (Advertising Router 1.1.1.1) mostra 'metric {{preferCost}}' no enlace 10.0.13.1. Copie o seq (ex.: 0x80000008).",
    },
    q9: {
      type: "keywords",
      required: ["30"],
      points: 10,
      hint: "Rode 'show ip ospf route' em R1 depois do desafio e procure 10.0.34.0/30. Some os custos das interfaces de saída pelo caminho novo.",
    },
  },

  steps: [
    {
      id: 1,
      title: "Verificar adjacências OSPF",
      theory: "OSPF forma adjacências trocando pacotes Hello entre roteadores conectados diretamente. Para a adjacência se formar, vários parâmetros precisam bater nos dois lados do link: a Area ID, a máscara de rede (em redes broadcast), o intervalo de Hello/Dead, entre outros. Quando a Area ID não bate, o roteador que recebe o Hello simplesmente descarta o pacote — não há nenhuma mensagem de erro visível, o vizinho apenas nunca aparece.\n\nNeste lab, R1 se conecta diretamente a R2 e a R3. Os dois links deveriam estar na área 0. Antes de mexer em qualquer configuração, observe o que já está funcionando e o que não está.",
      description: "Rode 'show ip ospf neighbor' em R1, R2, R3 e R4. Anote quais adjacências aparecem como Full e quais roteadores diretamente conectados simplesmente não aparecem na lista.",
      commands: [
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Vizinhos de R1" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "Vizinhos de R2" },
        { cmd: "show ip ospf neighbor", router: "R3", desc: "Vizinhos de R3" },
        { cmd: "show ip ospf neighbor", router: "R4", desc: "Vizinhos de R4" },
      ],
      expected: "R1 mostra só R3 (3.3.3.3) como Full. R2 não aparece na lista de vizinhos de R1 — nem em Init —, mesmo com o link fisicamente conectado. Do lado de R2, só R4 aparece.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar os comandos acima, quantos vizinhos você espera ver em R1 (ele está conectado diretamente a R2 e R3)? Escreva sua expectativa e o motivo.",
      },
    },
    {
      id: 2,
      title: "Ver o problema no fio (captura)",
      theory: "O 'show ip ospf neighbor' só diz que R2 não está lá — não diz por quê. Será que R2 não está mandando Hello? Ou está mandando e R1 está ignorando? A captura responde: ela mostra o que de fato chega na interface.\n\nTodo pacote OSPF carrega, no cabeçalho, o Router-ID de quem enviou e a Area ID da interface de saída. O tcpdump mostra a área 0 como 'Backbone Area' e as outras como 'Area 0.0.0.X'. Se a área do pacote não bate com a da interface que o recebeu, o pacote é descartado — mas ele aparece na captura, porque a captura vê o fio antes do OSPF decidir.",
      description: "Abra a captura em R1, interface eth1 (↔ R2), protocolo OSPF, e espere uns 20 segundos. DEIXE A CAPTURA RODANDO até o fim do passo 4 — é ela que vai registrar a correção.\n\nCompare um Hello de R1 (origem 10.0.12.1) com um Hello de R2 (origem 10.0.12.2) e encontre na árvore de campos:\n  • o Router-ID e a área de cada um\n  • o Designated Router que cada um anuncia\n  • a Neighbor List de cada um (está lá?)\n\nAnote a área que R2 está anunciando — o desafio pede esse valor exato da SUA captura.",
      capture: { router: "R1", iface: "eth1", filter: "ospf" },
      commands: [],
      expected: "Os Hellos de R2 chegam normalmente a cada 10 s, mas com 'Router-ID 2.2.2.2, Area 0.0.0.X' (X ≠ 0), enquanto os de R1 saem com 'Backbone Area'. Nenhum dos dois tem Neighbor List e cada um se anuncia como DR do segmento — um não ouve o outro.",
      predict: {
        id: "predict_capture",
        prompt: "Antes de capturar: você acha que os Hellos de R2 estão chegando em R1? Se estão, por que R1 não o lista como vizinho?",
      },
    },
    {
      id: 3,
      title: "Confirmar na configuração",
      theory: "O comando 'show ip ospf interface <nome>' mostra, entre outras coisas, a Area ID configurada localmente naquela interface, o custo OSPF, o tipo de rede e o estado (DR/BDR/DROTHER). É a confirmação do que a captura mostrou: compare a área em cada ponta do mesmo link.",
      description: "Rode 'show ip ospf interface eth1' em R1 e em R2 (as interfaces voltadas uma para a outra). Compare o campo 'Area' com o que você viu nos Hellos capturados.",
      commands: [
        { cmd: "show ip ospf interface eth1", router: "R1", desc: "Área configurada em R1" },
        { cmd: "show ip ospf interface eth1", router: "R2", desc: "Área configurada em R2" },
      ],
      expected: "Em R1 a interface está na área 0.0.0.0; em R2, na mesma área errada que aparecia nos Hellos capturados. Repare também em 'Neighbor Count is 0' nas duas pontas.",
      predict: {
        id: "predict_step2",
        prompt: "Para a adjacência funcionar, a área de R1 e a de R2 neste link deveriam ser iguais ou diferentes?",
      },
    },
    {
      id: 4,
      title: "Corrigir a área — e ver a sincronização no fio",
      theory: "O FRR não deixa reemitir 'network <prefixo> area <area>' com uma área diferente por cima de uma já existente para o mesmo prefixo — ele recusa com 'There is already same network statement'. É preciso remover a associação errada primeiro e só depois adicionar a correta. 'clear ip ospf process' reinicia as adjacências sem reiniciar o roteador.\n\nAssim que as áreas batem, a adjacência percorre os estados que você viu no Lab 13 — e cada um aparece na captura: Hello com a Neighbor List preenchida (2-Way), Database Description (ExStart/Exchange), LS-Request e LS-Update (Loading), LS-Ack, até Full.\n\nCuriosidade: enquanto estava errada, R2 tinha interfaces em duas áreas — virou um ABR por acidente e gerou Summary LSAs (Type 3). Ao corrigir, ele as retira reenviando com age 3600 (MaxAge).",
      description: "1) Confira que a captura em R1 (eth1) do passo 2 continua rodando.\n\n2) Em R2, remova a área errada e adicione a correta (substitua <área-errada> pelo valor que você encontrou):\n  configure terminal\n  router ospf\n   no network 10.0.12.0/30 area <área-errada>\n   network 10.0.12.0/30 area 0\n  end\n  clear ip ospf process\n\n3) Aguarde a adjacência (20-40 s) e, na captura, encontre:\n  • o primeiro Hello de R1 com 'Neighbor List: 2.2.2.2'\n  • os Database Description — compare as DD Flags do primeiro com as dos seguintes\n  • os LS-Request, LS-Update e LS-Ack\n  • (curiosidade) uma Summary LSA com age 3600s\n\n4) Confirme a adjacência pelos comandos abaixo.",
      capture: { router: "R1", iface: "eth1", filter: "ospf" },
      commands: [
        { cmd: "show running-config", router: "R2", desc: "Confirme a área corrigida" },
        { cmd: "show ip ospf neighbor", router: "R1", desc: "R1 deve agora mostrar R2 e R3, ambos Full" },
      ],
      expected: "R1 mostra dois vizinhos Full: 2.2.2.2 (R2) e 3.3.3.3 (R3). Na captura: Hellos dos dois lados agora com 'Backbone Area' e a Neighbor List preenchida, seguidos da troca de DBD (o primeiro com DD Flags [Init, More, Master]), LS-Request, LS-Update e LS-Ack.",
    },
    {
      id: 5,
      title: "Observar a rota externa e o ECMP",
      theory: "A rede 172.16.40.0/24 não é uma interface OSPF de verdade em R4 — é uma rota estática (para Null0) redistribuída no OSPF via 'redistribute static'. Isso faz de R4 um ASBR e transforma a rede numa rota externa (LSA Type 5, E2 na tabela). Rotas E2 têm métrica externa fixa (20 por padrão) em qualquer ponto da rede; entre dois caminhos, o desempate é o custo interno até o ASBR. Por isso o 'show ip ospf route' mostra [20/20]: custo até R4 / métrica externa.\n\nComo as interfaces do lab têm o mesmo custo (10), o custo até R4 empata em 20 por R2 e por R3, e o OSPF instala os dois caminhos ao mesmo tempo — ECMP (Equal-Cost Multi-Path). É esse desempate que o desafio vai explorar.",
      description: "Verifique a rota de R1 para 172.16.40.0/24 e observe quantos next-hops aparecem. Em 'show ip ospf route', encontre R4 marcado como ASBR e a rota E2 com [custo/métrica]. Veja a LSA Type 5 no banco de dados.\n\nAnote também como R1 alcança 10.0.34.0/30 (o enlace R3–R4) e com que custo — você vai comparar depois do desafio.",
      commands: [
        { cmd: "show ip route 172.16.40.0/24", router: "R1", desc: "Rota(s) para a rede de R4" },
        { cmd: "show ip ospf route", router: "R1", desc: "Tabela OSPF: intra-área, ASBR e externas" },
        { cmd: "show ip ospf database external", router: "R1", desc: "A LSA Type 5 originada por R4" },
      ],
      expected: "R1 mostra 172.16.40.0/24 por dois next-hops: 10.0.12.2 (R2) e 10.0.13.2 (R3). Em 'show ip ospf route': R 4.4.4.4 [20] ASBR por dois caminhos, e 'N E2 172.16.40.0/24 [20/20]'. A LSA externa tem Advertising Router 4.4.4.4, Metric Type 2, Metric 20. E 10.0.34.0/30 aparece com [20] via 10.0.13.2.",
    },
  ],

  challenge: {
    title: "Desafio: Forçar o Caminho via R2",
    description: "Objetivo: force R1 a preferir exclusivamente o caminho via R2 para alcançar 172.16.40.0/24 — sem desligar nenhum link — e capture a mudança viajando pela rede.\n\nO custo OSPF é por interface e por sentido: o que importa para a decisão de R1 é o custo das interfaces DELE MESMO (R1). Em R1, aumente o custo da interface voltada para R3 (eth2) para {{preferCost}}:\n\n1) Com a captura em R1 (eth1) rodando, aplique em R1:\n  configure terminal\n  interface eth2\n   ip ospf cost {{preferCost}}\n  end\n\n2) Na captura, encontre o LS-Update com a Router LSA de R1 (Advertising Router 1.1.1.1) e o enlace 'Interface Address: 10.0.13.1' com o custo novo. Anote o seq.\n\n3) Confirme com 'show ip route 172.16.40.0/24' em R1 que sobrou apenas um next-hop: 10.0.12.2 (via R2). Rode também 'show ip ospf route' e veja o que mais mudou.\n\nParte das respostas vem das SUAS capturas — e a nota também confere se você capturou o Hello com a área errada e o LS-Update com o custo novo.",
    hints: [
      "O comando 'ip ospf cost' é aplicado dentro do modo de configuração da interface, não dentro de 'router ospf'",
      "O custo que importa é o da interface do PRÓPRIO roteador que está decidindo o caminho (R1), não da outra ponta do link",
      "Maior custo = caminho menos atrativo no OSPF",
      "A captura para sozinha depois de 10 minutos — se ela parou, inicie de novo em R1 antes de aplicar o custo",
      "O custo novo vale para TODA rota que saía por eth2 — confira a tabela inteira",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "Por que a adjacência OSPF entre R1 e R2 não se formava mesmo com o link fisicamente conectado?",
        options: [
          "Porque o endereço IP das interfaces estava em sub-redes diferentes",
          "Porque a Area ID configurada nas duas pontas do link é diferente, e o pacote Hello com Area ID incompatível é descartado silenciosamente",
          "Porque o daemon ospfd estava desligado em R2",
          "Porque o custo da interface estava configurado como 0",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "Qual comando revela a área OSPF configurada localmente em cada interface?",
        options: [
          "show ip ospf database",
          "show ip route ospf",
          "show ip ospf interface",
          "show ip ospf summary",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "O que R1 faz quando recebe um Hello de R2 com Area ID diferente da área da interface eth1?",
        options: [
          "Responde com um Hello de erro avisando a área correta",
          "Aceita R2 como vizinho, mas fica em Init",
          "Descarta o Hello sem responder — R2 nunca entra na Neighbor List de R1 e a adjacência não sai de Down",
          "Muda a própria área para combinar com a de R2",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Depois de igualar as áreas, R1 tinha dois caminhos de mesmo custo para 172.16.40.0/24. O que isso caracteriza?",
        options: [
          "Um loop de roteamento",
          "Split horizon",
          "ECMP — Equal-Cost Multi-Path, balanceamento entre caminhos de custo igual",
          "Route flapping",
        ],
      },
      {
        id: "q5",
        type: "radio",
        text: "Para forçar R1 a preferir o caminho via R2, qual abordagem funciona?",
        options: [
          "Aumentar o custo OSPF na interface de R1 voltada para R3",
          "Aumentar o custo OSPF na interface de R2 voltada para R1",
          "Configurar Local Preference maior em R2",
          "Desligar o OSPF em R3",
        ],
      },
      {
        id: "q6",
        type: "radio",
        text: "Em 'show ip ospf route', R1 mostra 'N E2 172.16.40.0/24 [20/20]'. O que significam os dois números?",
        options: [
          "Distância administrativa / métrica",
          "Custo interno de R1 até o ASBR (R4) / métrica externa, que não soma o custo interno",
          "Número de saltos / custo total",
          "Custo via R2 / custo via R3",
        ],
      },
      {
        id: "q7",
        type: "text",
        text: "Na SUA captura em R1, antes da correção, qual Area ID aparecia nos Hellos enviados por R2? (copie da árvore de campos)",
      },
      {
        id: "q8",
        type: "text",
        text: "Qual é o número de sequência (seq) da Router LSA de R1 que levou o custo novo, na SUA captura? (ex.: 0x80000008)",
      },
      {
        id: "q9",
        type: "text",
        text: "Depois do desafio, qual o custo de R1 até 10.0.34.0/30 (o enlace R3–R4), e por qual vizinho? Por que essa rota também mudou?",
      },
    ],
  },
};

// frr_configs como template literals — {{wrongArea}} e {{preferCost}} são
// resolvidos por sessão (ver lab.variables e materializeLab em server.js).
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
 ip address 10.0.24.1/30
!
router ospf
 ospf router-id 2.2.2.2
 network 10.0.12.0/30 area {{wrongArea}}
 network 10.0.24.0/30 area 0
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
interface eth2
 ip address 10.0.34.1/30
!
router ospf
 ospf router-id 3.3.3.3
 network 10.0.13.0/30 area 0
 network 10.0.34.0/30 area 0
!
`,
  R4: `frr version 9.0
hostname R4
!
interface lo
 ip address 4.4.4.4/32
!
interface eth1
 ip address 10.0.24.2/30
!
interface eth2
 ip address 10.0.34.2/30
!
router ospf
 ospf router-id 4.4.4.4
 network 10.0.24.0/30 area 0
 network 10.0.34.0/30 area 0
 redistribute static
!
ip route 172.16.40.0/24 Null0
`,
};

module.exports = lab;
