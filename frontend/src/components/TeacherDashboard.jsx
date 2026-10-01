import { useState, useEffect, useCallback } from "react";
import { apiFetch, TEACHER_TOKEN_KEY } from "../hooks/index.js";
import { useWebSocket, useToasts, useDashboard } from "../hooks/index.js";
import { Badge, Card, CopyButton, Toasts, CapacityBar, StatusBadge } from "./UI.jsx";
import { LABS_META } from "../data/labs.js";

// Aviso sonoro curto quando um aluno chama o professor
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {}
}

// ─── SessionCard ──────────────────────────────────────────────────────────
// ─── HealthBar — barra de porcentagem colorida por faixa (verde/amarelo/vermelho) ──
function HealthBar({ label, pct }) {
  const color = pct >= 85 ? "#f87171" : pct >= 60 ? "#fbbf24" : "#4ade80";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>{label}</span>
        <span style={{ color, fontSize: 11, fontWeight: "bold" }}>{pct}%</span>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", background: color, width: `${Math.min(100, pct)}%`, transition: "width .5s" }} />
      </div>
    </div>
  );
}

function SessionCard({ session, selected, onClick, onKill }) {
  const idle = session.idleSince;
  const idleMin = Math.round(idle / 60000);
  const warnIdle = idle > 20 * 60000;
  const completedSteps = Object.values(session.progress || {}).filter((p) => p.completed).length;
  const totalPct = Math.min(100, completedSteps * 16);

  return (
    <div onClick={onClick}
      style={{ background: selected ? "#0d1f3c" : "#020817", borderRadius: 10, padding: 14, border: `1px solid ${selected ? "#0ea5e9" : "#1e293b"}`, cursor: "pointer", transition: "all .15s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: "bold" }}>{session.studentName}</span>
          {session.matricula && <span style={{ color: "#475569", fontSize: 10 }}>({session.matricula})</span>}
          <StatusBadge status={session.status} />
          {session.teacherCall?.status === "waiting" && (
            <Badge style={{ background: "#1a1206", color: "#fbbf24", border: "1px solid #f59e0b" }}>🙋 chamou</Badge>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: "#475569", fontSize: 10 }}>Lab {session.labId}</span>
          {["running", "idle"].includes(session.status) && (
            <button onClick={(e) => { e.stopPropagation(); onKill(session.id); }}
              style={{ background: "#450a0a", border: "1px solid #7f1d1d", color: "#f87171", padding: "1px 6px", borderRadius: 3, cursor: "pointer", fontSize: 9 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: "#1e293b", borderRadius: 3, height: 3, marginBottom: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "#4ade80", width: `${totalPct}%`, transition: "width .5s" }} />
      </div>

      <div style={{ display: "flex", gap: 10, fontSize: 10, color: "#475569" }}>
        <span>💻 {session.commandCount} cmds</span>
        <span style={{ color: warnIdle ? "#fbbf24" : "#475569" }}>⏱ {idleMin}m idle</span>
        {session.score !== null && (
          <span style={{ color: session.score >= 60 ? "#4ade80" : "#f87171" }}>🎯 {session.score}%</span>
        )}
        <span>{completedSteps} checks</span>
      </div>
    </div>
  );
}

// ─── ExplanationPanel ─────────────────────────────────────────────────────
// Roteiro do professor para a explicação guiada do aluno: cada pergunta com o
// que se espera ouvir (`lookFor`) e uma marcação ok / parcial / não. Grava em
// explanations.jsonl no backend — registro à parte, não altera a nota.
const MARKS = [
  { id: "ok",      label: "✓ Explicou", color: "#4ade80", bg: "#052e16", border: "#166534" },
  { id: "partial", label: "~ Parcial",  color: "#fbbf24", bg: "#1a1206", border: "#92400e" },
  { id: "no",      label: "✗ Não",      color: "#f87171", bg: "#450a0a", border: "#7f1d1d" },
];

function ExplanationPanel({ session, pushToast }) {
  const [data, setData]   = useState(null);
  const [items, setItems] = useState({});
  const [note, setNote]   = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(null); setItems({}); setNote("");
    apiFetch("GET", `/admin/session/${session.id}/explain`).then(setData).catch(() => setData({ explain: [] }));
  }, [session.id]);

  if (!data) return null;
  if (!data.explain.length) return null;

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("POST", `/admin/session/${session.id}/explanation`, { items, note });
      pushToast(`Explicação de ${session.studentName} registrada`, "success");
    } catch (e) {
      pushToast("Erro ao registrar: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const call = session.teacherCall;
  return (
    <Card style={{ border: call?.status === "waiting" ? "1px solid #f59e0b" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ margin: 0, color: "#fbbf24", fontSize: 12 }}>🙋 Explicação ao professor</h4>
        {call?.status === "waiting" && <Badge style={{ background: "#1a1206", color: "#fbbf24", border: "1px solid #92400e" }}>chamou há {Math.max(0, Math.round((Date.now() - call.ts) / 60000))} min</Badge>}
        {call?.status === "done" && <Badge style={{ background: "#052e16", color: "#4ade80", border: "1px solid #166534" }}>registrada · {call.ok}/{call.total}</Badge>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.explain.map((q, i) => (
          <div key={q.id} style={{ background: "#020817", borderRadius: 8, padding: "10px 12px", border: "1px solid #1e293b" }}>
            <div style={{ color: "#e2e8f0", fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>{i + 1}. {q.prompt}</div>
            {q.lookFor && <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>🔎 {q.lookFor}</div>}
            <div style={{ display: "flex", gap: 6 }}>
              {MARKS.map((m) => {
                const on = items[q.id] === m.id;
                return (
                  <button key={m.id} onClick={() => setItems((it) => ({ ...it, [q.id]: on ? undefined : m.id }))}
                    style={{ background: on ? m.bg : "none", color: on ? m.color : "#475569", border: `1px solid ${on ? m.border : "#1e293b"}`, padding: "3px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11 }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="Observações (opcional)"
        style={{ width: "100%", boxSizing: "border-box", marginTop: 10, background: "#020817", border: "1px solid #1e3a5f", borderRadius: 6, color: "#e2e8f0", padding: "8px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical" }} />
      <button onClick={save} disabled={saving}
        style={{ marginTop: 10, width: "100%", background: "#2d1b00", border: "1px solid #92400e", color: "#fb923c", padding: "9px 0", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
        {saving ? "Gravando..." : "💾 Registrar explicação"}
      </button>
    </Card>
  );
}

// ─── SessionDetail ─────────────────────────────────────────────────────────
function SessionDetail({ session, onClose, pushToast }) {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (!session) return;
    apiFetch("GET", `/session/${session.id}/history`).then(setHistory).catch(() => {});
  }, [session?.id]);

  if (!session) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, color: "#e2e8f0", fontSize: 15 }}>🔍 {session.studentName}{session.matricula ? ` (${session.matricula})` : ""}</h3>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #1e293b", color: "#475569", padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10 }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            ["Status",        <StatusBadge key="s" status={session.status} />],
            ["Lab",           `Lab ${session.labId} — ${LABS_META.find(l => l.id === session.labId)?.title || ""}`],
            ["Comandos",      session.commandCount],
            ["Score",         session.score !== null ? `${session.score}%` : "—"],
            ["Inativo há",    `${Math.round(session.idleSince / 60000)} min`],
            ["Session ID",    session.id.slice(0, 12) + "…"],
          ].map(([label, val]) => (
            <div key={label} style={{ background: "#020817", padding: "8px 12px", borderRadius: 6 }}>
              <div style={{ color: "#475569", fontSize: 10, marginBottom: 2 }}>{label}</div>
              <div style={{ color: "#e2e8f0", fontSize: 12 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Progress checks */}
        <div>
          <div style={{ color: "#475569", fontSize: 10, marginBottom: 6, letterSpacing: 1 }}>PROGRESSO AUTOMÁTICO</div>
          {Object.keys(session.progress || {}).length === 0 ? (
            <span style={{ color: "#1e293b", fontSize: 11 }}>Nenhum check completado ainda</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {Object.entries(session.progress || {}).map(([k, v]) => (
                <Badge key={k} style={{ background: v.completed ? "#052e16" : "#0a0f1a", color: v.completed ? "#4ade80" : "#1e293b", border: `1px solid ${v.completed ? "#166534" : "#1e293b"}`, fontSize: 9 }}>
                  {v.completed ? "✓ " : ""}{k}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <ExplanationPanel session={session} pushToast={pushToast} />

      {/* Command history */}
      <Card>
        <h4 style={{ margin: "0 0 10px", color: "#60a5fa", fontSize: 12 }}>💻 Histórico de Comandos</h4>
        <div style={{ maxHeight: 300, overflowY: "auto", background: "#020817", borderRadius: 8, padding: 10 }}>
          {!history ? (
            <div style={{ color: "#334155", fontSize: 11 }}>Carregando...</div>
          ) : (history.history || []).length === 0 ? (
            <div style={{ color: "#1e293b", fontSize: 11 }}>Nenhum comando executado ainda</div>
          ) : (
            (history.history || []).slice(-60).reverse().map((entry, i) => (
              <div key={i} style={{ marginBottom: 8, borderBottom: "1px solid #0a0f1a", paddingBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 2, alignItems: "center" }}>
                  <Badge style={{ background: "#0d1f3c", color: "#60a5fa", border: "1px solid #1e3a5f", fontSize: 9 }}>{entry.router}</Badge>
                  <span style={{ color: "#334155", fontSize: 9 }}>{new Date(entry.ts).toLocaleTimeString()}</span>
                </div>
                <div style={{ color: "#4ade80", fontSize: 10, fontFamily: "monospace" }}>$ {entry.command}</div>
                <div style={{ color: "#64748b", fontSize: 9, fontFamily: "monospace", marginTop: 2, maxHeight: 50, overflow: "hidden" }}>
                  {entry.output?.slice(0, 200)}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── TeacherDashboard ─────────────────────────────────────────────────────
export function TeacherDashboard({ onExit }) {
  const handleLogout = useCallback(() => {
    apiFetch("POST", "/auth/logout").catch(() => {});
    localStorage.removeItem(TEACHER_TOKEN_KEY);
    onExit();
  }, [onExit]);

  const [snapshot, setSnapshot] = useDashboard((e) => {
    if (e.status === 401) handleLogout();
  });
  const [events, setEvents]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView]         = useState("overview");
  const [msgText, setMsgText]   = useState("");
  const [msgTarget, setMsgTarget] = useState("all");
  const [emailCfg, setEmailCfg]   = useState({ teacherEmail: "", resendKey: "", configured: false });
  const [emailSaving, setEmailSaving] = useState(false);

  useEffect(() => {
    apiFetch("GET", "/config/email").then(d => setEmailCfg(c => ({ ...c, ...d }))).catch(() => {});
  }, []);

  const saveEmailCfg = async () => {
    setEmailSaving(true);
    try {
      const res = await apiFetch("POST", "/config/email", {
        teacherEmail: emailCfg.teacherEmail,
        resendKey:    emailCfg.resendKey,
      });
      setEmailCfg(c => ({ ...c, configured: res.configured }));
      pushToast("Configuração de email salva!", "success");
    } catch (e) {
      pushToast("Erro ao salvar: " + e.message, "error");
    } finally {
      setEmailSaving(false);
    }
  };
  const [toasts, pushToast]     = useToasts();

  // Load initial events
  useEffect(() => {
    apiFetch("GET", "/admin/events?limit=200")
      .then((d) => setEvents((d.events || []).reverse()))
      .catch(() => {});
  }, []);

  const onWsMsg = useCallback((msg) => {
    if (msg.type === "dashboard") setSnapshot(msg.snapshot);
    if (msg.type === "event")     setEvents((e) => [msg.event, ...e].slice(0, 300));
    if (msg.type === "teacher_call") {
      pushToast(`🙋 ${msg.student} (Lab ${msg.labId}) está chamando você`, "warning");
      beep();
    }
  }, [setSnapshot, pushToast]);

  useWebSocket("teacher", null, onWsMsg);

  const killSession = async (id) => {
    if (!confirm("Encerrar esta sessão agora?")) return;
    try {
      await apiFetch("DELETE", `/admin/session/${id}`);
      pushToast("Sessão encerrada", "success");
    } catch (e) { pushToast(e.message, "error"); }
  };

  const sendMessage = async () => {
    if (!msgText.trim()) return;
    try {
      await apiFetch("POST", "/admin/message", {
        sessionId: msgTarget === "all" ? null : msgTarget,
        message: msgText,
        level: "info",
      });
      pushToast("Mensagem enviada", "success");
      setMsgText("");
    } catch (e) { pushToast(e.message, "error"); }
  };

  const active = (snapshot?.sessions || []).filter((s) => ["provisioning", "running", "idle"].includes(s.status));
  const calls  = (snapshot?.sessions || []).filter((s) => s.teacherCall?.status === "waiting").sort((a, b) => a.teacherCall.ts - b.teacherCall.ts);
  const capacity = snapshot?.maxStudents || 15;

  const EVENT_ICON = { teacher_call: "🙋", teacher_call_cancel: "🙅", explanation_recorded: "🗣", provision_start: "🚀", provision_done: "✅", provision_error: "❌", cleanup_start: "🧹", cleanup_done: "🗑", auto_cleanup: "⏱", command_exec: "💻", submit: "📝", progress: "🎯", session_created: "👤", manual_cleanup: "✂️", teacher_message: "📣" };
  const EVENT_COLOR = { provision_error: "#f87171", auto_cleanup: "#fbbf24", submit: "#4ade80", progress: "#4ade80", provision_done: "#4ade80", provision_start: "#60a5fa" };

  const VIEWS = [
    { id: "overview", label: "📊 Visão Geral" },
    { id: "sessions", label: "👥 Sessões" },
    { id: "grades",   label: "🎓 Notas" },
    { id: "events",   label: "📡 Eventos" },
    { id: "email",    label: "📧 Email" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0", fontFamily: "monospace" }}>
      <Toasts toasts={toasts} />

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#1a0a00,#0a0f1a)", borderBottom: "1px solid #92400e", padding: "12px 28px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 22 }}>👨‍🏫</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fb923c", letterSpacing: 2 }}>PAINEL DO PROFESSOR</h1>
          <p style={{ margin: 0, fontSize: 10, color: "#475569" }}>LabNet — Monitor em Tempo Real</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <CapacityBar active={active.length} max={capacity} />
          <button onClick={handleLogout} style={{ background: "none", border: "1px solid #1e293b", color: "#475569", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>← Sair</button>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ background: "#0a0f1a", borderBottom: "1px solid #1e293b", display: "flex", padding: "0 28px" }}>
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{ background: "none", border: "none", borderBottom: view === v.id ? "2px solid #fb923c" : "2px solid transparent", color: view === v.id ? "#fb923c" : "#475569", padding: "9px 14px", cursor: "pointer", fontSize: 12 }}>
            {v.label}
          </button>
        ))}
        {/* Live pulse */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, paddingRight: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
          <span style={{ color: "#334155", fontSize: 10 }}>ao vivo</span>
        </div>
      </div>

      <div style={{ padding: "20px 28px" }}>

        {/* ── Overview ── */}
        {view === "overview" && (
          <div>
            {calls.length > 0 && (
              <Card style={{ marginBottom: 20, border: "1px solid #f59e0b", background: "#1a1206" }}>
                <h3 style={{ margin: "0 0 12px", color: "#fbbf24", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>🙋 Alunos chamando ({calls.length})</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {calls.map((s) => (
                    <button key={s.id} onClick={() => { setSelected(s); setView("sessions"); }}
                      style={{ background: "#2d1b00", border: "1px solid #92400e", color: "#fde68a", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "monospace" }}>
                      {s.studentName} · Lab {s.labId} · há {Math.max(0, Math.round((Date.now() - s.teacherCall.ts) / 60000))} min →
                    </button>
                  ))}
                </div>
              </Card>
            )}
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Alunos Ativos",     val: active.length,                             icon: "👥", c: "#4ade80", bg: "#052e16" },
                { label: "Provisionando",      val: active.filter(s => s.status === "provisioning").length, icon: "⏳", c: "#fbbf24", bg: "#422006" },
                { label: "Slots Livres",       val: capacity - active.length,                  icon: "🔓", c: "#60a5fa", bg: "#0d1f3c" },
                { label: "Comandos Executados",val: (snapshot?.sessions || []).reduce((a, s) => a + (s.commandCount || 0), 0), icon: "💻", c: "#a78bfa", bg: "#1e1b4b" },
                { label: "Eventos",            val: events.length,                             icon: "📡", c: "#fb923c", bg: "#2d1b00" },
              ].map((s) => (
                <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.c}33`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: "bold", color: s.c }}>{s.val}</div>
                  <div style={{ color: "#475569", fontSize: 10 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Saúde do servidor */}
            {snapshot?.serverHealth && (
              <Card style={{ marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 14px", color: "#e2e8f0", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>🖥 Saúde do Servidor</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <HealthBar
                    label={`CPU — load ${snapshot.serverHealth.loadAvg1.toFixed(2)} / ${snapshot.serverHealth.cpuCount} núcleos`}
                    pct={snapshot.serverHealth.loadPct}
                  />
                  <HealthBar
                    label={`Memória — ${snapshot.serverHealth.usedMemGB}GB / ${snapshot.serverHealth.totalMemGB}GB`}
                    pct={snapshot.serverHealth.memPct}
                  />
                </div>
              </Card>
            )}

            {/* Active session grid */}
            <Card style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 14px", color: "#e2e8f0", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>Sessões Ativas em Tempo Real</h3>
              {active.length === 0 ? (
                <div style={{ color: "#1e293b", fontSize: 13, textAlign: "center", padding: "30px 0" }}>Nenhum aluno ativo no momento</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {active.map((s) => (
                    <SessionCard key={s.id} session={s} selected={false}
                      onClick={() => { setSelected(s); setView("sessions"); }}
                      onKill={killSession} />
                  ))}
                </div>
              )}
            </Card>

            {/* Broadcast message */}
            <Card>
              <h3 style={{ margin: "0 0 12px", color: "#fb923c", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>📣 Enviar Mensagem aos Alunos</h3>
              <div style={{ display: "flex", gap: 10 }}>
                <select value={msgTarget} onChange={(e) => setMsgTarget(e.target.value)}
                  style={{ background: "#020817", border: "1px solid #1e3a5f", color: "#e2e8f0", padding: "8px 12px", borderRadius: 6, fontSize: 12, minWidth: 160 }}>
                  <option value="all">Todos os alunos</option>
                  {active.map((s) => <option key={s.id} value={s.id}>{s.studentName}</option>)}
                </select>
                <input value={msgText} onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Mensagem para os alunos..."
                  style={{ flex: 1, background: "#020817", border: "1px solid #1e3a5f", borderRadius: 6, color: "#e2e8f0", padding: "8px 12px", fontSize: 12, fontFamily: "monospace" }}
                />
                <button onClick={sendMessage}
                  style={{ background: "#2d1b00", border: "1px solid #92400e", color: "#fb923c", padding: "8px 18px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                  Enviar
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ── Sessions ── */}
        {view === "sessions" && (
          <div style={{ display: "grid", gridTemplateColumns: selected ? "320px 1fr" : "1fr", gap: 16 }}>
            <Card>
              <h3 style={{ margin: "0 0 14px", color: "#e2e8f0", fontSize: 13 }}>
                Todas as Sessões ({(snapshot?.sessions || []).length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(snapshot?.sessions || []).length === 0 && (
                  <div style={{ color: "#1e293b", fontSize: 12, padding: "20px 0", textAlign: "center" }}>Nenhuma sessão criada ainda</div>
                )}
                {(snapshot?.sessions || []).map((s) => (
                  <SessionCard key={s.id} session={s} selected={selected?.id === s.id}
                    onClick={() => setSelected(s)} onKill={killSession} />
                ))}
              </div>
            </Card>
            {selected && (
              <SessionDetail
                session={(snapshot?.sessions || []).find((s) => s.id === selected.id) || selected}
                onClose={() => setSelected(null)} pushToast={pushToast} />
            )}
          </div>
        )}

        {/* ── Notas ── */}
        {view === "grades" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <GradesView />
            <ExplanationsView />
          </div>
        )}

        {/* ── Events ── */}
        {view === "events" && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: "#e2e8f0", fontSize: 13 }}>📡 Log de Eventos em Tempo Real</h3>
              <button onClick={() => setEvents([])} style={{ background: "none", border: "1px solid #1e293b", color: "#334155", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10 }}>Limpar</button>
            </div>
            <div style={{ maxHeight: 620, overflowY: "auto" }}>
              {events.length === 0 && (
                <div style={{ color: "#1e293b", fontSize: 12, textAlign: "center", padding: "40px 0" }}>Aguardando eventos...</div>
              )}
              {events.map((ev, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid #0a0f1a", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{EVENT_ICON[ev.type] || "·"}</span>
                  <span style={{ color: "#334155", fontSize: 10, flexShrink: 0, minWidth: 72 }}>{new Date(ev.ts).toLocaleTimeString()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: EVENT_COLOR[ev.type] || "#94a3b8", fontSize: 11 }}>{ev.type}</span>
                    {ev.student && <span style={{ color: "#60a5fa", fontSize: 11, marginLeft: 8 }}>{ev.student}</span>}
                    {ev.command && <code style={{ color: "#4ade80", fontSize: 9, marginLeft: 8 }}>{ev.command?.slice(0, 70)}</code>}
                    {ev.label && <span style={{ color: "#4ade80", fontSize: 10, marginLeft: 8 }}>· {ev.label}</span>}
                    {ev.error && <span style={{ color: "#f87171", fontSize: 10, marginLeft: 8 }}>{ev.error?.slice(0, 80)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {view === "email" && (
          <EmailConfigView
            cfg={emailCfg}
            onChange={(k, v) => setEmailCfg(c => ({ ...c, [k]: v }))}
            onSave={saveEmailCfg}
            saving={emailSaving}
          />
        )}
      </div>
    </div>
  );
}

// ─── EmailConfigView ───────────────────────────────────────────────────────
// ─── GradesView — histórico persistente de notas, filtrável por matrícula/nome ──
function GradesView() {
  const [records, setRecords] = useState(null);
  const [search, setSearch]   = useState("");

  useEffect(() => {
    apiFetch("GET", "/admin/grades").then((d) => setRecords(d.records || [])).catch(() => setRecords([]));
  }, []);

  const filtered = (records || []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (r.matricula || "").toLowerCase().includes(q) || (r.studentName || "").toLowerCase().includes(q);
  }).sort((a, b) => b.ts - a.ts);

  const summary = search.trim() && filtered.length > 0
    ? { count: filtered.length, avg: Math.round(filtered.reduce((s, r) => s + (r.score || 0), 0) / filtered.length) }
    : null;

  const exportCsv = () => {
    const header = ["Matrícula", "Aluno", "Lab", "Nota", "Data"];
    const rows = filtered.map((r) => [
      r.matricula || "", r.studentName || "", r.labTitle || `Lab ${r.labId}`, r.score,
      new Date(r.ts).toLocaleString("pt-BR"),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `labnet-notas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, color: "#e2e8f0", fontSize: 13 }}>🎓 Histórico de Notas ({filtered.length})</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por matrícula ou nome..."
            style={{ background: "#020817", border: "1px solid #1e3a5f", borderRadius: 6, color: "#e2e8f0", padding: "6px 12px", fontSize: 12, minWidth: 220 }} />
          <button onClick={exportCsv} disabled={filtered.length === 0}
            style={{ background: "#052e16", border: "1px solid #166534", color: "#4ade80", padding: "6px 14px", borderRadius: 6, cursor: filtered.length ? "pointer" : "not-allowed", fontSize: 12 }}>
            ⬇ Exportar CSV
          </button>
        </div>
      </div>

      {summary && (
        <div style={{ display: "flex", gap: 16, marginBottom: 14, padding: "8px 14px", background: "#0d1f3c", border: "1px solid #1e3a5f", borderRadius: 8 }}>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>Envios: <strong style={{ color: "#e2e8f0" }}>{summary.count}</strong></span>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>Média: <strong style={{ color: summary.avg >= 60 ? "#4ade80" : "#f87171" }}>{summary.avg}</strong></span>
        </div>
      )}

      {records === null ? (
        <div style={{ color: "#1e293b", fontSize: 12, textAlign: "center", padding: "30px 0" }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#1e293b", fontSize: 12, textAlign: "center", padding: "30px 0" }}>
          {records.length === 0 ? "Nenhum envio registrado ainda" : "Nenhum resultado para essa busca"}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {["Matrícula", "Aluno", "Lab", "Nota", "Data"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#475569", fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #0a0f1a" }}>
                  <td style={{ padding: "7px 10px", color: "#94a3b8" }}>{r.matricula || "—"}</td>
                  <td style={{ padding: "7px 10px", color: "#e2e8f0" }}>{r.studentName}</td>
                  <td style={{ padding: "7px 10px", color: "#60a5fa" }}>{r.labTitle || `Lab ${r.labId}`}</td>
                  <td style={{ padding: "7px 10px", color: r.score >= 60 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{r.score}</td>
                  <td style={{ padding: "7px 10px", color: "#475569" }}>{new Date(r.ts).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── ExplanationsView — explicações registradas pelo professor ───────────
function ExplanationsView() {
  const [records, setRecords] = useState(null);

  useEffect(() => {
    apiFetch("GET", "/admin/explanations").then((d) => setRecords(d.records || [])).catch(() => setRecords([]));
  }, []);

  const sorted = (records || []).slice().sort((a, b) => b.ts - a.ts);
  const markIcon = { ok: "✓", partial: "~", no: "✗" };
  const markColor = { ok: "#4ade80", partial: "#fbbf24", no: "#f87171" };

  return (
    <Card>
      <h3 style={{ margin: "0 0 14px", color: "#e2e8f0", fontSize: 13 }}>🙋 Explicações registradas ({sorted.length})</h3>
      {records === null ? (
        <div style={{ color: "#1e293b", fontSize: 12, textAlign: "center", padding: "20px 0" }}>Carregando...</div>
      ) : sorted.length === 0 ? (
        <div style={{ color: "#1e293b", fontSize: 12, textAlign: "center", padding: "20px 0" }}>Nenhuma explicação registrada ainda</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Matrícula", "Aluno", "Lab", "Perguntas", "Observação", "Data"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#475569", fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #0a0f1a", verticalAlign: "top" }}>
                <td style={{ padding: "7px 10px", color: "#94a3b8" }}>{r.matricula || "—"}</td>
                <td style={{ padding: "7px 10px", color: "#e2e8f0" }}>{r.studentName}</td>
                <td style={{ padding: "7px 10px", color: "#60a5fa" }}>Lab {r.labId}</td>
                <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                  {(r.items || []).map((it) => (
                    <span key={it.id} title={it.prompt} style={{ color: markColor[it.mark] || "#334155", marginRight: 6, fontWeight: 700 }}>{markIcon[it.mark] || "·"}</span>
                  ))}
                  <span style={{ color: "#475569", marginLeft: 4 }}>{r.ok}/{r.total}</span>
                </td>
                <td style={{ padding: "7px 10px", color: "#94a3b8", maxWidth: 320 }}>{r.note || "—"}</td>
                <td style={{ padding: "7px 10px", color: "#475569", whiteSpace: "nowrap" }}>{new Date(r.ts).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function EmailConfigView({ cfg, onChange, onSave, saving }) {
  return (
    <Card>
      <h3 style={{ margin: "0 0 6px", color: "#fb923c", fontSize: 13 }}>📧 Configuração de Email — Resend</h3>
      <p style={{ margin: "0 0 20px", color: "#475569", fontSize: 11, lineHeight: 1.6 }}>
        Quando um aluno envia o desafio, o resultado completo é enviado automaticamente por email.<br />
        Configure sua API Key do <a href="https://resend.com" target="_blank" style={{ color: "#60a5fa" }}>Resend</a> e o endereço de destino abaixo.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.configured ? "#4ade80" : "#f87171" }} />
        <span style={{ fontSize: 11, color: cfg.configured ? "#4ade80" : "#f87171" }}>
          {cfg.configured ? "Email configurado e ativo" : "Email não configurado"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
            API Key do Resend
          </label>
          <input
            type="password"
            value={cfg.resendKey}
            onChange={e => onChange("resendKey", e.target.value)}
            placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            style={{ width: "100%", background: "#020817", border: "1px solid #1e293b", borderRadius: 6, color: "#e2e8f0", padding: "9px 12px", fontSize: 12, fontFamily: "monospace" }}
          />
          <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>
            Obtenha em resend.com → API Keys. O plano gratuito permite 3.000 emails/mês.
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
            Email do Professor (destino)
          </label>
          <input
            type="email"
            value={cfg.teacherEmail}
            onChange={e => onChange("teacherEmail", e.target.value)}
            placeholder="professor@escola.com.br"
            style={{ width: "100%", background: "#020817", border: "1px solid #1e293b", borderRadius: 6, color: "#e2e8f0", padding: "9px 12px", fontSize: 12 }}
          />
        </div>

        <div>
          <button onClick={onSave} disabled={saving || !cfg.resendKey || !cfg.teacherEmail}
            style={{ background: saving ? "#1e293b" : "#052e16", border: "1px solid #166534", color: "#4ade80", padding: "9px 20px", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontSize: 12 }}>
            {saving ? "Salvando..." : "💾 Salvar Configuração"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24, background: "#0a0f1a", borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>O que o email contém</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Nome do aluno e nota final (0–100)", "Duração do lab e critérios automáticos completados", "Todas as respostas do desafio na íntegra", "Histórico dos últimos 20 comandos executados", "Feedback gerado automaticamente"].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#94a3b8" }}>
              <span style={{ color: "#4ade80" }}>✓</span> {item}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, background: "#0a1a0a", border: "1px solid #166534", borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 6 }}>💡 Configuração alternativa via variáveis de ambiente</div>
        <code style={{ fontSize: 10, color: "#94a3b8", display: "block", lineHeight: 1.8 }}>
          RESEND_API_KEY=re_xxx...<br />
          TEACHER_EMAIL=professor@escola.com.br
        </code>
        <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>
          Adicione ao arquivo de serviço systemd em /etc/systemd/system/bgplab-backend.service e execute systemctl daemon-reload && systemctl restart bgplab-backend
        </div>
      </div>
    </Card>
  );
}
