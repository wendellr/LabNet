import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../hooks/index.js";

// ─── Estilo compartilhado (Wireshark-like) ─────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
// ─── Adapter BGP ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const BGP_MSG_TYPES = { 1: "OPEN", 2: "UPDATE", 3: "NOTIFICATION", 4: "KEEPALIVE", 5: "ROUTE-REFRESH" };
const BGP_ORIGIN_VALUES = { 0: "IGP", 1: "EGP", 2: "INCOMPLETE" };

const BGP_MSG_COLORS = {
  OPEN: "#86efac", UPDATE: "#7dd3fc", NOTIFICATION: "#fca5a5",
  KEEPALIVE: "#cbd5e1", "ROUTE-REFRESH": "#c4b5fd",
};

const BGP_ATTR_HELP = {
  "ORIGIN":     "Como a rota foi originada: IGP=aprendida internamente, EGP=aprendida via protocolo exterior, INCOMPLETE=redistribuída",
  "AS_PATH":    "Lista de ASes que a rota atravessou. Caminho mais curto é preferido na seleção BGP",
  "NEXT_HOP":   "Endereço IP do próximo salto para alcançar o prefixo anunciado",
  "LOCAL_PREF": "Preferência local (maior = melhor). Usado para seleção de saída dentro do AS",
  "MED":        "Multi-Exit Discriminator (menor = melhor). Sugestão para roteadores externos sobre qual entrada preferir",
  "COMMUNITY":  "Grupos de prefixos para aplicação de políticas. Ex: no-export (65535:65281), no-advertise (65535:65282)",
  "NLRI":       "Network Layer Reachability Information — o prefixo sendo anunciado neste UPDATE",
  "AS_CONFED_SEQUENCE": "Sequência de sub-ASes dentro de uma Confederação BGP (removida em anúncios externos)",
  "PEER":       "Endereço do vizinho BGP",
  "UPTIME":     "Tempo desde que a sessão BGP foi estabelecida",
  "STATE":      "Estado da sessão BGP (Established = pronta para trocar rotas)",
};

function detectBgpType(info) {
  const i = info.toUpperCase();
  if (i.includes("OPEN"))         return "OPEN";
  if (i.includes("UPDATE"))       return "UPDATE";
  if (i.includes("NOTIFICATION")) return "NOTIFICATION";
  if (i.includes("KEEPALIVE"))    return "KEEPALIVE";
  if (i.includes("ROUTE-REFRESH")) return "ROUTE-REFRESH";
  return "UNKNOWN";
}

// ─── Parse tshark/tcpdump output into structured BGP packets ──────────────────
function parseBgpTsharkOutput(raw) {
  const packets = [];
  const lines = raw.split("\n");
  let current = null;

  for (const line of lines) {
    const timeMatch = line.match(/^\s*(\d+)\s+([\d.]+)\s+(\S+)\s+->\s+(\S+)\s+BGP\s+(.*)/i);
    if (timeMatch) {
      if (current) packets.push(current);
      current = {
        no: timeMatch[1],
        time: timeMatch[2],
        src: timeMatch[3],
        dst: timeMatch[4],
        info: timeMatch[5],
        type: detectBgpType(timeMatch[5]),
        raw: line,
        attrs: [],
      };
      continue;
    }

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

    if (current) {
      const attrMatch = line.match(/\s+(ORIGIN|AS_PATH|NEXT_HOP|LOCAL_PREF|MED|MULTI_EXIT|COMMUNITY|AGGREGATOR)[\s:]+(.+)/i);
      if (attrMatch) {
        current.attrs.push({ name: attrMatch[1].toUpperCase(), value: attrMatch[2].trim() });
      }

      const prefixMatch = line.match(/\s+(\d+\.\d+\.\d+\.\d+\/\d+)/);
      if (prefixMatch && current.type === "UPDATE") {
        current.attrs.push({ name: "NLRI", value: prefixMatch[1] });
      }
    }
  }
  if (current) packets.push(current);
  return packets;
}

