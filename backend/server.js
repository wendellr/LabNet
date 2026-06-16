/**
 * BGP Lab Platform — Backend Server
 * Gerencia provisionamento de containers Docker/ContainerLab para até 15 alunos simultâneos
 * Auto-cleanup após 30 minutos de inatividade
 */

// Carrega variáveis de ambiente do .env (se existir)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const { Resend } = require('resend');

// ─── Email (Resend) ──────────────────────────────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const TEACHER_EMAIL  = process.env.TEACHER_EMAIL  || '';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  MAX_STUDENTS: 15,
  INACTIVITY_TIMEOUT_MS: 30 * 60 * 1000,   // 30 minutos
  CLEANUP_CHECK_INTERVAL_MS: 60 * 1000,     // verifica a cada 1 min
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  LAB_BASE_DIR: process.env.LAB_BASE_DIR || '/opt/bgp-labs',
  LAB_HOST_BASE_DIR: process.env.LAB_HOST_BASE_DIR || process.env.LAB_BASE_DIR || '/opt/bgp-labs',
  FRR_IMAGE: process.env.FRR_IMAGE || 'quay.io/frrouting/frr:10.5.0',
  FRR_READY_TIMEOUT_MS: parseInt(process.env.FRR_READY_TIMEOUT_MS || '90000', 10),
  FRR_READY_INTERVAL_MS: parseInt(process.env.FRR_READY_INTERVAL_MS || '2000', 10),
  DOCKER_NETWORK_BASE: 'bgplab',
  STUDENT_PORT_BASE: 8100,                  // portas 8100–8114 para terminais web
  MAX_TERM_BUFFER: 50 * 1024,              // 50KB buffer por terminal
};

// ─── Estado global ─────────────────────────────────────────────────────────
const sessions = new Map();     // sessionId -> Session
const wsClients = new Map();    // ws -> { sessionId, role }
let eventLog = [];              // log global de eventos

// ─── Modelos ───────────────────────────────────────────────────────────────
function createSession(studentName, labId, sessionId = null) {
  const id = sessionId || crypto.randomBytes(8).toString('hex');
  return {
    id,
    studentName,
    labId,
    status: 'provisioning',   // provisioning | running | idle | cleaning | cleaned
    createdAt: Date.now(),
    lastActivity: Date.now(),
    containers: [],            // lista de container IDs
    terminalOutput: {},        // router -> string buffer
    commandHistory: [],        // [{cmd, router, ts, output}]
    progress: {},              // stepId -> {completed, ts}
    challengeAnswers: {},
    score: null,
    networkName: null,
    mgmtSubnetOctet: null,
    labDir: null,
    error: null,
  };
}

function logEvent(type, data) {
  const event = { ts: Date.now(), type, ...data };
  eventLog.push(event);
  if (eventLog.length > 2000) eventLog = eventLog.slice(-1500);
  broadcast({ type: 'event', event }, 'teacher');
}

// ─── WebSocket broadcast ───────────────────────────────────────────────────
function broadcast(msg, role = 'all', sessionId = null) {
  const str = JSON.stringify(msg);
  for (const [ws, meta] of wsClients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (role !== 'all' && meta.role !== role) continue;
    if (sessionId && meta.sessionId !== sessionId && meta.role !== 'teacher') continue;
    ws.send(str);
  }
}

function broadcastDashboard() {
  const snapshot = getDashboardSnapshot();
  broadcast({ type: 'dashboard', snapshot }, 'teacher');
}

function getDashboardSnapshot() {
  const now = Date.now();
  const list = [];
  for (const [id, s] of sessions) {
    list.push({
      id: s.id,
      studentName: s.studentName,
      labId: s.labId,
      status: s.status,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      idleSince: now - s.lastActivity,
      containers: s.containers.length,
      commandCount: s.commandHistory.length,
      progress: s.progress,
      score: s.score,
      error: s.error,
    });
  }
  return {
    sessions: list,
    totalActive: list.filter(s => ['provisioning','running','idle'].includes(s.status)).length,
    maxStudents: CONFIG.MAX_STUDENTS,
    serverTime: now,
    recentEvents: eventLog.slice(-50),
  };
}

// ─── ContainerLab Provisioner ──────────────────────────────────────────────
const LABS = require('./labs-data.js');
const FRR_UID = parseInt(process.env.FRR_UID || '100', 10);
const FRR_GID = parseInt(process.env.FRR_GID || '101', 10);
const FRRVTY_GID = parseInt(process.env.FRRVTY_GID || '102', 10);

