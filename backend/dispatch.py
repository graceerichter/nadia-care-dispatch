"""Core dispatch logic for Nadia Care.

This is the canonical, server-side home for the assignment, escalation, and
reporting logic. It is pure Python (no FastAPI imports) so it is easy to unit
test and reuse. The FastAPI layer in main.py is a thin wrapper over these
functions.

KEY DECISIONS (the product judgment, not just code):
- "load" is the sum of acuity WEIGHTS (critical 5 / high 3 / routine 1), not a
  raw task count. Three routine follow-ups != one active escalation.
- rebalancing RECOMMENDS moves for a supervisor to approve; it never silently
  reassigns work out from under someone mid-case.
- "handle everything before EOD" is implemented as flag-at-risk + escalate, the
  honest version of a promise software can't otherwise guarantee.
"""
from __future__ import annotations

import random
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

# --- configuration ---------------------------------------------------------

URGENCY = {
    "critical": {"weight": 5, "rank": 0, "sla_cap": 1},
    "high": {"weight": 3, "rank": 1, "sla_cap": 8},
    "routine": {"weight": 1, "rank": 2, "sla_cap": float("inf")},
}

ACK_WINDOW = 10  # minutes to acknowledge a critical task before it escalates
ACTIVE_STATUSES = {"assigned", "awaiting_ack", "acked", "in_progress", "at_risk"}

# --- models ----------------------------------------------------------------

class Task(BaseModel):
    id: int
    member: str = "Member"          
    source: str
    category: str
    urgency: str
    summary: str = ""
    assignedTo: str
    status: str = "assigned"
    createdMin: int = 540
    resolutionNotes: Optional[str] = ""
    resolvedBy: Optional[str] = None
    externalTransferLog: Optional[Dict[str, Any]] = None
    
    # MULTI-DIMENSIONAL COGNITIVE TAGS
    market: str        # GA, TX, FL
    lifecycle: str     # first_trimester, second_trimester, third_trimester, postpartum
    payer: str         # medicaid, commercial

    @property
    def weight(self) -> int:
        return URGENCY.get(self.urgency, {"weight": 1})["weight"]


class Recommendation(BaseModel):
    taskId: int
    summary: str
    urgency: str
    fromId: str
    fromName: str
    toId: str
    toName: str
    reason: str


# --- logic -----------------------------------------------------------------

def load_of(member_id: str, tasks: List[Task]) -> int:
    """Acuity-weighted open load for one person."""
    return sum(
        t.weight for t in tasks
        if t.assignedTo == member_id and t.status in ACTIVE_STATUSES
    )


def best_assignee(tasks: List[Task], team: List[Dict[str, Any]]) -> str:
    """Calculates optimal queue balancing targets based on operational loads."""
    navigators = [m["id"] for m in team if m["id"].startswith("nav")]
    if not navigators:
        return "nav1"
        
    load_map = {nav_id: load_of(nav_id, tasks) for nav_id in navigators}
    return min(load_map, key=load_map.get)


def escalation_sweep(tasks: List[Task], now: int, team: List[Dict[str, Any]]) -> List[str]:
    """Reassign any critical task that wasn't acknowledged in time."""
    log: List[str] = []
    by_id = {m["id"]: m for m in team}
    
    for t in tasks:
        if t.status == "awaiting_ack" and t.urgency == "critical":
            elapsed_time = now - t.createdMin
            if elapsed_time > ACK_WINDOW:
                prev_id = t.assignedTo
                prev_name = by_id.get(prev_id, {}).get("name", prev_id)
                
                # Reassign to the least loaded navigator aside from current if possible
                navigators = [m["id"] for m in team if m["id"].startswith("nav") and m["id"] != prev_id]
                if not navigators:
                    navigators = [m["id"] for m in team if m["id"].startswith("nav")]
                    
                if navigators:
                    load_map = {nav_id: load_of(nav_id, tasks) for nav_id in navigators}
                    nxt_id = min(load_map, key=load_map.get)
                    nxt_name = by_id.get(nxt_id, {}).get("name", nxt_id)
                    
                    t.assignedTo = nxt_id
                    t.status = "at_risk"  # Mark as visible system escalation hazard
                    log.append(f"{prev_name} did not ack critical case in time -> escalated to {nxt_name}.")
    return log


def generate_rebalance_suggestions(tasks: List[Task], team: List[Dict[str, Any]]) -> List[Recommendation]:
    """Suggest moving tasks off overloaded navigators onto underloaded ones."""
    navs = [m for m in team if m["id"].startswith("nav")]
    if not navs:
        return []
        
    sim = {m["id"]: load_of(m["id"], tasks) for m in navs}
    avg = sum(sim.values()) / len(sim)
    by_id = {m["id"]: m for m in navs}
    recs: List[Recommendation] = []

    # Identify overloaded members (thresholding deviation limits)
    overloaded = [m for m in navs if sim[m["id"]] > max(4, avg * 1.5)]
    
    for over in overloaded:
        movable = [t for t in tasks if t.assignedTo == over["id"] 
                   and t.status == "assigned" and t.urgency != "critical"]
                   
        for t in movable:
            if sim[over["id"]] <= avg or len(recs) >= 3:
                break
                
            targets = sorted(
                [m for m in navs if m["id"] != over["id"] and sim[m["id"]] < avg],
                key=lambda m: sim[m["id"]],
            )
            if not targets:
                break
                
            tgt = targets[0]
            recs.append(Recommendation(
                taskId=t.id,
                summary=t.summary,
                urgency=t.urgency,
                fromId=over["id"],
                fromName=over["name"],
                toId=tgt["id"],
                toName=tgt["name"],
                reason=f"{over['name']} load is high ({sim[over['id']]}); shift processing target to {tgt['name']} ({sim[tgt['id']]})."
            ))
            sim[over["id"]] -= t.weight
            sim[tgt["id"]] += t.weight
            
    return recs


def parse_adt_to_task(patient_name: str, event_type: str, notes: str, current_min: int, source: str = "athena_ehr") -> Task:
    """Translates incoming structural interface events directly into data storage contracts."""
    event_lower = event_type.lower()
    
    if event_lower in ["a03", "discharge"]:
        category = "care_navigation"
        urgency = "high"
        summary = f"EHR ALERT (Discharge): {notes}. Requires 48hr follow-up."
    elif event_lower in ["a01", "admit"]:
        category = "clinical_concern"
        urgency = "critical"
        summary = f"EHR ALERT (Admission): {notes}."
    else:
        category = "care_navigation"
        urgency = "routine"
        summary = f"EHR Update ({event_type}): {notes}"

    # Extracting standard demo data profiles
    notes_lower = notes.lower()
    market_tag = "GA"
    if any(x in notes_lower for x in ["texas", "houston", "austin", "tx"]): market_tag = "TX"
    elif any(x in notes_lower for x in ["florida", "miami", "fl"]): market_tag = "FL"

    lifecycle_tag = "second_trimester"
    if any(x in notes_lower for x in ["born", "delivered", "baby here", "postpartum", "days old"]):
        lifecycle_tag = "postpartum"

    payer_tag = "commercial"
    if "medicaid" in notes_lower or "state insurance" in notes_lower:
        payer_tag = "medicaid"

    return Task(
        id=int(random.randint(100000, 999999)),
        member=patient_name,
        source=source,
        category=category,
        urgency=urgency,
        summary=summary,
        assignedTo="nav1",  # Placeholder; assigned cleanly via balancing wrapper
        status="awaiting_ack" if urgency == "critical" else "assigned",
        createdMin=current_min,
        market=market_tag,
        lifecycle=lifecycle_tag,
        payer=payer_tag
    )