# Nadia Care · Dispatch

Video Walkthrough: https://drive.google.com/file/d/1HqI_RgvwasrVIdfKPGidR4N-xJUdyoZ3/view?usp=sharing

A capacity-aware task-routing prototype for a maternal-health care team:
intake → AI triage → auto-assignment by role / availability / weighted load →
critical-task alert with ack-or-escalate → supervisor view with an hourly
report that *recommends* reassignments for a human to approve.

```
nadia-care-dispatch/
├── backend/            FastAPI + the assignment / escalation / report logic (Python)
│   ├── main.py         HTTP endpoints (thin)
│   ├── dispatch.py     models + the real logic (pure, testable)
│   ├── triage.py       Anthropic proxy (key server-side) + offline fallback
│   └── tests/          pytest
└── frontend/           React (Vite) console UI
```

## Architecture, in one breath

The browser never holds the Anthropic API key. The frontend calls
`POST /api/triage` on the backend, the backend calls Anthropic, the key stays
in a server-side environment variable. The assignment, escalation, and
reporting logic lives in `backend/dispatch.py` as pure Python with tests — that
is the production home for it. (The React app also mirrors the logic
client-side so the demo runs instantly and survives the backend being offline;
when you productionize, the frontend should defer to the backend.)

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

## What's simulated vs. real

Simulated for the demo, with the production target noted:

| In the prototype            | In production            |
|-----------------------------|--------------------------|
| roster `in_office` + `busy_until` | Google Calendar free/busy |
| in-app alert + "I've got it" button | Slack Block Kit message + button |
| in-memory task list         | ClickUp as system of record |
| sim clock (+15m / hourly)   | a real scheduler (cron / a worker) |

## Notes for reviewers

- **Load is acuity-weighted** (critical 5 / high 3 / routine 1), not a task
  count — see `dispatch.load_of`.
- **Rebalancing recommends, never auto-moves** — `dispatch._recommend_rebalance`
  produces suggestions a supervisor approves.
- **"Done before EOD" = flag at-risk + escalate**, the honest version of that
  promise. The ack-or-escalate loop is the patient-safety story.
- Demo uses pseudonymous member data only. Real PHI would require HIPAA controls
  (BAA, encryption, audit logging) before this touched a production system.
