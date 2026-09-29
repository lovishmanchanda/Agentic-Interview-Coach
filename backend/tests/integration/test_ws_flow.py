"""The WebSocket flow (implementation_plan.md 1.9): every event the server sends matches the §13 contract,
drafts survive reconnects, hints work in practice mode only, and the protocol guards hold."""
import asyncio

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.api.ws_protocol import OUTBOUND
from app.db.seed import load_seed_questions, seed_question_bank
from app.gateway import FakeAIGateway
from app.main import create_app
from app.utils.exceptions import ServiceUnavailableError
from tests.fakes import GOOD_EVALUATION
from tests.integration.test_interview_config import _create
from tests.integration.test_multi_question_interview import _signup, app_client, gateway  # noqa: F401
from tests.integration.test_walking_skeleton import _open


class Recorder:
    """Wraps the test socket and checks every event against the protocol models as it arrives."""

    def __init__(self, ws):
        self.ws = ws
        self.seen: list[str] = []

    def receive(self) -> dict:
        evt = self.ws.receive_json()
        assert set(evt) == {"type", "state", "payload"}, evt
        assert evt["type"] in OUTBOUND, f"undocumented event {evt['type']}"
        model = OUTBOUND[evt["type"]]
        if model is not None:
            model.model_validate(evt["payload"])
        self.seen.append(evt["type"])
        return evt

    def send(self, data: dict) -> None:
        self.ws.send_json(data)

    def close(self):
        self.ws.__exit__(None, None, None)


def _connect(client, session_id, token) -> Recorder:
    return Recorder(_open(client, session_id, token))


def test_every_event_in_a_practice_interview_matches_the_contract(app_client, gateway):
    gateway.script("structured", GOOD_EVALUATION, GOOD_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=2)["session_id"]
    ws = _connect(app_client, session_id, token)
    ws.receive()                                    # SESSION_SNAPSHOT
    assert ws.receive()["payload"]["hints_left"] == 1  # QUESTION
    ws.send({"type": "ANSWER_DRAFT", "answer_text": "Buckets"})
    ws.send({"type": "HINT_REQUEST", "draft_text": "Buckets"})
    assert ws.receive()["type"] == "HINT"
    ws.send({"type": "ANSWER", "answer_text": "Buckets and chaining."})
    for _ in range(3):
        ws.receive()                                # PROCESSING, EVALUATION, QUESTION
    ws.send({"type": "ANSWER", "answer_text": "Normalisation."})
    for _ in range(3):
        ws.receive()                                # PROCESSING, EVALUATION, INTERVIEW_COMPLETE
    ws.send({"type": "PING"})
    ws.receive()
    ws.send({"type": "DANCE"})
    ws.receive()
    ws.close()
    assert set(ws.seen) == {"SESSION_SNAPSHOT", "QUESTION", "HINT", "PROCESSING", "EVALUATION",
                            "INTERVIEW_COMPLETE", "PONG", "ERROR"}

    # A reconnect after the end: the snapshot (with the hint in the transcript) matches too.
    ws = _connect(app_client, session_id, token)
    snapshot = ws.receive()["payload"]
    ws.close()
    assert [t["role"] for t in snapshot["transcript"]][:3] == ["interviewer", "hint", "candidate"]


def test_serious_mode_events_match_the_contract(app_client, gateway):
    gateway.script("structured", GOOD_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, interview_mode="serious", question_count=1)["session_id"]
    ws = _connect(app_client, session_id, token)
    ws.receive()
    assert ws.receive()["payload"]["hints_left"] == 0
    ws.send({"type": "HINT_REQUEST"})
    assert ws.receive()["payload"]["code"] == "hints_unavailable"
    ws.send({"type": "ANSWER", "answer_text": "Buckets."})
    assert [ws.receive()["type"] for _ in range(2)] == ["PROCESSING", "INTERVIEW_COMPLETE"]
    ws.close()


