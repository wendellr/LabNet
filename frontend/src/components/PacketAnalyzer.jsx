import { useState, useEffect, useRef, useMemo } from "react";
import { API_BASE } from "../hooks/index.js";

// ─── Analisador de pacotes (aba Wireshark) ──────────────────────────────────
// Captura REAL: o backend roda tcpdump no namespace de rede do roteador e
// manda cada pacote (texto decodificado do `tcpdump -vv`) por WebSocket.
// Aqui o texto vira lista + árvore de campos com explicação didática, e o
// mesmo tráfego fica gravado num .pcap para abrir no Wireshark de verdade.

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
  selected: "#12315a",
};

const TYPE_COLORS = {
  HELLO: "#86efac", DBD: "#fde68a", LSR: "#fdba74", LSU: "#7dd3fc", LSACK: "#c4b5fd",
  OPEN: "#86efac", UPDATE: "#7dd3fc", KEEPALIVE: "#cbd5e1", NOTIFICATION: "#fca5a5", "ROUTE-REFRESH": "#c4b5fd",
  TCP: "#94a3b8",
};

// Ordem dos chips de filtro por protocolo
const TYPES_BY_PROTO = {
  ospf: ["HELLO", "DBD", "LSR", "LSU", "LSACK"],
  bgp: ["OPEN", "UPDATE", "KEEPALIVE", "NOTIFICATION", "TCP"],
};

// O que é cada tipo de pacote — aparece no topo do painel de detalhes
const TYPE_EXPLAIN = {
  HELLO: "OSPF Hello — enviado a cada Hello Timer (10 s) para 224.0.0.5. Descobre vizinhos e mantém a adjacência viva. Quando um roteador vê o próprio Router ID na Neighbor List do vizinho, a comunicação é bidirecional (2-Way).",
  DBD: "Database Description — trocado nos estados ExStart/Exchange. Cada lado manda um resumo (só cabeçalhos de LSA) do seu banco de dados, para descobrir o que falta.",
  LSR: "Link-State Request — estado Loading: \"me mande estas LSAs, que eu não tenho ou estão desatualizadas\".",
  LSU: "Link-State Update — carrega LSAs completas. É assim que uma mudança (ex.: uma rede nova) se espalha pela área: cada roteador recebe e repassa (flooding).",
  LSACK: "Link-State Ack — confirma o recebimento das LSAs de um LS-Update. Sem o Ack, a LSA é retransmitida.",
  OPEN: "BGP OPEN — primeira mensagem após a conexão TCP (porta 179). Informa versão, AS, hold time e BGP Identifier. Se algo não bate (ex.: AS errado), a sessão não sobe.",
  UPDATE: "BGP UPDATE — anuncia prefixos (NLRI) com seus atributos de caminho, e/ou retira prefixos (withdrawn).",
  KEEPALIVE: "BGP KEEPALIVE — mantém a sessão viva quando não há UPDATEs, a cada 1/3 do hold time.",
  NOTIFICATION: "BGP NOTIFICATION — informa um erro. Depois dela a sessão BGP é encerrada.",
  "ROUTE-REFRESH": "BGP ROUTE-REFRESH — pede ao vizinho que reenvie as rotas (usado no soft reset).",
  TCP: "Segmento TCP de controle da sessão BGP (abertura com SYN, encerramento com FIN, ou RST).",
};

