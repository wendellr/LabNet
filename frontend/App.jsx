import { useState, useEffect } from "react";
import { SessionGate }      from "./src/components/SessionGate.jsx";
import { StudentLab }       from "./src/components/StudentLab.jsx";
import { TeacherDashboard } from "./src/components/TeacherDashboard.jsx";

const STORAGE_KEY = "bgplab_session";

function saveSession(sessionId, name, labId) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, name, labId }));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function App() {
  const [mode, setMode]           = useState("loading"); // loading → gate | student | teacher
  const [sessionId, setSessionId] = useState(null);
  const [studentName, setStudentName] = useState(null);
  const [labId, setLabId]         = useState(null);

  // Ao montar: tenta recuperar sessão salva
  useEffect(() => {
    const saved = loadSession();
    if (!saved?.sessionId) { setMode("gate"); return; }

    // Verifica se a sessão ainda está ativa no backend
    const proto = location.protocol === "https:" ? "https" : "http";
    fetch(`${proto}://${location.host}/api/session/${saved.sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && ["running", "idle", "provisioning"].includes(data.status)) {
          // Sessão ainda viva — retoma direto
          setSessionId(saved.sessionId);
          setStudentName(saved.name);
          setLabId(saved.labId);
          setMode("student");
        } else {
          // Sessão expirou ou não existe mais
          clearSession();
          setMode("gate");
        }
      })
      .catch(() => { clearSession(); setMode("gate"); });
  }, []);

  const handleSession = (sid, name, lid) => {
    saveSession(sid, name, lid);
    setSessionId(sid); setStudentName(name); setLabId(lid); setMode("student");
  };

  const handleExit = () => {
    clearSession();
    setSessionId(null); setStudentName(null); setLabId(null);
    setMode("gate");
  };

  if (mode === "loading")
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#020817" }}>
        <div style={{ color: "#00d4ff", fontFamily: "monospace", fontSize: 13 }}>
          ⟳ Verificando sessão...
        </div>
      </div>
    );

  if (mode === "gate")
    return (
      <SessionGate
        onSession={handleSession}
        onTeacher={() => setMode("teacher")}
      />
    );

  if (mode === "teacher")
    return <TeacherDashboard onExit={() => setMode("gate")} />;

  if (mode === "student")
    return (
      <StudentLab
        sessionId={sessionId} studentName={studentName}
        labId={labId} onExit={handleExit}
      />
    );

  return null;
}