// ─── Parse "show ip bgp neighbors X received-routes" output ──────────────────
function parseBgpNeighborOutput(raw, srcRouter) {
  const packets = [];
  const lines = raw.split("\n");
  let prefixCount = 0;

  for (const line of lines) {
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

function extractBgpInlineAttrs(line) {
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

const BGP_CAPTURE_COMMANDS = [
  { label: "Rotas recebidas (show bgp neighbors)",    cmd: "show ip bgp neighbors" },
  { label: "Tabela BGP completa",                     cmd: "show ip bgp" },
  { label: "Debug updates (ao vivo)",                  cmd: "do debug bgp updates" },
  { label: "Rotas anunciadas para vizinhos",           cmd: "show ip bgp neighbors advertised-routes" },
  { label: "Detalhes de prefixo específico",           cmd: "show ip bgp 150.1.1.0/24" },
  { label: "Summary de sessões BGP",                   cmd: "show bgp summary" },
];

function bgpParse(cmd, raw, router) {
  if (cmd.includes("neighbors")) return parseBgpNeighborOutput(raw, router);
  return parseBgpTsharkOutput(raw);
}

function BGPDecodeTree({ packet }) {
  const [open, setOpen] = useState({ header: true, attrs: true, nlri: true });
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const col = BGP_MSG_COLORS[packet.type] || "#60a5fa";

  const pathAttrs = packet.attrs.filter((a) => !["NLRI", "PEER", "STATE", "UPTIME"].includes(a.name));
  const nlriAttrs = packet.attrs.filter((a) => a.name === "NLRI");
  const sessionAttrs = packet.attrs.filter((a) => ["PEER", "STATE", "UPTIME"].includes(a.name));

  return (
    <div style={{ fontSize: 11, fontFamily: "monospace", color: WIRESHARK.text }}>
      <TreeNode open={open.header} onToggle={() => toggle("header")} label="Border Gateway Protocol" color={WIRESHARK.text} depth={0}>
        <TreeLeaf label="Type" value={`${packet.type} (${Object.entries(BGP_MSG_TYPES).find(([, v]) => v === packet.type)?.[0] || "?"})`} color={col} depth={1} />
        <TreeLeaf label="Source" value={packet.src} color={WIRESHARK.text} depth={1} />
        <TreeLeaf label="Destination" value={packet.dst} color={WIRESHARK.text} depth={1} />
      </TreeNode>

      {pathAttrs.length > 0 && (
        <TreeNode open={open.attrs} onToggle={() => toggle("attrs")} label="Path Attributes" color="#60a5fa" depth={0}>
          {pathAttrs.map((attr, i) => (
            <BgpAttrDecode key={i} attr={attr} depth={1} />
          ))}
        </TreeNode>
      )}

      {nlriAttrs.length > 0 && (
        <TreeNode open={open.nlri} onToggle={() => toggle("nlri")}
          label={`Network Layer Reachability Information (${nlriAttrs.length} prefix${nlriAttrs.length > 1 ? "es" : ""})`}
          color="#4ade80" depth={0}>
          {nlriAttrs.map((attr, i) => (
            <TreeLeaf key={i} label={`Prefix [${i + 1}]`} value={attr.value} color="#4ade80" depth={1}
              badge={packet.best ? "best" : undefined} badgeColor="#052e16" />
          ))}
        </TreeNode>
      )}

      {sessionAttrs.length > 0 && (
        <TreeNode open={true} onToggle={() => {}} label="Session Info" color="#a78bfa" depth={0}>
          {sessionAttrs.map((attr, i) => (
            <TreeLeaf key={i} label={attr.name} value={attr.value} color="#a78bfa" depth={1} help={BGP_ATTR_HELP[attr.name]} />
          ))}
        </TreeNode>
      )}

      {packet.attrs.length === 0 && (
        <div style={{ color: WIRESHARK.subtle, padding: "6px 20px", fontSize: 10 }}>
          Nenhum atributo decodificado — execute um dos comandos de captura para obter detalhes
        </div>
      )}
    </div>
  );
}

function BgpAttrDecode({ attr, depth }) {
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
    ORIGIN: "#fde68a", AS_PATH: "#7dd3fc", NEXT_HOP: "#86efac",
    LOCAL_PREF: "#fdba74", MED: "#c4b5fd", COMMUNITY: "#fca5a5",
  }[attr.name] || WIRESHARK.text;

  return <TreeLeaf label={attr.name} value={displayVal} color={col} depth={depth} help={BGP_ATTR_HELP[attr.name]} />;
}

const BGP_ADAPTER = {
  key: "bgp",
  protocolLabel: "BGP",
  msgColors: BGP_MSG_COLORS,
  types: ["ALL", "OPEN", "UPDATE", "KEEPALIVE", "NOTIFICATION"],
  captureCommands: BGP_CAPTURE_COMMANDS,
  parse: bgpParse,
  detectType: detectBgpType,
  extractInlineAttrs: extractBgpInlineAttrs,
  DecodeTree: BGPDecodeTree,
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Adapter OSPF ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const OSPF_MSG_TYPES = { 1: "HELLO", 2: "DBD", 3: "LS_REQUEST", 4: "LS_UPDATE", 5: "LS_ACK" };

const OSPF_MSG_COLORS = {
  HELLO: "#86efac", DBD: "#7dd3fc", LS_REQUEST: "#fde68a",
  LS_UPDATE: "#c4b5fd", LS_ACK: "#cbd5e1", INTERFACE: "#2dd4bf",
};

const OSPF_ATTR_HELP = {
  NEIGHBOR_ID:  "Router-ID do vizinho OSPF",
  PRIORITY:     "Prioridade usada na eleição de DR/BDR — maior prioridade vence; 0 significa que o roteador nunca vira DR/BDR",
  STATE:        "Estado da adjacência. Full = sincronizado; 2-Way = vizinho reconhecido mas sem troca completa de LSAs; Init/Down = ainda não convergiu",
  DEAD_TIME:    "Tempo restante até o vizinho ser considerado morto se nenhum Hello chegar",
  ADDRESS:      "Endereço IP do vizinho na interface",
  INTERFACE:    "Interface local pela qual o vizinho é alcançado",
  AREA:         "Área OSPF da interface — roteadores da mesma área compartilham o mesmo banco de LSAs tipo 1/2",
  COST:         "Custo OSPF da interface (menor = preferido). Por padrão, banda de referência dividida pela banda da interface",
  LSA_TYPE:     "Tipo de LSA: Router (intra-área, um por roteador), Network (segmento multiacesso), Summary (inter-área), AS-External (rota redistribuída)",
  LINK_ID:      "Identificador do link/rede/roteador anunciado nesta LSA — o significado varia por tipo de LSA",
  ADV_ROUTER:   "Router-ID que originou esta LSA",
  AGE:          "Idade da LSA em segundos desde a origem — LSAs expiram e são reanunciadas periodicamente",
  SEQ:          "Número de sequência da LSA, usado para saber qual versão do banco de dados é mais recente",
  CHECKSUM:     "Checksum da LSA — detecta corrupção ou inconsistência no banco de dados distribuído entre roteadores",
  NETWORK_TYPE: "Tipo de rede OSPF da interface (Broadcast, Point-to-Point, ...) — define se há eleição de DR/BDR",
  DR_STATE:     "Papel do roteador nesta interface: DR (Designated Router), BDR (Backup) ou DROTHER",
  PEER:         "Vizinho envolvido na troca de pacote OSPF",
  DIRECTION:    "Sentido do pacote: recebido (RCV) ou enviado (SEND) por este roteador",
};

function detectOspfType(info) {
  const i = info.toUpperCase();
  if (i.includes("HELLO")) return "HELLO";
  if (i.includes("DB DESC") || i.includes("DBD") || i.includes("DATABASE DESC")) return "DBD";
  if (i.includes("LS-REQUEST") || i.includes("LS REQUEST") || i.includes("LINK STATE REQUEST")) return "LS_REQUEST";
  if (i.includes("LS-UPDATE") || i.includes("LS UPDATE") || i.includes("LINK STATE UPDATE")) return "LS_UPDATE";
  if (i.includes("LS-ACK") || i.includes("LS ACK") || i.includes("LINK STATE ACK")) return "LS_ACK";
  return "UNKNOWN";
}

// ─── Parse "show ip ospf neighbor" ─────────────────────────────────────────────
function parseOspfNeighborOutput(raw, srcRouter) {
  const packets = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    // "4.4.4.4           1 Full/DR          00:00:39 14.0.0.4        eth1:14.0.0.1"
    const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\S+)/);
    if (!m) continue;
    const [, neighborId, priority, state, deadTime, address, iface] = m;
    packets.push({
      no: packets.length + 1,
      time: new Date().toLocaleTimeString(),
      src: neighborId,
      dst: srcRouter,
      info: `Adjacência ${state}`,
      type: "HELLO",
      raw: line.trim(),
      best: state.toUpperCase().startsWith("FULL"),
      attrs: [
        { name: "NEIGHBOR_ID", value: neighborId },
        { name: "PRIORITY", value: priority },
        { name: "STATE", value: state },
        { name: "DEAD_TIME", value: deadTime },
        { name: "ADDRESS", value: address },
        { name: "INTERFACE", value: iface },
      ],
    });
  }
  return packets;
}

