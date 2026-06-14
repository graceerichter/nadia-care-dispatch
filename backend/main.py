"""FastAPI app for Nadia Care dispatch.

Thin wrapper over triage.py and dispatch.py. The endpoints are stateless: the
frontend holds the working queue and sends it in for /assign and /report. In a
real deployment, swap that for ClickUp as the system of record.

Run locally:  uvicorn main:app --reload
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import dispatch
import triage as triage_mod

app = FastAPI(title="Nadia Care Dispatch")

# allow the Vite dev server (and your deployed frontend) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your frontend's domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

class AthenaADTPayload(BaseModel):
    patient_name: str
    event_type: str
    facility: str
    notes: str
    now: int = 480

class TriageIn(BaseModel):
    text: str


class AssignIn(BaseModel):
    task: dispatch.Task
    tasks: list[dispatch.Task] = []
    now: int = 540


class TickIn(BaseModel):
    tasks: list[dispatch.Task]
    now: int


class ReportIn(BaseModel):
    tasks: list[dispatch.Task]
    now: int


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/team")
def team():
    return dispatch.TEAM


@app.post("/api/triage")
async def post_triage(body: TriageIn):
    return await triage_mod.triage(body.text)


@app.post("/api/assign")
def post_assign(body: AssignIn):
    """Pick the best-fit person for a task given the current queue."""
    person = dispatch.best_assignee(body.task, body.tasks, body.now)
    if not person:
        return {"assigned_to": None, "rationale": "No eligible person on shift; needs supervisor."}
    return {
        "assigned_to": person.id,
        "name": person.name,
        "rationale": (f"{person.name} ({person.role}) chosen: eligible, on shift, "
                      f"current load {dispatch.load_of(person.id, body.tasks)}."),
    }


@app.post("/api/tick")
def post_tick(body: TickIn):
    """Advance the clock: run the ack-or-escalate sweep and return updated tasks."""
    tasks = [t.model_copy(deep=True) for t in body.tasks]
    log = dispatch.escalation_sweep(tasks, body.now)
    return {"tasks": tasks, "log": log}


@app.post("/api/report")
def post_report(body: ReportIn):
    return dispatch.compute_report(body.tasks, body.now)
@app.post("/api/webhooks/athena/adt")
def athena_adt_webhook(payload: AthenaADTPayload):
    """
    Ingests mock HL7 ADT feeds from Athena EHR.
    Converts the structured machine payload directly into a dispatch task.
    """
    # 1. Parse the incoming EHR payload into a standard Task
    new_task = dispatch.parse_adt_to_task(
        patient_name=payload.patient_name,
        event_type=payload.event_type,
        notes=f"Facility: {payload.facility}. {payload.notes}",
        current_min=payload.now
    )

    # 2. Return the task so the frontend or system of record can ingest it
    return {
        "status": "success",
        "source": "Athena EHR Webhook",
        "task": new_task.model_dump()
    }