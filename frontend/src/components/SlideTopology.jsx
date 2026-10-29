import { Fragment, useState, useEffect } from "react";

// ─── SlideTopology ───────────────────────────────────────────────
// Diagrama de topologia em SVG para os slides de teoria (`slide.topology`).
// Tudo é dado: o slide declara nós, grupos (AS, áreas), enlaces e legendas.
//
//   topology: {
//     w, h,                                         // tamanho do desenho (viewBox)
//     groups:  [{ label, x, y, w, h, color? }],     // caixas que agrupam (AS, área)
//     nodes:   [{ id, x, y, label, sub?, hl? }],    // centro do nó; hl = destaque verde
//     links:   [{ id?, a, b, kind?, label?, arrow?, bend?, flow? }],
//     packets: [{ link, dir?, label?, color? }],    // pacotes que percorrem um enlace
//     badges:  [{ x, y, text, color? }],            // legendas soltas (x,y = centro)
//     steps:   [{ caption, links?, packets?, badges?, hl? }],   // animação passo a passo
//   }
//
// kind: "ebgp" (azul), "ibgp" (ciano tracejado), "confed" (laranja tracejado),
//       "best" (verde grosso), "dim" (cinza tracejado), "blocked" (vermelho com ×),
//       "ospf" (âmbar).
// arrow: "a>b" | "b>a" | "both".   flow: "a>b" | "b>a" — tracejado que corre no sentido.
//
// Com `steps`, o desenho base fica sempre na tela e cada passo sobrepõe:
//   links:   { "<id do enlace>": { kind, label, arrow, flow } }  (muda o estilo)
//   packets: pacotes animados desse passo      badges: legendas desse passo
//   hl:      ids de nós destacados nesse passo
// Há botões Anterior/Próximo/Reproduzir; respeita prefers-reduced-motion.

const NODE_W = 104;
const NODE_H = 46;

const KINDS = {
  ebgp:    { color: "#60a5fa", width: 2.5, dash: null },
  ibgp:    { color: "#67e8f9", width: 2.5, dash: "7 5" },
  confed:  { color: "#fb923c", width: 2.5, dash: "7 5" },
  best:    { color: "#4ade80", width: 4.5, dash: null },
  dim:     { color: "#475569", width: 2, dash: "4 5" },
  blocked: { color: "#f87171", width: 2.5, dash: "7 5" },
  ospf:    { color: "#fbbf24", width: 2.5, dash: null },
};

// Ponto onde a reta centro→centro sai da caixa do nó
function clip(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!dx && !dy) return { x: from.x, y: from.y };
  const sx = dx ? (NODE_W / 2 + 3) / Math.abs(dx) : Infinity;
  const sy = dy ? (NODE_H / 2 + 3) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: from.x + dx * s, y: from.y + dy * s };
}

const textWidth = (t, size) => String(t).length * size * 0.6 + 16;

function Badge({ x, y, text, color = "#fbbf24" }) {
  const w = textWidth(text, 12);
  return (
    <g>
      <rect x={x - w / 2} y={y - 11} width={w} height={22} rx={11} fill="#020817" stroke={color} strokeWidth={1.3} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fill={color} fontFamily="monospace">{text}</text>
    </g>
  );
}

// Geometria de um enlace: caminho, ponto do rótulo
function geometry(l, byId) {
  const A = byId[l.a], B = byId[l.b];
  if (!A || !B) return null;
  const p1 = clip(A, B), p2 = clip(B, A);
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  const nx = -(p2.y - p1.y) / len, ny = (p2.x - p1.x) / len;
  const bend = l.bend || 0;
  const cx = mx + nx * bend, cy = my + ny * bend;
  return {
    p1, p2,
    d: bend ? `M${p1.x},${p1.y} Q${cx},${cy} ${p2.x},${p2.y}` : `M${p1.x},${p1.y} L${p2.x},${p2.y}`,
    dRev: bend ? `M${p2.x},${p2.y} Q${cx},${cy} ${p1.x},${p1.y}` : `M${p2.x},${p2.y} L${p1.x},${p1.y}`,
    lx: bend ? (p1.x + 2 * cx + p2.x) / 4 : mx,
    ly: bend ? (p1.y + 2 * cy + p2.y) / 4 : my,
  };
}

