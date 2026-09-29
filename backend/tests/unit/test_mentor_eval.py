"""The Mentor eval runner (evaluation/mentor_eval/run_mentor_eval.py): dataset and a run on the fake gateway."""
import asyncio
import importlib.util
from pathlib import Path

from app.core.mentor.rag_tool import MentorChatRequest
from app.core.mentor.rag_tool.service import NO_DATA_MESSAGE
from app.gateway import FakeAIGateway

ROOT = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location("run_mentor_eval", ROOT / "evaluation/mentor_eval/run_mentor_eval.py")
runner = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(runner)


def test_dataset_cases_are_valid():
    cases = runner.load_cases()
    assert len(cases) >= 19 and len({c["id"] for c in cases}) == len(cases)
    for case in cases:
        MentorChatRequest.model_validate(case["request"])
        for entry in case["setup"]:
            assert entry["user_id"] == case["request"]["user_id"]  # every report belongs to the asker
            runner.build_report(entry)
        assert case["pass_criteria"]


def test_auto_checks_catch_orphan_citations_and_dedupe_overflow():
    case = {"setup": [{}]}
    sources = [{"session_id": "s1"}, {"session_id": "s1"}]
    assert runner.auto_checks(case, "a [1] b [2]", sources) == {"citations": True, "dedupe": True}
    assert runner.auto_checks(case, "a [3]", sources)["citations"] is False
    assert runner.auto_checks(case, "a", sources * 2)["dedupe"] is False


def test_a_run_on_the_fake_gateway_uses_the_versioned_prompt():
    cases = {c["id"]: c for c in runner.load_cases()}
    gateway = FakeAIGateway(session_token_budget=10**9)
    gateway.script("generate", "Joins were solid [1].")
    rows = asyncio.run(runner.run_cases(gateway, [cases["specific_single_session"], cases["zero_reports"]]))
    assert rows[0]["sources"] and all(rows[0]["checks"].values())
    assert rows[1]["answer"] == NO_DATA_MESSAGE and rows[1]["checks"]["no-data"] is True
    [call] = gateway.calls_of("generate")
    assert call["context"].prompt_version == "mentor/mentor_v1" and "Practice requests:" in call["prompt"]
