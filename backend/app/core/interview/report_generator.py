"""Report generation (implementation_plan.md 1.10).

Walking-skeleton version: deterministic aggregation of the stored evaluations, no extra LLM call.
Phase 1b replaces the summary/recommendation parts with a Groq-written report; the document shape
below (architecture.md §5.2 interview_reports) stays the same.
"""
import uuid
from statistics import mean

from app.db.repositories.interview_repo import utcnow

REPORT_VERSION = "report/skeleton_v0"


def _severity(score: float) -> str:
    return "high" if score < 5 else "medium" if score < 7.5 else "low"


def _dedupe(items: list[str], limit: int) -> list[str]:
    seen, out = set(), []
    for item in items:
        key = item.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip())
    return out[:limit]


def build_report(session: dict, questions: list[dict], evaluations: list[dict]) -> dict:
    by_question = {q["question_id"]: q for q in questions}
    scores = [e["overall_score"] for e in evaluations] or [0.0]
    overall = round(mean(scores), 1)

    per_topic: dict[str, list[float]] = {}
    for e in evaluations:
        topic = by_question.get(e["question_id"], {}).get("topic", "general")
        per_topic.setdefault(topic, []).append(e["overall_score"])
    per_topic_scores = {topic: round(mean(values), 1) for topic, values in per_topic.items()}

    weak_areas, recommendations = [], []
    for e in evaluations:
        topic = by_question.get(e["question_id"], {}).get("topic", "general")
        for weakness in e.get("weaknesses", [])[:2]:
            weak_areas.append({"topic": topic, "severity": _severity(e["overall_score"]), "reason": weakness})
        if e.get("suggestion"):
            recommendations.append({"topic": topic, "priority": _severity(e["overall_score"]), "action": e["suggestion"]})

    summary = " ".join(e.get("feedback", "") for e in evaluations).strip() or "No answers were evaluated."
    return {
        "report_id": uuid.uuid4().hex,
        "session_id": session["session_id"],
        "candidate_id": session["candidate_id"],
        "interview_type": session["config"]["interview_type"],
        "scores": {"overall": overall},
        "per_topic_scores": per_topic_scores,
        "summary": summary,
        "strong_areas": _dedupe([s for e in evaluations for s in e.get("strengths", [])], 6),
        "weak_areas": weak_areas[:6],
        "recommendations": recommendations[:6],
        "suggested_preparation_plan": {
            "priority_topics": [t for t, s in sorted(per_topic_scores.items(), key=lambda kv: kv[1]) if s < 7.5],
            "estimated_days": None,
        },
        "rag_indexed": False,
        "rag_chunk_ids": [],
        "generated_at": utcnow(),
        "prompt_version_used": REPORT_VERSION,
    }
