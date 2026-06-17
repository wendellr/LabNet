# Labs Modulares

Cada laboratorio fica em um arquivo `lab-XX.js` e e carregado automaticamente por
`backend/labs/index.js`. Para remover um lab da tela do aluno sem apagar o arquivo,
defina `enabled: false`.

## Campos principais

- `id`: numero unico do lab.
- `enabled`: `true` por padrao; use `false` para ocultar.
- `title`, `topic`, `difficulty`, `duration`: metadados exibidos no frontend.
- `resourceProfile`: `leve`, `moderado` ou `pesado`.
- `routers`: lista de roteadores FRR.
- `links`: links Containerlab no formato `["R1", "eth1", "R2", "eth1"]`.
- `frr_configs`: objeto `{ R1: "...", R2: "..." }` com a config inicial.
- `daemons`: override opcional dos daemons FRR por lab.
- `steps`: roteiro didatico com teoria, descricao, comandos e resultado esperado.
- `autoGrade`: checkpoints de progresso durante comandos do aluno.
- `verifications`: criterios tecnicos usados na nota final.
- `challenge.questions`: questoes objetivas exibidas no desafio.
- `answerKey`: gabarito e pontos das questoes.

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
