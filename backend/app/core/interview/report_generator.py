"""Report generation (implementation_plan.md 1.10, Phase 1b).

Two layers, so the numbers can never be made up:
  build_report()      deterministic: every score, the per-topic and per-question breakdown, the chart data
                      and stats, plus a plain narrative stitched from the evaluator's notes (the fallback).
  write_narrative()   Groq (gpt-oss-120b, prompts/report/report_v1.txt) writes the words: summary, strong
                      areas, weak areas with reasons, concrete recommendations, and a study plan. It sees the
                      evaluator's notes per answer, not the answers themselves.
  apply_narrative()   validates and merges it: topics must be ones the interview covered, and severity and
                      priority come from that topic's actual score, not from the model.
If the narrative call fails, the deterministic report is used as is. The document shape
(architecture.md §5.2 interview_reports) is the same either way.
"""
import logging
import time
import uuid
from statistics import mean

from pydantic import BaseModel, Field

from app.core.prompts import render_prompt
from app.db.repositories.interview_repo import as_utc, utcnow
from app.gateway import AIGateway
from app.gateway.types import CallContext
from app.utils.logging import log_event

log = logging.getLogger(__name__)

REPORT_VERSION = "report/skeleton_v0"      # the deterministic narrative
NARRATIVE_PROMPT = "report/report_v1"      # the Groq-written narrative
# Headline scores beyond "overall" (architecture.md: technical + communication), from the evaluator's dimensions.
HEADLINE_DIMENSIONS = {
    "technical": {"technical": ["correctness", "depth"], "communication": ["communication"]},
    "behavioral": {"story": ["situation", "task", "action", "result", "specificity", "ownership"],
                   "communication": ["communication"]},
}


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


def _question_scores(questions: list[dict], evaluations: list[dict], answers: list[dict]) -> list[dict]:
    """One row per answered question, in order, for the report's per-question chart."""
    by_answer = {a["answer_id"]: a for a in answers}
    latest: dict[str, dict] = {}
    for e in evaluations:  # a resubmitted answer: the last evaluation counts
        latest[e["question_id"]] = e
    rows = []
    for q in questions:
        e = latest.get(q["question_id"])
        if e is None:
            continue
        answer = by_answer.get(e.get("answer_id"), {})
        rows.append({
            "question_id": q["question_id"], "number": q.get("question_number"), "is_follow_up": q.get("is_follow_up", False),
            "topic": q.get("topic", "general"), "question_text": q.get("question_text", ""),
            "score": e["overall_score"], "performance_tier": e.get("performance_tier"),
            "time_taken_s": answer.get("time_taken_s"), "hints_used": len(q.get("hints") or []),
        })
    return rows


def _dimension_scores(evaluations: list[dict]) -> dict[str, float]:
    """Average of each evaluator dimension (correctness, depth… or the STAR parts) across the answers."""
    values: dict[str, list[float]] = {}
    for e in evaluations:
        for name, score in (e.get("dimensions") or {}).items():
            values.setdefault(name, []).append(score)
    return {name: round(mean(scores), 1) for name, scores in values.items()}


def _headline_scores(interview_type: str, evaluations: list[dict]) -> dict[str, float]:
    out = {}
    for name, dims in HEADLINE_DIMENSIONS.get(interview_type, {}).items():
        values = [e["dimensions"][d] for e in evaluations for d in dims if d in (e.get("dimensions") or {})]
        if values:
            out[name] = round(mean(values), 1)
    return out


def build_report(session: dict, questions: list[dict], evaluations: list[dict], answers: list[dict] | None = None) -> dict:
    answers = answers or []
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
        "scores": {"overall": overall, **_headline_scores(session["config"]["interview_type"], evaluations)},
        "per_topic_scores": per_topic_scores,
        "summary": summary,
        "strong_areas": _dedupe([s for e in evaluations for s in e.get("strengths", [])], 6),
        "weak_areas": weak_areas[:6],
        "recommendations": recommendations[:6],
        "suggested_preparation_plan": {
            "priority_topics": [t for t, s in sorted(per_topic_scores.items(), key=lambda kv: kv[1]) if s < 7.5],
            "estimated_days": None,
            "steps": [],
        },
        "narrative_source": "fallback",
        # For the report page's charts (1.11). Phase 1b keeps these fields.
        "question_scores": (question_scores := _question_scores(questions, evaluations, answers)),
        "dimension_scores": _dimension_scores(evaluations),
        "stats": {
            "answers": len(question_scores),
            "follow_ups": sum(1 for r in question_scores if r["is_follow_up"]),
            "hints_used": sum(r["hints_used"] for r in question_scores),
            "average_answer_seconds": round(mean(t)) if (t := [r["time_taken_s"] for r in question_scores
                                                               if r["time_taken_s"] is not None]) else None,
            "duration_seconds": round((as_utc(session["completed_at"]) - as_utc(session["started_at"])).total_seconds())
            if session.get("completed_at") and session.get("started_at") else None,
        },
        "rag_indexed": False,
        "rag_chunk_ids": [],
        "generated_at": utcnow(),
        "prompt_version_used": REPORT_VERSION,
    }


