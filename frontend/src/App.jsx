import { useState, useEffect } from "react";

/*
 * NADIA CARE — MATERNITY NAVIGATOR DISPATCH LAYER (v3.2 - SPRUCE ALIGNED)
 * ----------------------------------------------------------------------------
 * Integrated Cross-Queue Architecture communicating live with FastAPI on port 8000:
 * - Dynamic data hydration from backend state
 * - Multi-source pipeline payload intake automation
 * - Departmental transfer & resolution compliance hooks
 * - Tooling alignment targeting Spruce Health communications ecosystem
 */

const c = {
  bg: "#e6e1e7",         // Brand Light Lilac Tint (Canvas Background)
  surface: "#ffffff",    // Brand Pure White (Cards/Modals)
  surfaceAlt: "#f2eff3", // Tinted surface for nested tables
  ink: "#192d37",        // Brand Deep Slate Navy (High-Readability Text)
  inkSoft: "#53646f",    // Softened Slate Navy for subheadings/timestamps
  line: "#d1cad3",       // Clean border outlines
  plum: "#40173b",       // Brand Deep Plum/Burgundy (Primary UI Accent)
  plumSoft: "#f3eef3",   // Ultra-light plum tint for background tag states
  teal: "#2b7c7b",       // Darkened seafoam target for accessible text elements
  tealSoft: "#d7f1f0",   // Lightened seafoam tint for background tag states
  red: "#b23a32",        // Standard compliance clinical alert red
  redSoft: "#f6e2e0",    // Soft warning banner red
  amber: "#b0761b",      // Watchdog escalation warning amber
  amberSoft: "#f5ebd5"   // Soft watchdog banner amber
  };

const body = { fontFamily: "'Inter', system-ui, sans-serif" };
const disp = { fontFamily: "'Fraunces', Georgia, serif" };

const SOURCE_CONFIG = {
  athena_ehr: { label: "Athena EHR", color: "#1E3A8A", soft: "#DBEAFE" },
  spruce_health: { label: "Spruce Health", color: "#7C3AED", soft: "#F3E8FF" },
  hubspot_crm: { label: "HubSpot CRM", color: "#EA580C", soft: "#FFEDD5" }
};

const URGENCY = {
  critical: { label: "Critical", color: c.red, soft: c.redSoft, rank: 0, weight: 5, slaCap: 1 },
  high: { label: "High", color: c.amber, soft: c.amberSoft, rank: 1, weight: 3, slaCap: 8 },
  routine: { label: "Routine", color: "#3C7B5C", soft: "#E3EFE7", rank: 2, weight: 1, slaCap: Infinity },
};

const CATEGORY_LABEL = {
  clinical_concern: "Clinical concern", behavioral_health: "Behavioral health",
  housing: "Housing", transportation: "Transportation", nutrition: "Nutrition & food",
  lactation: "Lactation", doula: "Doula", care_navigation: "Care navigation", benefits: "Benefits & insurance",
};

const TEAM = [
  { id: "sup1", name: "Elena R.", role: "Maternity Navigator Supervisor" },
  { id: "sr1", name: "Sarah K.", role: "Senior Maternity Navigator" },
  { id: "sr2", name: "Michael T.", role: "Senior Maternity Navigator" },
  { id: "nav1", name: "Aisha K.", role: "Maternity Navigator" },
  { id: "nav2", name: "Sofia L.", role: "Maternity Navigator" },
  { id: "nav3", name: "Jordan P.", role: "Maternity Navigator" },
  { id: "nav4", name: "Priya M.", role: "Maternity Navigator" },
  { id: "nav5", name: "Carlos D.", role: "Maternity Navigator" },
  { id: "nav6", name: "Faith W.", role: "Maternity Navigator" },
];

