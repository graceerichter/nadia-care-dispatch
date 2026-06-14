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

from typing import Optional
from pydantic import BaseModel, Field

# --- configuration ---------------------------------------------------------

URGENCY = {
    "critical": {"weight": 5, "rank": 0, "sla_cap": 1},
    "high": {"weight": 3, "rank": 1, "sla_cap": 8},
    "routine": {"weight": 1, "rank": 2, "sla_cap": float("inf")},
}

# which team roles may take which need category
ELIGIBLE_ROLES = {
    "clinical_concern": ["RN"],
    "behavioral_health": ["Behavioral Health"],
    "lactation": ["Lactation", "Navigator"],
    "housing": ["Navigator"],
    "transportation": ["Navigator"],
    "nutrition": ["Navigator"],
    "doula": ["Navigator"],
    "care_navigation": ["Navigator"],
    "benefits": ["Navigator"],
}

# target SLA in hours by category
ROUTING_RULES = {
    "clinical_concern": 0.5, "behavioral_health": 4, "housing": 24,
    "transportation": 48, "nutrition": 72, "lactation": 48, "doula": 48,
    "care_navigation": 72, "benefits": 72,
}

ACK_WINDOW = 10  # minutes to acknowledge a critical task before it escalates
ACTIVE_STATUSES = {"assigned", "awaiting_ack", "acked", "in_progress"}


# --- models ----------------------------------------------------------------

class TeamMember(BaseModel):
    id: str
    name: str
    role: str
    seniority: str = "standard"     # "junior", "standard", "lead", "manager"
    languages: list[str] = ["English"]
    in_office: bool = True
    busy_until: int = 480


class Task(BaseModel):
    id: int
    member: str = "Member"          
    category: str
    urgency: str
    emergency: bool = False
    required_language: str = "English"  # Used for cultural/demographic matching
    summary: str = ""
    assigned_to: Optional[str] = None
    status: str = "unassigned"
    created_min: int = 480
    escalations: int = 0
    ack_deadline: Optional[int] = None

    @property
    def weight(self) -> int:
        return URGENCY[self.urgency]["weight"]

    def due_min(self) -> float:
        return self.created_min + ROUTING_RULES.get(self.category, 72) * 60


class Recommendation(BaseModel):
    task_id: int
    summary: str
    urgency: str
    from_id: str
    from_name: str
    to_id: str
    to_name: str
    reason: str


class HourlyReport(BaseModel):
    time: int
    open_by_urgency: dict
    handled_pct: int
    at_risk: list
    per_member: list
    recommendations: list[Recommendation]
    escalations: int


# the canonical roster (config; in production this comes from your HR / on-call
# system, with busy_until populated from Google Calendar free/busy)
TEAM: list[TeamMember] = [
    TeamMember(id="rn1", name="Priya R.", role="RN", seniority="lead", languages=["English", "Hindi"], in_office=True, busy_until=480),
    TeamMember(id="bh1", name="Marcus T.", role="Behavioral Health", seniority="manager", languages=["English"], in_office=True, busy_until=540),
    TeamMember(id="lc1", name="Dana W.", role="Lactation", seniority="standard", languages=["English", "Spanish"], in_office=False, busy_until=480),
    TeamMember(id="nv1", name="Aisha K.", role="Navigator", seniority="standard", languages=["English"], in_office=True, busy_until=480),
    TeamMember(id="nv2", name="Sofia L.", role="Navigator", seniority="lead", languages=["English", "Spanish"], in_office=True, busy_until=600),
    TeamMember(id="nv3", name="Jordan P.", role="Navigator", seniority="junior", languages=["English"], in_office=True, busy_until=480),
]


# --- logic -----------------------------------------------------------------

def load_of(member_id: str, tasks: list[Task]) -> int:
    """Acuity-weighted open load for one person."""
    return sum(
        t.weight for t in tasks
        if t.assigned_to == member_id and t.status in ACTIVE_STATUSES
    )


def eligible(member: TeamMember, category: str) -> bool:
    return member.role in ELIGIBLE_ROLES.get(category, ["Navigator"])


def best_assignee(
    task: Task, tasks: list[Task], now: int,
    exclude_id: Optional[str] = None, team: Optional[list[TeamMember]] = None,
) -> Optional[TeamMember]:
    team = team or TEAM

    # 1. Base eligibility
    pool = [m for m in team if eligible(m, task.category) and m.id != exclude_id]

    # 2. Seniority & Safety Guardrails
    if task.urgency == "critical" or task.emergency:
        pool = [m for m in pool if m.in_office and m.seniority in ["lead", "manager"]]

    if not pool:
        return None

    def score(m: TeamMember) -> tuple:
        # 3. Language Matching
        lang_match = 0 if task.required_language in m.languages else 1
        avail = max(0, m.busy_until - now)         
        workload_score = load_of(m.id, tasks) * 10 + avail + (0 if m.in_office else 60)
        return (lang_match, workload_score, m.name)

    return sorted(pool, key=score)[0]


