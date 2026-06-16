import { useState } from "react";

// ─── Badge ────────────────────────────────────────────────────────────────
export function Badge({ children, style = {} }) {
  return (
    <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 10, fontFamily: "monospace", ...style }}>
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, glow }) {
  return (
    <div style={{ background: "#0f172a", border: `1px solid ${glow || "#1e3a5f"}`, borderRadius: 12, padding: 20, ...style }}>
      {children}
    </div>
  );
}

// ─── SectionTitle ─────────────────────────────────────────────────────────
export function SectionTitle({ children, color = "#00d4ff", icon }) {
  return (
    <h3 style={{ margin: "0 0 14px", color, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
      {icon && <span>{icon}</span>}
      {children}
    </h3>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────
export function CopyButton({ text, label, size = "sm" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const pad = size === "sm" ? "2px 8px" : "5px 14px";
  return (
    <button onClick={copy} style={{ background: copied ? "#064e3b" : "#0d1f3c", border: `1px solid ${copied ? "#166534" : "#1e3a5f"}`, color: copied ? "#4ade80" : "#60a5fa", padding: pad, borderRadius: 4, cursor: "pointer", fontSize: 10 }}>
      {copied ? "✓ Copiado" : (label || "⎘ Copiar")}
    </button>
  );
}

// ─── Toasts ───────────────────────────────────────────────────────────────
const TOAST_COLORS = {
  success: ["#052e16", "#166534", "#4ade80"],
  warn:    ["#422006", "#92400e", "#fbbf24"],
  error:   ["#450a0a", "#7f1d1d", "#f87171"],
  info:    ["#0d1f3c", "#1e3a5f", "#60a5fa"],
};

export function Toasts({ toasts }) {
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 380, pointerEvents: "none" }}>
      {toasts.map((t) => {
        const [bg, border, text] = TOAST_COLORS[t.level] || TOAST_COLORS.info;
        return (
          <div key={t.id} style={{ background: bg, border: `1px solid ${border}`, color: text, padding: "10px 16px", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.6)", animation: "slideIn .2s ease" }}>
            {t.fromTeacher && <span style={{ opacity: 0.7, fontSize: 10, display: "block", marginBottom: 2 }}>👨‍🏫 Professor:</span>}
            {t.message}
          </div>
        );
      })}
    </div>
  );
}

// ─── CapacityBar ──────────────────────────────────────────────────────────
export function CapacityBar({ active, max }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 8, padding: "6px 14px" }}>
      <span style={{ color: "#475569", fontSize: 11 }}>Capacidade</span>
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} style={{ width: 8, height: 16, borderRadius: 2, background: i < active ? "#4ade80" : "#1e293b", transition: "background .3s" }} />
        ))}
      </div>
      <span style={{ color: "#4ade80", fontWeight: "bold", fontSize: 13 }}>{active}/{max}</span>
    </div>
  );
}

// ─── Terminal line colorizer ───────────────────────────────────────────────
export function TermLine({ line }) {
  const color =
    line.startsWith("# ") || line.trim() === ""       ? "#1e293b"
    : /^[A-Z]+[0-9]*#/.test(line)                     ? "#4ade80"
    : /Error|error|fail|FAIL/i.test(line)             ? "#f87171"
    : /Established|established|Connected/i.test(line) ? "#4ade80"
    : /Warning|warning/i.test(line)                   ? "#fbbf24"
    : "#94a3b8";
  return <div style={{ color, fontSize: 11, lineHeight: 1.5, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line}</div>;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────
import { STATUS_COLOR, STATUS_BG } from "../data/labs.js";

export function StatusBadge({ status }) {
  return (
    <Badge style={{ background: STATUS_BG[status] || "#0a0f1a", color: STATUS_COLOR[status] || "#475569", border: `1px solid ${STATUS_COLOR[status] || "#1e293b"}44` }}>
      {status}
    </Badge>
  );
}

// ─── ProvisioningScreen ───────────────────────────────────────────────────
export function ProvisioningScreen({ labId, message }) {
  return (
    <div style={{ minHeight: "100vh", background: "#020817", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>⚙️</div>
        <h2 style={{ color: "#00d4ff", margin: "0 0 10px" }}>Provisionando Lab {labId}</h2>
        <p style={{ color: "#94a3b8", margin: "0 0 28px", fontSize: 13 }}>{message || "Iniciando containers..."}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {["Gerando topology.yml", "Criando containers FRR", "Configurando interfaces", "Iniciando sessões BGP"].map((s, i) => (
            <div key={i} style={{ background: "#0f172a", border: "1px solid #1e3a5f", color: "#475569", padding: "8px 12px", borderRadius: 8, fontSize: 11 }}>
              ⏳ {s}
            </div>
          ))}
        </div>
        <p style={{ color: "#334155", fontSize: 11, marginTop: 20 }}>Aguarde ~30–60 segundos para convergência BGP</p>
      </div>
    </div>
  );
}

// ─── ErrorScreen ──────────────────────────────────────────────────────────
export function ErrorScreen({ message, onBack }) {
  return (
    <div style={{ minHeight: "100vh", background: "#020817", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: "#f87171", margin: "0 0 10px" }}>Erro ao Provisionar</h2>
        <p style={{ color: "#94a3b8", margin: "0 0 24px", fontSize: 13 }}>{message}</p>
        <button onClick={onBack} style={{ background: "#0f172a", border: "1px solid #1e3a5f", color: "#60a5fa", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>← Voltar</button>
      </div>
    </div>
  );
}