def test_a_draft_survives_a_reconnect_and_is_cleared_by_the_answer(app_client, gateway):
    gateway.script("structured", GOOD_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=2)["session_id"]
    ws = _connect(app_client, session_id, token)
    ws.receive(), ws.receive()
    ws.send({"type": "ANSWER_DRAFT", "answer_text": "A hash map uses buck"})
    ws.send({"type": "ANSWER_DRAFT", "answer_text": "A hash map uses buckets and"})  # the latest one wins
    ws.send({"type": "PING"})
    ws.receive()  # PONG: the drafts before it have been handled
    ws.close()

    ws = _connect(app_client, session_id, token)
    assert ws.receive()["payload"]["draft_answer"] == "A hash map uses buckets and"
    ws.send({"type": "ANSWER", "answer_text": "A hash map uses buckets and chaining."})
    [ws.receive() for _ in range(3)]  # PROCESSING, EVALUATION, QUESTION 2
    ws.send({"type": "ANSWER_DRAFT", "answer_text": "late draft for question 2"})
    ws.send({"type": "PING"})
    ws.receive()
    ws.close()

    ws = _connect(app_client, session_id, token)
    snapshot = ws.receive()["payload"]
    ws.close()
    assert snapshot["draft_answer"] == "late draft for question 2"  # belongs to question 2, not question 1


def test_a_draft_sent_when_no_question_is_waiting_is_ignored(app_client, gateway, mock_db):
    gateway.script("structured", GOOD_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=1)["session_id"]
    ws = _connect(app_client, session_id, token)
    ws.receive(), ws.receive()
    ws.send({"type": "ANSWER", "answer_text": "Buckets."})
    [ws.receive() for _ in range(3)]
    ws.send({"type": "ANSWER_DRAFT", "answer_text": "too late"})
    ws.send({"type": "PING"})
    assert ws.receive()["type"] == "PONG"  # no error for a harmless late autosave
    ws.close()
    doc = asyncio.run(mock_db["interview_sessions"].find_one({"session_id": session_id}))
    assert doc.get("draft_answer") is None


def test_hints_one_per_question_and_shown_in_the_transcript(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=1)["session_id"]
    ws = _connect(app_client, session_id, token)
    ws.receive()
    question = ws.receive()["payload"]
    ws.send({"type": "HINT_REQUEST", "draft_text": ""})
    hint = ws.receive()["payload"]
    ws.send({"type": "HINT_REQUEST"})
    again = ws.receive()["payload"]
    ws.close()
    assert hint["question_id"] == question["question_id"] and hint["hints_left"] == 0
    assert hint["text"].startswith("Think about ")  # the agent is off in this app: deterministic fallback
    assert again["code"] == "hint_limit_reached"

    ws = _connect(app_client, session_id, token)
    snapshot = ws.receive()["payload"]
    ws.close()
    assert snapshot["current_question"]["hints_left"] == 0
    assert {"role": "hint", "question_id": question["question_id"], "content": hint["text"]} in snapshot["transcript"]
    stored = asyncio.run(mock_db["interview_questions"].find_one({"question_id": question["question_id"]}))
    assert stored["hints"][0]["source"] == "fallback"


def test_hint_only_while_a_question_is_waiting(app_client, gateway):
    gateway.script("structured", GOOD_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=1)["session_id"]
    ws = _connect(app_client, session_id, token)
    ws.receive(), ws.receive()
    ws.send({"type": "ANSWER", "answer_text": "Buckets."})
    [ws.receive() for _ in range(3)]
    ws.send({"type": "HINT_REQUEST"})
    assert ws.receive()["payload"]["code"] == "no_active_question"
    ws.close()


@pytest.fixture
def agent_client(settings, mock_db, tmp_path):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    gw = FakeAIGateway(session_token_budget=100_000)
    app = create_app(settings.model_copy(update={"interview_agent": True}), db=mock_db, gateway=gw)
    with TestClient(app) as client:
        yield client, gw


