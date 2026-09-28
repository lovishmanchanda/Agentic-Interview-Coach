"""The engine on the state machine (implementation_plan.md 1.3): the full walk is recorded, illegal moves
are refused, and every way a connection can go away or overlap ends in a consistent session."""
import asyncio
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.interview.engine import InterviewEngine
from app.core.interview.state_machine import InterviewStateMachine, InvalidTransitionError
from app.db.models.interview import InterviewConfigRequest
from app.db.repositories.interview_repo import InterviewRepository, utcnow
from app.db.repositories.question_repo import QuestionRepository
from app.db.seed import load_seed_questions, seed_question_bank
from app.gateway import FakeAIGateway
from app.main import create_app
from tests.fakes import GOOD_EVALUATION
from tests.integration.test_multi_question_interview import _answer, _create, _signup, app_client, gateway  # noqa: F401
from tests.integration.test_profiles_api import PROFILE
from tests.integration.test_walking_skeleton import _open

LONG_AGO = timedelta(minutes=10)


def _set(mock_db, session_id, **fields):
    asyncio.run(mock_db["interview_sessions"].update_one({"session_id": session_id}, {"$set": fields}))


def _session(mock_db, session_id):
    return asyncio.run(mock_db["interview_sessions"].find_one({"session_id": session_id}))


def test_full_walk_is_recorded_and_exposed(app_client, gateway):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 2)
    gateway.script("structured", GOOD_EVALUATION, GOOD_EVALUATION)
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    _answer(ws)
    _answer(ws)
    ws.__exit__(None, None, None)

    state = app_client.get(f"/api/v1/interviews/{session_id}/state", headers=headers).json()["data"]
    assert [h["state"] for h in state["state_history"]] == [
        "SETUP", "INTRODUCTION", "QUESTION", "WAITING_FOR_RESPONSE", "EVALUATING", "FOLLOW_UP_DECISION",
        "NEXT_TOPIC", "QUESTION", "WAITING_FOR_RESPONSE", "EVALUATING", "FOLLOW_UP_DECISION",
        "INTERVIEW_COMPLETE", "GENERATING_REPORT", "REPORT_READY",
    ]
    assert state["state"] == "REPORT_READY" and state["allowed_next"] == []
    assert state["questions_asked"] == 2 and state["total_questions"] == 2


def test_state_endpoint_mid_interview_and_privacy(app_client):
    token, headers = _signup(app_client)
    _, bob_headers = _signup(app_client, email="bob@example.com")
    session_id = _create(app_client, headers, 2)
    fresh = app_client.get(f"/api/v1/interviews/{session_id}/state", headers=headers).json()["data"]
    assert fresh["state"] == "SETUP" and fresh["allowed_next"] == ["INTRODUCTION"]
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.__exit__(None, None, None)
    waiting = app_client.get(f"/api/v1/interviews/{session_id}/state", headers=headers).json()["data"]
    assert waiting["state"] == "WAITING_FOR_RESPONSE" and waiting["allowed_next"] == ["EVALUATING"]
    assert waiting["current_question_id"]
    assert app_client.get(f"/api/v1/interviews/{session_id}/state", headers=bob_headers).status_code == 404


def test_illegal_moves_are_refused_before_touching_the_database(mock_db):
    async def run():
        repo = InterviewRepository(mock_db)
        await repo.create_session({"session_id": "s1", "state": "WAITING_FOR_RESPONSE", "updated_at": utcnow()})
        with pytest.raises(InvalidTransitionError):
            await InterviewStateMachine(repo).transition("s1", "WAITING_FOR_RESPONSE", "REPORT_READY")
        assert (await repo.get_session("s1"))["state"] == "WAITING_FOR_RESPONSE"
        # A legal move from a state the session isn't in any more is a lost race, not an error.
        assert await InterviewStateMachine(repo).transition("s1", "EVALUATING", "FOLLOW_UP_DECISION") is None
    asyncio.run(run())