async function provisionLab(session) {
  const lab = LABS[session.labId];
  if (!lab) throw new Error(`Lab ${session.labId} não encontrado`);

  const labDir = path.join(CONFIG.LAB_BASE_DIR, `session-${session.id}`);
  session.labDir = labDir;
  session.networkName = `${CONFIG.DOCKER_NETWORK_BASE}-${session.id}`;
  session.mgmtSubnetOctet = await allocateMgmtSubnetOctet(session.id);

  logEvent('provision_start', { sessionId: session.id, labId: session.labId, student: session.studentName });

  // Cria diretório da sessão
  await fs.mkdir(labDir, { recursive: true });

  // Gera YAML do ContainerLab com nomes únicos por sessão
  const clabYaml = generateClabYaml(lab, session);
  await fs.writeFile(path.join(labDir, 'topology.yml'), clabYaml);

  // Cria configs FRR para cada roteador
  for (const [router, config] of Object.entries(lab.frr_configs)) {
    const routerDir = path.join(labDir, router);
    await fs.mkdir(routerDir, { recursive: true });
    await fs.writeFile(path.join(routerDir, 'frr.conf'), normalizeFrrConfig(config));
    await fs.writeFile(path.join(routerDir, 'daemons'), FRR_DAEMONS);
    await fs.writeFile(path.join(routerDir, 'vtysh.conf'),
      `service integrated-vtysh-config\nhostname ${router}\n! Desabilita timeout idle de sessao vtysh\nline vty\n exec-timeout 0 0\n!\n`);
    await applyFrrFilePermissions(routerDir);
  }

  // Deploy ContainerLab
  updateSessionStatus(session, 'provisioning', 'Iniciando containers...');
  const deployResult = await runCommand(
    `sudo containerlab deploy -t ${path.join(labDir, 'topology.yml')} --reconfigure 2>&1`,
    labDir, session, { timeout: 120000 }
  );

  if (deployResult.error) {
    const diagnostics = await collectFailedNodeDiagnostics(session.id);
    throw new Error([
      `ContainerLab deploy falhou: ${(deployResult.stderr || deployResult.stdout || deployResult.error.message).trim()}`,
      diagnostics,
    ].filter(Boolean).join('\n\n'));
  }

  // Descobre containers criados
  const { stdout } = await execAsync(
    `sudo docker ps --format '{{.Names}}' | grep 'clab-${session.id}-' 2>/dev/null || true`
  );
  session.containers = stdout.trim().split('\n').filter(Boolean);

  // Aguarda containers inicializarem completamente
  updateSessionStatus(session, 'provisioning', 'Aguardando FRR inicializar...');
  await waitForFrrReady(session);

  // Aguarda uma janela curta para as sessoes BGP iniciarem apos todos os daemons responderem.
  updateSessionStatus(session, 'provisioning', 'Aguardando BGP convergir...');
  await sleep(5000);
  updateSessionStatus(session, 'running', 'Lab pronto!');
  logEvent('provision_done', { sessionId: session.id, containers: session.containers.length });
  broadcastDashboard();

  // Inicia containerlab graph para esta sessão
  startGraphServer(session);

  return { success: true, containers: session.containers };
}

function normalizeFrrConfig(config) {
  return String(config)
    .split('\n')
    .filter(line => line.trim() !== 'no mpls kernel')
    .join('\n');
}

async function collectFailedNodeDiagnostics(sessionId) {
  try {
    const prefix = `clab-${sessionId}-`;
    const { stdout: psOut } = await execAsync(
      `docker ps -a --filter name=${shellQuote(prefix)} --format '{{.Names}} {{.Status}} {{.Image}}'`
    );
    const names = psOut
      .trim()
      .split('\n')
      .map(line => line.trim().split(/\s+/)[0])
      .filter(Boolean);

    if (names.length === 0) return '';

    const sections = [`Diagnóstico Docker dos nós:\n${psOut.trim()}`];
    for (const name of names) {
      const { stdout: inspectOut } = await execAsync(
        `docker inspect -f 'exit={{.State.ExitCode}} error={{.State.Error}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' ${shellQuote(name)} 2>/dev/null || true`
      );
      const { stdout: logsOut } = await execAsync(
        `docker logs --tail=80 ${shellQuote(name)} 2>&1 || true`
      );
      sections.push([
        `--- ${name} ---`,
        inspectOut.trim(),
        logsOut.trim() ? `logs:\n${logsOut.trim()}` : 'logs: (vazio)',
      ].join('\n'));
    }

    return sections.join('\n');
  } catch (e) {
    return `Falha ao coletar diagnóstico Docker dos nós: ${e.message}`;
  }
}

async function applyFrrFilePermissions(routerDir) {
  const frrConf = path.join(routerDir, 'frr.conf');
  const daemons = path.join(routerDir, 'daemons');
  const vtyshConf = path.join(routerDir, 'vtysh.conf');

  await fs.chown(frrConf, FRR_UID, FRR_GID);
  await fs.chmod(frrConf, 0o640);
  await fs.chown(daemons, FRR_UID, FRR_GID);
  await fs.chmod(daemons, 0o640);
  await fs.chown(vtyshConf, FRR_UID, FRRVTY_GID);
  await fs.chmod(vtyshConf, 0o660);
}

// ─── Espera ativa por FRR pronto ─────────────────────────────────────────────
async function waitForFrrReady(session) {
  const deadline = Date.now() + CONFIG.FRR_READY_TIMEOUT_MS;
  let lastReport = '';

  while (Date.now() < deadline) {
    const checks = await Promise.all(session.containers.map(checkFrrContainerReady));
    const pending = checks.filter(c => !c.ready);

    if (pending.length === 0) {
      console.log(`[frr-ready] sessão ${session.id.slice(0, 8)}: todos os roteadores prontos`);
      return;
    }

    lastReport = pending.map(c => `${c.container}: ${c.reason}`).join('; ');
    console.log(`[frr-ready] aguardando ${pending.length}/${session.containers.length}: ${lastReport}`);
    await sleep(CONFIG.FRR_READY_INTERVAL_MS);
  }

  throw new Error(`FRR não ficou pronto dentro de ${CONFIG.FRR_READY_TIMEOUT_MS}ms: ${lastReport}`);
}

async function checkFrrContainerReady(containerName) {
  const inspectCmd = `docker inspect -f '{{.State.Running}} {{.State.Health.Status}}' ${shellQuote(containerName)} 2>/dev/null || true`;
  const { stdout: inspectOut } = await execAsync(inspectCmd);
  const [running, health] = inspectOut.trim().split(/\s+/);

  if (running !== 'true') {
    return { container: containerName, ready: false, reason: 'container não está running' };
  }

  if (health && health !== '<no' && health !== 'healthy') {
    return { container: containerName, ready: false, reason: `health=${health}` };
  }

  const daemonCmd = [
    'docker exec',
    shellQuote(containerName),
    'sh -lc',
    shellQuote([
      'for d in zebra bgpd staticd; do pgrep -x "$d" >/dev/null || exit 10; done',
      'vtysh -c "show version" >/dev/null',
      'vtysh -c "show interface brief" >/dev/null',
    ].join(' && ')),
  ].join(' ');

  const { stderr, error } = await runCommand(daemonCmd, '/', null, { timeout: 10000 });
  if (error) {
    return { container: containerName, ready: false, reason: (stderr || error.message).trim() || 'daemons/vtysh ainda indisponíveis' };
  }

  return { container: containerName, ready: true };
}

