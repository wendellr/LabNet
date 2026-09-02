/**
 * Lab 0 — Bem-vindo ao LabNet
 * Demonstração/orientação para o professor apresentar em aula: não é um
 * lab de avaliação técnica (topologia mínima, determinística, sem falha
 * proposital nem aleatorização), é um tour guiado pela plataforma.
 */

const lab = {
  id: 0,
  protocol: "bgp",
  scenario: "Este lab não representa um cenário de rede real — é um tour guiado pela própria plataforma, pensado para o professor apresentar em aula antes da turma começar os labs de verdade. A sessão eBGP entre R1 e R2 é só um pano de fundo simples e rápido de convergir para você praticar a navegação entre as abas.",
  title: "Lab 0 — Bem-vindo ao LabNet",
  topic: "Como Usar a Plataforma",
  difficulty: "Demonstração",
  duration: "15 min",
  enabled: true,
  resourceProfile: "leve",
  routers: ["R1", "R2"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
  ],

  autoGrade: [
    { id: "checked_bgp", label: "Verificou a sessão BGP", cmdContains: "show bgp summary" },
    { id: "checked_route", label: "Verificou a tabela de rotas", cmdContains: "show ip route" },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessão eBGP estabelecida entre R1 e R2",
      weight: 100,
      check: { router: "R1", cmdPattern: "show bgp summary", outputPattern: "10\\.0\\.0\\.2\\s+4\\s+200[\\s\\S]*Established" },
    },
  ],

  answerKey: {
    q1: { type: "radio", correct: "Topologia", points: 20 },
    q2: { type: "radio", correct: "Terminal", points: 20 },
    q3: { type: "radio", correct: "Wireshark", points: 20 },
    q4: { type: "radio", correct: "No Painel do Professor, aba Sessões", points: 20 },
    q5: { type: "radio", correct: "Verificações técnicas re-executadas contra o estado real dos roteadores, mais as respostas do desafio", points: 20 },
  },

  steps: [
    {
      id: 1,
      title: "Bem-vindo ao LabNet",
      theory: "O LabNet é dividido em abas: 📋 Roteiro (onde você está agora — teoria, passo a passo e comandos sugeridos), 🌐 Topologia (diagrama da rede desta sessão), 💻 Terminal (acesso real via vtysh aos roteadores FRR), 🏆 Desafio (questões finais e envio da nota) e 🔬 Wireshark (análise de pacotes reais capturados dos roteadores). Cada aluno recebe sua própria topologia isolada — o que você configurar aqui não afeta ninguém mais.\n\nEste lab de boas-vindas usa dois roteadores (R1 e R2) em uma sessão eBGP simples, só para você praticar a navegação pela plataforma antes dos labs de verdade.",
      description: "Vá até a aba 💻 Terminal, conecte no roteador R1 e rode 'show bgp summary' para ver a sessão BGP com R2.",
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "Sessões BGP de R1" },
      ],
      expected: "R1 deve mostrar o vizinho 10.0.0.2 (R2, AS 200) com estado 'Established'.",
    },
    {
      id: 2,
      title: "Usando o terminal (vtysh)",
      theory: "O terminal do LabNet conecta direto no vtysh de cada roteador FRR — é o mesmo shell que você usaria administrando um roteador de verdade. Os comandos 'show' não alteram nada, são seguros para explorar. Comandos de configuração começam com 'configure terminal'. O histórico de comandos de cada aluno fica registrado e visível para o professor em tempo real.",
      description: "Ainda em R1, rode 'show ip route' para ver a tabela de rotas, e 'show ip bgp' para ver a tabela BGP completa.",
      commands: [
        { cmd: "show ip route", router: "R1", desc: "Tabela de rotas de R1" },
        { cmd: "show ip bgp", router: "R1", desc: "Tabela BGP de R1" },
      ],
      expected: "R1 deve mostrar a rota 10.20.0.0/24 aprendida via BGP do R2, com next-hop 10.0.0.2.",
    },
    {
      id: 3,
      title: "Topologia e Análise de Pacotes",
      theory: "A aba 🌐 Topologia mostra um diagrama automático desta sessão — passe o mouse sobre cada roteador para ver AS, Router-ID e vizinhos. A aba 🔬 Wireshark deixa você capturar e decodificar mensagens reais do protocolo (BGP ou OSPF, dependendo do lab) em um estilo parecido com o Wireshark de verdade, sem precisar instalar nada.",
      description: "Explore a aba Topologia (veja R1 e R2 conectados) e depois a aba Wireshark (capture 'show bgp summary' em R1 e veja o pacote decodificado).",
      commands: [
        { cmd: "show ip bgp neighbors", router: "R1", desc: "Detalhes do vizinho BGP" },
      ],
      expected: "Na aba Wireshark, ao capturar, você deve ver uma entrada do tipo OPEN com a sessão Established.",
    },
  ],

  challenge: {
    title: "Desafio: Confirme que Você Conhece a Plataforma",
    description: "Este desafio é só para você (e a turma) praticarem o fluxo completo: responder as questões e enviar. Depois de enviar, você verá sua nota, o feedback e as verificações técnicas — exatamente como vai funcionar nos labs de verdade a partir daqui.",
    hints: [
      "Todas as respostas estão no que você acabou de explorar nas abas",
      "Não existe pegadinha aqui — é só para praticar o fluxo de envio",
    ],
    questions: [
      {
        id: "q1",
        type: "radio",
        text: "Qual aba mostra o diagrama da topologia da sua sessão?",
        options: ["Roteiro", "Topologia", "Terminal", "Desafio"],
      },
      {
        id: "q2",
        type: "radio",
        text: "Qual aba te dá acesso direto ao vtysh dos roteadores?",
        options: ["Wireshark", "Topologia", "Terminal", "Roteiro"],
      },
      {
        id: "q3",
        type: "radio",
        text: "Qual aba decodifica mensagens do protocolo em um estilo parecido com um analisador de pacotes?",
        options: ["Terminal", "Desafio", "Roteiro", "Wireshark"],
      },
      {
        id: "q4",
        type: "radio",
        text: "Onde o professor acompanha o progresso e o histórico de comandos de cada aluno em tempo real?",
        options: [
          "Não é possível acompanhar em tempo real",
          "No Painel do Professor, aba Sessões",
          "Só depois que o aluno envia o desafio",
          "Por e-mail a cada comando executado",
        ],
      },
      {
        id: "q5",
        type: "radio",
        text: "Como a nota final de um lab é calculada?",
        options: [
          "Só pelas respostas do desafio",
          "Só pelo tempo que o aluno levou",
          "Verificações técnicas re-executadas contra o estado real dos roteadores, mais as respostas do desafio",
          "É sempre 100, para todo mundo",
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
 ip address 10.0.0.1/30
!
router bgp 100
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 neighbor 10.0.0.2 remote-as 200
 !
 address-family ipv4 unicast
  network 10.10.0.0/24
  neighbor 10.0.0.2 activate
 exit-address-family
!
ip route 10.10.0.0/24 Null0
`,
  R2: `frr version 9.0
hostname R2
!
interface lo
 ip address 2.2.2.2/32
!
interface eth1
 ip address 10.0.0.2/30
!
router bgp 200
 bgp router-id 2.2.2.2
 no bgp ebgp-requires-policy
 neighbor 10.0.0.1 remote-as 100
 !
 address-family ipv4 unicast
  network 10.20.0.0/24
  neighbor 10.0.0.1 activate
 exit-address-family
!
ip route 10.20.0.0/24 Null0
`,
};

module.exports = lab;
