"""Phase 6 end to end: calls recorded per interview, the prompt registry through the admin API (A/B + rollback),
usage reports, live metrics, the daily token cap, and admin-only access."""
import asyncio
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db.seed import load_seed_questions, seed_question_bank
from app.main import create_app
from tests.fakes import GOOD_EVALUATION
from tests.unit.test_report_writer import NARRATIVE
from tests.integration.test_walking_skeleton import ONE_QUESTION, _open, _signup


def _app(settings, mock_db, gateway, **overrides):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    return TestClient(create_app(settings.model_copy(update={"admin_emails": ["boss@example.com"], **overrides}),
                                 db=mock_db, gateway=gateway))


def _flush(client):
    client.portal.call(client.app.state.gateway.recorder.flush)


def _interview(client, gateway, token, headers):
    session_id = client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).json()["data"]["session_id"]
    gateway.script("structured", GOOD_EVALUATION, NARRATIVE)
    ws = _open(client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "Buckets."})
    report_id = [ws.receive_json() for _ in range(3)][-1]["payload"]["report_id"]
    ws.__exit__(None, None, None)
    return session_id, report_id


def test_admin_endpoints_are_admin_only(settings, mock_db, gateway):
    with _app(settings, mock_db, gateway) as client:
        _, user = _signup(client, "ada@example.com")
        _, boss = _signup(client, "boss@example.com")
        for path in ("/api/v1/admin/metrics", "/api/v1/admin/usage", "/api/v1/admin/prompts", "/api/v1/admin/llm-calls"):
            assert client.get(path, headers=user).status_code == 403, path
            assert client.get(path, headers=boss).status_code == 200, path
        assert client.put("/api/v1/admin/prompts/report/report", json={"weights": {"v2": 100}}, headers=user).status_code == 403
        assert client.get("/api/v1/users/me", headers=boss).json()["data"]["is_admin"] is True
        assert client.get("/api/v1/users/me", headers=user).json()["data"]["is_admin"] is False


def test_calls_are_recorded_and_a_prompt_ab_switch_takes_effect_and_rolls_back(settings, mock_db, gateway):
    with _app(settings, mock_db, gateway, report_writer=True) as client:
        token, headers = _signup(client, "ada@example.com")
        _, boss = _signup(client, "boss@example.com")
        # Switch the report prompt to v2 without a deploy.
        switched = client.put("/api/v1/admin/prompts/report/report", json={"weights": {"v2": 100}}, headers=boss)
        assert switched.status_code == 200
        session_id, report_id = _interview(client, gateway, token, headers)
        report = client.get(f"/api/v1/reports/{report_id}", headers=headers).json()["data"]
        assert report["prompt_version_used"] == "report/report_v2"
        assert "Follow-ups are marked with the question they follow" in gateway.calls_of("structured")[-1]["prompt"]

        _flush(client)
        calls = client.get("/api/v1/admin/llm-calls", params={"session_id": session_id}, headers=boss).json()["data"]
        assert {c["prompt_version"] for c in calls} == {"evaluator/technical_v1", "report/report_v2"}
        assert all(c["status"] == "ok" and c["tokens"] > 0 and "prompt_text" not in c for c in calls)

        prompts = {p["name"]: p for p in client.get("/api/v1/admin/prompts", headers=boss).json()["data"]}
        assert prompts["report/report"]["weights"] == {"v2": 100}
        assert [v["version"] for v in prompts["interviewer/interviewer"]["versions"]] == ["v1", "v2"]
        technical = next(v for v in prompts["evaluator/technical"]["versions"] if v["version"] == "v1")
        assert technical["evaluations"] == {"n": 1, "avg_score": 6.5}

        # Bad weights are refused; rollback returns to the version in code.
        bad = client.put("/api/v1/admin/prompts/report/report", json={"weights": {"v1": 50}}, headers=boss)
        assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_prompt_weights"
        assert client.delete("/api/v1/admin/prompts/report/report", headers=boss).status_code == 200
        assert client.app.state.prompts.choose("report/report_v1", session_id) == "report/report_v1"


def test_usage_report_and_live_metrics(settings, mock_db, gateway):
    with _app(settings, mock_db, gateway) as client:
        token, headers = _signup(client, "ada@example.com")
        _, boss = _signup(client, "boss@example.com")
        _interview(client, gateway, token, headers)
        _flush(client)
        usage = client.get("/api/v1/admin/usage", params={"days": 1}, headers=boss).json()["data"]
        assert usage["by_day"][0]["calls"] >= 1 and usage["by_day"][0]["tokens"] > 0
        assert {r["prompt_version"] for r in usage["by_prompt_version"]} >= {"evaluator/technical_v1"}
        assert usage["top_candidates"][0]["tokens"] > 0
        # The test gateway's session budget is 1,000 tokens, so that interview really was ended by the budget.
        assert usage["budget_wrap_ups"] == 1 and usage["time_limit_wrap_ups"] == 0
        live = client.get("/api/v1/admin/metrics", headers=boss).json()["data"]
        routes = {r["key"] for r in live["http"]["by_route"]}
        assert "POST /api/v1/interviews" in routes and live["llm"]["count"] >= 1
        assert live["websocket"]["sessions"] >= 1 and live["websocket"]["active"] == 0


def test_the_daily_token_cap_stops_new_ai_work(settings, mock_db, gateway):
    with _app(settings, mock_db, gateway, daily_token_limit_per_user=1_000) as client:
        _, headers = _signup(client, "ada@example.com")
        me = client.get("/api/v1/users/me", headers=headers).json()["data"]["id"]
        asyncio.run(mock_db["llm_calls"].insert_one({"candidate_id": me, "tokens": 1_000, "status": "ok",
                                                      "at": datetime.now(timezone.utc)}))
        blocked = client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers)
        assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "daily_limit"
        assert client.post("/api/v1/mentor/message", json={"message": "hi"}, headers=headers).status_code == 429
        assert client.post("/api/v1/mentor/prepare", json={"company": "Google"}, headers=headers).status_code == 429
        # Yesterday's usage doesn't count.
        asyncio.run(mock_db["llm_calls"].update_many({}, {"$set": {"at": datetime(2020, 1, 1, tzinfo=timezone.utc)}}))
        assert client.post("/api/v1/interviews", json=ONE_QUESTION, headers=headers).status_code == 201