// ─── ContainerLab Graph Server ───────────────────────────────────────────────
function startGraphServer(session) {
  // Porta única por sessão: base + índice da sessão (max 15 alunos)
  const sessionList = [...sessions.values()].filter(s => s.status === 'running');
  const idx = sessionList.findIndex(s => s.id === session.id);
  const port = GRAPH_BASE_PORT + Math.max(0, idx);
  const topoFile = path.join(session.labDir, 'topology.yml');

  // Mata processo anterior se existir
  const existing = graphProcesses.get(session.id);
  if (existing) { try { existing.proc.kill(); } catch {} }

  const proc = spawn('sudo', [
    'containerlab', 'graph',
    '-t', topoFile,
    '--srv', `:${port}`,
  ], { detached: false });

  proc.on('error', (e) => console.log(`[graph] ${session.id}: ${e.message}`));
  proc.on('close', (code) => {
    if (graphProcesses.get(session.id)?.proc === proc)
      graphProcesses.delete(session.id);
  });

  graphProcesses.set(session.id, { proc, port });
  session.graphPort = port;
  console.log(`[graph] sessão ${session.id.slice(0,8)} na porta ${port}`);
}

function stopGraphServer(sessionId) {
  const g = graphProcesses.get(sessionId);
  if (!g) return;
  try { g.proc.kill('SIGTERM'); } catch {}
  graphProcesses.delete(sessionId);
}

function generateClabYaml(lab, session) {
  const hostLabDir = path.posix.join(CONFIG.LAB_HOST_BASE_DIR, `session-${session.id}`);
  const nodes = Object.keys(lab.frr_configs).map(r => `    ${r}:
      kind: linux
      image: ${CONFIG.FRR_IMAGE}
      binds:
        - ${path.posix.join(hostLabDir, r, 'frr.conf')}:/etc/frr/frr.conf
        - ${path.posix.join(hostLabDir, r, 'daemons')}:/etc/frr/daemons
        - ${path.posix.join(hostLabDir, r, 'vtysh.conf')}:/etc/frr/vtysh.conf`).join('\n');

  const links = lab.links.map(l =>
    `    - endpoints: ["${l[0]}:${l[1]}", "${l[2]}:${l[3]}"]`
  ).join('\n');

  return `name: ${session.id}
mgmt:
  network: ${session.networkName}
  ipv4-subnet: 10.${session.mgmtSubnetOctet}.0.0/24

topology:
  nodes:
${nodes}
  links:
${links}
`;
}

async function allocateMgmtSubnetOctet(sessionId) {
  const used = new Set(
    [...sessions.values()]
      .filter(s => s.id !== sessionId && ['provisioning', 'running', 'idle'].includes(s.status))
      .map(s => s.mgmtSubnetOctet)
      .filter(Boolean)
  );

  for (const octet of await getExistingDockerMgmtSubnetOctets()) {
    used.add(octet);
  }

  for (let octet = 200; octet < 200 + CONFIG.MAX_STUDENTS; octet++) {
    if (!used.has(octet)) return octet;
  }

  throw new Error('Não há subnets de gerência disponíveis para novas sessões');
}

async function getExistingDockerMgmtSubnetOctets() {
  try {
    const { stdout: namesOut } = await execAsync(`docker network ls --format '{{.Name}}'`);
    const names = namesOut
      .trim()
      .split('\n')
      .map(s => s.trim())
      .filter(name => name.startsWith(`${CONFIG.DOCKER_NETWORK_BASE}-`));

    if (names.length === 0) return [];

    const { stdout: inspectOut } = await execAsync(
      `docker network inspect ${names.map(shellQuote).join(' ')}`
    );
    const networks = JSON.parse(inspectOut || '[]');
    const octets = [];

    for (const network of networks) {
      for (const cfg of network?.IPAM?.Config || []) {
        const match = String(cfg.Subnet || '').match(/^10\.(\d+)\.0\.0\/24$/);
        if (match) octets.push(parseInt(match[1], 10));
      }
    }

    return octets;
  } catch (e) {
    console.log(`[mgmt-subnet] não foi possível inspecionar redes Docker existentes: ${e.message}`);
    return [];
  }
}

const FRR_DAEMONS = `zebra=yes
bgpd=yes
ospfd=no
ospf6d=no
ripd=no
ripngd=no
isisd=no
pimd=no
ldpd=no
nhrpd=no
eigrpd=no
babeld=no
sharpd=no
staticd=yes
pbrd=no
bfdd=no
fabricd=no
vrrpd=no
pathd=no
vtysh_enable=yes
zebra_options=" -s 90000000 -A 127.0.0.1"
bgpd_options="   -A 127.0.0.1"
staticd_options="-A 127.0.0.1"
`;

async function destroyLab(session) {
  if (!session.labDir) return;
  cleanupPtyProcesses(session.id);  // encerra terminais PTY ativos
  session.status = 'cleaning';
  broadcastDashboard();
  logEvent('cleanup_start', { sessionId: session.id, reason: 'inactivity_or_manual' });

  try {
    await runCommand(
      `sudo containerlab destroy -t ${path.join(session.labDir, 'topology.yml')} --cleanup 2>&1`,
      session.labDir, session, { timeout: 60000 }
    );
    await execAsync(`sudo docker network rm ${session.networkName} 2>/dev/null || true`);
    await execAsync(`rm -rf ${session.labDir} 2>/dev/null || true`);
  } catch (e) {
    // força remoção dos containers
    for (const c of session.containers) {
      await execAsync(`sudo docker rm -f ${c} 2>/dev/null || true`);
    }
    await execAsync(`sudo docker network rm ${session.networkName} 2>/dev/null || true`);
    await execAsync(`rm -rf ${session.labDir} 2>/dev/null || true`);
  }

  session.status = 'cleaned';
  session.containers = [];
  logEvent('cleanup_done', { sessionId: session.id });
  broadcastDashboard();
}

