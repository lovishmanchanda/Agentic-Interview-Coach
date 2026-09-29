"""Interview configuration (implementation_plan.md 1.2): profile defaults, overrides, choices not built
yet, Weak-Area Drill focus topics, serious mode, and the options endpoint."""
import asyncio

import pytest

from tests.fakes import GOOD_EVALUATION
from tests.integration.test_multi_question_interview import GENERATED, _answer, _signup, app_client, gateway  # noqa: F401
from tests.integration.test_walking_skeleton import _open


def _create(client, headers, **config):
    response = client.post("/api/v1/interviews", json=config, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _session_doc(mock_db, session_id):
    return asyncio.run(mock_db["interview_sessions"].find_one({"session_id": session_id}))


def test_missing_fields_come_from_the_profile(app_client, mock_db):
    _, headers = _signup(app_client)
    created = _create(app_client, headers)
    assert created["config"] == {
        "interview_type": "technical", "interview_mode": "practice", "role": "Software Engineer",
        "role_key": "software_engineer", "experience_level": "1-2", "company": "Contoso", "difficulty": "adaptive",
        "question_count": 3, "input_mode": "text", "output_mode": "text", "coding_language": "python",
    }
    doc = _session_doc(mock_db, created["session_id"])
    assert doc["target_difficulty"] == "medium" and doc["focus_topics"] == []


def test_overrides_drive_question_choice_and_evaluation(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    created = _create(app_client, headers, role="ML Engineer", experience_level="senior", difficulty="hard",
                      company="  ", question_count=1)
    assert created["config"]["role_key"] == "ml_engineer"
    assert created["config"]["company"] == "Contoso"  # blank means "use the profile"
    assert _session_doc(mock_db, created["session_id"])["target_difficulty"] == "hard"

    gateway.script("structured", GOOD_EVALUATION)
    ws = _open(app_client, created["session_id"], token)
    ws.receive_json()
    question = ws.receive_json()["payload"]
    _answer(ws)
    ws.__exit__(None, None, None)
    # The only hard ML question in the bank.
    assert question["difficulty"] == "hard" and question["topic"] == "system_design"
    evaluator_prompt = gateway.calls_of("structured")[0]["prompt"]
    assert "Target role: ML Engineer" in evaluator_prompt and "Experience level: senior" in evaluator_prompt


@pytest.mark.parametrize("config, message", [
    ({"interview_type": "coding"}, "Coding interviews need the code runner, which isn't set up on this server yet."),  # no PISTON_URL in tests
    ({"input_mode": "voice"}, "Voice answers are coming soon. Use text for now."),
    ({"output_mode": "voice"}, "Spoken questions are coming soon. Use text for now."),
])
def test_choices_not_built_yet_are_rejected_clearly(app_client, config, message):
    _, headers = _signup(app_client)
    response = app_client.post("/api/v1/interviews", json=config, headers=headers)
    assert response.status_code == 422
    assert response.json()["error"] == {"code": "option_unavailable", "message": message, "details": None}


@pytest.mark.parametrize("config", [
    {"interview_mode": "casual"},
    {"difficulty": "extreme"},
    {"experience_level": "10+"},
    {"focus_topics": ["dsa", "!!"]},
    {"focus_topics": ["a1", "b1", "c1", "d1", "e1", "f1"]},
    {"questoin_count": 3},  # typo: unknown fields are rejected, not ignored
    {"role": "x" * 101},
])
def test_invalid_config_is_rejected(app_client, config):
    _, headers = _signup(app_client)
    response = app_client.post("/api/v1/interviews", json=config, headers=headers)
    assert response.status_code == 422 and response.json()["error"]["code"] == "validation_error"


def test_focus_topics_are_normalised(app_client, mock_db):
    _, headers = _signup(app_client)
    created = _create(app_client, headers, focus_topics=["DBMS", "System Design", "dbms"])
    assert created["focus_topics"] == ["dbms", "system_design"]


def test_weak_area_drill_sticks_to_focus_topics(app_client, gateway, mock_db):
    # The bank has two dbms questions for software_engineer, both "easy" or "medium". At a fixed easy
    # difficulty: the easy one, then (no easy dbms left) two generated on dbms.
    dbms = {**GENERATED, "topic": "dbms"}
    gateway.script("structured", GOOD_EVALUATION, dbms, GOOD_EVALUATION, dbms, GOOD_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, focus_topics=["dbms"], difficulty="easy", question_count=3)["session_id"]

    ws = _open(app_client, session_id, token)
    assert ws.receive_json()["payload"]["focus_topics"] == ["dbms"]
    topics = [ws.receive_json()["payload"]["topic"]]
    topics.append(_answer(ws)["payload"]["topic"])
    topics.append(_answer(ws)["payload"]["topic"])
    assert _answer(ws)["type"] == "INTERVIEW_COMPLETE"
    ws.__exit__(None, None, None)

    assert topics == ["dbms", "dbms", "dbms"]
    stored = asyncio.run(mock_db["interview_questions"].find({"session_id": session_id}).sort("asked_at", 1).to_list(length=5))
    assert [q["source"] for q in stored] == ["bank", "llm_generated", "llm_generated"]
    assert stored[0]["bank_question_id"] == "swe_sql_joins"
    assert "- Topic: dbms" in gateway.calls_of("structured")[1]["prompt"]


def test_serious_mode_hides_scores_until_the_report(app_client, gateway):
    gateway.script("structured", GOOD_EVALUATION, GOOD_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, interview_mode="serious", question_count=2)["session_id"]

    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "Buckets, hashing and chaining."})
    processing, nxt = ws.receive_json(), ws.receive_json()
    assert processing["type"] == "PROCESSING" and "Evaluating" not in processing["payload"]["message"]
    assert nxt["type"] == "QUESTION"  # no EVALUATION event in between
    ws.__exit__(None, None, None)

    # A reconnect mid-interview doesn't leak the evaluation either.
    ws = _open(app_client, session_id, token)
    snapshot = ws.receive_json()["payload"]
    assert [t["role"] for t in snapshot["transcript"]] == ["interviewer", "candidate", "interviewer"]
    assert app_client.get(f"/api/v1/interviews/{session_id}", headers=headers).json()["data"]["transcript"] == snapshot["transcript"]
    ws.send_json({"type": "ANSWER", "answer_text": "Normalisation reduces redundancy."})
    events = [ws.receive_json()["type"] for _ in range(2)]
    ws.__exit__(None, None, None)
    assert events == ["PROCESSING", "INTERVIEW_COMPLETE"]

    session = app_client.get(f"/api/v1/interviews/{session_id}", headers=headers).json()["data"]
    report = app_client.get(f"/api/v1/reports/{session['report_id']}", headers=headers).json()["data"]
    assert report["scores"]["overall"] == 6.5
    assert [t["role"] for t in report["transcript"]].count("evaluation") == 2  # revealed in the report
    assert report["config"]["interview_mode"] == "serious"  # the drill link reuses the role
    assert [t["role"] for t in session["transcript"]].count("evaluation") == 2  # and in the room once it's over


