"""Multi-question interviews (implementation_plan.md 1.1 / 1.4): bank selection, LLM generation on a
bank miss, wrap-up on question count or token budget, and resuming between questions."""
import asyncio
import copy

import pytest
from fastapi.testclient import TestClient

from app.core.mentor.rag_tool import RagService
from app.db.seed import load_seed_questions, seed_question_bank
from app.gateway import FakeAIGateway
from app.main import create_app
from app.utils.exceptions import ServiceUnavailableError
from tests.fakes import GOOD_EVALUATION, HashEmbeddings
from tests.integration.test_profiles_api import PROFILE
from tests.integration.test_walking_skeleton import _open

GENERATED = {
    "topic": "javascript",
    "subtopic": "event_loop",
    "question_text": "Walk me through how the JavaScript event loop handles a resolved promise and a setTimeout(0).",
    "expected_concepts": ["call stack", "microtask queue runs before macrotasks", "setTimeout is a macrotask"],
    "evaluation_rubric": {"excellent": "Orders both correctly and explains why.", "good": "Right order, thin reasoning.",
                          "weak": "Wrong order or no queues mentioned."},
    "follow_up_possibilities": ["Where does requestAnimationFrame fit?"],
}


@pytest.fixture
def gateway() -> FakeAIGateway:
    return FakeAIGateway(session_token_budget=100_000)


@pytest.fixture
def app_client(settings, mock_db, gateway, tmp_path):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    rag = RagService(HashEmbeddings(), str(tmp_path / "chroma"), "multi_question_test")
    with TestClient(create_app(settings, db=mock_db, gateway=gateway, rag=rag)) as client:
        yield client


def _signup(client, *, role="Software Engineer", email="ada@example.com"):
    data = client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse-1", "name": "Ada"}).json()["data"]
    profile = copy.deepcopy(PROFILE)
    profile["target"]["role"] = role
    headers = {"Authorization": f"Bearer {data['tokens']['access_token']}"}
    assert client.post("/api/v1/profiles", json=profile, headers=headers).status_code == 201
    return data["tokens"]["access_token"], headers


