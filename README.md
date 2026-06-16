# 🌐 BGP Lab Platform

Ambiente completo para laboratórios práticos de BGP com provisionamento automático de containers Docker/ContainerLab, suporte para até 15 alunos simultâneos e painel de monitoramento do professor.

---

## 🏗️ Arquitetura

```
┌────────────────────────────────────────────────────────────────┐
│                    SERVIDOR LINUX (Ubuntu 22.04)                │
│                                                                  │
│  ┌──────────────┐    ┌─────────────────────────────────────┐   │
│  │   Nginx :80  │    │     Backend Node.js :3000            │   │
│  │  (proxy +    │◄──►│  - REST API + WebSocket              │   │
│  │   frontend)  │    │  - Provisioner (ContainerLab/Docker) │   │
│  └──────────────┘    │  - Session Manager (15 slots)        │   │
│                       │  - Auto-cleanup (30min inativo)      │   │
│  ┌────────────────────┴────────────────────────────────────┐ │   │
│  │           Docker (via /var/run/docker.sock)              │ │   │
│  │                                                          │ │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │ │   │
│  │  │  Session A   │  │  Session B   │  │  Session C   │  │ │   │
│  │  │  clab-aaa-   │  │  clab-bbb-   │  │  clab-ccc-   │  │ │   │
│  │  │  ┌R1┐ ┌R2┐  │  │  ┌R1┐ ┌R2┐  │  │  ┌R1┐ ┌R2┐  │  │ │   │
│  │  │  └──┘ └──┘  │  │  └──┘ └──┘  │  │  └──┘ └──┘  │  │ │   │
│  │  │  FRR + BGP  │  │  FRR + BGP  │  │  FRR + BGP  │  │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │ │   │
│  └─────────────────────────────────────────────────────────┘ │   │
└────────────────────────────────────────────────────────────────┘
```

## 📦 Stack Tecnológica

| Componente | Tecnologia | Função |
|---|---|---|
| **Roteadores** | FRR (Free Range Routing) latest | BGP, OSPF, RIP dentro dos containers |
| **Orquestrador** | ContainerLab | Deploy/destroy de topologias de rede |
| **Containers** | Docker | Isolamento por sessão de aluno |
| **Backend** | Node.js + Express + WebSocket | API, provisionamento, avaliação |
| **Frontend** | React + Vite | UI do aluno e do professor |
| **Proxy** | Nginx | TLS, rate-limiting, SPA routing |
| **Captura** | tcpdump + tshark/Wireshark | Análise de pacotes BGP |

---

## 🚀 Instalação Rápida

### Requisitos mínimos do servidor
- Ubuntu 22.04 / Debian 12
- 8 GB RAM (suporta ~15 sessões simultâneas com 4 roteadores cada)
- 4 vCPUs
- 50 GB disco SSD
- Docker instalado

### Deploy em um comando

```bash
git clone <repo> bgp-lab-platform
cd bgp-lab-platform
sudo bash scripts/setup.sh
```

O script instala automaticamente:
1. Node.js 20
2. ContainerLab
3. Docker (se não instalado)
4. Imagem FRR
5. Nginx
6. Serviço systemd `bgplab-backend`

---

## 🔧 Configuração Manual

### 1. Instalar ContainerLab

```bash
bash -c "$(curl -sL https://get.containerlab.dev)"
```

### 2. Pull da imagem FRR

```bash
docker pull frrouting/frr:latest
```

### 3. Backend

```bash
cd backend
npm install
PORT=3000 LAB_BASE_DIR=/opt/bgp-labs node server.js
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev        # desenvolvimento (proxy → :3000)
# ou
npm run build      # produção → dist/
```

### 5. Docker Compose (alternativa)

```bash
# Build do frontend
docker compose --profile build up frontend-builder

# Sobe toda a stack
docker compose up -d
```

> Em macOS com Docker Desktop, a UI/API sobem localmente, mas o provisionamento
> ContainerLab/FRR completo precisa de um kernel Linux com acesso a bridges e
> namespaces do Docker. Use uma VM Linux local ou um servidor Linux para criar
> as topologias FRR de alunos.

---

## 👥 Fluxo do Aluno

1. Acessa `http://<servidor>`
2. Digita nome e escolhe o laboratório
3. Backend provisiona automaticamente os containers FRR da sessão via ContainerLab (~30-60s). Cada aluno ativo recebe seus próprios containers e uma subnet de gerência isolada.
4. Interface carrega com:
   - **📋 Roteiro** — passo a passo guiado com comandos copiáveis
   - **💻 Terminal** — terminal vtysh real para cada roteador (↑↓ histórico)
   - **🏆 Desafio** — avaliação com questões abertas e múltipla escolha
   - **🔬 Captura** — atalhos para tcpdump e análise de pacotes
