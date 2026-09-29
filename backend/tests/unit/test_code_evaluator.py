"""The coding evaluator (4.6.5): tests decide correctness, the server decides the overall score."""
import asyncio

import pytest

from app.core.evaluation.code_evaluator import WEIGHTS, evaluate_code, execution_summary, weighted_overall
from app.gateway import FakeAIGateway
from app.gateway.types import CallContext, ExecutionResult, TestCaseResult

QUESTION = {"question_id": "q", "topic": "stack", "difficulty": "easy", "question_text": "Valid parentheses.",
            "expected_concepts": ["stack"], "evaluation_rubric": {"correctness": "all tests"}}
REVIEW = {"overall_score": 10, "dimensions": {k: 8 for k in WEIGHTS}, "strengths": [], "weaknesses": [],
          "feedback": "ok", "suggestion": "ok", "model_answer_outline": []}


def _result(passed, total, graded=True, **extra):
    tests = [TestCaseResult(passed=i < passed, is_hidden=i >= 3, input=f"in{i}", expected="True", actual="False")
             for i in range(total)]
    return ExecutionResult(status="accepted" if passed == total else "wrong_answer", passed_tests=passed,
                           total_tests=total, test_results=tests, graded=graded, language="python", **extra)


def _evaluate(execution, **review):
    gateway = FakeAIGateway().script("structured", {**REVIEW, **review})
    result = asyncio.run(evaluate_code(gateway, question=QUESTION, code="def is_valid(s): ...", language="python",
                                       explanation="Stack, O(n).", execution=execution, profile=None,
                                       context=CallContext(), time_taken_s=600))
    return result, gateway.calls_of("structured")[0]["prompt"]


def test_weights_sum_to_one():
    assert sum(WEIGHTS.values()) == pytest.approx(1.0)


def test_graded_correctness_comes_from_the_tests_and_overall_is_recomputed():
    result, _ = _evaluate(_result(2, 5))
    assert result["dimensions"]["correctness"] == 4.0
    assert result["overall_score"] == weighted_overall(result["dimensions"]) != 10
    assert result["evaluation_type"] == "coding" and result["performance_tier"] == "adequate"


def test_all_tests_failing_caps_the_score_even_with_a_generous_review():
    result, _ = _evaluate(_result(0, 5), dimensions={k: 10 for k in WEIGHTS})
    assert result["dimensions"]["correctness"] == 0 and result["overall_score"] == 6.5


def test_ungraded_languages_keep_the_reviewers_correctness():
    result, prompt = _evaluate(_result(0, 0, graded=False, stdout="True\n"))
    assert result["dimensions"]["correctness"] == 8
    assert "isn't graded against tests yet" in prompt


def test_the_prompt_shows_visible_failures_but_only_counts_hidden_ones():
    summary = execution_summary(_result(1, 5))
    assert "Passed 1 of 5 tests" in summary and "input in1" in summary
    assert "2 hidden test(s) failed" in summary and "in3" not in summary and "in4" not in summary
