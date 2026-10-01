/**
 * Lab 13 — OSPF Nível 1: Adjacência Básica e Tabela de Rotas
 * Primeira exposição real ao protocolo — sem falha proposital de
 * propósito (introduzir troubleshooting antes de mostrar o que é
 * "normal" seria didaticamente invertido). Foco: estados de vizinhança,
 * custo padrão, e o mecanismo básico de anunciar uma rede nova.
 */

const lab = {
  id: 13,
  protocol: "ospf",
  level: 1,
  title: "OSPF — Adjacência Básica e Tabela de Rotas",
  topic: "Primeiros Passos com OSPF",
  difficulty: "Iniciante",
  duration: "40 min",
  enabled: true,
  resourceProfile: "leve",
  daemons: {
    ospfd: true,
    bgpd: false,
  },
  scenario: "Você acabou de assumir a operação de uma rede pequena com três roteadores em sequência, rodando OSPF em área única. Antes de qualquer diagnóstico avançado ou desenho de área, o primeiro trabalho de qualquer engenheiro de rede é o mais básico: confirmar que as adjacências estão saudáveis, entender como o custo padrão é calculado, e saber como uma rede nova entra no domínio de roteamento quando a empresa expande.",
  routers: ["R1", "R2", "R3"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
  ],

  variables: {
    newNet: { pool: ["172.30.50", "172.30.60", "172.30.70", "172.30.80"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=13). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "OSPF — Fundamentos",
      subtitle: "Tudo o que você precisa saber para fazer o Lab 13",
      points: [
        "O que é um protocolo **link-state** e por que o OSPF é um deles",
        "Como dois roteadores viram vizinhos: **Hello** e os **estados da adjacência**",
        "O **banco de dados de estado de enlace (LSDB)** e as **LSAs**",
        "Como o **custo** é calculado e como o melhor caminho é escolhido",
        "Como colocar uma **rede nova** dentro do OSPF",
        "Os comandos `show` que você vai usar — e como ler cada saída",
      ],
    },
    {
      title: "Por que roteamento dinâmico?",
      points: [
        "Com **rotas estáticas**, cada rede nova exige configurar manualmente **todos** os roteadores — e nada se adapta sozinho quando um enlace cai.",
        "Com um **protocolo de roteamento dinâmico**, os roteadores trocam informações entre si e montam a tabela de rotas automaticamente.",
        "**IGP** (Interior Gateway Protocol): roteamento **dentro** de uma organização — OSPF, IS-IS, RIP.",
        "**EGP**: roteamento **entre** organizações (sistemas autônomos) — o BGP, que você verá em outra trilha.",
        "O **OSPF** (Open Shortest Path First, RFC 2328) é o IGP aberto mais usado em redes corporativas e de provedores.",
      ],
    },
    {
      title: "Link-state: cada roteador tem o mapa inteiro",
      points: [
        "**Distance-vector** (ex.: RIP): o roteador só sabe o que o vizinho conta — \"a rede X está a 3 saltos por aqui\". É como seguir placas de estrada.",
        "**Link-state** (OSPF): cada roteador descreve **os próprios enlaces** e essa descrição é distribuída para **todos** da área. Todos montam o **mesmo mapa**.",
        "Com o mapa completo, cada roteador roda sozinho o algoritmo **SPF (Dijkstra)** e calcula o caminho de menor custo até cada destino.",
        "Consequência: ao configurar algo em **um** roteador, a mudança se propaga e **todos** recalculam — sem tocar nos outros.",
      ],
      note: "Guarde esta ideia — ela é a resposta da última parte do lab.",
    },
    {
      title: "A topologia do Lab 13",
      diagram: [
        "   ┌────┐   .1  10.0.12.0/30  .2  ┌────┐   .1  10.0.23.0/30  .2  ┌────┐",
        "   │ R1 ├─eth1───────────────eth1─┤ R2 ├─eth2───────────────eth1─┤ R3 │",
        "   └────┘                         └────┘                         └────┘",
        "RID 1.1.1.1                    RID 2.2.2.2                    RID 3.3.3.3 ",
        "",
        "   ════════════════════════ ÁREA 0 (backbone) ═════════════════════════",
      ].join("\n"),
      points: [
        "Três roteadores **em cadeia**: R1 e R3 não se falam diretamente — tudo passa por **R2**.",
        "Todos estão na **área 0**, a área de backbone. Com uma única área, todos compartilham o mesmo banco de dados.",
        "O OSPF já vem configurado e funcionando: neste lab você **observa** o protocolo e depois **adiciona uma rede nova** em R3.",
      ],
    },
    {
      title: "Router ID (RID)",
      points: [
        "Cada roteador OSPF é identificado por um **Router ID** de 32 bits, escrito como um endereço IPv4.",
        "Ordem de escolha: (1) `ospf router-id` configurado → (2) maior IP de loopback → (3) maior IP de interface ativa.",
        "No lab o RID está configurado explicitamente: R1 = `1.1.1.1`, R2 = `2.2.2.2`, R3 = `3.3.3.3`.",
        "É o RID que aparece na coluna **Neighbor ID** do `show ip ospf neighbor` — **não** o IP da interface do vizinho.",
      ],
      code: "router ospf\n ospf router-id 2.2.2.2",
    },
    {
      title: "Os pacotes do OSPF",
      table: {
        head: ["Tipo", "Pacote", "Para que serve"],
        rows: [
          ["1", "Hello", "Descobre vizinhos e mantém a adjacência viva"],
          ["2", "DBD (Database Description)", "Resumo do banco de dados — \"eu conheço estas LSAs\""],
          ["3", "LSR (Link-State Request)", "\"Me manda esta LSA que eu não tenho\""],
          ["4", "LSU (Link-State Update)", "Carrega as LSAs de fato"],
          ["5", "LSAck", "Confirma o recebimento de LSAs"],
        ],
      },
      points: [
        "O OSPF roda direto sobre IP (**protocolo 89**), sem TCP/UDP.",
        "Hellos vão para o multicast `224.0.0.5` (todos os roteadores OSPF), a cada **10 s** por padrão. Sem Hello por **40 s** (dead interval), o vizinho é considerado morto.",
      ],
    },
    {
      title: "Hello: quando dois roteadores viram vizinhos",
      points: [
        "Para formar adjacência, os dois lados precisam **concordar** em:",
        "• **Área** — mesma área na interface",
        "• **Sub-rede e máscara** — mesmo segmento IP (aqui, os /30)",
        "• **Hello / Dead interval** — mesmos timers (10 s / 40 s)",
        "• **Autenticação** e **tipo de área** (ex.: stub) — iguais",
        "• **MTU** — diferenças travam a troca de banco de dados",
        "Se qualquer item diverge, a adjacência **não sobe**. Neste lab tudo está correto; o Lab 10 explora o que acontece quando não está.",
      ],
    },
    {
      title: "Os estados de uma adjacência",
      flow: ["Down", "Init", "2-Way", "ExStart", "Exchange", "Loading", "Full"],
      table: {
        head: ["Estado", "O que está acontecendo"],
        rows: [
          ["Down", "Nenhum Hello recebido do vizinho"],
          ["Init", "Recebi Hello dele, mas ele ainda não me listou — comunicação de mão única"],
          ["2-Way", "Cada um se vê no Hello do outro — bidirecional. Aqui ocorre a eleição de DR/BDR"],
          ["ExStart", "Negociam quem conduz a troca (mestre/escravo) e o número de sequência"],
          ["Exchange", "Trocam DBDs: o resumo de cada banco de dados"],
          ["Loading", "Pedem (LSR) e recebem (LSU) as LSAs que estão faltando"],
          ["Full", "Bancos de dados **sincronizados** — adjacência pronta para uso"],
        ],
      },
    },
    {
      title: "Full/DR, Full/Backup… o que é isso?",
      points: [
        "Nas interfaces Ethernet o OSPF usa, por padrão, o tipo de rede **broadcast**. Nele, cada segmento elege um **DR** (Designated Router) e um **BDR** (Backup).",
        "O DR centraliza a troca de LSAs no segmento, evitando que todos formem adjacência com todos.",
        "Por isso o estado aparece como `Full/DR` ou `Full/Backup`: a primeira parte é o **estado da adjacência**; a segunda, o **papel do vizinho** naquele segmento.",
        "O que importa neste lab é a parte **Full**. Eleição de DR/BDR em detalhe é assunto do **Lab 14**.",
      ],
    },
    {
      title: "LSDB e LSAs",
      points: [
        "Cada roteador gera uma **Router LSA (Type 1)** descrevendo seus enlaces: interfaces, redes e custo de cada uma.",
        "Em segmentos broadcast (o padrão nas interfaces Ethernet), o **DR** do segmento gera também uma **Network LSA (Type 2)** listando quem está ligado ali. Neste lab são **2**: uma por enlace /30.",
        "As LSAs são **inundadas (flooding)** para toda a área. Resultado: **todos os roteadores da área têm o mesmo LSDB**.",
        "Cada LSA é identificada pelo **Link State ID** e pelo **Advertising Router** (o RID de quem a criou), e tem um número de sequência — a versão mais nova vence.",
      ],
      code: "R2# show ip ospf database\n\n                Router Link States (Area 0.0.0.0)\nLink ID         ADV Router      Age  Seq#       CkSum  Link count\n1.1.1.1         1.1.1.1          ... ...        ...    ...\n2.2.2.2         2.2.2.2          ... ...        ...    ...\n3.3.3.3         3.3.3.3          ... ...        ...    ...\n\n                Net Link States (Area 0.0.0.0)\nLink ID         ADV Router      Age  Seq#       CkSum\n10.0.12.x       (DR do enlace R1–R2) ...      ...\n10.0.23.x       (DR do enlace R2–R3) ...      ...",
      note: "Saída resumida e ilustrativa. Na Net Link State, o Link ID é o IP da interface do DR no enlace e o ADV Router é o Router ID dele — confira no seu lab quem foi eleito.",
    },
    {
      title: "Custo e escolha do melhor caminho",
      points: [
        "Cada interface tem um **custo**. Por padrão: **custo = banda de referência ÷ banda da interface**.",
        "A banda de referência padrão é **100 Mbps**: uma interface de 10 Mbps tem custo 10; de 100 Mbps ou mais, custo 1 (o mínimo).",
        "**Neste lab**, cada interface entre roteadores tem **custo 10** (é o que o FRR aplica nesses enlaces virtuais). Confirme no `show ip ospf interface`.",
        "A **métrica** de uma rota é a **soma dos custos das interfaces de saída** ao longo do caminho até o destino. Ex.: de R1 até a rede 10.0.23.0/30 = 10 (R1→R2) + 10 (R2→R3) = **20**.",
        "O SPF escolhe o caminho de **menor métrica**. Custo menor é sempre preferido.",
        "Para ver o custo aplicado a cada interface: `show ip ospf interface` → campo **Cost**.",
      ],
      note: "Em redes reais com links de 1 e 10 Gbps, todos ficariam com custo 1 — por isso se ajusta `auto-cost reference-bandwidth`. Isso será explorado em labs posteriores.",
    },
    {
      title: "Colocando uma rede no OSPF: o comando network",
      code: "router ospf\n network 10.0.23.0/30 area 0\n network 3.3.3.3/32 area 0",
      points: [
        "`network <prefixo> area <área>` **não** anuncia o prefixo literalmente: ele **ativa o OSPF em toda interface cujo IP cai dentro do prefixo**.",
        "Com o OSPF ativo na interface, duas coisas acontecem: (1) ela passa a enviar Hellos e formar vizinhos; (2) a rede dela entra na Router LSA do roteador.",
        "Para uma **rede nova** entrar no domínio, basta configurar isso em **um** roteador que tenha uma interface nela. A LSA atualizada se espalha pela área e todos aprendem a rota.",
        "**Detalhe do FRR:** endereços de **loopback** são sempre anunciados como rota de **host /32**, mesmo que o `network` cubra um /24. Procure o /32 na tabela de rotas.",
      ],
    },
    {
      title: "Lendo o show ip ospf neighbor",
      code: "R2# show ip ospf neighbor\n\nNeighbor ID  Pri State        Up Time  Dead Time Address    Interface\n1.1.1.1        1 Full/Backup  5m10s        34.2s 10.0.12.1  eth1:10.0.12.2\n3.3.3.3        1 Full/DR      5m09s        35.8s 10.0.23.2  eth2:10.0.23.1",
      table: {
        head: ["Coluna", "Significado"],
        rows: [
          ["Neighbor ID", "Router ID do vizinho"],
          ["Pri", "Prioridade na eleição de DR (padrão 1)"],
          ["State", "Estado da adjacência / papel do vizinho no segmento"],
          ["Dead Time", "Tempo até declarar o vizinho morto se não chegar Hello"],
          ["Address", "IP da interface do vizinho no enlace"],
          ["Interface", "Interface local por onde o vizinho foi encontrado"],
        ],
      },
      note: "Saída ilustrativa (colunas resumidas) — os papéis DR/Backup podem variar no seu lab.",
    },
    {
      title: "Lendo a tabela de rotas",
      code: "R1# show ip route ospf\n\nO>* 10.0.23.0/30 [110/20] via 10.0.12.2, eth1, weight 1, 00:05:02",
      table: {
        head: ["Parte", "Significado"],
        rows: [
          ["O", "Rota aprendida via OSPF"],
          [">", "Rota selecionada como a melhor para esse prefixo"],
          ["*", "Rota instalada na tabela de encaminhamento (FIB)"],
          ["[110/20]", "Distância administrativa do OSPF (110) / métrica OSPF: 10 (R1→R2) + 10 (R2→R3) = 20"],
          ["via 10.0.12.2, eth1", "Próximo salto e interface de saída"],
        ],
      },
      note: "O tempo no fim da linha é há quanto a rota existe — vai variar no seu lab.",
    },
    {
      title: "Comandos que você vai usar",
      table: {
        head: ["Comando", "Responde à pergunta"],
        rows: [
          ["`show ip ospf neighbor`", "Com quem eu formei adjacência, e em que estado?"],
          ["`show ip ospf interface`", "Em quais interfaces o OSPF está ativo, com que custo e timers?"],
          ["`show ip ospf database`", "Que LSAs eu conheço — como é o mapa da área?"],
          ["`show ip route ospf`", "Que rotas o OSPF instalou, por onde e com que métrica?"],
          ["`show running-config`", "Como o roteador está configurado agora?"],
        ],
      },
      points: [
        "Para configurar: `configure terminal` → `router ospf` ou `interface lo` → … → `end`.",
      ],
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo e seguir o roteiro de perguntas.",
        "Você deve conseguir: mostrar e interpretar os vizinhos de R2; explicar o estado **Full**; dizer de onde vem o **custo**; descrever o **LSDB**; mostrar a configuração da rede nova e explicar por que **R1 aprendeu essa rede sem nenhuma configuração nele**.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` é o que o
  // professor espera ouvir — só aparece no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Mostre o `show ip ospf neighbor` em R2. Quantos vizinhos ele tem, em que estado estão, e por que só R2 tem dois?",
      lookFor: "Dois vizinhos, 1.1.1.1 e 3.3.3.3, ambos em Full. R2 está no meio da cadeia, ligado diretamente a R1 e a R3. Sabe que o Neighbor ID é o Router ID, não o IP da interface.",
    },
    {
      id: "e2",
      prompt: "O que significa o estado Full? Cite pelo menos dois estados anteriores e o que acontece em cada um.",
      lookFor: "Full = bancos de dados (LSDB) sincronizados. Ex.: Init = Hello recebido, mão única; 2-Way = bidirecional / eleição de DR; ExStart/Exchange = troca de DBD; Loading = pede as LSAs que faltam.",
    },
    {
      id: "e3",
      prompt: "Como o OSPF chegou ao custo das interfaces de R2? Mostre onde você viu esse valor.",
      lookFor: "Custo = banda de referência ÷ banda da interface. Aponta o campo Cost (10) no show ip ospf interface. Sabe que menor custo é preferido e que a métrica é a soma dos custos (ex.: R1 até 10.0.23.0/30 = 20).",
    },
    {
      id: "e4",
      prompt: "O que aparece no `show ip ospf database`, e por que todos os roteadores da área têm o mesmo conteúdo?",
      lookFor: "3 Router LSAs (Type 1), uma por roteador, e 2 Network LSAs (Type 2), uma por enlace /30, geradas pelo DR de cada enlace. As LSAs são inundadas para toda a área, então o LSDB é idêntico em todos — e cada um roda o SPF sobre ele.",
    },
    {
      id: "e5",
      prompt: "Mostre a configuração que você fez em R3 para a rede {{newNet}}.0/24. O que exatamente o comando `network ... area 0` faz?",
      lookFor: "ip address {{newNet}}.1/32 em interface lo; network {{newNet}}.0/24 area 0 dentro de router ospf. O network ativa o OSPF nas interfaces cujo IP cai no prefixo — não anuncia o prefixo literalmente.",
    },
    {
      id: "e6",
      prompt: "Por que R1 aprendeu a rede nova sem nenhuma configuração nele? Mostre a rota em R1 e explique cada parte da linha.",
      lookFor: "R3 atualizou sua Router LSA, que foi inundada via R2 até R1; R1 rodou o SPF. Linha O>* {{newNet}}.1/32 [110/métrica] via 10.0.12.2, eth1: O = OSPF, > = melhor, * = instalada, 110 = distância administrativa, métrica = soma dos custos. /32 porque é loopback.",
    },
  ],

  autoGrade: [
    { id: "checked_neighbors", label: "Verificou vizinhos OSPF", cmdContains: "show ip ospf neighbor" },
    { id: "checked_interface", label: "Verificou custo da interface", cmdContains: "show ip ospf interface" },
    { id: "checked_database", label: "Verificou o banco de LSAs", cmdContains: "show ip ospf database" },
    { id: "new_network_added", label: "Adicionou a rede nova em R3", cmdContains: "network {{newNet}}" },
  ],

  verifications: [
    {
      id: "ospf_full_chain",
      label: "R2 tem adjacência Full com R1 e R3 (os dois vizinhos da cadeia)",
      weight: 30,
      check: {
        router: "R2",
        cmdPattern: "show ip ospf neighbor",
        outputPattern: "(?=[\\s\\S]*1\\.1\\.1\\.1[\\s\\S]*Full)(?=[\\s\\S]*3\\.3\\.3\\.3[\\s\\S]*Full)",
      },
    },
    {
      id: "new_network_configured",
      label: "Rede nova coberta por 'network area 0' em R3",
      weight: 30,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "network {{newNet}}\\.0/24 area 0" },
    },
    {
      id: "new_network_visible_r1",
      label: "R1 (do outro lado da cadeia) já enxerga a rede nova via OSPF",
      weight: 40,
      check: { router: "R1", cmdPattern: "show ip route {{newNet}}\\.1", outputPattern: "{{newNet}}\\.1" },
    },
  ],

  answerKey: {
    predict_step1: {
      type: "keywords",
      required: ["2", "dois", "duas"],
      anyOf: true,
      points: 15,
      hint: "R2 está no meio da cadeia — conectado diretamente a R1 e a R3.",
    },
    predict_step2: {
      type: "keywords",
      required: ["sim", "propaga", "área", "area", "toda"],
      anyOf: true,
      points: 15,
      hint: "OSPF distribui informação de roteamento para todos os roteadores da mesma área — não é preciso configurar nada em R1 ou R2.",
    },
    q1: {
      type: "radio",
      correct: "Down → Init → 2-Way → ExStart → Exchange → Loading → Full",
      points: 20,
    },
    q2: {
      type: "radio",
      correct: "Full — os dois roteadores trocaram e sincronizaram completamente seus bancos de dados de estado de enlace",
      points: 20,
    },
    q3: {
      type: "radio",
      correct: "Banda de referência dividida pela banda da interface",
      points: 20,
    },
    q4: {
      type: "radio",
      correct: "Não — basta que a nova rede esteja coberta por um 'network area' em qualquer roteador da área; o OSPF propaga automaticamente",
      points: 10,
    },
  },

  steps: [
    {
      id: 1,
      title: "Verificar as adjacências da cadeia",
      theory: "Antes de uma adjacência OSPF chegar a Full (totalmente sincronizada), os dois roteadores passam por uma sequência de estados: Down (nenhum contato) → Init (Hello recebido, mas ainda não bidirecional) → 2-Way (bidirecional — nesse ponto, em redes do tipo broadcast, ocorre a eleição de DR/BDR; no FRR as interfaces Ethernet/veth são broadcast por padrão, então isso acontece mesmo num enlace com só dois roteadores) → ExStart (negociando quem começa a troca) → Exchange (trocando descrições do banco de dados) → Loading (pedindo as LSAs que faltam) → Full (sincronizado). Só em Full a adjacência está pronta para uso.\n\nNesta topologia, R1—R2—R3 formam uma cadeia simples em área única (área 0). R2 é o único roteador com dois vizinhos diretos. Na coluna State você verá algo como 'Full/DR' ou 'Full/Backup': a primeira parte é o estado da adjacência, a segunda é o papel do vizinho naquele segmento.",
      description: "Rode 'show ip ospf neighbor' nos três roteadores e confirme que todas as adjacências estão em Full.",
      commands: [
        { cmd: "show ip ospf neighbor", router: "R1", desc: "Vizinhos de R1" },
        { cmd: "show ip ospf neighbor", router: "R2", desc: "Vizinhos de R2" },
        { cmd: "show ip ospf neighbor", router: "R3", desc: "Vizinhos de R3" },
      ],
      expected: "R2 mostra dois vizinhos em Full (1.1.1.1 e 3.3.3.3), cada um com seu papel no segmento (DR ou Backup). R1 e R3 mostram um vizinho cada, também Full.",
      predict: {
        id: "predict_step1",
        prompt: "Antes de rodar o comando, quantos vizinhos Full você espera ver em R2?",
      },
    },
    {
      id: 2,
      title: "Entender o custo e o banco de dados",
      theory: "O custo OSPF de uma interface, por padrão, é calculado como (banda de referência) ÷ (banda da interface) — quanto maior a banda, menor o custo, e menor custo é sempre preferido na escolha de caminho. O comando 'show ip ospf interface' mostra o custo aplicado a cada interface — nos enlaces deste lab, 10. Já 'show ip ospf database' mostra o banco de LSAs conhecido. Numa área única você verá dois tipos: LSAs Type-1 (Router LSA), uma por roteador, cada uma descrevendo os enlaces daquele roteador; e LSAs Type-2 (Network LSA), uma por segmento broadcast, gerada pelo DR daquele segmento e listando os roteadores ligados nele.",
      description: "Rode 'show ip ospf interface' e 'show ip ospf database' em R2 e observe o custo das duas interfaces e as entradas do banco de dados.",
      commands: [
        { cmd: "show ip ospf interface", router: "R2", desc: "Custo das interfaces de R2" },
        { cmd: "show ip ospf database", router: "R2", desc: "Banco de LSAs conhecido por R2" },
        { cmd: "show ip route ospf", router: "R1", desc: "Rotas aprendidas por OSPF em R1" },
      ],
      expected: "R2 mostra custo 10 em cada interface OSPF. O banco de dados mostra 3 Router LSAs (Type-1, uma por roteador) e 2 Network LSAs (Type-2, uma por enlace /30, gerada pelo DR de cada enlace). R1 já tem rota para a rede entre R2 e R3 (10.0.23.0/30), aprendida via R2, com métrica 20 (10 + 10).",
    },
    {
      id: 3,
      title: "Anunciar uma rede nova",
      theory: "Quando a empresa cresce e uma rede nova precisa entrar no domínio OSPF, o processo é simples: qualquer roteador com uma interface (ou endereço adicional) naquela faixa adiciona um 'network <prefixo> area <área>' correspondente dentro de 'router ospf'. Não é preciso configurar nada nos outros roteadores — a informação se propaga automaticamente para toda a área através das LSAs.\n\nDetalhe importante do FRR: endereços em interface de loopback são sempre anunciados como rota de HOST (/32), não importa a máscara configurada — mesmo cobrindo com 'network .../24 area 0'. Por isso, depois de configurar, procure pelo endereço /32 específico na tabela de rotas, não pelo /24.",
      description: "Em R3, adicione um endereço adicional no loopback representando a rede nova e cubra com 'network area 0'.\n\nExemplo em R3:\n  configure terminal\n  interface lo\n   ip address {{newNet}}.1/32\n  exit\n  router ospf\n   network {{newNet}}.0/24 area 0\n  end",
      commands: [
        { cmd: "show running-config", router: "R3", desc: "Confirme a rede nova configurada" },
        { cmd: "show ip route {{newNet}}.1/32", router: "R1", desc: "Confirme que R1 já enxerga a rede nova (é uma rota /32, não /24 — loopback)" },
      ],
      expected: "R1, do outro lado da cadeia, já mostra uma rota OSPF /32 para {{newNet}}.1 — sem nenhuma configuração adicional em R1 ou R2.",
      predict: {
        id: "predict_step2",
        prompt: "Depois de configurar a rede nova só em R3, você espera que ela apareça na tabela de rotas de R1? Por quê?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Consolide os Fundamentos",
    description: "Você já confirmou as adjacências, entendeu custo e banco de dados, e anunciou uma rede nova de ponta a ponta. Este desafio consolida os conceitos fundamentais antes dos próximos labs, que vão explorar diagnóstico de falhas e engenharia de custo.",
    hints: [
      "A sequência de estados de adjacência é sempre a mesma, não importa a topologia",
      "Custo menor é sempre preferido",
      "Uma rede nova só precisa ser configurada em UM roteador da área",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "Qual é a sequência correta de estados até uma adjacência OSPF chegar a Full?",
        options: [
          "Down → Full → Init → 2-Way",
          "Down → Init → 2-Way → ExStart → Exchange → Loading → Full",
          "Init → Down → Full",
          "2-Way → Down → Init → Full",
        ],
      },
      {
        id: "q2",
        type: "radio",
        text: "O que significa uma adjacência estar em estado Full?",
        options: [
          "Que o link está com uso de banda no máximo",
          "Full — os dois roteadores trocaram e sincronizaram completamente seus bancos de dados de estado de enlace",
          "Que o roteador foi eleito DR",
          "Que a interface está desligada",
        ],
      },
      {
        id: "q3",
        type: "radio",
        text: "Como o FRR calcula o custo OSPF padrão de uma interface?",
        options: [
          "Sempre fixo em 1, independente da banda",
          "Banda de referência dividida pela banda da interface",
          "Número de saltos até o destino",
          "Baseado na prioridade da interface",
        ],
      },
      {
        id: "q4",
        type: "radio",
        text: "Para uma rede nova entrar no domínio OSPF, é preciso configurar 'network area' em todos os roteadores da área?",
        options: [
          "Sim, em todos, senão a rota não se propaga",
          "Não — basta que a nova rede esteja coberta por um 'network area' em qualquer roteador da área; o OSPF propaga automaticamente",
          "Sim, mas só nos roteadores ABR",
          "Não é possível adicionar redes novas sem reiniciar o OSPF",
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
 network 10.0.23.0/30 area 0
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
router ospf
 ospf router-id 3.3.3.3
 network 10.0.23.0/30 area 0
 network 3.3.3.3/32 area 0
!
`,
};

module.exports = lab;
