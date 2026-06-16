import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/index.js";
import { useWebSocket, useToasts, useDashboard } from "../hooks/index.js";
import { Badge, Card, CopyButton, Toasts, CapacityBar, StatusBadge } from "./UI.jsx";
import { LABS_META } from "../data/labs.js";

// ─── SessionCard ──────────────────────────────────────────────────────────
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
          <StatusBadge status={session.status} />
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

// ─── SessionDetail ─────────────────────────────────────────────────────────
function SessionDetail({ session, onClose }) {
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
          <h3 style={{ margin: 0, color: "#e2e8f0", fontSize: 15 }}>🔍 {session.studentName}</h3>
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
  const [snapshot, setSnapshot] = useDashboard();
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
  }, [setSnapshot]);

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
  const capacity = snapshot?.maxStudents || 15;

  const EVENT_ICON = { provision_start: "🚀", provision_done: "✅", provision_error: "❌", cleanup_start: "🧹", cleanup_done: "🗑", auto_cleanup: "⏱", command_exec: "💻", submit: "📝", progress: "🎯", session_created: "👤", manual_cleanup: "✂️", teacher_message: "📣" };
  const EVENT_COLOR = { provision_error: "#f87171", auto_cleanup: "#fbbf24", submit: "#4ade80", progress: "#4ade80", provision_done: "#4ade80", provision_start: "#60a5fa" };

  const VIEWS = [
    { id: "overview", label: "📊 Visão Geral" },
    { id: "sessions", label: "👥 Sessões" },
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
          <p style={{ margin: 0, fontSize: 10, color: "#475569" }}>BGP Lab Platform — Monitor em Tempo Real</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <CapacityBar active={active.length} max={capacity} />
          <button onClick={onExit} style={{ background: "none", border: "1px solid #1e293b", color: "#475569", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>← Sair</button>
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
            {selected && <SessionDetail session={selected} onClose={() => setSelected(null)} />}
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
