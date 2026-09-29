"""Security hardening (post-Phase-4 audit): abuse limits, body size, API docs, token secret, cross-user access."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.core.mentor.rag_tool import RagService
from app.db.seed import load_seed_questions, seed_question_bank
from app.main import create_app
from tests.fakes import GOOD_EVALUATION, HashEmbeddings, drain_indexing
from tests.integration.test_walking_skeleton import ONE_QUESTION, _open, _signup


def _client(settings, mock_db, gateway, **overrides):
    return TestClient(create_app(settings.model_copy(update=overrides), db=mock_db, gateway=gateway))


def _login(client, email, password):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_password_guessing_is_locked_out_then_recovers(settings, mock_db, gateway):
    with _client(settings, mock_db, gateway, login_failures_per_15_min=3) as client:
        _signup(client, "ada@example.com")
        assert [_login(client, "ada@example.com", "wrong-guess").status_code for _ in range(3)] == [401] * 3
        locked = _login(client, "ADA@example.com", "correct-horse-1")  # even the right password, any case
        assert locked.status_code == 429 and locked.json()["error"]["code"] == "rate_limited"
        # An unknown email is locked out the same way, so the lockout doesn't reveal who has an account.
        assert [_login(client, "nobody@example.com", "x").status_code for _ in range(4)] == [401, 401, 401, 429]
        client.app.state.limiters["login_email"].reset("ada@example.com")
        client.app.state.limiters["login_ip"].reset("testclient")
        assert _login(client, "ada@example.com", "correct-horse-1").status_code == 200


def test_a_successful_login_clears_that_emails_failures(settings, mock_db, gateway):
    with _client(settings, mock_db, gateway, login_failures_per_15_min=3) as client:
        _signup(client, "ada@example.com")
        _login(client, "ada@example.com", "wrong-guess"), _login(client, "ada@example.com", "wrong-guess")
        assert _login(client, "ada@example.com", "correct-horse-1").status_code == 200
        assert _login(client, "ada@example.com", "wrong-guess").status_code == 401  # counting starts again


def test_sign_ups_mentor_messages_and_interviews_are_limited(settings, mock_db, gateway, tmp_path):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    rag = RagService(HashEmbeddings(), str(tmp_path / "c"), "limits")
    app = create_app(settings.model_copy(update={"registrations_per_hour": 2, "mentor_messages_per_minute": 2,
                                                 "interviews_per_hour": 2}), db=mock_db, gateway=gateway, rag=rag)
    with TestClient(app) as client:
        _, headers = _signup(client, "a@example.com")
        _signup(client, "b@example.com")
        third = client.post("/api/v1/auth/register", json={"email": "c@example.com", "password": "correct-horse-1", "name": "C"})
        assert third.status_code == 429
        assert [client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).status_code for _ in range(3)] == [201, 201, 429]
        codes = [client.post("/api/v1/mentor/message", json={"message": "How am I doing?"}, headers=headers).status_code
                 for _ in range(3)]
        assert codes == [200, 200, 429]


def test_oversized_bodies_are_refused_before_parsing(client):
    response = client.post("/api/v1/auth/login", content=b"x" * 1_000_001, headers={"Content-Type": "application/json"})
    assert response.status_code == 413 and response.json()["error"]["code"] == "payload_too_large"


def test_api_docs_are_local_only(mock_db, gateway):
    deployed = Settings(_env_file=None, app_env="dev", jwt_secret="x" * 40, hf_token="", log_level="WARNING")
    with TestClient(create_app(deployed, db=mock_db, gateway=gateway)) as client:
        assert client.get("/docs").status_code == 404 and client.get("/openapi.json").status_code == 404
        assert client.get("/api/v1/health").status_code in (200, 503)


def test_local_mode_never_uses_a_known_jwt_secret():
    a, b = Settings(_env_file=None, app_env="local"), Settings(_env_file=None, app_env="local")
    assert len(a.jwt_secret) >= 32 and a.jwt_secret != b.jwt_secret
    assert "local-dev-only" not in a.jwt_secret


def test_profile_skills_are_bounded(client, register):
    headers, _ = register()
    profile = {"personal": {"name": "Ada", "experience_level": "1-2"}, "target": {"role": "Software Engineer"},
               "skills": ["x" * 61]}
    assert client.post("/api/v1/profiles", json=profile, headers=headers).status_code == 422


def test_nothing_of_one_candidate_is_reachable_by_another(settings, mock_db, gateway, tmp_path):
    """Every endpoint that takes an ID, tried with another user's IDs."""
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    rag = RagService(HashEmbeddings(), str(tmp_path / "c"), "idor")
    with TestClient(create_app(settings, db=mock_db, gateway=gateway, rag=rag)) as client:
        ada_token, ada = _signup(client, "ada@example.com")
        _, bob = _signup(client, "bob@example.com")
        session_id = client.post("/api/v1/interviews", json=ONE_QUESTION, headers=ada).json()["data"]["session_id"]
        gateway.script("structured", GOOD_EVALUATION)
        ws = _open(client, session_id, ada_token)
        ws.receive_json(), ws.receive_json()
        ws.send_json({"type": "ANSWER", "answer_text": "Buckets."})
        report_id = [ws.receive_json() for _ in range(3)][-1]["payload"]["report_id"]
        ws.__exit__(None, None, None)
        drain_indexing(client)
        gateway.script("generate", "You did fine [1].")
        conversation_id = client.post("/api/v1/mentor/message", json={"message": "How am I doing?"},
                                      headers=ada).json()["data"]["conversation_id"]

        for method, path in [("get", f"/api/v1/interviews/{session_id}"), ("get", f"/api/v1/interviews/{session_id}/state"),
                             ("post", f"/api/v1/interviews/{session_id}/code/run"), ("get", f"/api/v1/reports/{report_id}"),
                             ("get", f"/api/v1/mentor/conversations/{conversation_id}")]:
            kwargs = {"json": {"code": "x"}} if method == "post" else {}
            assert getattr(client, method)(path, headers=bob, **kwargs).status_code == 404, path
        assert client.post("/api/v1/mentor/message", json={"message": "hi", "conversation_id": conversation_id},
                           headers=bob).status_code == 404
        for path in ("/api/v1/interviews", "/api/v1/reports", "/api/v1/mentor/conversations"):
            assert client.get(path, headers=bob).json()["data"] == [], path
        assert client.get("/api/v1/mentor/welcome", headers=bob).json()["data"]["report_count"] == 0
