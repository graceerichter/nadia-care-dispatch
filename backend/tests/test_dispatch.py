"""Tests for the dispatch logic. Run with:  pytest

These exercise the product decisions, not just the happy path: that load is
acuity-weighted, that critical work requires someone on shift, that an unacked
critical task escalates to someone else, and that rebalancing only recommends
moving non-critical, not-yet-started work off an overloaded person.
"""
import dispatch
from dispatch import Task, TeamMember


def _team():
    return [
        TeamMember(id="rn1", name="Priya", role="RN", in_office=True, busy_until=480),
        TeamMember(id="nv1", name="Aisha", role="Navigator", in_office=True, busy_until=480),
        TeamMember(id="nv2", name="Sofia", role="Navigator", in_office=True, busy_until=600),
        TeamMember(id="nv3", name="Jordan", role="Navigator", in_office=True, busy_until=480),
        TeamMember(id="off", name="Dana", role="Navigator", in_office=False, busy_until=480),
    ]


def test_load_is_acuity_weighted():
    tasks = [
        Task(id=1, category="housing", urgency="routine", assigned_to="nv1", status="assigned"),
        Task(id=2, category="housing", urgency="routine", assigned_to="nv1", status="assigned"),
        Task(id=3, category="housing", urgency="critical", assigned_to="nv2", status="assigned"),
    ]
    # two routine (1+1) is lighter than one critical (5)
    assert dispatch.load_of("nv1", tasks) == 2
    assert dispatch.load_of("nv2", tasks) == 5
    # 'done' work does not count toward load
    tasks[0].status = "done"
    assert dispatch.load_of("nv1", tasks) == 1


def test_assign_prefers_lowest_load():
    team = _team()
    tasks = [Task(id=i, category="housing", urgency="high", assigned_to="nv1", status="assigned")
             for i in range(2)]  # Aisha loaded, Jordan empty
    pick = dispatch.best_assignee(
        Task(id=99, category="housing", urgency="routine"), tasks, now=540, team=team)
    assert pick.id == "nv3"  # Jordan: free now, zero load


def test_critical_requires_on_shift():
    team = _team()
    # only the off-shift navigator is "free" of load, but critical needs on-shift
    pick = dispatch.best_assignee(
        Task(id=1, category="housing", urgency="critical"), [], now=540, team=team)
    assert pick is not None and pick.in_office


def test_unacked_critical_escalates():
    team = _team()
    t = Task(id=1, category="housing", urgency="critical", assigned_to="nv1",
             status="awaiting_ack", created_min=500, ack_deadline=510)
    log = dispatch.escalation_sweep([t], now=520, team=team)
    assert t.assigned_to != "nv1"          # moved off the original person
    assert t.escalations == 1
    assert log and "reassigned" in log[0]


def test_report_recommends_offloading_the_overloaded():
    team = _team()
    tasks = [
        Task(id=1, category="housing", urgency="high", assigned_to="nv1", status="assigned", summary="A"),
        Task(id=2, category="transportation", urgency="high", assigned_to="nv1", status="assigned", summary="B"),
        Task(id=3, category="nutrition", urgency="routine", assigned_to="nv1", status="assigned", summary="C"),
    ]  # Aisha overloaded (3+3+1=7); Jordan free at 0
    report = dispatch.compute_report(tasks, now=540, team=team)
    assert report.recommendations
    first = report.recommendations[0]
    assert first.from_id == "nv1"
    assert first.urgency != "critical"     # never recommends moving critical work
