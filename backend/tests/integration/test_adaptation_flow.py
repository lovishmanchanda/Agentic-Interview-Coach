"""Adaptation in a live session (implementation_plan.md 1.8): difficulty follows performance, partial
answers get one follow-up, drills revisit their weakest topic. Follow-ups are on here (conftest turns
them off for the other flow tests)."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core.mentor.rag_tool import RagService
from app.db.seed import load_seed_questions, seed_question_bank
from app.gateway import FakeAIGateway
from app.main import create_app
from tests.fakes import GOOD_EVALUATION, HashEmbeddings
from tests.integration.test_interview_config import _create
from app.core.interview.question_engine import GeneratedQuestion
from app.utils.exceptions import ServiceUnavailableError
from tests.integration.test_multi_question_interview import GENERATED, _answer, _signup
from tests.integration.test_walking_skeleton import _open

STRONG = {**GOOD_EVALUATION, "overall_score": 8.5}
ADEQUATE = GOOD_EVALUATION  # 6.5
WEAK = {**GOOD_EVALUATION, "overall_score": 3.0}


@pytest.fixture
def gateway() -> FakeAIGateway:
    return FakeAIGateway(session_token_budget=100_000)


@pytest.fixture
def app_client(settings, mock_db, gateway, tmp_path):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    rag = RagService(HashEmbeddings(), str(tmp_path / "chroma"), "adaptation_test")
    app = create_app(settings.model_copy(update={"interview_follow_ups": True}), db=mock_db, gateway=gateway, rag=rag)
    with TestClient(app) as client:
        yield client


def _questions(mock_db, session_id):
    return asyncio.run(mock_db["interview_questions"].find({"session_id": session_id}).sort("asked_at", 1).to_list(20))


def test_difficulty_follows_performance(app_client, gateway, mock_db):
    # ML Engineer, 1-2 years, adaptive → starts at medium. The bank's only hard ML question is ml_rag_system.
    gateway.script("structured", STRONG, WEAK, STRONG)
    token, headers = _signup(app_client, role="ML Engineer")
    session_id = _create(app_client, headers, question_count=3)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    q1 = ws.receive_json()["payload"]
    q2 = _answer(ws)["payload"]   # strong → harder
    q3 = _answer(ws)["payload"]   # weak → easier again
    _answer(ws)
    ws.__exit__(None, None, None)

    assert [q1["difficulty"], q2["difficulty"], q3["difficulty"]] == ["medium", "hard", "medium"]
    state = app_client.get(f"/api/v1/interviews/{session_id}/state", headers=headers).json()["data"]
    assert state["last_decision"]["action"] == "complete"
    assert sum(v["n"] for v in state["performance_vector"].values()) == 3


def test_partial_answer_gets_a_follow_up_then_moves_on(app_client, gateway, mock_db):
    gateway.script("structured", ADEQUATE, ADEQUATE, STRONG)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=2)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    q1 = ws.receive_json()["payload"]
    follow_up = _answer(ws)["payload"]                  # adequate → follow-up
    q2 = _answer(ws)["payload"]                         # adequate on the follow-up → no second one, next topic
    assert _answer(ws)["type"] == "INTERVIEW_COMPLETE"  # strong on the last question → done
    ws.__exit__(None, None, None)

    assert follow_up["is_follow_up"] is True and follow_up["topic"] == q1["topic"]
    assert follow_up["text"].startswith("Follow-up: ")
    assert follow_up["question_number"] == 1 and q2["question_number"] == 2 and not q2["is_follow_up"]

    stored = _questions(mock_db, session_id)
    parent, fu = stored[0], stored[1]
    assert fu["is_follow_up"] and fu["parent_question_id"] == parent["question_id"]
    assert fu["question_text"] == parent["follow_up_possibilities"][0] and fu["source"] == "follow_up"
    # The follow-up answer is graded against the parent question's concepts.
    fu_prompt = gateway.calls_of("structured")[1]["prompt"]
    assert fu["question_text"] in fu_prompt and parent["expected_concepts"][0] in fu_prompt

    state = app_client.get(f"/api/v1/interviews/{session_id}/state", headers=headers).json()["data"]
    assert state["questions_asked"] == 2 and state["follow_ups_asked"] == 1
    history = [h["state"] for h in state["state_history"]]
    assert history[4:8] == ["EVALUATING", "FOLLOW_UP_DECISION", "QUESTION", "WAITING_FOR_RESPONSE"]

    report_id = app_client.get(f"/api/v1/interviews/{session_id}", headers=headers).json()["data"]["report_id"]
    report = app_client.get(f"/api/v1/reports/{report_id}", headers=headers).json()["data"]
    interviewer = [t for t in report["transcript"] if t["role"] == "interviewer"]
    assert [t["is_follow_up"] for t in interviewer] == [False, True, False]


def test_last_question_gets_its_follow_up_before_the_report(app_client, gateway):
    gateway.script("structured", ADEQUATE, STRONG)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, question_count=1)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    assert _answer(ws)["payload"]["is_follow_up"] is True
    assert _answer(ws)["type"] == "INTERVIEW_COMPLETE"
    ws.__exit__(None, None, None)


def test_fixed_difficulty_stays_put(app_client, gateway):
    gateway.script("structured", STRONG, STRONG)
    token, headers = _signup(app_client, role="ML Engineer")
    session_id = _create(app_client, headers, difficulty="medium", question_count=2)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    q1 = ws.receive_json()["payload"]
    q2 = _answer(ws)["payload"]
    _answer(ws)
    ws.__exit__(None, None, None)
    assert q1["difficulty"] == q2["difficulty"] == "medium"


def test_serious_mode_follow_up_without_scores(app_client, gateway):
    gateway.script("structured", ADEQUATE, STRONG)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, interview_mode="serious", question_count=1)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "Buckets and chaining."})
    events = [ws.receive_json(), ws.receive_json()]
    ws.__exit__(None, None, None)
    assert [e["type"] for e in events] == ["PROCESSING", "QUESTION"] and events[1]["payload"]["is_follow_up"]


def test_drill_comes_back_to_the_weakest_topic(app_client, gateway):
    # Weak on dsa, strong on dbms → the third question returns to dsa. (No follow-ups: neither is partial.)
    def by_topic(args):
        if args["schema"] is GeneratedQuestion:  # the bank may lack the target difficulty for dsa
            return {**GENERATED, "topic": "dsa"}
        return WEAK if "- Topic: dsa" in args["prompt"] else STRONG

    gateway.script("structured", *[by_topic] * 4)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, focus_topics=["dsa", "dbms"], question_count=3)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    q1 = ws.receive_json()["payload"]
    q2 = _answer(ws)["payload"]
    q3 = _answer(ws)["payload"]
    # The decision that led to q3 named dsa (without it, q3's topic would be a coin flip between the two).
    decided = app_client.get(f"/api/v1/interviews/{session_id}/state", headers=headers).json()["data"]["last_decision"]
    assert decided["action"] == "next_topic" and decided["suggested_topic"] == "dsa"
    _answer(ws)
    ws.__exit__(None, None, None)
    assert {q1["topic"], q2["topic"]} == {"dsa", "dbms"}
    assert q3["topic"] == "dsa"
    state = app_client.get(f"/api/v1/interviews/{session_id}/state", headers=headers).json()["data"]
    assert state["performance_vector"]["dsa"]["n"] == 2


def test_a_difficulty_the_bank_lacks_is_generated(app_client, gateway, mock_db):
    # The software-engineer bank has no hard technical question, so "hard" is a bank miss.
    gateway.script("structured", GENERATED, STRONG)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, difficulty="hard", question_count=1)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    question = ws.receive_json()["payload"]
    _answer(ws)
    ws.__exit__(None, None, None)
    assert question["difficulty"] == "hard"
    assert _questions(mock_db, session_id)[0]["source"] == "llm_generated"
    assert "- Difficulty: hard" in gateway.calls_of("structured")[0]["prompt"]


def test_if_generation_fails_the_closest_bank_level_is_used(app_client, gateway, mock_db):
    gateway.script("structured", ServiceUnavailableError("down", code="llm_unavailable"), STRONG)
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, difficulty="hard", question_count=1)["session_id"]
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    question = ws.receive_json()
    assert _answer(ws)["type"] == "INTERVIEW_COMPLETE"
    ws.__exit__(None, None, None)
    assert question["type"] == "QUESTION" and question["payload"]["difficulty"] == "medium"
    assert _questions(mock_db, session_id)[0]["source"] == "bank"
