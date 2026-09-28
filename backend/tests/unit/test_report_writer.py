"""The Groq-written report (implementation_plan.md 1.10): numbers stay computed, words are checked."""
import asyncio

from app.core.interview.report_generator import (
    NARRATIVE_PROMPT,
    ReportNarrative,
    apply_narrative,
    build_report,
    write_narrative,
)
from app.gateway import FakeAIGateway
from app.utils.exceptions import ServiceUnavailableError
from tests.unit.test_report_stats import ANSWERS, EVALUATIONS, QUESTIONS, SESSION

SESSION_T = {**SESSION, "config": {"interview_type": "technical", "interview_mode": "practice", "role": "Backend",
                                   "experience_level": "1-2"}}
NARRATIVE = {
    "summary": "You explained hash maps clearly and recovered well on the follow-up, but joins were shaky.",
    "strong_areas": ["Clear structure", "Good recovery under follow-up questions"],
    "weak_areas": [{"topic": "dbms", "reason": "Mixed up INNER and LEFT JOIN semantics."},
                   {"topic": "cooking", "reason": "Not a topic in this interview."}],
    "recommendations": [{"topic": "dbms", "action": "Write five LEFT JOIN queries with NULL checks."},
                        {"topic": "general", "action": "Open every answer with a one-line summary."},
                        {"topic": "astrology", "action": "Should be dropped."}],
    "estimated_days": 5,
    "study_plan": ["Joins drills", "Mock answer on hashing with an example"],
}


def _report():
    return build_report(SESSION_T, QUESTIONS, EVALUATIONS, ANSWERS)


def test_headline_scores_are_computed_from_dimensions():
    scores = _report()["scores"]
    # technical = mean of correctness+depth over all answers; communication = mean of communication
    assert scores == {"overall": 6.2, "technical": 5.8, "communication": 7.0}


def test_behavioral_headline_is_the_star_story():
    evals = [{"question_id": "q1", "answer_id": "a1", "overall_score": 7, "performance_tier": "adequate",
              "dimensions": {"situation": 8, "task": 7, "action": 7, "result": 5, "specificity": 7, "ownership": 8,
                             "communication": 6}}]
    report = build_report({**SESSION, "config": {"interview_type": "behavioral"}}, QUESTIONS[:1], evals, ANSWERS)
    assert report["scores"] == {"overall": 7.0, "story": 7.0, "communication": 6.0}


def test_the_deterministic_report_is_marked_as_the_fallback():
    report = _report()
    assert report["narrative_source"] == "fallback" and report["prompt_version_used"] == "report/skeleton_v0"
    assert report["suggested_preparation_plan"]["steps"] == []


def test_apply_narrative_checks_topics_and_uses_real_scores():
    merged = apply_narrative(_report(), NARRATIVE)
    assert merged["summary"].startswith("You explained hash maps")
    # dbms scored 4.0 → high severity, whatever the model thought; the unknown topic is dropped.
    assert merged["weak_areas"] == [{"topic": "dbms", "severity": "high", "reason": "Mixed up INNER and LEFT JOIN semantics."}]
    assert [(r["topic"], r["priority"]) for r in merged["recommendations"]] == [("dbms", "high"), ("general", "medium")]
    assert merged["suggested_preparation_plan"] == {"priority_topics": ["dbms", "dsa"], "estimated_days": 5,
                                                    "steps": ["Joins drills", "Mock answer on hashing with an example"]}
    assert merged["narrative_source"] == "llm" and merged["prompt_version_used"] == "report/report_v1"
    # Numbers untouched.
    assert merged["scores"] == _report()["scores"] and merged["question_scores"] == _report()["question_scores"]


def test_weak_areas_that_all_miss_fall_back_to_the_evaluators():
    merged = apply_narrative(_report(), {**NARRATIVE, "weak_areas": [{"topic": "cooking", "reason": "Nope, not real."}]})
    assert merged["weak_areas"] == _report()["weak_areas"]


def test_an_all_strong_narrative_may_have_no_weak_areas():
    merged = apply_narrative(_report(), {**NARRATIVE, "weak_areas": []})
    assert merged["weak_areas"] == []


def test_write_narrative_prompt_has_notes_not_answers():
    gw = FakeAIGateway().script("structured", NARRATIVE)
    report = _report()
    narrative = asyncio.run(write_narrative(gw, SESSION_T, report, QUESTIONS, EVALUATIONS))
    assert narrative == ReportNarrative.model_validate(NARRATIVE).model_dump()
    call = gw.calls_of("structured")[0]
    assert call["tier"] == "default" and call["context"].prompt_version == NARRATIVE_PROMPT
    prompt = call["prompt"]
    assert 'Topics covered (use exactly these names in "topic" fields): dsa, dbms' in prompt
    assert "Question 1 [dsa] 6.5/10 (adequate) · used a hint" in prompt and "Follow-up [dsa] 8.0/10" in prompt
    assert "<<<NOTES" in prompt and "${" not in prompt


def test_write_narrative_failure_returns_none():
    gw = FakeAIGateway().script("structured", ServiceUnavailableError("down", code="llm_unavailable"))
    assert asyncio.run(write_narrative(gw, SESSION_T, _report(), QUESTIONS, EVALUATIONS)) is None
