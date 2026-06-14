"""Triage classification (Deterministic / Local Only)."""
from __future__ import annotations

async def triage(text: str) -> dict:
    """Classifies an incoming member message based on keyword rules."""
    text_lower = text.lower()

    def has(*words: str) -> bool:
        return any(w in text_lower for w in words)

    cat, urg, emer, safe = "care_navigation", "routine", False, False

    if has("heavy", "severe", "soaking", "not moving", "isn't moving"):
        cat, urg, emer, safe = "clinical_concern", "critical", True, True
    elif has("bleeding", "pain", "dizzy", "swelling", "cramp"):
        cat, urg, safe = "clinical_concern", "high", True
    elif has("sad", "anxious", "depress", "cry", "alone", "scared", "overwhelm", "unlike myself", "don't feel like myself"):
        cat, urg = "behavioral_health", "high"
    elif has("evict", "homeless", "nowhere", "lost my housing", "shelter", "kicked out", "out by"):
        cat = "housing"
        urg = "critical" if has("tonight", "today", "friday", "now") else "high"
    elif has("ride", "transport", "bus", "car broke", "get to my appointment", "no way to get"):
        cat, urg = "transportation", "high"
    elif has("food", "hungry", "groceries", "wic", "snap", "formula"):
        cat, urg = "nutrition", "high"
    elif has("breastfeed", "latch", "lactation", "pump", "milk"):
        cat = "lactation"
    elif has("doula"):
        cat = "doula"
    elif has("insurance", "medicaid", "coverage", "bill", "copay", "benefit"):
        cat = "benefits"

    return {
        "primary_category": cat,
        "urgency": urg,
        "emergency": emer,
        "safety_flag": safe,
        "confidence": 1.0,
        "rationale": f"Local rule match for {cat} (Urgency: {urg})"
    }