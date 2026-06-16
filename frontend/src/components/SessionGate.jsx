import { useState } from "react";
import { apiFetch } from "../hooks/index.js";
import { LABS_META, AVAILABLE_LAB_IDS, DIFF_STYLE } from "../data/labs.js";
import { Badge } from "./UI.jsx";

export function SessionGate({ onSession, onTeacher }) {
  const [name, setName]           = useState("");
  const [labId, setLabId]         = useState(1);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [teacherPw, setTeacherPw] = useState("");
  const [showTeacher, setShowTeacher] = useState(false);

  const availableLabs = LABS_META.filter((l) => AVAILABLE_LAB_IDS.includes(l.id));

  const startLab = async () => {
    if (!name.trim()) return setError("Digite seu nome");
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("POST", "/session", { studentName: name.trim(), labId });
      onSession(data.sessionId, name.trim(), labId);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const enterTeacher = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("POST", "/auth/teacher", { password: teacherPw });
      if (res.ok) onTeacher();
    } catch (e) {
      setError(e.message || "Senha incorreta");
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = {
    width: "100%", background: "#020817", border: "1px solid #1e3a5f",
    borderRadius: 8, color: "#e2e8f0", padding: "10px 14px",
    fontSize: 14, fontFamily: "monospace", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#020817", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", padding: 16 }}>
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:translateY(0);} } .gate-card { animation: fadeUp .35s ease; }`}</style>
      <div style={{ width: "100%", maxWidth: 500 }} className="gate-card">

        {/* Logo block */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🌐</div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: "#00d4ff", letterSpacing: 3, textTransform: "uppercase" }}>BGP Lab</h1>
          <p style={{ color: "#475569", margin: "6px 0 0", fontSize: 12, letterSpacing: 1 }}>ContainerLab · FRR · Laboratório Prático de BGP</p>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge style={{ background: "#052e16", color: "#4ade80", border: "1px solid #166534" }}>⚡ Até 15 alunos simultâneos</Badge>
            <Badge style={{ background: "#0d1f3c", color: "#60a5fa", border: "1px solid #1e3a5f" }}>⏱ Auto-cleanup 30 min</Badge>
            <Badge style={{ background: "#2d1b00", color: "#fb923c", border: "1px solid #92400e" }}>🔬 Wireshark/tshark</Badge>
          </div>
        </div>

        {/* ── Student form ── */}
        {!showTeacher ? (
          <div style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: "0 0 20px", color: "#e2e8f0", fontSize: 14, letterSpacing: 1 }}>Entrar no Laboratório</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ color: "#94a3b8", fontSize: 10, display: "block", marginBottom: 6, letterSpacing: 1 }}>SEU NOME</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startLab()}
                placeholder="Ex: João Silva"
                style={fieldStyle}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ color: "#94a3b8", fontSize: 10, display: "block", marginBottom: 8, letterSpacing: 1 }}>ESCOLHA O LABORATÓRIO</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {availableLabs.map((lab) => {
                  const ds = DIFF_STYLE[lab.difficulty];
                  const sel = labId === lab.id;
                  return (
                    <div key={lab.id} onClick={() => setLabId(lab.id)}
                      style={{ padding: "12px 16px", background: sel ? "#0d1f3c" : "#020817", border: `1px solid ${sel ? "#0ea5e9" : "#1e293b"}`, borderRadius: 8, cursor: "pointer", transition: "all .15s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ color: "#60a5fa", fontSize: 11 }}>Lab {lab.id} · </span>
                          <span style={{ color: sel ? "#e2e8f0" : "#94a3b8", fontSize: 13 }}>{lab.title}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Badge style={{ background: ds.bg, color: ds.color, border: `1px solid ${ds.border}` }}>{lab.difficulty}</Badge>
                          <Badge style={{ background: "#0a0f1a", color: "#475569", border: "1px solid #1e293b" }}>{lab.duration}</Badge>
                        </div>
                      </div>
                      <div style={{ color: "#475569", fontSize: 10, marginTop: 4 }}>{lab.topic}</div>
                    </div>
                  );
                })}
                {/* Upcoming labs preview */}
                <div style={{ padding: "10px 14px", background: "#020817", border: "1px dashed #1e293b", borderRadius: 8, opacity: 0.5 }}>
                  <span style={{ color: "#334155", fontSize: 11 }}>Labs 3, 5–8, 10–16 — em breve...</span>
                </div>
              </div>
            </div>

            {error && (
              <div style={{ color: "#f87171", fontSize: 12, marginBottom: 14, padding: "8px 12px", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 6 }}>
                ⚠ {error}
              </div>
            )}

            <button onClick={startLab} disabled={loading}
              style={{ width: "100%", background: loading ? "#1e293b" : "linear-gradient(135deg,#0ea5e9,#6366f1)", color: loading ? "#475569" : "#fff", border: "none", padding: "12px 0", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: "bold", letterSpacing: 1, transition: "all .15s" }}>
              {loading ? "⏳ Provisionando containers..." : "🚀 Iniciar Laboratório"}
            </button>

            <button onClick={() => { setShowTeacher(true); setError(null); }}
              style={{ width: "100%", marginTop: 10, background: "none", border: "1px solid #1e293b", color: "#475569", padding: "8px 0", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
              👨‍🏫 Acesso do Professor
            </button>
          </div>
        ) : (
          /* ── Teacher login ── */
          <div style={{ background: "#0f172a", border: "1px solid #92400e", borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: "0 0 16px", color: "#fb923c", fontSize: 14 }}>👨‍🏫 Painel do Professor</h3>
            <input
              type="password"
              value={teacherPw}
              onChange={(e) => setTeacherPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enterTeacher()}
              placeholder="Senha de acesso"
              style={{ ...fieldStyle, marginBottom: 12 }}
              autoFocus
            />
            {error && (
              <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>⚠ {error}</div>
            )}
            <button onClick={enterTeacher}
              style={{ width: "100%", background: "linear-gradient(135deg,#f97316,#ef4444)", color: "#fff", border: "none", padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, marginBottom: 8 }}>
              Entrar como Professor
            </button>
            <button onClick={() => { setShowTeacher(false); setError(null); }}
              style={{ width: "100%", background: "none", border: "1px solid #1e293b", color: "#475569", padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
              ← Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
