// ─── Labs metadata (frontend) ─────────────────────────────────────────────
export const LABS_META = [
  { id: 1, title: "MED e AS-Path Prepend",         difficulty: "Iniciante",    duration: "45 min", topic: "Seleção de Caminho" },
  { id: 2, title: "BGP Local Preference",           difficulty: "Iniciante",    duration: "40 min", topic: "Controle de Saída" },
  { id: 3, title: "BGP Path Control",               difficulty: "Intermediário",duration: "60 min", topic: "Filtragem Avançada" },
  { id: 4, title: "BGP Confederations",             difficulty: "Avançado",     duration: "75 min", topic: "Escalabilidade" },
  { id: 5, title: "Bestpath & Aggregate",           difficulty: "Intermediário",duration: "50 min", topic: "Agregação de Rotas" },
  { id: 6, title: "Community AS-Path & Default",    difficulty: "Intermediário",duration: "60 min", topic: "Comunidades BGP" },
  { id: 7, title: "BGP Backdoor & AS-Path Prepend", difficulty: "Avançado",     duration: "65 min", topic: "Rotas Backdoor" },
  { id: 8, title: "AS-Path Weight & Default Route", difficulty: "Intermediário",duration: "55 min", topic: "Weight e Default" },
  { id: 9, title: "Community & Route Reflector",    difficulty: "Avançado",     duration: "90 min", topic: "Route Reflector" },
  { id: 10, title: "Peer Group & Local Preference", difficulty: "Intermediário",duration: "60 min", topic: "Peer Groups" },
  { id: 11, title: "MP-BGP LP Weight Community",    difficulty: "Avançado",     duration: "80 min", topic: "MP-BGP IPv6" },
  { id: 12, title: "MP-BGP OSPFv3 & Attributes",   difficulty: "Avançado",     duration: "90 min", topic: "MP-BGP + OSPFv3" },
  { id: 13, title: "Confederation Weight & Unsuppress", difficulty: "Avançado", duration: "85 min", topic: "Confederação Avançada" },
  { id: 14, title: "BGP Conditional Advertisement", difficulty: "Avançado",     duration: "70 min", topic: "Anúncio Condicional" },
  { id: 15, title: "Route Aggregation Attribute-map", difficulty: "Avançado",   duration: "75 min", topic: "Agregação Avançada" },
  { id: 16, title: "BGP ORF Capability",            difficulty: "Avançado",     duration: "70 min", topic: "Outbound Route Filtering" },
];

export const AVAILABLE_LAB_IDS = [1, 2, 3, 4, 5, 9];

export const DIFF_STYLE = {
  "Iniciante":     { bg: "#052e16", color: "#4ade80", border: "#166534" },
  "Intermediário": { bg: "#422006", color: "#fbbf24", border: "#92400e" },
  "Avançado":      { bg: "#450a0a", color: "#f87171", border: "#7f1d1d" },
};

export const STATUS_COLOR = {
  running:      "#4ade80",
  provisioning: "#fbbf24",
  idle:         "#60a5fa",
  cleaning:     "#fb923c",
  cleaned:      "#475569",
  error:        "#f87171",
};

export const STATUS_BG = {
  running:      "#052e16",
  provisioning: "#422006",
  idle:         "#0d1f3c",
  cleaning:     "#2d1b00",
  cleaned:      "#0a0f1a",
  error:        "#450a0a",
};