5. Sessão encerra automaticamente após **30 minutos de inatividade**
6. Resultado salvo e visível para o professor

---

## 👨‍🏫 Painel do Professor

Acesse `http://<servidor>` → **Acesso do Professor** → senha: `bgp@teach2025`

### Funcionalidades
- **Visão Geral** — capacidade (15 slots), sessões ativas, estatísticas
- **Barra de Capacidade** — visualização em tempo real dos slots ocupados
- **Sessões** — lista com status, progresso, score, idle time
- **Histórico de Comandos** — todos os comandos executados por cada aluno
- **Eventos em Tempo Real** — provision, cleanup, submits, erros via WebSocket
- **Encerrar Sessão** — força cleanup imediato de qualquer container
- **Broadcast de Mensagens** — envia notificações para um ou todos os alunos

---

## ⏱️ Auto-Cleanup

O sistema monitora inatividade continuamente:

| Tempo inativo | Ação |
|---|---|
| 20 min | Aviso enviado ao aluno ("sessão será encerrada em 10 min") |
| 30 min | Cleanup automático: `containerlab destroy`, remoção de containers e arquivos |

Cleanup manual: professor pode encerrar qualquer sessão pelo painel.

---

## 📊 Avaliação Automática

Além das questões do desafio, o sistema detecta automaticamente:

- Sessões BGP estabelecidas (`Established` no output)
- Tabela BGP com prefixos corretos
- Atributos configurados (`as-path prepend`, `local-preference`, `metric`)
- Comandos específicos por roteador e resultado esperado

Cada check automático concluído gera um badge de progresso visível para o professor em tempo real.

---

## 🔐 Segurança

- Sandbox por sessão: cada aluno tem containers completamente isolados
- Comandos bloqueados: `rm -rf /`, `shutdown`, `reboot`, `halt`, `mkfs`, `dd`
- Rate limiting no Nginx: 30 req/min (API), 60 req/min (exec)
- Backend não exposto diretamente (nginx proxy)
- Senha do professor configurável via variável de ambiente

### Alterar senha do professor

Em `frontend/App.jsx`, linha com `teacherPw === "bgp@teach2025"`:
```javascript
if (teacherPw === "SUA_NOVA_SENHA") onTeacher();
```

Ou via variável de ambiente (recomendado):
```bash
TEACHER_PASSWORD=minha_senha node server.js
```

---

## 📁 Estrutura do Projeto

```
bgp-lab-platform/
├── backend/
│   ├── server.js          # API + WebSocket + provisioner
│   ├── labs-data.js       # Topologias, configs FRR, regras de avaliação
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── App.jsx            # React — aluno + professor
│   ├── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
├── scripts/
│   └── setup.sh           # Instalação automática
└── README.md
```

---

## 🧪 Laboratórios Disponíveis

| Lab | Título | Dificuldade | Roteadores |
|---|---|---|---|
| 1 | MED e AS-Path Prepend | Iniciante | R1, R2, R3, R4 |
| 2 | BGP Local Preference | Iniciante | R1, R2, R3, R4 |
| 4 | BGP Confederations | Avançado | R1, R2, R3, R4, R5 |
| 9 | Community + Route Reflector | Avançado | RR, R1, R2, R3, R4 |

Adicionar novo laboratório: adicione entrada em `backend/labs-data.js` com `frr_configs`, `links`, `autoGrade` e `steps`.

---

## 🐛 Troubleshooting

```bash
# Ver logs do backend
sudo journalctl -u bgplab-backend -f

# Listar containers ativos de todas as sessões
sudo docker ps --filter "name=clab-"

# Forçar limpeza de todos os labs órfãos
sudo docker ps -q --filter "name=clab-" | xargs docker rm -f

# Verificar se ContainerLab funciona manualmente
sudo containerlab deploy -t /opt/bgp-labs/session-*/topology.yml

# Reiniciar backend
sudo systemctl restart bgplab-backend
```

---

## 📈 Escalabilidade

Para mais de 15 alunos simultâneos, aumente `MAX_STUDENTS` em `server.js` e ajuste os recursos:

| Alunos | RAM recomendada | vCPUs |
|---|---|---|
| 15 (padrão) | 8 GB | 4 |
| 30 | 16 GB | 8 |
| 60 | 32 GB | 16 |

Cada sessão com 4 roteadores FRR consome ~300-400 MB RAM.
