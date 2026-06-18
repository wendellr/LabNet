import { useState, useEffect, useRef } from "react";

// ─── Layout engine: posiciona nodes automaticamente por topologia ─────────────
function computeLayout(nodes, links, width = 700, height = 340) {
  const n = nodes.length;
  if (n === 0) return [];

  // Layouts pré-definidos para topologias comuns
  const PRESETS = {
    4: [ // Lab 1, 2 — quadrado
      { x: 0.18, y: 0.35 }, { x: 0.5, y: 0.12 },
      { x: 0.82, y: 0.35 }, { x: 0.5, y: 0.72 },
    ],
    5: [ // Lab 4 — pentagon
      { x: 0.5, y: 0.10 }, { x: 0.18, y: 0.38 },
      { x: 0.5, y: 0.55 }, { x: 0.82, y: 0.38 },
      { x: 0.5, y: 0.85 },
    ],
    6: [ // Labs com RR
      { x: 0.5, y: 0.12 }, { x: 0.2, y: 0.38 },
      { x: 0.8, y: 0.38 }, { x: 0.15, y: 0.75 },
      { x: 0.85, y: 0.75 }, { x: 0.5, y: 0.75 },
    ],
  };

  const preset = PRESETS[n] || Array.from({ length: n }, (_, i) => ({
    x: 0.1 + 0.8 * (i / Math.max(n - 1, 1)),
    y: 0.2 + 0.3 * Math.sin((i / n) * Math.PI),
  }));

  return nodes.map((node, i) => ({
    ...node,
    px: Math.round((preset[i]?.x ?? 0.5) * width),
    py: Math.round((preset[i]?.y ?? 0.5) * height),
  }));
}

// ─── Cores por tipo de sessão/link ────────────────────────────────────────────
const LINK_COLOR  = { eBGP: "#00d4ff", iBGP: "#a78bfa", Confed: "#fb923c", "RR-client": "#4ade80" };
const LINK_DASH   = { iBGP: "6 3", Confed: "4 2" };
const NODE_STATUS_COLOR = {
  running: "#4ade80", provisioning: "#fbbf24", error: "#f87171", default: "#00d4ff",
};

function getRouterDetails(lab, routerId) {
  return lab.topologyDetails?.routers?.[routerId] || null;
}

function getInterfaceAddress(lab, routerId, ifaceName) {
  const details = getRouterDetails(lab, routerId);
  const iface = details?.interfaces?.find((item) => item.name === ifaceName);
  return iface?.addresses?.[0] || "";
}

function shortAddr(address) {
  return address || "";
}

function hostAddress(address) {
  return (address || "").split("/")[0];
}

function inferLinkType(lab, from, to, explicitType) {
  if (explicitType) return explicitType;

  const a = getRouterDetails(lab, from);
  const b = getRouterDetails(lab, to);
  if (!a || !b) return "eBGP";

  const aLoopback = hostAddress(a.loopback);
  const bLoopback = hostAddress(b.loopback);
  if (a.routeReflectorClients?.includes(bLoopback) || b.routeReflectorClients?.includes(aLoopback)) {
    return "RR-client";
  }
  if (a.asn && b.asn && a.asn === b.asn) return "iBGP";
  if (a.confederationId && a.confederationId === b.confederationId) return "Confed";
  return "eBGP";
}