def escalation_sweep(tasks: list[Task], now: int,
                     team: Optional[list[TeamMember]] = None) -> list[str]:
    """Reassign any critical task that wasn't acknowledged in time. Mutates the
    tasks in place and returns a human-readable log of what happened."""
    team = team or TEAM
    log: list[str] = []
    by_id = {m.id: m for m in team}
    for t in tasks:
        if t.status == "awaiting_ack" and t.ack_deadline is not None and now > t.ack_deadline:
            prev = by_id.get(t.assigned_to)
            nxt = best_assignee(t, tasks, now, exclude_id=t.assigned_to, team=team)
            t.escalations += 1
            if nxt:
                t.assigned_to = nxt.id
                t.ack_deadline = now + ACK_WINDOW
                log.append(f"{prev.name if prev else '?'} did not ack in time -> reassigned to {nxt.name}; supervisor notified.")
            else:
                t.status = "unassigned"
                t.ack_deadline = None
                log.append("No one left to escalate a critical task to; supervisor must intervene.")
    return log


def compute_report(tasks: list[Task], now: int,
                   team: Optional[list[TeamMember]] = None) -> HourlyReport:
    team = team or TEAM
    by_id = {m.id: m for m in team}
    open_tasks = [t for t in tasks if t.status != "done"]

    by_urg = {"critical": 0, "high": 0, "routine": 0}
    for t in open_tasks:
        by_urg[t.urgency] += 1

    urgent = [t for t in tasks if t.urgency in ("critical", "high")]
    handled = [t for t in urgent if t.status in ("acked", "in_progress", "done")]
    handled_pct = round(len(handled) / len(urgent) * 100) if urgent else 100

    at_risk = [
        {"id": t.id, "member": t.member, "category": t.category, "urgency": t.urgency}
        for t in open_tasks
        if t.urgency in ("critical", "high")
        and t.status not in ("acked", "in_progress")
        and (t.due_min() - now) < 120
    ]

    per_member = [{"id": m.id, "name": m.name, "role": m.role,
                   "in_office": m.in_office, "load": load_of(m.id, tasks)}
                  for m in team]

    recs = _recommend_rebalance(tasks, now, team)
    return HourlyReport(
        time=now, open_by_urgency=by_urg, handled_pct=handled_pct,
        at_risk=at_risk, per_member=per_member, recommendations=recs,
        escalations=sum(t.escalations for t in tasks),
    )


def _recommend_rebalance(tasks: list[Task], now: int,
                         team: list[TeamMember]) -> list[Recommendation]:
    """Suggest moving not-yet-started, non-critical tasks off overloaded
    navigators onto on-shift, available, underloaded ones. Recommendations
    only -- a human approves each."""
    navs = [m for m in team if m.role == "Navigator"]
    if not navs:
        return []
    sim = {m.id: load_of(m.id, tasks) for m in navs}
    avg = sum(sim.values()) / len(sim)
    by_id = {m.id: m for m in navs}
    recs: list[Recommendation] = []

    overloaded = [m for m in navs if sim[m.id] > max(4, avg * 1.5)]
    for over in overloaded:
        movable = sorted(
            [t for t in tasks if t.assigned_to == over.id
             and t.status == "assigned" and t.urgency != "critical"],
            key=lambda t: -URGENCY[t.urgency]["rank"],   # routine first
        )
        for t in movable:
            if sim[over.id] <= avg or len(recs) >= 3:
                break
            targets = sorted(
                [m for m in navs if m.id != over.id and m.in_office
                 and m.busy_until <= now and sim[m.id] < avg],
                key=lambda m: sim[m.id],
            )
            if not targets:
                break
            tgt = targets[0]
            recs.append(Recommendation(
                task_id=t.id, summary=t.summary, urgency=t.urgency,
                from_id=over.id, from_name=over.name, to_id=tgt.id, to_name=tgt.name,
                reason=(f"{over.name} is at load {sim[over.id]} (team avg {avg:.1f}); "
                        f"{tgt.name} is free now at {sim[tgt.id]}."),
            ))
            sim[over.id] -= t.weight
            sim[tgt.id] += t.weight
    return recs
import random

def parse_adt_to_task(patient_name: str, event_type: str, notes: str, current_min: int) -> Task:
    """
    Translates an incoming EHR ADT (Admit/Discharge/Transfer) webhook into a dispatch task.
    Bypasses standard triage logic to create high-reliability structured alerts.
    """
    event_lower = event_type.lower()
    
    # A hospital discharge (A03) automatically triggers a high-priority care navigation follow-up
    if event_lower in ["a03", "discharge"]:
        category = "care_navigation"
        urgency = "high"
        summary = f"EHR ALERT (Discharge): {notes}. Requires 48hr follow-up."
        
    # A hospital admission (A01) triggers a clinical concern to coordinate with the hospital
    elif event_lower in ["a01", "admit"]:
        category = "clinical_concern"
        urgency = "critical"
        summary = f"EHR ALERT (Admission): {notes}."
        
    # Standard fallback for other ADT updates
    else:
        category = "care_navigation"
        urgency = "routine"
        summary = f"EHR Update ({event_type}): {notes}"

    # Generate a mock task ID (in production, this would be a DB sequence)
    task_id = random.randint(10000, 99999)

    return Task(
        id=task_id,
        member=patient_name,
        category=category,
        urgency=urgency,
        summary=summary,
        status="unassigned",
        created_min=current_min
    )