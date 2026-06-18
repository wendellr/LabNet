import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../hooks/index.js";

// ─── BGP Message Type decoder ─────────────────────────────────────────────────
const BGP_MSG_TYPES = { 1: "OPEN", 2: "UPDATE", 3: "NOTIFICATION", 4: "KEEPALIVE", 5: "ROUTE-REFRESH" };
const BGP_PATH_ATTR_CODES = {
  1: "ORIGIN", 2: "AS_PATH", 3: "NEXT_HOP", 4: "MULTI_EXIT_DISC (MED)",
  5: "LOCAL_PREF", 6: "ATOMIC_AGGREGATE", 7: "AGGREGATOR",
  8: "COMMUNITY", 9: "ORIGINATOR_ID", 10: "CLUSTER_LIST",
  14: "MP_REACH_NLRI", 15: "MP_UNREACH_NLRI", 255: "AS_CONFED_SEQUENCE",
};
const BGP_ORIGIN_VALUES = { 0: "IGP", 1: "EGP", 2: "INCOMPLETE" };
const BGP_NOTIFICATION_CODES = {
  1: "Message Header Error", 2: "OPEN Message Error",
  3: "UPDATE Message Error", 4: "Hold Timer Expired",
  5: "FSM Error", 6: "Cease",
};

const MSG_COLORS = {
  OPEN: "#86efac", UPDATE: "#7dd3fc", NOTIFICATION: "#fca5a5",
  KEEPALIVE: "#cbd5e1", "ROUTE-REFRESH": "#c4b5fd",
};

const WIRESHARK = {
  bg: "#020817",
  panel: "#08111f",
  panelAlt: "#0d1726",
  header: "#111c2e",
  border: "#334155",
  borderStrong: "#475569",
  text: "#e2e8f0",
  muted: "#94a3b8",
  subtle: "#64748b",
  dim: "#475569",
  selected: "#12315a",
};

// ─── Parse tshark/tcpdump output into structured BGP packets ──────────────────
function parseTsharkOutput(raw) {
  const packets = [];
  const lines = raw.split("\n");
  let current = null;

  for (const line of lines) {
    // tshark -T fields format or verbose
    const timeMatch = line.match(/^\s*(\d+)\s+([\d.]+)\s+(\S+)\s+->\s+(\S+)\s+BGP\s+(.*)/i);
    if (timeMatch) {
      if (current) packets.push(current);
      current = {
        no: timeMatch[1],
        time: timeMatch[2],
        src: timeMatch[3],
        dst: timeMatch[4],
        info: timeMatch[5],
        type: detectType(timeMatch[5]),
        raw: line,
        attrs: [],
      };
      continue;
    }

    // debug bgp output from vtysh
    const updateMatch = line.match(/BGP:\s*(sent|rcv)\s+UPDATE/i);
    if (updateMatch) {
      if (current) packets.push(current);
      current = {
        no: packets.length + 1,
        time: new Date().toLocaleTimeString(),
        src: updateMatch[1] === "sent" ? "local" : "peer",
        dst: updateMatch[1] === "sent" ? "peer" : "local",
        info: line.trim(),
        type: "UPDATE",
        raw: line,
        attrs: [],
      };
      continue;
    }

    // Atributos dentro de um UPDATE
    if (current) {
      const attrMatch = line.match(/\s+(ORIGIN|AS_PATH|NEXT_HOP|LOCAL_PREF|MED|MULTI_EXIT|COMMUNITY|AGGREGATOR)[\s:]+(.+)/i);
      if (attrMatch) {
        current.attrs.push({ name: attrMatch[1].toUpperCase(), value: attrMatch[2].trim() });
      }

      // Prefixos anunciados
      const prefixMatch = line.match(/\s+(\d+\.\d+\.\d+\.\d+\/\d+)/);
      if (prefixMatch && current.type === "UPDATE") {
        current.attrs.push({ name: "NLRI", value: prefixMatch[1] });
      }
    }
  }
  if (current) packets.push(current);
  return packets;
}

function detectType(info) {
  const i = info.toUpperCase();
  if (i.includes("OPEN"))         return "OPEN";
  if (i.includes("UPDATE"))       return "UPDATE";
  if (i.includes("NOTIFICATION")) return "NOTIFICATION";
  if (i.includes("KEEPALIVE"))    return "KEEPALIVE";
  if (i.includes("ROUTE-REFRESH")) return "ROUTE-REFRESH";
  return "UNKNOWN";
}

