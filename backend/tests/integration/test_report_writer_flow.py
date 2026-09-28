"""A full interview with the Groq-written report on (implementation_plan.md 1.10)."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core.mentor.rag_tool import RagService
from app.db.seed import load_seed_questions, seed_question_bank
from app.gateway import FakeAIGateway
from app.main import create_app
from app.utils.exceptions import ServiceUnavailableError
from tests.fakes import GOOD_EVALUATION, HashEmbeddings
from tests.integration.test_interview_config import _create
from tests.integration.test_multi_question_interview import _answer, _signup
from tests.integration.test_walking_skeleton import _open


def narrative_for(topic):
    return {
        "summary": "You explained the core mechanism clearly but skipped how the structure grows under load.",
        "strong_areas": ["Clear, structured explanations"],
        "weak_areas": [{"topic": topic, "reason": "Didn't cover resizing and the load factor."}],
        "recommendations": [{"topic": topic, "action": "Explain rehashing out loud with a 4-slot example."},
                            {"topic": "general", "action": "Close each answer with complexity."}],
        "estimated_days": 3,
        "study_plan": ["Rehashing walkthrough", "Timed mock answer"],
    }


@pytest.fixture
def gateway() -> FakeAIGateway:
    return FakeAIGateway(session_token_budget=100_000)


@pytest.fixture
def rag(tmp_path):
    return RagService(HashEmbeddings(), str(tmp_path / "chroma"), "report_writer_test")


@pytest.fixture
def app_client(settings, mock_db, gateway, rag):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    app = create_app(settings.model_copy(update={"report_writer": True}), db=mock_db, gateway=gateway, rag=rag)
    with TestClient(app) as client:
        yield client


def _one_question_interview(client, gateway, second):
    token, headers = _signup(client)
    session_id = _create(client, headers, question_count=1)["session_id"]
    ws = _open(client, session_id, token)
    ws.receive_json()
    topic = ws.receive_json()["payload"]["topic"]
    gateway.script("structured", GOOD_EVALUATION, second(topic) if callable(second) else second)
    complete = _answer(ws, "Buckets and chaining, O(1) average.")
    ws.__exit__(None, None, None)
    assert complete["type"] == "INTERVIEW_COMPLETE"
    report = client.get(f"/api/v1/reports/{complete['payload']['report_id']}", headers=headers).json()["data"]
    return report, topic, headers


def test_groq_writes_the_words_and_the_numbers_stay_computed(app_client, gateway, rag):
    report, topic, _ = _one_question_interview(app_client, gateway, narrative_for)
    assert report["narrative_source"] == "llm" and report["prompt_version_used"] == "report/report_v1"
    assert report["summary"].startswith("You explained the core mechanism")
    assert report["weak_areas"] == [{"topic": topic, "severity": "medium", "reason": "Didn't cover resizing and the load factor."}]
    assert report["suggested_preparation_plan"]["estimated_days"] == 3
    assert report["suggested_preparation_plan"]["steps"] == ["Rehashing walkthrough", "Timed mock answer"]
    assert report["scores"] == {"overall": 6.5, "technical": 6.0, "communication": 7.0}  # from GOOD_EVALUATION
    # The writer saw the evaluator's notes, not the answer itself.
    prompt = gateway.calls_of("structured")[-1]["prompt"]
    assert "Did not mention resizing or load factor" in prompt and "Buckets and chaining" not in prompt
    # The Mentor indexes the written report.
    summary_chunk = rag.collection.get(ids=[f"{report['session_id']}:summary"], include=["documents"])["documents"][0]
    assert "skipped how the structure grows under load" in summary_chunk


def test_a_writer_outage_falls_back_to_the_computed_report(app_client, gateway):
    report, _, _ = _one_question_interview(app_client, gateway, ServiceUnavailableError("down", code="llm_unavailable"))
    assert report["narrative_source"] == "fallback" and report["prompt_version_used"] == "report/skeleton_v0"
    assert report["summary"] == GOOD_EVALUATION["feedback"] and report["weak_areas"]


def test_invalid_narrative_output_falls_back(app_client, gateway):
    report, _, _ = _one_question_interview(app_client, gateway, {"summary": "too short"})
    assert report["narrative_source"] == "fallback"
