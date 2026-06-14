import { useState, useEffect } from "react";

/*
 * NADIA CARE — ADVANCED DISPATCH & SAFETY CONSOLE
 * ----------------------------------------------------
 * Enterprise-grade UI simulation featuring:
 * - Persistent Accept/Decline checkboxes for supervisor rebalancing
 * - Worker vs. Supervisor specialized console views
 * - Forced documentation modal on task resolution with audit logging
 * - Background Watchdog monitoring SLA duration (>60m in_progress -> at_risk)
 * - Global persistent notification layer for critical alerts
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

const ROUTING_RULES = {
  clinical_concern: { slaHours: 0.5 }, behavioral_health: { slaHours: 4 },
  housing: { slaHours: 24 }, transportation: { slaHours: 48 }, nutrition: { slaHours: 72 },
  lactation: { slaHours: 48 }, doula: { slaHours: 48 }, care_navigation: { slaHours: 72 }, benefits: { slaHours: 72 },
};

const TEAM = [
  { id: "rn1", name: "Priya R.", role: "RN" },
  { id: "bh1", name: "Marcus T.", role: "Behavioral Health" },
  { id: "lc1", name: "Dana W.", role: "Lactation" },
  { id: "nv1", name: "Aisha K.", role: "Navigator" },
  { id: "nv2", name: "Sofia L.", role: "Navigator" },
  { id: "nv3", name: "Jordan P.", role: "Navigator" },
];

let SEED_ID = 1;
const seed = (o) => ({
  id: SEED_ID++, member: o.member, gest: o.gest, market: o.market, category: o.cat,
  urgency: o.urg, emergency: !!o.emer, summary: o.sum, assignedTo: o.to, status: o.status,
  createdMin: o.cm, statusChangedMin: o.cm, slaHours: ROUTING_RULES[o.cat].slaHours, escalations: 0,
  ackDeadline: o.urg === "critical" && o.status === "awaiting_ack" ? o.cm + 10 : null,
  resolutionNotes: "", resolvedAtMin: null, resolvedBy: null
});

const SEED_TASKS = [
  seed({ member: "Member #4821", gest: 35, market: "GA", cat: "clinical_concern", urg: "critical", emer: true, sum: "Decreased fetal movement since this morning.", to: "rn1", status: "in_progress", cm: 500 }),
  seed({ member: "Member #4712", gest: 12, market: "TX", cat: "housing", urg: "high", sum: "Eviction notice, must be out Friday.", to: "nv1", status: "assigned", cm: 505 }),
  seed({ member: "Member #4690", gest: 22, market: "GA", cat: "transportation", urg: "high", sum: "No ride to tomorrow's appointment.", to: "nv1", status: "assigned", cm: 515 }),
  seed({ member: "Member #4655", gest: 8, market: "FL", cat: "nutrition", urg: "routine", sum: "Wants help applying for WIC.", to: "nv1", status: "assigned", cm: 520 }),
  seed({ member: "Member #4509", gest: 26, market: "FL", cat: "benefits", urg: "routine", sum: "Medicaid postpartum coverage question.", to: "nv2", status: "assigned", cm: 510 }),
  seed({ member: "Member #4477", gest: 1, market: "OH", cat: "behavioral_health", urg: "high", sum: "Tearful daily since birth, feels unlike herself.", to: "bh1", status: "assigned", cm: 525 }),
];

function localTriage(text) {
  const t = text.toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  let cat = "care_navigation", urg = "routine", emer = false;
  if (has("kill myself", "hurt myself", "don't want to live")) { cat = "behavioral_health"; urg = "critical"; emer = true; }
  else if (has("bleed", "blood", "contraction", "pain")) { cat = "clinical_concern"; urg = "high"; if (has("heavy", "severe")) { urg = "critical"; emer = true; } }
  else if (has("ride", "transport", "bus")) { cat = "transportation"; urg = "high"; }
  else if (has("food", "hungry", "groceries")) { cat = "nutrition"; urg = "high"; }
  return { primary_category: cat, urgency: urg, emergency: emer };
}

const clock = (m) => { let h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${String(mm).padStart(2, "0")} ${ap}`; };
const loadOf = (id, tasks) => tasks.filter((t) => t.assignedTo === id && ["assigned", "awaiting_ack", "acked", "in_progress", "at_risk"].includes(t.status)).reduce((s, t) => s + URGENCY[t.urgency].weight, 0);

function Chip({ label, color, soft, small }) {
  return <span style={{ background: soft, color, fontSize: small ? 11 : 12 }} className="inline-flex items-center font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">{label}</span>;
}
function Btn({ children, onClick, kind = "ghost", disabled }) {
  const map = { primary: { background: c.plum, color: "#fff" }, ok: { background: c.teal, color: "#fff" }, danger: { background: c.red, color: "#fff" }, ghost: { background: c.surfaceAlt, color: c.ink, border: `1px solid ${c.line}` } };
  return <button onClick={onClick} disabled={disabled} style={{ ...map[kind], fontSize: 12, opacity: disabled ? 0.5 : 1 }} className="rounded-lg px-3 py-1.5 font-semibold transition hover:opacity-90 disabled:cursor-not-allowed">{children}</button>;
}

export default function App() {
  const [tasks, setTasks] = useState(SEED_TASKS);
  const [now, setNow] = useState(540); 
  const [currentRole, setCurrentRole] = useState("supervisor");
  const [tab, setTab] = useState("workspace"); 
  const [text, setText] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [report, setReport] = useState(null);
  const [selectedRecs, setSelectedRecs] = useState([]);
  
  // Resolution Modal State
  const [resolvingTask, setResolvingTask] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const member = (id) => TEAM.find((m) => m.id === id);
  const addAlert = (a) => setAlerts((p) => [{ id: Date.now() + Math.random(), min: now, ...a }, ...p]);

  function computeReport(tasksList, currentMin) {
    const open = tasksList.filter((t) => t.status !== "done");
    const byUrg = { critical: 0, high: 0, routine: 0 };
    open.forEach((t) => byUrg[t.urgency]++);
    const urgent = tasksList.filter((t) => ["critical", "high"].includes(t.urgency));
    const handled = urgent.filter((t) => ["acked", "in_progress", "done"].includes(t.status)).length;
    const handledPct = urgent.length ? Math.round((handled / urgent.length) * 100) : 100;
    const atRisk = open.filter((t) => ["critical", "high"].includes(t.urgency) && !["acked", "in_progress"].includes(t.status) && (t.createdMin + t.slaHours * 60 - currentMin) < 120);
    const perMember = TEAM.map((m) => ({ ...m, load: loadOf(m.id, tasksList) }));
    const navs = perMember.filter((m) => TEAM.find(tm => tm.id === m.id)?.role === "Navigator");
    const avg = navs.length ? navs.reduce((s, m) => s + m.load, 0) / navs.length : 0;
    
    const recs = [];
    const sim = perMember.map((m) => ({ ...m }));
    navs.filter((m) => m.load > Math.max(4, avg * 1.5)).forEach((over) => {
      const movable = tasksList.filter((t) => t.assignedTo === over.id && t.status === "assigned" && t.urgency !== "critical")
        .sort((a, b) => URGENCY[b.urgency].rank - URGENCY[a.urgency].rank);
      movable.forEach((t) => {
        const o = sim.find((x) => x.id === over.id);
        if (o.load <= avg) return;
        const target = sim.filter((x) => x.id !== over.id && x.load < avg)
          .sort((a, b) => a.load - b.load)[0];
        if (!target || recs.length >= 3) return;
        recs.push({ taskId: t.id, summary: t.summary, urgency: t.urgency, fromId: over.id, fromName: over.name, toId: target.id, toName: target.name,
          reason: `${over.name} is at load ${o.load} (team avg ${avg.toFixed(1)}); ${target.name} is free now at ${target.load}.` });
        o.load -= URGENCY[t.urgency].weight; target.load += URGENCY[t.urgency].weight;
      });
    });
    return { time: currentMin, byUrg, handledPct, atRisk, perMember, recs, escalations: tasksList.reduce((s, t) => s + t.escalations, 0) };
  }

  function intake() {
    if (!text.trim()) return;
    const r = localTriage(text);
    const pool = TEAM.filter((m) => r.primary_category === "clinical_concern" ? m.role === "RN" : m.role === "Navigator");
    const a = pool.sort((x, y) => loadOf(x.id, tasks) - loadOf(y.id, tasks))[0] || TEAM[0];

    const task = {
      id: Date.now(), member: `Member #${4900 + (tasks.length % 90)}`, gest: "—", market: "GA",
      category: r.primary_category, urgency: r.urgency, emergency: r.emergency,
      summary: text, assignedTo: a.id, status: r.urgency === "critical" ? "awaiting_ack" : "assigned",
      createdMin: now, statusChangedMin: now, slaHours: ROUTING_RULES[r.primary_category].slaHours, escalations: 0,
      ackDeadline: r.urgency === "critical" ? now + 10 : null,
      resolutionNotes: "", resolvedAtMin: null, resolvedBy: null
    };
    setTasks((p) => [task, ...p]);
    if (r.urgency === "critical") addAlert({ type: "critical", msg: `🔔 CRITICAL ASSIGNMENT: ${a.name} routed "${text.slice(0,30)}..."`, taskId: task.id });
    setText("");
  }

  function changeStatus(id, newStatus) {
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, status: newStatus, statusChangedMin: now } : t)));
  }

  function openResolutionModal(task) {
    setResolvingTask(task);
    setResolutionNotes("");
  }

  function submitResolution() {
    if (!resolvingTask) return;
    const operatorName = currentRole === "supervisor" ? "Supervisor View" : member(currentRole)?.name || "System";
    
    setTasks((p) => p.map((t) => t.id === resolvingTask.id ? {
      ...t,
      status: "done",
      statusChangedMin: now,
      resolvedAtMin: now,
      resolvedBy: operatorName,
      resolutionNotes: resolutionNotes || "Resolved with no optional documentation notes."
    } : t));

    addAlert({ type: "resolved", msg: `✅ Task Resolved by ${operatorName}: "${resolvingTask.summary.slice(0, 30)}..."` });
    setResolvingTask(null);
  }

  function toggleSelection(taskId) {
    setSelectedRecs((prev) => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  }

  function clearChecked() {
    setSelectedRecs([]);
  }

  function acceptSelected() {
    if (!report) return;
    setTasks((p) => {
      let next = [...p];
      report.recs.forEach((rec) => {
        if (selectedRecs.includes(rec.taskId)) {
          next = next.map((t) => t.id === rec.taskId ? { ...t, assignedTo: rec.toId, status: "assigned", statusChangedMin: now } : t);
          addAlert({ type: "rebalance", msg: `🔀 Reassigned [${rec.summary.slice(0,25)}] from ${rec.fromName} → ${rec.toName}` });
        }
      });
      return next;
    });
    setReport((r) => ({ ...r, recs: r.recs.filter((x) => !selectedRecs.includes(x.taskId)) }));
    setSelectedRecs([]);
  }

  function declineSelected() {
    if (!report) return;
    setReport((r) => ({ ...r, recs: r.recs.filter((x) => !selectedRecs.includes(x.taskId)) }));
    setSelectedRecs([]);
  }

  function advance(mins) {
    const t2 = now + mins;
    setTasks((prev) => {
      return prev.map((t) => {
        let updated = { ...t };
        if (updated.status === "awaiting_ack" && updated.ackDeadline && t2 > updated.ackDeadline) {
          updated.status = "unassigned";
          updated.escalations += 1;
          updated.ackDeadline = null;
          addAlert({ type: "critical", msg: `🚨 UNACKNOWLEDGED ESCALATION: Case for ${updated.member} breached fallback SLA. Supervisor intervention mandatory.`, taskId: updated.id });
        }
        if (["in_progress", "acked"].includes(updated.status) && ["critical", "high"].includes(updated.urgency)) {
          if (t2 - updated.statusChangedMin > 60 && updated.status !== "at_risk") {
            updated.status = "at_risk";
            updated.statusChangedMin = t2;
            addAlert({ type: "at_risk", msg: `⚠️ WATCHDOG WARNING: Task ${updated.id} locked "In Progress" > 60 mins. Escalating to Slack workspace.`, taskId: updated.id });
          }
        }
        return updated;
      });
    });
    setNow(t2);
  }

  function runReport() {
    const t2 = now + 60;
    setNow(t2);
    setTasks((prev) => { 
      const generatedReport = computeReport(prev, t2);
      setReport(generatedReport); 
      return prev; 
    });
    setSelectedRecs([]);
  }

  const activeCriticalAlerts = tasks.filter(t => t.status !== "done" && (t.status === "at_risk" || t.urgency === "critical"));
  const visibleTasks = tasks.filter(t => currentRole === "supervisor" ? true : t.assignedTo === currentRole);
  const auditLogs = tasks.filter(t => t.status === "done");

  return (
    <div style={{ background: c.bg, color: c.ink, minHeight: "100vh", ...body }}>
      
      {/* CRITICAL LIVE BANNER LAYER */}
      {activeCriticalAlerts.length > 0 && (
        <div style={{ background: c.red, color: "#fff" }} className="px-4 py-2 text-sm font-semibold animate-pulse shadow-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>🚨 ACTIVE CRITICAL RISK EVENT OUTSTANDING:</span>
            <span className="underline truncate max-w-xl">"{activeCriticalAlerts[0].member}: {activeCriticalAlerts[0].summary}"</span>
          </div>
          <Btn onClick={() => openResolutionModal(activeCriticalAlerts[0])} kind="primary">Resolve Immediate</Btn>
        </div>
      )}

      {/* HEADER BAR */}
      <header style={{ background: c.plum, color: "#fff" }} className="px-5 py-3 shadow-md">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ ...disp, fontSize: 20 }} className="font-semibold">Nadia Care · Operations Suite</div>
            <div style={{ color: c.plumSoft, fontSize: 11 }} className="uppercase tracking-wide font-medium">Bespoke Clinical Dispatch Console</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11 }} className="uppercase text-gray-300 font-bold">Workspace Identity:</span>
              <select 
                value={currentRole} 
                onChange={(e) => { setCurrentRole(e.target.value); setTab("workspace"); }}
                style={{ background: c.surfaceAlt, color: c.ink, fontSize: 12 }}
                className="rounded-lg p-1 font-semibold outline-none border"
              >
                <option value="supervisor">Console Supervisor View</option>
                {TEAM.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-black bg-opacity-20 p-1 rounded-lg">
              <span style={{ fontSize: 12 }} className="px-2 font-mono">母 {clock(now)}</span>
              <Btn onClick={() => advance(15)} kind="ghost">+15m</Btn>
              <Btn onClick={runReport} kind="ghost">Run Report Hour</Btn>
            </div>
          </div>
        </div>
      </header>

      {/* TABS CONTROLLER */}
      <div className="max-w-5xl mx-auto px-4 pt-4 flex gap-2">
        <button onClick={() => setTab("workspace")} style={{ background: tab === "workspace" ? c.surface : "transparent", borderColor: c.line, color: tab === "workspace" ? c.ink : c.inkSoft }} className="border rounded-t-xl px-5 py-2 font-bold text-sm transition-all">
          {currentRole === "supervisor" ? "Central Triage Queue" : "My Task Workspace"}
        </button>
        {currentRole === "supervisor" && (
          <button onClick={() => setTab("supervisor-panel")} style={{ background: tab === "supervisor-panel" ? c.surface : "transparent", borderColor: c.line, color: tab === "supervisor-panel" ? c.ink : c.inkSoft }} className="border rounded-t-xl px-5 py-2 font-bold text-sm transition-all">
            Supervisor Controls Console
          </button>
        )}
        <button onClick={() => setTab("audit-logs")} style={{ background: tab === "audit-logs" ? c.surface : "transparent", borderColor: c.line, color: tab === "audit-logs" ? c.ink : c.inkSoft }} className="border rounded-t-xl px-5 py-2 font-bold text-sm transition-all">
          Resolution Audit Logs ({auditLogs.length})
        </button>
      </div>

      {/* CORE FRAMEWORK STREAMS */}
      <main className="max-w-5xl mx-auto px-4 pb-12 mt-4">
        
        {tab === "workspace" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-1 flex flex-col gap-4">
              {currentRole === "supervisor" && (
                <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
                  <h2 style={{ ...disp, fontSize: 16 }} className="font-semibold mb-2">Simulate Athena EHR Triage</h2>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Simulate structured text feeds..." style={{ borderColor: c.line, background: c.surfaceAlt }} className="w-full text-sm rounded-xl p-3 outline-none resize-none" />
                  <div className="mt-2"><Btn onClick={intake} kind="primary" disabled={!text.trim()}>Triage & Deploy</Btn></div>
                </div>
              )}
              
              <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
                <h2 style={{ ...disp, fontSize: 16 }} className="font-semibold mb-2">Watchdog Logging Streams</h2>
                <div className="flex flex-col gap-2 max-h-96 overflow-auto">
                  {alerts.map((a) => (
                    <div key={a.id} style={{ background: a.type === "critical" || a.type === "at_risk" ? c.redSoft : c.surfaceAlt }} className="rounded-xl p-2.5 text-xs font-medium border border-transparent">
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span>{a.type.toUpperCase()} STATE</span>
                        <span className="text-gray-400">{clock(a.min)}</span>
                      </div>
                      <p className="text-gray-700">{a.msg}</p>
                    </div>
                  ))}
                  {alerts.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No active monitoring logs calculated.</p>}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <h2 style={{ ...disp, fontSize: 18 }} className="font-bold mb-3">
                {currentRole === "supervisor" ? "Active Operational Queue Master" : `Designated Workforce Sub-Queue`}
              </h2>
              <div className="flex flex-col gap-3">
                {visibleTasks.filter(t => t.status !== "done").map((t) => (
                  <div key={t.id} style={{ background: t.status === "at_risk" ? c.amberSoft : c.surface, borderColor: t.status === "at_risk" ? c.amber : c.line, borderLeftColor: URGENCY[t.urgency].color, borderLeftWidth: 5 }} className="border rounded-xl p-4 shadow-sm flex flex-col justify-between transition-all">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div>
                        <span className="font-bold text-sm block" style={{ color: c.ink }}>{t.member}</span>
                        <span className="text-xs text-gray-500">Arrived: {clock(t.createdMin)}</span>
                      </div>
                      <div className="flex gap-1.5 items-center">
                        {t.status === "at_risk" && <Chip label="STALLED CAUTION: >60m" color={c.red} soft={c.redSoft} small />}
                        <Chip label={URGENCY[t.urgency].label} color={URGENCY[t.urgency].color} soft={URGENCY[t.urgency].soft} small />
                        <Chip label={CATEGORY_LABEL[t.category]} color={c.plum} soft={c.plumSoft} small />
                      </div>
                    </div>
                    <p className="text-sm font-medium mb-4 bg-gray-50 p-2.5 rounded-lg border border-gray-100 font-mono" style={{ color: c.ink }}>“{t.summary}”</p>
                    <div className="flex justify-between items-center flex-wrap gap-2 pt-2 border-t border-gray-100">
                      <span className="text-xs font-semibold text-gray-500">
                        Roster Hold: <span className="font-bold" style={{ color: c.ink }}>{TEAM.find(m => m.id === t.assignedTo)?.name || "Unallocated"}</span> · State: <span className="uppercase text-xs font-mono font-bold bg-gray-200 px-1 rounded">{t.status}</span>
                      </span>
                      <div className="flex gap-2">
                        {t.status === "awaiting_ack" && <Btn onClick={() => changeStatus(t.id, "in_progress")} kind="ok">Acknowledge SLA</Btn>}
                        {t.status === "assigned" && <Btn onClick={() => changeStatus(t.id, "in_progress")} kind="primary">Mark Active (In Progress)</Btn>}
                        {["in_progress", "at_risk", "assigned"].includes(t.status) && <Btn onClick={() => openResolutionModal(t)} kind="primary">Resolve Task</Btn>}
                      </div>
                    </div>
                  </div>
                ))}
                {visibleTasks.filter(t => t.status !== "done").length === 0 && (
                  <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                    <p className="text-sm text-gray-400 font-medium">All tasks cleared inside this specified filter scope.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CONTROLS CONSOLE CRASH-PROTECTED GRID */}
        {tab === "supervisor-panel" && currentRole === "supervisor" && (
          <div className="flex flex-col gap-4">
            {!report || !report.recs ? (
              <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-8 text-center shadow-sm">
                <p className="text-sm text-gray-500 mb-3">No operational telemetry models built. Run the report interval simulator.</p>
                <Btn onClick={runReport} kind="primary">Compute Hourly Balance Matrix</Btn>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h3 style={{ ...disp, fontSize: 16 }} className="font-bold">System Optimization Routing Orders</h3>
                    <div className="flex gap-2">
                      <Btn onClick={acceptSelected} kind="ok" disabled={selectedRecs.length === 0}>Accept Selected Updates</Btn>
                      <Btn onClick={declineSelected} disabled={selectedRecs.length === 0}>Decline Selected</Btn>
                      <Btn onClick={clearChecked} disabled={selectedRecs.length === 0}>Clear Checked</Btn>
                    </div>
                  </div>
                  {report.recs.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center border rounded-xl border-dashed">Operational workload balance healthy. No automated adjustments requested.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {report.recs.map((r) => (
                        <div key={r.taskId} className="bg-gray-50 border rounded-xl p-3 flex items-start gap-3 hover:bg-gray-100 transition-colors">
                          <input 
                            type="checkbox" 
                            checked={selectedRecs.includes(r.taskId)} 
                            onChange={() => toggleSelection(r.taskId)} 
                            style={{ width: 16, height: 16, marginTop: 4, cursor: "pointer" }}
                          />
                          <div className="flex-1 text-xs">
                            <div className="flex justify-between items-center font-bold text-sm mb-1">
                              <span>Reallocate: {r.fromName} ➔ {r.toName}</span>
                              <Chip label={URGENCY[r.urgency].label} color={URGENCY[r.urgency].color} soft={URGENCY[r.urgency].soft} small />
                            </div>
                            <p className="text-gray-600 bg-white p-2 rounded border border-gray-200 font-mono text-xs my-1">"{r.summary}"</p>
                            <p className="text-gray-500 font-medium">Telemetry Rationale: {r.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
                  <h3 style={{ ...disp, fontSize: 16 }} className="font-bold mb-3">Workforce Heatmap Load Capacity Thresholds</h3>
                  <div className="flex flex-col gap-3">
                    {report.perMember.map(m => (
                      <div key={m.id} className="flex items-center gap-4 text-sm font-semibold">
                        <span className="w-24 truncate">{m.name}</span>
                        <div className="flex-1 bg-gray-200 h-3 rounded-full overflow-hidden">
                          <div style={{ width: `${Math.min(100, m.load * 12)}%`, background: m.load > 6 ? c.red : c.teal }} className="h-full transition-all" />
                        </div>
                        <span className="w-16 text-right text-xs font-mono font-bold bg-gray-100 p-1 rounded">Weight: {m.load}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* COMPLIANCE AUDIT LOG SHEET */}
        {tab === "audit-logs" && (
          <div style={{ background: c.surface, borderColor: c.line }} className="border rounded-2xl p-4 shadow-sm">
            <h2 style={{ ...disp, fontSize: 18 }} className="font-bold mb-3">Clinical Operations Resolution Records</h2>
            <div className="flex flex-col gap-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-medium">
                  <div className="flex justify-between items-start gap-2 border-b pb-2 mb-2">
                    <div>
                      <span className="font-bold text-sm text-gray-900 block">Committed File: {log.member}</span>
                      <span className="text-gray-400 font-mono">Index Hash Key ID: {log.id}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-gray-800 block">Operator Identity: {log.resolvedBy}</span>
                      <span className="text-gray-400 font-mono">Timestamp Ledger: Minute {clock(log.resolvedAtMin)}</span>
                    </div>
                  </div>
                  <div className="mb-2">
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[10px] mb-0.5">Primary Intake Message Payload:</span>
                    <p className="text-gray-700 bg-white p-2 rounded border font-mono">“{log.summary}”</p>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase tracking-wider text-[10px] mb-0.5">Enforced Clinical Progress Notes Documentation:</span>
                    <p className="text-gray-900 bg-emerald-50 border border-emerald-100 p-2.5 rounded font-mono text-sm">✓ {log.resolutionNotes}</p>
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No matching documentation entries saved to data models yet.</p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* COMPLIANCE LOCK MODAL POPUP */}
      {resolvingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div style={{ background: c.surface }} className="rounded-2xl max-w-lg w-full p-6 shadow-2xl border flex flex-col gap-4">
            <div>
              <h3 style={{ ...disp, fontSize: 18 }} className="font-bold text-gray-900 mb-1">Enforced Resolution Clinical Summary Log</h3>
              <p className="text-xs text-gray-500 font-medium">Compliance guidelines require diagnostic outcome validation notes before an unassigned or routed emergency issue model is finalized.</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-xl border font-mono text-xs text-gray-700">
              <span className="font-bold block text-gray-900 mb-1">Target Account: {resolvingTask.member}</span>
              “{resolvingTask.summary}”
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Resolution Operational Log Notes:</label>
              <textarea 
                value={resolutionNotes} 
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={4} 
                placeholder="Detail resolution path parameters, outcome indicators, or referral logging..." 
                className="w-full text-sm rounded-xl p-3 border outline-none font-mono focus:border-purple-500"
              />
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