async function runCommand(cmd, cwd, session, opts = {}) {
  return new Promise((resolve) => {
    const proc = exec(cmd, { cwd, timeout: opts.timeout || 30000 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', error: err });
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function updateSessionStatus(session, status, message) {
  session.status = status;
  broadcast({ type: 'status', status, message }, 'all', session.id);
  broadcastDashboard();
}

// ─── Auto-cleanup ──────────────────────────────────────────────────────────
setInterval(async () => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (!['running', 'idle'].includes(session.status)) continue;
    const idle = now - session.lastActivity;
    if (idle > CONFIG.INACTIVITY_TIMEOUT_MS) {
      logEvent('auto_cleanup', { sessionId: id, idleMs: idle, student: session.studentName });
      broadcast({
        type: 'notification',
        level: 'warn',
        message: 'Sessão encerrada por inatividade (30 min). Seus dados foram salvos.'
      }, 'all', id);
      await destroyLab(session);
    } else if (idle > 20 * 60 * 1000) {
      // Aviso com 10 min de antecedência
      broadcast({
        type: 'notification',
        level: 'warn',
        message: `Atenção: sessão será encerrada em ${Math.round((CONFIG.INACTIVITY_TIMEOUT_MS - idle) / 60000)} minutos por inatividade.`
      }, 'all', id);
    }
  }
}, CONFIG.CLEANUP_CHECK_INTERVAL_MS);

// ─── REST API ──────────────────────────────────────────────────────────────

// Criar nova sessão de lab
app.post('/api/session', async (req, res) => {
  const { studentName, labId } = req.body;
  if (!studentName || !labId) return res.status(400).json({ error: 'studentName e labId obrigatórios' });

  const active = [...sessions.values()].filter(s => ['provisioning','running','idle'].includes(s.status));
  if (active.length >= CONFIG.MAX_STUDENTS) {
    return res.status(503).json({ error: `Capacidade máxima atingida (${CONFIG.MAX_STUDENTS} alunos). Tente em alguns minutos.` });
  }

  const session = createSession(studentName, labId);
  sessions.set(session.id, session);
  logEvent('session_created', { sessionId: session.id, student: studentName, labId });
  broadcastDashboard();

  // Provisiona em background
  provisionLab(session).catch(err => {
    session.status = 'error';
    session.error = err.message;
    logEvent('provision_error', { sessionId: session.id, error: err.message });
    broadcastDashboard();
  });

  res.json({ sessionId: session.id, status: 'provisioning' });
});

// Status de uma sessão
app.get('/api/session/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Sessão não encontrada' });
  res.json({
    id: s.id, studentName: s.studentName, labId: s.labId,
    status: s.status, containers: s.containers,
    commandCount: s.commandHistory.length,
    progress: s.progress, score: s.score,
    lastActivity: s.lastActivity, error: s.error,
  });
});

// Executar comando em roteador
app.post('/api/session/:id/exec', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  if (session.status !== 'running') return res.status(400).json({ error: 'Lab não está em execução' });

  const { router, command } = req.body;
  if (!router || !command) return res.status(400).json({ error: 'router e command obrigatórios' });

  // Valida container
  const containerName = `clab-${session.id}-${router}`;
  if (!session.containers.includes(containerName)) {
    return res.status(400).json({ error: `Container ${containerName} não encontrado` });
  }

  session.lastActivity = Date.now();

  // Sanitiza comando — proibe rm -rf, shutdown, etc.
  const BLOCKED = ['rm -rf /', 'shutdown', 'reboot', 'halt', 'poweroff', 'mkfs', 'dd if='];
  if (BLOCKED.some(b => command.toLowerCase().includes(b))) {
    return res.status(403).json({ error: 'Comando não permitido neste ambiente.' });
  }

  const fullCmd = `sudo docker exec ${containerName} vtysh -c "${command.replace(/"/g, '\\"')}"`;
  const { stdout, stderr, error } = await runCommand(fullCmd, '/', session);

  const output = stdout || stderr || (error ? error.message : '');
  const entry = { ts: Date.now(), router, command, output: output.slice(0, 4096) };
  session.commandHistory.push(entry);
  if (session.commandHistory.length > 500) session.commandHistory.splice(0, 100);

  // Atualiza buffer do terminal
  if (!session.terminalOutput[router]) session.terminalOutput[router] = '';
  session.terminalOutput[router] += `\n[${new Date().toLocaleTimeString()}] ${router}# ${command}\n${output}\n`;
  if (session.terminalOutput[router].length > CONFIG.MAX_TERM_BUFFER) {
    session.terminalOutput[router] = session.terminalOutput[router].slice(-CONFIG.MAX_TERM_BUFFER / 2);
  }

  // Broadcast para professor
  logEvent('command_exec', { sessionId: session.id, student: session.studentName, router, command });
  broadcastDashboard();

  // Avalia progresso automaticamente
  autoEvaluateProgress(session, router, command, output);

  res.json({ output, ts: entry.ts });
});

