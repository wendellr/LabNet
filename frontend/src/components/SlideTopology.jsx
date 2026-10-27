import { Fragment } from "react";

// ─── SlideTopology ─────────────────────────────────────────────
// Diagrama de topologia em SVG para os slides de teoria (`slide.topology`).
// Tudo é dado: o slide declara nós, grupos (AS, áreas), enlaces e legendas.
//
//   topology: {
//     w, h,                                        // tamanho do desenho (viewBox)
//     groups: [{ label, x, y, w, h, color? }],     // caixas que agrupam (AS, área)
//     nodes:  [{ id, x, y, label, sub?, hl? }],    // centro do nó; hl = destaque verde
//     links:  [{ a, b, kind?, label?, arrow?, bend? }],
//     badges: [{ x, y, text, color? }],            // legendas soltas (x,y = centro)
//   }
//
// kind: "ebgp" (azul), "ibgp" (ciano tracejado), "best" (verde grosso),
//       "dim" (cinza tracejado), "blocked" (vermelho tracejado com ×),
//       "ospf" (âmbar). arrow: "a>b" | "b>a" | "both".

const NODE_W = 104;
const NODE_H = 46;

const KINDS = {
  ebgp:    { color: "#60a5fa", width: 2.5, dash: null },
  ibgp:    { color: "#67e8f9", width: 2.5, dash: "7 5" },
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

const textWidth = (t, size) => String(t).length * size * 0.58 + 16;

function Badge({ x, y, text, color = "#fbbf24" }) {
  const w = textWidth(text, 12);
  return (
    <g>
      <rect x={x - w / 2} y={y - 11} width={w} height={22} rx={11} fill="#020817" stroke={color} strokeWidth={1.3} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fill={color} fontFamily="monospace">{text}</text>
    </g>
  );
}

export function SlideTopology({ w = 760, h = 360, groups = [], nodes = [], links = [], badges = [] }) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const used = [...new Set(links.filter((l) => l.arrow).map((l) => (KINDS[l.kind || "ebgp"] || KINDS.ebgp).color))];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img"
      style={{ background: "#020817", border: "1px solid #1e293b", borderRadius: 10, maxWidth: "100%", height: "auto", display: "block" }}>
      <defs>
        {used.map((c) => (
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

      {links.map((l, i) => {
        const A = byId[l.a], B = byId[l.b];
        if (!A || !B) return null;
        const k = KINDS[l.kind || "ebgp"] || KINDS.ebgp;
        const p1 = clip(A, B), p2 = clip(B, A);
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const nx = -(p2.y - p1.y) / len, ny = (p2.x - p1.x) / len;
        const bend = l.bend || 0;
        const cx = mx + nx * bend, cy = my + ny * bend;
        const d = bend ? `M${p1.x},${p1.y} Q${cx},${cy} ${p2.x},${p2.y}` : `M${p1.x},${p1.y} L${p2.x},${p2.y}`;
        const lx = bend ? (p1.x + 2 * cx + p2.x) / 4 : mx;
        const ly = bend ? (p1.y + 2 * cy + p2.y) / 4 : my;
        const mid = `url(#ah-${k.color.slice(1)})`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={k.color} strokeWidth={k.width} strokeDasharray={k.dash || undefined} strokeLinecap="round"
              markerEnd={l.arrow === "a>b" || l.arrow === "both" ? mid : undefined}
              markerStart={l.arrow === "b>a" || l.arrow === "both" ? mid : undefined} />
            {l.kind === "blocked" && (
              <text x={lx} y={ly + 6} textAnchor="middle" fontSize={22} fontWeight="bold" fill={k.color}>×</text>
            )}
            {l.label && (
              <g>
                <rect x={lx - textWidth(l.label, 12) / 2} y={ly - (l.kind === "blocked" ? 36 : 11)} width={textWidth(l.label, 12)} height={22} rx={5} fill="#020817" />
                <text x={lx} y={ly - (l.kind === "blocked" ? 21 : -4)} textAnchor="middle" fontSize={12} fill={k.color} fontFamily="monospace">{l.label}</text>
              </g>
            )}
          </g>
        );
      })}

      {nodes.map((n) => (
        <Fragment key={n.id}>
          <rect x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={9}
            fill={n.hl ? "#052e16" : "#0d1f3c"} stroke={n.hl ? "#4ade80" : "#1e3a5f"} strokeWidth={n.hl ? 2.5 : 1.5} />
          <text x={n.x} y={n.y + (n.sub ? -3 : 5)} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#e2e8f0" fontFamily="monospace">{n.label}</text>
          {n.sub && <text x={n.x} y={n.y + 14} textAnchor="middle" fontSize={11} fill="#94a3b8" fontFamily="monospace">{n.sub}</text>}
        </Fragment>
      ))}

      {badges.map((b, i) => <Badge key={i} {...b} />)}
    </svg>
  );
}