const EXTERNAL_QUEUES = [
  { id: "q_medical", label: "Medical Services Queue (RN / NP)" },
  { id: "q_admissions", label: "Admissions & Enrollment Queue" },
  { id: "q_behavioral", label: "Behavioral Health Specialist Queue" },
  { id: "q_lactation", label: "Lactation & Doula Support Queue" }
];

const clock = (m) => { let h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${String(mm).padStart(2, "0")} ${ap}`; };

function Chip({ label, color, soft, small }) {
  return <span style={{ background: soft, color, fontSize: small ? 11 : 12 }} className="inline-flex items-center font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">{label}</span>;
}
function Btn({ children, onClick, kind = "ghost", disabled }) {
  const map = { primary: { background: c.plum, color: "#fff" }, ok: { background: c.teal, color: "#fff" }, danger: { background: c.red, color: "#fff" }, ghost: { background: c.surfaceAlt, color: c.ink, border: `1px solid ${c.line}` } };
  return <button onClick={onClick} disabled={disabled} style={{ ...map[kind], fontSize: 12, opacity: disabled ? 0.5 : 1 }} className="rounded-lg px-3 py-1.5 font-semibold transition hover:opacity-90 disabled:cursor-not-allowed">{children}</button>;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [now, setNow] = useState(540); 
  const [currentRole, setCurrentRole] = useState("supervisor");
  const [tab, setTab] = useState("workspace"); 
  const [text, setText] = useState("");
  const [selectedSource, setSelectedSource] = useState("athena_ehr"); 
  const [alerts, setAlerts] = useState([]);
  const [report, setReport] = useState(null);
  const [selectedRecs, setSelectedRecs] = useState([]);
  
  const [resolvingTask, setResolvingTask] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [transferringTask, setTransferringTask] = useState(null);

  const member = (id) => TEAM.find((m) => m.id === id);
  const addAlert = (a) => setAlerts((p) => [{ id: Date.now() + Math.random(), min: now, ...a }, ...p]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 4000); 
    return () => clearInterval(interval);
  }, [currentRole]);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/tasks?role=${currentRole}`);
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error("Connection link down to API on port 8000:", err);
    }
  };

  const loadOf = (id, tasksList) => tasksList.filter((t) => t.assignedTo === id && ["assigned", "awaiting_ack", "in_progress", "at_risk"].includes(t.status)).reduce((s, t) => s + (URGENCY[t.urgency]?.weight || 1), 0);

  function computeReport() {
    const open = tasks.filter((t) => t.status !== "done" && t.status !== "transferred");
    const byUrg = { critical: 0, high: 0, routine: 0 };
    open.forEach((t) => { if(byUrg[t.urgency] !== undefined) byUrg[t.urgency]++; });
    
    const perMember = TEAM.map((m) => ({ ...m, load: loadOf(m.id, tasks) }));
    const navs = perMember.filter((m) => m.id.startsWith("nav"));
    const avg = navs.length ? navs.reduce((s, m) => s + m.load, 0) / navs.length : 0;
    
    const recs = [];
    const sim = perMember.map((m) => ({ ...m }));
    navs.filter((m) => m.load > Math.max(4, avg * 1.5)).forEach((over) => {
      const movable = tasks.filter((t) => t.assignedTo === over.id && t.status === "assigned" && t.urgency !== "critical");
      movable.forEach((t) => {
        const o = sim.find((x) => x.id === over.id);
        if (o.load <= avg) return;
        const target = sim.filter((x) => x.id !== over.id && x.id.startsWith("nav") && x.load < avg).sort((a, b) => a.load - b.load)[0];
        if (!target || recs.length >= 3) return;
        recs.push({ taskId: t.id, summary: t.summary, urgency: t.urgency, fromId: over.id, fromName: over.name, toId: target.id, toName: target.name,
          reason: `${over.name} load is high (${o.load}); shift processing target to ${target.name} (${target.load}).` });
        o.load -= URGENCY[t.urgency]?.weight || 1; target.load += URGENCY[t.urgency]?.weight || 1;
      });
    });
    setReport({ time: now, byUrg, perMember, recs, handledPct: 100 });
  }

  async function intake() {
    if (!text.trim()) return;
    try {
      const res = await fetch("http://localhost:8000/api/webhooks/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: selectedSource, text: text })
      });
      const data = await res.json();
      addAlert({ type: "intake", msg: `📥 API Webhook Dispatched. Engine routed record to ${TEAM.find(m => m.id === data.allocated_to)?.name}.` });
      // SWAPPED: Using Spruce hook naming conventions directly in the logging string array
      if (data.task.urgency === "critical") addAlert({ type: "critical", msg: `🚨 CRITICAL SAFETY EVENT DETECTED: Escalated across internal Spruce webhooks.` });
      setText("");
      fetchTasks();
    } catch (err) {
      addAlert({ type: "critical", msg: "❌ API Failure: Ensure uvicorn backend server is active on port 8000." });
    }
  }

  function changeStatus(id, newStatus) {
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
  }

  async function executeCrossQueueTransfer(targetQueueId) {
    if (!transferringTask) return;
    const operatorName = currentRole === "supervisor" ? "Supervisor Desk" : member(currentRole)?.name || "Maternity Navigator";
    try {
      await fetch(`http://localhost:8000/api/tasks/${transferringTask.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_queue_id: targetQueueId, authorized_by: operatorName })
      });
      addAlert({ type: "transfer", msg: `🔀 CROSS-QUEUE: Dispatched ${transferringTask.member} to external department queue logic.` });
      setTransferringTask(null);
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  }

  async function submitResolution() {
    if (!resolvingTask) return;
    const operatorName = currentRole === "supervisor" ? "Supervisor Desk" : member(currentRole)?.name || "System";
    try {
      await fetch(`http://localhost:8000/api/tasks/${resolvingTask.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorized_by: operatorName, notes: resolutionNotes })
      });
      addAlert({ type: "resolved", msg: `✅ Audit Closed on File Record ${resolvingTask.member}.` });
      setResolvingTask(null);
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  }

  function toggleSelection(taskId) {
    setSelectedRecs((prev) => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]);
  }

  function acceptSelected() {
    if (!report) return;
    report.recs.forEach((rec) => {
      if (selectedRecs.includes(rec.taskId)) {
        changeStatus(rec.taskId, "assigned");
        addAlert({ type: "rebalance", msg: `🔀 Reallocated work token context onto ${rec.toName}.` });
      }
    });
    setSelectedRecs([]);
  }

  function advance(mins) {
    setNow((prev) => prev + mins);
    addAlert({ type: "watchdog", msg: `🕘 Simulated time advanced +${mins}m.` });
  }

  const activeCriticalAlerts = tasks.filter(t => t.status !== "done" && t.status !== "transferred" && t.urgency === "critical");
  const localOpenTasks = tasks.filter(t => t.status !== "done" && t.status !== "transferred");
  const auditLogs = tasks.filter(t => t.status === "done" || t.status === "transferred");

  return (
    <div style={{ background: c.bg, color: c.ink, minHeight: "100vh", ...body }}>
      
      {activeCriticalAlerts.length > 0 && (
        <div style={{ background: c.red, color: "#fff" }} className="px-4 py-2 text-sm font-semibold animate-pulse shadow-lg flex items-center justify-between gap-4 z-40 relative">
          <div className="flex items-center gap-2">
            <span>🚨 HIGH CRITICAL OUTSTANDING RISK ALERT (MATERNITY TEAM PORTAL LOCK):</span>
            <span className="underline truncate max-w-xl">"{activeCriticalAlerts[0].member}: {activeCriticalAlerts[0].summary}"</span>
          </div>
          <Btn onClick={() => openResolutionModal(activeCriticalAlerts[0])} kind="primary">Resolve Immediate</Btn>
        </div>
      )}

      <header style={{ background: c.plum, color: "#fff" }} className="px-5 py-3 shadow-md">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ ...disp, fontSize: 20 }} className="font-semibold">Nadia Care · Operations Console</div>
            <div style={{ color: c.plumSoft, fontSize: 11 }} className="uppercase tracking-wide font-medium">Full-Stack Live Connected Maternity Navigation Hub</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11 }} className="uppercase text-gray-300 font-bold">Navigator Shift Seat:</span>
              <select 
                value={currentRole} 
                onChange={(e) => { setCurrentRole(e.target.value); setTab("workspace"); }}
                style={{ background: c.surfaceAlt, color: c.ink, fontSize: 12 }}
                className="rounded-lg p-1 font-semibold outline-none border"
              >
                <option value="supervisor"> Elena R. (Team Supervisor Console) </option>
                {TEAM.filter(m => m.id !== "sup1").map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.role === "Senior Maternity Navigator" ? "Senior" : "Navigator"})</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-black bg-opacity-20 p-1 rounded-lg">
              <span style={{ fontSize: 12 }} className="px-2 font-mono">母 {clock(now)}</span>
              <Btn onClick={() => advance(15)} kind="ghost">+15m</Btn>
              <Btn onClick={computeReport} kind="ghost">Compute Report</Btn>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 pt-4 flex gap-2">
        <button onClick={() => setTab("workspace")} style={{ background: tab === "workspace" ? c.surface : "transparent", borderColor: c.line, color: tab === "workspace" ? c.ink : c.inkSoft }} className="border rounded-t-xl px-5 py-2 font-bold text-sm transition-all">
          {currentRole === "supervisor" ? "Maternity Navigator Queue Master" : "My Assigned Cases"}
        </button>
        {currentRole === "supervisor" && (
          <button onClick={() => setTab("supervisor-panel")} style={{ background: tab === "supervisor-panel" ? c.surface : "transparent", borderColor: c.line, color: tab === "supervisor-panel" ? c.ink : c.inkSoft }} className="border rounded-t-xl px-5 py-2 font-bold text-sm transition-all">
            Supervisor Rebalance Desk
          </button>
        )}
        <button onClick={() => setTab("audit-logs")} style={{ background: tab === "audit-logs" ? c.surface : "transparent", borderColor: c.line, color: tab === "audit-logs" ? c.ink : c.inkSoft }} className="border rounded-t-xl px-5 py-2 font-bold text-sm transition-all">
          Department Activity Log & Hand-offs ({auditLogs.length})
        </button>
      </div>

      <main className="max-w-5xl mx-auto px-4 pb-12 mt-4">
        
        {tab === "workspace" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            <div className="lg:col-span-1 flex flex-col gap-4">
              {currentRole === "supervisor" && (
                <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                  <h2 style={{ ...disp, fontSize: 16 }} className="font-semibold">Simulate Inbound Data Pipeline</h2>
                  
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1">Source Pipeline Link:</label>
                    <select
                      value={selectedSource}
                      onChange={(e) => setSelectedSource(e.target.value)}
                      style={{ background: c.surfaceAlt, color: c.ink }}
                      className="w-full text-xs rounded-xl p-2 font-semibold outline-none border border-gray-200"
                    >
                      <option value="athena_ehr">Athena EHR Webhook Stream</option>
                      <option value="spruce_health">Spruce Health Patient SMS Text</option>
                      <option value="hubspot_crm">HubSpot Web Inquiry Form</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1">Message Body Payload:</label>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Enter message text here..." style={{ borderColor: c.line, background: c.surfaceAlt }} className="w-full text-xs rounded-xl p-3 outline-none resize-none font-mono" />
                  </div>

                  <Btn onClick={intake} kind="primary" disabled={!text.trim()}>Deploy to Maternity Roster</Btn>
                </div>
              )}
              
              <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
                <h2 style={{ ...disp, fontSize: 16 }} className="font-semibold mb-2">Automated Engine Streams</h2>
                <div className="flex flex-col gap-2 max-h-72 overflow-auto">
                  {alerts.map((a) => (
                    <div key={a.id} style={{ background: a.type === "critical" || a.type === "at_risk" ? c.redSoft : c.surfaceAlt }} className="rounded-xl p-2.5 text-xs font-medium border border-transparent">
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span style={{ color: a.type === "critical" || a.type === "at_risk" ? c.red : c.ink }}>{a.type.toUpperCase()} HOOK</span>
                        <span className="text-gray-400">{clock(a.min)}</span>
                      </div>
                      <p className="text-gray-700">{a.msg}</p>
                    </div>
                  ))}
                  {alerts.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No payload processing entries registered.</p>}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <h2 style={{ ...disp, fontSize: 18 }} className="font-bold mb-3">
                {currentRole === "supervisor" ? "Maternity Navigation Primary Master Queue" : `Active Case Assignment Tracking`}
              </h2>
              <div className="flex flex-col gap-3">
                {localOpenTasks.map((t) => (
                  <div key={t.id} style={{ background: t.status === "at_risk" ? c.amberSoft : c.surface, borderColor: t.status === "at_risk" ? c.amber : c.line, borderLeftColor: URGENCY[t.urgency]?.color || c.line, borderLeftWidth: 5 }} className="border rounded-xl p-4 shadow-sm flex flex-col justify-between transition-all">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-sm" style={{ color: c.ink }}>{t.member}</span>
                          <Chip label={SOURCE_CONFIG[t.source]?.label || t.source} color={SOURCE_CONFIG[t.source]?.color || c.ink} soft={SOURCE_CONFIG[t.source]?.soft || c.surfaceAlt} small />
                        </div>
                        <span className="text-xs text-gray-500">Ingested Timestamp Token: {clock(t.createdMin || 540)}</span>
                      </div>
                      <div className="flex gap-1.5 items-center">
                        <Chip label={URGENCY[t.urgency]?.label || t.urgency} color={URGENCY[t.urgency]?.color || c.ink} soft={URGENCY[t.urgency]?.soft || c.surfaceAlt} small />
                        <Chip label={CATEGORY_LABEL[t.category] || t.category} color={c.plum} soft={c.plumSoft} small />
                      </div>
                    </div>
                    <p className="text-xs font-mono font-medium p-2.5 rounded-lg border border-gray-100 bg-gray-50 text-gray-700 mb-4">“{t.summary}”</p>
                    <div className="flex justify-between items-center flex-wrap gap-2 pt-2 border-t border-gray-100">
                      <span className="text-xs font-semibold text-gray-500">
                        Navigator Holder: <span className="font-bold text-gray-700">{TEAM.find(m => m.id === t.assignedTo)?.name || t.assignedTo}</span> · Status: <span className="uppercase text-xs font-mono font-bold bg-gray-200 px-1 rounded text-gray-700">{t.status}</span>
                      </span>
                      <div className="flex gap-2">
                        {t.status === "awaiting_ack" && <Btn onClick={() => changeStatus(t.id, "in_progress")} kind="ok">Acknowledge</Btn>}
                        {t.status === "assigned" && <Btn onClick={() => changeStatus(t.id, "in_progress")} kind="primary">Mark In Progress</Btn>}
                        {["assigned", "in_progress", "at_risk", "awaiting_ack"].includes(t.status) && (
                          <>
                            <Btn onClick={() => setTransferringTask(t)} kind="ghost">➡️ Transfer Queue</Btn>
                            <Btn onClick={() => openResolutionModal(t)} kind="primary">Resolve Done</Btn>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {localOpenTasks.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                    <p className="text-sm text-gray-400 font-medium">All tasks cleared. Enter sample text strings to fire inbound webhooks.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {tab === "supervisor-panel" && currentRole === "supervisor" && (
          <div className="flex flex-col gap-4">
            {!report ? (
              <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-8 text-center shadow-sm">
                <p className="text-sm text-gray-500 mb-3">No active system load calculations processed for this interval branch.</p>
                <Btn onClick={computeReport} kind="primary">Compute Balance Matrix</Btn>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h3 style={{ ...disp, fontSize: 16 }} className="font-bold">Maternity Matrix Optimization Recommendations</h3>
                    <div className="flex gap-2">
                      <Btn onClick={acceptSelected} kind="ok" disabled={selectedRecs.length === 0}>Accept Selected Moves</Btn>
                    </div>
                  </div>
                  {report.recs.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center border rounded-xl border-dashed">Workload evenly split across active shifts. No reallocations proposed.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {report.recs.map((r) => (
                        <div key={r.taskId} className="bg-gray-50 border rounded-xl p-3 flex items-start gap-3 hover:bg-gray-100 transition-colors">
                          <input type="checkbox" checked={selectedRecs.includes(r.taskId)} onChange={() => toggleSelection(r.taskId)} style={{ width: 16, height: 16, marginTop: 4, cursor: "pointer" }} />
                          <div className="flex-1 text-xs">
                            <div className="flex justify-between items-center font-bold text-sm mb-1">
                              <span>Reallocate Shift: {r.fromName} ➔ {r.toName}</span>
                              <Chip label={URGENCY[r.urgency]?.label || r.urgency} color={URGENCY[r.urgency]?.color || c.ink} soft={URGENCY[r.urgency]?.soft || c.surfaceAlt} small />
                            </div>
                            <p className="text-gray-600 bg-white p-2 rounded border border-gray-200 font-mono text-xs my-1">"{r.summary}"</p>
                            <p className="text-gray-500 font-medium">Algorithmic Reason: {r.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
                  <h3 style={{ ...disp, fontSize: 16 }} className="font-bold mb-3">Maternity Navigator Cognitive Load Heatmap</h3>
                  <div className="flex flex-col gap-3">
                    {report.perMember.map(m => (
                      <div key={m.id} className="flex items-center gap-4 text-sm font-semibold">
                        <div className="w-48 truncate">
                          <span className="block text-gray-900">{m.name}</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">{m.role}</span>
                        </div>
                        <div className="flex-1 bg-gray-200 h-3 rounded-full overflow-hidden">
                          <div style={{ width: `${Math.min(100, m.load * 12)}%`, background: m.load > 6 ? c.red : c.teal }} className="h-full transition-all" />
                        </div>
                        <span className="w-16 text-right text-xs font-mono font-bold bg-gray-100 p-1 rounded">Load: {m.load}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "audit-logs" && (
          <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
            <h2 style={{ ...disp, fontSize: 18 }} className="font-bold mb-3">Compliance & Inter-Departmental Tracking Ledger</h2>
            <div className="flex flex-col gap-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-medium">
                  <div className="flex justify-between items-start gap-2 border-b pb-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm text-gray-900 block">Patient Event: {log.member}</span>
                        <Chip label={SOURCE_CONFIG[log.source]?.label || log.source} color={SOURCE_CONFIG[log.source]?.color || c.ink} soft={SOURCE_CONFIG[log.source]?.soft || c.surfaceAlt} small />
                      </div>
                      <span className="text-gray-400 font-mono text-[10px]">Case ID Key Token: {log.id}</span>
                    </div>
                    <div className="text-right">
                      {log.status === "transferred" ? (
                        <span className="text-purple-700 bg-purple-50 px-2 py-1 rounded font-bold uppercase tracking-wider text-[10px]">DEPARTED CROSS-HANDOFF</span>
                      ) : (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded font-bold uppercase tracking-wider text-[10px]">RESOLVED IN-HOUSE</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="mb-2">
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px] mb-0.5">Original Intake Context:</span>
                    <p className="text-gray-700 bg-white p-2 rounded border font-mono text-xs">“{log.summary}”</p>
                  </div>

                  {log.status === "transferred" && log.externalTransferLog && (
                    <div className="bg-purple-50 border border-purple-100 p-2.5 rounded font-mono text-xs text-purple-900">
                      <div className="font-bold mb-0.5">🚀 DEPARTMENT TRANSFER METRIC DISPATCH RECORD:</div>
                      Transferred Out To: <span className="underline font-bold">{EXTERNAL_QUEUES.find(eq=>eq.id===log.externalTransferLog.transferredTo)?.label || log.externalTransferLog.transferredTo}</span> <br />
                      Authorized By: {log.externalTransferLog.transferredBy} · Minute Ledger: {clock(log.externalTransferLog.transferredAtMin)}
                    </div>
                  )}

                  {log.status === "done" && (
                    <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded font-mono text-xs text-emerald-900">
                      <div className="font-bold mb-0.5">✓ SYSTEM OUTCOME CLOSED INDEPENDENTLY RECORD:</div>
                      Closed By: {log.resolvedBy} · Outcome Documentation notes: <span className="font-bold">"{log.resolutionNotes}"</span>
                    </div>
                  )}
                </div>
              ))}
              {auditLogs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No matching structural database logs committed inside this active session.</p>
              )}
            </div>
          </div>
        )}

      </main>

      {transferringTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div style={{ background: c.surface }} className="rounded-2xl max-w-md w-full p-6 shadow-2xl border flex flex-col gap-4">
            <div>
              <h3 style={{ ...disp, fontSize: 18 }} className="font-bold text-gray-900 mb-1">Cross-Queue Inter-Departmental Dispatch</h3>
              <p className="text-xs text-gray-500 font-medium">Route this workflow item out of the specialized Maternity Navigation stack and assign it to an external department service queue payload.</p>
            </div>
            
            <div className="bg-gray-50 p-2.5 rounded-xl border text-xs text-gray-600 font-mono">
              <span className="font-bold block text-gray-900 mb-0.5">Source Case: {transferringTask.member}</span>
              “{transferringTask.summary.slice(0, 100)}...”
            </div>

            <div className="flex flex-col gap-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Target External Infrastructure Destination Queue:</label>
              {EXTERNAL_QUEUES.map((q) => (
                <button key={q.id} onClick={() => executeCrossQueueTransfer(q.id)} style={{ borderColor: c.line }} className="w-full text-left p-2.5 rounded-xl border font-semibold text-xs transition-all hover:bg-purple-50 hover:text-purple-900 hover:border-purple-300">
                  ➔ {q.label}
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Btn onClick={() => setTransferringTask(null)} kind="ghost">Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {resolvingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div style={{ background: c.surface }} className="rounded-2xl max-w-lg w-full p-6 shadow-2xl border flex flex-col gap-4">
            <div>
              <h3 style={{ ...disp, fontSize: 18 }} className="font-bold text-gray-900 mb-1">Enforced Summary Outcome Notes</h3>
              <p className="text-xs text-gray-500 font-medium">Compliance guidelines require outcome validation tracking notes before an unassigned or routed care navigation task model is committed as done.</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-xl border font-mono text-xs text-gray-700">
              <span className="font-bold block text-gray-900 mb-1">Target Account: {resolvingTask.member}</span>
              “{resolvingTask.summary}”
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Resolution Operational Log Notes:</label>
              <textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} rows={4} placeholder="Detail resolution path parameters, outcome indicators, or referral logging..." className="w-full text-xs rounded-xl p-3 border outline-none font-mono focus:border-purple-500" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Btn onClick={() => setResolvingTask(null)} kind="ghost">Dismiss</Btn>
              <Btn onClick={submitResolution} kind="ok" disabled={!resolutionNotes.trim()}>Commit Entry Record</Btn>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}