// ─── Lab step-by-step guides (frontend roteiro) ────────────────────────────
export const LAB_STEPS = {
  1: [
    {
      id: 1, title: "Verificar Sessões BGP",
      description: "Confirme que todos os roteadores têm sessões BGP estabelecidas e a tabela BGP está populada.",
      commands: [
        { router: "R1", cmd: "show bgp summary",           desc: "Sessões BGP no R1" },
        { router: "R1", cmd: "show ip bgp",                desc: "Tabela BGP completa do R1" },
        { router: "R4", cmd: "show ip bgp",                desc: "Tabela BGP completa do R4" },
        { router: "R4", cmd: "show bgp summary",           desc: "Sessões BGP no R4" },
      ],
      expected: "Sessões no estado 'Established'. R4 deve ver prefixos 150.1.1.0/24, 150.2.2.0/24 e 150.3.3.0/24",
    },
    {
      id: 2, title: "Configurar AS-Path Prepend no R1",
      description: "Configure R1 para anunciar prefixos com AS-PATH mais longo em direção ao R4, fazendo R4 preferir o caminho via R3.",
      commands: [
        { router: "R1", cmd: "conf t\nroute-map PREP permit 10\n set as-path prepend 1 1 1 1\n!\nrouter bgp 1\n neighbor 4.4.4.4 route-map PREP out\nend", desc: "Configura AS-Path Prepend no R1" },
        { router: "R1", cmd: "clear bgp * soft out",       desc: "Aplica política sem derrubar sessões" },
        { router: "R4", cmd: "show ip bgp",                desc: "Verifica nova preferência de caminho no R4" },
        { router: "R1", cmd: "show ip bgp neighbors 4.4.4.4 advertised-routes", desc: "Confirma prepend sendo anunciado" },
      ],
      expected: "R4 mostra prefixos 150.2.2.0 e 150.3.3.0 com next-hop via R3 (3.3.3.3) como melhor caminho (marcado com >)",
    },
    {
      id: 3, title: "Configurar MED",
      description: "Configure R4→R3 com MED=4 e R2→R3 com MED=2. Habilite always-compare-med no R3 para comparar MEDs entre ASes diferentes.",
      commands: [
        { router: "R4", cmd: "conf t\nroute-map SET-MED permit 10\n set metric 4\n!\nrouter bgp 4\n address-family ipv4 unicast\n  neighbor 3.3.3.3 route-map SET-MED out\n end\nend", desc: "Configura MED=4 no R4 para R3" },
        { router: "R2", cmd: "conf t\nroute-map SET-MED permit 10\n set metric 2\n!\nrouter bgp 2\n address-family ipv4 unicast\n  neighbor 3.3.3.3 route-map SET-MED out\n end\nend", desc: "Configura MED=2 no R2 para R3" },
        { router: "R4", cmd: "clear bgp * soft out",       desc: "Aplica política do R4" },
        { router: "R2", cmd: "clear bgp * soft out",       desc: "Aplica política do R2" },
        { router: "R3", cmd: "conf t\nrouter bgp 3\n bgp always-compare-med\n bgp bestpath as-path ignore\nend", desc: "Habilita always-compare-med no R3" },
        { router: "R3", cmd: "show ip bgp 150.1.1.0/24",  desc: "Verifica que R3 prefere caminho via R2 (MED=2)" },
        { router: "R3", cmd: "show ip bgp",                desc: "Verifica tabela completa do R3" },
      ],
      expected: "R3 deve preferir todos os caminhos via R2 (MED=2, valor menor é melhor). Observe o '>' na coluna de status.",
    },
    {
      id: 4, title: "Captura de Pacotes BGP",
      description: "Capture mensagens BGP UPDATE e observe os atributos MED e AS-PATH nos pacotes.",
      commands: [
        { router: "R2", cmd: "do debug bgp updates",       desc: "Ativa debug de updates BGP" },
        { router: "R2", cmd: "clear bgp 3.3.3.3 soft out", desc: "Força reenvio de updates" },
        { router: "R2", cmd: "no debug all",               desc: "Desativa debug" },
        { router: "R3", cmd: "show ip bgp neighbors 2.2.2.2 received-routes", desc: "Ver rotas recebidas com atributos" },
      ],
      expected: "Log de debug mostra mensagens UPDATE com atributo MULTI_EXIT_DISC (MED=2) e AS_PATH nos anúncios",
    },
  ],

  2: [
    {
      id: 1, title: "Verificar iBGP e eBGP",
      description: "Confirme as sessões iBGP (R1-R2 dentro do AS1) e eBGP (para AS externos).",
      commands: [
        { router: "R1", cmd: "show bgp summary",           desc: "Sessões no R1 (AS1)" },
        { router: "R2", cmd: "show bgp summary",           desc: "Sessões no R2 (AS1)" },
        { router: "R1", cmd: "show ip bgp",                desc: "Tabela BGP do R1 — observe Local Pref padrão (100)" },
      ],
      expected: "Sessões iBGP R1-R2 e eBGP para externos estabelecidas. Local Preference padrão = 100",
    },
    {
      id: 2, title: "Configurar Local Preference",
      description: "Configure R2 para definir Local Preference=200 nas rotas recebidas de AS externo, fazendo R1 preferir o caminho via R2.",
      commands: [
        { router: "R2", cmd: "conf t\nroute-map SET-LP permit 10\n set local-preference 200\n!\nrouter bgp 1\n address-family ipv4 unicast\n  neighbor 30.0.0.1 route-map SET-LP in\n end\nend", desc: "Configura Local Preference=200 nas rotas de AS externo" },
        { router: "R2", cmd: "clear bgp * soft in",        desc: "Aplica política de entrada" },
        { router: "R1", cmd: "show ip bgp",                desc: "R1 deve mostrar LP=200 para rotas via R2" },
        { router: "R1", cmd: "show ip bgp 30.30.0.0/24",  desc: "Detalhe da rota — confirma LP=200" },
      ],
      expected: "R1 mostra Local Preference=200 para rotas recebidas via R2. Essas rotas são preferidas (marcadas com >).",
    },
    {
      id: 3, title: "Verificar Propagação iBGP",
      description: "Confirme que o Local Preference é propagado via iBGP e que R1 toma a decisão correta.",
      commands: [
        { router: "R1", cmd: "show ip bgp neighbors 10.0.0.2 received-routes", desc: "Rotas recebidas de R2 via iBGP" },
        { router: "R1", cmd: "show ip route",              desc: "Tabela de roteamento do R1" },
      ],
      expected: "R1 usa caminho via R2 para destinos externos. LP=200 propagado corretamente via iBGP.",
    },
  ],

  4: [
    {
      id: 1, title: "Verificar Confederação",
      description: "Confirme as sessões de confederação entre sub-ASes (65001 e 65002) dentro da confederação AS100.",
      commands: [
        { router: "R1", cmd: "show bgp summary",           desc: "Sessões do R1 (sub-AS 65001)" },
        { router: "R2", cmd: "show bgp summary",           desc: "Sessões do R2 (sub-AS 65001)" },
        { router: "R3", cmd: "show bgp summary",           desc: "Sessões do R3 (sub-AS 65002)" },
        { router: "R4", cmd: "show ip bgp",                desc: "Tabela BGP dentro da confederação" },
      ],
      expected: "Sessões entre sub-ASes estabelecidas. R4 vê rotas de todos os roteadores da confederação.",
    },
    {
      id: 2, title: "Verificar AS-PATH Externo",
      description: "Confirme que R5 (AS externo) vê AS-PATH limpo, sem os sub-ASes privados 65001/65002.",
      commands: [
        { router: "R5", cmd: "show ip bgp",                desc: "Tabela do R5 — deve ver AS100, não sub-ASes" },
        { router: "R5", cmd: "show ip bgp 4.4.4.0/24",    desc: "Detalhe da rota — AS-PATH deve ser somente '100'" },
        { router: "R5", cmd: "show ip bgp 1.1.1.0/24",    desc: "Outra rota para confirmar" },
      ],
      expected: "R5 mostra AS-PATH como '100' apenas. Sub-ASes privados 65001/65002 NÃO aparecem.",
    },
    {
      id: 3, title: "Inspecionar AS_CONFED_SEQUENCE",
      description: "Dentro da confederação, o AS-PATH contém AS_CONFED_SEQUENCE. Observe isso em R3 recebendo rotas de R2.",
      commands: [
        { router: "R3", cmd: "show ip bgp 1.1.1.0/24",    desc: "Rota de R1 — note AS_CONFED no path" },
        { router: "R3", cmd: "show ip bgp neighbors 2.2.2.2 received-routes", desc: "Rotas recebidas com AS_CONFED_SEQUENCE" },
        { router: "R4", cmd: "show ip bgp 5.5.5.0/24",    desc: "Rota de R5 — caminho completo" },
      ],
      expected: "R3 mostra AS_CONFED_SEQUENCE nos paths internos. R4 vê a rota de R5 passando pelo caminho correto.",
    },
  ],

  9: [
    {
      id: 1, title: "Verificar Route Reflector",
      description: "Confirme que RR reflete rotas entre R1 e R2 sem sessão direta entre eles.",
      commands: [
        { router: "RR", cmd: "show bgp summary",           desc: "Sessões do RR com clientes R1 e R2" },
        { router: "R1", cmd: "show bgp summary",           desc: "R1 só deve ter sessão com RR (não com R2)" },
        { router: "R1", cmd: "show ip bgp",                desc: "R1 deve ver rotas de R2 via reflexão" },
      ],
      expected: "R1 e R2 se comunicam via RR sem sessão iBGP direta. RR reflete rotas entre os clientes.",
    },
    {
      id: 2, title: "Configurar BGP Community",
      description: "Use communities para marcar e classificar rotas de acordo com sua origem.",
      commands: [
        { router: "R1", cmd: "conf t\nroute-map TAG-COMMUNITY permit 10\n set community 1:100\n!\nrouter bgp 1\n address-family ipv4 unicast\n  neighbor 20.0.0.1 route-map TAG-COMMUNITY in\n end\nend", desc: "Taga rotas de AS2 com community 1:100" },
        { router: "R1", cmd: "clear bgp * soft in",        desc: "Aplica política" },
        { router: "R1", cmd: "show ip bgp community 1:100", desc: "Filtra tabela por community" },
        { router: "R2", cmd: "show ip bgp community 1:100", desc: "R2 deve ver communities via RR" },
      ],
      expected: "Rotas de AS2 marcadas com community 1:100, visíveis em R1 e R2 via reflexão pelo RR.",
    },
    {
      id: 3, title: "Usar no-export Community",
      description: "Aplique a well-known community 'no-export' para controlar propagação de rotas privadas.",
      commands: [
        { router: "R1", cmd: "conf t\nip prefix-list PRIVADO seq 10 permit 192.168.0.0/16 le 24\n!\nroute-map NO-EXP permit 10\n match ip address prefix-list PRIVADO\n set community no-export\n!\nroute-map NO-EXP permit 20\n!\nrouter bgp 1\n address-family ipv4 unicast\n  neighbor 20.0.0.1 route-map NO-EXP in\n end\nend", desc: "Aplica no-export a redes privadas" },
        { router: "R1", cmd: "clear bgp * soft in",        desc: "Aplica política" },
        { router: "R2", cmd: "show ip bgp 192.168.0.0",   desc: "Confirma community no-export" },
      ],
      expected: "Rotas com community no-export NÃO são anunciadas para peers eBGP externos.",
    },
  ],
};

