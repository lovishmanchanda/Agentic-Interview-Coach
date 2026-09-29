"""Walking skeleton (implementation_plan.md 1.0), end to end over a real WebSocket, with one question:
register -> profile -> create interview -> AUTH -> SESSION_SNAPSHOT -> QUESTION -> ANSWER
-> PROCESSING -> EVALUATION -> INTERVIEW_COMPLETE -> report -> RAG index -> Mentor cites it.
"""
import asyncio

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.mentor.rag_tool import RagService
from app.db.seed import load_seed_questions, seed_question_bank
from app.main import create_app
from app.utils.exceptions import ServiceUnavailableError
from tests.fakes import GOOD_EVALUATION, HashEmbeddings, drain_indexing
from tests.integration.test_profiles_api import PROFILE

ONE_QUESTION = {"question_count": 1}


@pytest.fixture
def rag(tmp_path):
    return RagService(HashEmbeddings(), str(tmp_path / "chroma"), "skeleton_test")


@pytest.fixture
def app_client(settings, mock_db, gateway, rag):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    with TestClient(create_app(settings, db=mock_db, gateway=gateway, rag=rag)) as client:
        yield client


def _signup(client, email="ada@example.com"):
    data = client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse-1", "name": "Ada"}).json()["data"]
    token = data["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/v1/profiles", json=PROFILE, headers=headers).status_code == 201
    return token, headers


def _open(client, session_id, token):
    ws = client.websocket_connect(f"/ws/interview/{session_id}")
    ws.__enter__()
    ws.send_json({"type": "AUTH", "token": token})
    return ws


def test_full_skeleton_flow(app_client, gateway, rag):
    token, headers = _signup(app_client)
    created = app_client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers)
    assert created.status_code == 201
    session_id = created.json()["data"]["session_id"]

    gateway.script("structured", GOOD_EVALUATION)
    ws = _open(app_client, session_id, token)
    snapshot = ws.receive_json()
    assert snapshot["type"] == "SESSION_SNAPSHOT" and snapshot["payload"]["state"] == "SETUP"
    question = ws.receive_json()
    assert question["type"] == "QUESTION"
    assert question["payload"]["question_number"] == 1 and question["payload"]["total_questions"] == 1

    ws.send_json({"type": "ANSWER", "answer_text": "A hash map hashes the key to a bucket; collisions use chaining."})
    assert ws.receive_json()["type"] == "PROCESSING"
    evaluation = ws.receive_json()
    assert evaluation["type"] == "EVALUATION"
    assert evaluation["payload"]["overall_score"] == 6.5
    assert evaluation["payload"]["performance_tier"] == "adequate"
    complete = ws.receive_json()
    assert complete["type"] == "INTERVIEW_COMPLETE" and complete["state"] == "REPORT_READY"
    report_id = complete["payload"]["report_id"]
    ws.__exit__(None, None, None)
    drain_indexing(app_client)  # Mentor indexing runs in the background once the report is out

    # The evaluator ran on the fast tier with the versioned prompt.
    call = gateway.calls_of("structured")[0]
    assert call["tier"] == "fast" and call["context"].prompt_version == "evaluator/technical_v1"
    assert "A hash map hashes the key" in call["prompt"]

    report = app_client.get(f"/api/v1/reports/{report_id}", headers=headers).json()["data"]
    assert report["scores"]["overall"] == 6.5
    assert report["rag_indexed"] is True
    assert "rag_chunk_ids" not in report
    roles = [t["role"] for t in report["transcript"]]
    assert roles == ["interviewer", "candidate", "evaluation"]
    assert report["transcript"][2]["evaluation"]["model_answer_outline"]

    assert app_client.get("/api/v1/interviews", headers=headers).json()["data"][0]["report_id"] == report_id

    # Mentor: vague question -> recency retrieval -> cites this session.
    gateway.script("generate", "You have solid hashing basics [1]; next, practise load factor and resizing [2].")
    mentor = app_client.post("/api/v1/mentor/message", json={"message": "How am I doing?"}, headers=headers)
    assert mentor.status_code == 200, mentor.text
    data = mentor.json()["data"]
    assert "[1]" in data["answer"]
    assert data["sources"] and all(s["session_id"] == session_id for s in data["sources"])
    mentor_prompt = gateway.calls_of("generate")[-1]["prompt"]
    assert "Did not mention resizing or load factor" in mentor_prompt


def test_reconnect_after_completion_resumes_from_snapshot(app_client, gateway):
    token, headers = _signup(app_client)
    session_id = app_client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).json()["data"]["session_id"]
    gateway.script("structured", GOOD_EVALUATION)
    ws = _open(app_client, session_id, token)
    for _ in range(2):
        ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "Buckets and chaining."})
    for _ in range(3):
        ws.receive_json()
    ws.__exit__(None, None, None)

    ws = _open(app_client, session_id, token)
    snapshot = ws.receive_json()["payload"]
    assert snapshot["state"] == "REPORT_READY" and snapshot["report_id"]
    assert [t["role"] for t in snapshot["transcript"]] == ["interviewer", "candidate", "evaluation"]
    ws.send_json({"type": "PING"})
    assert ws.receive_json()["type"] == "PONG"  # no second QUESTION was sent
    ws.__exit__(None, None, None)