// ─── Parse "show ip ospf database" ─────────────────────────────────────────────
function parseOspfDatabaseOutput(raw, srcRouter) {
  const packets = [];
  const lines = raw.split("\n");
  let currentSection = "";
  for (const line of lines) {
    const sectionMatch = line.match(/(Router|Net|Network|Summary|ASBR-Summary|Type-5 AS External|AS External)\s+Link States/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }
    const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)/);
    if (!m) continue;
    const [, linkId, advRouter, age, seq, cksum] = m;
    packets.push({
      no: packets.length + 1,
      time: new Date().toLocaleTimeString(),
      src: advRouter,
      dst: srcRouter,
      info: `LSA ${currentSection || "?"} — Link ID ${linkId}`,
      type: "LS_UPDATE",
      raw: line.trim(),
      attrs: [
        { name: "LSA_TYPE", value: currentSection || "?" },
        { name: "LINK_ID", value: linkId },
        { name: "ADV_ROUTER", value: advRouter },
        { name: "AGE", value: age },
        { name: "SEQ", value: seq },
        { name: "CHECKSUM", value: cksum },
      ],
    });
  }
  return packets;
}

// ─── Parse "show ip ospf interface" ────────────────────────────────────────────
function parseOspfInterfaceOutput(raw, srcRouter) {
  const packets = [];
  const blocks = raw.split(/\n(?=\S+ is (?:up|down))/);
  for (const block of blocks) {
    const ifaceMatch = block.match(/^(\S+) is (up|down)/);
    if (!ifaceMatch) continue;
    const [, iface, state] = ifaceMatch;
    const areaMatch = block.match(/Area\s+([\d.]+)/);
    const costMatch = block.match(/Cost:\s*(\d+)/);
    const networkTypeMatch = block.match(/Network Type\s+(\S+)/);
    const drStateMatch = block.match(/State\s+(\S+)/);
    packets.push({
      no: packets.length + 1,
      time: new Date().toLocaleTimeString(),
      src: srcRouter,
      dst: iface,
      info: `Interface ${iface} — Área ${areaMatch?.[1] || "?"}`,
      type: "INTERFACE",
      raw: block.trim(),
      attrs: [
        { name: "INTERFACE", value: iface },
        { name: "STATE", value: state },
        { name: "AREA", value: areaMatch?.[1] || "?" },
        { name: "COST", value: costMatch?.[1] || "?" },
        { name: "NETWORK_TYPE", value: networkTypeMatch?.[1] || "?" },
        { name: "DR_STATE", value: drStateMatch?.[1] || "?" },
      ],
    });
  }
  return packets;
}