def test_browser_closing_right_after_answering_leaves_a_consistent_session(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 2)
    gateway.script("structured", GOOD_EVALUATION)
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "Buckets and chaining."})
    ws.__exit__(None, None, None)  # gone before reading PROCESSING / EVALUATION / QUESTION

    # The engine finished the turn anyway: evaluated, decided, and asked question 2.
    session = _session(mock_db, session_id)
    assert session["state"] == "WAITING_FOR_RESPONSE" and session["questions_asked"] == 2
    ws = _open(app_client, session_id, token)
    snapshot = ws.receive_json()["payload"]
    ws.__exit__(None, None, None)
    assert [t["role"] for t in snapshot["transcript"]] == ["interviewer", "candidate", "evaluation", "interviewer"]


def test_reconnect_while_another_worker_evaluates_waits_then_resyncs(app_client, mock_db):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 2)
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.__exit__(None, None, None)

    _set(mock_db, session_id, state="EVALUATING", updated_at=utcnow())  # someone else is mid-evaluation
    ws = _open(app_client, session_id, token)
    assert ws.receive_json()["payload"]["state"] == "EVALUATING"
    _set(mock_db, session_id, state="WAITING_FOR_RESPONSE", updated_at=utcnow())  # ...and finishes
    resync = ws.receive_json()
    ws.__exit__(None, None, None)
    assert resync["type"] == "SESSION_SNAPSHOT" and resync["payload"]["state"] == "WAITING_FOR_RESPONSE"
    assert resync["payload"]["current_question"] is not None


def test_stale_evaluation_is_taken_over(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 1)
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.__exit__(None, None, None)

    _set(mock_db, session_id, state="EVALUATING", updated_at=utcnow() - LONG_AGO)  # its worker died
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    error = ws.receive_json()
    assert error["type"] == "ERROR" and error["payload"]["code"] == "evaluation_interrupted"
    assert error["payload"]["retryable"] is True and error["state"] == "WAITING_FOR_RESPONSE"
    gateway.script("structured", GOOD_EVALUATION)
    assert _answer(ws)["type"] == "INTERVIEW_COMPLETE"  # resubmitting works
    ws.__exit__(None, None, None)


def test_stale_report_generation_reuses_the_saved_report(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 1)
    gateway.script("structured", GOOD_EVALUATION)
    ws = _open(app_client, session_id, token)
    ws.receive_json(), ws.receive_json()
    report_id = _answer(ws)["payload"]["report_id"]
    ws.__exit__(None, None, None)

    # A worker saved the report, then died before marking the session REPORT_READY.
    _set(mock_db, session_id, state="GENERATING_REPORT", report_id=None, updated_at=utcnow() - LONG_AGO)
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    complete = ws.receive_json()
    ws.__exit__(None, None, None)
    assert complete["type"] == "INTERVIEW_COMPLETE" and complete["payload"]["report_id"] == report_id
    assert asyncio.run(mock_db["interview_reports"].count_documents({"session_id": session_id})) == 1
    assert _session(mock_db, session_id)["state"] == "REPORT_READY"


def test_two_connections_racing_ask_exactly_one_question(settings, mock_db):
    """Both connections try to ask question 1 at once. One wins; the other waits and re-syncs."""
    async def run():
        await seed_question_bank(mock_db, load_seed_questions(settings.seed_dir))
        repo = InterviewRepository(mock_db)
        engine = InterviewEngine(repo=repo, question_bank=QuestionRepository(mock_db), gateway=FakeAIGateway())
        session = await engine.create_session(candidate_id="c1", profile=PROFILE, request=InterviewConfigRequest())
        sent = {"a": [], "b": []}

        async def emit_to(name):
            async def emit(evt):
                sent[name].append(evt)
            return emit

        await asyncio.gather(engine.start(session, await emit_to("a")), engine.start(session, await emit_to("b")))
        return sent, await repo.session_questions(session["session_id"]), await repo.get_session(session["session_id"])

    sent, questions, session = asyncio.run(run())
    types = sorted([e["type"] for e in sent["a"]] + [e["type"] for e in sent["b"]])
    assert types == ["QUESTION", "SESSION_SNAPSHOT"]  # one asked, the other re-synced
    resync = next(e for e in sent["a"] + sent["b"] if e["type"] == "SESSION_SNAPSHOT")
    assert resync["payload"]["current_question"]["question_id"] == session["current_question_id"]
    assert len(questions) == 1 and session["state"] == "WAITING_FOR_RESPONSE" and session["questions_asked"] == 1


