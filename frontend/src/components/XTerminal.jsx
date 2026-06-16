/**
 * XTerminal — Terminal xterm.js com WebSocket PTY
 * Importa xterm como módulo npm (sem CDN, sem window.Terminal)
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

const XTERM_THEME = {
  background:   "#020817",
  foreground:   "#e2e8f0",
  cursor:       "#00d4ff",
  cursorAccent: "#020817",
  selectionBackground: "#1e3a5f",
  black:        "#1e293b",
  red:          "#f87171",
  green:        "#4ade80",
  yellow:       "#fbbf24",
  blue:         "#60a5fa",
  magenta:      "#a78bfa",
  cyan:         "#00d4ff",
  white:        "#e2e8f0",
  brightBlack:  "#475569",
  brightRed:    "#fca5a5",
  brightGreen:  "#86efac",
  brightYellow: "#fde68a",
  brightBlue:   "#93c5fd",
  brightMagenta:"#c4b5fd",
  brightCyan:   "#67e8f9",
  brightWhite:  "#f8fafc",
};

/**
 * Props:
 *   sessionId  — ID da sessão BGP Lab
 *   router     — nome do roteador (ex: "R1")
 *   active     — se esta instância está visível (para fit)
 *
 * Ref expõe:
 *   connect()    — abre WebSocket PTY
 *   disconnect() — fecha WebSocket
 *   inject(cmd)  — envia comando + \n
 *   clear()      — limpa tela
 *   status       — "idle" | "connecting" | "connected" | "error"
 */
const XTerminal = forwardRef(function XTerminal({ sessionId, router, active }, ref) {
  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const fitRef       = useRef(null);
  const wsRef        = useRef(null);
  const statusRef    = useRef("idle");
  const roRef        = useRef(null); // ResizeObserver

  // ── Inicializa terminal ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      theme: XTERM_THEME,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      convertEol: true,
      allowTransparency: true,
      macOptionIsMeta: true,
    });

    const fit   = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(containerRef.current);

    // Mensagem inicial
    term.writeln("\x1b[1;36m╔══════════════════════════════════════════════════╗\x1b[0m");
    term.writeln("\x1b[1;36m║   BGP Lab Platform — Terminal Interativo          ║\x1b[0m");
    term.writeln("\x1b[1;36m╚══════════════════════════════════════════════════╝\x1b[0m");
    term.writeln("\x1b[90mClique em ▶ Conectar para iniciar sessão vtysh.\x1b[0m\r\n");

    termRef.current = term;
    fitRef.current  = fit;

    // Fit inicial e ao redimensionar
    try { fit.fit(); } catch {}
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
    ro.observe(containerRef.current);
    roRef.current = ro;

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []); // eslint-disable-line

  // Refit quando a tab fica visível
  useEffect(() => {
    if (active) setTimeout(() => { try { fitRef.current?.fit(); } catch {} }, 50);
  }, [active]);

  // ── API exposta via ref ───────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    get status() { return statusRef.current; },

    connect() {
      if (!sessionId) {
        termRef.current?.writeln("\x1b[31mErro: sessão não iniciada.\x1b[0m");
        return;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      statusRef.current = "connecting";
      const term = termRef.current;
      term?.writeln(`\x1b[33m\r\n── Conectando ao roteador ${router}... ──\x1b[0m`);

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const url   = `${proto}://${location.host}/ws/terminal/${encodeURIComponent(sessionId)}/${router}`;
      const ws    = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        statusRef.current = "connected";
        // Envia dimensões
        const dims = fitRef.current?.proposeDimensions?.();
        if (dims) ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));

        // Keepalive WebSocket: envia um espaço seguido de backspace a cada 30s
        // Visualmente invisível no vtysh mas mantém o WebSocket vivo no Nginx
        const keepalive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            // Espaço + backspace: não produz output visível no terminal
            ws.send(" ");
          } else {
            clearInterval(keepalive);
          }
        }, 30000);

        // Limpa ao fechar
        ws.addEventListener("close", () => clearInterval(keepalive), { once: true });
      };

      ws.onmessage = (evt) => {
        if (!termRef.current) return;
        if (evt.data instanceof ArrayBuffer) {
          termRef.current.write(new Uint8Array(evt.data));
        } else {
          termRef.current.write(evt.data);
        }
      };

      ws.onclose = (e) => {
        statusRef.current = "idle";
        if (wsRef.current === ws) wsRef.current = null;
        term?.writeln(`\x1b[90m\r\n[sessão encerrada${e.code !== 1000 ? " — código " + e.code : ""}]\x1b[0m`);
      };

      ws.onerror = () => {
        statusRef.current = "error";
        term?.writeln("\x1b[31m\r\n[erro de conexão WebSocket — verifique se o lab está rodando]\x1b[0m");
      };

      // Input → WebSocket
      term?.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });

      // Resize → notifica backend
      term?.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });
    },

    disconnect() {
      wsRef.current?.close();
      wsRef.current = null;
      statusRef.current = "idle";
      termRef.current?.writeln("\x1b[90m\r\n[desconectado]\x1b[0m");
    },

    inject(cmd) {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(cmd + "\n");
      } else {
        // Se não conectado, mostra o comando no terminal para o aluno digitar
        termRef.current?.writeln(`\x1b[90m[sugestão] \x1b[33m${cmd}\x1b[0m`);
      }
    },

    clear() { termRef.current?.clear(); },

    focus() { termRef.current?.focus(); },
  }));

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#020817" }}
      onClick={() => termRef.current?.focus()}
    />
  );
});

export default XTerminal;