# ── the Groq-written narrative ────────────────────────────────────────────────
class _WeakArea(BaseModel):
    topic: str = Field(max_length=60)
    reason: str = Field(min_length=5, max_length=300)


class _Recommendation(BaseModel):
    topic: str = Field(max_length=60)
    action: str = Field(min_length=5, max_length=300)


class ReportNarrative(BaseModel):
    summary: str = Field(min_length=40, max_length=1500)
    strong_areas: list[str] = Field(min_length=1, max_length=6)
    weak_areas: list[_WeakArea] = Field(default_factory=list, max_length=6)
    recommendations: list[_Recommendation] = Field(min_length=1, max_length=6)
    estimated_days: int = Field(ge=1, le=60)
    study_plan: list[str] = Field(min_length=1, max_length=6)


def _notes(report: dict, questions: list[dict], evaluations: list[dict]) -> str:
    """Per answer: what was asked and what the evaluator said. The candidate's own answer text is left out."""
    by_question = {q["question_id"]: q for q in questions}
    blocks = []
    for i, row in enumerate(report["question_scores"], start=1):
        q = by_question.get(row["question_id"], {})
        e = next((e for e in reversed(evaluations) if e["question_id"] == row["question_id"]), {})
        label = "Follow-up" if row["is_follow_up"] else f"Question {row['number'] or i}"
        blocks.append("\n".join([
            f"{label} [{row['topic']}] {row['score']}/10 ({row['performance_tier']})"
            + (" · used a hint" if row["hints_used"] else ""),
            f"  Asked: {(q.get('question_text') or '')[:300]}",
            f"  Strengths: {'; '.join(e.get('strengths') or []) or '(none noted)'}",
            f"  Gaps: {'; '.join(e.get('weaknesses') or []) or '(none noted)'}",
            f"  Evaluator: {e.get('feedback', '')}",
        ]))
    return "\n\n".join(blocks) or "(no answers)"


async def write_narrative(gateway: AIGateway, session: dict, report: dict, questions: list[dict],
                          evaluations: list[dict]) -> dict | None:
    """The report's words from Groq, or None (the deterministic narrative stays)."""
    if not report["question_scores"]:
        return None
    config = session["config"]
    topics = list(report["per_topic_scores"])
    prompt = render_prompt(
        NARRATIVE_PROMPT,
        interview_type=config["interview_type"],
        role=config["role"],
        experience_level=config["experience_level"],
        interview_mode=config["interview_mode"],
        answer_count=str(len(report["question_scores"])),
        overall=str(report["scores"]["overall"]),
        topic_scores=", ".join(f"{t} {s}" for t, s in report["per_topic_scores"].items()),
        topic_list=", ".join(topics),
        notes=_notes(report, questions, evaluations),
    )
    context = CallContext(session_id=session["session_id"], candidate_id=session["candidate_id"],
                          prompt_version=NARRATIVE_PROMPT)
    started = time.perf_counter()
    try:
        narrative = await gateway.generate_structured(prompt, ReportNarrative, context=context)
    except Exception:  # noqa: BLE001 -- the deterministic report is a complete fallback
        log.warning("report_narrative_failed", exc_info=True)
        return None
    log_event(log, "report_narrative_written", session_id=session["session_id"],
              latency_ms=int((time.perf_counter() - started) * 1000))
    return narrative


def apply_narrative(report: dict, narrative: dict) -> dict:
    """Merge the narrative after checking it. Topics must be ones the interview covered (recommendations may
    also say "general"); severity and priority come from the topic's real score. If none of the weak areas
    name a real topic, the deterministic ones stay."""
    topic_scores = report["per_topic_scores"]
    weak = [{"topic": w["topic"], "severity": _severity(topic_scores[w["topic"]]), "reason": w["reason"].strip()}
            for w in narrative["weak_areas"] if w["topic"] in topic_scores]
    recs = [{"topic": r["topic"], "priority": _severity(topic_scores[r["topic"]]) if r["topic"] in topic_scores else "medium",
             "action": r["action"].strip()}
            for r in narrative["recommendations"] if r["topic"] in topic_scores or r["topic"] == "general"]
    dropped = len(narrative["weak_areas"]) - len(weak) + len(narrative["recommendations"]) - len(recs)
    if dropped:
        log_event(log, "report_narrative_items_dropped", count=dropped)
    return {
        **report,
        "summary": narrative["summary"].strip(),
        "strong_areas": _dedupe(narrative["strong_areas"], 6),
        "weak_areas": weak if weak or not narrative["weak_areas"] else report["weak_areas"],
        "recommendations": recs or report["recommendations"],
        "suggested_preparation_plan": {
            **report["suggested_preparation_plan"],
            "estimated_days": narrative["estimated_days"],
            "steps": [step.strip() for step in narrative["study_plan"] if step.strip()][:6],
        },
        "narrative_source": "llm",
        "prompt_version_used": NARRATIVE_PROMPT,
    }