// Avaliação automática por padrões de output
function autoEvaluateProgress(session, router, command, output) {
  const lab = LABS[session.labId];
  if (!lab || !lab.autoGrade) return;

  for (const check of lab.autoGrade) {
    if (session.progress[check.id]?.completed) continue;
    if (check.router && check.router !== router) continue;
    if (!command.toLowerCase().includes(check.cmdContains?.toLowerCase() || '')) continue;
    if (check.outputContains && !output.includes(check.outputContains)) continue;
    if (check.outputPattern && !new RegExp(check.outputPattern).test(output)) continue;

    session.progress[check.id] = { completed: true, ts: Date.now(), router, command };
    broadcast({
      type: 'progress',
      stepId: check.id,
      label: check.label,
      message: `✅ ${check.label}`,
    }, 'all', session.id);
    logEvent('progress', { sessionId: session.id, stepId: check.id, label: check.label });
    broadcastDashboard();
  }
}

// Submit de respostas do desafio
app.post('/api/session/:id/submit', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const { answers } = req.body;
  session.challengeAnswers = answers;
  session.lastActivity = Date.now();

  // Avaliação real: verifica comandos executados + respostas
  const { score, verResults, answerResults, feedback } =
    evaluateAnswers(session.labId, answers, session.progress, session.commandHistory);

  session.score = score;
  session.evalDetail = { verResults, answerResults };

  logEvent('submit', { sessionId: session.id, student: session.studentName, score });
  broadcastDashboard();

  // Envia resultado por email ao professor
  sendResultEmail(session, answers, score, feedback, verResults, answerResults).catch(e =>
    console.error('[email] Falha ao enviar:', e.message)
  );

  res.json({ score, feedback, verResults, answerResults });
});

