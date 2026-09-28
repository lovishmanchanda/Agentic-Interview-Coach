"""What each LLM role is allowed to see (architecture.md §8.5).

The interviewer agent only ever gets performance *tiers* and qualitative notes, never numeric scores,
in either mode: that is what keeps "Interviewer ≠ Evaluator" true and stops scores leaking into what the
candidate hears. Everything the agent reads goes through here, so the guarantee is tested in one place.
"""
from app.core.evaluation.answer_evaluator import performance_tier

_RECOMMENDATION = {
    "follow_up": "ask a follow-up (the answer was partial)",
    "next_topic": "move on to the next question",
    "complete": "wrap up (that was the last question)",
}


def evaluation_summary(evaluation: dict) -> dict:
    """The evaluator's view with every number removed."""
    return {
        "performance_tier": evaluation["performance_tier"],
        "strengths": list(evaluation.get("strengths") or [])[:4],
        "weaknesses": list(evaluation.get("weaknesses") or [])[:4],
    }


def performance_summary(session: dict) -> dict:
    """Per-topic tiers from the running scores, plus progress. For the agent's get_performance_summary tool."""
    vector = session.get("performance_vector") or {}
    topic_tiers = {topic: performance_tier(v["mean"]) for topic, v in vector.items()}
    means = [v["mean"] for v in vector.values()]
    return {
        "questions_asked": session["questions_asked"],
        "question_count": session["config"]["question_count"],
        "follow_ups_asked": session.get("follow_ups_asked", 0),
        "topics_covered": session.get("topics_covered", []),
        "topic_tiers": topic_tiers,
        "overall_tier": performance_tier(sum(means) / len(means)) if means else None,
    }


def recommendation_text(action: str) -> str:
    """The AdaptationEngine's suggestion without its reason string, which contains the score."""
    return _RECOMMENDATION[action]


def first_name(name: str | None) -> str:
    return (name or "").strip().split(" ")[0] or "there"