def _create(client, headers, count):
    response = client.post("/api/v1/interviews", json={"question_count": count}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["data"]["session_id"]


def _answer(ws, text="Hashing, buckets, collisions and resizing."):
    ws.send_json({"type": "ANSWER", "answer_text": text})
    events = [ws.receive_json() for _ in range(3)]
    assert [e["type"] for e in events[:2]] == ["PROCESSING", "EVALUATION"]
    return events[2]


def test_three_question_interview_from_the_bank(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 3)
    gateway.script("structured", GOOD_EVALUATION, GOOD_EVALUATION, GOOD_EVALUATION)

    ws = _open(app_client, session_id, token)
    assert ws.receive_json()["payload"]["total_questions"] == 3
    questions = [ws.receive_json()]
    questions.append(_answer(ws))
    questions.append(_answer(ws))
    complete = _answer(ws)
    ws.__exit__(None, None, None)

    assert [q["type"] for q in questions] == ["QUESTION"] * 3
    assert [q["payload"]["question_number"] for q in questions] == [1, 2, 3]
    assert len({q["payload"]["question_id"] for q in questions}) == 3
    # Topic variety: a new topic every question while the bank has one.
    assert len({q["payload"]["topic"] for q in questions}) == 3
    # Profile: "Software Engineer", 1-2 years, adaptive difficulty -> medium questions for software_engineer.
    stored = asyncio.run(mock_db["interview_questions"].find({"session_id": session_id}).to_list(length=10))
    assert all(q["difficulty"] == "medium" and q["source"] == "bank" for q in stored)
    bank = {q["question_id"]: q for q in asyncio.run(mock_db["question_bank"].find({}).to_list(length=100))}
    assert all("software_engineer" in bank[q["bank_question_id"]]["roles"] for q in stored)

    assert complete["type"] == "INTERVIEW_COMPLETE"
    report = app_client.get(f"/api/v1/reports/{complete['payload']['report_id']}", headers=headers).json()["data"]
    assert [t["role"] for t in report["transcript"]] == ["interviewer", "candidate", "evaluation"] * 3
    assert len(report["per_topic_scores"]) == 3

    session = app_client.get(f"/api/v1/interviews/{session_id}", headers=headers).json()["data"]
    assert session["state"] == "REPORT_READY" and session["questions_asked"] == 3


def test_bank_miss_generates_a_question(app_client, gateway, mock_db):
    # No technical bank question lists "frontend", so both questions are written by the LLM.
    second = {**GENERATED, "topic": "anything", "question_text": "How would you find what makes a web page slow to render?"}
    gateway.script("structured", GENERATED, GOOD_EVALUATION, second, GOOD_EVALUATION)
    token, headers = _signup(app_client, role="Frontend Developer")
    session_id = _create(app_client, headers, 2)

    ws = _open(app_client, session_id, token)
    ws.receive_json()
    first = ws.receive_json()["payload"]
    assert "event loop" in first["text"] and first["topic"] == "javascript"
    nxt = _answer(ws)
    assert nxt["type"] == "QUESTION"
    assert nxt["payload"]["topic"] == "web_performance"  # our topic label wins over the model's
    assert _answer(ws)["type"] == "INTERVIEW_COMPLETE"
    ws.__exit__(None, None, None)

    generation_calls = [c for c in gateway.calls_of("structured") if c["context"].prompt_version.startswith("interviewer/")]
    assert len(generation_calls) == 2
    assert generation_calls[0]["tier"] == "default"
    assert "Frontend Developer" in generation_calls[0]["prompt"]
    assert "event loop" in generation_calls[1]["prompt"]  # told not to repeat question 1

    stored = asyncio.run(mock_db["interview_questions"].find({"session_id": session_id}).to_list(length=10))
    assert all(q["source"] == "llm_generated" and q["bank_question_id"] is None for q in stored)
    assert stored[0]["expected_concepts"] == GENERATED["expected_concepts"]
    assert stored[0]["prompt_version_used"] == "interviewer/question_generation_v1"
    # The evaluator grades against the generated question's own concepts.
    assert "microtask queue runs before macrotasks" in gateway.calls_of("structured")[1]["prompt"]
    # Generated questions are not written back to the shared bank.
    assert asyncio.run(mock_db["question_bank"].count_documents({"source": "llm_generated"})) == 0


def test_generation_failure_on_first_question_is_reported(app_client, gateway):
    gateway.script("structured", ServiceUnavailableError("down", code="llm_unavailable"))
    token, headers = _signup(app_client, role="Frontend Developer")
    session_id = _create(app_client, headers, 2)
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    error = ws.receive_json()
    assert error["type"] == "ERROR" and error["payload"]["code"] == "question_unavailable"
    ws.__exit__(None, None, None)

    # Nothing was asked, so reconnecting tries again.
    gateway.script("structured", GENERATED)
    ws = _open(app_client, session_id, token)
    assert ws.receive_json()["payload"]["state"] == "SETUP"
    assert ws.receive_json()["type"] == "QUESTION"
    ws.__exit__(None, None, None)


def test_generation_failure_mid_interview_wraps_up(app_client, gateway):
    gateway.script("structured", GENERATED, GOOD_EVALUATION, ServiceUnavailableError("down", code="llm_unavailable"))
    token, headers = _signup(app_client, role="Frontend Developer")
    session_id = _create(app_client, headers, 3)
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    complete = _answer(ws)
    ws.__exit__(None, None, None)
    assert complete["type"] == "INTERVIEW_COMPLETE"
    report = app_client.get(f"/api/v1/reports/{complete['payload']['report_id']}", headers=headers).json()["data"]
    assert [t["role"] for t in report["transcript"]] == ["interviewer", "candidate", "evaluation"]


def test_low_token_budget_wraps_up_early(settings, mock_db, tmp_path):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    gateway = FakeAIGateway(session_token_budget=1_000)  # below the engine's per-question reserve
    with TestClient(create_app(settings, db=mock_db, gateway=gateway)) as client:
        token, headers = _signup(client)
        session_id = _create(client, headers, 3)
        gateway.script("structured", GOOD_EVALUATION)
        ws = _open(client, session_id, token)
        ws.receive_json(), ws.receive_json()
        assert _answer(ws)["type"] == "INTERVIEW_COMPLETE"
        ws.__exit__(None, None, None)


def test_reconnect_between_questions_asks_the_next_one(app_client, mock_db):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 2)
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    first = ws.receive_json()["payload"]
    ws.__exit__(None, None, None)

    # Simulate a server that stopped right after evaluating question 1.
    asyncio.run(mock_db["interview_sessions"].update_one(
        {"session_id": session_id}, {"$set": {"state": "NEXT_TOPIC", "topics_covered": [first["topic"]]}}))
    ws = _open(app_client, session_id, token)
    assert ws.receive_json()["payload"]["state"] == "NEXT_TOPIC"
    nxt = ws.receive_json()
    ws.__exit__(None, None, None)
    assert nxt["type"] == "QUESTION" and nxt["payload"]["question_number"] == 2
    assert nxt["payload"]["question_id"] != first["question_id"] and nxt["payload"]["topic"] != first["topic"]


def test_next_interview_avoids_recently_asked_questions(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    seen = []
    for _ in range(3):
        session_id = _create(app_client, headers, 1)
        gateway.script("structured", GOOD_EVALUATION)
        ws = _open(app_client, session_id, token)
        ws.receive_json(), ws.receive_json()
        _answer(ws)
        ws.__exit__(None, None, None)
        doc = asyncio.run(mock_db["interview_questions"].find_one({"session_id": session_id}))
        seen.append(doc["bank_question_id"])
    assert len(set(seen)) == 3


@pytest.mark.parametrize("count", [0, 6])
def test_question_count_is_validated(app_client, count):
    _, headers = _signup(app_client)
    response = app_client.post("/api/v1/interviews", json={"question_count": count}, headers=headers)
    assert response.status_code == 422