// ─── Email de resultado ───────────────────────────────────────────────────────
async function sendResultEmail(session, answers, score, feedback, verResults = [], answerResults = []) {
  const emailTo  = runtimeConfig.teacherEmail || TEACHER_EMAIL;
  const emailKey = runtimeConfig.resendKey    || RESEND_API_KEY;
  if (!emailKey || !emailTo) {
    console.log('[email] RESEND_API_KEY ou TEACHER_EMAIL não configurado — email ignorado');
    return;
  }
  const emailClient = new (require('resend').Resend)(emailKey);

  const lab = LABS[session.labId];
  const labTitle = lab?.title || `Lab ${session.labId}`;
  const completedSteps = Object.values(session.progress || {}).filter(p => p.completed);
  const duration = session.lastActivity
    ? Math.round((session.lastActivity - session.createdAt) / 60000)
    : '?';

  // Monta tabela de respostas em HTML
  const questionsHtml = (lab?.challenge?.questions || []).map(q => {
    const ans    = answers[q.id] || '(sem resposta)';
    const result = answerResults.find(r => r.qid === q.id);
    const badge  = result
      ? `<span style="font-size:10px;padding:2px 6px;border-radius:10px;background:${result.passed ? '#052e16' : '#2d0a0a'};color:${result.passed ? '#4ade80' : '#f87171'};margin-left:8px">${result.pts}/${result.max}pts</span>`
      : '';
    const detail = result?.detail ? `<div style="font-size:10px;color:#64748b;margin-top:4px">${result.detail}</div>` : '';
    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;vertical-align:top;min-width:180px">${q.text}${badge}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:12px">${typeof ans === 'string' ? ans : String(ans)}${detail}</td>
      </tr>`;
  }).join('');

  // Monta tabela de progresso automático
  const progressHtml = completedSteps.map(p => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#4ade80;font-size:12px">✅ ${p.label || p.stepId || 'Critério'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px">${new Date(p.ts).toLocaleTimeString('pt-BR')}</td>
    </tr>`).join('');

  const scoreColor = score >= 85 ? '#16a34a' : score >= 70 ? '#2563eb' : score >= 50 ? '#d97706' : '#dc2626';
  const subjectEmoji = score >= 85 ? '🏆' : score >= 70 ? '✅' : score >= 50 ? '📚' : '🔄';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:680px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

    <!-- Header -->
    <div style="background:#020817;padding:28px 32px">
      <div style="font-size:11px;color:#475569;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">BGP Lab Platform</div>
      <h1 style="margin:0;color:#00d4ff;font-size:22px;font-weight:700">${subjectEmoji} Resultado do Lab ${session.labId}</h1>
      <div style="color:#94a3b8;font-size:14px;margin-top:4px">${labTitle}</div>
    </div>

    <!-- Score card -->
    <div style="padding:24px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:32px">
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Aluno</div>
        <div style="font-size:18px;font-weight:600;color:#1e293b;margin-top:2px">${session.studentName}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Nota</div>
        <div style="font-size:32px;font-weight:800;color:${scoreColor};margin-top:2px">${score}<span style="font-size:16px;font-weight:400;color:#94a3b8">/100</span></div>
      </div>
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Duração</div>
        <div style="font-size:18px;font-weight:600;color:#1e293b;margin-top:2px">${duration} min</div>
      </div>
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Critérios OK</div>
        <div style="font-size:18px;font-weight:600;color:#1e293b;margin-top:2px">${completedSteps.length}</div>
      </div>
    </div>

    <div style="padding:24px 32px">

      <!-- Feedback -->
      <div style="background:#f1f5f9;border-left:4px solid ${scoreColor};padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px">
        <div style="color:#1e293b;font-size:14px">${feedback}</div>
      </div>

      <!-- Critérios técnicos -->
      <h2 style="font-size:14px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">Verificações Técnicas</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Critério</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#94a3b8;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:80px">Peso</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#94a3b8;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:80px">Status</th>
          </tr>
        </thead>
        <tbody>
          ${verResults.map(v => `
          <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b">${v.label}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center">${v.weight}pts</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center">${v.passed ? '✅' : '❌'}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <!-- Respostas do desafio -->
      <h2 style="font-size:14px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">Respostas do Desafio</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr>
            <th style="padding:10px;text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Questão</th>
            <th style="padding:10px;text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Resposta</th>
          </tr>
        </thead>
        <tbody>${questionsHtml || '<tr><td colspan="2" style="padding:10px;color:#94a3b8">Sem respostas registradas</td></tr>'}</tbody>
      </table>

      <!-- Progresso automático -->
      ${completedSteps.length > 0 ? `
      <h2 style="font-size:14px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">Critérios Automáticos Completados</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tbody>${progressHtml}</tbody>
      </table>` : ''}

      <!-- Histórico de comandos -->
      ${session.commandHistory?.length > 0 ? `
      <h2 style="font-size:14px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">Comandos Executados (${session.commandHistory.length})</h2>
      <div style="background:#020817;border-radius:8px;padding:14px;font-family:monospace;font-size:11px;color:#94a3b8;max-height:200px;overflow:hidden">
        ${session.commandHistory.slice(-20).map(h =>
          `<div style="margin-bottom:4px"><span style="color:#475569">[${h.router}]</span> <span style="color:#e2e8f0">${h.command}</span></div>`
        ).join('')}
        ${session.commandHistory.length > 20 ? `<div style="color:#475569;margin-top:8px">... e mais ${session.commandHistory.length - 20} comandos</div>` : ''}
      </div>` : ''}

    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <div style="font-size:11px;color:#94a3b8">BGP Lab Platform • ${new Date().toLocaleString('pt-BR')} • Sessão ${session.id.slice(0,8)}...</div>
    </div>
  </div>
</body>
</html>`;

  await emailClient.emails.send({
    from: 'BGP Lab Platform <onboarding@resend.dev>',
    to: [TEACHER_EMAIL],
    subject: `${subjectEmoji} [BGP Lab ${session.labId}] ${session.studentName} — ${score}/100`,
    html,
  });

  console.log(`[email] Resultado de ${session.studentName} enviado para ${TEACHER_EMAIL} (score: ${score})`);
}

// ─── Motor de Avaliação ────────────────────────────────────────────────────────
// Avalia comandos executados + respostas do desafio

function runVerifications(lab, commandHistory) {
  // Executa cada verificação contra o historial real de comandos
  const results = [];
  for (const v of (lab.verifications || [])) {
    const { router, cmdPattern, outputPattern } = v.check;
    const regex = new RegExp(outputPattern, 'i');
    const cmdRe = new RegExp(cmdPattern, 'i');

    // Procura no histórico: algum comando que bate com cmdPattern
    // executado no roteador certo (ou "any"), cujo output bate com outputPattern
    const found = commandHistory.some(entry => {
      if (router !== 'any' && entry.router !== router) return false;
      if (!cmdRe.test(entry.command)) return false;
      if (!regex.test(entry.output || '')) return false;
      return true;
    });

    results.push({
      id:     v.id,
      label:  v.label,
      weight: v.weight,
      passed: found,
    });
  }
  return results;
}

function evaluateAnswers(labId, answers, progress, commandHistory = []) {
  const lab = LABS[labId];
  if (!lab) return { score: 0, verResults: [], answerResults: [], feedback: '' };

  // ── 1. Verificações técnicas (comandos e outputs) ──────────────────────────
  const verResults = runVerifications(lab, commandHistory);
  const verTotal   = verResults.reduce((s, v) => s + v.weight, 0);
  const verPts     = verResults.filter(v => v.passed).reduce((s, v) => s + v.weight, 0);

  // ── 2. Questões do desafio ─────────────────────────────────────────────────
  const ANSWER_KEY = lab.answerKey || {};
  const answerResults = [];
  let ansPts = 0, ansTotal = 0;

  for (const [qid, ans] of Object.entries(answers)) {
    const key = ANSWER_KEY[qid];
    if (!key) continue;

    ansTotal += key.points || 10;
    let pts = 0;
    let passed = false;
    let detail = '';

    if (key.type === 'radio') {
      passed = (ans === key.correct);
      pts    = passed ? (key.points || 10) : 0;
      detail = passed ? 'Correto' : `Incorreto — resposta esperada: "${key.correct}"`;

    } else if (key.type === 'keywords') {
      // Verifica se a resposta contém as palavras-chave requeridas
      const ansLower = (ans || '').toLowerCase();
      const matched  = key.required.filter(kw => ansLower.includes(kw.toLowerCase()));

      if (key.anyOf) {
        // Qualquer uma das palavras-chave já vale
        passed = matched.length >= 1;
        pts    = passed ? Math.round((matched.length / key.required.length) * (key.points || 10)) : 0;
      } else {
        // Todas as palavras-chave são obrigatórias
        passed = matched.length === key.required.length;
        pts    = Math.round((matched.length / key.required.length) * (key.points || 10));
      }
      const missing = key.required.filter(kw => !ansLower.includes(kw.toLowerCase()));
      detail = passed
        ? `Correto (${matched.length}/${key.required.length} conceitos mencionados)`
        : `Parcial — conceitos ausentes: ${missing.join(', ')}. Dica: ${key.hint || ''}`;
    }

    ansPts += pts;
    answerResults.push({ qid, passed, pts, max: key.points || 10, detail });
  }

  // ── 3. Score final ─────────────────────────────────────────────────────────
  // Verificações técnicas valem 70% da nota, questões valem 30%
  const totalWeight = verTotal + ansTotal;
  let score = 0;
  if (totalWeight > 0) {
    score = Math.round(((verPts * 0.7) + (ansPts * 0.3)) / Math.max(verTotal * 0.7 + ansTotal * 0.3, 1) * 100);
    score = Math.min(100, Math.max(0, score));
  }

  // ── 4. Feedback detalhado ──────────────────────────────────────────────────
  const failedVer = verResults.filter(v => !v.passed);
  let feedback = '';
  if (score >= 90)      feedback = '🏆 Excelente! Todos os critérios técnicos verificados e respostas corretas.';
  else if (score >= 75) feedback = '✅ Bom trabalho! Domínio sólido dos conceitos.';
  else if (score >= 55) feedback = '📚 Resultado razoável. Veja os critérios não cumpridos abaixo.';
  else                  feedback = '🔄 Continue praticando. Vários critérios técnicos não foram verificados.';

  if (failedVer.length > 0) {
    feedback += `\n\nCritérios técnicos não cumpridos:\n` +
      failedVer.map(v => `• ${v.label}`).join('\n');
  }

  return { score, verResults, answerResults, feedback };
}

function generateFeedback(labId, answers, score) {
  // Mantido para compatibilidade — o feedback real vem de evaluateAnswers
  if (score >= 90) return '🏆 Excelente! Todos os critérios técnicos verificados.';
  if (score >= 75) return '✅ Bom trabalho! Domínio sólido dos conceitos.';
  if (score >= 55) return '📚 Resultado razoável. Revise os critérios não cumpridos.';
  return '🔄 Continue praticando. Vários critérios técnicos não foram verificados.';
}

// Historial de comandos (para professor)
app.get('/api/session/:id/history', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Sessão não encontrada' });
  res.json({ history: s.commandHistory, terminalOutput: s.terminalOutput });
});

// Dashboard do professor — todas as sessões
app.get('/api/admin/dashboard', (req, res) => {
  res.json(getDashboardSnapshot());
});

// Forçar cleanup de uma sessão
app.delete('/api/admin/session/:id', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Sessão não encontrada' });
  logEvent('manual_cleanup', { sessionId: s.id, by: 'teacher' });
  destroyLab(s).catch(console.error);
  res.json({ ok: true });
});

// Broadcast de mensagem do professor para aluno(s)
app.post('/api/admin/message', (req, res) => {
  const { sessionId, message, level = 'info' } = req.body;
  broadcast({ type: 'notification', level, message, fromTeacher: true }, 'all', sessionId || undefined);
  logEvent('teacher_message', { to: sessionId || 'all', message });
  res.json({ ok: true });
});

// Log de eventos para professor
app.get('/api/admin/events', (req, res) => {
  const limit = parseInt(req.query.limit || '100');
  res.json({ events: eventLog.slice(-limit) });
});

// Health check
// Proxy para containerlab graph — evita expor porta 310x diretamente
app.get('/api/session/:id/graph', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  if (!session.graphPort) return res.status(503).json({ error: 'Graph server não iniciado' });
  res.json({ port: session.graphPort, url: `/graph/${req.params.id}/` });
});

