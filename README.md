# Nadia Care · Dispatch

A capacity-aware task-routing prototype for a maternal-health care team:
intake → deterministic triage → auto-assignment by role / availability / weighted load →
critical-task alert with ack-or-escalate → supervisor view with an hourly
report that *recommends* reassignments for a human to approve.

```
nadia-care-dispatch/
├── backend/            FastAPI + the assignment / escalation / report logic (Python)
│   ├── main.py         HTTP endpoints (thin)
│   ├── dispatch.py     models + the real logic (pure, testable)
│   ├── triage.py       deterministic keyword classifier + LLM-ready interface
│   └── tests/          pytest
└── frontend/           React (Vite) console UI
```

---

## Product Brief

### Problem statement

Maternal health care teams — navigators, midwives, coordinators — manage a high
volume of incoming tasks with uneven urgency. Without a structured routing
system, critical tasks (hemorrhage alerts, unresponsive patients) compete for
attention alongside routine ones (appointment reminders, document uploads). The
result: delayed response to time-sensitive cases, unbalanced workloads, and no
audit trail for supervisors.

### Target users

| Role | Primary need |
|------|-------------|
| Care navigator | See only tasks assigned to me, acknowledge or escalate |
| Charge nurse / lead | Real-time view of unacknowledged critical tasks |
| Supervisor | Workload balance across the team; approve reassignments |
| Operations / PM | Understand bottlenecks, escalation patterns, SLA adherence |

### MVP goal

Demonstrate that a rules-based routing engine — with acuity-weighted load
balancing and a human-in-the-loop escalation path — can meaningfully reduce
time-to-acknowledgement for critical tasks without automating away clinical
judgment.

### Success metrics

| Metric | Target |
|--------|--------|
| % critical tasks acknowledged within 10 min | ≥ 95% |
| Average time from intake to assignment | < 2 min |
| Overdue high-priority tasks at any given time | < 5% of open queue |
| Workload coefficient of variation across navigators | < 0.25 (balanced) |
| Escalation rate (critical tasks reaching supervisor) | Tracked; baseline TBD |
| Supervisor-approved reassignment rate | Tracked; signals rule accuracy |

### Key product decisions

**Acuity-weighted load, not task count.** A navigator with two critical tasks
is not equivalent to one with ten routine ones. Load is scored as critical 5 /
high 3 / routine 1 to reflect clinical reality.

**Rebalancing recommends, never auto-moves.** The system surfaces reassignment
suggestions; a supervisor approves them. This keeps a human accountable for
care continuity decisions — a non-negotiable in a clinical context.

