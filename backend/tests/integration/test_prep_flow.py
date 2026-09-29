"""Company preparation through the Mentor (Phase 3): chat trigger, JD form, partial failures, storage, isolation."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core.mentor.rag_tool import RagService
from app.db.seed import load_seed_questions, seed_question_bank
from app.main import create_app
from app.utils.exceptions import ServiceUnavailableError
from tests.fakes import GOOD_EVALUATION, HashEmbeddings, drain_indexing
from tests.integration.test_walking_skeleton import ONE_QUESTION, _open, _signup

PLAN = {
    "summary": "You're solid on hashing basics but haven't practised system design, which Amazon tests.",
    "estimated_weeks": 2,
    "weeks": [
        {"week": 1, "theme": "System design basics", "focus_areas": ["system_design", "kafka"],
         "activities": ["Design a URL shortener end to end.", "Review caching and sharding."],
         "mock_interview": {"interview_type": "technical", "focus_areas": ["system_design"], "mode": "practice"}},
        {"week": 2, "theme": "Leadership Principles", "focus_areas": ["ownership"],
         "activities": ["Write three STAR stories on ownership."],
         "mock_interview": {"interview_type": "behavioral", "focus_areas": ["ownership"], "mode": "serious"}},
    ],
    "readiness_check": "Book it once you score 7.5+ in serious mode.",
    "company_tips": ["Use 'I', not 'we'."],
}


@pytest.fixture
def rag(tmp_path):
    return RagService(HashEmbeddings(), str(tmp_path / "chroma"), "prep_test")


@pytest.fixture
def app_client(settings, mock_db, gateway, rag):
    asyncio.run(seed_question_bank(mock_db, load_seed_questions(settings.seed_dir)))
    with TestClient(create_app(settings, db=mock_db, gateway=gateway, rag=rag)) as client:
        from app.db.seed import load_seed_companies, seed_companies
        asyncio.run(seed_companies(mock_db, load_seed_companies(settings.seed_dir)))
        yield client


def _one_interview(client, gateway, token, headers, focus=("system_design",)):
    """One answer scored 6.5 (GOOD_EVALUATION) on the focus topic."""
    body = {**ONE_QUESTION, "focus_topics": list(focus)}
    session_id = client.post("/api/v1/interviews", json=body, headers=headers).json()["data"]["session_id"]
    gateway.script("structured", GOOD_EVALUATION)
    ws = _open(client, session_id, token)
    ws.receive_json(), ws.receive_json()
    ws.send_json({"type": "ANSWER", "answer_text": "Buckets."})
    [ws.receive_json() for _ in range(3)]
    ws.__exit__(None, None, None)
    drain_indexing(client)


def test_prepare_me_for_a_known_company_in_chat(app_client, gateway, mock_db, rag):
    token, headers = _signup(app_client)
    _one_interview(app_client, gateway, token, headers)
    gateway.script("structured", PLAN)
    reply = app_client.post("/api/v1/mentor/message", json={"message": "Prepare me for Amazon in 2 weeks"},
                            headers=headers).json()["data"]
    assert reply["answer"].startswith("## Your plan for Amazon (about 2 weeks)")
    assert "How Amazon usually interviews" in reply["answer"] and "Customer Obsession" in reply["answer"]
    assert "curated notes" in reply["answer"]
    hrefs = [a["href"] for a in reply["actions"]]
    assert hrefs[0] == "/interview/configure?type=technical&mode=practice&company=Amazon&focus=system_design&role=Software+Engineer"
    assert "mode=serious" in hrefs[1] and "type=behavioral" in hrefs[1]

    # Only the planner called the LLM (Amazon is curated; no JD), and it saw real scores and the curated notes.
    prompt = gateway.calls_of("structured")[-1]["prompt"]
    assert "prep/planner_v1" == gateway.calls_of("structured")[-1]["context"].prompt_version
    assert "The candidate wants to be ready in 2 week(s)." in prompt and "Leadership Principles" not in prompt
    assert "system_design (technical): developing, 6.5/10; importance high" in prompt  # the real score
    assert "dsa (technical): untested; importance high" in prompt
    assert "importance high; Amazon: technical interviews" in prompt and "Customer Obsession" in prompt

    plan = app_client.get(f"/api/v1/prep/plans/{reply['prep_plan_id']}", headers=headers).json()["data"]
    assert plan["company_source"] == "curated" and plan["plan_source"] == "llm"
    assert plan["plan"]["weeks"][0]["focus_areas"] == ["system_design"]  # "kafka" isn't a known area
    assert [p["plan_id"] for p in app_client.get("/api/v1/prep/plans", headers=headers).json()["data"]] == [reply["prep_plan_id"]]
    [run] = asyncio.run(mock_db["agent_runs"].find({"agent_name": "prep_orchestrator"}).to_list(10))
    assert [s["step"] for s in run["steps"]] == ["research_company", "analyze_jd", "profile_candidate", "gap_analysis", "write_plan"]
    assert run["steps"][1]["status"] == "skipped" and run["plan_id"] == reply["prep_plan_id"]

    # The plan is in the conversation and in the Mentor's index (this candidate only), as the reply's source.
    conversation = app_client.get(f"/api/v1/mentor/conversations/{reply['conversation_id']}", headers=headers).json()["data"]
    assert conversation["messages"][1]["prep_plan_id"] == reply["prep_plan_id"]
    assert conversation["messages"][1]["sources"][0]["chunk_type"] == "prep_plan"
    stored = rag.collection.get(ids=[f"{reply['prep_plan_id']}:prep_plan"], include=["metadatas"])["metadatas"][0]
    user_id = app_client.get("/api/v1/users/me", headers=headers).json()["data"]["id"]
    assert stored["user_id"] == user_id and stored["chunk_type"] == "prep_plan" and stored["topic"] == "Amazon"


def test_a_follow_up_about_the_plan_is_answered_from_it(app_client, gateway):
    token, headers = _signup(app_client)
    gateway.script("structured", PLAN)
    reply = app_client.post("/api/v1/mentor/message", json={"message": "Prepare me for Amazon"}, headers=headers).json()["data"]
    gateway.script("generate", "In week 2 you write STAR stories [1].")
    follow = app_client.post("/api/v1/mentor/message", json={"message": "What do I do in week 2?",
                                                              "conversation_id": reply["conversation_id"]}, headers=headers).json()["data"]
    assert any(s["chunk_type"] == "prep_plan" for s in follow["sources"])
    assert "Preparation plan for Amazon" in gateway.calls_of("generate")[-1]["prompt"]


def test_the_form_with_a_job_description_for_an_unknown_company(app_client, gateway):
    _, headers = _signup(app_client)
    research = {"known": True, "name": "Stripe", "overview": "Payments.", "tips": ["Know the API."],
                "interview_process": [{"stage": "Bug squash", "description": "Debug a real codebase."}],
                "technical_focus": ["api_design"], "coding_focus": [], "behavioral_values": ["Users first"],
                "competencies": ["ownership"]}
    jd = {"role_title": "Backend Engineer", "seniority": "3-5", "summary": "Payments APIs.",
          "requirements": [{"area": "system_design", "importance": "high", "evidence": "design distributed systems"},
                           {"area": "dbms", "importance": "medium", "evidence": "SQL"}],
          "other_skills": ["Ruby"], "interview_types": ["technical"]}
    by_prompt = {"prep/company_research_v1": research, "prep/jd_analysis_v1": jd, "prep/planner_v1": PLAN}
    # Research and JD analysis run concurrently, so answer by prompt rather than by order.
    gateway.script("structured", *[lambda args: by_prompt[args["context"].prompt_version]] * 3)
    reply = app_client.post("/api/v1/mentor/prepare", json={"company": "stripe", "jd_text": "We need a backend engineer...",
                                                            "weeks": 2}, headers=headers).json()["data"]
    assert "## Your plan for Stripe" in reply["answer"] and "written by AI from general knowledge" in reply["answer"]
    assert "Also in the job description:** Ruby" in reply["answer"]
    assert "What they look for" not in reply["answer"]  # AI-researched values aren't quoted as fact
    plan = app_client.get(f"/api/v1/prep/plans/{reply['prep_plan_id']}", headers=headers).json()["data"]
    areas = {g["area"]: g for g in plan["analysis"]["gaps"]}
    assert areas["system_design"]["importance"] == "high" and "JD: design distributed systems" in areas["system_design"]["reason"]
    assert reply["messages"][0]["content"] == "Prepare me for Stripe (with a job description)"
    # A second plan for Stripe uses the cached research: only JD-less planning calls the LLM now.
    gateway.script("structured", PLAN)
    app_client.post("/api/v1/mentor/prepare", json={"company": "Stripe"}, headers=headers)
    calls = gateway.calls_of("structured")
    assert sorted(c["context"].prompt_version for c in calls) == [
        "prep/company_research_v1", "prep/jd_analysis_v1", "prep/planner_v1", "prep/planner_v1"]
    assert next(c for c in calls if c["context"].prompt_version == "prep/jd_analysis_v1")["tier"] == "fast"


def test_partial_failures_still_give_a_plan(app_client, gateway):
    _, headers = _signup(app_client)
    down = ServiceUnavailableError("busy", code="llm_rate_limited")
    gateway.script("structured", down, down)  # research fails, then the planner fails
    reply = app_client.post("/api/v1/mentor/prepare", json={"company": "Zeptonow"}, headers=headers).json()["data"]
    assert "## Your plan for Zeptonow" in reply["answer"] and "couldn't look up the company" in reply["answer"]
    assert "built without AI" in reply["answer"] and reply["actions"]
    plan = app_client.get(f"/api/v1/prep/plans/{reply['prep_plan_id']}", headers=headers).json()["data"]
    assert plan["plan_source"] == "fallback" and plan["company_source"] == "failed"
    # No company info and no JD: the gaps come from the candidate's target role.
    assert {g["area"] for g in plan["analysis"]["gaps"]} >= {"dsa", "system_design"}


def test_study_questions_still_go_to_the_mentor(app_client, gateway):
    token, headers = _signup(app_client)
    _one_interview(app_client, gateway, token, headers)
    gateway.script("generate", "Start with the basics [1].")
    reply = app_client.post("/api/v1/mentor/message", json={"message": "Prepare me for system design"},
                            headers=headers).json()["data"]
    assert "prep_plan_id" not in reply and reply["sources"]


def test_plans_are_private_and_limited(settings, mock_db, gateway, rag):
    app = create_app(settings.model_copy(update={"prep_plans_per_hour": 1}), db=mock_db, gateway=gateway, rag=rag)
    with TestClient(app) as client:
        from app.db.seed import load_seed_companies, seed_companies
        asyncio.run(seed_companies(mock_db, load_seed_companies(settings.seed_dir)))
        _, ada = _signup(client, "ada@example.com")
        _, bob = _signup(client, "bob@example.com")
        gateway.script("structured", PLAN)
        plan_id = client.post("/api/v1/mentor/prepare", json={"company": "Google"}, headers=ada).json()["data"]["prep_plan_id"]
        assert client.get(f"/api/v1/prep/plans/{plan_id}", headers=bob).status_code == 404
        assert client.get("/api/v1/prep/plans", headers=bob).json()["data"] == []
        again = client.post("/api/v1/mentor/prepare", json={"company": "Google"}, headers=ada)
        assert again.status_code == 429
        assert client.post("/api/v1/mentor/prepare", json={"company": "x" * 61}, headers=bob).status_code == 422