// Explicação de campos — casada por regex contra o texto da linha
const FIELD_HELP = [
  [/^Router-ID/, "Router ID de quem enviou o pacote — identifica o roteador no OSPF (não é o IP da interface). A área e a autenticação também precisam bater entre vizinhos."],
  [/^Options/, "Bits de opções. [External] = o roteador aceita LSAs externas (Type 5). Em áreas stub esse bit é desligado — e precisa ser igual nos dois lados."],
  [/^Hello Timer/, "Intervalo entre Hellos, tempo para declarar o vizinho morto, máscara da rede e prioridade na eleição de DR. Timers e máscara precisam ser iguais nos dois lados para formar adjacência."],
  [/^Designated Router/, "DR e BDR eleitos neste segmento, identificados pelo IP da interface deles."],
  [/^Neighbor List/, "Router IDs dos vizinhos de quem este roteador já recebeu Hello. Ver o próprio Router ID aqui leva o vizinho ao estado 2-Way."],
  [/^LSA #/, "Cada LS-Update pode carregar várias LSAs."],
  [/^Advertising Router/, "Router ID de quem CRIOU a LSA (não necessariamente quem enviou o pacote). seq maior = versão mais nova; age = idade em segundos (3600 = LSA sendo retirada)."],
  [/Router LSA \(1\)/, "LSA Type 1 (Router LSA): o roteador descreve os próprios enlaces e o custo de cada um. É inundada para toda a área."],
  [/Network LSA \(2\)/, "LSA Type 2 (Network LSA): gerada pelo DR de um segmento broadcast, lista os roteadores ligados nele."],
  [/Summary LSA \(3\)/, "LSA Type 3 (Summary): gerada por um ABR, leva redes de uma área para outra."],
  [/ASBR Summary LSA \(4\)/, "LSA Type 4: informa como chegar a um ASBR em outra área."],
  [/External LSA \(5\)/, "LSA Type 5 (External): rota externa redistribuída para dentro do OSPF por um ASBR."],
  [/^Stub Network/, "Rede \"folha\" anunciada pelo roteador, sem vizinho OSPF nela — ex.: uma loopback, sempre com máscara /32 (255.255.255.255)."],
  [/^Neighbor Network-ID/, "Enlace de trânsito: segmento com DR (Network-ID = IP do DR) onde o roteador tem vizinho Full."],
  [/topology default \(0\), metric/, "Custo OSPF deste enlace — é o valor somado pelo SPF no cálculo do melhor caminho."],
  [/^Connected Routers/, "Roteadores ligados a este segmento (na Network LSA)."],
  [/^Mask \d/, "Máscara do segmento descrito pela Network LSA."],
  [/DD Flags/, "Init = primeiro DBD; More = ainda há DBDs a seguir; Master = quem conduz a troca (o de maior Router ID). MTU diferente entre vizinhos trava a adjacência aqui."],
  [/Open Message/, "Abertura da sessão BGP."],
  [/my AS/, "AS de quem enviou, hold time (tempo sem mensagens até derrubar a sessão) e BGP Identifier (Router ID)."],
  [/Capabilit/, "Capacidades negociadas na abertura (ex.: AS de 4 bytes, route refresh, multiprotocolo)."],
  [/Keepalive Message/, "Mantém a sessão viva."],
  [/Update Message/, "Anúncio e/ou retirada de rotas."],
  [/^Origin/, "ORIGIN: como a rota entrou no BGP — IGP (network), EGP, ou INCOMPLETE (redistribuída). IGP é preferido."],
  [/^AS Path/, "AS_PATH: ASes por onde a rota passou. Evita loops (o roteador descarta rotas com o próprio AS) e caminho mais curto é preferido."],
  [/^Next Hop/, "NEXT_HOP: para onde enviar o tráfego destinado a esses prefixos."],
  [/^Multi Exit Discriminator/, "MED: sugere a um AS vizinho por qual entrada preferir (menor é melhor)."],
  [/^Local Preference/, "LOCAL_PREF: preferência dentro do AS (maior é melhor). Só circula em iBGP."],
  [/^Community/, "COMMUNITY: etiquetas para aplicar políticas a grupos de rotas."],
  [/^Updated routes/, "Prefixos anunciados (NLRI) com os atributos acima."],
  [/^Withdrawn routes/, "Prefixos retirados — não são mais alcançáveis por este vizinho."],
  [/Notification Message/, "Erro — a sessão BGP será encerrada. O código/subcódigo dizem o motivo."],
];

function fieldHelp(text) {
  const hit = FIELD_HELP.find(([re]) => re.test(text.trim()));
  return hit ? hit[1] : null;
}

const DIR_LABEL = { In: "recebido", Out: "enviado", M: "multicast recebido", B: "broadcast recebido", P: "recebido (para outro host)" };

// ─── Parser do texto do tcpdump -vv -tttt ───────────────────────────────────
const HEX_RE = /^\s+0x[0-9a-f]{4}:/;

function indentOf(line) {
  let n = 0;
  for (const ch of line) {
    if (ch === "\t") n += 8;
    else if (ch === " ") n += 1;
    else break;
  }
  return n;
}

// Linhas indentadas → árvore (filho = linha seguinte mais indentada)
function buildTree(lines) {
  const root = { children: [], indent: -1 };
  const stack = [root];
  for (const line of lines) {
    const node = { text: line.trim(), indent: indentOf(line), children: [] };
    while (stack.length > 1 && stack[stack.length - 1].indent >= node.indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function lsaList(details) {
  return details
    .map((l) => l.match(/(\w[\w ]*? LSA) \(\d\), LSA-ID: (\S+)/))
    .filter(Boolean)
    .map((m) => `${m[1]} ${m[2]}`);
}

function childrenAfter(details, headerRe) {
  const i = details.findIndex((l) => headerRe.test(l.trim()));
  if (i < 0) return [];
  const base = indentOf(details[i]);
  const out = [];
  for (let j = i + 1; j < details.length && indentOf(details[j]) > base; j++) out.push(details[j].trim());
  return out;
}

export function parseCapturedPacket(lines, no) {
  const head = lines[0] || "";
  const m = head.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+) (.*)$/);
  const time = m ? m[2].slice(0, 12) : "";
  let rest = m ? m[3] : head;
  let iface = "", dir = "";
  const ifm = rest.match(/^(\S+)\s+(In|Out|M|B|P)\s+(.*)$/);
  if (ifm) { iface = ifm[1]; dir = ifm[2]; rest = ifm[3]; }

  const ip = {
    ttl: rest.match(/ttl (\d+)/)?.[1],
    proto: rest.match(/proto (\w+ \(\d+\))/)?.[1],
    length: rest.match(/length (\d+)\)/)?.[1],
  };

  const summary = (lines[1] || "").trim();
  const addr = summary.match(/^(\S+) > ([^:]+):/);
  let src = addr?.[1] || "?", dst = addr?.[2] || "?";
  let srcPort = "", dstPort = "";
  const portRe = /^(\d+\.\d+\.\d+\.\d+)\.(\d+)$/;
  if (portRe.test(src)) [, src, srcPort] = src.match(portRe);
  if (portRe.test(dst)) [, dst, dstPort] = dst.match(portRe);

  const body = lines.slice(2);
  const hex = body.filter((l) => HEX_RE.test(l));
  const details = body.filter((l) => !HEX_RE.test(l));
  const detailText = details.join("\n");

  let proto, type, info;
  if (/OSPFv2/.test(summary)) {
    proto = "ospf";
    const kind = summary.match(/OSPFv2, ([^,]+),/)?.[1] || "";
    type = { "Hello": "HELLO", "Database Description": "DBD", "LS-Request": "LSR", "LS-Update": "LSU", "LS-Ack": "LSACK" }[kind] || kind.toUpperCase();
    const rid = detailText.match(/Router-ID (\S+?),/)?.[1];
    if (type === "HELLO") {
      const dr = detailText.match(/Designated Router (\d+\.\d+\.\d+\.\d+)/)?.[1];
      const nbrs = childrenAfter(details, /^Neighbor List/);
      info = `Hello · RID ${rid} · DR ${dr || "—"} · vizinhos: ${nbrs.length ? nbrs.join(", ") : "nenhum"}`;
    } else if (type === "DBD") {
      const flags = detailText.match(/DD Flags \[([^\]]*)\]/)?.[1];
      const n = lsaList(details).length;
      info = `DBD · RID ${rid} · flags [${flags}]${n ? ` · ${n} cabeçalho(s) de LSA` : ""}`;
    } else {
      const lsas = lsaList(details);
      const label = { LSU: "LS-Update", LSACK: "LS-Ack", LSR: "LS-Request" }[type] || kind;
      info = `${label} · RID ${rid}${lsas.length ? ` · ${lsas.join(", ")}` : ""}`;
    }
  } else if (srcPort === "179" || dstPort === "179" || /: BGP/.test(summary)) {
    proto = "bgp";
    const msgs = [...detailText.matchAll(/(Open|Update|Keepalive|Notification|Route[- ]Refresh) Message/gi)]
      .map((x) => x[1].toUpperCase().replace(" ", "-"));
    const uniq = [...new Set(msgs)];
    if (uniq.length) {
      type = uniq.includes("UPDATE") ? "UPDATE" : uniq.includes("NOTIFICATION") ? "NOTIFICATION" : uniq.includes("OPEN") ? "OPEN" : uniq[0];
      if (type === "UPDATE") {
        const adds = childrenAfter(details, /^Updated routes/);
        const wds = childrenAfter(details, /^Withdrawn routes/);
        const asPath = detailText.match(/AS Path \(2\)[^:]*:\s*([^\n]*)/)?.[1]?.trim();
        const nh = detailText.match(/Next Hop \(3\)[^:]*:\s*(\S+)/)?.[1];
        info = ["UPDATE",
          adds.length && `+${adds.join(" +")}`,
          wds.length && `−${wds.join(" −")}`,
          asPath !== undefined && `AS_PATH ${asPath || "(vazio)"}`,
          nh && `NH ${nh}`].filter(Boolean).join(" · ");
      } else if (type === "OPEN") {
        const om = detailText.match(/my AS (\d+), Holdtime (\d+)s, ID (\S+)/);
        info = om ? `OPEN · AS ${om[1]} · ID ${om[3]} · hold ${om[2]}s` : "OPEN";
      } else if (type === "NOTIFICATION") {
        info = details.find((l) => /Notification Message/.test(l))?.trim() || "NOTIFICATION";
      } else {
        info = uniq.join(" + ");
      }
    } else {
      type = "TCP";
      const flags = summary.match(/Flags \[([^\]]*)\]/)?.[1] || "";
      info = `TCP [${flags}] ${({ "S": "SYN — abrindo conexão", "S.": "SYN-ACK", "F.": "FIN — fechando", "R": "RST — conexão recusada/derrubada", "R.": "RST" })[flags] || ""}`;
    }
  } else {
    proto = "other";
    type = "?";
    info = summary;
  }

  return { no, time, iface, dir, src, dst, srcPort, dstPort, ip, summary, proto, type, info, details, hex, raw: lines.join("\n") };
}

