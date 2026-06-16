/**
 * Lab 9 — Route Reflector e BGP Communities
 * Fixed: no bgp ebgp-requires-policy
 */

module.exports = {
  "id": 9,
  "title": "Route Reflector e BGP Communities",
  "topic": "Escalabilidade iBGP e Políticas Avançadas",
  "difficulty": "Avançado",
  "duration": "90 min",
  "routers": [
    "RR",
    "R1",
    "R2",
    "R3",
    "R4"
  ],
  "links": [
    [
      "RR",
      "eth1",
      "R1",
      "eth1"
    ],
    [
      "RR",
      "eth2",
      "R2",
      "eth1"
    ],
    [
      "R1",
      "eth2",
      "R3",
      "eth1"
    ],
    [
      "R2",
      "eth2",
      "R4",
      "eth1"
    ]
  ],
  "frr_configs": {
    "RR": "frr version 9.0\nfrr defaults traditional\nhostname RR\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 10.0.0.1/32\n!\ninterface eth1\n ip address 10.1.1.1/30\n!\ninterface eth2\n ip address 10.1.2.1/30\n!\nrouter bgp 1\n bgp router-id 10.0.0.1\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.0.0.2 remote-as 1\n neighbor 10.0.0.2 update-source lo\n neighbor 10.0.0.3 remote-as 1\n neighbor 10.0.0.3 update-source lo\n !\n address-family ipv4 unicast\n  neighbor 10.0.0.2 activate\n  neighbor 10.0.0.2 next-hop-self\n  neighbor 10.0.0.3 activate\n  neighbor 10.0.0.3 next-hop-self\n exit-address-family\n!\nip route 10.0.0.2/32 10.1.1.2\nip route 10.0.0.3/32 10.1.2.2\n",
    "R1": "frr version 9.0\nfrr defaults traditional\nhostname R1\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 10.0.0.2/32\n!\ninterface eth1\n ip address 10.1.1.2/30\n!\ninterface eth2\n ip address 10.2.1.1/30\n!\nrouter bgp 1\n bgp router-id 10.0.0.2\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.0.0.1 remote-as 1\n neighbor 10.0.0.1 update-source lo\n neighbor 10.2.1.2 remote-as 3\n !\n address-family ipv4 unicast\n  neighbor 10.0.0.1 activate\n  neighbor 10.0.0.1 next-hop-self\n  neighbor 10.2.1.2 activate\n  neighbor 10.2.1.2 send-community\n exit-address-family\n!\nip route 10.0.0.1/32 10.1.1.1\n",
    "R2": "frr version 9.0\nfrr defaults traditional\nhostname R2\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 10.0.0.3/32\n!\ninterface eth1\n ip address 10.1.2.2/30\n!\ninterface eth2\n ip address 10.3.1.1/30\n!\nrouter bgp 1\n bgp router-id 10.0.0.3\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.0.0.1 remote-as 1\n neighbor 10.0.0.1 update-source lo\n neighbor 10.3.1.2 remote-as 4\n !\n address-family ipv4 unicast\n  neighbor 10.0.0.1 activate\n  neighbor 10.0.0.1 next-hop-self\n  neighbor 10.3.1.2 activate\n  neighbor 10.3.1.2 send-community\n exit-address-family\n!\nip route 10.0.0.1/32 10.1.2.1\n",
    "R3": "frr version 9.0\nfrr defaults traditional\nhostname R3\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 30.0.0.1/32\n!\ninterface eth1\n ip address 10.2.1.2/30\n!\nrouter bgp 3\n bgp router-id 30.0.0.1\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.2.1.1 remote-as 1\n !\n address-family ipv4 unicast\n  network 192.168.3.0/24\n  network 192.168.30.0/24\n  neighbor 10.2.1.1 activate\n  neighbor 10.2.1.1 send-community\n exit-address-family\n!\nip prefix-list NETS seq 10 permit 192.168.3.0/24\nip prefix-list NETS seq 20 permit 192.168.30.0/24\n",
    "R4": "frr version 9.0\nfrr defaults traditional\nhostname R4\nlog syslog informational\nno ipv6 forwarding\n!\ninterface lo\n ip address 40.0.0.1/32\n!\ninterface eth1\n ip address 10.3.1.2/30\n!\nrouter bgp 4\n bgp router-id 40.0.0.1\n bgp log-neighbor-changes\n no bgp ebgp-requires-policy\n neighbor 10.3.1.1 remote-as 1\n !\n address-family ipv4 unicast\n  network 192.168.4.0/24\n  network 192.168.40.0/24\n  neighbor 10.3.1.1 activate\n  neighbor 10.3.1.1 send-community\n exit-address-family\n!\nip prefix-list NETS seq 10 permit 192.168.4.0/24\nip prefix-list NETS seq 20 permit 192.168.40.0/24\n"
  },
  "verifications": [
    {
      "id": "bgp_established_rr_r1",
      "label": "Sessão iBGP RR↔R1 estabelecida",
      "weight": 8,
      "check": {
        "router": "RR",
        "cmdPattern": "show bgp summary",
        "outputPattern": "10\\.0\\.0\\.2.*Establ"
      }
    },
    {
      "id": "bgp_established_rr_r2",
      "label": "Sessão iBGP RR↔R2 estabelecida",
      "weight": 8,
      "check": {
        "router": "RR",
        "cmdPattern": "show bgp summary",
        "outputPattern": "10\\.0\\.0\\.3.*Establ"
      }
    },
    {
      "id": "rr_client_r1",
      "label": "R1 configurado como cliente do Route Reflector",
      "weight": 12,
      "check": {
        "router": "RR",
        "cmdPattern": "show running-config",
        "outputPattern": "route-reflector-client"
      }
    },
    {
      "id": "rr_client_r2",
      "label": "R2 configurado como cliente do Route Reflector",
      "weight": 12,
      "check": {
        "router": "RR",
        "cmdPattern": "show bgp neighbors 10.0.0.3",
        "outputPattern": "Route-Reflector Client"
      }
    },
    {
      "id": "r2_sees_r3_routes",
      "label": "R2 recebe rotas de R3 via Route Reflector",
      "weight": 15,
      "check": {
        "router": "R2",
        "cmdPattern": "show ip bgp",
        "outputPattern": "192\\.168\\.3\\.0"
      }
    },
    {
      "id": "r1_sees_r4_routes",
      "label": "R1 recebe rotas de R4 via Route Reflector",
      "weight": 15,
      "check": {
        "router": "R1",
        "cmdPattern": "show ip bgp",
        "outputPattern": "192\\.168\\.4\\.0"
      }
    },
    {
      "id": "community_configured",
      "label": "Community configurada em algum roteador",
      "weight": 10,
      "check": {
        "router": "any",
        "cmdPattern": "show running-config",
        "outputPattern": "set community"
      }
    },
    {
      "id": "community_list_filter",
      "label": "Filtro por community-list configurado",
      "weight": 10,
      "check": {
        "router": "any",
        "cmdPattern": "show running-config",
        "outputPattern": "community-list"
      }
    },
    {
      "id": "no_export_or_custom",
      "label": "Community no-export ou customizada aplicada",
      "weight": 10,
      "check": {
        "router": "any",
        "cmdPattern": "show ip bgp",
        "outputPattern": "Community|no-export|\\d+:\\d+"
      }
    }
  ],
  "answerKey": {
    "q1": {
      "type": "radio",
      "correct": "O Route Reflector reflete rotas entre clientes iBGP, eliminando a necessidade de full-mesh entre eles",
      "points": 15
    },
    "q2": {
      "type": "radio",
      "correct": "Originator-ID e Cluster-List — previnem loops de reflexão",
      "points": 20
    },
    "q3": {
      "type": "radio",
      "correct": "no-export (65535:65281) — impede que a rota seja anunciada para peers eBGP",
      "points": 15
    },
    "q4": {
      "type": "radio",
      "correct": "R2 não recebe a rota 192.168.30.0/24 de R3, porque o RR não a reflete para peers iBGP quando marcada com no-export",
      "points": 20
    },
    "q5": {
      "type": "radio",
      "correct": "send-community — sem este comando o atributo Community é removido antes de enviar ao peer",
      "points": 15
    },
    "q6": {
      "type": "radio",
      "correct": "ip community-list standard NOME permit 1:100",
      "points": 15
    }
  },
  "steps": [
    {
      "id": 1,
      "title": "Entendendo o problema do full-mesh iBGP",
      "theory": "O iBGP (Internal BGP) tem uma regra fundamental chamada split-horizon: um roteador BGP NÃO pode repassar para um peer iBGP uma rota que aprendeu de outro peer iBGP. Isso evita loops, mas cria um problema de escala.\n\nPara que todos os roteadores internos de um AS conheçam todas as rotas, seria necessário criar sessões iBGP entre TODOS os pares de roteadores — o famoso full-mesh. Para N roteadores, isso exige N×(N-1)/2 sessões. Com 10 roteadores: 45 sessões. Com 100 roteadores: 4950 sessões.\n\nO Route Reflector (RR) é a solução: um roteador designado que tem permissão para \"refletir\" rotas recebidas de um cliente iBGP para outros clientes iBGP — quebrando a regra do split-horizon de forma controlada. Os clientes precisam de sessão apenas com o RR, não entre si.\n\nNeste lab, o roteador RR é o Route Reflector. R1 e R2 são seus clientes iBGP. R3 e R4 são peers eBGP externos.",
      "description": "Antes de configurar o Route Reflector, observe o estado atual da rede.\n\nVerifique as sessões BGP em cada roteador e tente entender por que R2 ainda não vê as rotas anunciadas por R3, mesmo com todos os roteadores conectados.",
      "commands": [
        {
          "cmd": "show bgp summary",
          "router": "RR",
          "desc": "Sessões iBGP do RR — R1 e R2 estão Established?"
        },
        {
          "cmd": "show ip bgp",
          "router": "R1",
          "desc": "R1 vê rotas de R3 (192.168.3.0/24, 192.168.30.0/24)?"
        },
        {
          "cmd": "show ip bgp",
          "router": "R2",
          "desc": "R2 vê rotas de R3? Ou apenas as de R4?"
        },
        {
          "cmd": "show ip bgp",
          "router": "RR",
          "desc": "O RR vê rotas de ambos os lados (R3 e R4)?"
        }
      ],
      "expected": "R1 vê rotas de R3 mas NÃO as de R4. R2 vê rotas de R4 mas NÃO as de R3. O RR vê todas as rotas mas não as reflete ainda — pois R1 e R2 não estão configurados como clientes."
    },
    {
      "id": 2,
      "title": "Configurar o Route Reflector",
      "theory": "Para configurar um Route Reflector no FRR, é necessário apenas um comando por cliente:\n\n  neighbor X.X.X.X route-reflector-client\n\nEste comando diz ao RR: \"este vizinho é meu cliente — posso refletir rotas para ele que aprendi de outros clientes\".\n\nQuando o RR reflete uma rota, ele adiciona dois atributos BGP automáticos:\n- ORIGINATOR_ID: preserva o Router-ID do roteador que originou a rota\n- CLUSTER_LIST: lista de Cluster-IDs pelos quais a rota passou (previne loops)\n\nEstes atributos são usados para detecção de loops: se um roteador recebe uma rota com seu próprio Router-ID no ORIGINATOR_ID, ele descarta a rota.\n\nNo FRR, o Cluster-ID do RR é, por padrão, seu próprio Router-ID. Pode ser alterado com: bgp cluster-id X.X.X.X",
      "description": "Configure o RR para tratar R1 e R2 como clientes.\n\nNo roteador RR, dentro da address-family ipv4 unicast, adicione:\n  neighbor 10.0.0.2 route-reflector-client\n  neighbor 10.0.0.3 route-reflector-client\n\nApós configurar, faça soft-reset e verifique se R2 passa a ver as rotas de R3.",
      "commands": [
        {
          "cmd": "show running-config",
          "router": "RR",
          "desc": "Confirme que route-reflector-client aparece para ambos os peers"
        },
        {
          "cmd": "clear bgp * soft",
          "router": "RR",
          "desc": "Força reavaliação e redistribuição de todas as rotas"
        },
        {
          "cmd": "show ip bgp",
          "router": "R2",
          "desc": "Agora R2 vê 192.168.3.0/24 (de R3) via RR?"
        },
        {
          "cmd": "show ip bgp",
          "router": "R1",
          "desc": "R1 vê 192.168.4.0/24 (de R4) via RR?"
        },
        {
          "cmd": "show ip bgp 192.168.3.0/24",
          "router": "R2",
          "desc": "Detalhe: observe os atributos ORIGINATOR_ID e CLUSTER_LIST"
        }
      ],
      "expected": "Após configurar route-reflector-client, R1 e R2 devem ver rotas de ambos os lados. O campo 'Originator' deve mostrar o Router-ID de R1 (10.0.0.2) nas rotas de R3 vistas por R2."
    },
    {
      "id": 3,
      "title": "Verificar os atributos de loop prevention",
      "theory": "O BGP Communities é um atributo que permite marcar rotas com valores arbitrários para uso em políticas de roteamento. Um Community é representado como dois números de 16 bits separados por dois pontos: ASN:valor (ex: 1:100).\n\nCommunities well-known (padronizadas pelo RFC):\n- no-export (65535:65281): a rota não deve ser anunciada para peers eBGP\n- no-advertise (65535:65282): a rota não deve ser anunciada para NENHUM peer\n- local-as (65535:65283): a rota não deve sair do AS local (nem para confederações)\n\nCommunities permitem implementar políticas complexas sem precisar configurar filtros em cada roteador individualmente — basta marcar a rota na origem e configurar os roteadores para reagir à marcação.",
      "description": "Antes de configurar Communities, observe os atributos que o Route Reflector adiciona automaticamente.\n\nUse 'show ip bgp 192.168.3.0/24' no R2 e procure os campos:\n- Originator: deve mostrar o Router-ID de R1 (quem recebeu de R3)\n- Cluster-list: deve mostrar o Cluster-ID do RR (10.0.0.1 por padrão)\n\nEsses dois atributos são o mecanismo anti-loop do Route Reflector.",
      "commands": [
        {
          "cmd": "show ip bgp 192.168.3.0/24",
          "router": "R2",
          "desc": "Procure Originator e Cluster-list nos atributos da rota"
        },
        {
          "cmd": "show ip bgp 192.168.4.0/24",
          "router": "R1",
          "desc": "Mesmos atributos para rota de R4 vista por R1"
        },
        {
          "cmd": "show bgp neighbors 10.0.0.2",
          "router": "RR",
          "desc": "Confirme 'Route-Reflector Client' na descrição do peer R1"
        },
        {
          "cmd": "show bgp neighbors 10.0.0.3",
          "router": "RR",
          "desc": "Confirme 'Route-Reflector Client' na descrição do peer R2"
        }
      ],
      "expected": "R2 vê 192.168.3.0/24 com Originator: 10.0.0.2 e Cluster-list: 10.0.0.1. R1 vê 192.168.4.0/24 com Originator: 10.0.0.3 e Cluster-list: 10.0.0.1."
    },
    {
      "id": 4,
      "title": "Configurar Community no-export em R3",
      "theory": "Para configurar Communities no FRR, usa-se uma route-map com o comando 'set community':\n\n  route-map SET-COMMUNITY permit 10\n   set community no-export\n\nDepois aplicar a route-map na direção de saída para o peer:\n  neighbor X.X.X.X route-map SET-COMMUNITY out\n\nIMPORTANTE: o atributo Community só é transmitido se o roteador vizinho tiver 'send-community' configurado para aquele peer. Sem esse comando, o FRR remove as Communities antes de enviar.\n\nNo FRR, 'send-community' já está habilitado por padrão em sessões onde foi explicitamente configurado no template. Mas é bom confirmar com 'show bgp neighbors X | include Community'.",
      "description": "Configure R3 para marcar a rota 192.168.30.0/24 com Community no-export antes de anunciá-la para R1.\n\nO objetivo: 192.168.30.0/24 deve chegar no R1 e no RR, mas NÃO deve ser repassada para R4 (que é um peer eBGP de R2).\n\nEm R3, crie uma route-map que:\n1. Case com o prefixo 192.168.30.0/24 usando um ip prefix-list\n2. Aplique community no-export\n3. Deixe as outras rotas passarem sem modificação (permit sem match)\n\nAplique a route-map como política de saída para o vizinho R1 (10.2.1.1).",
      "commands": [
        {
          "cmd": "show ip bgp",
          "router": "R4",
          "desc": "ANTES: R4 vê 192.168.30.0/24? (deve ver agora)"
        },
        {
          "cmd": "show running-config",
          "router": "R3",
          "desc": "Confirme sua route-map e prefix-list após configurar"
        },
        {
          "cmd": "clear bgp * soft out",
          "router": "R3",
          "desc": "Aplica a nova política de saída"
        },
        {
          "cmd": "show ip bgp 192.168.30.0/24",
          "router": "R1",
          "desc": "R1 recebe a rota? Vê o atributo Community no-export?"
        },
        {
          "cmd": "show ip bgp 192.168.30.0/24",
          "router": "R2",
          "desc": "R2 recebe via RR? Também vê a Community?"
        },
        {
          "cmd": "show ip bgp",
          "router": "R4",
          "desc": "DEPOIS: R4 ainda vê 192.168.30.0/24? NÃO deve ver!"
        }
      ],
      "expected": "192.168.30.0/24 aparece em R1 e R2 com Community 'no-export'. R4 NÃO deve ver este prefixo — o R2 respeitou o no-export e não anunciou para o peer eBGP R4."
    },
    {
      "id": 5,
      "title": "Configurar Community customizada e filtrar por community-list",
      "theory": "Communities customizadas seguem o formato ASN:valor, onde você define o significado. Por exemplo, AS 1 pode definir:\n- 1:100 = \"rota de alta prioridade\"\n- 1:200 = \"rota de backup\"\n- 1:999 = \"não anunciar para clientes\"\n\nPara FILTRAR rotas por Community, usa-se community-list:\n\n  ip community-list standard NOME permit 1:100\n\nE depois na route-map:\n  route-map FILTRO permit 10\n   match community NOME\n   set local-preference 200\n\nIsso permite implementar políticas sofisticadas: R3 pode marcar suas rotas com communities, e R1/RR/R2 podem reagir automaticamente aplicando Local Preference, MED ou até bloqueio — sem precisar de prefix-lists em cada roteador.",
      "description": "Configure uma Community customizada para influenciar a seleção de rota:\n\n1. Em R3: marque 192.168.3.0/24 com Community 1:100 (alta prioridade)\n2. Em R1: crie um community-list que reconhece 1:100 e aplique Local Preference 200 para essas rotas\n\nAssim, quando R2 receber 192.168.3.0/24 via RR (refletida de R1), ela chegará com Local Preference 200 — mais preferida que qualquer outra rota para o mesmo prefixo com LP padrão (100).\n\nDica: lembre de adicionar 'send-community' na sessão de R1 para R3 se ainda não estiver configurado.",
      "commands": [
        {
          "cmd": "show running-config",
          "router": "R3",
          "desc": "Confirme set community 1:100 na route-map de saída"
        },
        {
          "cmd": "show running-config",
          "router": "R1",
          "desc": "Confirme ip community-list e route-map de entrada configurados"
        },
        {
          "cmd": "clear bgp * soft",
          "router": "R1",
          "desc": "Aplica políticas de entrada e saída"
        },
        {
          "cmd": "show ip bgp 192.168.3.0/24",
          "router": "R1",
          "desc": "Local Preference agora é 200 para esta rota?"
        },
        {
          "cmd": "show ip bgp 192.168.3.0/24",
          "router": "R2",
          "desc": "R2 recebe a rota com LP 200 refletida pelo RR?"
        },
        {
          "cmd": "show ip bgp",
          "router": "RR",
          "desc": "RR vê a Community 1:100 nas rotas de R3?"
        }
      ],
      "expected": "192.168.3.0/24 deve ter Local Preference 200 em R1 após aplicar o filtro por community-list. R2 deve receber a mesma rota com LP 200 via reflexão do RR."
    }
  ],
  "challenge": {
    "title": "Desafio: Política Completa com Communities e Route Reflector",
    "description": "Com o Route Reflector funcionando e Communities configuradas, implemente as seguintes políticas adicionais:\n\n1. Configure R4 para marcar 192.168.40.0/24 com Community 1:200 (indicando \"rota de backup\").\n   Em R2, crie um filtro que aplica Local Preference 50 para rotas com Community 1:200.\n   Verifique que R1 também recebe esta rota com LP 50 via RR.\n\n2. Configure a Community no-advertise em 192.168.30.0/24 em vez de no-export.\n   Observe a diferença: com no-advertise, a rota não chega nem a R2 via RR.\n   Depois restaure para no-export para manter o comportamento anterior.\n\n3. Adicione um segundo Route Reflector (torne o R1 também um RR) para redundância.\n   Verifique que as rotas ainda chegam corretamente usando o CLUSTER_LIST para evitar loops.",
    "hints": [
      "Para o item 1: configure route-map em R4 com 'set community 1:200', aplique out para R2. Em R2: ip community-list + route-map in com 'set local-preference 50'",
      "no-advertise (65535:65282) impede propagação para QUALQUER peer — inclusive iBGP. Por isso R2 deixa de receber a rota via RR",
      "Para RR redundante: configure R1 com 'neighbor 10.0.0.3 route-reflector-client' — R1 passa a ser RR também para R2, criando redundância",
      "Com dois RRs (RR e R1), use 'bgp cluster-id' para que ambos usem o mesmo Cluster-ID, evitando que o CLUSTER_LIST cause descarte de rotas"
    ],
    "questions": [
      {
        "id": "q1",
        "type": "radio",
        "text": "Qual a principal função do Route Reflector no BGP?",
        "options": [
          "Substituir o protocolo OSPF dentro do AS",
          "O Route Reflector reflete rotas entre clientes iBGP, eliminando a necessidade de full-mesh entre eles",
          "Converter rotas eBGP em iBGP dentro do AS",
          "Filtrar rotas externas antes de distribuir internamente"
        ]
      },
      {
        "id": "q2",
        "type": "radio",
        "text": "Quais atributos o Route Reflector adiciona automaticamente para prevenir loops?",
        "options": [
          "MED e Local Preference — controlam o caminho de retorno",
          "Originator-ID e Cluster-List — previnem loops de reflexão",
          "AS-PATH e NEXT_HOP — identificam a origem da rota",
          "Weight e Community — controlam a propagação local"
        ]
      },
      {
        "id": "q3",
        "type": "radio",
        "text": "O que a Community no-export (65535:65281) instrui os roteadores a fazer?",
        "options": [
          "Remover a rota da tabela BGP local",
          "Não anunciar a rota para NENHUM peer, incluindo iBGP",
          "no-export (65535:65281) — impede que a rota seja anunciada para peers eBGP",
          "Anunciar a rota apenas para Route Reflectors"
        ]
      },
      {
        "id": "q4",
        "type": "radio",
        "text": "Após marcar 192.168.30.0/24 com no-export em R3 e essa rota chegar via RR ao R2, o que acontece quando R2 tenta anunciar essa rota para R4?",
        "options": [
          "R4 recebe a rota normalmente, porque no-export só afeta o roteador que recebeu diretamente",
          "R2 não recebe a rota via RR, pois o RR também respeita o no-export",
          "R2 não recebe a rota 192.168.30.0/24 de R3, porque o RR não a reflete para peers iBGP quando marcada com no-export",
          "R4 recebe a rota, mas com o atributo no-export removido pelo RR"
        ]
      },
      {
        "id": "q5",
        "type": "radio",
        "text": "Qual comando é obrigatório para que o atributo Community seja transmitido entre peers BGP no FRR?",
        "options": [
          "bgp community propagate",
          "neighbor X.X.X.X community-allow",
          "send-community — sem este comando o atributo Community é removido antes de enviar ao peer",
          "ip bgp-community new-format"
        ]
      },
      {
        "id": "q6",
        "type": "radio",
        "text": "Qual é a sintaxe correta para criar uma community-list que reconhece a Community 1:100?",
        "options": [
          "bgp community-list 1:100 permit",
          "ip community-list standard NOME permit 1:100",
          "match community 1 100 exact",
          "set community-filter AS1 value 100"
        ]
      }
    ]
  }
};
