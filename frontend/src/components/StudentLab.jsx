import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { apiFetch } from "../hooks/index.js";
import { useWebSocket, useToasts, useTerminal } from "../hooks/index.js";
import { LABS_META, LAB_STEPS, LAB_CHALLENGES } from "../data/labs.js";
import { Badge, Card, CopyButton, Toasts, TermLine, ProvisioningScreen, ErrorScreen } from "./UI.jsx";
import { TopologyDiagram } from "./TopologyDiagram.jsx";
import { PacketAnalyzer } from "./PacketAnalyzer.jsx";
import XTerminalBase from "./XTerminal.jsx";

// ─── CommandBlock ──────────────────────────────────────────────────────────
// Sem botão Executar — aluno deve digitar no terminal (abordagem pedagógica)
function CommandBlock({ entry }) {
  return (
    <div style={{ marginBottom: 10, background: "#0a0f1a", borderRadius: 8, overflow: "hidden", border: "1px solid #1e293b" }}>
      <div style={{ padding: "5px 12px", background: "#020817", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Badge style={{ background: "#0d1f3c", color: "#60a5fa", border: "1px solid #1e3a5f" }}>{entry.router}</Badge>
          {entry.desc && <span style={{ color: "#475569", fontSize: 10 }}>{entry.desc}</span>}
        </div>
        <CopyButton text={entry.cmd} />
      </div>
      <pre style={{ margin: 0, padding: "10px 14px", fontSize: 10, overflowX: "auto", lineHeight: 1.6 }}>
        {entry.cmd.split("\n").map((line, i) => (
          <span key={i} style={{ display: "block", color: i === 0 ? "#4ade80" : "#94a3b8" }}>{line}</span>
        ))}
      </pre>
    </div>
  );
}

// ─── RoteiroTab ───────────────────────────────────────────────────────────
function RoteiroTab({ labId, step, setStep, onRunCmd, progress, onGoChallenge }) {
  const [labData, setLabData] = useState(null);

  // Busca dados do lab no backend (fonte autoritativa)
  // Fallback para dados estáticos do frontend se API falhar
  useEffect(() => {
    apiFetch("GET", `/labs/${labId}`)
      .then(d => setLabData(d))
      .catch(() => {});
  }, [labId]);

  const steps     = labData?.steps     || LAB_STEPS[labId]     || [];
  const challenge = labData?.challenge || LAB_CHALLENGES[labId] || { title: "", description: "", questions: [], hints: [] };

  if (!steps.length)
    return <div style={{ padding: 24, color: "#475569" }}>Roteiro em preparação para este laboratório.</div>;

  const safeStep = Math.min(step, steps.length - 1);
  const cur = steps[safeStep];
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "190px 1fr", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ background: "#0a0f1a", borderRight: "1px solid #1e293b", overflowY: "auto" }}>
        {steps.map((s, i) => {
          const done = progress[`step_${s.id}`]?.completed;
          return (
            <div key={i} onClick={() => setStep(i)}
              style={{ padding: "12px 14px", borderBottom: "1px solid #1e293b", cursor: "pointer", background: safeStep === i ? "#0d1f3c" : "transparent", borderLeft: safeStep === i ? "3px solid #00d4ff" : "3px solid transparent" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: done ? "#166534" : safeStep === i ? "#0ea5e9" : "#1e293b", color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  {done ? "✓" : i + 1}
                </span>
                <span style={{ color: safeStep === i ? "#e2e8f0" : "#64748b", fontSize: 11, lineHeight: 1.3 }}>{s.title}</span>
              </div>
            </div>
          );
        })}
        <div onClick={onGoChallenge}
          style={{ padding: "12px 14px", cursor: "pointer", background: "#1a0a00", borderLeft: "3px solid #fb923c" }}>
          <span style={{ color: "#fb923c", fontSize: 11 }}>🏆 Desafio Final</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#0ea5e9,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", flexShrink: 0 }}>{safeStep + 1}</span>
          <h3 style={{ margin: 0, color: "#e2e8f0", fontSize: 16 }}>{cur.title}</h3>
        </div>

        {/* Teoria / descrição do passo */}
        {cur.description && (
          <div style={{ background: "#0a0f1a", border: "1px solid #1e3a5f", borderRadius: 10, padding: "14px 18px", margin: "0 0 18px" }}>
            {cur.theory && (
              <div style={{ borderLeft: "3px solid #0ea5e9", paddingLeft: 12, marginBottom: 14 }}>
                <div style={{ color: "#60a5fa", fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>📖 Conceito</div>
                <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.8, margin: 0 }}>{cur.theory}</p>
              </div>
            )}
            <div style={{ borderLeft: "3px solid #6366f1", paddingLeft: 12 }}>
              <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>🎯 Objetivo</div>
              <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{cur.description}</p>
            </div>
          </div>
        )}

        {/* Comandos para verificação */}
        {cur.commands?.length > 0 && (
          <>
            <div style={{ color: "#475569", fontSize: 10, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>
              💻 Comandos — execute no terminal e observe o resultado:
            </div>
            {cur.commands.map((c, i) => (
              <CommandBlock key={i} entry={c} />
            ))}
          </>
        )}

        {/* Resultado esperado */}
        <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: 12, margin: "14px 0" }}>
          <div style={{ color: "#4ade80", fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>✓ Resultado Esperado:</div>
          <div style={{ color: "#86efac", fontSize: 12, lineHeight: 1.6 }}>{cur.expected}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => setStep(Math.max(0, safeStep - 1))} disabled={safeStep === 0}
            style={{ background: safeStep === 0 ? "#0a0f1a" : "#0f172a", border: "1px solid #1e293b", color: safeStep === 0 ? "#1e293b" : "#60a5fa", padding: "7px 16px", borderRadius: 6, cursor: safeStep === 0 ? "not-allowed" : "pointer", fontSize: 12 }}>
            ← Anterior
          </button>
          {safeStep < steps.length - 1 ? (
            <button onClick={() => setStep(safeStep + 1)}
              style={{ background: "linear-gradient(135deg,#0ea5e9,#6366f1)", color: "#fff", border: "none", padding: "7px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              Próximo Passo →
            </button>
          ) : (
            <button onClick={onGoChallenge}
              style={{ background: "linear-gradient(135deg,#f97316,#ef4444)", color: "#fff", border: "none", padding: "7px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              🏆 Desafio Final →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TerminalTab — usa XTerminal (xterm.js via npm) ─────────────────────────
function TerminalTab({ sessionId, containers, injectRef, active, sessionReady }) {
  const [router, setRouter] = useState("R1");
  const [status, setStatus] = useState("idle");
  const termRefs = useRef({});

  const routers = containers.length
    ? containers.map((c) => c.split("-").pop().toUpperCase()).filter(Boolean)
    : ["R1", "R2", "R3", "R4"];

  // Auto-conecta todos os roteadores quando o lab fica pronto
  const autoConnected = useRef(false);
  useEffect(() => {
    if (!sessionReady || !sessionId || autoConnected.current) return;
    autoConnected.current = true;
    // Conecta em sequência com delay para não sobrecarregar o backend
    routers.forEach((r, i) => {
      setTimeout(() => {
        const el = termRefs.current[r];
        if (el && el.status === "idle") el.connect();
      }, i * 800); // 800ms entre cada roteador
    });
  }, [sessionReady, sessionId]);

  // Reconecta se a sessão mudar (ex: reload da página recuperou sessão)
  useEffect(() => {
    if (!sessionReady || !sessionId) return;
    // Pequeno delay para o XTerminal montar
    const t = setTimeout(() => {
      routers.forEach((r, i) => {
        setTimeout(() => {
          const el = termRefs.current[r];
          if (el && el.status === "idle") el.connect();
        }, i * 800);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [sessionId]); // eslint-disable-line

  // Registra inject para botoes do roteiro
  useEffect(() => {
    if (!injectRef) return;
    injectRef.current = (targetRouter, cmd) => {
      setRouter(targetRouter);
      setTimeout(() => {
        const el = termRefs.current[targetRouter];
        if (el) {
          if (el.status !== "connected") {
            el.connect();
            setTimeout(() => el.inject(cmd), 1500);
          } else {
            el.inject(cmd);
          }
        }
      }, 120);
    };
    return () => { if (injectRef) injectRef.current = null; };
  }, [injectRef]);

  const getEl = (r) => termRefs.current[r || router];

  const handleConnect = () => {
    getEl()?.connect();
    setStatus("connecting");
    const t = setInterval(() => {
      const s = getEl()?.status || "idle";
      setStatus(s);
      if (s !== "connecting") clearInterval(t);
    }, 200);
  };

  const handleDisconnect = () => {
    getEl()?.disconnect();
    setStatus("idle");
  };

  // Atualiza status quando troca de roteador ou quando algum conecta
  useEffect(() => { setStatus(getEl()?.status || "idle"); }, [router]);
  useEffect(() => {
    const t = setInterval(() => {
      const s = getEl()?.status || "idle";
      setStatus(prev => prev !== s ? s : prev);
    }, 1000);
    return () => clearInterval(t);
  }, [router]);

  const ST = {
    idle:       { color: "#475569", label: "⬤ Desconectado" },
    connecting: { color: "#fbbf24", label: "⬤ Conectando..." },
    connected:  { color: "#4ade80", label: "⬤ Conectado" },
    error:      { color: "#f87171", label: "⬤ Erro" },
  };
  const st = ST[status] || ST.idle;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#020817" }}>
      <div style={{ background: "#0a0f1a", borderBottom: "1px solid #1e293b", padding: "6px 12px", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        {routers.map((r) => {
          const rEl = termRefs.current[r];
          const rStatus = rEl?.status || "idle";
          const rColor = { connected: "#4ade80", connecting: "#fbbf24", error: "#f87171", idle: "#334155" }[rStatus] || "#334155";
          const isActive = router === r;
          return (
            <button key={r} onClick={() => setRouter(r)}
              style={{ background: isActive ? "#0d1f3c" : "none", border: `1px solid ${isActive ? "#0ea5e9" : "#1e293b"}`, color: isActive ? "#00d4ff" : "#475569", padding: "4px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: rColor, display: "inline-block", flexShrink: 0 }} />
              {r}
            </button>
          );
        })}
        <div style={{ width: 1, height: 20, background: "#1e293b", margin: "0 4px" }} />
        {/* Botão manual só aparece se não auto-conectado */}
        {status !== "connected" && status !== "connecting" && (
          <button onClick={handleConnect} disabled={!sessionId}
            style={{ background: sessionId ? "#052e16" : "#0a0f1a", border: `1px solid ${sessionId ? "#166534" : "#1e293b"}`, color: sessionId ? "#4ade80" : "#334155", padding: "4px 14px", borderRadius: 6, cursor: sessionId ? "pointer" : "not-allowed", fontSize: 12 }}>
            ▶ Reconectar
          </button>
        )}
        {status === "connected" && (
          <span style={{ color: "#4ade80", fontSize: 11 }}>⬤ Conectado</span>
        )}
        {status === "connecting" && (
          <span style={{ color: "#fbbf24", fontSize: 11 }}>⬤ Conectando...</span>
        )}
        <button onClick={() => getEl()?.clear()}
          style={{ marginLeft: "auto", background: "none", border: "1px solid #1e293b", color: "#334155", padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontSize: 10 }}>
          ⌫ Limpar
        </button>
        <span style={{ color: "#1e293b", fontSize: 10 }}>Ctrl+D sai do vtysh</span>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {routers.map((r) => (
          <div key={r} style={{ position: "absolute", inset: 0, display: router === r ? "block" : "none" }}>
            <XTerminalBase
              ref={(el) => { termRefs.current[r] = el; }}
              sessionId={sessionId}
              router={r}
              active={active && router === r}
            />
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── ChallengeTab ─────────────────────────────────────────────────────────
function ChallengeTab({ labId, sessionId, onSubmitDone }) {
  const [labData, setLabData]   = useState(null);
  const [answers, setAnswers]   = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult]     = useState(null);
  const [hint, setHint]         = useState(false);
  const [loading, setLoading]   = useState(false);

  // Busca dados do lab no backend
  useEffect(() => {
    apiFetch("GET", `/labs/${labId}`)
      .then(d => setLabData(d))
      .catch(() => {});
  }, [labId]);

  const challenge = labData?.challenge || LAB_CHALLENGES[labId];

  const submit = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("POST", `/session/${sessionId}/submit`, { answers });
      setResult(res);
      setSubmitted(true);
      onSubmitDone?.(res.score);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!challenge) return <div style={{ padding: 24, color: "#475569" }}>Desafio em preparação.</div>;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      {/* Challenge description */}
      <div style={{ background: "linear-gradient(135deg,#2d1b00,#1a0a00)", border: "1px solid #92400e", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", color: "#fb923c", fontSize: 17 }}>🏆 {challenge.title}</h2>
        <pre style={{ margin: 0, color: "#fcd34d", fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{challenge.description}</pre>
        <button onClick={() => setHint(!hint)}
          style={{ marginTop: 16, background: "#422006", border: "1px solid #92400e", color: "#fb923c", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
          {hint ? "▼ Ocultar Dicas" : "▶ Ver Dicas"}
        </button>
        {hint && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {challenge.hints.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "7px 12px", background: "#1a0a00", borderRadius: 6 }}>
                <span style={{ color: "#fb923c", flexShrink: 0 }}>💡</span>
                <span style={{ color: "#fed7aa", fontSize: 12 }}>{h}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!submitted ? (
        <Card>
          <h3 style={{ margin: "0 0 16px", color: "#60a5fa", fontSize: 14 }}>📝 Questões de Avaliação</h3>
          {challenge.questions.map((q, qi) => (
            <div key={q.id} style={{ marginBottom: 18, padding: 14, background: "#020817", borderRadius: 10, border: "1px solid #1e293b" }}>
              <div style={{ color: "#e2e8f0", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                <span style={{ color: "#60a5fa", fontWeight: "bold", marginRight: 8 }}>{qi + 1}.</span>
                {q.text}
              </div>
              {q.type === "text" ? (
                <textarea
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder={q.placeholder}
                  rows={4}
                  style={{ width: "100%", background: "#0a0f1a", border: "1px solid #1e3a5f", borderRadius: 6, color: "#e2e8f0", padding: "8px 12px", fontSize: 12, resize: "vertical", fontFamily: "monospace", boxSizing: "border-box" }}
                />
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {q.options.map((opt) => {
                    const sel = answers[q.id] === opt;
                    return (
                      <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: sel ? "#0d1f3c" : "#0a0f1a", border: `1px solid ${sel ? "#0ea5e9" : "#1e293b"}`, padding: "5px 12px", borderRadius: 20 }}>
                        <input type="radio" name={q.id} checked={sel} onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))} style={{ accentColor: "#0ea5e9" }} />
                        <span style={{ color: sel ? "#60a5fa" : "#94a3b8", fontSize: 12 }}>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <button onClick={submit} disabled={loading}
            style={{ background: loading ? "#1e293b" : "linear-gradient(135deg,#059669,#0d9488)", color: "#fff", border: "none", padding: "11px 28px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: "bold" }}>
            {loading ? "Enviando..." : "✓ Enviar Respostas"}
          </button>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Score card */}
          <div style={{ background: result?.score >= 75 ? "#052e16" : result?.score >= 55 ? "#1c1a00" : "#450a0a", border: `1px solid ${result?.score >= 75 ? "#166534" : result?.score >= 55 ? "#713f12" : "#7f1d1d"}`, borderRadius: 12, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 6 }}>{result?.score >= 90 ? "🏆" : result?.score >= 75 ? "✅" : result?.score >= 55 ? "📚" : "🔄"}</div>
            <div style={{ fontSize: 48, fontWeight: "bold", color: result?.score >= 75 ? "#4ade80" : result?.score >= 55 ? "#fbbf24" : "#f87171" }}>{result?.score}<span style={{ fontSize: 18, color: "#475569" }}>/100</span></div>
            <pre style={{ color: "#94a3b8", margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "inherit", textAlign: "left" }}>{result?.feedback}</pre>
          </div>

          {/* Verificações técnicas */}
          {result?.verResults?.length > 0 && (
            <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 12, padding: 16 }}>
              <h4 style={{ margin: "0 0 12px", color: "#60a5fa", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                🔍 Verificações Técnicas ({result.verResults.filter(v => v.passed).length}/{result.verResults.length} cumpridos)
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.verResults.map((v) => (
                  <div key={v.id} style={{ padding: "7px 10px", background: v.passed ? "#052e16" : "#1a0a0a", borderRadius: 6, border: `1px solid ${v.passed ? "#166534" : "#3d0000"}` }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{v.passed ? "✅" : "❌"}</span>
                      <span style={{ flex: 1, color: v.passed ? "#4ade80" : "#f87171", fontSize: 12 }}>{v.label}</span>
                      <span style={{ color: "#475569", fontSize: 10, flexShrink: 0 }}>{v.weight}pts</span>
                    </div>
                    {v.detail && (
                      <pre style={{ margin: "6px 0 0 24px", color: v.passed ? "#86efac" : "#fca5a5", fontSize: 10, lineHeight: 1.45, whiteSpace: "pre-wrap", fontFamily: "monospace", borderTop: "1px solid #1e293b", paddingTop: 6 }}>
                        {v.detail}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Respostas do desafio com feedback */}
          <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 12, padding: 16 }}>
            <h4 style={{ margin: "0 0 12px", color: "#a78bfa", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>📝 Questões do Desafio</h4>
            {challenge.questions.map((q, qi) => {
              const ar = result?.answerResults?.find(r => r.qid === q.id);
              return (
                <div key={q.id} style={{ marginBottom: 12, padding: 12, background: "#020817", borderRadius: 8, border: `1px solid ${ar ? (ar.passed ? "#166534" : "#7f1d1d") : "#1e293b"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>{qi + 1}. {q.text}</span>
                    {ar && <span style={{ color: ar.passed ? "#4ade80" : "#f87171", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{ar.pts}/{ar.max}pts</span>}
                  </div>
                  <div style={{ color: "#e2e8f0", fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", marginBottom: ar?.detail ? 6 : 0 }}>
                    {answers[q.id] || "(sem resposta)"}
                  </div>
                  {ar?.detail && (
                    <div style={{ color: ar.passed ? "#86efac" : "#fca5a5", fontSize: 11, fontStyle: "italic", borderTop: "1px solid #1e293b", paddingTop: 6 }}>
                      {ar.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={() => { setSubmitted(false); setResult(null); }}
            style={{ background: "#0d1f3c", border: "1px solid #1e3a5f", color: "#60a5fa", padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            🔄 Tentar Novamente
          </button>
        </div>
      )}
    </div>
  );
}

// ─── PcapTab ──────────────────────────────────────────────────────────────
function PcapTab({ onRunCmd }) {
  const shortcuts = [
    { label: "Debug de updates BGP no R1",       router: "R1", cmd: "do debug bgp updates" },
    { label: "Ver rotas recebidas com atributos", router: "R1", cmd: "show ip bgp neighbors 2.2.2.2 received-routes" },
    { label: "Detalhe de atributos de uma rota",  router: "R1", cmd: "show ip bgp 150.1.1.0/24" },
    { label: "Histórico de update-groups",        router: "R1", cmd: "show bgp ipv4 unicast update-group" },
    { label: "Desativar debug",                   router: "R1", cmd: "no debug all" },
    { label: "Captura tcpdump na eth1 (BGP)",     router: "R2", cmd: "do debug bgp updates in" },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 14px", color: "#fb923c", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>🔬 Análise de Pacotes BGP</h3>
        <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 14px", lineHeight: 1.6 }}>
          Capture e analise mensagens BGP UPDATE dentro dos containers. Observe atributos como <strong style={{ color: "#a78bfa" }}>MULTI_EXIT_DISC (MED)</strong>, <strong style={{ color: "#60a5fa" }}>AS_PATH</strong>, <strong style={{ color: "#4ade80" }}>LOCAL_PREF</strong> e <strong style={{ color: "#fb923c" }}>COMMUNITY</strong>.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shortcuts.map((s, i) => (
            <div key={i} style={{ background: "#020817", borderRadius: 8, padding: "10px 14px", border: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 3 }}>{s.label}</div>
                <code style={{ color: "#4ade80", fontSize: 11 }}>{s.router}# {s.cmd}</code>
              </div>
              <button onClick={() => onRunCmd(s.router, s.cmd)}
                style={{ background: "#064e3b", border: "1px solid #166534", color: "#4ade80", padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, flexShrink: 0 }}>
                ▶
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h4 style={{ margin: "0 0 10px", color: "#60a5fa", fontSize: 12 }}>💡 Exportar para Wireshark</h4>
        <p style={{ color: "#94a3b8", fontSize: 12, margin: 0, lineHeight: 1.7 }}>
          Para análise visual completa, execute no <strong style={{ color: "#e2e8f0" }}>terminal do servidor</strong>:
        </p>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            "docker exec clab-SESSION-R1 tcpdump -i eth1 port 179 -w /tmp/bgp.pcap -c 100 &",
            "docker cp clab-SESSION-R1:/tmp/bgp.pcap ./bgp-lab.pcap",
            "wireshark bgp-lab.pcap &",
            "tshark -r bgp-lab.pcap -Y 'bgp.type==2' -V | grep -E 'UPDATE|AS_PATH|LOCAL_PREF|MED'",
          ].map((cmd, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#020817", padding: "6px 12px", borderRadius: 6, border: "1px solid #1e293b" }}>
              <code style={{ color: "#4ade80", fontSize: 10 }}>$ {cmd}</code>
              <CopyButton text={cmd} />
            </div>
          ))}
        </div>
        <p style={{ color: "#475569", fontSize: 11, marginTop: 10 }}>
          Substitua <code style={{ color: "#fbbf24" }}>SESSION</code> pelo ID da sua sessão (visível no painel do professor).
        </p>
      </Card>
    </div>
  );
}

// ─── StudentLab (main) ────────────────────────────────────────────────────
export function StudentLab({ sessionId, studentName, labId, onExit }) {
  const [activeTab, setActiveTab] = useState("roteiro");
  const [provisionStatus, setProvisionStatus] = useState("provisioning");
  const [provisionMsg, setProvisionMsg]       = useState("Iniciando containers...");
  const [progress, setProgress]               = useState({});
  const [session, setSession]                 = useState(null);
  const [score, setScore]                     = useState(null);
  const [roteiroStep, setRoteiroStep]         = useState(0);
  const [toasts, pushToast]                   = useToasts();
  const labMeta  = LABS_META.find((l) => l.id === labId);
  const exitTimerRef = useRef(null);

  const exitToGate = useCallback((message) => {
    if (exitTimerRef.current) return;
    if (message) pushToast(message, "warning");
    exitTimerRef.current = setTimeout(() => {
      onExit();
    }, 1200);
  }, [onExit, pushToast]);

  useEffect(() => () => clearTimeout(exitTimerRef.current), []);

  // Poll session status while provisioning
  useEffect(() => {
    let interval;
    const poll = async () => {
      try {
        const s = await apiFetch("GET", `/session/${sessionId}`);
        setSession(s);
        setProgress(s.progress || {});
        if (["running", "error", "cleaned"].includes(s.status)) {
          clearInterval(interval);
          setProvisionStatus(s.status);
          if (s.status === "running") setProvisionMsg("Lab pronto!");
          if (s.status === "error")   setProvisionMsg(s.error || "Erro desconhecido");
        }
        // Sessão encerrada pelo backend (ex: timeout de inatividade)
        if (s.status === "cleaned") {
          clearInterval(interval);
          exitToGate("Sessão encerrada. Voltando ao menu de laboratórios...");
        }
      } catch (e) {
        // 404 = sessão não existe mais (backend reiniciou ou sessão expirou)
        if (e.status === 404 || e.message?.includes("não encontrada")) {
          clearInterval(interval);
          exitToGate("Sua sessão expirou ou foi encerrada. Voltando ao menu...");
        }
      }
    };
    poll();
    interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [sessionId, exitToGate]);

  const onWsMsg = useCallback((msg) => {
    if (msg.type === "status") {
      setProvisionStatus(msg.status);
      if (msg.message) setProvisionMsg(msg.message);
      if (["cleaning", "cleaned"].includes(msg.status)) {
        exitToGate(msg.message || "Sessão encerrada. Voltando ao menu...");
      }
    }
    if (msg.type === "progress") {
      setProgress((p) => ({ ...p, [msg.stepId]: { completed: true } }));
      pushToast(`✅ ${msg.label}`, "success");
    }
    if (msg.type === "notification") {
      pushToast(msg.message, msg.level || "info", msg.fromTeacher);
    }
  }, [exitToGate]);

  useWebSocket("student", sessionId, onWsMsg);

  // Ref para injetar comandos no terminal ativo via TerminalTab
  const terminalInjectRef = useRef(null);

  const handleRunCmd = useCallback((router, cmd) => {
    setActiveTab("terminal");
    // Injeta o comando no terminal PTY após um tick (espera a tab renderizar)
    setTimeout(() => {
      if (terminalInjectRef.current) {
        terminalInjectRef.current(router, cmd);
      }
    }, 150);
  }, []);

  if (provisionStatus === "provisioning")
    return <ProvisioningScreen labId={labId} message={provisionMsg} />;
  if (provisionStatus === "error")
    return <ErrorScreen message={provisionMsg} onBack={onExit} />;

  const TABS = [
    { id: "roteiro",   label: "📋 Roteiro" },
    { id: "topology",  label: "🌐 Topologia" },
    { id: "terminal",  label: "💻 Terminal" },
    { id: "challenge", label: "🏆 Desafio" },
    { id: "wireshark", label: "🔬 Wireshark" },
  ];

  // Get lab data for topology/analyzer
  const LABS_DATA_MAP = { 1: null, 2: null, 4: null, 9: null };

  const completedChecks = Object.values(progress).filter((p) => p.completed).length;

  return (
    <div style={{ height: "100vh", background: "#020817", color: "#e2e8f0", fontFamily: "monospace", display: "flex", flexDirection: "column" }}>
      <Toasts toasts={toasts} />
      <style>{`@keyframes slideIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }`}</style>

      {/* Top bar */}
      <div style={{ background: "#0f172a", borderBottom: "1px solid #1e3a5f", padding: "10px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onExit} style={{ background: "none", border: "1px solid #1e293b", color: "#475569", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>←</button>
        <Badge style={{ background: "#0d1f3c", color: "#60a5fa", border: "1px solid #1e3a5f" }}>Lab {labId}</Badge>
        <span style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: 13 }}>{labMeta?.title}</span>
        <Badge style={{ background: "#052e16", color: "#4ade80", border: "1px solid #166534" }}>● Live</Badge>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ color: "#475569", fontSize: 11 }}>
            <span style={{ color: "#4ade80" }}>{completedChecks}</span> checks auto
          </span>
          {score !== null && (
            <span style={{ color: score >= 60 ? "#4ade80" : "#f87171", fontSize: 12 }}>🎯 {score}%</span>
          )}
          <div style={{ background: "#052e16", color: "#4ade80", padding: "3px 10px", borderRadius: 20, fontSize: 11, border: "1px solid #166534" }}>
            👤 {studentName}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: "#0a0f1a", borderBottom: "1px solid #1e293b", display: "flex", padding: "0 20px", flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ background: "none", border: "none", borderBottom: activeTab === tab.id ? "2px solid #00d4ff" : "2px solid transparent", color: activeTab === tab.id ? "#00d4ff" : "#475569", padding: "9px 14px", cursor: "pointer", fontSize: 12, transition: "all .15s" }}>
            {tab.label}
          </button>
        ))}
        {/* Progress dots */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", paddingRight: 4 }}>
          {Object.keys(progress).map((k) =>
            progress[k]?.completed
              ? <div key={k} style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
              : null
          )}
        </div>
      </div>

      {/* Tab content — TerminalTab sempre montado para preservar conexões PTY */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* Abas renderizadas condicionalmente (desmontam ao sair — OK) */}
        {activeTab === "roteiro" && (
          <RoteiroTab
            labId={labId}
            step={roteiroStep}
            setStep={setRoteiroStep}
            onRunCmd={handleRunCmd}
            progress={progress}
            onGoChallenge={() => setActiveTab("challenge")}
          />
        )}
        {activeTab === "topology" && (
          <TopologyTab labId={labId} sessionStatus={provisionStatus} session={session} sessionId={sessionId} />
        )}
        {activeTab === "challenge" && (
          <ChallengeTab labId={labId} sessionId={sessionId} onSubmitDone={setScore} />
        )}
        {activeTab === "wireshark" && (
          <WiresharkTab labId={labId} sessionId={sessionId} session={session} />
        )}

        {/* Terminal SEMPRE montado — visibilidade via CSS para preservar WebSockets PTY */}
        <div style={{
          position: activeTab === "terminal" ? "relative" : "absolute",
          inset: 0,
          display: "flex",
          flex: activeTab === "terminal" ? 1 : undefined,
          visibility: activeTab === "terminal" ? "visible" : "hidden",
          pointerEvents: activeTab === "terminal" ? "auto" : "none",
          zIndex: activeTab === "terminal" ? 1 : -1,
        }}>
          <TerminalTab
            labId={labId} sessionId={sessionId}
            containers={session?.containers || []}
            injectRef={terminalInjectRef}
            active={activeTab === "terminal"}
            sessionReady={provisionStatus === "running"}
          />
        </div>
      </div>
    </div>
  );
}
// placeholder to ensure file ends cleanly

// ─── TopologyTab ──────────────────────────────────────────────────────────────
function TopologyTab({ labId, sessionStatus, session, sessionId }) {
  const [labData, setLabData] = useState(null);

  useEffect(() => {
    apiFetch("GET", `/labs/${labId}`)
      .then(setLabData)
      .catch(() => {
        import("../data/labs.js").then((m) => {
          const steps = m.LAB_STEPS[labId] || [];
          const routers = getRoutersFromSteps(steps, labId);
          const links   = getLinksFromSteps(steps, labId);
          setLabData({ routers, links, frr_configs: getFrrConfigs(labId) });
        });
      });
  }, [labId]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, color: "#00d4ff", fontSize: 13, letterSpacing: 2, textTransform: "uppercase" }}>
            🌐 Diagrama da Topologia — Lab {labId}
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ background: { running: "#052e16", provisioning: "#422006", default: "#0a0f1a" }[sessionStatus] || "#0a0f1a",
              color: { running: "#4ade80", provisioning: "#fbbf24", default: "#475569" }[sessionStatus] || "#475569",
              padding: "3px 10px", borderRadius: 20, fontSize: 11, border: "1px solid #1e293b" }}>
              ● {sessionStatus}
            </span>
          </div>
        </div>
        {labData
          ? <TopologyDiagram lab={labData} sessionStatus={sessionStatus} />
          : <div style={{ color: "#334155", textAlign: "center", padding: 40 }}>Carregando topologia...</div>
        }
      </div>

      {/* Tabela de endereçamento */}
      {session?.containers?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 12, padding: 16 }}>
          <h4 style={{ margin: "0 0 10px", color: "#60a5fa", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>
            📋 Containers Ativos
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {session.containers.map((c) => (
              <div key={c} style={{ display: "flex", gap: 12, padding: "6px 10px", background: "#020817", borderRadius: 6, fontSize: 11, fontFamily: "monospace" }}>
                <span style={{ color: "#4ade80", minWidth: 28 }}>●</span>
                <span style={{ color: "#e2e8f0" }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ContainerLab Graph — link direto */}
      <GraphPanel sessionId={sessionId} />
    </div>
  );
}

// ─── WiresharkTab ──────────────────────────────────────────────────────────────
function WiresharkTab({ labId, sessionId, session }) {
  const [labData, setLabData] = useState(null);

  useEffect(() => {
    apiFetch("GET", `/labs/${labId}`)
      .then(setLabData)
      .catch(() => {
        import("../data/labs.js").then((m) => {
          const steps = m.LAB_STEPS[labId] || [];
          const routers = getRoutersFromSteps(steps, labId);
          setLabData({ routers, frr_configs: getFrrConfigs(labId) });
        });
      });
  }, [labId]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ background: "#0a0f1a", borderBottom: "1px solid #1e293b", padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ color: "#fb923c", fontSize: 12, fontWeight: "bold" }}>🔬 Analisador de Pacotes BGP</span>
        <span style={{ color: "#475569", fontSize: 10 }}>
          Inspect BGP OPEN · UPDATE · KEEPALIVE · NOTIFICATION
        </span>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <PacketAnalyzer
          sessionId={sessionId}
          lab={labData}
          containers={session?.containers || []}
        />
      </div>
    </div>
  );
}

// ─── Helpers para montar dados de lab no frontend ────────────────────────────
function getRoutersFromSteps(steps, labId) {
  const ROUTERS = { 1: ["R1","R2","R3","R4"], 2: ["R1","R2","R3","R4"], 4: ["R1","R2","R3","R4","R5"], 9: ["RR","R1","R2","R3","R4"] };
  return ROUTERS[labId] || ["R1","R2","R3","R4"];
}

function getLinksFromSteps(steps, labId) {
  const LINKS = {
    1: [["R1","eth1","R2","eth1"],["R2","eth2","R3","eth1"],["R3","eth2","R4","eth1"],["R1","eth2","R4","eth2"]],
    2: [["R1","eth1","R2","eth1"],["R1","eth2","R3","eth1"],["R2","eth2","R4","eth1"]],
    4: [["R1","eth1","R2","eth1"],["R2","eth2","R3","eth1"],["R3","eth2","R4","eth1"],["R1","eth2","R5","eth1"]],
    9: [["RR","eth1","R1","eth1"],["RR","eth2","R2","eth1"],["R1","eth2","R3","eth1"],["R2","eth2","R4","eth1"]],
  };
  return (LINKS[labId] || []).map((l) => ({
    from: l[0], to: l[2], iface_a: l[1], iface_b: l[3],
    type: labId === 4 ? (["R1","R2"].includes(l[0]) && ["R3","R4"].includes(l[2]) ? "Confed" : "eBGP") :
          labId === 9 && l[0] === "RR" ? "RR-client" : "eBGP",
  }));
}

function getFrrConfigs(labId) {
  // Retorna snippets mínimos com AS numbers para o diagrama
  const CONFIGS = {
    1: { R1: "router bgp 1\n ip address 1.1.1.1/32", R2: "router bgp 2\n ip address 2.2.2.2/32", R3: "router bgp 3\n ip address 3.3.3.3/32", R4: "router bgp 4\n ip address 4.4.4.4/32" },
    2: { R1: "router bgp 1\n ip address 10.0.0.1/32", R2: "router bgp 1\n ip address 10.0.0.2/32", R3: "router bgp 3\n ip address 20.0.0.1/32", R4: "router bgp 2\n ip address 30.0.0.1/32" },
    4: { R1: "router bgp 65001\n ip address 1.1.1.1/32", R2: "router bgp 65001\n ip address 2.2.2.2/32", R3: "router bgp 65002\n ip address 3.3.3.3/32", R4: "router bgp 65002\n ip address 4.4.4.4/32", R5: "router bgp 200\n ip address 5.5.5.5/32" },
    9: { RR: "router bgp 1\n ip address 10.0.0.1/32", R1: "router bgp 1\n ip address 10.0.0.2/32", R2: "router bgp 1\n ip address 10.0.0.3/32", R3: "router bgp 2\n ip address 20.0.0.1/32", R4: "router bgp 3\n ip address 30.0.0.1/32" },
  };
  return CONFIGS[labId] || {};
}

// ─── GraphPanel — ContainerLab Graph embutido ────────────────────────────────
function GraphPanel({ sessionId }) {
  const [graphUrl, setGraphUrl] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showEmbed, setShowEmbed] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let attempts = 0;
    const poll = async () => {
      try {
        const res = await apiFetch('GET', `/session/${sessionId}/graph`);
        if (res.url) {
          setGraphUrl(res.url);
          setLoading(false);
          return;
        }
      } catch {}
      attempts++;
      if (attempts < 15) setTimeout(poll, 2000); // tenta por 30s
      else { setLoading(false); setError('Graph server não disponível'); }
    };
    poll();
  }, [sessionId]);

  if (loading) return (
    <div style={{ background: "#0a1a0a", border: "1px solid #166534", borderRadius: 10, padding: 14 }}>
      <div style={{ color: "#4ade80", fontSize: 12 }}>⟳ Iniciando ContainerLab Graph...</div>
    </div>
  );

  if (error) return (
    <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
      <div style={{ color: "#475569", fontSize: 12 }}>📊 ContainerLab Graph indisponível</div>
    </div>
  );

  return (
    <div style={{ background: "#0a1a0a", border: "1px solid #166534", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, color: "#4ade80", fontSize: 12 }}>
          📊 ContainerLab Graph — Topologia Interativa
        </h4>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowEmbed(e => !e)}
            style={{ background: "#052e16", border: "1px solid #166534", color: "#4ade80", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
            {showEmbed ? "▲ Ocultar" : "▼ Mostrar aqui"}
          </button>
          <a href={graphUrl} target="_blank" rel="noreferrer"
            style={{ background: "#0d1f3c", border: "1px solid #1e3a5f", color: "#60a5fa", padding: "4px 12px", borderRadius: 6, textDecoration: "none", fontSize: 11 }}>
            ↗ Abrir em nova aba
          </a>
        </div>
      </div>
      <p style={{ color: "#94a3b8", fontSize: 11, margin: "0 0 8px" }}>
        Diagrama interativo gerado pelo ContainerLab com os containers reais desta sessão.
      </p>
      {showEmbed && (
        <iframe
          src={graphUrl}
          style={{ width: "100%", height: 400, border: "1px solid #1e293b", borderRadius: 8, background: "#020817" }}
          title="ContainerLab Graph"
        />
      )}
    </div>
  );
}