// ─── Parse "do debug ospf packet all" (captura ao vivo) ────────────────────────
function parseOspfDebugOutput(raw, srcRouter) {
  const packets = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    // Ex.: "OSPF: Rcv hello from 4.4.4.4 via eth1: 14.0.0.4"
    // Ex.: "OSPF: Send DB Description to 4.4.4.4 via eth1"
    const m = line.match(/OSPF:\s*(Rcv|Send)\s+(.+?)\s+(?:from|to)\s+(\d+\.\d+\.\d+\.\d+)/i);
    if (!m) continue;
    const [, dir, kind, peer] = m;
    const type = detectOspfType(kind);
    const isRcv = dir.toLowerCase() === "rcv";
    packets.push({
      no: packets.length + 1,
      time: new Date().toLocaleTimeString(),
      src: isRcv ? peer : srcRouter,
      dst: isRcv ? srcRouter : peer,
      info: line.trim(),
      type,
      raw: line.trim(),
      attrs: [
        { name: "PEER", value: peer },
        { name: "DIRECTION", value: dir.toUpperCase() },
      ],
    });
  }
  return packets;
}

function extractOspfInlineAttrs(line) {
  const attrs = [];
  const area = line.match(/area\s+([\d.]+)/i);
  if (area) attrs.push({ name: "AREA", value: area[1] });
  const cost = line.match(/cost[:\s]+(\d+)/i);
  if (cost) attrs.push({ name: "COST", value: cost[1] });
  return attrs;
}

