import { useEffect, useState, Fragment } from "react";
import { apiFetch, TEACHER_TOKEN_KEY } from "../hooks/index.js";
import { LABS_META, AVAILABLE_LAB_IDS, DIFF_STYLE } from "../data/labs.js";
import { Badge } from "./UI.jsx";

// Ordem da escala evolutiva: OSPF (fundamentos → avançado) → BGP (fundamentos → avançado) → OSPF+BGP (integração)
const PROTOCOL_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "ospf", label: "OSPF" },
  { key: "bgp", label: "BGP" },
  { key: "bgp+ospf", label: "BGP + OSPF" },
];

const TRACK_LABEL = {
  ospf: "🟢 OSPF — do básico ao avançado",
  bgp: "🔵 BGP — do básico ao avançado",
  "bgp+ospf": "🟣 OSPF + BGP — integração",
};

export function SessionGate({ onSession, onTeacher, resumable, onResume, onForgetResumable, onResumeByLookup }) {
  const [name, setName]           = useState("");
  const [matricula, setMatricula] = useState("");
  const [labId, setLabId]         = useState(1);
  const [protocolFilter, setProtocolFilter] = useState("all");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [teacherPw, setTeacherPw] = useState("");
  const [showTeacher, setShowTeacher] = useState(false);
  const [apiLabs, setApiLabs] = useState(null);
  const [publicConfig, setPublicConfig] = useState(null);
  const [previewLab, setPreviewLab] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLookup, setShowLookup] = useState(false);
  const [lookupName, setLookupName] = useState("");
  const [lookupMatricula, setLookupMatricula] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [lookupMatches, setLookupMatches] = useState(null);

  const runLookup = async () => {
    if (!lookupName.trim() && !lookupMatricula.trim()) return setLookupError("Digite seu nome e/ou matrícula");
    setLookupLoading(true);
    setLookupError(null);
    setLookupMatches(null);
    try {
      const params = new URLSearchParams();
      if (lookupName.trim()) params.set("name", lookupName.trim());
      if (lookupMatricula.trim()) params.set("matricula", lookupMatricula.trim());
      const data = await apiFetch("GET", `/session/lookup?${params.toString()}`);
      if (data.matches.length === 1) {
        const m = data.matches[0];
        onResumeByLookup(m.sessionId, m.studentName, m.labId);
      } else {
        setLookupMatches(data.matches);
      }
    } catch (e) {
      setLookupError(e.status === 404 ? "Nenhuma sessão ativa encontrada com esses dados" : e.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const openPreview = async (id) => {
    setPreviewLoading(true);
    setPreviewLab(null);
    try {
      const data = await apiFetch("GET", `/labs/${id}`);
      setPreviewLab(data);
    } catch {
      setPreviewLab({ title: "Não foi possível carregar a prévia deste lab." });
    } finally {
      setPreviewLoading(false);
    }
  };

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

  const allLabs = apiLabs?.length
    ? apiLabs
    : LABS_META.filter((l) => AVAILABLE_LAB_IDS.includes(l.id));
  // Escala evolutiva: OSPF (fundamentos → avançado) → BGP (fundamentos → avançado) → OSPF+BGP (integração)
  const PROTOCOL_ORDER = { ospf: 0, bgp: 1, "bgp+ospf": 2 };
  const availableLabs = (protocolFilter === "all"
    ? allLabs
    : allLabs.filter((lab) => (lab.protocol || "bgp") === protocolFilter))
    .slice()
    .sort((a, b) => {
      const pa = PROTOCOL_ORDER[a.protocol || "bgp"] ?? 9;
      const pb = PROTOCOL_ORDER[b.protocol || "bgp"] ?? 9;
      if (pa !== pb) return pa - pb;
      return (a.level ?? 1) - (b.level ?? 1);
    });
  const selectedLab = availableLabs.find((lab) => lab.id === labId) || availableLabs[0];
  const selectedStyle = DIFF_STYLE[selectedLab?.difficulty] || DIFF_STYLE.Iniciante;

  // Se o filtro de protocolo tira o lab selecionado da lista, seleciona o primeiro visível
  useEffect(() => {
    if (availableLabs.length && !availableLabs.some((lab) => lab.id === labId)) {
      setLabId(availableLabs[0].id);
    }
  }, [protocolFilter]); // eslint-disable-line

  const startLab = async () => {
    if (!name.trim()) return setError("Digite seu nome");
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("POST", "/session", {
        studentName: name.trim(),
        labId,
        matricula: matricula.trim() || undefined,
      });
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
      if (res.ok) {
        localStorage.setItem(TEACHER_TOKEN_KEY, res.token);
        onTeacher();
      }
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
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: "#00d4ff", letterSpacing: 3, textTransform: "uppercase" }}>LabNet</h1>
          <p style={{ color: "#475569", margin: "6px 0 0", fontSize: 12, letterSpacing: 1 }}>ContainerLab · FRR · Laboratórios de Roteamento</p>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge style={{ background: "#052e16", color: "#4ade80", border: "1px solid #166534" }}>
              ⚡ {publicConfig?.maxStudents ? `Até ${publicConfig.maxStudents} alunos simultâneos` : "Capacidade configurada no servidor"}
            </Badge>
            <Badge style={{ background: "#0d1f3c", color: "#60a5fa", border: "1px solid #1e3a5f" }}>⏱ Auto-cleanup 30 min</Badge>
            <Badge style={{ background: "#2d1b00", color: "#fb923c", border: "1px solid #92400e" }}>🔬 Wireshark/tshark</Badge>
          </div>

          <p style={{ color: "#64748b", fontSize: 12, lineHeight: 1.7, margin: "16px auto 0", maxWidth: 620 }}>
            O LabNet foi desenvolvido pelo <strong style={{ color: "#94a3b8" }}>Prof. Wendell Rodrigues</strong>,
            do <strong style={{ color: "#94a3b8" }}>Departamento de Telemática</strong> e do{" "}
            <strong style={{ color: "#94a3b8" }}>Laboratório de Inovação Tecnológica (LIT)</strong> do IFCE,
            para o aprendizado prático dos protocolos de roteamento{" "}
            <strong style={{ color: "#60a5fa" }}>OSPF</strong> (intradomínio, IGP) e{" "}
            <strong style={{ color: "#a78bfa" }}>BGP</strong> (interdomínio, EGP).
          </p>

          <button type="button" onClick={() => setShowAbout((v) => !v)}
            style={{ marginTop: 8, background: "none", border: "none", color: "#0ea5e9", cursor: "pointer", fontSize: 11 }}>
            {showAbout ? "▲ Ocultar" : "▼ Saiba mais sobre o LabNet"}
          </button>

          {showAbout && (
            <div style={{ margin: "10px auto 0", maxWidth: 620, background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 10, padding: 16, textAlign: "left" }}>
              <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.8, margin: 0 }}>
                Cada roteiro sobe roteadores <strong style={{ color: "#e2e8f0" }}>FRR reais</strong>, dentro de
                topologias isoladas por aluno provisionadas via <strong style={{ color: "#e2e8f0" }}>Containerlab/Docker</strong>.
                Não é simulação nem slide — é configuração de verdade, com sessões que precisam convergir e
                falhas que precisam ser diagnosticadas, do mesmo jeito que em uma rede de produção.
              </p>
              <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.8, margin: "10px 0 0" }}>
                A avaliação combina roteiro guiado, previsão do resultado antes de verificar (pra estimular
                raciocínio, não só digitação), e um desafio final com parâmetros únicos por aluno — cada sessão
                recebe sua própria combinação de valores, então não dá pra só copiar a resposta do colega.
              </p>
            </div>
          )}
        </div>

        {/* ── Banner de sessão retomável ── */}
        {resumable && !showTeacher && (
          <div style={{ background: "#0d1f3c", border: "1px solid #0ea5e9", borderRadius: 10, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18 }}>📎</span>
            <span style={{ color: "#e2e8f0", fontSize: 12, flex: 1, minWidth: 200 }}>
              Você tem uma sessão em andamento — <strong>Lab {resumable.labId}</strong>. Ela continua rodando mesmo com você aqui.
            </span>
            <button onClick={onResume}
              style={{ background: "linear-gradient(135deg,#0ea5e9,#6366f1)", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>
              Voltar para o lab
            </button>
            <button onClick={onForgetResumable}
              style={{ background: "none", border: "1px solid #1e3a5f", color: "#64748b", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              Esquecer
            </button>
          </div>
        )}

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

                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: "#94a3b8", fontSize: 10, display: "block", marginBottom: 6, letterSpacing: 1 }}>MATRÍCULA (OPCIONAL)</label>
                  <input
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && startLab()}
                    placeholder="Ex: 2023012345"
                    style={fieldStyle}
                  />
                </div>

                {selectedLab && (
                  <div style={{ background: "#020817", border: "1px solid #1e3a5f", borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ color: "#60a5fa", fontSize: 11, marginBottom: 6 }}>LAB {selectedLab.id} SELECIONADO</div>
                    <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>{selectedLab.title}</div>
                    <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.5, marginTop: 6 }}>{selectedLab.topic}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                      <Badge style={{ background: selectedStyle.bg, color: selectedStyle.color, border: `1px solid ${selectedStyle.border}` }}>{selectedLab.difficulty}</Badge>
                      <Badge style={{ background: "#0a0f1a", color: "#94a3b8", border: "1px solid #1e293b" }}>{selectedLab.duration}</Badge>
                      <Badge style={{ background: "#111827", color: "#9ca3af", border: "1px solid #374151" }}>{selectedLab.routerCount || selectedLab.routers?.length || "?"} FRR</Badge>
                      <button type="button" onClick={() => openPreview(selectedLab.id)}
                        style={{ marginLeft: "auto", background: "none", border: "1px solid #1e3a5f", color: "#60a5fa", padding: "3px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11 }}>
                        👁 Ver conteúdo
                      </button>
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

                {!resumable && (
                  <button type="button" onClick={() => { setShowLookup((v) => !v); setLookupError(null); setLookupMatches(null); }}
                    style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "#0ea5e9", cursor: "pointer", fontSize: 11 }}>
                    {showLookup ? "▲ Ocultar" : "🔎 Já tinha uma sessão? Reconectar"}
                  </button>
                )}

                {showLookup && (
                  <div style={{ marginTop: 8, background: "#020817", border: "1px solid #1e3a5f", borderRadius: 8, padding: 12 }}>
                    <input value={lookupName} onChange={(e) => setLookupName(e.target.value)}
                      placeholder="Seu nome" style={{ ...fieldStyle, marginBottom: 8, padding: "7px 10px", fontSize: 12 }} />
                    <input value={lookupMatricula} onChange={(e) => setLookupMatricula(e.target.value)}
                      placeholder="Matrícula (opcional)" style={{ ...fieldStyle, marginBottom: 8, padding: "7px 10px", fontSize: 12 }} />
                    {lookupError && <div style={{ color: "#f87171", fontSize: 11, marginBottom: 8 }}>⚠ {lookupError}</div>}
                    {lookupMatches?.length > 1 && (
                      <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>Mais de uma sessão encontrada — escolha a sua:</div>
                        {lookupMatches.map((m) => (
                          <button key={m.sessionId} type="button" onClick={() => onResumeByLookup(m.sessionId, m.studentName, m.labId)}
                            style={{ textAlign: "left", background: "#0a0f1a", border: "1px solid #1e293b", color: "#e2e8f0", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                            {m.studentName} {m.matricula && `(${m.matricula})`} — Lab {m.labId}
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={runLookup} disabled={lookupLoading}
                      style={{ width: "100%", background: lookupLoading ? "#1e293b" : "#0d1f3c", border: "1px solid #1e3a5f", color: "#60a5fa", padding: "7px 0", borderRadius: 6, cursor: lookupLoading ? "not-allowed" : "pointer", fontSize: 12 }}>
                      {lookupLoading ? "Buscando..." : "Buscar minha sessão"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <label style={{ color: "#94a3b8", fontSize: 10, letterSpacing: 1 }}>ESCOLHA O LABORATÓRIO</label>
                  <span style={{ color: "#475569", fontSize: 10 }}>{availableLabs.length} disponíveis</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {PROTOCOL_FILTERS.map((f) => {
                    const active = protocolFilter === f.key;
                    return (
                      <button key={f.key} type="button" onClick={() => setProtocolFilter(f.key)}
                        style={{
                          background: active ? "#0d1f3c" : "#020817",
                          border: `1px solid ${active ? "#0ea5e9" : "#1e293b"}`,
                          color: active ? "#67e8f9" : "#64748b",
                          padding: "4px 12px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 500,
                        }}>
                        {f.label}
                      </button>
                    );
                  })}
                </div>
                <div className="lab-picker-grid">
                  {availableLabs.map((lab, i) => {
                    const ds = DIFF_STYLE[lab.difficulty] || DIFF_STYLE.Iniciante;
                    const sel = labId === lab.id;
                    const prevProtocol = i > 0 ? (availableLabs[i - 1].protocol || "bgp") : null;
                    const curProtocol = lab.protocol || "bgp";
                    const showTrackLabel = protocolFilter === "all" && curProtocol !== prevProtocol;
                    return (
                      <Fragment key={lab.id}>
                        {showTrackLabel && (
                          <div key={`track-${curProtocol}`} style={{ gridColumn: "1 / -1", color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginTop: i === 0 ? 0 : 6, paddingBottom: 2, borderBottom: "1px solid #1e293b" }}>
                            {TRACK_LABEL[curProtocol] || curProtocol}
                          </div>
                        )}
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
                            {lab.level > 0 && <Badge style={{ background: "#1e1b4b", color: "#a78bfa", border: "1px solid #3730a3" }}>Nível {lab.level}</Badge>}
                          </div>
                          <div style={{ color: sel ? "#e2e8f0" : "#94a3b8", fontSize: 12, lineHeight: 1.3, fontWeight: 700, minHeight: 32 }}>
                            {lab.title}
                          </div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 9 }}>
                            <Badge style={{ background: ds.bg, color: ds.color, border: `1px solid ${ds.border}` }}>{lab.difficulty}</Badge>
                            <Badge style={{ background: "#0a0f1a", color: "#64748b", border: "1px solid #1e293b" }}>{lab.duration}</Badge>
                          </div>
                        </button>
                      </Fragment>
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

      {/* ── Modal de prévia do lab (sem provisionar) ── */}
      {(previewLab || previewLoading) && (
        <div onClick={() => setPreviewLab(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(2,8,23,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 12, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 24 }}>
            {previewLoading ? (
              <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "30px 0" }}>⟳ Carregando prévia...</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <h2 style={{ margin: 0, color: "#00d4ff", fontSize: 18 }}>{previewLab.title}</h2>
                  <button onClick={() => setPreviewLab(null)}
                    style={{ background: "none", border: "1px solid #1e293b", color: "#475569", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
                {previewLab.topic && <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 14px" }}>{previewLab.topic}</p>}

                {previewLab.scenario && (
                  <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: "10px 14px", marginBottom: 18 }}>
                    <div style={{ color: "#4ade80", fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🌍 Cenário Real</div>
                    <p style={{ color: "#86efac", fontSize: 12, lineHeight: 1.6, margin: 0 }}>{previewLab.scenario}</p>
                  </div>
                )}

                {previewLab.steps?.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ color: "#60a5fa", fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                      📋 Roteiro ({previewLab.steps.length} passos)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {previewLab.steps.map((s, i) => (
                        <div key={s.id ?? i} style={{ background: "#020817", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{i + 1}. {s.title}</div>
                          {s.theory && <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6, margin: 0 }}>{s.theory}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {previewLab.challenge && (
                  <div>
                    <div style={{ color: "#fb923c", fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                      🏆 {previewLab.challenge.title || "Desafio Final"}
                    </div>
                    <pre style={{ color: "#fcd34d", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, background: "#1a0a00", border: "1px solid #92400e", borderRadius: 8, padding: 14 }}>
                      {previewLab.challenge.description}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