def test_the_agent_writes_the_hint_and_the_run_is_recorded(agent_client, mock_db):
    client, gw = agent_client
    gw.script("structured", {"opening": "Hi Ada. Let's start:"},
              {"hint": "What happens to the table as more and more keys are added?"})
    token, headers = _signup(client)
    session_id = _create(client, headers, question_count=1)["session_id"]
    ws = _connect(client, session_id, token)
    ws.receive(), ws.receive()
    ws.send({"type": "HINT_REQUEST", "draft_text": "Keys are hashed to buckets."})
    hint = ws.receive()["payload"]
    ws.close()
    assert hint["text"] == "What happens to the table as more and more keys are added?"
    call = gw.calls_of("structured")[1]
    assert call["tier"] == "fast" and call["context"].prompt_version == "interviewer/hint_v1"
    assert "<<<DRAFT\nKeys are hashed to buckets.\nDRAFT>>>" in call["prompt"]
    runs = asyncio.run(mock_db["agent_runs"].find({"session_id": session_id, "step": "hint"}).to_list(5))
    assert runs[0]["outcome"] == "accepted"


def test_agent_hint_failure_falls_back(agent_client):
    client, gw = agent_client
    gw.script("structured", {"opening": "Hi."}, ServiceUnavailableError("down", code="llm_unavailable"))
    token, headers = _signup(client)
    session_id = _create(client, headers, question_count=1)["session_id"]
    ws = _connect(client, session_id, token)
    ws.receive(), ws.receive()
    ws.send({"type": "HINT_REQUEST"})
    assert ws.receive()["payload"]["text"].startswith("Think about ")
    ws.close()


# ── protocol guards ──

def test_oversized_and_malformed_messages_are_refused_but_the_socket_stays_usable(app_client):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=1)["session_id"]
    ws = _connect(app_client, session_id, token)
    ws.receive(), ws.receive()
    ws.send({"type": "ANSWER", "answer_text": "x" * 70_000})
    assert ws.receive()["payload"]["code"] == "message_too_large"
    ws.ws.send_text("{not json")
    assert ws.receive()["payload"]["code"] == "bad_message"
    ws.send({"type": "AUDIO_CHUNK", "data": "x"})
    assert ws.receive()["payload"]["code"] == "event_unavailable"
    ws.send({"type": "CODE_SUBMIT", "code": "print(1)"})  # a text question isn't waiting for code
    assert ws.receive()["payload"]["code"] == "not_accepting_answers"
    ws.send({"type": "ANSWER", "answer_text": 5})
    assert ws.receive()["payload"]["code"] == "bad_message"
    ws.send({"type": "PING"})
    assert ws.receive()["type"] == "PONG"
    ws.close()


def test_rate_limit_then_close_on_abuse(app_client):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=1)["session_id"]
    ws = _connect(app_client, session_id, token)
    ws.receive(), ws.receive()
    for _ in range(31):
        ws.send({"type": "PING"})
    replies = [ws.receive() for _ in range(31)]
    assert [r["type"] for r in replies].count("PONG") == 30
    assert replies[-1]["payload"]["code"] == "rate_limited" and replies[-1]["payload"]["retryable"] is True
    for _ in range(60):
        ws.send({"type": "PING"})
    with pytest.raises(WebSocketDisconnect) as exc:
        while True:
            ws.ws.receive_json()
    ws.close()  # release the test session after the server hung up, or the test client waits forever
    assert exc.value.code == 4429


def test_timer_data_and_answer_duration(app_client, gateway, mock_db):
    from datetime import datetime
    gateway.script("structured", GOOD_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=1)["session_id"]
    ws = _connect(app_client, session_id, token)
    snapshot = ws.receive()["payload"]
    question = ws.receive()["payload"]
    ws.send({"type": "ANSWER", "answer_text": "Buckets and chaining."})
    complete = [ws.receive() for _ in range(3)][-1]["payload"]
    ws.close()
    assert question["suggested_seconds"] == 180 and question["asked_at"] and question["server_time"]
    assert datetime.fromisoformat(question["asked_at"]) <= datetime.fromisoformat(question["server_time"])
    assert snapshot["started_at"] and snapshot["server_time"]
    answer = asyncio.run(mock_db["candidate_answers"].find_one({"session_id": session_id}))
    assert answer["time_taken_s"] is not None and 0 <= answer["time_taken_s"] < 60
    report = app_client.get(f"/api/v1/reports/{complete['report_id']}", headers=headers).json()["data"]
    assert report["stats"]["answers"] == 1 and report["question_scores"][0]["score"] == 6.5
    assert set(report["dimension_scores"]) == {"correctness", "depth", "communication"}