// ─── TopologyDiagram ─────────────────────────────────────────────────────────
export function TopologyDiagram({ lab, sessionStatus = "default", compact = false }) {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const svgRef = useRef(null);

  if (!lab) return null;

  const W = compact ? 540 : 700;
  const H = compact ? 240 : 340;

  // Monta lista de nodes a partir dos dados do lab
  const rawNodes = lab.routers
    ? lab.routers.map((r, i) => ({ id: r, label: r }))
    : Object.keys(lab.frr_configs || {}).map((r) => ({ id: r, label: r }));

  const positioned = computeLayout(rawNodes, lab.links || [], W, H);

  // Mapeia links
  const links = (lab.links || []).map((l) => {
    // links format: ["R1","eth1","R2","eth1"] or {from, to, type}
    if (Array.isArray(l)) {
      return {
        from: l[0],
        to: l[2],
        iface_a: l[1],
        iface_b: l[3],
        type: inferLinkType(lab, l[0], l[2]),
      };
    }
    return { ...l, type: inferLinkType(lab, l.from, l.to, l.type) };
  });

  const nodeMap = Object.fromEntries(positioned.map((n) => [n.id, n]));
  const nodeColor = NODE_STATUS_COLOR[sessionStatus] || NODE_STATUS_COLOR.default;

  const tooltip = selected ? positioned.find((n) => n.id === selected) : null;

  return (
    <div style={{ position: "relative", background: "#020817", borderRadius: 8, overflow: "hidden", border: "1px solid #1e3a5f" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block" }}
      >
        <defs>
          <marker id="arr-ebgp" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#00d4ff" opacity="0.7" />
          </marker>
          <marker id="arr-ibgp" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#a78bfa" opacity="0.7" />
          </marker>
          <filter id="glow-node">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-selected">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Grid de fundo sutil */}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * H / 7} x2={W} y2={i * H / 7} stroke="#0f172a" strokeWidth="1" />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`v${i}`} x1={i * W / 9} y1="0" x2={i * W / 9} y2={H} stroke="#0f172a" strokeWidth="1" />
        ))}

        {/* Links */}
        {links.map((link, i) => {
          const a = nodeMap[link.from];
          const b = nodeMap[link.to];
          if (!a || !b) return null;
          const col  = LINK_COLOR[link.type] || "#475569";
          const dash = LINK_DASH[link.type]  || "0";
          const mid  = { x: (a.px + b.px) / 2, y: (a.py + b.py) / 2 };
          const markerId = link.type === "iBGP" ? "arr-ibgp" : "arr-ebgp";
          const addrA = getInterfaceAddress(lab, link.from, link.iface_a);
          const addrB = getInterfaceAddress(lab, link.to, link.iface_b);
          const labelA = [link.iface_a, shortAddr(addrA)].filter(Boolean).join(" ");
          const labelB = [link.iface_b, shortAddr(addrB)].filter(Boolean).join(" ");

          return (
            <g key={i}>
              <line
                x1={a.px} y1={a.py} x2={b.px} y2={b.py}
                stroke={col} strokeWidth={link.type === "iBGP" ? 1.5 : 2}
                strokeDasharray={dash} opacity="0.75"
                markerEnd={`url(#${markerId})`}
              />
              {/* Etiquetas das interfaces */}
              {link.iface_a && !compact && (
                <text x={a.px + (mid.x - a.px) * 0.28} y={a.py + (mid.y - a.py) * 0.28 - 5}
                  fill="#cbd5e1" fontSize="8" opacity="0.9" textAnchor="middle" fontFamily="monospace">
                  {labelA}
                </text>
              )}
              {link.iface_b && !compact && (
                <text x={b.px + (mid.x - b.px) * 0.28} y={b.py + (mid.y - b.py) * 0.28 - 5}
                  fill="#cbd5e1" fontSize="8" opacity="0.9" textAnchor="middle" fontFamily="monospace">
                  {labelB}
                </text>
              )}
              {/* Tipo do link no meio */}
              <text x={mid.x} y={mid.y - 6}
                fill={col} fontSize="9" textAnchor="middle" fontFamily="monospace" opacity="0.8">
                {link.type}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {positioned.map((node) => {
          const isSel = selected === node.id;
          const isHov = hovered === node.id;
          const r = compact ? 26 : 32;

          // Pega resumo de config para o tooltip
          const details = getRouterDetails(lab, node.id);
          const frrConf = lab.frr_configs?.[node.id] || "";
          const asMatch = frrConf.match(/router bgp (\d+)/);
          const asNum = details?.asn || (asMatch ? asMatch[1] : "?");

          return (
            <g key={node.id}
              onClick={() => setSelected(isSel ? null : node.id)}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
              filter={isSel ? "url(#glow-selected)" : isHov ? "url(#glow-node)" : "none"}
            >
              {/* Halo de seleção */}
              {(isSel || isHov) && (
                <circle cx={node.px} cy={node.py} r={r + 6}
                  fill="none" stroke={nodeColor} strokeWidth="1.5" opacity="0.3" />
              )}
              {/* Corpo do roteador */}
              <rect
                x={node.px - r} y={node.py - 20} width={r * 2} height={40} rx="6"
                fill="#0a1628" stroke={isSel ? nodeColor : "#1e3a5f"}
                strokeWidth={isSel ? 2 : 1.5}
              />
              {/* Ícone roteador (mini chassis) */}
              <rect x={node.px - 12} y={node.py - 14} width={24} height={6} rx="2"
                fill="#1e3a5f" />
              <rect x={node.px - 10} y={node.py - 12} width={3} height={2} rx="1"
                fill={nodeColor} />
              <rect x={node.px - 5} y={node.py - 12} width={3} height={2} rx="1"
                fill={nodeColor} />
              <rect x={node.px} y={node.py - 12} width={3} height={2} rx="1"
                fill={nodeColor} />
              <rect x={node.px + 5} y={node.py - 12} width={3} height={2} rx="1"
                fill={nodeColor} />
              {/* Label */}
              <text x={node.px} y={node.py + 2}
                fill={nodeColor} fontSize={compact ? 11 : 13} fontWeight="bold"
                textAnchor="middle" fontFamily="'Courier New', monospace">
                {node.id}
              </text>
              {/* AS Number */}
              {asNum !== "?" && (
                <text x={node.px} y={node.py + 14}
                  fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">
                  AS{asNum}
                </text>
              )}
            </g>
          );
        })}

        {/* Legenda */}
        {!compact && (
          <g transform={`translate(10, ${H - 28})`}>
            {Object.entries(LINK_COLOR).map(([type, col], i) => (
              <g key={type} transform={`translate(${i * 110}, 0)`}>
                <line x1="0" y1="8" x2="20" y2="8" stroke={col} strokeWidth="2"
                  strokeDasharray={LINK_DASH[type] || "0"} />
                <text x="24" y="12" fill={col} fontSize="9" fontFamily="monospace">{type}</text>
              </g>
            ))}
          </g>
        )}
      </svg>

      {/* Tooltip flutuante de node selecionado */}
      {tooltip && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "#0a1628", border: "1px solid #00d4ff",
          borderRadius: 8, padding: "10px 14px", width: 320, maxWidth: "calc(100% - 16px)", fontSize: 11,
          fontFamily: "monospace", zIndex: 10,
        }}>
          <div style={{ color: "#00d4ff", fontWeight: "bold", marginBottom: 6 }}>{tooltip.id}</div>
          {(() => {
            const details = getRouterDetails(lab, tooltip.id);
            const conf = lab.frr_configs?.[tooltip.id] || "";
            const asMatch = conf.match(/router bgp (\d+)/);
            const routerIdMatch = conf.match(/bgp router-id\s+(\S+)/);
            const loMatch = conf.match(/ip address ([\d.]+\/32)/);
            const neighs = [...conf.matchAll(/neighbor ([\d.]+) remote-as (\d+)/g)];
            const asn = details?.asn || asMatch?.[1];
            const routerId = details?.routerId || routerIdMatch?.[1];
            const loopback = details?.loopback || loMatch?.[1];
            const neighbors = details?.neighbors || neighs.map(([, ip, as]) => ({ ip, remoteAs: as }));
            const interfaces = details?.interfaces || [];
            return (
              <>
                {asn && <div style={{ color: "#94a3b8" }}>AS: <span style={{ color: "#60a5fa" }}>AS{asn}</span></div>}
                {routerId && <div style={{ color: "#94a3b8" }}>Router-ID: <span style={{ color: "#fbbf24" }}>{routerId}</span></div>}
                {loopback && <div style={{ color: "#94a3b8" }}>Loopback: <span style={{ color: "#4ade80" }}>{loopback}</span></div>}
                {interfaces.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ color: "#64748b", fontSize: 10 }}>Interfaces:</div>
                    {interfaces.map((iface) => (
                      <div key={iface.name} style={{ color: "#94a3b8", display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: iface.name === "lo" ? "#4ade80" : "#cbd5e1" }}>{iface.name}</span>
                        <span>{iface.addresses?.join(", ") || "-"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {neighbors.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: "#64748b", fontSize: 10 }}>Vizinhos BGP:</div>
                    {neighbors.map(({ ip, remoteAs }, i) => (
                      <div key={i} style={{ color: "#94a3b8" }}>
                        {ip} → <span style={{ color: "#a78bfa" }}>AS{remoteAs}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
          <button onClick={() => setSelected(null)}
            style={{ marginTop: 8, background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 10 }}>
            × fechar
          </button>
        </div>
      )}
    </div>
  );
}