def test_stale_work_window_comes_from_settings(settings, mock_db):
    app = create_app(settings.model_copy(update={"stale_work_seconds": 7}), db=mock_db, gateway=FakeAIGateway())
    with TestClient(app):
        from app.dependencies import build_engine
        assert build_engine(app.state).stale_work == timedelta(seconds=7)


def test_sender_survives_a_closed_socket():
    """With uvicorn, sending to a browser that has gone raises. The engine must not see that, or it
    stops mid-turn (e.g. after saving an evaluation, before asking the next question)."""
    from app.api.ws import best_effort_sender

    class GoneSocket:
        def __init__(self):
            self.sent = 0

        async def send_text(self, _text):
            self.sent += 1
            raise RuntimeError('Cannot call "send" once a close message has been sent.')

    async def run():
        socket = GoneSocket()
        emit = best_effort_sender(socket)
        await emit({"type": "PROCESSING"})
        await emit({"type": "EVALUATION"})  # skipped: already known to be closed
        return socket.sent

    assert asyncio.run(run()) == 1


def test_engine_finishes_the_turn_when_nothing_can_be_sent(settings, mock_db):
    """handle_answer with a sender that drops everything (the browser is gone): the turn completes."""
    async def run():
        await seed_question_bank(mock_db, load_seed_questions(settings.seed_dir))
        repo = InterviewRepository(mock_db)
        gw = FakeAIGateway().script("structured", GOOD_EVALUATION)
        engine = InterviewEngine(repo=repo, question_bank=QuestionRepository(mock_db), gateway=gw, follow_ups=False)
        session = await engine.create_session(candidate_id="c1", profile=PROFILE,
                                              request=InterviewConfigRequest(question_count=2))

        async def dropped(_evt):
            return None

        await engine.start(session, dropped)
        await engine.handle_answer(session["session_id"], "c1", "Buckets and chaining.", dropped)
        return await repo.get_session(session["session_id"])

    session = asyncio.run(run())
    assert session["state"] == "WAITING_FOR_RESPONSE" and session["questions_asked"] == 2


def test_a_slow_step_another_connection_just_started_is_not_redone(app_client, mock_db, gateway):
    """React's double mount in development opens two sockets at once: the second must not pick (and pay for)
    a question the first is already preparing. It waits, then re-syncs."""
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 2)
    _set(mock_db, session_id, state="INTRODUCTION", updated_at=utcnow())  # someone is preparing question 1
    ws = _open(app_client, session_id, token)
    assert ws.receive_json()["payload"]["state"] == "INTRODUCTION"
    # The other worker finishes: it stored the question and moved to WAITING_FOR_RESPONSE.
    asyncio.run(mock_db["interview_questions"].insert_one({
        "question_id": "q-other", "session_id": session_id, "candidate_id": "x", "interviewer_message": "Hi. Q1?",
        "topic": "dsa", "difficulty": "medium", "is_follow_up": False, "asked_at": utcnow()}))
    _set(mock_db, session_id, state="WAITING_FOR_RESPONSE", current_question_id="q-other", questions_asked=1,
         updated_at=utcnow())
    resync = ws.receive_json()
    ws.__exit__(None, None, None)
    assert resync["type"] == "SESSION_SNAPSHOT" and resync["payload"]["current_question"]["question_id"] == "q-other"
    assert len(asyncio.run(mock_db["interview_questions"].find({"session_id": session_id}).to_list(10))) == 1


def test_a_slow_step_left_behind_is_taken_over_quickly(app_client, mock_db):
    token, headers = _signup(app_client)
    session_id = _create(app_client, headers, 2)
    _set(mock_db, session_id, state="INTRODUCTION", updated_at=utcnow() - timedelta(seconds=30))  # its worker died
    ws = _open(app_client, session_id, token)
    ws.receive_json()
    question = ws.receive_json()
    ws.__exit__(None, None, None)
    assert question["type"] == "QUESTION" and question["payload"]["question_number"] == 1
