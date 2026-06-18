import { useEffect, useState } from "react";
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
  const [apiLabs, setApiLabs] = useState(null);
  const [publicConfig, setPublicConfig] = useState(null);

  useEffect(() => {
    apiFetch("GET", "/labs")
      .then((labs) => {
        setApiLabs(labs);
        if (labs.length && !labs.some((lab) => lab.id === labId))
          setLabId(labs[0].id);
      })
      .catch(() => {});

    apiFetch("GET", "/config/public")
      .then(setPublicConfig)
      .catch(() => {});
  }, []);

  const availableLabs = apiLabs?.length
    ? apiLabs
    : LABS_META.filter((l) => AVAILABLE_LAB_IDS.includes(l.id));
  const selectedLab = availableLabs.find((lab) => lab.id === labId) || availableLabs[0];
  const selectedStyle = DIFF_STYLE[selectedLab?.difficulty] || DIFF_STYLE.Iniciante;

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
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:translateY(0);} }
        .gate-card { animation: fadeUp .35s ease; }
        .student-grid { display:grid; grid-template-columns: minmax(260px, .82fr) minmax(320px, 1.18fr); gap:16px; align-items:start; }
        .lab-picker-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:8px; }
        @media (max-width: 760px) {
          .student-grid { grid-template-columns: 1fr; }
          .lab-picker-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 420px) {
          .lab-picker-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: showTeacher ? 500 : 860 }} className="gate-card">

        {/* Logo block */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>🌐</div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: "#00d4ff", letterSpacing: 3, textTransform: "uppercase" }}>BGP Lab</h1>
          <p style={{ color: "#475569", margin: "6px 0 0", fontSize: 12, letterSpacing: 1 }}>ContainerLab · FRR · Laboratório Prático de BGP</p>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge style={{ background: "#052e16", color: "#4ade80", border: "1px solid #166534" }}>
              ⚡ {publicConfig?.maxStudents ? `Até ${publicConfig.maxStudents} alunos simultâneos` : "Capacidade configurada no servidor"}
            </Badge>
            <Badge style={{ background: "#0d1f3c", color: "#60a5fa", border: "1px solid #1e3a5f" }}>⏱ Auto-cleanup 30 min</Badge>
            <Badge style={{ background: "#2d1b00", color: "#fb923c", border: "1px solid #92400e" }}>🔬 Wireshark/tshark</Badge>
          </div>
        </div>

        {/* ── Student form ── */}
        {!showTeacher ? (
          <div style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 12, padding: 24 }}>
            <div className="student-grid">
              <div>
                <h3 style={{ margin: "0 0 16px", color: "#e2e8f0", fontSize: 14, letterSpacing: 1 }}>Entrar no Laboratório</h3>

                <div style={{ marginBottom: 14 }}>
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

                {selectedLab && (
                  <div style={{ background: "#020817", border: "1px solid #1e3a5f", borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ color: "#60a5fa", fontSize: 11, marginBottom: 6 }}>LAB {selectedLab.id} SELECIONADO</div>
                    <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>{selectedLab.title}</div>
                    <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.5, marginTop: 6 }}>{selectedLab.topic}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      <Badge style={{ background: selectedStyle.bg, color: selectedStyle.color, border: `1px solid ${selectedStyle.border}` }}>{selectedLab.difficulty}</Badge>
                      <Badge style={{ background: "#0a0f1a", color: "#94a3b8", border: "1px solid #1e293b" }}>{selectedLab.duration}</Badge>
                      <Badge style={{ background: "#111827", color: "#9ca3af", border: "1px solid #374151" }}>{selectedLab.routerCount || selectedLab.routers?.length || "?"} FRR</Badge>
                    </div>
                  </div>
                )}

                {error && (
                  <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12, padding: "8px 12px", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 6 }}>
                    ⚠ {error}
                  </div>
                )}

                <button onClick={startLab} disabled={loading}
                  style={{ width: "100%", background: loading ? "#1e293b" : "linear-gradient(135deg,#0ea5e9,#6366f1)", color: loading ? "#475569" : "#fff", border: "none", padding: "12px 0", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: "bold", letterSpacing: 1, transition: "all .15s" }}>
                  {loading ? "⏳ Provisionando containers..." : "🚀 Iniciar Laboratório"}
                </button>

                <button onClick={() => { setShowTeacher(true); setError(null); }}
                  style={{ width: "100%", marginTop: 10, background: "none", border: "1px solid #1e293b", color: "#64748b", padding: "8px 0", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                  👨‍🏫 Acesso do Professor
                </button>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <label style={{ color: "#94a3b8", fontSize: 10, letterSpacing: 1 }}>ESCOLHA O LABORATÓRIO</label>
                  <span style={{ color: "#475569", fontSize: 10 }}>{availableLabs.length} disponíveis</span>
                </div>
                <div className="lab-picker-grid">
                  {availableLabs.map((lab) => {
                    const ds = DIFF_STYLE[lab.difficulty] || DIFF_STYLE.Iniciante;
                    const sel = labId === lab.id;
                    return (
                      <button key={lab.id} type="button" onClick={() => setLabId(lab.id)}
                        style={{
                          minHeight: 96,
                          textAlign: "left",
                          padding: 12,
                          background: sel ? "#0d1f3c" : "#020817",
                          border: `1px solid ${sel ? "#0ea5e9" : "#1e293b"}`,
                          borderRadius: 8,
                          cursor: "pointer",
                          transition: "all .15s",
                          boxShadow: sel ? "0 0 0 1px rgba(14,165,233,.25)" : "none",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ color: sel ? "#67e8f9" : "#60a5fa", fontSize: 12, fontWeight: 800 }}>Lab {lab.id}</span>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: sel ? "#22d3ee" : "#1e293b", flexShrink: 0 }} />
                        </div>
                        <div style={{ color: sel ? "#e2e8f0" : "#94a3b8", fontSize: 12, lineHeight: 1.3, fontWeight: 700, minHeight: 32 }}>
                          {lab.title}
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 9 }}>
                          <Badge style={{ background: ds.bg, color: ds.color, border: `1px solid ${ds.border}` }}>{lab.difficulty}</Badge>
                          <Badge style={{ background: "#0a0f1a", color: "#64748b", border: "1px solid #1e293b" }}>{lab.duration}</Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!apiLabs?.length && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#020817", border: "1px dashed #1e293b", borderRadius: 8, opacity: 0.65 }}>
                    <span style={{ color: "#475569", fontSize: 11 }}>Usando catálogo local até a API responder.</span>
                  </div>
                )}
              </div>
            </div>
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
