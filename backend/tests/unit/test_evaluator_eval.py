"""The evaluator eval runner (evaluation/interview_eval/run_evaluator_eval.py): its metrics, its dataset,
and a full run against the fake gateway. No network."""
import asyncio
import importlib.util
import math
from pathlib import Path

import pytest

from app.core.evaluation.answer_evaluator import EVALUATORS
from app.gateway import FakeAIGateway
from tests.fakes import BEHAVIORAL_EVALUATION, GOOD_EVALUATION

ROOT = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location("run_evaluator_eval", ROOT / "evaluation/interview_eval/run_evaluator_eval.py")
runner = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(runner)


@pytest.fixture(scope="module")
def dataset():
    questions = runner.load_questions(ROOT / "data" / "seed")
    return runner.load_cases(), questions


def test_dataset_is_valid_and_sized_per_plan(dataset):
    cases, questions = dataset
    runner.validate_cases(cases, questions)
    per_type = {kind: [c for c in cases if questions[c["question_id"]]["type"] == kind] for kind in EVALUATORS}
    assert all(20 <= len(v) <= 30 for v in per_type.values())  # "20-30 answers per evaluator"
    for kind, rows in per_type.items():
        scores = [c["expected_score"] for c in rows]
        assert min(scores) <= 1 and max(scores) >= 9, f"{kind}: needs the full weak → strong range"
    assert all(c.get("note") for c in cases), "every hand score explains itself"


def test_spearman():
    assert runner.spearman([1, 2, 3, 4], [10, 20, 30, 40]) == pytest.approx(1)
    assert runner.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == pytest.approx(-1)
    assert runner.spearman([1, 2, 3], [1, 1, 1]) != runner.spearman([1, 2, 3], [1, 1, 1])  # nan: no variation
    assert runner._ranks([5, 1, 5, 3]) == [3.5, 1, 3.5, 2]


def test_pairwise_agreement():
    rows = [{"question_id": "q", "expected_score": s, "model_score": m} for s, m in [(1, 2), (5, 4), (9, 9)]]
    assert runner.pairwise_agreement(rows) == 1.0
    rows[0]["model_score"] = 6  # now ranked above the 5 → one of three pairs reversed
    assert runner.pairwise_agreement(rows) == pytest.approx(2 / 3)
    rows[0]["model_score"] = 4  # tied with the 5 → half credit for that pair
    assert runner.pairwise_agreement(rows) == pytest.approx(2.5 / 3)
    cross = [{"question_id": "a", "expected_score": 1, "model_score": 9}, {"question_id": "b", "expected_score": 9, "model_score": 1}]
    assert math.isnan(runner.pairwise_agreement(cross))  # only compared within a question


def test_full_run_against_a_perfect_fake(dataset):
    cases, questions = dataset
    by_answer = {c["answer"]: c["expected_score"] for c in cases}

    def perfect(args):
        answer = args["prompt"].split("<<<ANSWER\n", 1)[1].split("\nANSWER>>>", 1)[0]
        base = BEHAVIORAL_EVALUATION if args["schema"] is EVALUATORS["behavioral"].schema else GOOD_EVALUATION
        return {**base, "overall_score": by_answer[answer]}

    gw = FakeAIGateway(session_token_budget=10**9).script("structured", *[perfect] * len(cases))
    run = asyncio.run(runner.run_cases(gw, cases, questions, EVALUATORS))
    assert not run.failures
    for kind, rows in run.rows.items():
        s = runner.summarise(rows)
        assert (s["mae"], s["bias"], s["spearman"], s["pairwise"], s["tier"]) == (0, 0, 1.0, 1.0, 1.0), kind
    prompts = {c["context"].prompt_version for c in gw.calls_of("structured")}
    assert prompts == {"evaluator/technical_v1", "evaluator/behavioral_v1"}


def test_failures_are_reported_not_fatal(dataset):
    from app.gateway.groq_gateway import LLMOutputError
    cases, questions = dataset
    gw = FakeAIGateway().script("structured", LLMOutputError("bad json"))
    run = asyncio.run(runner.run_cases(gw, cases[:1], questions, EVALUATORS))
    assert run.failures and run.failures[0]["id"] == cases[0]["id"] and not run.rows