// ─── Parse "show ip bgp neighbors X received-routes" output ──────────────────
function parseNeighborOutput(raw, srcRouter) {
  const packets = [];
  const lines = raw.split("\n");
  let prefixCount = 0;

  for (const line of lines) {
    // Prefixo na tabela BGP: "   *> 150.1.1.0/24    10.0.0.1    100    0  1 i"
    const routeMatch = line.match(/\s*[*>di ]+\s*([\d.]+\/\d+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+([\d ]+)([iei?])/);
    if (routeMatch) {
      prefixCount++;
      const attrs = [
        { name: "NLRI",       value: routeMatch[1] },
        { name: "NEXT_HOP",   value: routeMatch[2] },
        { name: "LOCAL_PREF", value: routeMatch[3] },
        { name: "MED",        value: routeMatch[4] },
        { name: "AS_PATH",    value: routeMatch[5].trim() || "(empty)" },
        { name: "ORIGIN",     value: BGP_ORIGIN_VALUES[{ i: 0, e: 1, "?": 2 }[routeMatch[6]]] || routeMatch[6] },
      ];
      packets.push({
        no: prefixCount,
        time: new Date().toLocaleTimeString(),
        src: "neighbor",
        dst: srcRouter,
        info: `UPDATE: ${routeMatch[1]}`,
        type: "UPDATE",
        raw: line.trim(),
        attrs,
        best: line.trim().startsWith("*>"),
      });
    }

    // BGP summary line
    const summaryMatch = line.match(/(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+:\d+:\d+)\s+Established/);
    if (summaryMatch) {
      packets.push({
        no: packets.length + 1,
        time: new Date().toLocaleTimeString(),
        src: summaryMatch[1],
        dst: srcRouter,
        info: "BGP Session Established",
        type: "OPEN",
        raw: line.trim(),
        attrs: [
          { name: "PEER",     value: summaryMatch[1] },
          { name: "UPTIME",   value: summaryMatch[5] },
          { name: "STATE",    value: "Established" },
        ],
      });
    }
  }
  return packets;
}

// ─── PacketAnalyzer component ──────────────────────────────────────────────────
export function PacketAnalyzer({ sessionId, lab, containers }) {
  const [packets, setPackets]         = useState([]);
  const [selected, setSelected]       = useState(null);
  const [capturing, setCapturing]     = useState(false);
  const [captureRouter, setCaptureRouter] = useState("R1");
  const [captureCmd, setCaptureCmd]   = useState("show ip bgp neighbors");
  const [filter, setFilter]           = useState("ALL");
  const [search, setSearch]           = useState("");
  const [log, setLog]                 = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef(null);

  const routers = containers.length
    ? containers.map((c) => c.split("-").pop().toUpperCase())
    : (lab?.routers || ["R1", "R2", "R3", "R4"]);

  const CAPTURE_COMMANDS = [
    { label: "Rotas recebidas (show bgp neighbors)",    cmd: "show ip bgp neighbors" },
    { label: "Tabela BGP completa",                     cmd: "show ip bgp" },
    { label: "Debug updates (ao vivo)",                  cmd: "do debug bgp updates" },
    { label: "Rotas anunciadas para vizinhos",           cmd: "show ip bgp neighbors advertised-routes" },
    { label: "Detalhes de prefixo específico",           cmd: "show ip bgp 150.1.1.0/24" },
    { label: "Summary de sessões BGP",                   cmd: "show bgp summary" },
  ];

  const capture = useCallback(async () => {
    if (!sessionId) return;
    setCapturing(true);
    setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] Executando: ${captureRouter}# ${captureCmd}`]);

    try {
      const res = await apiFetch("POST", `/session/${sessionId}/exec`, {
        router: captureRouter,
        command: captureCmd,
      });

      const raw = res.output || "";
      setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${raw.split("\n").length} linhas recebidas`]);

      // Parse dependendo do comando
      let parsed = [];
      if (captureCmd.includes("neighbors")) {
        parsed = parseNeighborOutput(raw, captureRouter);
      } else {
        parsed = parseTsharkOutput(raw);
        // Se não parseu nada, cria um "raw" packet
        if (parsed.length === 0 && raw.trim()) {
          parsed = raw.split("\n")
            .filter((l) => l.trim().length > 3)
            .map((line, i) => ({
              no: i + 1,
              time: new Date().toLocaleTimeString(),
              src: captureRouter,
              dst: "output",
              info: line.trim().slice(0, 80),
              type: detectType(line),
              raw: line,
              attrs: extractInlineAttrs(line),
            }));
        }
      }

      setPackets((p) => [...parsed, ...p].slice(0, 500));
      if (parsed.length > 0) setSelected(parsed[0]);
    } catch (e) {
      setLog((l) => [...l, `[ERR] ${e.message}`]);
    } finally {
      setCapturing(false);
    }
  }, [sessionId, captureRouter, captureCmd]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(capture, 5000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, capture]);

  function extractInlineAttrs(line) {
    const attrs = [];
    const med = line.match(/metric\s+(\d+)/i);
    if (med) attrs.push({ name: "MED", value: med[1] });
    const lp = line.match(/localpref\s+(\d+)/i);
    if (lp) attrs.push({ name: "LOCAL_PREF", value: lp[1] });
    const asp = line.match(/path\s+([\d ]+)/i);
    if (asp) attrs.push({ name: "AS_PATH", value: asp[1].trim() });
    const comm = line.match(/community\s+([\d:]+)/i);
    if (comm) attrs.push({ name: "COMMUNITY", value: comm[1] });
    return attrs;
  }

  const filtered = packets.filter((p) => {
    if (filter !== "ALL" && p.type !== filter) return false;
    if (search && !p.info.toLowerCase().includes(search.toLowerCase()) &&
        !p.src.includes(search) && !p.dst.includes(search)) return false;
    return true;
  });

  const TYPES_WITH_COUNT = ["ALL", "OPEN", "UPDATE", "KEEPALIVE", "NOTIFICATION"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "monospace", background: WIRESHARK.bg }}>
      {/* ── Toolbar ── */}
      <div style={{ background: WIRESHARK.header, borderBottom: `1px solid ${WIRESHARK.border}`, padding: "8px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
        {/* Router selector */}
        <select value={captureRouter} onChange={(e) => setCaptureRouter(e.target.value)}
          style={{ background: WIRESHARK.bg, border: `1px solid ${WIRESHARK.borderStrong}`, color: WIRESHARK.text, padding: "5px 10px", borderRadius: 6, fontSize: 12 }}>
          {routers.map((r) => <option key={r}>{r}</option>)}
        </select>

        {/* Command selector */}
        <select value={captureCmd} onChange={(e) => setCaptureCmd(e.target.value)}
          style={{ background: WIRESHARK.bg, border: `1px solid ${WIRESHARK.borderStrong}`, color: WIRESHARK.text, padding: "5px 10px", borderRadius: 6, fontSize: 12, flex: 1, minWidth: 160 }}>
          {CAPTURE_COMMANDS.map((c) => (
            <option key={c.cmd} value={c.cmd}>{c.label}</option>
          ))}
        </select>

        {/* Capture button */}
        <button onClick={capture} disabled={capturing || !sessionId}
          style={{ background: capturing ? "#1e293b" : "#064e3b", border: "1px solid #22c55e", color: capturing ? WIRESHARK.subtle : "#bbf7d0", padding: "5px 16px", borderRadius: 6, cursor: capturing ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}>
          {capturing ? "⏳" : "▶"} {capturing ? "Capturando..." : "Capturar"}
        </button>

        {/* Auto refresh */}
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 11, color: autoRefresh ? "#86efac" : WIRESHARK.muted }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} style={{ accentColor: "#4ade80" }} />
          Auto 5s
        </label>

        {/* Clear */}
        <button onClick={() => { setPackets([]); setSelected(null); setLog([]); }}
          style={{ background: "none", border: `1px solid ${WIRESHARK.border}`, color: WIRESHARK.muted, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
          ⌫ Limpar
        </button>

        <div style={{ marginLeft: "auto", color: WIRESHARK.muted, fontSize: 11 }}>
          {filtered.length} pacotes
        </div>
      </div>

      <div style={{ background: WIRESHARK.panel, borderBottom: `1px solid ${WIRESHARK.border}`, padding: "6px 14px", color: WIRESHARK.muted, fontSize: 10, lineHeight: 1.45 }}>
        Dados reais do FRR via comandos executados nos containers. A lista abaixo é uma decodificação estilo Wireshark desses outputs, não um mock e não um arquivo PCAP bruto.
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background: WIRESHARK.header, borderBottom: `1px solid ${WIRESHARK.border}`, padding: "6px 14px", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        {TYPES_WITH_COUNT.map((t) => {
          const count = t === "ALL" ? packets.length : packets.filter((p) => p.type === t).length;
          const active = filter === t;
          const col = MSG_COLORS[t] || WIRESHARK.muted;
          return (
            <button key={t} onClick={() => setFilter(t)}
              style={{ background: active ? WIRESHARK.selected : "none", border: `1px solid ${active ? col : WIRESHARK.border}`, color: active ? col : WIRESHARK.muted, padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 500 }}>
              {t} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          );
        })}
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por IP, prefixo..."
          style={{ marginLeft: "auto", background: WIRESHARK.bg, border: `1px solid ${WIRESHARK.border}`, borderRadius: 4, color: WIRESHARK.text, padding: "3px 10px", fontSize: 11, width: 180 }} />
      </div>

      {/* ── Main panel: packet list + detail ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateRows: "1fr 1fr", overflow: "hidden" }}>

        {/* Packet list */}
        <div style={{ overflowY: "auto", borderBottom: `1px solid ${WIRESHARK.border}` }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "40px 80px 100px 100px 1fr", gap: 4, padding: "4px 10px", background: WIRESHARK.header, borderBottom: `1px solid ${WIRESHARK.border}`, fontSize: 10, color: WIRESHARK.muted, position: "sticky", top: 0, fontWeight: 700 }}>
            <span>No.</span><span>Hora</span><span>Origem</span><span>Destino</span><span>Info</span>
          </div>

          {filtered.length === 0 && (
            <div style={{ color: WIRESHARK.subtle, fontSize: 11, padding: "24px 14px", textAlign: "center" }}>
              {packets.length === 0
                ? "← Selecione um roteador e clique em Capturar"
                : "Nenhum pacote corresponde ao filtro"}
            </div>
          )}

          {filtered.map((pkt, i) => {
            const col = MSG_COLORS[pkt.type] || WIRESHARK.muted;
            const isSel = selected?.no === pkt.no && selected?.time === pkt.time;
            return (
              <div key={i} onClick={() => setSelected(pkt)}
                style={{ display: "grid", gridTemplateColumns: "40px 80px 100px 100px 1fr", gap: 4, padding: "4px 10px", background: isSel ? WIRESHARK.selected : i % 2 === 0 ? WIRESHARK.bg : WIRESHARK.panel, cursor: "pointer", borderLeft: `3px solid ${isSel ? col : "transparent"}`, fontSize: 11 }}>
                <span style={{ color: WIRESHARK.subtle }}>{pkt.no}</span>
                <span style={{ color: WIRESHARK.muted }}>{pkt.time}</span>
                <span style={{ color: WIRESHARK.text }}>{pkt.src}</span>
                <span style={{ color: WIRESHARK.text }}>{pkt.dst}</span>
                <span style={{ color: col, fontWeight: isSel ? 700 : 500 }}>{pkt.best ? "▶ " : ""}{pkt.info}</span>
              </div>
            );
          })}
        </div>

        {/* Packet detail */}
        <div style={{ overflowY: "auto", background: WIRESHARK.bg }}>
          {!selected ? (
            <div style={{ color: WIRESHARK.subtle, fontSize: 11, padding: "20px 14px" }}>
              Selecione um pacote para ver detalhes
            </div>
          ) : (
            <div style={{ padding: "10px 14px" }}>
              {/* Header do pacote */}
              <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ background: WIRESHARK.selected, color: MSG_COLORS[selected.type] || "#60a5fa", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: "bold", border: `1px solid ${WIRESHARK.border}` }}>
                  BGP {selected.type}
                </span>
                <span style={{ color: WIRESHARK.muted, fontSize: 11 }}>
                  {selected.src} → {selected.dst}
                </span>
                <span style={{ color: WIRESHARK.subtle, fontSize: 10 }}>{selected.time}</span>
              </div>

              {/* Árvore de decode estilo Wireshark */}
              <BGPDecodeTree packet={selected} />

              {/* Raw output */}
              <details style={{ marginTop: 8 }}>
                <summary style={{ color: WIRESHARK.muted, fontSize: 10, cursor: "pointer", marginBottom: 4 }}>
                  Raw output
                </summary>
                <pre style={{ color: "#cbd5e1", fontSize: 9, overflowX: "auto", background: WIRESHARK.header, padding: "6px 10px", borderRadius: 4, border: `1px solid ${WIRESHARK.border}` }}>
                  {selected.raw}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* ── Log ── */}
      {log.length > 0 && (
        <div style={{ background: WIRESHARK.header, borderTop: `1px solid ${WIRESHARK.border}`, padding: "4px 14px", maxHeight: 60, overflowY: "auto", flexShrink: 0 }}>
          {log.slice(-5).map((l, i) => (
            <div key={i} style={{ color: WIRESHARK.muted, fontSize: 9 }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BGPDecodeTree — decode visual estilo Wireshark ──────────────────────────
function BGPDecodeTree({ packet }) {
  const [open, setOpen] = useState({ header: true, attrs: true, nlri: true });

  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const col = MSG_COLORS[packet.type] || "#60a5fa";

  // Separa atributos por tipo
  const pathAttrs = packet.attrs.filter((a) => !["NLRI", "PEER", "STATE", "UPTIME"].includes(a.name));
  const nlriAttrs = packet.attrs.filter((a) => a.name === "NLRI");
  const sessionAttrs = packet.attrs.filter((a) => ["PEER", "STATE", "UPTIME"].includes(a.name));

  return (
    <div style={{ fontSize: 11, fontFamily: "monospace", color: WIRESHARK.text }}>
      {/* ── BGP Header ── */}
      <TreeNode
        open={open.header}
        onToggle={() => toggle("header")}
        label="Border Gateway Protocol"
        color={WIRESHARK.text}
        depth={0}
      >
        <TreeLeaf label="Type" value={`${packet.type} (${Object.entries(BGP_MSG_TYPES).find(([, v]) => v === packet.type)?.[0] || "?"})`} color={col} depth={1} />
        <TreeLeaf label="Source" value={packet.src} color={WIRESHARK.text} depth={1} />
        <TreeLeaf label="Destination" value={packet.dst} color={WIRESHARK.text} depth={1} />
      </TreeNode>

      {/* ── Path Attributes (UPDATE) ── */}
      {pathAttrs.length > 0 && (
        <TreeNode
          open={open.attrs}
          onToggle={() => toggle("attrs")}
          label="Path Attributes"
          color="#60a5fa"
          depth={0}
        >
          {pathAttrs.map((attr, i) => (
            <PathAttrDecode key={i} attr={attr} depth={1} />
          ))}
        </TreeNode>
      )}

      {/* ── NLRI ── */}
      {nlriAttrs.length > 0 && (
        <TreeNode
          open={open.nlri}
          onToggle={() => toggle("nlri")}
          label={`Network Layer Reachability Information (${nlriAttrs.length} prefix${nlriAttrs.length > 1 ? "es" : ""})`}
          color="#4ade80"
          depth={0}
        >
          {nlriAttrs.map((attr, i) => (
            <TreeLeaf key={i} label={`Prefix [${i + 1}]`} value={attr.value} color="#4ade80" depth={1}
              badge={packet.best ? "best" : undefined} badgeColor="#052e16" />
          ))}
        </TreeNode>
      )}

      {/* ── Session info (OPEN / summary) ── */}
      {sessionAttrs.length > 0 && (
        <TreeNode open={true} onToggle={() => {}} label="Session Info" color="#a78bfa" depth={0}>
          {sessionAttrs.map((attr, i) => (
            <TreeLeaf key={i} label={attr.name} value={attr.value} color="#a78bfa" depth={1} />
          ))}
        </TreeNode>
      )}

      {/* Caso sem atributos parseados */}
      {packet.attrs.length === 0 && (
        <div style={{ color: WIRESHARK.subtle, padding: "6px 20px", fontSize: 10 }}>
          Nenhum atributo decodificado — execute um dos comandos de captura para obter detalhes
        </div>
      )}
    </div>
  );
}

// ─── Tree UI components ───────────────────────────────────────────────────────
function TreeNode({ open, onToggle, label, color, depth, children }) {
  const indent = depth * 16;
  return (
    <div>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", paddingLeft: indent + 4, cursor: "pointer", borderRadius: 3 }}
        onMouseEnter={(e) => e.currentTarget.style.background = WIRESHARK.panelAlt}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
        <span style={{ color: WIRESHARK.muted, fontSize: 10 }}>{open ? "▼" : "▶"}</span>
        <span style={{ color, fontWeight: 700 }}>{label}</span>
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function TreeLeaf({ label, value, color, depth, badge, badgeColor }) {
  const indent = depth * 16;
  const ATTR_HELP = {
    "ORIGIN":     "Como a rota foi originada: IGP=aprendida internamente, EGP=aprendida via protocolo exterior, INCOMPLETE=redistribuída",
    "AS_PATH":    "Lista de ASes que a rota atravessou. Caminho mais curto é preferido na seleção BGP",
    "NEXT_HOP":   "Endereço IP do próximo salto para alcançar o prefixo anunciado",
    "LOCAL_PREF": "Preferência local (maior = melhor). Usado para seleção de saída dentro do AS",
    "MED":        "Multi-Exit Discriminator (menor = melhor). Sugestão para roteadores externos sobre qual entrada preferir",
    "COMMUNITY":  "Grupos de prefixos para aplicação de políticas. Ex: no-export (65535:65281), no-advertise (65535:65282)",
    "NLRI":       "Network Layer Reachability Information — o prefixo sendo anunciado neste UPDATE",
    "AS_CONFED_SEQUENCE": "Sequência de sub-ASes dentro de uma Confederação BGP (removida em anúncios externos)",
  };

  const help = ATTR_HELP[label];
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div style={{ display: "flex", gap: 8, padding: "2px 4px", paddingLeft: indent + 20, alignItems: "flex-start" }}
      onMouseEnter={() => help && setShowHelp(true)}
      onMouseLeave={() => setShowHelp(false)}>
      <span style={{ color: WIRESHARK.muted, minWidth: 130, flexShrink: 0 }}>{label}:</span>
      <span style={{ color, fontWeight: 600 }}>
        {value}
        {badge && <span style={{ marginLeft: 6, background: badgeColor, color: "#4ade80", padding: "1px 5px", borderRadius: 3, fontSize: 9 }}>{badge}</span>}
        {help && <span style={{ marginLeft: 4, color: WIRESHARK.muted, fontSize: 9, cursor: "help" }}>ⓘ</span>}
      </span>
      {showHelp && help && (
        <div style={{ position: "fixed", background: WIRESHARK.selected, border: `1px solid ${WIRESHARK.borderStrong}`, color: WIRESHARK.text, padding: "8px 12px", borderRadius: 6, fontSize: 10, maxWidth: 280, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.6)", lineHeight: 1.5 }}>
          <strong style={{ color: "#7dd3fc" }}>{label}</strong><br />{help}
        </div>
      )}
    </div>
  );
}

function PathAttrDecode({ attr, depth }) {
  // Decode visual específico por tipo de atributo
  const DETAIL = {
    ORIGIN: (v) => `${v} (${v === "IGP" ? "0" : v === "EGP" ? "1" : "2"})`,
    AS_PATH: (v) => v || "(empty — rota local)",
    LOCAL_PREF: (v) => `${v} (${parseInt(v) > 100 ? "↑ acima do padrão 100" : parseInt(v) < 100 ? "↓ abaixo do padrão 100" : "= padrão"})`,
    MED: (v) => `${v} (menor = preferido)`,
    "MULTI_EXIT_DISC (MED)": (v) => `${v} (menor = preferido)`,
    COMMUNITY: (v) => {
      const parts = v.split(" ");
      return parts.map((c) => {
        if (c === "65535:65281" || c === "no-export") return "no-export (65535:65281)";
        if (c === "65535:65282" || c === "no-advertise") return "no-advertise (65535:65282)";
        return c;
      }).join(", ");
    },
  };

  const displayVal = DETAIL[attr.name] ? DETAIL[attr.name](attr.value) : attr.value;
  const col = {
    ORIGIN: "#fde68a",
    AS_PATH: "#7dd3fc",
    NEXT_HOP: "#86efac",
    LOCAL_PREF: "#fdba74",
    MED: "#c4b5fd",
    COMMUNITY: "#fca5a5",
  }[attr.name] || WIRESHARK.text;

  return <TreeLeaf label={attr.name} value={displayVal} color={col} depth={depth} />;
}
