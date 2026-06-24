from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import datetime
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Nadia Care Maternal Navigation Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEAM = [
    {"id": "sup1", "name": "Elena R.", "role": "Maternity Navigator Supervisor"},
    {"id": "sr1", "name": "Sarah K.", "role": "Senior Maternity Navigator"},
    {"id": "sr2", "name": "Michael T.", "role": "Senior Maternity Navigator"},
    {"id": "nav1", "name": "Aisha K.", "role": "Maternity Navigator"},
    {"id": "nav2", "name": "Sofia L.", "role": "Maternity Navigator"},
    {"id": "nav3", "name": "Jordan P.", "role": "Maternity Navigator"},
    {"id": "nav4", "name": "Priya M.", "role": "Maternity Navigator"},
    {"id": "nav5", "name": "Carlos D.", "role": "Maternity Navigator"},
    {"id": "nav6", "name": "Faith W.", "role": "Maternity Navigator"},
]

# Shared Global System Simulation State
SYSTEM_CLOCK = {"current_minute": 540}  # Starts at 9:00 AM (540 minutes)

# EXPANDED DATA CONTRACT SCHEMA: Hardcoding taxonomy objects straight into database objects
class InboundPayload(BaseModel):
    source: str  # athena_ehr, spruce_health, hubspot_crm
    text: str

class TransferRequest(BaseModel):
    target_queue_id: str
    authorized_by: str

class ResolutionRequest(BaseModel):
    resolved_by: str
    notes: str

class TickRequest(BaseModel):
    minutes: int

class TaskModel(BaseModel):
    id: int
    member: str
    source: str
    category: str
    urgency: str
    summary: str
    assignedTo: str
    status: str
    createdMin: int
    resolutionNotes: Optional[str] = ""
    resolvedBy: Optional[str] = None
    externalTransferLog: Optional[dict] = None
    # MULTI-DIMENSIONAL TAGS CONSTRAINTS
    market: str        # GA, TX, FL
    lifecycle: str     # first_trimester, second_trimester, third_trimester, postpartum
    payer: str         # medicaid, commercial

TASKS_DB: List[TaskModel] = []
SEED_COUNTER = 100

@app.get("/api/team")
def get_maternity_roster():
    return TEAM

# FIRES BOTH: Acts as a clean fallback for standard queue fetches and report analytics checks
@app.get("/api/report")
@app.get("/api/tasks")
def get_active_queue(role: Optional[str] = "supervisor"):
    if role == "supervisor":
        return TASKS_DB
    return [t for t in TASKS_DB if t.assignedTo == role]

# ALIGNED GATEWAY: Intercepts Athena EHR webhooks sent from the React intake form
@app.post("/api/webhooks/athena/adt")
@app.post("/api/webhooks/intake")
def handle_webhook_intake(payload: InboundPayload):
    global SEED_COUNTER
    SEED_COUNTER += 1
    
    t = payload.text.lower()
    
    # 1. Base Classifications Vector
    cat = "care_navigation"
    urg = "routine"
    if any(x in t for x in ["kill", "hurt", "depression", "panicking", "overwhelmed"]):
        cat = "behavioral_health"
        urg = "critical" if ("kill" in t or "hurt" in t) else "high"
    elif any(x in t for x in ["bleed", "blood", "pain", "fever", "cramping"]):
        cat = "clinical_concern"
        urg = "critical" if ("heavy" in t or "severe" in t) else "high"
    elif any(x in t for x in ["ride", "transport", "bus", "car"]):
        cat = "transportation"
        urg = "high"
    elif any(x in t for x in ["food", "hungry", "wic", "formula", "groceries"]):
        cat = "nutrition"
        urg = "high"
    elif any(x in t for x in ["eviction", "landlord", "rent", "housing", "electricity", "utility"]):
        cat = "housing"
        urg = "high"

    # 2. DETECTING NEW TAXONOMY STRINGS (Simulating Natural Language Parsing)
    market_tag = "GA"
    if any(x in t for x in ["texas", "houston", "austin", "tx"]): market_tag = "TX"
    elif any(x in t for x in ["florida", "miami", "fl"]): market_tag = "FL"

    lifecycle_tag = "second_trimester"
    if any(x in t for x in ["weeks", " trimester", "pregnant"]):
        if any(x in t for x in ["35", "36", "37", "38", "39", "40", "third"]): lifecycle_tag = "third_trimester"
        elif any(x in t for x in ["8", "10", "12", "first"]): lifecycle_tag = "first_trimester"
    elif any(x in t for x in ["born", "delivered", "baby here", "postpartum", "days old"]):
        lifecycle_tag = "postpartum"

    payer_tag = "commercial"
    if any(x in t for x in ["medicaid", "careplan", "state insurance"]):
        payer_tag = "medicaid"

    # 3. Dynamic Capacity Balancer
    navigators = [m["id"] for m in TEAM if m["id"].startswith("nav")]
    load_map = {nav_id: 0 for nav_id in navigators}
    for task in TASKS_DB:
        if task.status in ["assigned", "in_progress", "awaiting_ack"] and task.assignedTo in load_map:
            load_map[task.assignedTo] += 1
    best_assignee = min(load_map, key=load_map.get) if navigators else "nav1"

    new_task = TaskModel(
        id=int(datetime.datetime.now().timestamp()),
        member=f"Member #{4900 + (SEED_COUNTER % 90)}",
        source=payload.source,
        category=cat,
        urgency=urg,
        summary=payload.text,
        assignedTo=best_assignee,
        status="awaiting_ack" if urg == "critical" else "assigned",
        createdMin=SYSTEM_CLOCK["current_minute"],
        market=market_tag,
        lifecycle=lifecycle_tag,
        payer=payer_tag
    )
    TASKS_DB.insert(0, new_task)
    return {"status": "success", "allocated_to": best_assignee, "task": new_task}

# SYSTEM TIME SIMULATION TASK WATCHDOG PIPELINE
@app.post("/api/tick")
def process_system_time_step(req: TickRequest):
    SYSTEM_CLOCK["current_minute"] += req.minutes
    
    # Iterate open alerts and evaluate response thresholds
    for task in TASKS_DB:
        if task.status == "awaiting_ack" and task.urgency == "critical":
            elapsed_time = SYSTEM_CLOCK["current_minute"] - task.createdMin
            if elapsed_time > 10:
                task.status = "at_risk"
                
    return {"status": "clock_updated", "current_minute": SYSTEM_CLOCK["current_minute"]}

@app.post("/api/tasks/{task_id}/transfer")
def transfer_task_to_external_queue(task_id: int, req: TransferRequest):
    for task in TASKS_DB:
        if task.id == task_id:
            task.status = "transferred"
            task.externalTransferLog = {
                "transferredTo": req.target_queue_id,
                "transferredBy": req.authorized_by,
                "transferredAtMin": SYSTEM_CLOCK["current_minute"]
            }
            return {"status": "transferred", "task": task}
    raise HTTPException(status_code=404, detail="Task record parameter token not found")

@app.post("/api/tasks/{task_id}/resolve")
def resolve_maternity_task(task_id: int, req: ResolutionRequest):
    for task in TASKS_DB:
        if task.id == task_id:
            task.status = "done"
            task.resolvedBy = req.resolved_by
            task.resolutionNotes = req.notes
            return {"status": "resolved", "task": task}
    raise HTTPException(status_code=404, detail="Task reference id not located")