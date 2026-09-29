"""Coding interviews (implementation_plan.md 4.6), end to end over the WebSocket. Code runs through the gateway's
executor: here a local Python runner standing in for Piston, so the real harness grades real code."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.db.seed import load_seed_questions, seed_question_bank
from app.gateway import FakeAIGateway
from app.main import create_app
from app.utils.exceptions import ServiceUnavailableError
from tests.fakes import GOOD_EVALUATION, LocalPythonExecutor
from tests.integration.test_interview_config import _create
from tests.integration.test_multi_question_interview import _signup
from tests.integration.test_walking_skeleton import _signup as skeleton_signup
from tests.integration.test_ws_flow import _connect

VALID_OK = """
def is_valid(s):
    pairs, stack = {")": "(", "]": "[", "}": "{"}, []
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack
"""
VALID_HALF = "def is_valid(s):\n    return len(s) % 2 == 0\n"  # right on some tests only
CODE_REVIEW = {
    "overall_score": 9.5,  # ignored: the server recomputes it from the dimensions
    "dimensions": {"correctness": 2, "approach": 8, "time_complexity": 8, "space_complexity": 8,
                   "code_quality": 8, "edge_cases": 7, "communication": 6},
    "strengths": ["Uses a stack"], "weaknesses": ["Complexity not stated"],
    "feedback": "A clean stack solution.", "suggestion": "State the complexity.",
    "model_answer_outline": ["push openers", "match closers", "O(n) time"],
}


@pytest.fixture
def executor():
    return LocalPythonExecutor(timeout_s=3)


@pytest.fixture
def gateway(executor):
    return FakeAIGateway(session_token_budget=1_000_000, executor=executor)


@pytest.fixture
def app_client(settings, mock_db, gateway):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    with TestClient(create_app(settings, db=mock_db, gateway=gateway)) as client:
        yield client


def _coding(client, headers, **extra):
    """One problem, pinned to valid_parentheses with the "stack" focus topic."""
    body = {"interview_type": "coding", "question_count": 1, "focus_topics": ["stack"], **extra}
    return _create(client, headers, **body)["session_id"]


def _start(client, session_id, token):
    ws = _connect(client, session_id, token)
    ws.receive()  # SESSION_SNAPSHOT
    question = ws.receive()["payload"]
    return ws, question


def test_options_offer_coding_when_the_code_runner_is_configured(app_client):
    _, headers = _signup(app_client)
    data = app_client.get("/api/v1/interviews/options", params={"interview_type": "coding"}, headers=headers).json()["data"]
    assert all(u["value"] != "coding" for u in data["unavailable"])
    assert {"arrays", "stack", "dynamic_programming", "graphs"} <= set(data["topics"])
    assert data["defaults"]["coding_language"] == "python"
    too_many = app_client.post("/api/v1/interviews", json={"interview_type": "coding", "question_count": 5}, headers=headers)
    assert too_many.status_code == 422


def test_the_question_shows_the_problem_but_never_hidden_tests(app_client):
    token, headers = _signup(app_client)
    ws, question = _start(app_client, _coding(app_client, headers, coding_language="java"), token)
    coding = question["coding"]
    assert coding["entry_function"] == "is_valid" and coding["default_language"] == "java"
    assert question["suggested_seconds"] == coding["time_limit_minutes"] * 60
    assert len(coding["visible_tests"]) == 3 and coding["hidden_test_count"] == 2
    assert set(coding["starter_code"]) == {"python", "javascript", "java", "cpp", "c"}
    assert [lang["key"] for lang in coding["languages"] if lang["graded"]] == ["python"]
    assert '"([)]"' not in str(question)  # a hidden input
    ws.close()


def test_practice_submission_runs_every_test_and_scores_correctness_from_them(app_client, gateway, executor):
    token, headers = _signup(app_client)
    session_id = _coding(app_client, headers)
    ws, question = _start(app_client, session_id, token)

    # Run: the visible tests only, nothing recorded.
    run = app_client.post(f"/api/v1/interviews/{session_id}/code/run", json={"code": VALID_HALF, "language": "python"},
                          headers=headers).json()["data"]
    assert run["total_tests"] == 3 and not any(t["is_hidden"] for t in run["test_results"])

    gateway.script("structured", CODE_REVIEW)
    ws.send({"type": "CODE_SUBMIT", "code": VALID_HALF, "language": "python", "explanation": "Even length."})
    assert ws.receive()["type"] == "PROCESSING"
    result = ws.receive()
    assert result["type"] == "CODE_RESULT" and result["payload"]["total_tests"] == 5
    assert result["payload"]["status"] == "wrong_answer"
    assert all(t["input"] for t in result["payload"]["test_results"])  # practice: hidden tests shown after submit
    assert ws.receive()["type"] == "PROCESSING"
    evaluation = ws.receive()["payload"]
    passed = result["payload"]["passed_tests"]
    assert evaluation["dimensions"]["correctness"] == round(10 * passed / 5, 1)  # the tests, not the LLM's 2
    assert evaluation["overall_score"] != 9.5
    prompt = gateway.calls_of("structured")[-1]["prompt"]
    assert "Even length." in prompt and f"Passed {passed} of 5 tests" in prompt and '"([)]"' not in prompt
    complete = ws.receive()
    assert complete["type"] == "INTERVIEW_COMPLETE"
    ws.close()

    report = app_client.get(f"/api/v1/reports/{complete['payload']['report_id']}", headers=headers).json()["data"]
    assert set(report["scores"]) >= {"overall", "problem_solving", "complexity", "code_quality", "communication"}
    [row] = report["question_scores"]
    assert (row["tests_passed"], row["tests_total"], row["language"]) == (passed, 5, "python")
    answer = next(t for t in report["transcript"] if t["role"] == "candidate")
    assert answer["code"] == VALID_HALF and answer["language"] == "python" and answer["execution"]["total_tests"] == 5
    assert len(executor.programs) == 2  # one Run, one Submit; nothing ran anywhere else


def test_serious_mode_hides_hidden_tests_and_scores(app_client, gateway):
    token, headers = _signup(app_client)
    session_id = _coding(app_client, headers, interview_mode="serious")
    ws, _ = _start(app_client, session_id, token)
    gateway.script("structured", CODE_REVIEW)
    ws.send({"type": "CODE_SUBMIT", "code": VALID_OK, "language": "python"})
    events = [ws.receive() for _ in range(4)]
    assert [e["type"] for e in events] == ["PROCESSING", "CODE_RESULT", "PROCESSING", "INTERVIEW_COMPLETE"]
    result = events[1]["payload"]
    assert result["status"] == "accepted" and result["passed_tests"] == 5
    hidden = [t for t in result["test_results"] if t["is_hidden"]]
    assert len(hidden) == 2 and all(t["input"] is None and t["expected"] is None for t in hidden)
    ws.close()
    report = app_client.get(f"/api/v1/reports/{events[3]['payload']['report_id']}", headers=headers).json()["data"]
    execution = next(t for t in report["transcript"] if t["role"] == "candidate")["execution"]
    assert all(t["input"] is None for t in execution["test_results"] if t["is_hidden"])  # still hidden in the report


def test_draft_code_survives_a_reconnect(app_client):
    token, headers = _signup(app_client)
    session_id = _coding(app_client, headers)
    ws, _ = _start(app_client, session_id, token)
    ws.send({"type": "CODE_DRAFT", "code": "def is_valid(s):\n    # thinking", "language": "python"})
    ws.send({"type": "PING"})
    assert ws.receive()["type"] == "PONG"
    ws.close()
    ws = _connect(app_client, session_id, token)
    snapshot = ws.receive()["payload"]
    assert snapshot["draft_code"] == {"code": "def is_valid(s):\n    # thinking", "language": "python"}
    assert snapshot["current_question"]["coding"]["entry_function"] == "is_valid"
    ws.close()


def test_bad_submissions_are_refused_without_changing_state(app_client, settings):
    token, headers = _signup(app_client)
    session_id = _coding(app_client, headers)
    ws, _ = _start(app_client, session_id, token)
    ws.send({"type": "ANSWER", "answer_text": "I'd use a stack."})
    assert ws.receive()["payload"]["code"] == "code_expected"
    ws.send({"type": "CODE_SUBMIT", "code": "   ", "language": "python"})
    assert ws.receive()["payload"]["code"] == "code_empty"
    ws.send({"type": "CODE_SUBMIT", "code": "x" * (settings.max_code_chars + 1), "language": "python"})
    assert ws.receive()["payload"]["code"] == "code_too_long"
    ws.close()
    assert app_client.get(f"/api/v1/interviews/{session_id}", headers=headers).json()["data"]["state"] == "WAITING_FOR_RESPONSE"


def test_a_sandbox_outage_is_retryable_and_records_nothing(app_client, gateway, mock_db):
    token, headers = _signup(app_client)
    session_id = _coding(app_client, headers)
    ws, _ = _start(app_client, session_id, token)
    gateway.script("execute", ServiceUnavailableError("down", code="code_runner_unavailable"))
    ws.send({"type": "CODE_SUBMIT", "code": VALID_OK, "language": "python"})
    assert ws.receive()["type"] == "PROCESSING"
    error = ws.receive()
    assert error["payload"]["code"] == "code_runner_unavailable" and error["payload"]["retryable"] is True
    assert error["state"] == "WAITING_FOR_RESPONSE"
    assert asyncio.run(mock_db["candidate_answers"].count_documents({"session_id": session_id})) == 0
    gateway.script("structured", CODE_REVIEW)
    ws.send({"type": "CODE_SUBMIT", "code": VALID_OK, "language": "python"})  # the retry goes through
    assert [ws.receive()["type"] for _ in range(4)][1] == "CODE_RESULT"
    ws.close()


def test_run_needs_a_waiting_coding_problem(app_client):
    token, headers = _signup(app_client)
    technical = _create(app_client, headers, question_count=1)["session_id"]
    ws, _ = _start(app_client, technical, token)
    ws.close()
    wrong = app_client.post(f"/api/v1/interviews/{technical}/code/run", json={"code": "x"}, headers=headers)
    assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "no_coding_question"


def test_run_is_rate_limited_per_candidate(app_client, settings):
    token, headers = _signup(app_client)
    session_id = _coding(app_client, headers)
    ws, _ = _start(app_client, session_id, token)
    ws.close()  # Run is REST; the socket isn't needed (and a failed assert can't leave it open)
    codes = [app_client.post(f"/api/v1/interviews/{session_id}/code/run", json={"code": VALID_OK}, headers=headers).status_code
             for _ in range(settings.code_runs_per_minute + 1)]
    assert codes[:-1] == [200] * settings.code_runs_per_minute and codes[-1] == 429


def test_other_users_cannot_run_code_in_your_session(app_client):
    token, headers = skeleton_signup(app_client, "ada@example.com")
    _, bob = skeleton_signup(app_client, "bob@example.com")
    session_id = _coding(app_client, headers)
    ws, _ = _start(app_client, session_id, token)
    assert app_client.post(f"/api/v1/interviews/{session_id}/code/run", json={"code": VALID_OK},
                           headers=bob).status_code == 404
    ws.close()


def test_a_follow_up_on_a_coding_problem_is_a_text_question(settings, mock_db, gateway):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    adequate = {**CODE_REVIEW, "dimensions": {**CODE_REVIEW["dimensions"], "correctness": 5}}
    app = create_app(settings.model_copy(update={"interview_follow_ups": True}), db=mock_db, gateway=gateway)
    with TestClient(app) as client:
        token, headers = _signup(client)
        session_id = _coding(client, headers)
        ws, _ = _start(client, session_id, token)
        gateway.script("structured", adequate, GOOD_EVALUATION)
        ws.send({"type": "CODE_SUBMIT", "code": VALID_HALF, "language": "python", "explanation": "Stack."})
        events = [ws.receive() for _ in range(5)]
        follow_up = events[-1]
        assert follow_up["type"] == "QUESTION" and follow_up["payload"]["is_follow_up"]
        assert follow_up["payload"]["coding"] is None  # answered in words, graded by the technical evaluator
        ws.send({"type": "ANSWER", "answer_text": "O(n) time, O(n) space for the stack."})
        assert [ws.receive()["type"] for _ in range(3)] == ["PROCESSING", "EVALUATION", "INTERVIEW_COMPLETE"]
        ws.close()