// Proxy reverso inline para o graph server (evita config Nginx por sessão)
app.use('/graph/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session?.graphPort) return res.status(503).send('Graph não disponível');

  const http = require('http');
  const target = `http://127.0.0.1:${session.graphPort}`;
  const url = req.url || '/';

  const proxy = http.request(
    { host: '127.0.0.1', port: session.graphPort, path: url, method: req.method, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );
  proxy.on('error', () => res.status(502).send('Graph temporariamente indisponível'));
  req.pipe(proxy, { end: true });
});

// ─── Auth do professor ───────────────────────────────────────────────────────
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'bgp@teach2025';

app.post('/api/auth/teacher', (req, res) => {
  const { password } = req.body;
  if (password === TEACHER_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Senha incorreta' });
  }
});

// ─── Labs API — serve dados do lab ao frontend ───────────────────────────────
app.get('/api/labs', (req, res) => {
  const meta = Object.values(LABS).map(l => ({
    id: l.id,
    title: l.title,
    topic: l.topic,
    difficulty: l.difficulty,
    duration: l.duration,
    routers: l.routers,
  }));
  res.json(meta);
});

app.get('/api/labs/:id', (req, res) => {
  const lab = LABS[parseInt(req.params.id)];
  if (!lab) return res.status(404).json({ error: 'Lab não encontrado' });
  // Retorna tudo exceto frr_configs (são grandes e não necessários no frontend)
  const { frr_configs, ...rest } = lab;
  res.json(rest);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, sessions: sessions.size, ts: Date.now() });
});

// ─── Configuração de email (professor define em runtime) ─────────────────────
let runtimeConfig = {
  teacherEmail: process.env.TEACHER_EMAIL || '',
  resendKey:    process.env.RESEND_API_KEY || '',
};

app.get('/api/config/email', (req, res) => {
  res.json({
    teacherEmail: runtimeConfig.teacherEmail,
    configured: !!(runtimeConfig.resendKey && runtimeConfig.teacherEmail),
  });
});

app.post('/api/config/email', (req, res) => {
  const { teacherEmail, resendKey } = req.body;
  if (teacherEmail) runtimeConfig.teacherEmail = teacherEmail;
  if (resendKey)    runtimeConfig.resendKey    = resendKey;
  // Reinicia cliente Resend com nova key
  if (runtimeConfig.resendKey) {
    const { Resend: R } = require('resend');
    Object.assign(resend || {}, new R(runtimeConfig.resendKey));
  }
  res.json({ ok: true, configured: !!(runtimeConfig.resendKey && runtimeConfig.teacherEmail) });
});

// ─── WebSocket ─────────────────────────────────────────────────────────────
// Mapa sessionId -> { router -> processo vtysh ativo }
const ptyProcesses = new Map();

// Mapa sessionId -> { proc, port } para containerlab graph
const graphProcesses = new Map();
const GRAPH_BASE_PORT = 3100; // porta 3100, 3101, 3102... por sessão