def test_reconnect_mid_question_does_not_ask_twice(app_client):
    token, headers = _signup(app_client)
    session_id = app_client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).json()["data"]["session_id"]
    ws = _open(app_client, session_id, token)
    asked = [ws.receive_json(), ws.receive_json()][1]["payload"]
    ws.__exit__(None, None, None)

    ws = _open(app_client, session_id, token)
    snapshot = ws.receive_json()["payload"]
    assert snapshot["state"] == "WAITING_FOR_RESPONSE"
    assert snapshot["current_question"]["question_id"] == asked["question_id"]
    ws.send_json({"type": "PING"})
    assert ws.receive_json()["type"] == "PONG"
    ws.__exit__(None, None, None)


def test_evaluation_failure_is_retryable(app_client, gateway):
    token, headers = _signup(app_client)
    session_id = app_client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).json()["data"]["session_id"]
    gateway.script("structured", ServiceUnavailableError("busy", code="llm_rate_limited"), GOOD_EVALUATION)
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()

    ws.send_json({"type": "ANSWER", "answer_text": "first try"})
    assert ws.receive_json()["type"] == "PROCESSING"
    error = ws.receive_json()
    assert error["type"] == "ERROR" and error["payload"]["code"] == "llm_rate_limited"
    assert error["payload"]["retryable"] is True and error["state"] == "WAITING_FOR_RESPONSE"

    ws.send_json({"type": "ANSWER", "answer_text": "second try"})
    assert [ws.receive_json()["type"] for _ in range(3)] == ["PROCESSING", "EVALUATION", "INTERVIEW_COMPLETE"]
    ws.__exit__(None, None, None)


def test_invalid_answers_are_rejected_without_state_change(app_client, settings):
    token, headers = _signup(app_client)
    session_id = app_client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).json()["data"]["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "   "})
    assert ws.receive_json()["payload"]["code"] == "answer_empty"
    ws.send_json({"type": "ANSWER", "answer_text": "x" * (settings.max_answer_chars + 1)})
    assert ws.receive_json()["payload"]["code"] == "answer_too_long"
    ws.send_json({"type": "DANCE"})
    assert ws.receive_json()["payload"]["code"] == "unknown_event"
    ws.__exit__(None, None, None)
    assert app_client.get(f"/api/v1/interviews/{session_id}", headers=headers).json()["data"]["state"] == "WAITING_FOR_RESPONSE"


@pytest.mark.parametrize("first_message, code", [
    ({"type": "ANSWER", "answer_text": "hi"}, 4400),
    ({"type": "AUTH", "token": "garbage"}, 4401),
])
def test_ws_rejects_bad_handshake(app_client, first_message, code):
    _, headers = _signup(app_client)
    session_id = app_client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).json()["data"]["session_id"]
    with app_client.websocket_connect(f"/ws/interview/{session_id}") as ws:
        ws.send_json(first_message)
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == code


def test_ws_cannot_open_someone_elses_session(app_client):
    _, ada_headers = _signup(app_client, "ada@example.com")
    bob_token, _ = _signup(app_client, "bob@example.com")
    session_id = app_client.post("/api/v1/interviews", json=ONE_QUESTION, headers=ada_headers).json()["data"]["session_id"]
    with app_client.websocket_connect(f"/ws/interview/{session_id}") as ws:
        ws.send_json({"type": "AUTH", "token": bob_token})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 4404


def test_reports_and_sessions_are_private(app_client, gateway):
    ada_token, ada_headers = _signup(app_client, "ada@example.com")
    _, bob_headers = _signup(app_client, "bob@example.com")
    session_id = app_client.post("/api/v1/interviews", json=ONE_QUESTION, headers=ada_headers).json()["data"]["session_id"]
    assert app_client.get(f"/api/v1/interviews/{session_id}", headers=bob_headers).status_code == 404
    gateway.script("structured", GOOD_EVALUATION)
    ws = _open(app_client, session_id, ada_token)
    ws.receive_json(), ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "Buckets."})
    report_id = [ws.receive_json() for _ in range(3)][-1]["payload"]["report_id"]
    ws.__exit__(None, None, None)
    drain_indexing(app_client)
    assert app_client.get(f"/api/v1/reports/{report_id}", headers=bob_headers).status_code == 404
    # Bob's Mentor never sees Ada's report.
    gateway.script("generate", "should not be called")
    bob_mentor = app_client.post("/api/v1/mentor/message", json={"message": "How am I doing?"}, headers=bob_headers).json()["data"]
    assert bob_mentor["sources"] == []


def test_interview_requires_profile(app_client):
    data = app_client.post("/api/v1/auth/register", json={"email": "np@example.com", "password": "correct-horse-1", "name": "N"}).json()["data"]
    headers = {"Authorization": f"Bearer {data['tokens']['access_token']}"}
    response = app_client.post("/api/v1/interviews", json={}, headers=headers)
    assert response.status_code == 409 and response.json()["error"]["code"] == "profile_missing"


def test_mentor_disabled_without_rag(client, register):
    headers, _ = register()
    response = client.post("/api/v1/mentor/message", json={"message": "hi"}, headers=headers)
    assert response.status_code == 503 and response.json()["error"]["code"] == "mentor_disabled"