// ─── Árvore de detalhes ─────────────────────────────────────────────────────
function DetailNode({ node, depth }) {
  const [open, setOpen] = useState(true);
  const [hover, setHover] = useState(false);
  const help = fieldHelp(node.text);
  const hasKids = node.children.length > 0;
  return (
    <div>
      <div onClick={() => hasKids && setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: "flex", gap: 6, padding: "2px 4px", paddingLeft: depth * 16 + 4, cursor: hasKids ? "pointer" : "default", borderRadius: 3, background: hover ? WIRESHARK.panelAlt : "transparent", alignItems: "flex-start" }}>
        <span style={{ color: WIRESHARK.subtle, fontSize: 9, width: 10, flexShrink: 0, paddingTop: 2 }}>{hasKids ? (open ? "▼" : "▶") : ""}</span>
        <span style={{ color: WIRESHARK.text, fontSize: 11 }}>{node.text}</span>
        {help && <span title={help} style={{ color: "#7dd3fc", fontSize: 10, cursor: "help", flexShrink: 0 }}>ⓘ</span>}
      </div>
      {hover && help && (
        <div style={{ marginLeft: depth * 16 + 24, marginBottom: 4, background: WIRESHARK.selected, border: `1px solid ${WIRESHARK.borderStrong}`, color: "#cbd5e1", padding: "6px 10px", borderRadius: 6, fontSize: 10.5, lineHeight: 1.5, maxWidth: 520 }}>
          {help}
        </div>
      )}
      {open && node.children.map((c, i) => <DetailNode key={i} node={c} depth={depth + 1} />)}
    </div>
  );
}

