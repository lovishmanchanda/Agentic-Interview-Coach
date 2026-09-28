"""The report's chart data (implementation_plan.md 1.11) and the room's timer guide."""
from datetime import datetime, timedelta, timezone

import pytest

from app.core.interview.engine import suggested_seconds
from app.core.interview.report_generator import build_report

T0 = datetime(2026, 9, 28, 10, 0, tzinfo=timezone.utc)
SESSION = {"session_id": "s1", "candidate_id": "c1", "config": {"interview_type": "technical"},
           "started_at": T0, "completed_at": T0 + timedelta(minutes=9)}
QUESTIONS = [
    {"question_id": "q1", "question_number": 1, "topic": "dsa", "question_text": "Hash maps?", "is_follow_up": False,
     "hints": [{"text": "Think about resizing."}]},
    {"question_id": "q1f", "question_number": 1, "topic": "dsa", "question_text": "Load factor?", "is_follow_up": True},
    {"question_id": "q2", "question_number": 2, "topic": "dbms", "question_text": "Joins?", "is_follow_up": False},
]
ANSWERS = [{"answer_id": "a1", "time_taken_s": 150}, {"answer_id": "a2", "time_taken_s": 60},
           {"answer_id": "a3", "time_taken_s": None}]


def _eval(qid, aid, score, tier, dims):
    return {"question_id": qid, "answer_id": aid, "overall_score": score, "performance_tier": tier,
            "dimensions": dims, "strengths": [], "weaknesses": [], "feedback": "", "suggestion": ""}


EVALUATIONS = [
    _eval("q1", "a1", 6.5, "adequate", {"correctness": 7, "depth": 5, "communication": 7}),
    _eval("q1f", "a2", 8.0, "strong", {"correctness": 8, "depth": 8, "communication": 8}),
    _eval("q2", "a3", 4.0, "weak", {"correctness": 4, "depth": 3, "communication": 6}),
]


def test_question_scores_in_order_with_time_and_hints():
    rows = build_report(SESSION, QUESTIONS, EVALUATIONS, ANSWERS)["question_scores"]
    assert [(r["question_id"], r["is_follow_up"], r["score"], r["time_taken_s"], r["hints_used"]) for r in rows] == [
        ("q1", False, 6.5, 150, 1), ("q1f", True, 8.0, 60, 0), ("q2", False, 4.0, None, 0)]


def test_dimension_averages():
    assert build_report(SESSION, QUESTIONS, EVALUATIONS, ANSWERS)["dimension_scores"] == {
        "correctness": 6.3, "depth": 5.3, "communication": 7.0}


def test_stats():
    assert build_report(SESSION, QUESTIONS, EVALUATIONS, ANSWERS)["stats"] == {
        "answers": 3, "follow_ups": 1, "hints_used": 1, "average_answer_seconds": 105, "duration_seconds": 540}


def test_a_resubmitted_answer_counts_once_with_its_last_score():
    evaluations = [*EVALUATIONS, _eval("q2", "a3", 7.0, "adequate", {"correctness": 7, "depth": 7, "communication": 7})]
    rows = build_report(SESSION, QUESTIONS, evaluations, ANSWERS)["question_scores"]
    assert [r["score"] for r in rows if r["question_id"] == "q2"] == [7.0]


def test_works_without_answers_or_times():
    report = build_report({**SESSION, "completed_at": None}, QUESTIONS, EVALUATIONS)
    assert report["stats"]["average_answer_seconds"] is None and report["stats"]["duration_seconds"] is None


@pytest.mark.parametrize("question, seconds", [
    ({"type": "technical", "difficulty": "medium"}, 180),
    ({"type": "technical", "difficulty": "hard"}, 240),
    ({"type": "behavioral", "difficulty": "medium"}, 240),
    ({"type": "technical", "difficulty": "hard", "is_follow_up": True}, 120),
    ({}, 180),
])
def test_suggested_answer_time(question, seconds):
    assert suggested_seconds(question) == seconds
