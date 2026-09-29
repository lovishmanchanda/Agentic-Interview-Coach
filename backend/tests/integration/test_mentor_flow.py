"""Mentor (Phase 2): persisted conversations, the weak-area drill link, the welcome state, user isolation."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core.mentor.rag_tool import RagService
from app.core.mentor.rag_tool.service import NO_DATA_MESSAGE
from app.db.seed import load_seed_questions, seed_question_bank
from app.main import create_app
from tests.fakes import GOOD_EVALUATION, HashEmbeddings, drain_indexing
from tests.integration.test_walking_skeleton import ONE_QUESTION, _open, _signup


@pytest.fixture
def app_client(settings, mock_db, gateway, tmp_path):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    rag = RagService(HashEmbeddings(), str(tmp_path / "chroma"), "mentor_test")
    with TestClient(create_app(settings, db=mock_db, gateway=gateway, rag=rag)) as client:
        yield client


def _interview(client, gateway, token, headers) -> dict:
    """One question, answered and scored 6.5; returns the report once the Mentor has indexed it."""
    session_id = client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).json()["data"]["session_id"]
    gateway.script("structured", GOOD_EVALUATION)
    ws = _open(client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "Buckets and chaining."})
    report_id = [ws.receive_json() for _ in range(3)][-1]["payload"]["report_id"]
    ws.__exit__(None, None, None)
    drain_indexing(client)
    return client.get(f"/api/v1/reports/{report_id}", headers=headers).json()["data"]


def _ask(client, headers, message, conversation_id=None):
    body = {"message": message, **({"conversation_id": conversation_id} if conversation_id else {})}
    return client.post("/api/v1/mentor/message", json=body, headers=headers)


def test_a_conversation_is_saved_and_its_history_feeds_the_next_turn(app_client, gateway):
    token, headers = _signup(app_client)
    report = _interview(app_client, gateway, token, headers)
    assert report["rag_indexed"] is True

    gateway.script("generate", "Solid hashing basics [1]. Next, load factor [2].", "**Resizing** doubles the table [1].")
    first = _ask(app_client, headers, "How am I doing?").json()["data"]
    conversation_id = first["conversation_id"]
    assert first["title"] == "How am I doing?"
    assert first["sources"] and all(s["report_id"] == report["report_id"] for s in first["sources"])
    assert [m["role"] for m in first["messages"]] == ["user", "assistant"]

    second = _ask(app_client, headers, "Tell me more about the resizing part", conversation_id).json()["data"]
    assert second["conversation_id"] == conversation_id
    call = gateway.calls_of("generate")[-1]
    prompt = call["prompt"]
    assert "user: How am I doing?" in prompt
    assert "assistant: Solid hashing basics. Next, load factor." in prompt  # stale [n] removed
    assert call["context"].prompt_version == "mentor/mentor_v1" and call["context"].candidate_id

    listed = app_client.get("/api/v1/mentor/conversations", headers=headers).json()["data"]
    assert [c["conversation_id"] for c in listed] == [conversation_id]
    assert listed[0]["message_count"] == 4 and listed[0]["last_message_preview"] == "Resizing doubles the table."
    full = app_client.get(f"/api/v1/mentor/conversations/{conversation_id}", headers=headers).json()["data"]
    assert [m["content"] for m in full["messages"]][::2] == ["How am I doing?", "Tell me more about the resizing part"]
    assert full["messages"][1]["sources"] == first["sources"]


def test_a_new_conversation_starts_fresh_but_keeps_access_to_every_report(app_client, gateway):
    token, headers = _signup(app_client)
    _interview(app_client, gateway, token, headers)
    gateway.script("generate", "One [1].", "Two [1].")
    first = _ask(app_client, headers, "How am I doing?").json()["data"]
    second = _ask(app_client, headers, "How am I doing?").json()["data"]
    assert first["conversation_id"] != second["conversation_id"]
    assert "Recent conversation:\n(none)" in gateway.calls_of("generate")[-1]["prompt"]
    assert second["sources"]


def test_conversations_are_private(app_client, gateway):
    ada_token, ada_headers = _signup(app_client, "ada@example.com")
    _, bob_headers = _signup(app_client, "bob@example.com")
    _interview(app_client, gateway, ada_token, ada_headers)
    gateway.script("generate", "Ada's answer [1].")
    conversation_id = _ask(app_client, ada_headers, "How am I doing?").json()["data"]["conversation_id"]

    assert app_client.get(f"/api/v1/mentor/conversations/{conversation_id}", headers=bob_headers).status_code == 404
    assert app_client.get("/api/v1/mentor/conversations", headers=bob_headers).json()["data"] == []
    hijack = _ask(app_client, bob_headers, "What did she say?", conversation_id)
    assert hijack.status_code == 404 and hijack.json()["error"]["code"] == "conversation_not_found"
    # Bob's own Mentor has no reports to draw on, whatever he asks about.
    calls_before = len(gateway.calls_of("generate"))
    for message in ("How am I doing?", "Explain hash map buckets and chaining"):
        reply = _ask(app_client, bob_headers, message).json()["data"]
        assert reply["answer"] == NO_DATA_MESSAGE and reply["sources"] == []
    assert len(gateway.calls_of("generate")) == calls_before  # no LLM call without data


def test_drill_request_gets_a_prefilled_weak_area_drill_link(app_client, gateway):
    token, headers = _signup(app_client)
    report = _interview(app_client, gateway, token, headers)
    topic = next(iter(report["per_topic_scores"]))
    gateway.script("generate", "Summary [1].", "Work on your weakest area first [1].")
    conversation_id = _ask(app_client, headers, "How am I doing?").json()["data"]["conversation_id"]
    # Mid-conversation too: it names no topic, so it's answered from the recent reports, not similarity.
    reply = _ask(app_client, headers, "Drill me on my weak spots", conversation_id).json()["data"]
    assert reply["sources"]
    [action] = reply["actions"]
    assert action["type"] == "drill" and action["topics"] == [topic]
    assert action["href"].startswith(f"/interview/configure?focus={topic}&role=") and action["href"].endswith("&type=technical")
    prompt = gateway.calls_of("generate")[-1]["prompt"]
    assert 'app shows a "Start a weak-area drill" button' in prompt and topic.replace("_", " ") in prompt
    # A general question gets no drill button, and the prompt says so.
    gateway.script("generate", "Summary [1].")
    assert _ask(app_client, headers, "How am I doing?").json()["data"]["actions"] == []
    assert "Point them to starting a practice interview instead." in gateway.calls_of("generate")[-1]["prompt"]


def test_no_reports_means_no_drill_and_the_welcome_state(app_client, gateway):
    _, headers = _signup(app_client)
    welcome = app_client.get("/api/v1/mentor/welcome", headers=headers).json()["data"]
    assert welcome == {"mentor_available": True, "report_count": 0, "pending_reports": 0, "latest": None}
    reply = _ask(app_client, headers, "Drill me on my weak spots").json()["data"]
    assert reply["answer"] == NO_DATA_MESSAGE and reply["actions"] == []
    # Even a no-data reply is part of the conversation.
    assert app_client.get("/api/v1/mentor/conversations", headers=headers).json()["data"][0]["message_count"] == 2


def test_welcome_greets_from_the_latest_report_and_requeues_unindexed_ones(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    report = _interview(app_client, gateway, token, headers)
    asyncio.run(mock_db["interview_reports"].update_one({"report_id": report["report_id"]},
                                                        {"$set": {"rag_indexed": False}}))
    welcome = app_client.get("/api/v1/mentor/welcome", headers=headers).json()["data"]
    assert welcome["report_count"] == 1 and welcome["pending_reports"] == 1
    latest = welcome["latest"]
    assert latest["report_id"] == report["report_id"] and latest["overall"] == 6.5
    assert latest["weakest_topic"] == next(iter(report["per_topic_scores"])) and latest["strongest_topic"] is None
    drain_indexing(app_client)
    assert app_client.get(f"/api/v1/reports/{report['report_id']}", headers=headers).json()["data"]["rag_indexed"] is True


def test_full_and_unknown_conversations_are_refused(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    _interview(app_client, gateway, token, headers)
    gateway.script("generate", "Hi [1].")
    conversation_id = _ask(app_client, headers, "How am I doing?").json()["data"]["conversation_id"]
    asyncio.run(mock_db["mentor_conversations"].update_one({"conversation_id": conversation_id},
                                                           {"$set": {"message_count": 199}}))
    full = _ask(app_client, headers, "More?", conversation_id)
    assert full.status_code == 409 and full.json()["error"]["code"] == "conversation_full"
    assert _ask(app_client, headers, "Hi", "no-such-id").status_code == 404
    assert app_client.get("/api/v1/mentor/conversations/no-such-id", headers=headers).status_code == 404


def test_mentor_endpoints_need_auth(app_client):
    assert app_client.get("/api/v1/mentor/conversations").status_code == 401
    assert app_client.get("/api/v1/mentor/welcome").status_code == 401
    assert app_client.post("/api/v1/mentor/message", json={"message": "hi"}).status_code == 401