const OSPF_CAPTURE_COMMANDS = [
  { label: "Vizinhos OSPF (show ip ospf neighbor)",    cmd: "show ip ospf neighbor" },
  { label: "Base de LSAs (show ip ospf database)",     cmd: "show ip ospf database" },
  { label: "Detalhes de interface",                    cmd: "show ip ospf interface" },
  { label: "Debug de pacotes (ao vivo)",                cmd: "do debug ospf packet all" },
  { label: "Processo OSPF (show ip ospf)",              cmd: "show ip ospf" },
];

function ospfParse(cmd, raw, router) {
  if (cmd.includes("neighbor")) return parseOspfNeighborOutput(raw, router);
  if (cmd.includes("database")) return parseOspfDatabaseOutput(raw, router);
  if (cmd.includes("interface")) return parseOspfInterfaceOutput(raw, router);
  return parseOspfDebugOutput(raw, router);
}

const OSPF_FIELD_GROUPS = {
  NEIGHBOR_ID: "Vizinho", PRIORITY: "Vizinho", STATE: "Vizinho", DEAD_TIME: "Vizinho", ADDRESS: "Vizinho",
  LSA_TYPE: "LSA", LINK_ID: "LSA", ADV_ROUTER: "LSA", AGE: "LSA", SEQ: "LSA", CHECKSUM: "LSA",
  AREA: "Interface", COST: "Interface", NETWORK_TYPE: "Interface", DR_STATE: "Interface",
  PEER: "Pacote", DIRECTION: "Pacote",
};

function OSPFDecodeTree({ packet }) {
  const [open, setOpen] = useState({ header: true });
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !(o[key] ?? true) }));
  const col = OSPF_MSG_COLORS[packet.type] || "#2dd4bf";

  const groups = {};
  for (const attr of packet.attrs) {
    // INTERFACE já aparece no header (Source/Destination) — evita repetir como grupo isolado
    if (attr.name === "INTERFACE") continue;
    const g = OSPF_FIELD_GROUPS[attr.name] || "Detalhes";
    (groups[g] = groups[g] || []).push(attr);
  }

  const groupColor = { Vizinho: "#4ade80", LSA: "#c4b5fd", Interface: "#2dd4bf", Pacote: "#a78bfa", Detalhes: WIRESHARK.muted };

  return (
    <div style={{ fontSize: 11, fontFamily: "monospace", color: WIRESHARK.text }}>
      <TreeNode open={open.header} onToggle={() => toggle("header")} label="Open Shortest Path First" color={WIRESHARK.text} depth={0}>
        <TreeLeaf label="Type" value={`${packet.type} (${Object.entries(OSPF_MSG_TYPES).find(([, v]) => v === packet.type)?.[0] || "?"})`} color={col} depth={1} />
        <TreeLeaf label="Source" value={packet.src} color={WIRESHARK.text} depth={1} />
        <TreeLeaf label="Destination" value={packet.dst} color={WIRESHARK.text} depth={1} />
      </TreeNode>

      {Object.entries(groups).map(([groupName, attrs]) => (
        <TreeNode key={groupName} open={open[groupName] ?? true} onToggle={() => toggle(groupName)}
          label={groupName} color={groupColor[groupName] || WIRESHARK.muted} depth={0}>
          {attrs.map((attr, i) => (
            <TreeLeaf key={i} label={attr.name} value={attr.value} color={groupColor[groupName] || WIRESHARK.text} depth={1}
              help={OSPF_ATTR_HELP[attr.name]}
              badge={groupName === "Vizinho" && attr.name === "STATE" && packet.best ? "full" : undefined}
              badgeColor="#052e16" />
          ))}
        </TreeNode>
      ))}

      {packet.attrs.length === 0 && (
        <div style={{ color: WIRESHARK.subtle, padding: "6px 20px", fontSize: 10 }}>
          Nenhum atributo decodificado — execute um dos comandos de captura para obter detalhes
        </div>
      )}
    </div>
  );
}