function Packet({ d, label, color = "#fbbf24", animate, delay = 0 }) {
  const w = label ? textWidth(label, 11) : 14;
  return (
    <g>
      {animate && (
        <animateMotion path={d} dur="2.6s" begin={`${delay}s`} repeatCount="indefinite" calcMode="linear" />
      )}
      {!animate && <title>{label}</title>}
      <rect x={-w / 2} y={-10} width={w} height={20} rx={10} fill="#020817" stroke={color} strokeWidth={1.6} />
      <text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight="bold" fill={color} fontFamily="monospace">{label || "●"}</text>
    </g>
  );
}

export function SlideTopology({ w = 760, h = 360, groups = [], nodes = [], links = [], packets = [], badges = [], steps = [], initialStep = 0 }) {
  const [step, setStep] = useState(initialStep);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const hasSteps = steps.length > 0;

  useEffect(() => {
    try { setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { /* sem matchMedia */ }
  }, []);

  useEffect(() => {
    if (!playing || !hasSteps) return undefined;
    const t = setInterval(() => setStep((s) => (s + 1) % steps.length), 3600);
    return () => clearInterval(t);
  }, [playing, hasSteps, steps.length]);

  const st = hasSteps ? steps[Math.min(step, steps.length - 1)] : null;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const linkId = (l) => l.id || `${l.a}-${l.b}`;

  // Estilo final de cada enlace: base + sobreposição do passo
  const eff = links.map((l) => ({ ...l, ...(st?.links?.[linkId(l)] || {}) }));
  const hl = new Set([...(nodes.filter((n) => n.hl).map((n) => n.id)), ...(st?.hl || [])]);
  const allPackets = [...packets, ...(st?.packets || [])];
  const allBadges = [...badges, ...(st?.badges || [])];
  const animate = !reduced;
  // enquanto um pacote percorre o enlace, o rótulo de base dele sai da frente (a menos que o passo defina um)
  const packetLinks = new Set(allPackets.map((p) => p.link));

  const arrowColors = [...new Set(eff.filter((l) => l.arrow || l.flow).map((l) => (KINDS[l.kind || "ebgp"] || KINDS.ebgp).color))];

  const btn = (on) => ({
    background: on ? "#0d1f3c" : "#0a0f1a", color: on ? "#60a5fa" : "#334155",
    border: `1px solid ${on ? "#1e3a5f" : "#1e293b"}`, borderRadius: 6, padding: "5px 12px",
    cursor: on ? "pointer" : "default", fontFamily: "monospace", fontSize: 12,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img"
        style={{ background: "#020817", border: "1px solid #1e293b", borderRadius: 10, maxWidth: "100%", height: "auto", display: "block" }}>
        <defs>
          {arrowColors.map((c) => (
            <marker key={c} id={`ah-${c.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={c} />
            </marker>
          ))}
        </defs>

        {groups.map((g, i) => {
          const c = g.color || "#60a5fa";
          return (
            <g key={i}>
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={14} fill={c} fillOpacity={0.06} stroke={c} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="6 4" />
              <text x={g.x + 14} y={g.y + 20} fontSize={13} fontWeight="bold" fill={c} fontFamily="monospace">{g.label}</text>
            </g>
          );
        })}

        {eff.map((l, i) => {
          const g = geometry(l, byId);
          if (!g) return null;
          const k = KINDS[l.kind || "ebgp"] || KINDS.ebgp;
          const mid = `url(#ah-${k.color.slice(1)})`;
          const flowing = animate && l.flow;
          const dash = flowing ? "9 7" : (k.dash || undefined);
          return (
            <g key={i}>
              <path d={l.flow === "b>a" ? g.dRev : g.d} fill="none" stroke={k.color} strokeWidth={k.width}
                strokeDasharray={dash} strokeLinecap="round"
                markerEnd={l.flow ? (flowing ? undefined : mid) : (l.arrow === "a>b" || l.arrow === "both") ? mid : undefined}
                markerStart={!l.flow && (l.arrow === "b>a" || l.arrow === "both") ? mid : undefined}>
                {flowing && <animate attributeName="stroke-dashoffset" from="32" to="0" dur="0.9s" repeatCount="indefinite" />}
              </path>
              {l.kind === "blocked" && (
                <text x={g.lx} y={g.ly + 7} textAnchor="middle" fontSize={24} fontWeight="bold" fill={k.color}>×</text>
              )}
              {l.label && !(packetLinks.has(linkId(l)) && animate && !st?.links?.[linkId(l)]?.label) && (() => {
                const tw = textWidth(l.label, 12);
                // enlace bloqueado: o rótulo vai ao lado da linha (não cobre o nó nem o ×)
                const cx = l.kind === "blocked" ? g.lx + tw / 2 + 16 : g.lx;
                return (
                  <g>
                    <rect x={cx - tw / 2} y={g.ly - 11} width={tw} height={22} rx={5} fill="#020817" />
                    <text x={cx} y={g.ly + 4} textAnchor="middle" fontSize={12} fill={k.color} fontFamily="monospace">{l.label}</text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {nodes.map((n) => {
          const on = hl.has(n.id);
          return (
            <Fragment key={n.id}>
              <rect x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={9}
                fill={on ? "#052e16" : "#0d1f3c"} stroke={on ? "#4ade80" : "#1e3a5f"} strokeWidth={on ? 2.5 : 1.5} />
              <text x={n.x} y={n.y + (n.sub ? -3 : 5)} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#e2e8f0" fontFamily="monospace">{n.label}</text>
              {n.sub && <text x={n.x} y={n.y + 14} textAnchor="middle" fontSize={11} fill="#94a3b8" fontFamily="monospace">{n.sub}</text>}
            </Fragment>
          );
        })}

        {allPackets.map((p, i) => {
          const l = links.find((x) => linkId(x) === p.link);
          const g = l && geometry(l, byId);
          if (!g) return null;
          const d = p.dir === "b>a" ? g.dRev : g.d;
          // animado: o pacote parte da origem e percorre o enlace (animateMotion usa coordenadas absolutas);
          // sem animação: fica parado no meio do enlace
          return (
            <g key={`${step}-${i}`} transform={animate ? undefined : `translate(${(g.p1.x + g.p2.x) / 2},${(g.p1.y + g.p2.y) / 2})`}>
              <Packet d={d} label={p.label} color={p.color} animate={animate} delay={p.delay || 0} />
            </g>
          );
        })}

        {allBadges.map((b, i) => <Badge key={i} {...b} />)}
      </svg>

      {hasSteps && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0} style={btn(step > 0)}>← Passo</button>
            <button onClick={() => { setPlaying(false); setStep((s) => Math.min(steps.length - 1, s + 1)); }} disabled={step >= steps.length - 1} style={btn(step < steps.length - 1)}>Passo →</button>
            <button onClick={() => setPlaying((p) => !p)} style={btn(true)}>{playing ? "⏸ Pausar" : "▶ Reproduzir"}</button>
            <span style={{ color: "#475569", fontSize: 12, fontFamily: "monospace" }}>passo {step + 1} / {steps.length}</span>
            <div style={{ display: "flex", gap: 5, marginLeft: 4 }}>
              {steps.map((_, i) => (
                <button key={i} onClick={() => { setPlaying(false); setStep(i); }} aria-label={`passo ${i + 1}`}
                  style={{ width: 9, height: 9, padding: 0, borderRadius: "50%", border: "none", cursor: "pointer", background: i === step ? "#00d4ff" : "#1e3a5f" }} />
              ))}
            </div>
          </div>
          {st?.caption && (
            <div style={{ borderLeft: "3px solid #60a5fa", background: "#0a1628", padding: "10px 14px", borderRadius: "0 8px 8px 0", color: "#cbd5e1", fontSize: 15, lineHeight: 1.5 }}>
              {st.caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