wss.on('connection', (ws, req) => {
  // Analisa URL para roteamento: /ws/terminal/:sessionId/:router vs /ws
  const url = req.url || '';
  const termMatch = url.match(/^\/ws\/terminal\/([^/]+)\/([^/]+)/);

  // ── MODO TERMINAL PTY ──────────────────────────────────────────────
  if (termMatch) {
    const sessionId = decodeURIComponent(termMatch[1]);
    const router    = decodeURIComponent(termMatch[2]).toUpperCase();
    const session   = sessions.get(sessionId);

    if (!session || session.status !== 'running') {
      ws.send('\r\n\x1b[31mSessão não encontrada ou lab não está rodando.\x1b[0m\r\n');
      ws.close();
      return;
    }

    // Nome do container: clab-<sessionId>-<router> — preserva maiúsculas como o ContainerLab gera
    const containerName = `clab-${sessionId}-${router}`;

    ws.send(`\x1b[1;32mConectando ao roteador ${router}...\x1b[0m\r\n`);

    // Spawn via 'script' que cria um pseudo-TTY real, permitindo docker exec -it
    // 'script -q -c CMD /dev/null' emula terminal sem precisar de node-pty
    const proc = spawn('script', [
      '-q', '-c',
      `docker exec -it ${containerName} vtysh`,
      '/dev/null'
    ], {
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    // Armazena processo
    if (!ptyProcesses.has(sessionId)) ptyProcesses.set(sessionId, {});
    const sessionPtys = ptyProcesses.get(sessionId);
    if (sessionPtys[router]) {
      try { sessionPtys[router].kill(); } catch {}
    }
    sessionPtys[router] = proc;

    // stdout/stderr do container → WebSocket (binário passado diretamente)
    proc.stdout.on('data', (chunk) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    });
    proc.stderr.on('data', (chunk) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    });

    proc.on('close', (code) => {
      clearInterval(keepaliveTimer);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n\x1b[33m[conexão encerrada — código ${code}]\x1b[0m\r\n`);
        ws.close();
      }
      if (sessionPtys[router] === proc) delete sessionPtys[router];
    });

    // Keepalive: envia espaço + backspace a cada 45s para evitar timeout idle do vtysh
    // O vtysh FRR tem timeout de sessão, e o Docker também pode encerrar PTYs ociosas
    const keepaliveTimer = setInterval(() => {
      if (proc.stdin.writable && ws.readyState === WebSocket.OPEN) {
        // Envia um caractere nulo (NUL) — invisível no terminal mas mantém o PTY ativo
        proc.stdin.write('\x00');
      } else {
        clearInterval(keepaliveTimer);
      }
    }, 45000);

    proc.on('error', (err) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n\x1b[31m[erro: ${err.message}]\x1b[0m\r\n`);
        ws.close();
      }
    });

    // WebSocket → stdin do container
    ws.on('message', (data) => {
      // Pode vir como string (texto) ou Buffer (escape sequences, resize)
      try {
        // Tenta parsear como JSON (mensagem de controle do frontend)
        const msg = JSON.parse(data.toString());

        if (msg.type === 'resize' && proc.stdin.writable) {
          // xterm.js envia dimensões para redimensionar PTY
          // docker exec -it não suporta resize diretamente via stdin,
          // mas podemos enviar SIGWINCH via docker exec separado
          execAsync(
            `docker exec ${containerName} sh -c 'kill -WINCH $(ps -o pid= -p 1 2>/dev/null || echo 1)' 2>/dev/null || true`
          ).catch(() => {});
          return;
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
      } catch {
        // Não é JSON — é input do terminal: passa direto pro stdin
        if (proc.stdin.writable) {
          proc.stdin.write(data);
        }
      }
    });

    ws.on('close', () => {
      clearInterval(keepaliveTimer);
      try { proc.stdin.end(); proc.kill('SIGTERM'); } catch {}
      if (sessionPtys[router] === proc) delete sessionPtys[router];
    });

    ws.on('error', () => {
      clearInterval(keepaliveTimer);
      try { proc.kill('SIGTERM'); } catch {}
    });

    // Atualiza lastActivity da sessão
    if (session) session.lastActivity = Date.now();
    return;
  }

  // ── MODO NOTIFICAÇÕES (comportamento existente) ───────────────────
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'auth') {
        wsClients.set(ws, { role: msg.role || 'student', sessionId: msg.sessionId });
        if (msg.role === 'teacher') {
          ws.send(JSON.stringify({ type: 'dashboard', snapshot: getDashboardSnapshot() }));
        } else if (msg.sessionId) {
          const s = sessions.get(msg.sessionId);
          if (s) ws.send(JSON.stringify({ type: 'status', status: s.status }));
        }
      }

      if (msg.type === 'ping') {
        const meta = wsClients.get(ws);
        if (meta?.sessionId) {
          const s = sessions.get(meta.sessionId);
          if (s && ['running','idle'].includes(s.status)) {
            s.lastActivity = Date.now();
          }
        }
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }

    } catch (e) { /* ignore malformed */ }
  });

  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// Limpa processos PTY ao destruir sessão
function cleanupPtyProcesses(sessionId) {
  stopGraphServer(sessionId);  // para o containerlab graph também
  const ptys = ptyProcesses.get(sessionId);
  if (!ptys) return;
  for (const proc of Object.values(ptys)) {
    try { proc.kill('SIGTERM'); } catch {}
  }
  ptyProcesses.delete(sessionId);
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Start ─────────────────────────────────────────────────────────────────
server.listen(CONFIG.PORT, CONFIG.HOST, () => {
  console.log(`🌐 BGP Lab Platform rodando em ${CONFIG.HOST}:${CONFIG.PORT}`);
  console.log(`📁 Labs dir: ${CONFIG.LAB_BASE_DIR}`);
  console.log(`👥 Máx alunos: ${CONFIG.MAX_STUDENTS}`);
  console.log(`⏱  Auto-cleanup: ${CONFIG.INACTIVITY_TIMEOUT_MS / 60000} min`);
});
