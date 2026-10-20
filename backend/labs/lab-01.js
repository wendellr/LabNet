/**
 * Lab 1 — Introdução ao BGP: MED e AS-Path Prepend (BGP Nível 1)
 * Topic: Sessões BGP e Atributos de Seleção de Caminho
 * Difficulty: Iniciante
 * Duration: 60 min
 *
 * Validado com containerlab + tcpdump (FRR 10.5). O que a validação mudou:
 *
 * - O MED menor fica em R4 (o caminho que PERDE o desempate por Router ID).
 *   Com o MED menor em R2 nada mudava de lugar: o aluno não via o MED
 *   funcionar, só a palavra trocar de "Router ID" para "MED".
 * - R3 sobe com `bgp bestpath compare-routerid`. Sem ele o FRR prefere o
 *   caminho eBGP MAIS ANTIGO antes do Router ID, e o "melhor" caminho passa
 *   a depender de qual UPDATE chegou primeiro — não é reproduzível.
 * - `always-compare-med` SOZINHO já faz o MED decidir (os dois caminhos têm
 *   AS-PATH de mesmo tamanho). O roteiro antigo dizia que também era preciso
 *   `as-path ignore`: falso nesta topologia. Pior: `as-path ignore` manda
 *   150.2.2.0/24 por 3 saltos via R4 em vez do vizinho direto R2. Virou o
 *   passo 6, uma armadilha para o aluno ver e desfazer.
 * - O prepend de R1 vence o MED: o AS-PATH (critério 4) vem antes do MED
 *   (critério 6). R4 passa a preferir R3 e R3 volta ao caminho via R2, mesmo
 *   com o MED de R4 menor — R4 não reanuncia a R3 uma rota que já contém AS3.
 * - Desafio: o gabarito antigo mandava aplicar o prepend "no R3 para o
 *   vizinho 1.1.1.1", que não é vizinho de R3. Correto: R3 → 2.2.2.2.
 */

// Dentro de um mesmo UPDATE (um pacote traz vários): não atravessa para o seguinte
const UPD_NT = "(?:(?!Update Message)[\\s\\S])*?";