**Deterministic triage as the safe default.** The current prototype classifies
tasks by keyword matching. This is intentional for an offline/demo context: no
API dependency, fully auditable, no hallucination risk. The interface is
designed so the classifier can be swapped for an LLM in production (see
[Architecture](#architecture-in-one-breath)).

**In-office + seniority gate for critical tasks.** Critical tasks require an
in-office, senior/lead/manager-level assignee. This encodes a real clinical
constraint: critical escalations should not go to a remote or junior navigator
without a fallback path.

### Future roadmap

| Phase | Capability | Rationale |
|-------|-----------|-----------|
| 1 | Replace deterministic triage with LLM classifier (Anthropic) with human-review threshold | Higher accuracy on ambiguous intake text; safety threshold keeps a human in the loop for low-confidence classifications |
| 2 | Google Calendar free/busy integration | Real availability data replaces simulated `in_office` / `busy_until` |
| 3 | Slack Block Kit alerts | Meets navigators where they work; button-based ack replaces in-app UI |
| 4 | ClickUp as system of record | Durable task store; audit log; integrates with existing ops tooling |
| 5 | A/B test routing rules | Compare keyword triage vs. LLM triage on acknowledgement latency and escalation rate |
| 6 | Supervisor analytics dashboard | Tableau / Sigma layer on top of SQL metrics; track SLA trends over time |

---

## Architecture, in one breath

The browser never holds the Anthropic API key. The frontend calls
`POST /api/triage` on the backend; the backend calls the classifier; the key
stays in a server-side environment variable. The assignment, escalation, and
reporting logic lives in `backend/dispatch.py` as pure Python with tests — that
is the production home for it. (The React app also mirrors the logic
client-side so the demo runs instantly and survives the backend being offline;
when you productionize, the frontend should defer to the backend.)

**On AI/LLM usage:** The current prototype uses deterministic triage rules as a
safe offline stand-in. Keywords in the task description map to urgency levels
(critical / high / routine) without any external API call. In production, this
classifier could be replaced or augmented by an LLM (e.g. `claude-sonnet-4-6`)
with a confidence threshold: high-confidence classifications route automatically,
low-confidence ones surface to a human reviewer before assignment. This design
keeps the AI story honest — AI fluency means knowing when *not* to call the
model, not just when to.

---

## Run it in VS Code

Open the folder in VS Code (`File → Open Folder`). Use two integrated terminals
(`Terminal → New Terminal`, then the split button).

**Terminal 1 — backend**
```bash
cd backend
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows:
# .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then paste your ANTHROPIC_API_KEY into .env
uvicorn main:app --reload   # serves http://localhost:8000
```
Without a key the triage endpoint still works — it falls back to the offline
classifier.

**Terminal 2 — frontend**
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev                 # serves http://localhost:5173
```
Open http://localhost:5173.

**Run the tests**
```bash
cd backend && pytest
```

---

## Publish it (from VS Code)

1. **Version control.** In VS Code's Source Control panel: *Initialize
   Repository* → *Commit* → *Publish to GitHub*. The `.gitignore` already keeps
   `.env` and `node_modules` out of the repo. Never commit your key.
2. **Deploy the backend** to a host that runs Python web services (Render,
   Railway, Fly.io). Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
   Set `ANTHROPIC_API_KEY` as an environment variable in the host's dashboard.
3. **Deploy the frontend** to a static host (Vercel, Netlify, Cloudflare Pages).
   Build command `npm run build`, output dir `dist`. Set `VITE_API_BASE` to your
   deployed backend URL.
4. **Lock down CORS.** In `backend/main.py`, change `allow_origins=["*"]` to your
   deployed frontend's domain.

---

## What's simulated vs. real

Simulated for the demo, with the production target noted:

| In the prototype            | In production            |
|-----------------------------|--------------------------|
| roster `in_office` + `busy_until` | Google Calendar free/busy |
| in-app alert + "I've got it" button | Slack Block Kit message + button |
| in-memory task list         | ClickUp as system of record |
| sim clock (+15m / hourly)   | a real scheduler (cron / a worker) |
| deterministic keyword triage | LLM classifier with confidence threshold + human review |

---

## Analytics reference

The following queries are written for PostgreSQL. Column names assume a
`tasks` table with the schema implied by `dispatch.py`.

```sql
-- Open tasks by urgency
SELECT urgency, COUNT(*) AS open_count
FROM tasks
WHERE status != 'closed'
GROUP BY urgency
ORDER BY CASE urgency
  WHEN 'critical' THEN 1
  WHEN 'high'     THEN 2
  WHEN 'routine'  THEN 3
END;

-- Average time from intake to first assignment (minutes)
SELECT
  urgency,
  ROUND(AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60)::numeric, 1)
    AS avg_minutes_to_assign
FROM tasks
WHERE assigned_at IS NOT NULL
GROUP BY urgency
ORDER BY 1;

-- Workload by navigator (acuity-weighted load score)
SELECT
  assignee_id,
  SUM(CASE urgency
    WHEN 'critical' THEN 5
    WHEN 'high'     THEN 3
    ELSE 1
  END) AS weighted_load,
  COUNT(*) AS task_count
FROM tasks
WHERE status = 'open'
GROUP BY assignee_id
ORDER BY weighted_load DESC;

-- Unresolved critical tasks older than 10 minutes
SELECT id, title, created_at, assignee_id, acknowledged_at
FROM tasks
WHERE urgency = 'critical'
  AND status != 'closed'
  AND acknowledged_at IS NULL
  AND created_at < NOW() - INTERVAL '10 minutes'
ORDER BY created_at ASC;
```

---

## Notes for reviewers

- **Load is acuity-weighted** (critical 5 / high 3 / routine 1), not a task
  count — see `dispatch.load_of`.
- **Rebalancing recommends, never auto-moves** — `dispatch._recommend_rebalance`
  produces suggestions a supervisor approves.
- **"Done before EOD" = flag at-risk + escalate**, the honest version of that
  promise. The ack-or-escalate loop is the patient-safety story.
- Demo uses pseudonymous member data only. Real PHI would require HIPAA controls
  (BAA, encryption, audit logging) before this touched a production system.