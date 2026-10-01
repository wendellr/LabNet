import { useState, useEffect, useCallback, Fragment } from "react";

// ─── TheorySlides ─────────────────────────────────────────────────────────
// Apresentação da teoria de um lab (`lab.theorySlides`), usada na aba
// "📖 Teoria" do aluno e na página pública ?teoria=<labId>.
//
// Cada slide: { title, subtitle?, points?, code?, diagram?, flow?, table?, note? }
// Texto aceita `código` e **negrito** inline.

export function Inline({ text }) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} style={{ background: "#0d1f3c", color: "#fbbf24", padding: "1px 6px", borderRadius: 4, fontSize: "0.92em" }}>{p.slice(1, -1)}</code>;
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} style={{ color: "#e2e8f0" }}>{p.slice(2, -2)}</strong>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

function Slide({ slide, isCover }) {
  const pre = { margin: 0, padding: "14px 18px", background: "#020817", border: "1px solid #1e293b", borderRadius: 10, fontSize: 13, lineHeight: 1.55, overflowX: "auto", fontFamily: "monospace" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ margin: 0, color: isCover ? "#00d4ff" : "#e2e8f0", fontSize: isCover ? 34 : 26, lineHeight: 1.2 }}>{slide.title}</h2>
        {slide.subtitle && <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 16 }}>{slide.subtitle}</p>}
      </div>

      {slide.flow && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          {slide.flow.map((s, i) => (
            <Fragment key={i}>
              {i > 0 && <span style={{ color: "#334155", fontSize: 18 }}>→</span>}
              <span style={{ background: i === slide.flow.length - 1 ? "#052e16" : "#0d1f3c", color: i === slide.flow.length - 1 ? "#4ade80" : "#60a5fa", border: `1px solid ${i === slide.flow.length - 1 ? "#166534" : "#1e3a5f"}`, padding: "6px 12px", borderRadius: 8, fontSize: 14, fontWeight: 700 }}>{s}</span>
            </Fragment>
          ))}
        </div>
      )}

      {slide.diagram && <pre style={{ ...pre, color: "#67e8f9" }}>{slide.diagram}</pre>}

      {slide.points?.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {slide.points.map((p, i) => (
            p.startsWith("• ")
              ? <li key={i} style={{ listStyle: "none", marginLeft: 18, color: "#cbd5e1", fontSize: 16, lineHeight: 1.5 }}>• <Inline text={p.slice(2)} /></li>
              : <li key={i} style={{ color: "#cbd5e1", fontSize: 17, lineHeight: 1.55 }}><Inline text={p} /></li>
          ))}
        </ul>
      )}

      {slide.code && <pre style={{ ...pre, color: "#4ade80" }}>{slide.code}</pre>}

      {slide.table && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr>{slide.table.head.map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "8px 12px", color: "#60a5fa", borderBottom: "1px solid #1e3a5f", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {slide.table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => (
                  <td key={j} style={{ padding: "8px 12px", color: j === 0 ? "#e2e8f0" : "#94a3b8", borderBottom: "1px solid #0f172a", verticalAlign: "top", whiteSpace: j === 0 ? "nowrap" : "normal" }}><Inline text={c} /></td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {slide.note && (
        <div style={{ borderLeft: "3px solid #fbbf24", background: "#1a1206", padding: "10px 14px", borderRadius: "0 8px 8px 0", color: "#fde68a", fontSize: 14, lineHeight: 1.5 }}>
          <Inline text={slide.note} />
        </div>
      )}
    </div>
  );
}

// `index`/`onIndex` opcionais: a aba do aluno guarda o slide atual fora do
// componente para não voltar ao início ao trocar de aba.
export function TheorySlides({ slides, index, onIndex }) {
  const [ownIdx, setOwnIdx] = useState(0);
  const idx = index ?? ownIdx;
  const setIdx = onIndex ?? setOwnIdx;
  const total = slides?.length || 0;
  const go = useCallback((d) => setIdx((i) => Math.max(0, Math.min(total - 1, i + d))), [total, setIdx]);

  useEffect(() => {
    const onKey = (e) => {
      // Não rouba as setas de quem está digitando (terminal, campos de texto)
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.closest?.(".xterm")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!total)
    return <div style={{ padding: 24, color: "#475569" }}>Teoria em preparação para este laboratório.</div>;

  const btn = (disabled) => ({ background: disabled ? "#0a0f1a" : "#0d1f3c", color: disabled ? "#1e293b" : "#60a5fa", border: `1px solid ${disabled ? "#1e293b" : "#1e3a5f"}`, padding: "8px 18px", borderRadius: 8, cursor: disabled ? "default" : "pointer", fontSize: 13, fontFamily: "monospace" });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "32px 24px" }}>
        <div style={{ width: "100%", maxWidth: 920, background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 14, padding: "36px 40px", alignSelf: "flex-start", boxSizing: "border-box" }}>
          <Slide slide={slides[idx]} isCover={idx === 0} />
        </div>
      </div>

      <div style={{ flexShrink: 0, borderTop: "1px solid #1e293b", background: "#0a0f1a", padding: "10px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => go(-1)} disabled={idx === 0} style={btn(idx === 0)}>← Anterior</button>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
          {slides.map((s, i) => (
            <button key={i} onClick={() => setIdx(i)} title={s.title}
              style={{ width: 9, height: 9, padding: 0, borderRadius: "50%", border: "none", cursor: "pointer", background: i === idx ? "#00d4ff" : i < idx ? "#1e3a5f" : "#1e293b" }} />
          ))}
        </div>
        <span style={{ color: "#475569", fontSize: 12, minWidth: 54, textAlign: "right" }}>{idx + 1} / {total}</span>
        <button onClick={() => go(1)} disabled={idx === total - 1} style={btn(idx === total - 1)}>Próximo →</button>
      </div>
    </div>
  );
}

// ─── TheoryPage ───────────────────────────────────────────────────────────
// Página pública (sem sessão) — /?teoria=<labId>
export function TheoryPage({ labId }) {
  const [lab, setLab] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const base = window.location.hostname === "localhost" ? "http://localhost:3000" : "";
    fetch(`${base}/api/labs/${labId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Lab não encontrado"))))
      .then((d) => { setLab(d); document.title = `Teoria — Lab ${labId} · LabNet`; })
      .catch((e) => setError(e.message));
  }, [labId]);

  return (
    <div style={{ height: "100vh", background: "#020817", color: "#e2e8f0", fontFamily: "monospace", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#0f172a", borderBottom: "1px solid #1e3a5f", padding: "10px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <a href="/" style={{ color: "#475569", border: "1px solid #1e293b", padding: "4px 10px", borderRadius: 6, fontSize: 11, textDecoration: "none" }}>← LabNet</a>
        <span style={{ color: "#60a5fa", fontSize: 12, fontWeight: 800 }}>📖 Teoria · Lab {labId}</span>
        {lab && <span style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: 13 }}>{lab.title}</span>}
      </div>
      {error && <div style={{ padding: 24, color: "#f87171" }}>{error}</div>}
      {!error && !lab && <div style={{ padding: 24, color: "#475569" }}>Carregando…</div>}
      {lab && <TheorySlides slides={lab.theorySlides} />}
    </div>
  );
}