const OSPF_ADAPTER = {
  key: "ospf",
  protocolLabel: "OSPF",
  msgColors: OSPF_MSG_COLORS,
  types: ["ALL", "HELLO", "DBD", "LS_UPDATE", "LS_ACK", "LS_REQUEST"],
  captureCommands: OSPF_CAPTURE_COMMANDS,
  parse: ospfParse,
  detectType: detectOspfType,
  extractInlineAttrs: extractOspfInlineAttrs,
  DecodeTree: OSPFDecodeTree,
};

const ADAPTERS = { bgp: BGP_ADAPTER, ospf: OSPF_ADAPTER };

// ═══════════════════════════════════════════════════════════════════════════
// ─── PacketAnalyzer component ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export function PacketAnalyzer({ sessionId, lab, containers, protocol }) {
  const labProtocol = protocol || lab?.protocol || "bgp";
  const isCombined = labProtocol === "bgp+ospf";
  const [activeKey, setActiveKey] = useState(labProtocol === "ospf" ? "ospf" : "bgp");
  const adapter = ADAPTERS[activeKey] || BGP_ADAPTER;

  const [packets, setPackets]         = useState([]); // cada pacote carrega .proto ("bgp"|"ospf")
  const [selected, setSelected]       = useState(null);
  const [capturing, setCapturing]     = useState(false);
  const [captureRouter, setCaptureRouter] = useState("R1");
  const [captureCmd, setCaptureCmd]   = useState(adapter.captureCommands[0].cmd);
  const [filter, setFilter]           = useState("ALL");
  const [search, setSearch]           = useState("");
  const [log, setLog]                 = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef(null);

  const routers = containers.length
    ? containers.map((c) => c.split("-").pop().toUpperCase())
    : (lab?.routers || ["R1", "R2", "R3", "R4"]);

  const switchAdapter = (key) => {
    if (key === activeKey) return;
    setActiveKey(key);
    setFilter("ALL");
    setSelected(null);
    setCaptureCmd(ADAPTERS[key].captureCommands[0].cmd);
  };

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

      let parsed = adapter.parse(captureCmd, raw, captureRouter);
      if (parsed.length === 0 && raw.trim()) {
        parsed = raw.split("\n")
          .filter((l) => l.trim().length > 3)
          .map((line, i) => ({
            no: i + 1,
            time: new Date().toLocaleTimeString(),
            src: captureRouter,
            dst: "output",
            info: line.trim().slice(0, 80),
            type: adapter.detectType(line),
            raw: line,
            attrs: adapter.extractInlineAttrs(line),
          }));
      }
      parsed = parsed.map((p) => ({ ...p, proto: activeKey }));

      setPackets((p) => [...parsed, ...p].slice(0, 500));
      if (parsed.length > 0) setSelected(parsed[0]);
    } catch (e) {
      setLog((l) => [...l, `[ERR] ${e.message}`]);
    } finally {
      setCapturing(false);
    }
  }, [sessionId, captureRouter, captureCmd, activeKey, adapter]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(capture, 5000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, capture]);

  const visiblePackets = packets.filter((p) => p.proto === activeKey);
  const filtered = visiblePackets.filter((p) => {
    if (filter !== "ALL" && p.type !== filter) return false;
    if (search && !p.info.toLowerCase().includes(search.toLowerCase()) &&
        !p.src.includes(search) && !p.dst.includes(search)) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "monospace", background: WIRESHARK.bg }}>
      {/* ── Toolbar ── */}
      <div style={{ background: WIRESHARK.header, borderBottom: `1px solid ${WIRESHARK.border}`, padding: "8px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
        {isCombined && (
          <div style={{ display: "flex", gap: 2, background: WIRESHARK.bg, border: `1px solid ${WIRESHARK.borderStrong}`, borderRadius: 6, padding: 2 }}>
            {["bgp", "ospf"].map((key) => (
              <button key={key} onClick={() => switchAdapter(key)}
                style={{ background: activeKey === key ? WIRESHARK.selected : "none", border: "none", color: activeKey === key ? "#00d4ff" : WIRESHARK.muted, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                {key.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <select value={captureRouter} onChange={(e) => setCaptureRouter(e.target.value)}
          style={{ background: WIRESHARK.bg, border: `1px solid ${WIRESHARK.borderStrong}`, color: WIRESHARK.text, padding: "5px 10px", borderRadius: 6, fontSize: 12 }}>
          {routers.map((r) => <option key={r}>{r}</option>)}
        </select>

        <select value={captureCmd} onChange={(e) => setCaptureCmd(e.target.value)}
          style={{ background: WIRESHARK.bg, border: `1px solid ${WIRESHARK.borderStrong}`, color: WIRESHARK.text, padding: "5px 10px", borderRadius: 6, fontSize: 12, flex: 1, minWidth: 160 }}>
          {adapter.captureCommands.map((c) => (
            <option key={c.cmd} value={c.cmd}>{c.label}</option>
          ))}
        </select>

        <button onClick={capture} disabled={capturing || !sessionId}
          style={{ background: capturing ? "#1e293b" : "#064e3b", border: "1px solid #22c55e", color: capturing ? WIRESHARK.subtle : "#bbf7d0", padding: "5px 16px", borderRadius: 6, cursor: capturing ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}>
          {capturing ? "⏳" : "▶"} {capturing ? "Capturando..." : "Capturar"}
        </button>

        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 11, color: autoRefresh ? "#86efac" : WIRESHARK.muted }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} style={{ accentColor: "#4ade80" }} />
          Auto 5s
        </label>

        <button onClick={() => { setPackets((p) => p.filter((pkt) => pkt.proto !== activeKey)); setSelected(null); setLog([]); }}
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
        {adapter.types.map((t) => {
          const count = t === "ALL" ? visiblePackets.length : visiblePackets.filter((p) => p.type === t).length;
          const active = filter === t;
          const col = adapter.msgColors[t] || WIRESHARK.muted;
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

        <div style={{ overflowY: "auto", borderBottom: `1px solid ${WIRESHARK.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "40px 80px 100px 100px 1fr", gap: 4, padding: "4px 10px", background: WIRESHARK.header, borderBottom: `1px solid ${WIRESHARK.border}`, fontSize: 10, color: WIRESHARK.muted, position: "sticky", top: 0, fontWeight: 700 }}>
            <span>No.</span><span>Hora</span><span>Origem</span><span>Destino</span><span>Info</span>
          </div>

          {filtered.length === 0 && (
            <div style={{ color: WIRESHARK.subtle, fontSize: 11, padding: "24px 14px", textAlign: "center" }}>
              {visiblePackets.length === 0
                ? "← Selecione um roteador e clique em Capturar"
                : "Nenhum pacote corresponde ao filtro"}
            </div>
          )}

          {filtered.map((pkt, i) => {
            const col = adapter.msgColors[pkt.type] || WIRESHARK.muted;
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

        <div style={{ overflowY: "auto", background: WIRESHARK.bg }}>
          {!selected ? (
            <div style={{ color: WIRESHARK.subtle, fontSize: 11, padding: "20px 14px" }}>
              Selecione um pacote para ver detalhes
            </div>
          ) : (
            <div style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ background: WIRESHARK.selected, color: adapter.msgColors[selected.type] || "#60a5fa", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: "bold", border: `1px solid ${WIRESHARK.border}` }}>
                  {adapter.protocolLabel} {selected.type}
                </span>
                <span style={{ color: WIRESHARK.muted, fontSize: 11 }}>
                  {selected.src} → {selected.dst}
                </span>
                <span style={{ color: WIRESHARK.subtle, fontSize: 10 }}>{selected.time}</span>
              </div>

              <adapter.DecodeTree packet={selected} />

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

// ─── Tree UI components (compartilhados entre adapters) ───────────────────────
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

function TreeLeaf({ label, value, color, depth, badge, badgeColor, help }) {
  const indent = depth * 16;
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