function Section({ title, color, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 4 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", gap: 6, padding: "3px 4px", cursor: "pointer", alignItems: "center" }}>
        <span style={{ color: WIRESHARK.subtle, fontSize: 9, width: 10 }}>{open ? "▼" : "▶"}</span>
        <span style={{ color, fontWeight: 700, fontSize: 11 }}>{title}</span>
      </div>
      {open && children}
    </div>
  );
}

function Leaf({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "1px 4px 1px 30px", fontSize: 11 }}>
      <span style={{ color: WIRESHARK.muted, minWidth: 110 }}>{label}:</span>
      <span style={{ color: WIRESHARK.text }}>{value}</span>
    </div>
  );
}

function PacketDetail({ pkt }) {
  const col = TYPE_COLORS[pkt.type] || "#60a5fa";
  const tree = useMemo(() => buildTree(pkt.details), [pkt]);
  const protoLabel = pkt.proto === "ospf" ? "Open Shortest Path First (OSPFv2)" : pkt.proto === "bgp" ? "Border Gateway Protocol (BGP-4)" : "Dados";
  return (
    <div style={{ padding: "10px 14px" }}>
      {TYPE_EXPLAIN[pkt.type] && (
        <div style={{ borderLeft: `3px solid ${col}`, background: WIRESHARK.panel, padding: "8px 12px", borderRadius: "0 6px 6px 0", color: "#cbd5e1", fontSize: 11.5, lineHeight: 1.55, marginBottom: 10 }}>
          <strong style={{ color: col }}>{pkt.type}</strong> — {TYPE_EXPLAIN[pkt.type]}
        </div>
      )}
      <Section title={`Frame ${pkt.no}: capturado às ${pkt.time}`} color={WIRESHARK.muted}>
        {pkt.iface && <Leaf label="Interface" value={pkt.iface} />}
        {pkt.dir && <Leaf label="Direção" value={`${pkt.dir} (${DIR_LABEL[pkt.dir] || pkt.dir})`} />}
        {pkt.ip.length && <Leaf label="Tamanho IP" value={`${pkt.ip.length} bytes`} />}
      </Section>
      <Section title={`Internet Protocol Version 4, Src: ${pkt.src}, Dst: ${pkt.dst}`} color="#93c5fd">
        <Leaf label="Origem" value={pkt.src + (pkt.srcPort ? ` (porta ${pkt.srcPort})` : "")} />
        <Leaf label="Destino" value={pkt.dst + (pkt.dstPort ? ` (porta ${pkt.dstPort})` : "") + (pkt.dst === "224.0.0.5" ? " — multicast AllSPFRouters" : pkt.dst === "224.0.0.6" ? " — multicast AllDRouters" : "")} />
        {pkt.ip.ttl && <Leaf label="TTL" value={pkt.ip.ttl + (pkt.ip.ttl === "1" ? " (não passa de um salto — só vizinhos diretos)" : "")} />}
        {pkt.ip.proto && <Leaf label="Protocolo" value={pkt.ip.proto} />}
      </Section>
      <Section title={protoLabel} color={col}>
        <div style={{ paddingLeft: 12 }}>
          <div style={{ color: WIRESHARK.subtle, fontSize: 10.5, padding: "1px 4px 4px 18px" }}>{pkt.summary}</div>
          {tree.map((n, i) => <DetailNode key={i} node={n} depth={1} />)}
        </div>
      </Section>
      {pkt.hex.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ color: WIRESHARK.muted, fontSize: 10, cursor: "pointer" }}>Bytes do corpo da LSA (hex)</summary>
          <pre style={{ color: "#cbd5e1", fontSize: 10, background: WIRESHARK.header, padding: "6px 10px", borderRadius: 4, border: `1px solid ${WIRESHARK.border}`, overflowX: "auto" }}>{pkt.hex.map((l) => l.trim()).join("\n")}</pre>
        </details>
      )}
      <details style={{ marginTop: 6 }}>
        <summary style={{ color: WIRESHARK.muted, fontSize: 10, cursor: "pointer" }}>Saída bruta do tcpdump</summary>
        <pre style={{ color: "#cbd5e1", fontSize: 10, background: WIRESHARK.header, padding: "6px 10px", borderRadius: 4, border: `1px solid ${WIRESHARK.border}`, overflowX: "auto" }}>{pkt.raw}</pre>
      </details>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────
