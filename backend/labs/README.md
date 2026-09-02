# Labs Modulares

Cada laboratorio fica em um arquivo `lab-XX.js` e e carregado automaticamente por
`backend/labs/index.js`. Para remover um lab da tela do aluno sem apagar o arquivo,
defina `enabled: false`.

## Campos principais

- `id`: numero unico do lab.
- `protocol`: `"bgp"`, `"ospf"` ou `"bgp+ospf"` — usado pelo frontend para
  filtrar a grade de labs e escolher o modo do analisador de pacotes
  (aba Wireshark). Obrigatorio em todo lab novo.
- `scenario`: obrigatorio em todo lab. Um parágrafo curto (3-5 frases)
  descrevendo uma situação real de rede que motiva o conceito técnico do
  lab — a analogia entre a configuração que o aluno vai fazer e uma
  necessidade real de operação de rede (ex.: "empresa multihomed quer
  controlar por qual link o tráfego de entrada chega"). Aparece na
  prévia do lab (SessionGate) e no início do roteiro (StudentLab),
  antes do primeiro passo.
- `enabled`: `true` por padrao; use `false` para ocultar.
- `title`, `topic`, `difficulty`, `duration`: metadados exibidos no frontend.
- `resourceProfile`: `leve`, `moderado` ou `pesado`.
- `routers`: lista de roteadores FRR.
- `links`: links Containerlab no formato `["R1", "eth1", "R2", "eth1"]`.
- `frr_configs`: objeto `{ R1: "...", R2: "..." }` com a config inicial.
- `daemons`: override opcional dos daemons FRR por lab.
- `variables`: opcional — pools de valores aleatorizados por sessao (ver
  secao "Aleatorizacao por sessao" abaixo).
- `steps`: roteiro didatico com teoria, descricao, comandos e resultado
  esperado. Cada step pode ter um `predict` (ver "Previsao antes de
  verificar" abaixo).
- `autoGrade`: checkpoints de progresso durante comandos do aluno.
- `verifications`: criterios tecnicos usados na nota final.
- `challenge.questions`: questoes objetivas exibidas no desafio.
- `answerKey`: gabarito e pontos das questoes (inclui tambem os `predict`
  dos steps, ver abaixo).

## Padrao pedagogico esperado (labs novos)

LabNet sustenta 25 aulas de laboratorio de 1h30 num semestre — um lab que
se resolve em 10 minutos copiando o bloco de config do roteiro nao cumpre
esse tempo nem garante aprendizado. Todo lab novo (e todo lab existente
sendo reescrito) deve combinar:

1. **Diagnostico, nao ditado.** Em vez de "digite este route-map pronto",
   o lab deve subir com uma falha proposital (AS errado, `neighbor ...
   activate` faltando, `network`/area incorreta, custo invertido) e o
   roteiro guia o aluno a *descobrir* o que esta errado usando `show`/
   `debug`, nao a copiar um bloco de config finalizado. Isso nao exige
   nenhuma mudanca de engine — `checkFrrContainerReady` ja nao exige
   sessao BGP/OSPF estabelecida no dia 0, entao uma falha proposital nao
   trava o provisionamento.
2. **Verificacoes numerosas e especificas.** Prefira varias
   `verifications` pequenas e precisas (valor exato, no contexto certo) a
   poucas verificacoes genericas ("contem a palavra").
3. **`variables` para aleatorizar por sessao** (ver abaixo) — evita que
   um aluno so copie a resposta do colega, e permite reusar o mesmo lab
   em turmas/revisoes futuras sem ficar repetitivo.
4. **`predict` nos pontos-chave do roteiro** (ver abaixo) — cria friccao
   cognitiva: o aluno precisa prever o resultado antes de rodar o
   comando de verificacao.

## Aleatorizacao por sessao (`variables`)

Labs podem declarar um bloco `variables` com pools de valores possiveis.
Cada sessao resolve os valores de forma deterministica a partir do
`sessionId` (mesmo aluno sempre ve os mesmos valores; alunos diferentes
recebem combinacoes diferentes). Use `{{nomeDaVariavel}}` como
placeholder em qualquer string do lab — `frr_configs`, `theory`,
`description`, `challenge.description`, `verifications[].check.cmdPattern`/
`outputPattern`, `answerKey` — tudo e resolvido pelo mesmo mecanismo.

```js
variables: {
  asR1:     { pool: [100, 200, 300, 400] },
  prefixR4: { pool: ["150.1.1.0/24", "150.9.9.0/24", "150.4.4.0/24"] },
},
frr_configs: {
  R1: `router bgp {{asR1}}\n network {{prefixR4}}\n...`,
},
```

Cuidado: a substituicao e literal (nao escapa regex). Se `{{prefixR4}}`
for usado dentro de um `outputPattern`, os pontos do IP viram "qualquer
caractere" em regex — na pratica ainda casa corretamente o valor real,
so fica levemente mais permissivo. So parametrize valores (AS, prefixos,
IDs) — a topologia (`routers`/`links`) permanece fixa por lab.

## Previsao antes de verificar (`predict`)

Qualquer `step` pode ter um campo `predict`, uma pergunta aberta ligada
aquele passo, capturada no roteiro **antes** do aluno rodar o comando de
verificacao correspondente:

```js
steps: [{
  id: 2,
  ...
  predict: {
    id: "predict_step2",
    prompt: "Antes de rodar 'show ip ospf neighbor', o que voce espera ver e por que?",
  },
}],
```

O `id` do `predict` entra no `answerKey` do lab como mais uma pergunta
(normalmente `type: "keywords"`), exatamente como as perguntas do
`challenge` — e avaliado pelo mesmo mecanismo, sem nenhum endpoint novo.
A resposta e enviada junto com as respostas do desafio no submit final.

## Daemons FRR

Por padrao o sistema liga apenas `zebra`, `bgpd` e `staticd`, mantendo os labs
leves. Labs futuros podem habilitar outros daemons:

```js
daemons: {
  ospfd: true,
  ospf6d: true,
}
```

Use isso somente quando o lab realmente precisar, porque cada daemon extra aumenta
o custo de CPU/memoria por sessao.

## Regras de desenho

- Prefira 3 a 5 roteadores para permitir ate 15 alunos simultaneos.
- Evite copiar laboratorios Cisco IOS literalmente; adapte para FRR/vtysh.
- A teoria deve conter exemplos suficientes para o aluno executar o lab.
- As questoes devem ser objetivas sempre que possivel (`radio`), para correcao e
  relatorio por email ficarem deterministicos.
- Use `verifications` para avaliar comandos que o aluno verificou no terminal.