def test_options_endpoint(app_client):
    _, headers = _signup(app_client)
    data = app_client.get("/api/v1/interviews/options", headers=headers).json()["data"]
    assert data["defaults"]["role"] == "Software Engineer" and data["defaults"]["difficulty"] == "adaptive"
    assert data["role_key"] == "software_engineer"
    assert data["topics"][:2] == ["dsa", "system_design"] and "python" in data["topics"]  # role topics, then bank topics
    assert {"field": "interview_type", "value": "coding", "reason": "Coding interviews need the code runner, which isn't set up on this server yet."} in data["unavailable"]
    assert all(u["value"] != "behavioral" for u in data["unavailable"])

    ml = app_client.get("/api/v1/interviews/options", params={"role": "Data Scientist"}, headers=headers).json()["data"]
    assert ml["role_key"] == "ml_engineer" and ml["topics"][0] == "machine_learning"
    assert ml["defaults"]["role"] == "Data Scientist"


def test_options_need_a_profile(app_client):
    data = app_client.post("/api/v1/auth/register", json={"email": "np@example.com", "password": "correct-horse-1", "name": "N"}).json()["data"]
    headers = {"Authorization": f"Bearer {data['tokens']['access_token']}"}
    response = app_client.get("/api/v1/interviews/options", headers=headers)
    assert response.status_code == 409 and response.json()["error"]["code"] == "profile_missing"
