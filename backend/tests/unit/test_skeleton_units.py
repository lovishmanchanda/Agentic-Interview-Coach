from datetime import datetime, timezone

import pytest

from app.core.evaluation.answer_evaluator import performance_tier
from app.core.interview.report_generator import build_report
from app.core.mentor.indexer import to_rag_report
from app.core.mentor.rag_tool import chunks_for_report
from app.core.prompts import render_prompt
from tests.fakes import GOOD_EVALUATION

SESSION = {"session_id": "s1", "candidate_id": "u1", "config": {"interview_type": "technical"}}
QUESTIONS = [{"question_id": "q1", "topic": "dsa", "question_text": "How does a hash map work?"}]
ANSWERS = [{"question_id": "q1", "answer_text": "first"}, {"question_id": "q1", "answer_text": "retry wins"}]
EVALUATIONS = [{**GOOD_EVALUATION, "question_id": "q1"}]


@pytest.mark.parametrize("score, tier", [(9, "strong"), (7.5, "strong"), (7.4, "adequate"), (5, "adequate"), (4.9, "weak"), (0, "weak")])
def test_performance_tier_boundaries(score, tier):
    assert performance_tier(score) == tier


def test_prompt_rendering_fills_placeholders_and_keeps_braces_in_answers():
    prompt = render_prompt("evaluator/technical_v1", role="ml_engineer", experience_level="1-2", topic="dsa",
                           difficulty="medium", question_text="Q?", expected_concepts="- a", rubric="- b",
                           answer_text="def f(): return {'k': 1}  ${not_a_placeholder}")
    assert "{'k': 1}" in prompt and "${not_a_placeholder}" in prompt and "ml_engineer" in prompt
    with pytest.raises(KeyError):
        render_prompt("evaluator/technical_v1", role="x")
    with pytest.raises(ValueError):
        render_prompt("../../backend/app/config")


def test_report_aggregates_evaluations():
    report = build_report(SESSION, QUESTIONS, EVALUATIONS)
    assert report["scores"]["overall"] == 6.5
    assert report["per_topic_scores"] == {"dsa": 6.5}
    assert report["weak_areas"][0] == {"topic": "dsa", "severity": "medium", "reason": "Did not mention resizing or load factor"}
    assert report["recommendations"][0]["action"].startswith("Practise explaining load factor")
    assert report["suggested_preparation_plan"]["priority_topics"] == ["dsa"]


def test_to_rag_report_maps_onto_rag_tool_contract():
    report = {**build_report(SESSION, QUESTIONS, EVALUATIONS), "generated_at": datetime(2026, 9, 26, tzinfo=timezone.utc)}
    rag_report = to_rag_report(report, QUESTIONS, ANSWERS, EVALUATIONS)
    assert rag_report.user_id == "u1" and rag_report.session_id == "s1"
    assert rag_report.topic == "dsa" and rag_report.overall_score == 6.5
    assert rag_report.question_feedback[0].answer_summary == "retry wins"  # latest answer is used
    assert rag_report.weaknesses == ["dsa: Did not mention resizing or load factor"]
    assert [c.id for c in chunks_for_report(rag_report)] == ["s1:summary", "s1:question:q1", "s1:recommendations"]
