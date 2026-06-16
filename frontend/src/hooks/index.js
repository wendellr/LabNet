import { useState, useEffect, useRef, useCallback } from "react";

// ─── API base URL ─────────────────────────────────────────────────────────
export const API_BASE =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? ""
    : "http://localhost:3000";

export async function apiFetch(method, path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.error || res.statusText;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// ─── useWebSocket ─────────────────────────────────────────────────────────
export function useWebSocket(role, sessionId, onMessage) {
  const wsRef = useRef(null);
  const timerRef = useRef(null);

  const connect = useCallback(() => {
    // Constrói URL WebSocket relativa ao host atual (funciona com qualquer porta)
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = API_BASE
      ? API_BASE.replace(/^https?/, wsProto.slice(0, -1)) + "/ws"
      : `${wsProto}//${window.location.host}/ws`;
    const ws = new WebSocket(base);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", role, sessionId }));
      const hb = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "ping" }));
      }, 20000);
      ws._hb = hb;
    };

    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch {}
    };

    ws.onclose = () => {
      clearInterval(ws._hb);
      timerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [role, sessionId, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}

// ─── useToasts ────────────────────────────────────────────────────────────
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, level = "info", fromTeacher = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, level, fromTeacher }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return [toasts, push];
}

// ─── useSession ───────────────────────────────────────────────────────────
export function useSession(sessionId) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    let interval;

    const poll = async () => {
      try {
        const s = await apiFetch("GET", `/session/${sessionId}`);
        setSession(s);
        if (["running", "error", "cleaned"].includes(s.status))
          clearInterval(interval);
      } catch {}
    };

    poll();
    interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [sessionId]);

  return session;
}

// ─── useDashboard (teacher) ───────────────────────────────────────────────
export function useDashboard() {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    const load = () =>
      apiFetch("GET", "/admin/dashboard").then(setSnapshot).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return [snapshot, setSnapshot];
}

// ─── useTerminal ──────────────────────────────────────────────────────────
export function useTerminal(sessionId) {
  const [output, setOutput] = useState({});   // router → string
  const [running, setRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState([]);

  const exec = useCallback(
    async (router, command) => {
      if (!command.trim() || running) return null;
      setRunning(true);
      setCmdHistory((h) => [command, ...h.slice(0, 99)]);

      // Optimistic
      setOutput((o) => ({
        ...o,
        [router]: (o[router] || "") + `\n${router}# ${command}\n`,
      }));

      try {
        const res = await apiFetch("POST", `/session/${sessionId}/exec`, {
          router,
          command,
        });
        setOutput((o) => ({
          ...o,
          [router]: (o[router] || "") + res.output + "\n",
        }));
        return res.output;
      } catch (e) {
        setOutput((o) => ({
          ...o,
          [router]: (o[router] || "") + `\nErro: ${e.message}\n`,
        }));
        throw e;
      } finally {
        setRunning(false);
      }
    },
    [sessionId, running]
  );

  const clear = useCallback(
    (router) => setOutput((o) => ({ ...o, [router]: "" })),
    []
  );

  return { output, running, cmdHistory, exec, clear };
}