function interfacesOf(lab, router) {
  return (lab?.links || [])
    .flatMap((l) => (Array.isArray(l) ? [[l[0], l[1], l[2]], [l[2], l[3], l[0]]] : []))
    .filter(([r]) => r === router)
    .map(([, iface, peer]) => ({ iface, peer }))
    .sort((a, b) => a.iface.localeCompare(b.iface, undefined, { numeric: true }));
}

const sel = { background: WIRESHARK.bg, border: `1px solid ${WIRESHARK.borderStrong}`, color: WIRESHARK.text, padding: "5px 10px", borderRadius: 6, fontSize: 12, fontFamily: "monospace" };

export function PacketAnalyzer({ sessionId, lab, containers, protocol }) {
  const labProtocol = protocol || lab?.protocol || "bgp";
  const defaultFilter = labProtocol === "ospf" ? "ospf" : labProtocol === "bgp" ? "bgp" : "all";

  const routers = containers.length
    ? containers.map((c) => c.split("-").pop().toUpperCase()).sort()
    : (lab?.routers || ["R1"]);

  const [router, setRouter]   = useState(routers[0] || "R1");
  const [iface, setIface]     = useState("any");
  const [filterKey, setFilterKey] = useState(defaultFilter);
  const [status, setStatus]   = useState("idle"); // idle | connecting | capturing
  const [packets, setPackets] = useState([]);
  const [selectedNo, setSelectedNo] = useState(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [hidePeriodic, setHidePeriodic] = useState(false);
  const [search, setSearch]   = useState("");
  const [error, setError]     = useState(null);
  const [pcapRouter, setPcapRouter] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [, setTick] = useState(0);

  const wsRef = useRef(null);
  const counterRef = useRef(0);
  const listRef = useRef(null);
  const stickRef = useRef(true);

  const ifaces = interfacesOf(lab, router);

  useEffect(() => () => wsRef.current?.close(), []);
  useEffect(() => {
    if (status !== "capturing") return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  // Rola junto com a captura, a menos que o aluno tenha subido a lista
  useEffect(() => {
    if (stickRef.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [packets]);

  const start = () => {
    if (!sessionId) return;
    setError(null);
    wsRef.current?.close();
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = API_BASE ? API_BASE.replace(/^https?:\/\//, "") : window.location.host;
    const ws = new WebSocket(`${wsProto}://${host}/ws/capture/${encodeURIComponent(sessionId)}`);
    wsRef.current = ws;
    setStatus("connecting");
    const capRouter = router;

    ws.onopen = () => ws.send(JSON.stringify({ type: "start", router: capRouter, iface, filter: filterKey }));
    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      if (msg.type === "started") { setStatus("capturing"); setStartedAt(Date.now()); setPcapRouter(capRouter); }
      if (msg.type === "packet") {
        counterRef.current += 1;
        const pkt = { ...parseCapturedPacket(msg.lines, counterRef.current), router: capRouter };
        setPackets((p) => [...p, pkt].slice(-3000));
      }
      if (msg.type === "error") setError(msg.message);
      if (msg.type === "stopped") { setStatus("idle"); ws.close(); }
    };
    ws.onclose = () => { if (wsRef.current === ws) { setStatus("idle"); wsRef.current = null; } };
    ws.onerror = () => setError("Falha na conexão de captura — o lab está rodando?");
  };

  const stop = () => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
    else setStatus("idle");
  };

  const clear = () => { setPackets([]); setSelectedNo(null); counterRef.current = 0; };

  const shownProtos = filterKey === "all" ? ["ospf", "bgp"] : [filterKey];
  const chipTypes = ["ALL", ...shownProtos.flatMap((p) => TYPES_BY_PROTO[p])];
  const filtered = packets.filter((p) => {
    if (typeFilter !== "ALL" && p.type !== typeFilter) return false;
    if (hidePeriodic && (p.type === "HELLO" || p.type === "KEEPALIVE")) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.info.toLowerCase().includes(q) && !p.src.includes(q) && !p.dst.includes(q) && !p.raw.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const selected = packets.find((p) => p.no === selectedNo) || null;
  const t0 = packets[0]?.time;
  const rel = (t) => {
    if (!t0) return "";
    const toS = (x) => { const [h, m, s] = x.split(":"); return (+h) * 3600 + (+m) * 60 + parseFloat(s); };
    return Math.max(0, toS(t) - toS(t0)).toFixed(3);
  };
  const capturing = status !== "idle";
  const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
  const cols = "48px 72px 112px 112px 112px 1fr";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "monospace", background: WIRESHARK.bg }}>
      {/* ── Toolbar ── */}
      <div style={{ background: WIRESHARK.header, borderBottom: `1px solid ${WIRESHARK.border}`, padding: "8px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
        <label style={{ color: WIRESHARK.muted, fontSize: 11 }}>Roteador</label>
        <select value={router} disabled={capturing} onChange={(e) => { setRouter(e.target.value); setIface("any"); }} style={sel}>
          {routers.map((r) => <option key={r}>{r}</option>)}
        </select>
        <label style={{ color: WIRESHARK.muted, fontSize: 11 }}>Interface</label>
        <select value={iface} disabled={capturing} onChange={(e) => setIface(e.target.value)} style={sel}>
          <option value="any">todas</option>
          {ifaces.map(({ iface: i, peer }) => <option key={i} value={i}>{i} ↔ {peer}</option>)}
        </select>
        <label style={{ color: WIRESHARK.muted, fontSize: 11 }}>Protocolo</label>
        <select value={filterKey} disabled={capturing} onChange={(e) => { setFilterKey(e.target.value); setTypeFilter("ALL"); }} style={sel}>
          <option value="ospf">OSPF</option>
          <option value="bgp">BGP</option>
          <option value="all">OSPF + BGP</option>
        </select>

        {!capturing ? (
          <button onClick={start} disabled={!sessionId}
            style={{ background: "#064e3b", border: "1px solid #22c55e", color: "#bbf7d0", padding: "5px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>
            ▶ Iniciar captura
          </button>
        ) : (
          <button onClick={stop}
            style={{ background: "#450a0a", border: "1px solid #ef4444", color: "#fecaca", padding: "5px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>
            ■ Parar {status === "capturing" ? `(${elapsed}s)` : "…"}
          </button>
        )}
        <button onClick={clear}
          style={{ background: "none", border: `1px solid ${WIRESHARK.border}`, color: WIRESHARK.muted, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>
          ⌫ Limpar
        </button>
        {pcapRouter && !capturing && (
          <a href={`${API_BASE}/api/session/${sessionId}/capture.pcap?router=${pcapRouter}`}
            style={{ border: "1px solid #3730a3", color: "#c4b5fd", padding: "5px 10px", borderRadius: 6, fontSize: 11, textDecoration: "none" }}
            title="Abra no Wireshark instalado no seu computador">
            ⬇ .pcap ({pcapRouter})
          </a>
        )}
        <div style={{ marginLeft: "auto", color: WIRESHARK.muted, fontSize: 11, display: "flex", gap: 8, alignItems: "center" }}>
          {status === "capturing" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px #ef4444" }} />}
          {filtered.length}/{packets.length} pacotes
        </div>
      </div>

      <div style={{ background: WIRESHARK.panel, borderBottom: `1px solid ${WIRESHARK.border}`, padding: "6px 14px", color: WIRESHARK.muted, fontSize: 10.5, lineHeight: 1.5, flexShrink: 0 }}>
        {error
          ? <span style={{ color: "#fca5a5" }}>⚠ {error}</span>
          : <>Captura <strong style={{ color: WIRESHARK.text }}>real</strong> (tcpdump) na interface do roteador. Dica: deixe capturando e, no terminal, altere a configuração de <em>outro</em> roteador — veja os LS-Updates se espalhando e os Acks voltando. Hellos chegam a cada 10 s.</>}
      </div>

      {/* ── Filtros ── */}
      <div style={{ background: WIRESHARK.header, borderBottom: `1px solid ${WIRESHARK.border}`, padding: "6px 14px", display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
        {chipTypes.map((t) => {
          const count = t === "ALL" ? packets.length : packets.filter((p) => p.type === t).length;
          const active = typeFilter === t;
          const col = TYPE_COLORS[t] || WIRESHARK.muted;
          return (
            <button key={t} onClick={() => setTypeFilter(t)}
              style={{ background: active ? WIRESHARK.selected : "none", border: `1px solid ${active ? col : WIRESHARK.border}`, color: active ? col : WIRESHARK.muted, padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: "monospace" }}>
              {t === "ALL" ? "TODOS" : t} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          );
        })}
        <label style={{ display: "flex", gap: 5, alignItems: "center", color: WIRESHARK.muted, fontSize: 10.5, marginLeft: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={hidePeriodic} onChange={(e) => setHidePeriodic(e.target.checked)} style={{ accentColor: "#4ade80" }} />
          ocultar Hello/Keepalive
        </label>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar IP, prefixo, Router ID..."
          style={{ marginLeft: "auto", background: WIRESHARK.bg, border: `1px solid ${WIRESHARK.border}`, borderRadius: 4, color: WIRESHARK.text, padding: "3px 10px", fontSize: 11, width: 200, fontFamily: "monospace" }} />
      </div>

      {/* ── Lista + detalhes ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateRows: "1fr 1fr", overflow: "hidden" }}>
        <div ref={listRef} style={{ overflowY: "auto", borderBottom: `1px solid ${WIRESHARK.border}` }}
          onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4, padding: "4px 10px", background: WIRESHARK.header, borderBottom: `1px solid ${WIRESHARK.border}`, fontSize: 10, color: WIRESHARK.muted, position: "sticky", top: 0, fontWeight: 700 }}>
            <span>No.</span><span>Tempo (s)</span><span>Interface</span><span>Origem</span><span>Destino</span><span>Info</span>
          </div>
          {filtered.length === 0 && (
            <div style={{ color: WIRESHARK.subtle, fontSize: 11, padding: "24px 14px", textAlign: "center", lineHeight: 1.7 }}>
              {packets.length === 0
                ? (status === "capturing" ? "Capturando… aguardando o primeiro pacote (Hellos chegam a cada 10 s)" : "Escolha o roteador e a interface e clique em ▶ Iniciar captura")
                : "Nenhum pacote corresponde ao filtro"}
            </div>
          )}
          {filtered.map((pkt, i) => {
            const col = TYPE_COLORS[pkt.type] || WIRESHARK.muted;
            const isSel = pkt.no === selectedNo;
            return (
              <div key={pkt.no} onClick={() => setSelectedNo(pkt.no)}
                style={{ display: "grid", gridTemplateColumns: cols, gap: 4, padding: "3px 10px", background: isSel ? WIRESHARK.selected : i % 2 === 0 ? WIRESHARK.bg : WIRESHARK.panel, cursor: "pointer", borderLeft: `3px solid ${isSel ? col : "transparent"}`, fontSize: 11 }}>
                <span style={{ color: WIRESHARK.subtle }}>{pkt.no}</span>
                <span style={{ color: WIRESHARK.muted }}>{rel(pkt.time)}</span>
                <span style={{ color: WIRESHARK.muted }}>{pkt.router}{pkt.iface ? ` ${pkt.iface}` : ""}{pkt.dir === "Out" ? " →" : pkt.dir ? " ←" : ""}</span>
                <span style={{ color: WIRESHARK.text }}>{pkt.src}</span>
                <span style={{ color: WIRESHARK.text }}>{pkt.dst}</span>
                <span style={{ color: col, fontWeight: isSel ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pkt.info}</span>
              </div>
            );
          })}
        </div>

        <div style={{ overflowY: "auto", background: WIRESHARK.bg }}>
          {selected
            ? <PacketDetail pkt={selected} />
            : <div style={{ color: WIRESHARK.subtle, fontSize: 11, padding: "20px 14px" }}>Selecione um pacote para ver os campos decodificados — passe o mouse em ⓘ para a explicação de cada campo.</div>}
        </div>
      </div>
    </div>
  );
}
