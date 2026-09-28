"""Behavioral interviews (implementation_plan.md 1.7): STAR evaluation, competencies as topics, and
competency drills that fall back to generation."""
import asyncio

from tests.fakes import BEHAVIORAL_EVALUATION
from tests.integration.test_interview_config import _create
from tests.integration.test_multi_question_interview import GENERATED, _answer, _signup, app_client, gateway  # noqa: F401
from tests.integration.test_walking_skeleton import _open


def test_behavioral_interview_uses_star_evaluation(app_client, gateway, mock_db):
    gateway.script("structured", BEHAVIORAL_EVALUATION, BEHAVIORAL_EVALUATION)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, interview_type="behavioral", question_count=2)["session_id"]

    ws = _open(app_client, session_id, token)
    ws.receive_json()
    first = ws.receive_json()["payload"]
    ws.send_json({"type": "ANSWER", "answer_text": "Last spring our release was two weeks late. I owned the plan..."})
    assert ws.receive_json()["type"] == "PROCESSING"
    evaluation = ws.receive_json()["payload"]
    second = ws.receive_json()["payload"]
    complete = _answer(ws)
    ws.__exit__(None, None, None)

    # Competencies are the topics; target difficulty "medium" picks the two medium bank questions first.
    assert {first["topic"], second["topic"]} == {"ownership", "collaboration"}
    assert set(evaluation["dimensions"]) == {"situation", "task", "action", "result", "specificity", "ownership",
                                             "communication"}
    calls = gateway.calls_of("structured")
    assert all(c["context"].prompt_version == "evaluator/behavioral_v1" and c["tier"] == "fast" for c in calls)
    assert "STAR" in calls[0]["prompt"] and "Last spring our release" in calls[0]["prompt"]

    stored = asyncio.run(mock_db["interview_questions"].find({"session_id": session_id}).to_list(length=5))
    assert all(q["type"] == "behavioral" and q["subtopic"] == "" for q in stored)
    evaluations = asyncio.run(mock_db["evaluations"].find({"session_id": session_id}).to_list(length=5))
    assert all(e["evaluation_type"] == "behavioral" and e["prompt_version_used"] == "evaluator/behavioral_v1"
               for e in evaluations)
    report = app_client.get(f"/api/v1/reports/{complete['payload']['report_id']}", headers=headers).json()["data"]
    assert set(report["per_topic_scores"]) == {"ownership", "collaboration"}
    assert report["interview_type"] == "behavioral"


def test_competency_drill_generates_when_the_bank_runs_out(app_client, gateway, mock_db):
    generated = {**GENERATED, "topic": "growth", "question_text": "Tell me about a time feedback changed how you work."}
    gateway.script("structured", BEHAVIORAL_EVALUATION, generated, BEHAVIORAL_EVALUATION)
    token, headers = _signup(app_client)
    # The bank's one growth question is "easy"; asking for easy makes it a bank hit before the bank runs out.
    session_id = _create(app_client, headers, interview_type="behavioral", focus_topics=["growth"],
                         difficulty="easy", question_count=2)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    first = ws.receive_json()["payload"]
    second = _answer(ws)["payload"]
    assert _answer(ws)["type"] == "INTERVIEW_COMPLETE"
    ws.__exit__(None, None, None)

    assert first["topic"] == second["topic"] == "growth"  # the bank's one growth question, then a generated one
    generation = gateway.calls_of("structured")[1]
    assert generation["context"].prompt_version == "interviewer/behavioral_question_generation_v1"
    assert "- Competency: growth" in generation["prompt"] and "never a hypothetical" in generation["prompt"]
    stored = asyncio.run(mock_db["interview_questions"].find({"session_id": session_id}).sort("asked_at", 1).to_list(5))
    assert [q["source"] for q in stored] == ["bank", "llm_generated"]
    assert all(q["type"] == "behavioral" for q in stored)


def test_options_list_competencies_for_behavioral(app_client):
    _, headers = _signup(app_client)
    data = app_client.get("/api/v1/interviews/options", params={"interview_type": "behavioral"}, headers=headers).json()["data"]
    assert data["topics"][:3] == ["ownership", "collaboration", "conflict"]
    assert "growth" in data["topics"] and "dsa" not in data["topics"]
