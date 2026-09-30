"""Coding evaluation (implementation_plan.md 4.6.5). Same result shape as the answer evaluators, so the
engine, reports and the Mentor treat a coding answer like any other.

The LLM reads the problem, the code, the candidate's explanation and the server's test results. Two
numbers are not left to it: when the language is graded, correctness is the share of tests passed, and
overall_score is a fixed weighting of the dimensions, so a solution that fails tests can't score well
on style alone.
"""
import time

from pydantic import BaseModel

from app.core.evaluation.answer_evaluator import _bullets, _EvaluationBase, _score, performance_tier
from app.core.prompts import render_for
from app.gateway import AIGateway
from app.gateway.types import CallContext, ExecutionResult

CODING_PROMPT = "evaluator/coding_v1"
WEIGHTS = {"correctness": 0.35, "approach": 0.15, "time_complexity": 0.10, "space_complexity": 0.05,
           "code_quality": 0.10, "edge_cases": 0.10, "communication": 0.15}
MAX_FAILURES_SHOWN = 3


class CodingDimensions(BaseModel):
    correctness: float = _score()
    approach: float = _score()
    time_complexity: float = _score()
    space_complexity: float = _score()
    code_quality: float = _score()
    edge_cases: float = _score()
    communication: float = _score()


class CodingEvaluationOutput(_EvaluationBase):
    dimensions: CodingDimensions


def execution_summary(result: ExecutionResult) -> str:
    """For the evaluator: status, pass counts, and the visible tests that failed (hidden ones only counted)."""
    if not result.graded:
        lines = [f"Status: {result.status}. This language isn't graded against tests yet; the code ran as written."]
        if result.stdout:
            lines.append(f"Output: {result.stdout[:500]}")
    else:
        lines = [f"Status: {result.status}. Passed {result.passed_tests} of {result.total_tests} tests."]
        failed = [t for t in result.test_results if not t.passed]
        for t in [t for t in failed if not t.is_hidden][:MAX_FAILURES_SHOWN]:
            lines.append(f"- Failed: input {t.input} -> expected {t.expected}, got {t.actual}")
        if hidden := sum(t.is_hidden for t in failed):
            lines.append(f"- {hidden} hidden test(s) failed.")
    if result.compile_output:
        lines.append(f"Compiler: {result.compile_output[:500]}")
    if result.stderr:
        lines.append(f"Errors: {result.stderr[:500]}")
    return "\n".join(lines)


def weighted_overall(dimensions: dict[str, float]) -> float:
    return round(sum(dimensions[k] * w for k, w in WEIGHTS.items()), 1)


async def evaluate_code(gateway: AIGateway, *, question: dict, code: str, language: str, explanation: str,
                        execution: ExecutionResult, profile: dict | None, context: CallContext,
                        time_taken_s: int | None = None) -> dict:
    prompt = render_for(
        context, CODING_PROMPT,
        role=(profile or {}).get("target", {}).get("role", "software_engineer"),
        experience_level=(profile or {}).get("personal", {}).get("experience_level", "fresher"),
        topic=question.get("topic", "general"), difficulty=question.get("difficulty", "medium"),
        question_text=question["question_text"],
        expected_concepts=_bullets(question.get("expected_concepts", [])),
        rubric=_bullets([f"{k}: {v}" for k, v in question.get("evaluation_rubric", {}).items()]),
        execution_summary=execution_summary(execution),
        time_taken=f"{round(time_taken_s / 60)} min" if time_taken_s else "unknown",
        language=language, code=code, explanation=explanation.strip() or "(no explanation given)",
    )
    started = time.perf_counter()
    result = await gateway.generate_structured(prompt, CodingEvaluationOutput, context=context, tier="fast")
    dimensions = dict(result["dimensions"])
    if execution.graded:
        dimensions["correctness"] = round(10 * execution.passed_tests / execution.total_tests, 1) if execution.total_tests else 0.0
    overall = weighted_overall(dimensions)
    return {
        **result, "dimensions": dimensions, "overall_score": overall,
        "evaluation_type": "coding", "performance_tier": performance_tier(overall),
        "prompt_version": context.prompt_version, "latency_ms": int((time.perf_counter() - started) * 1000),
    }
