"""Tests for the dispatch logic. Run with:  pytest

These exercise the product decisions, not just the happy path: that load is
acuity-weighted, that unacked critical tasks get escalated, and that
rebalancing only recommends moving non-critical, not-yet-started work off
an overloaded person.
"""
import unittest
from backend.dispatch import Task, load_of, best_assignee, escalation_sweep, generate_rebalance_suggestions

TEAM = [
    {"id": "nav1", "name": "Aisha", "role": "Maternity Navigator"},
    {"id": "nav2", "name": "Sofia", "role": "Maternity Navigator"},
    {"id": "nav3", "name": "Jordan", "role": "Maternity Navigator"},
]


def _task(id, urgency, assignedTo, status="assigned", createdMin=540):
    return Task(
        id=id, source="athena_ehr", category="housing",
        urgency=urgency, assignedTo=assignedTo, status=status,
        createdMin=createdMin, market="GA", lifecycle="second_trimester", payer="commercial"
    )


class TestDispatchLogic(unittest.TestCase):

    def test_load_is_acuity_weighted(self):
        tasks = [
            _task(1, "routine", "nav1"),
            _task(2, "routine", "nav1"),
            _task(3, "critical", "nav2"),
        ]
        # two routine (1+1) is lighter than one critical (5)
        self.assertEqual(load_of("nav1", tasks), 2)
        self.assertEqual(load_of("nav2", tasks), 5)
        # done work does not count toward load
        tasks[0].status = "done"
        self.assertEqual(load_of("nav1", tasks), 1)

    def test_assign_prefers_lowest_load(self):
        # nav1 carries two high tasks (3+3=6); nav2 and nav3 are empty
        tasks = [_task(i, "high", "nav1") for i in range(2)]
        pick = best_assignee(tasks, TEAM)
        self.assertNotEqual(pick, "nav1")

    def test_unacked_critical_escalates(self):
        t = _task(1, "critical", "nav1", status="awaiting_ack", createdMin=500)
        log = escalation_sweep([t], now=520, team=TEAM)
        self.assertNotEqual(t.assignedTo, "nav1")
        self.assertTrue(len(log) > 0)
        self.assertIn("escalated", log[0])

    def test_rebalance_recommends_offloading_overloaded(self):
        tasks = [
            _task(1, "high", "nav1"),
            _task(2, "high", "nav1"),
            _task(3, "routine", "nav1"),
        ]  # nav1 load = 3+3+1=7; nav2, nav3 load = 0
        recs = generate_rebalance_suggestions(tasks, TEAM)
        self.assertTrue(len(recs) > 0)
        self.assertEqual(recs[0].fromId, "nav1")

    def test_rebalance_never_moves_critical(self):
        tasks = [
            _task(1, "critical", "nav1"),
            _task(2, "high", "nav1"),
            _task(3, "high", "nav1"),
        ]
        recs = generate_rebalance_suggestions(tasks, TEAM)
        for r in recs:
            self.assertNotEqual(r.urgency, "critical")


if __name__ == "__main__":
    unittest.main()