// ─── Challenge definitions ─────────────────────────────────────────────────
export const LAB_CHALLENGES = {
  1: {
    title: "Desafio: Engenharia de Tráfego Completa",
    description: `Configure a topologia para que:

1. R4 prefira o caminho via R3 para alcançar 150.2.2.0/24
2. R1 prefira R4 para alcançar 150.3.3.0/24 (use Local Preference ou Weight)
3. R3 prefira R2 com base no MED, mesmo quando o AS-PATH é mais longo

Documente cada decisão e os comandos utilizados.`,
    hints: [
      "Ordem de decisão BGP: Weight > Local Preference > Locally originated > AS-PATH length > Origin > MED > eBGP vs iBGP > IGP metric > Router-ID",
      "MED só é comparado entre rotas do mesmo AS vizinho por padrão — use 'bgp always-compare-med' para mudar",
      "Use 'clear bgp * soft' após cada alteração de política para aplicar sem derrubar sessões",
      "'bgp bestpath as-path ignore' faz o BGP ignorar o comprimento do AS-PATH na decisão",
    ],
    questions: [
      { id: "q1", type: "text",  text: "Qual o comando que você usou para configurar AS-Path Prepend no R1? Cole o bloco de configuração.", placeholder: "route-map PREP permit 10\n set as-path prepend 1 1 1 1\n..." },
      { id: "q2", type: "text",  text: "Por que o MED sozinho não funcionou inicialmente para R3 comparar rotas de R2 e R4? Explique o problema e a solução.", placeholder: "Explique o comportamento padrão do MED e os dois problemas encontrados..." },
      { id: "q3", type: "radio", text: "Qual atributo BGP tem MAIOR precedência na seleção do melhor caminho?", options: ["MED", "AS-PATH length", "Weight", "Local Preference"] },
      { id: "q4", type: "text",  text: "O que o comando 'bgp bestpath as-path ignore' faz exatamente?", placeholder: "Descreva o efeito na ordem de decisão BGP..." },
      { id: "q5", type: "radio", text: "Conseguiu completar os 3 requisitos do desafio?", options: ["Sim, todos (3/3)", "Parcialmente (2/3)", "Parcialmente (1/3)", "Não consegui"] },
    ],
    answerKey: { q3: "Weight" },
  },

  2: {
    title: "Desafio: Política de Saída Assimétrica",
    description: `Configure o AS1 para que:

1. Todo tráfego destinado ao AS2 (30.0.0.0/8) saia pelo R1
2. Todo tráfego destinado ao AS3 (20.0.0.0/8) saia pelo R2
3. Use APENAS Local Preference (não MED, não AS-Path Prepend)

Explique por que Local Preference é o atributo correto para este objetivo.`,
    hints: [
      "Local Preference é propagado pelo iBGP e afeta decisões de saída dentro do mesmo AS",
      "Configure route-maps diferentes em R1 e R2 para os diferentes vizinhos eBGP",
      "Maior Local Preference = caminho preferido (padrão = 100)",
      "Para fazer R1 preferir sair direto: configure LP alto na sessão eBGP do R1; para R2 preferir sair direto: configure LP alto na sessão eBGP do R2",
    ],
    questions: [
      { id: "q1", type: "radio", text: "Qual o valor padrão de Local Preference no FRR/Cisco IOS?", options: ["0", "100", "200", "1000"] },
      { id: "q2", type: "text",  text: "Por que Local Preference funciona para controlar tráfego de saída do AS?", placeholder: "Explique o escopo de propagação (iBGP) e como isso influencia a decisão..." },
      { id: "q3", type: "text",  text: "Cole o output de 'show ip bgp' no R1 após sua configuração:", placeholder: "Coloque o output completo aqui..." },
      { id: "q4", type: "text",  text: "Qual seria a diferença se você usasse MED ao invés de Local Preference para este objetivo?", placeholder: "Explique por que MED não funcionaria da mesma forma..." },
      { id: "q5", type: "radio", text: "Ambos os caminhos (R1→AS2, R2→AS3) funcionando corretamente?", options: ["Sim (2/2)", "Parcialmente (1/2)", "Não consegui"] },
    ],
    answerKey: { q1: "100" },
  },

  4: {
    title: "Desafio: Expandir a Confederação",
    description: `Com a confederação AS100 (sub-ASes 65001 e 65002) funcionando:

1. Adicione mentalmente um sub-AS 65003 com R6 — quais configurações seriam necessárias?
2. Configure um Route Reflector dentro do sub-AS 65002 (R3 como RR, R4 como cliente)
3. Garanta que R5 (AS externo) NUNCA veja sub-ASes privados no AS-PATH
4. Capture e documente o AS_CONFED_SEQUENCE visível dentro da confederação`,
    hints: [
      "bgp confederation peers deve listar TODOS os sub-ASes vizinhos em cada roteador",
      "Route Reflector dentro de sub-AS: neighbor X route-reflector-client",
      "Sub-ASes privados (65001-65002) são removidos automaticamente dos anúncios externos — isso é comportamento padrão do BGP",
      "Para adicionar sub-AS 65003: todos os roteadores de todos os sub-ASes que precisam se comunicar precisam ter o novo sub-AS na lista de confederation peers",
    ],
    questions: [
      { id: "q1", type: "radio", text: "Quantas sessões iBGP seriam necessárias para 50 roteadores SEM Route Reflector nem Confederação?", options: ["49", "100", "1225", "2500"] },
      { id: "q2", type: "text",  text: "Qual atributo especial aparece no AS-PATH dentro de uma confederação (entre sub-ASes)?", placeholder: "Nome do atributo e tipo de número..." },
      { id: "q3", type: "text",  text: "O R5 (externo) viu sub-ASes no AS-PATH? Cole o output e explique por que.", placeholder: "Output de show ip bgp + explicação..." },
      { id: "q4", type: "text",  text: "Liste os comandos necessários para adicionar sub-AS 65003 à confederação (considere que R2 e R3 precisam se conectar ao novo sub-AS).", placeholder: "bgp confederation peers 65003\n..." },
    ],
    answerKey: { q1: "1225" },
  },

  9: {
    title: "Desafio: Sistema de Comunidades de ISP",
    description: `Simule um ambiente de ISP com sistema de comunidades hierárquico:

1. Community 1:10 = rotas de clientes (anunciar para todos)
2. Community 1:20 = rotas de peers (NÃO anunciar para outros peers)
3. Community 1:30 = rotas de upstream (NÃO anunciar para upstream)

Implemente as políticas com route-maps + community-lists.`,
    hints: [
      "Use 'ip community-list standard NOME permit 1:10' para definir listas de communities",
      "Use 'match community NOME' em route-maps para filtrar por community",
      "Combine permit/deny na community-list com actions no route-map",
      "Um RR reflete rotas de clientes para outros clientes E para non-clients",
    ],
    questions: [
      { id: "q1", type: "text",  text: "Qual a diferença entre um route-reflector-client e um non-client no comportamento de propagação do RR?", placeholder: "Explique as regras de reflexão para cada caso..." },
      { id: "q2", type: "radio", text: "Quando um RR recebe uma rota de um non-client, para quem ele a anuncia?", options: ["Só para clients", "Só para outros non-clients", "Para clients E non-clients", "Não anuncia"] },
      { id: "q3", type: "text",  text: "Cole o comando de configuração da community-list e do route-map para implementar a política de peers (1:20):", placeholder: "ip community-list...\nroute-map...\n" },
      { id: "q4", type: "radio", text: "O sistema de comunidades funcionou (3 tipos)?", options: ["Sim, completo (3/3)", "Parcial (2/3)", "Parcial (1/3)", "Não consegui"] },
    ],
    answerKey: { q2: "Para clients E non-clients" },
  },
};