module.exports = {
  id: 1,
  protocol: "bgp",
  level: 1,
  scenario: "Sua empresa é multihomed — tem duas conexões com provedores diferentes para o mesmo destino. O time de rede quer influenciar por qual link o TRÁFEGO DE ENTRADA chega, sem controlar os roteadores dos provedores diretamente: MED sugere ao vizinho qual caminho prefere que ele use para te alcançar, e AS-Path Prepend torna um caminho artificialmente mais longo aos olhos de quem decide de fora. Antes de mexer em política, você vai ver uma sessão BGP subir no fio e entender por que o roteador escolhe cada caminho.",
  title: "Introdução ao BGP: MED e AS-Path Prepend",
  topic: "Sessões BGP e Atributos de Seleção de Caminho",
  difficulty: "Iniciante",
  duration: "60 min",
  resourceProfile: "leve",
  routers: ["R1", "R2", "R3", "R4"],
  links: [
    ["R1", "eth1", "R2", "eth1"],
    ["R2", "eth2", "R3", "eth1"],
    ["R3", "eth2", "R4", "eth1"],
    ["R1", "eth2", "R4", "eth2"],
  ],

  variables: {
    // sempre >= 3 repetições: o caminho via R3 já tem 3 hops (3 2 1), então
    // prepend de só 1-2 cópias empataria em comprimento em vez de perder —
    // precisa estritamente mais longo pra R4 preferir R3 de forma inequívoca.
    prependArg: { pool: ["1 1 1", "1 1 1 1", "1 1 1 1 1"] },
    // MED menor (R4) e maior (R2): "medPreferred" sempre < "medOther"
    medPreferred: { pool: ["2", "5", "8", "3"] },
    medOther: { pool: ["20", "25", "30", "40"] },
  },

  // Teoria em slides — aba "📖 Teoria" do aluno e link público na tela
  // inicial (?teoria=1). Inline: `código` e **negrito**.
  theorySlides: [
    {
      title: "BGP — Introdução e Seleção de Caminho",
      subtitle: "Tudo o que você precisa para fazer o Lab 1",
      points: [
        "Para que serve o **BGP** e como ele difere de um IGP como o OSPF",
        "**Sistemas Autônomos** e números de AS",
        "**eBGP × iBGP** e como a sessão sobe (TCP 179)",
        "As **mensagens** do BGP e os **estados** da sessão — vistos no fio",
        "Como o BGP **escolhe o melhor caminho** — e o que o FRR escreve sobre isso",
        "**MED** e **AS-Path Prepend**: influenciando por onde o tráfego entra",
      ],
      note: "Este é o primeiro lab de BGP: nenhum conhecimento prévio do protocolo é exigido.",
    },
    {
      title: "O que é o BGP",
      points: [
        "**Border Gateway Protocol** — o protocolo que interliga as redes da **internet**. É o que faz a sua operadora, uma universidade e o Google se alcançarem.",
        "É um protocolo de **vetor de caminho** (path vector): cada rota carrega a **lista de ASes** por onde passou (o **AS-PATH**).",
        "Um IGP como o OSPF busca o **caminho mais rápido** dentro de uma rede. O BGP busca o caminho que obedece à **política** de cada organização — preço, contrato, preferência.",
        "Por isso o BGP tem **muitos atributos** e pouca automação: quem decide é o operador.",
        "Roda sobre **TCP porta 179**, e cada vizinho é configurado **à mão** (não há descoberta automática como o Hello do OSPF).",
      ],
    },
    {
      title: "Sistemas Autônomos (AS)",
      points: [
        "Um **AS** é um conjunto de redes sob a **mesma administração e política de roteamento** — uma operadora, uma universidade, uma empresa grande.",
        "Cada AS tem um número, o **ASN**. Os **ASNs privados** são 64512–65534 (e 4200000000–4294967294); os demais são atribuídos pelos RIRs (no Brasil, o LACNIC).",
        "Cada AS **origina** seus prefixos (ex.: `150.1.1.0/24`) e os anuncia aos vizinhos.",
        "Neste lab, **cada roteador é um AS**: R1=AS1, R2=AS2, R3=AS3, R4=AS4.",
      ],
    },
    {
      title: "A topologia do Lab 1",
      diagram: [
        "         10.0.0.0/30",
        "  ┌────┐ .1        .2 ┌────┐",
        "  │ R1 ├─eth1────eth1─┤ R2 │",
        "  │AS 1│              │AS 2│",
        "  └─┬──┘              └─┬──┘",
        "eth2│ .5                │ .9 eth2",
        "    │ 10.0.0.4/30       │ 10.0.0.8/30",
        "eth2│ .6                │ .10 eth1",
        "  ┌─┴──┐              ┌─┴──┐",
        "  │ R4 ├─eth1────eth2─┤ R3 │",
        "  │AS 4│  10.0.0.12/30│AS 3│",
        "  └────┘              └────┘",
      ].join("\n"),
      points: [
        "Quatro ASes em **anel**, cada um anunciando um prefixo `/24`: R1 → `150.1.1.0/24`, R2 → `150.2.2.0/24`, e assim por diante.",
        "R3 alcança `150.1.1.0/24` por **dois caminhos**: via R2 (AS2 → AS1) e via R4 (AS4 → AS1).",
        "Quem escolhe entre eles é o **processo de seleção de melhor caminho** — o assunto do lab.",
      ],
    },
    {
      title: "eBGP × iBGP",
      table: {
        head: ["", "eBGP", "iBGP"],
        rows: [
          ["Vizinhos em", "ASes **diferentes**", "**Mesmo** AS"],
          ["AS-PATH", "O AS **é acrescentado** ao anunciar", "**Não** é alterado"],
          ["TTL padrão", "**1** (vizinho diretamente conectado)", "255"],
          ["Preferência", "eBGP **vence** iBGP (critério 7)", "—"],
        ],
      },
      points: [
        "Neste lab **todas as sessões são eBGP** (cada roteador tem AS próprio).",
        "As sessões usam os **loopbacks** (`update-source lo`). Como o vizinho não está a 1 salto, é preciso `ebgp-multihop 2` e uma rota estática até o loopback do vizinho.",
        "Um `remote-as` errado impede a sessão de subir: o OPEN é recusado.",
      ],
    },
    {
      title: "Mensagens e estados da sessão",
      table: {
        head: ["Mensagem", "Função"],
        rows: [
          ["**OPEN**", "Abre a sessão: troca ASN, Router ID, hold time e capacidades"],
          ["**KEEPALIVE**", "Mantém a sessão viva e confirma o OPEN"],
          ["**UPDATE**", "Anuncia rotas (com atributos) ou **retira** rotas"],
          ["**NOTIFICATION**", "Sinaliza um erro (ou um reset administrativo) e **derruba** a sessão"],
        ],
      },
      points: [
        "Estados: **Idle → Connect → Active → OpenSent → OpenConfirm → Established**.",
        "Só em **Established** há troca de rotas. No `show bgp summary`, **State/PfxRcd** mostra o **número de prefixos recebidos** quando está Established — e o **nome do estado** quando não está.",
        "Ao contrário do OSPF, o BGP **não reenvia tudo periodicamente**: depois da troca inicial só circulam as **mudanças**.",
      ],
    },
    {
      title: "A sessão no fio: OPEN",
      code: "4.4.4.4.179 > 3.3.3.3.46387: BGP\n\tOpen Message (1), length: 99\n\t  Version 4, my AS 4, Holdtime 180s, ID 4.4.4.4\n\t  Optional parameters, length: 70\n\t    Multiprotocol Extensions (1)  AFI IPv4, SAFI Unicast\n\t    Route Refresh (2)\n\t    32-Bit AS Number (65)  4 Byte AS 4\n\t    Graceful Restart (64)  Restart Time 120s",
      points: [
        "**my AS** e **ID**: o ASN e o **Router ID** de quem está se apresentando. O vizinho confere o ASN com o seu `remote-as`.",
        "**Holdtime 180s**: se nada chegar nesse tempo, a sessão cai. O KEEPALIVE chega a cada 1/3 (60 s).",
        "**Capabilities**: o que o roteador sabe fazer (IPv4 unicast, AS de 4 bytes, route refresh…). Só vale o que **os dois** anunciam.",
        "A porta **179** está no lado de quem aceitou a conexão; a outra ponta usa uma porta alta aleatória.",
      ],
      note: "Saída real do tcpdump em R4 quando a sessão com R3 reinicia.",
    },
    {
      title: "A rota no fio: UPDATE",
      code: "4.4.4.4.46387 > 3.3.3.3.179 ... BGP\n\tUpdate Message (2), length: 59\n\t  Origin (1), length: 1, Flags [T]: IGP\n\t  AS Path (2), length: 10, Flags [TE]: 4 1\n\t  Next Hop (3), length: 4, Flags [T]: 4.4.4.4\n\t  Multi Exit Discriminator (4), length: 4, Flags [O]: 5\n\t  Updated routes:\n\t    150.1.1.0/24",
      points: [
        "Um UPDATE traz os **atributos** (Origin, AS Path, Next Hop, MED…) e a lista de **prefixos** a que eles se aplicam (**Updated routes**).",
        "**AS Path** `4 1`: quem anuncia é o AS4 e o prefixo nasceu no AS1. Ao repassar por eBGP, o roteador **acrescenta o próprio ASN** à esquerda.",
        "**Next Hop**: ao anunciar por eBGP, o roteador coloca **a si mesmo**.",
        "O **MED** só aparece quando alguém o configura (flag **O** = opcional, não transitivo).",
        "Uma NOTIFICATION `Cease` aparece quando você faz `clear bgp *`: é o reset administrativo.",
      ],
    },
    {
      title: "Lendo a tabela BGP",
      code: "R3# show ip bgp\n   Network          Next Hop            Metric LocPrf Weight Path\n*> 150.1.1.0/24     2.2.2.2                                0 2 1 i\n*                   4.4.4.4                                0 4 1 i",
      points: [
        "`*` rota **válida**; `>` o **melhor caminho** (best), o único que o roteador usa e repassa aos vizinhos.",
        "**Next Hop**: o vizinho para onde o tráfego será enviado. **Metric** = MED; **LocPrf** = Local Preference.",
        "**Path** = AS-PATH, lido da **esquerda (vizinho) para a direita (origem)**. `2 1`: passou pelo AS2 e nasceu no AS1. O `i` final é o **Origin** (IGP).",
        "O **MED em branco** significa que ninguém configurou: vale 0.",
      ],
    },
    {
      title: "Como o BGP escolhe o melhor caminho",
      points: [
        "Se há várias rotas para o mesmo prefixo, o BGP percorre uma **lista de critérios em ordem** e para no primeiro que desempata:",
        "**1.** Weight (maior) · **2.** Local Preference (maior) · **3.** Rota local",
        "**4.** AS-PATH (**mais curto**) · **5.** Origin (IGP < EGP < incompleto) · **6.** **MED** (menor)",
        "**7.** eBGP sobre iBGP · **8.** Menor métrica IGP até o next-hop · **9.** Mais antigo / **menor Router ID**",
        "Quanto **mais alto** o critério, **mais poder** ele tem. Weight e Local Pref só valem dentro do seu AS; AS-PATH e MED **viajam** para os vizinhos.",
      ],
    },
    {
      title: "O FRR diz por que escolheu",
      code: "R3# show ip bgp 150.1.1.0/24\n  2 1\n    2.2.2.2 from 2.2.2.2 (2.2.2.2)\n      Origin IGP, valid, external, best (Router ID)\n  4 1\n    4.4.4.4 from 4.4.4.4 (4.4.4.4)\n      Origin IGP, valid, external",
      points: [
        "O texto entre parênteses depois de **best** é o **critério que desempatou**: `(Router ID)`, `(AS Path)`, `(MED)`, `(Older Path)`…",
        "No início do lab R3 diz `best (Router ID)`: os critérios 1 a 8 **empataram** e o menor Router ID (2.2.2.2 < 4.4.4.4) levou.",
        "Quando o texto muda, **você sabe qual atributo passou a decidir** — é assim que se confirma que uma política funcionou.",
        "Sem `bgp bestpath compare-routerid`, o FRR preferiria o **caminho eBGP mais antigo** antes do Router ID — e o resultado dependeria de qual UPDATE chegou primeiro. Neste lab, R3 liga essa opção para o resultado ser reproduzível.",
      ],
    },
    {
      title: "MED — sugerindo a entrada",
      points: [
        "**Multi-Exit Discriminator**: o seu AS diz ao **vizinho** qual dos seus links prefere receber. **Menor é melhor.**",
        "Atributo **não-transitivo**: vale só para o **vizinho direto**; ele não é repassado adiante.",
        "É só uma **sugestão** — está no critério 6, depois do AS-PATH.",
        "**Por padrão, o MED só é comparado entre rotas do mesmo AS vizinho.** Aqui R2 e R4 são ASes diferentes: o MED é ignorado até que `bgp always-compare-med` seja ativado no roteador que decide.",
        "Configura-se com **route-map** (`set metric N`) aplicada **out** ao vizinho.",
      ],
      code: "route-map SET_MED permit 10\n set metric 5\n!\nrouter bgp 4\n address-family ipv4 unicast\n  neighbor 3.3.3.3 route-map SET_MED out",
    },
    {
      title: "Cuidado com o atalho: as-path ignore",
      points: [
        "`bgp bestpath as-path ignore` **tira o comprimento do AS-PATH** da decisão — o MED passa a ser comparado mais cedo.",
        "Parece um jeito de \"dar mais força\" ao MED, mas **desliga a proteção contra caminhos longos** para **todos** os prefixos do roteador.",
        "Neste lab, `150.2.2.0/24` é do **vizinho direto R2**. Com o `ignore`, R3 passa a mandar o tráfego por R4 → R1 → R2, **três saltos**, só porque o MED de R4 é menor.",
        "No passo 6 você liga, **vê o estrago** e desliga.",
      ],
      note: "Validado neste lab: com `as-path ignore`, R3 trocou o caminho direto de 150.2.2.0/24 por `4 1 2`.",
    },
    {
      title: "AS-Path Prepend — encarecendo um caminho",
      points: [
        "Como o AS-PATH **mais curto** vence (critério 4), um AS pode repetir o próprio ASN para fazer um caminho parecer **mais longo**.",
        "É a ferramenta clássica de **engenharia de tráfego de entrada**: o AS tem dois provedores e quer receber pelo provedor A — então faz **prepend** nos anúncios ao provedor B.",
        "Diferente do MED, o prepend **vai junto com a rota** e é visto por **todos os ASes** do caminho.",
        "E como o AS-PATH vem **antes** do MED: o prepend **vence** o MED.",
        "Um AS **rejeita** rotas cujo AS-PATH já contém o seu ASN (prevenção de loop). Isso vai aparecer no anel.",
      ],
      code: "route-map PREPEND permit 10\n set as-path prepend 1 1 1\n!\nrouter bgp 1\n address-family ipv4 unicast\n  neighbor 4.4.4.4 route-map PREPEND out",
    },
    {
      title: "Roteiro do Lab 1",
      points: [
        "**Passo 1–2:** ver as sessões e **capturar o OPEN, os UPDATEs e a NOTIFICATION** de uma sessão reiniciando.",
        "**Passo 3:** por que R3 escolheu aquele caminho (**Router ID**).",
        "**Passo 4–5:** configurar **MED** — e ver que **não muda nada** até `always-compare-med`.",
        "**Passo 6:** o atalho `as-path ignore` e por que **desfazer**.",
        "**Passo 7:** **AS-Path Prepend** em R1: o AS-PATH vence o MED e o anel mostra a prevenção de loop.",
        "**Desafio:** tráfego **assimétrico** com prepend em R3.",
        "Nos passos 3, 5, 6 e 7 há uma **previsão** antes de rodar: responda antes de testar.",
      ],
      note: "A nota confere nas SUAS capturas o OPEN, o UPDATE com o seu MED e o UPDATE com o seu prepend. Deixe a captura de R4 rodando do passo 2 ao 7.",
    },
    {
      title: "Ao final: explique ao professor",
      points: [
        "Seu professor pode pedir que você **explique o que fez e por quê**. Use a aba **🙋 Explicar** para chamá-lo.",
        "Você deve conseguir: **ler um AS-PATH**; mostrar o **OPEN** e o **UPDATE** na captura; explicar **por que R3 escolheu aquele caminho no início**; justificar por que o **MED não funcionou sozinho**; mostrar o que o **`as-path ignore`** estragou; e explicar por que o **prepend venceu o MED**.",
        "Dica: não decore — rode os comandos e **aponte na saída** onde está cada coisa.",
      ],
    },
  ],

  // Explicação guiada ao professor (aba "🙋 Explicar"). `lookFor` só aparece
  // no painel do professor.
  explain: [
    {
      id: "e1",
      prompt: "Quantas sessões BGP cada roteador tem, e o que significa o número na coluna State/PfxRcd do show bgp summary?",
      lookFor: "Duas por roteador (anel, dois vizinhos). Número = prefixos recebidos (3), só aparece em Established; fora disso mostra o nome do estado. Sabe que a sessão é TCP 179 e eBGP (ASes diferentes).",
    },
    {
      id: "e2",
      prompt: "Mostre na 🔬 captura o OPEN de uma sessão. O que cada campo diz?",
      lookFor: "Version 4, my AS (ASN de quem envia), Holdtime 180s, ID = Router ID, capabilities (IPv4 unicast, 4-byte AS, route refresh). O vizinho confere o ASN com remote-as. Depois do OPEN vêm KEEPALIVE e UPDATEs; o clear gerou NOTIFICATION Cease.",
    },
    {
      id: "e3",
      prompt: "Leia o AS-PATH das duas rotas de R3 para 150.1.1.0/24 e diga por que R3 escolheu uma delas no início.",
      lookFor: "'2 1' e '4 1': esquerda = vizinho que mandou, direita = AS de origem; cada AS acrescenta o próprio ASN ao repassar. Empate em tudo → best (Router ID): 2.2.2.2 < 4.4.4.4. Sabe que o texto entre parênteses é o critério que desempatou.",
    },
    {
      id: "e4",
      prompt: "Você configurou MED {{medPreferred}} em R4 e {{medOther}} em R2. Por que R3 não mudou de caminho?",
      lookFor: "MED só é comparado entre rotas do MESMO AS vizinho; R2 e R4 são ASes diferentes. R3 continua com best (Router ID) e o metric aparece na tabela mas não é usado. Na captura, o UPDATE de R4 para R3 já leva o Multi Exit Discriminator.",
    },
    {
      id: "e5",
      prompt: "O que o always-compare-med mudou? Foi preciso também o as-path ignore?",
      lookFor: "Compara MED entre ASes diferentes; R3 passou a best (MED) via R4. Não precisou do as-path ignore: os dois caminhos têm AS-PATH de mesmo comprimento (2), então o MED já decide. Para outros prefixos o AS-PATH ainda vem antes (150.2.2.0/24 segue direto por R2).",
    },
    {
      id: "e6",
      prompt: "O que o as-path ignore fez com 150.2.2.0/24 em R3? Por que você o desfez?",
      lookFor: "Tirou o comprimento do AS-PATH da decisão: R3 passou a usar o caminho '4 1 2' (3 saltos, MED menor) em vez do vizinho direto R2. Vale para todos os prefixos — desliga a proteção contra caminhos longos.",
    },
    {
      id: "e7",
      prompt: "Depois do AS-Path Prepend ({{prependArg}}) em R1, por que R3 voltou ao caminho via R2 e vê só um caminho para 150.1.1.0/24?",
      lookFor: "O AS-PATH (critério 4) vem antes do MED (6): o caminho de R4 ficou mais longo, R3 voltou a R2 mesmo com MED maior. R4 passou a preferir o caminho via R3 e não reanuncia a R3 uma rota que já contém AS3 (prevenção de loop) → R3 fica só com R2. Prepend é visto por todos os ASes, MED só pelo vizinho.",
    },
  ],

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
 ip address 10.0.0.1/30
!
interface eth2
 ip address 10.0.0.5/30
!
router bgp 1
 bgp router-id 1.1.1.1
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 2.2.2.2 remote-as 2
 neighbor 2.2.2.2 update-source lo
 neighbor 2.2.2.2 ebgp-multihop 2
 neighbor 4.4.4.4 remote-as 4
 neighbor 4.4.4.4 update-source lo
 neighbor 4.4.4.4 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 150.1.1.0/24
  neighbor 2.2.2.2 activate
  neighbor 4.4.4.4 activate
 exit-address-family
!
ip route 2.2.2.2/32 10.0.0.2
ip route 4.4.4.4/32 10.0.0.6
ip route 150.1.1.0/24 Null0
`,
    R2: `frr version 9.0
frr defaults traditional
hostname R2
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 2.2.2.2/32
!
interface eth1
 ip address 10.0.0.2/30
!
interface eth2
 ip address 10.0.0.9/30
!
router bgp 2
 bgp router-id 2.2.2.2
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 1.1.1.1 remote-as 1
 neighbor 1.1.1.1 update-source lo
 neighbor 1.1.1.1 ebgp-multihop 2
 neighbor 3.3.3.3 remote-as 3
 neighbor 3.3.3.3 update-source lo
 neighbor 3.3.3.3 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 150.2.2.0/24
  neighbor 1.1.1.1 activate
  neighbor 3.3.3.3 activate
 exit-address-family
!
ip route 1.1.1.1/32 10.0.0.1
ip route 3.3.3.3/32 10.0.0.10
ip route 150.2.2.0/24 Null0
`,
    R3: `frr version 9.0
frr defaults traditional
hostname R3
log syslog informational
no ipv6 forwarding
!
interface lo
 ip address 3.3.3.3/32
!
interface eth1
 ip address 10.0.0.10/30
!
interface eth2
 ip address 10.0.0.13/30
!
router bgp 3
 bgp router-id 3.3.3.3
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 bgp bestpath compare-routerid
 neighbor 2.2.2.2 remote-as 2
 neighbor 2.2.2.2 update-source lo
 neighbor 2.2.2.2 ebgp-multihop 2
 neighbor 4.4.4.4 remote-as 4
 neighbor 4.4.4.4 update-source lo
 neighbor 4.4.4.4 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 150.3.3.0/24
  neighbor 2.2.2.2 activate
  neighbor 4.4.4.4 activate
 exit-address-family
!
ip route 2.2.2.2/32 10.0.0.9
ip route 4.4.4.4/32 10.0.0.14
ip route 150.3.3.0/24 Null0
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
 ip address 10.0.0.14/30
!
interface eth2
 ip address 10.0.0.6/30
!
router bgp 4
 bgp router-id 4.4.4.4
 no bgp ebgp-requires-policy
 bgp log-neighbor-changes
 neighbor 1.1.1.1 remote-as 1
 neighbor 1.1.1.1 update-source lo
 neighbor 1.1.1.1 ebgp-multihop 2
 neighbor 3.3.3.3 remote-as 3
 neighbor 3.3.3.3 update-source lo
 neighbor 3.3.3.3 ebgp-multihop 2
 !
 address-family ipv4 unicast
  network 150.4.4.0/24
  neighbor 1.1.1.1 activate
  neighbor 3.3.3.3 activate
 exit-address-family
!
ip route 1.1.1.1/32 10.0.0.5
ip route 3.3.3.3/32 10.0.0.13
ip route 150.4.4.0/24 Null0
`,
  },

  autoGrade: [
    { id: "checked_bgp_table", label: "Verificou a tabela BGP", cmdContains: "show ip bgp" },
    {
      id: "saw_multiple_paths",
      label: "Observou R3 com dois caminhos concorrentes para 150.1.1.0/24",
      router: "R3",
      cmdContains: "show ip bgp 150.1.1.0",
      outputContains: "2 available",
    },
    { id: "med_typed", label: "Configurou MED", cmdContains: "set metric" },
    { id: "always_compare_med_typed", label: "Ativou always-compare-med", cmdContains: "always-compare-med" },
    { id: "aspath_ignore_typed", label: "Testou o as-path ignore", cmdContains: "as-path ignore" },
    { id: "aspath_prepend_typed", label: "Configurou AS-Path Prepend", cmdContains: "as-path prepend" },
    // Checks por captura (aba Wireshark) — casam contra o texto de cada pacote
    { id: "captured_open", label: "Capturou o OPEN de uma sessão BGP", router: "R4", capturePattern: "Open Message \\(1\\)[\\s\\S]*?my AS \\d, Holdtime 180s, ID \\d\\.\\d\\.\\d\\.\\d" },
    { id: "captured_notification", label: "Capturou a NOTIFICATION Cease do reset", router: "R4", capturePattern: "Notification Message \\(3\\)[^\\n]*Cease" },
    { id: "captured_med_update", label: "Capturou o UPDATE de R4 com o MED configurado", router: "R4", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 4 1\\s" + UPD_NT + "Multi Exit Discriminator \\(4\\), length: 4, Flags \\[O\\]: {{medPreferred}}\\s" + UPD_NT + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+150\\.1\\.1\\.0/24" },
    { id: "captured_prepend_update", label: "Capturou o UPDATE de R1 com o AS-Path Prepend", router: "R4", capturePattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1 {{prependArg}}\\s" + UPD_NT + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+150\\.1\\.1\\.0/24" },
  ],

  verifications: [
    {
      id: "bgp_established",
      label: "Sessões BGP verificadas (show bgp summary)",
      weight: 6,
      check: { router: "any", cmdPattern: "show bgp summary", outputPattern: "\\d{2}:\\d{2}:\\d{2}\\s+\\d+" },
    },
    {
      id: "med_configured_r4",
      label: "MED {{medPreferred}} configurado no R4 (o caminho que perdia o desempate)",
      weight: 8,
      check: { router: "R4", cmdPattern: "show running-config", outputPattern: "set metric {{medPreferred}}\\s" },
    },
    {
      id: "med_configured_r2",
      label: "MED {{medOther}} configurado no R2",
      weight: 8,
      check: { router: "R2", cmdPattern: "show running-config", outputPattern: "set metric {{medOther}}\\s" },
    },
    {
      id: "always_compare_med",
      label: "bgp always-compare-med ativo no R3",
      weight: 8,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "bgp always-compare-med" },
    },
    {
      id: "aspath_ignore_removed",
      label: "as-path ignore desfeito no R3 (150.2.2.0/24 volta direto por R2)",
      weight: 10,
      check: { router: "R3", cmdPattern: "show running-config", outputPattern: "^(?![\\s\\S]*bgp bestpath as-path ignore)[\\s\\S]*router bgp 3" },
    },
    {
      id: "r3_direct_r2",
      label: "R3 alcança 150.2.2.0/24 direto pelo vizinho R2",
      weight: 8,
      check: { router: "R3", cmdPattern: "show ip bgp 150.2.2.0", outputPattern: "\\s2\\s+2\\.2\\.2\\.2 from 2\\.2\\.2\\.2[\\s\\S]*?best" },
    },
    {
      id: "aspath_prepend_configured",
      label: "AS-Path Prepend configurado no R1",
      weight: 8,
      check: { router: "R1", cmdPattern: "show running-config", outputPattern: "as-path prepend {{prependArg}}\\s" },
    },
    {
      id: "aspath_prepend_applied",
      label: "AS-Path Prepend aplicado — R4 vê o caminho via R1 mais longo",
      weight: 6,
      check: { router: "R4", cmdPattern: "show ip bgp 150.1.1.0", outputPattern: "\\s1 {{prependArg}}\\s+1\\.1\\.1\\.1 from 1\\.1\\.1\\.1" },
    },
    {
      id: "r4_prefers_r3",
      label: "R4 prefere o caminho via R3 (best, AS Path)",
      weight: 8,
      check: { router: "R4", cmdPattern: "show ip bgp 150.1.1.0", outputPattern: "3 2 1\\s+3\\.3\\.3\\.3 from 3\\.3\\.3\\.3[\\s\\S]*?best \\(AS Path\\)" },
    },
    {
      id: "r3_single_path",
      label: "R3 ficou com um só caminho para 150.1.1.0/24, via R2 (prevenção de loop)",
      weight: 6,
      check: { router: "R3", cmdPattern: "show ip bgp 150.1.1.0", outputPattern: "1 available[\\s\\S]*2\\.2\\.2\\.2 from 2\\.2\\.2\\.2" },
    },
    {
      id: "capture_open",
      label: "Capturou o OPEN de uma sessão BGP em R4",
      weight: 4,
      check: { type: "capture", router: "R4", packetPattern: "Open Message \\(1\\)[\\s\\S]*?my AS \\d, Holdtime 180s" },
    },
    {
      id: "capture_med",
      label: "Capturou o UPDATE de R4 para R3 com Multi Exit Discriminator {{medPreferred}}",
      weight: 8,
      check: { type: "capture", router: "R4", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 4 1\\s" + UPD_NT + "Multi Exit Discriminator \\(4\\), length: 4, Flags \\[O\\]: {{medPreferred}}\\s" + UPD_NT + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+150\\.1\\.1\\.0/24" },
    },
    {
      id: "capture_prepend",
      label: "Capturou o UPDATE de R1 com o AS Path prependado ({{prependArg}})",
      weight: 6,
      check: { type: "capture", router: "R4", packetPattern: "Update Message \\(2\\)" + UPD_NT + "Flags \\[TE\\]: 1 {{prependArg}}\\s" + UPD_NT + "Updated routes:(?:\\s+\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)*?\\s+150\\.1\\.1\\.0/24" },
    },
    {
      id: "challenge_asymmetry",
      label: "Desafio: R1 usa o caminho via R4 para 150.3.3.0/24 (prepend em R3)",
      weight: 6,
      check: { router: "R1", cmdPattern: "show ip bgp 150.3.3.0", outputPattern: "4 3\\s+4\\.4\\.4\\.4 from 4\\.4\\.4\\.4[\\s\\S]*?best" },
    },
  ],

  answerKey: {
    predict_med_before: {
      type: "keywords",
      required: ["não", "nao", "mesmo as", "as diferente", "ases diferentes", "as-path", "router id", "router-id"],
      anyOf: true,
      points: 5,
      hint: "Por padrão o BGP só compara MED entre rotas recebidas do MESMO AS vizinho. R2 e R4 são ASes diferentes — e R3 continua decidindo pelo Router ID.",
    },
    predict_med_resolve: {
      type: "keywords",
      required: ["r4", "4.4.4.4", "menor med", "menor metric", "med menor"],
      anyOf: true,
      points: 5,
      hint: "Com always-compare-med, o MED passa a decidir entre os dois caminhos (mesmo comprimento de AS-PATH) — vence o menor valor, que está em R4.",
    },
    predict_ignore: {
      type: "keywords",
      required: ["r4", "4 1 2", "três saltos", "tres saltos", "3 saltos", "mais longo", "caminho longo", "med"],
      anyOf: true,
      points: 5,
      hint: "Sem o comprimento do AS-PATH na decisão, o MED menor de R4 vence — mesmo com o caminho de 3 saltos (4 1 2) em vez do vizinho direto.",
    },
    predict_prepend_effect: {
      type: "keywords",
      required: ["um", "só um", "so um", "loop", "r2", "2.2.2.2", "as-path", "mais longo", "não oferece", "nao oferece"],
      anyOf: true,
      points: 5,
      hint: "O prepend deixa o caminho de R4 mais longo (AS-PATH vem antes do MED), então R3 volta a R2. R4 passa a preferir R3 e não reanuncia a R3 uma rota que já contém o AS3 (prevenção de loop): R3 fica com um caminho só.",
    },
    q1: { type: "radio", correct: "No R3, direção out para o vizinho 2.2.2.2", points: 12 },
    q2: { type: "radio", correct: "Porque por padrão o BGP só compara MED entre rotas do mesmo AS vizinho", points: 10 },
    q3: { type: "radio", correct: "Após o AS-PATH e após o Origin", points: 10 },
    q4: { type: "radio", correct: "R3 passa a preferir o caminho de 3 saltos via R4 (MED menor) em vez do vizinho direto R2", points: 12 },
    q5: { type: "radio", correct: "MED afeta só o vizinho diretamente conectado; AS-Path Prepend é visível por todos os ASes no caminho", points: 12 },
    q6: { type: "radio", correct: "Porque o AS-PATH (critério 4) é avaliado antes do MED (critério 6) e o caminho via R4 ficou mais longo", points: 12 },
    q7: { type: "radio", correct: "Todos os critérios anteriores empataram e o BGP desempatou pelo menor Router ID", points: 12 },
  },

  steps: [
    {
      id: 1,
      title: "Reconhecimento da Topologia",
      theory: `O BGP (Border Gateway Protocol) é o protocolo de roteamento que interliga os sistemas autônomos (ASes) da internet. Cada AS é identificado por um número único (ASN) e anuncia seus prefixos IP aos vizinhos BGP.

A sessão BGP é um TCP na porta 179. Quando dois roteadores trocam OPEN e chegam ao estado Established, passam a trocar rotas (UPDATEs). O estado aparece no "show bgp summary".

Neste lab cada roteador é um AS, num anel R1–R2–R3–R4–R1. Antes de configurar qualquer política, entenda o estado atual: quais sessões existem, quais prefixos chegam e por que caminho.`,
      description: `A topologia tem 4 ASes (AS1=R1, AS2=R2, AS3=R3, AS4=R4) em anel. R3 recebe o prefixo 150.1.1.0/24 por dois caminhos: via R2 e via R4.

Execute os comandos e anote:
- Quantas sessões BGP cada roteador mantém, e o que o número da coluna State/PfxRcd quer dizer?
- Quais prefixos estão na tabela BGP de R3?
- Qual o AS-PATH de cada caminho para 150.1.1.0/24? Qual está marcado como melhor (*>)?`,
      commands: [
        { cmd: "show bgp summary", router: "R1", desc: "Estado das sessões BGP de R1" },
        { cmd: "show bgp summary", router: "R3", desc: "Estado das sessões BGP de R3" },
        { cmd: "show ip bgp", router: "R3", desc: "Tabela BGP de R3 — todos os caminhos e AS-PATHs" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "Detalhe: quantos caminhos? Qual o AS-PATH de cada?" },
      ],
      expected: "Duas sessões por roteador, todas Established, com 3 prefixos recebidos de cada vizinho. R3 vê 150.1.1.0/24 por dois caminhos ('2 available'): AS-PATH '2 1' via 2.2.2.2 e '4 1' via 4.4.4.4, ambos de comprimento 2.",
    },
    {
      id: 2,
      title: "Ver a sessão BGP no fio (captura)",
      theory: `Uma sessão BGP tem uma conversa bem definida: o OPEN apresenta quem é cada lado (ASN, Router ID, hold time, capacidades), o KEEPALIVE confirma, e os UPDATEs trazem as rotas com seus atributos. Se a sessão é derrubada de propósito (clear bgp *), o roteador manda uma NOTIFICATION Cease.

A captura filtra só o que importa: segmentos TCP 179 com dados ou SYN/FIN/RST, sem os ACKs vazios.`,
      description: `Abra a captura em R4, interface 'todas', protocolo BGP. DEIXE A CAPTURA RODANDO até o fim do passo 7 (se ela parar sozinha depois de 10 min, inicie de novo — o que já foi capturado continua valendo).

Com a captura rodando, execute o clear no R4: ele derruba e refaz as duas sessões de R4. Depois de uns 10 segundos, procure nos pacotes:
  • uma NOTIFICATION com Cease (o reset administrativo);
  • um OPEN: 'my AS', 'Holdtime' e 'ID' — de quem é cada um?
  • as capabilities anunciadas no OPEN;
  • um UPDATE: Origin, AS Path, Next Hop e 'Updated routes'.

Atenção: o clear vale só para R4; as sessões de R2 e R3 não são afetadas.`,
      capture: { router: "R4", iface: "any", filter: "bgp" },
      commands: [
        { cmd: "clear bgp *", router: "R4", desc: "Reinicia as sessões de R4 (gera NOTIFICATION, OPEN, KEEPALIVE e UPDATEs)" },
        { cmd: "show bgp summary", router: "R4", desc: "As duas sessões voltaram a Established? (Up/Down mostra há quanto tempo)" },
      ],
      expected: "Na captura: NOTIFICATION Cease do reset; OPEN com 'Version 4, my AS <ASN>, Holdtime 180s, ID <Router ID>' e capabilities (IPv4 unicast, 32-bit AS, route refresh, graceful restart); KEEPALIVE; UPDATEs com Origin IGP, AS Path e Updated routes. Depois de ~10 s o show bgp summary mostra as duas sessões com Up/Down de poucos segundos e 3 prefixos recebidos.",
    },
    {
      id: 3,
      title: "Por que R3 escolheu este caminho?",
      theory: `O BGP percorre uma lista de critérios em ordem e para no primeiro que desempata:

1. Weight (maior)  2. Local Preference (maior)  3. Rota local
4. AS-PATH (mais curto)  5. Origin (IGP < EGP < incompleto)  6. MED (menor)
7. eBGP sobre iBGP  8. Menor métrica IGP até o next-hop  9. Mais antigo / menor Router ID

O FRR conta qual critério decidiu: o texto entre parênteses depois de "best" (por exemplo "best (Router ID)").

Aqui o R3 tem 'bgp bestpath compare-routerid' na configuração. Sem ele, o FRR prefere o caminho eBGP mais antigo antes de olhar o Router ID — e o resultado dependeria de qual UPDATE chegou primeiro, tornando o lab irreproduzível.`,
      description: `Abra o detalhe de 150.1.1.0/24 em R3 e leia o texto depois de "best". Nenhum dos dois caminhos tem MED configurado.

Os dois têm AS-PATH de comprimento 2, mesma origem e mesmo tipo de sessão (eBGP). O que sobrou para desempatar?

Confirme também a opção compare-routerid na configuração de R3. Ainda não configure nada.`,
      commands: [
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "Qual caminho é o best? O que está escrito entre parênteses?" },
        { cmd: "show running-config", router: "R3", desc: "Procure 'bgp bestpath compare-routerid' dentro do router bgp 3" },
      ],
      expected: "R3 usa o caminho via 2.2.2.2 e o FRR escreve 'best (Router ID)': AS-PATH, Origin e MED empatam (0) e o menor Router ID (2.2.2.2 < 4.4.4.4) vence. Nenhum 'metric' aparece nos dois caminhos.",
      predict: {
        id: "predict_med_before",
        prompt: "No próximo passo você vai configurar um MED BAIXO em R4 (o caminho que hoje perde) e um MED mais alto em R2, ambos anunciados a R3. Você espera que R3 passe a usar R4 IMEDIATAMENTE? Por quê?",
      },
    },
    {
      id: 4,
      title: "Configurar o MED em R4 e R2",
      theory: `Para anunciar um MED a um vizinho, usa-se uma route-map com "set metric VALOR" aplicada na direção out àquele vizinho. A route-map é uma lista de regras sequenciais; sem 'match', a cláusula vale para TODAS as rotas.

Depois de aplicar, faça "clear bgp * soft out": o roteador reenvia os anúncios com a nova política sem derrubar as sessões. O MED aparece no UPDATE como o atributo 'Multi Exit Discriminator'.`,
      description: `Configure:
- R4 anuncia a R3 com MED = {{medPreferred}} (menor, mais preferido)
- R2 anuncia a R3 com MED = {{medOther}} (maior, menos preferido)

Em cada roteador, crie uma route-map com 'set metric VALOR' e aplique como política out ao vizinho 3.3.3.3.

Exemplo no R4:
  configure terminal
  route-map SET_MED_R3 permit 10
   set metric {{medPreferred}}
  exit
  router bgp 4
   address-family ipv4 unicast
    neighbor 3.3.3.3 route-map SET_MED_R3 out
  end
  clear bgp * soft out

No R2, o mesmo com 'set metric {{medOther}}' e 'router bgp 2'.

Depois olhe R3 e a captura de R4: o UPDATE de R4 para R3 agora tem 'Multi Exit Discriminator'. O R3 mudou de caminho?`,
      commands: [
        { cmd: "show running-config", router: "R4", desc: "Confirme a route-map de MED no R4" },
        { cmd: "clear bgp * soft out", router: "R4", desc: "Reenvia os anúncios de R4 com o MED" },
        { cmd: "show running-config", router: "R2", desc: "Confirme a route-map de MED no R2" },
        { cmd: "clear bgp * soft out", router: "R2", desc: "Reenvia os anúncios de R2 com o MED" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "Veja os 'metric' — o best mudou? O que diz o texto após 'best'?" },
      ],
      expected: "R3 mostra 'metric {{medPreferred}}' via 4.4.4.4 e 'metric {{medOther}}' via 2.2.2.2, mas o best continua via 2.2.2.2 com 'best (Router ID)': o MED aparece mas não é usado, porque R2 e R4 são ASes diferentes. Na captura de R4, o UPDATE de R4 para R3 traz 'Multi Exit Discriminator (4) ... {{medPreferred}}' para 150.1.1.0/24.",
    },
    {
      id: 5,
      title: "Fazer o MED valer: always-compare-med",
      theory: `Por padrão o BGP só compara o MED entre rotas recebidas do MESMO AS vizinho (RFC 4271). R2 e R4 são ASes diferentes, então o MED ficou de lado.

"bgp always-compare-med" manda o roteador comparar o MED mesmo entre ASes diferentes. Como os dois caminhos têm AS-PATH do mesmo comprimento, basta esse comando: o MED chega a ser comparado (critério 6) e desempata.

Outros prefixos continuam sendo decididos antes, pelo AS-PATH: o MED só desempata o que o critério 4 deixou empatado.`,
      description: `Ative no R3:
  configure terminal
  router bgp 3
   bgp always-compare-med
  end

Compare o antes e o depois do detalhe de 150.1.1.0/24 — e olhe também a tabela completa: o que acontece com 150.2.2.0/24 (do vizinho direto R2)?`,
      commands: [
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "ANTES: best (Router ID) via R2" },
        { cmd: "show running-config", router: "R3", desc: "Confirme o comando em router bgp 3" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "DEPOIS: qual caminho é o best agora? O que está entre parênteses?" },
        { cmd: "show ip bgp", router: "R3", desc: "150.2.2.0/24 também mudou de caminho? Compare os AS-PATHs." },
      ],
      expected: "R3 passa a usar 150.1.1.0/24 via 4.4.4.4 (metric {{medPreferred}}) com 'best (MED)', sem precisar de clear. Em 150.2.2.0/24 o best continua via 2.2.2.2 (AS-PATH '2' contra '4 1 2'): o AS-PATH mais curto vem antes do MED.",
      predict: {
        id: "predict_med_resolve",
        prompt: "Depois de ativar 'bgp always-compare-med' em R3, para qual vizinho você espera que 150.1.1.0/24 passe a ser preferido, e por quê?",
      },
    },
    {
      id: 6,
      title: "O atalho perigoso: as-path ignore",
      theory: `"bgp bestpath as-path ignore" tira o comprimento do AS-PATH do processo de decisão — o BGP pula o critério 4 e chega ao MED mais cedo. Parece uma forma de "dar mais força" ao MED, mas vale para TODOS os prefixos do roteador e desliga a proteção contra caminhos longos.

Você vai ligar, observar o estrago e desligar.`,
      description: `Antes de ligar, responda a previsão abaixo. Depois, no R3:
  configure terminal
  router bgp 3
   bgp bestpath as-path ignore
  end
  clear bgp * soft

Compare a tabela completa de R3, em especial 150.2.2.0/24 (de R2, vizinho direto).

Por fim DESFAÇA: 'no bgp bestpath as-path ignore' em router bgp 3, e 'clear bgp * soft'. Confirme que 150.2.2.0/24 voltou ao vizinho direto.`,
      commands: [
        { cmd: "show ip bgp", router: "R3", desc: "ANTES: 150.2.2.0/24 e 150.4.4.0/24 por onde?" },
        { cmd: "clear bgp * soft", router: "R3", desc: "Reavalia os caminhos depois de ligar o as-path ignore" },
        { cmd: "show ip bgp", router: "R3", desc: "DEPOIS: o que mudou em 150.2.2.0/24?" },
        { cmd: "show running-config", router: "R3", desc: "Depois de desfazer: o as-path ignore sumiu?" },
        { cmd: "show ip bgp 150.2.2.0/24", router: "R3", desc: "Voltou ao vizinho direto?" },
      ],
      expected: "Com o ignore, 150.2.2.0/24 passa a ter best via 4.4.4.4 com AS-PATH '4 1 2' (3 saltos, metric {{medPreferred}}) em vez do vizinho direto '2'. Depois do 'no bgp bestpath as-path ignore' e de um 'clear bgp * soft', 150.2.2.0/24 volta a ser direto via 2.2.2.2.",
      predict: {
        id: "predict_ignore",
        prompt: "Com 'as-path ignore' ativo em R3, o que você espera que aconteça com o caminho para 150.2.2.0/24, prefixo do vizinho direto R2 (MED {{medOther}} contra {{medPreferred}} em R4)? Por quê?",
      },
    },
    {
      id: 7,
      title: "AS-Path Prepend em R1",
      theory: `O AS-Path Prepend é engenharia de tráfego de ENTRADA: ao repetir o próprio ASN no AS-PATH dos anúncios, o AS faz aquele caminho parecer mais longo. Usado quando uma organização tem vários uplinks e quer controlar por qual deles o tráfego entra.

Duas coisas para observar neste anel:
- O AS-PATH (critério 4) vem ANTES do MED (6): o prepend vence o MED que você acabou de configurar.
- Prevenção de loop: um AS rejeita rotas cujo AS-PATH já contém o próprio ASN. Quando R4 passar a preferir o caminho via R3, ele não reanuncia a R3 uma rota que já passa pelo AS3.`,
      description: `Objetivo: fazer R4 preferir o caminho via R3 (em vez de R1 diretamente) para 150.1.1.0/24.

No R1:
  configure terminal
  route-map PREPEND_R4 permit 10
   set as-path prepend {{prependArg}}
  exit
  router bgp 1
   address-family ipv4 unicast
    neighbor 4.4.4.4 route-map PREPEND_R4 out
  end
  clear bgp * soft out

Observe R4, R3 e a captura de R4: o UPDATE de R1 para R4 agora tem o AS Path mais longo.`,
      commands: [
        { cmd: "show ip bgp 150.1.1.0/24", router: "R4", desc: "ANTES: AS-PATH via R1 (1.1.1.1) e best" },
        { cmd: "show running-config", router: "R1", desc: "Confirme a route-map de prepend" },
        { cmd: "clear bgp * soft out", router: "R1", desc: "Reenvia os anúncios de R1 com o prepend" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R4", desc: "DEPOIS: o AS-PATH via R1 ficou mais longo? Quem é o best agora?" },
        { cmd: "show ip bgp 150.1.1.0/24", router: "R3", desc: "R3 ainda vê dois caminhos? Qual o best, e com qual MED?" },
      ],
      expected: "R4 vê o caminho via R1 com AS-PATH '1 {{prependArg}}' e passa a preferir o caminho via 3.3.3.3 (AS-PATH '3 2 1') com 'best (AS Path)'. Em R3 sobra um caminho só ('1 available'), via 2.2.2.2 com metric {{medOther}}: o prepend venceu o MED de R4, e R4 não reanuncia a R3 uma rota que contém AS3.",
      predict: {
        id: "predict_prepend_effect",
        prompt: "Depois do prepend, você espera que R3 continue com os dois caminhos para 150.1.1.0/24 (e usando R4, que tem o MED menor), ou só um? Por quê?",
      },
    },
  ],

  challenge: {
    title: "Desafio: Engenharia de Tráfego Assimétrica",
    description: `Sem apagar o que você já configurou, complete:

1. Faça R1 preferir o caminho via R4 (e não via R2) para alcançar 150.3.3.0/24.
   Dica: quem anuncia 150.3.3.0/24, para qual vizinho, e em qual direção você aplicaria AS-Path Prepend?

2. Verifique a assimetria: R3→R1 usa o caminho via R2 (150.1.1.0/24 no R3), mas R1→R3 usa R4 (150.3.3.0/24 no R1).

3. Confirme que o 'as-path ignore' continua desfeito no R3.`,
    hints: [
      "Para o item 1: o prepend precisa tornar mais longo o caminho de R1 até R3 que passa por R2",
      "R3 só tem dois vizinhos: 2.2.2.2 e 4.4.4.4",
      "Prepend com o ASN do próprio AS que anuncia (aqui, 3 3)",
      "Use 'clear bgp * soft out' depois de aplicar a route-map",
    ],
    questions: [
      {
        id: "q1", type: "radio",
        text: "Para fazer R1 preferir o caminho via R4 para 150.3.3.0/24, onde você aplicou o AS-Path Prepend?",
        options: [
          "No R1, direção in recebendo de R2",
          "No R2, direção out para o vizinho 1.1.1.1",
          "No R3, direção out para o vizinho 2.2.2.2",
          "No R4, direção out para o vizinho 1.1.1.1",
        ],
      },
      {
        id: "q2", type: "radio",
        text: "Por que o MED não surtiu efeito no R3 logo após configurar 'set metric' em R4 e R2?",
        options: [
          "Porque 'clear bgp * soft out' não foi executado",
          "Porque por padrão o BGP só compara MED entre rotas do mesmo AS vizinho",
          "Porque o MED tem menor prioridade que o Router ID sempre",
          "Porque o MED só funciona em sessões iBGP",
        ],
      },
      {
        id: "q3", type: "radio",
        text: "Na ordem de decisão do BGP, em qual posição o MED é comparado?",
        options: [
          "Antes do AS-PATH",
          "Antes do Local Preference",
          "Após o AS-PATH e após o Origin",
          "Somente após o Router ID",
        ],
      },
      {
        id: "q4", type: "radio",
        text: "O que o 'bgp bestpath as-path ignore' fez com 150.2.2.0/24 no R3?",
        options: [
          "Nada: o prefixo é do vizinho direto e sempre vence",
          "R3 passa a preferir o caminho de 3 saltos via R4 (MED menor) em vez do vizinho direto R2",
          "As sessões BGP caíram e precisaram ser reestabelecidas",
          "R3 passou a ignorar o MED de todas as rotas",
        ],
      },
      {
        id: "q5", type: "radio",
        text: "Qual a principal diferença entre AS-Path Prepend e MED?",
        options: [
          "AS-Path Prepend afeta só o vizinho direto; MED é propagado por toda a internet",
          "MED afeta só o vizinho diretamente conectado; AS-Path Prepend é visível por todos os ASes no caminho",
          "AS-Path Prepend só funciona em eBGP; MED só funciona em iBGP",
          "Não há diferença — ambos afetam o tráfego da mesma forma",
        ],
      },
      {
        id: "q6", type: "radio",
        text: "Depois do prepend de R1, por que R3 voltou ao caminho via R2 mesmo com o MED de R4 menor?",
        options: [
          "Porque o prepend aumenta o MED de R4",
          "Porque o AS-PATH (critério 4) é avaliado antes do MED (critério 6) e o caminho via R4 ficou mais longo",
          "Porque o always-compare-med foi desfeito pelo clear",
          "Porque o Router ID de R2 é menor e sempre vence",
        ],
      },
      {
        id: "q7", type: "radio",
        text: "No início do lab, R3 mostrava 'best (Router ID)' para 150.1.1.0/24. O que isso quer dizer?",
        options: [
          "O Router ID é o primeiro critério de decisão do BGP",
          "R3 escolheu o vizinho com o maior Router ID",
          "Uma política configurada pelo operador forçou o caminho",
          "Todos os critérios anteriores empataram e o BGP desempatou pelo menor Router ID",
        ],
      },
    ],
  },
};
