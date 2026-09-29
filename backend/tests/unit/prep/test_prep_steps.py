"""Phase 3 steps on their own: gap analysis, intent, planner checks and fallback, research, JD, rendering."""
import asyncio

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.agents.prep import gap_analyzer, intent
from app.agents.prep.candidate_profiler import CandidateSnapshot
from app.agents.prep.company_research import clean_company_name, research_company
from app.agents.prep.gap_analyzer import Requirement, company_requirements, merge
from app.agents.prep.jd_analyzer import analyze_jd
from app.agents.prep.planner import fallback_plan, validate
from app.agents.prep.render import actions_for, render
from app.config import Settings
from app.db.repositories.company_repo import CompanyRepository
from app.db.seed import load_seed_companies, seed_companies
from app.gateway import FakeAIGateway
from app.gateway.types import CallContext

SEED_DIR = Settings(_env_file=None, app_env="test").seed_dir


def _candidate(**scores):
    return CandidateSnapshot(name="Ada", target_role="Software Engineer", experience_level="1-2", skills=[],
                             interviews_done=len(scores), scores=scores)


# ── gap analysis ──
def test_gaps_rank_weak_high_importance_first_and_strengths_apart():
    reqs = [Requirement("dsa", "high"), Requirement("system_design", "high"), Requirement("dbms", "medium"),
            Requirement("graphs", "medium"), Requirement("ownership", "low")]
    result = gap_analyzer.analyze(reqs, _candidate(dsa=3.0, dbms=8.2, graphs=6.0))
    assert [g["area"] for g in result["gaps"]] == ["dsa", "system_design", "graphs", "ownership"]
    assert [(g["status"], g["kind"]) for g in result["gaps"]][:3] == [("weak", "technical"), ("untested", "technical"),
                                                                      ("developing", "coding")]
    assert [s["area"] for s in result["strengths"]] == ["dbms"]


def test_merge_keeps_the_highest_importance_and_every_reason_and_drops_unknown_areas():
    merged = merge([Requirement("dsa", "medium", "Google")], [Requirement("dsa", "high", "JD: algorithms"),
                                                              Requirement("kafka", "high", "JD")])
    assert len(merged) == 1 and merged[0].importance == "high" and merged[0].reason == "Google; JD: algorithms"


def test_company_requirements_weight_the_first_focus_areas():
    reqs = company_requirements({"name": "X", "technical_focus": ["dsa", "system_design", "oops"],
                                 "coding_focus": ["graphs"], "competencies": ["ownership"]})
    assert [(r.area, r.importance) for r in reqs] == [("dsa", "high"), ("system_design", "high"), ("oops", "medium"),
                                                      ("graphs", "high"), ("ownership", "medium")]


# ── intent ──
KNOWN = [("Google", ["alphabet"]), ("Amazon", ["aws"]), ("Goldman Sachs", ["gs", "goldman"])]


@pytest.mark.parametrize("message, company, weeks", [
    ("Prepare me for Google", "Google", None),
    ("Help me prepare for an interview at Amazon in 3 weeks", "Amazon", 3),
    ("prepare me for aws", "Amazon", None),
    ("Can you make a study plan for Goldman Sachs?", "Goldman Sachs", None),
    ("Prepare me for Stripe", "Stripe", None),
    ("get me ready for the Swiggy placement drive", "Swiggy", None),
    ("prepare me for the Razorpay SDE role in 2 weeks", "Razorpay", 2),
])
def test_prep_requests_are_recognised(message, company, weeks):
    assert intent.detect(message, KNOWN) == intent.PrepRequest(company, weeks)


@pytest.mark.parametrize("message", [
    "prepare me for system design", "Prepare for DSA", "How did I do in my Google interview?",
    "What should I prepare for next?", "prepare me for coding interviews", "Plan for next week", "Drill me on my weak spots",
])
def test_study_questions_are_not_company_prep(message):
    assert intent.detect(message, KNOWN) is None


# ── planner ──
ANALYSIS = gap_analyzer.analyze([Requirement("dsa", "high"), Requirement("graphs", "high"), Requirement("ownership", "medium"),
                                 Requirement("dbms", "medium")], _candidate(dsa=3.0, dbms=8.0))


def test_validate_drops_unknown_topics_and_mismatched_mock_topics():
    plan = {"summary": "s", "estimated_weeks": 5, "readiness_check": "r", "company_tips": ["a", "b", "c", "d", "e"],
            "weeks": [{"week": 3, "theme": "t", "focus_areas": ["dsa", "kafka"], "activities": ["x"],
                       "mock_interview": {"interview_type": "coding", "focus_areas": ["graphs", "dsa", "ownership"], "mode": "practice"}}]}
    out = validate(plan, {"dsa", "graphs", "ownership", "dbms"})
    week = out["weeks"][0]
    assert week["week"] == 1 and week["focus_areas"] == ["dsa"] and week["mock_interview"]["focus_areas"] == ["graphs"]
    assert out["estimated_weeks"] == 1 and len(out["company_tips"]) == 4


@pytest.mark.parametrize("weeks, expected", [(None, 3), (1, 1), (4, 4)])
def test_fallback_plan_covers_the_gaps_and_ends_with_a_rehearsal(weeks, expected):
    plan = fallback_plan(company_name="Acme", company={"technical_focus": ["dsa"], "tips": ["t"]}, analysis=ANALYSIS, weeks=weeks)
    assert plan["estimated_weeks"] == len(plan["weeks"]) == expected
    covered = {a for w in plan["weeks"] for a in w["focus_areas"]}
    assert {"dsa", "graphs", "ownership"} <= covered
    if expected > 1:
        assert plan["weeks"][-1]["mock_interview"]["mode"] == "serious"


# ── research ──
def _repo():
    db = AsyncMongoMockClient()["prep_test"]
    asyncio.run(seed_companies(db, load_seed_companies(SEED_DIR)))
    return CompanyRepository(db)


RESEARCHED = {"known": True, "name": "Stripe", "overview": "Payments.", "tips": ["t"],
              "interview_process": [{"stage": "Screen", "description": "Coding."}],
              "technical_focus": ["system_design", "api_design", "kubernetes"], "coding_focus": ["hashing", "system_design"],
              "behavioral_values": ["Users first"], "competencies": ["ownership", "dsa"]}


def test_curated_companies_need_no_llm_and_aliases_resolve():
    repo, gw = _repo(), FakeAIGateway()
    found = asyncio.run(research_company("aws", repo=repo, gateway=gw, context=CallContext()))
    assert found.source == "curated" and found.company["name"] == "Amazon" and gw.calls_of("structured") == []


def test_unknown_companies_are_researched_once_then_cached_with_clean_fields():
    repo, gw = _repo(), FakeAIGateway()
    gw.script("structured", RESEARCHED)
    first = asyncio.run(research_company("stripe", repo=repo, gateway=gw, context=CallContext()))
    assert first.source == "llm" and first.company["technical_focus"] == ["system_design", "api_design"]
    assert first.company["coding_focus"] == ["hashing"] and first.company["competencies"] == ["ownership"]
    again = asyncio.run(research_company("Stripe", repo=repo, gateway=gw, context=CallContext()))
    assert again.source == "cached" and len(gw.calls_of("structured")) == 1


def test_a_name_the_model_doesnt_recognise_is_not_cached():
    repo, gw = _repo(), FakeAIGateway()
    gw.script("structured", {**RESEARCHED, "known": False}, {**RESEARCHED, "known": False})
    for _ in range(2):
        assert asyncio.run(research_company("Qwxyz Labs", repo=repo, gateway=gw, context=CallContext())).company is None
    assert len(gw.calls_of("structured")) == 2  # asked again: nothing unreliable was stored


def test_company_names_are_cleaned_before_use():
    assert clean_company_name("  Acme <script>alert(1)</script> Inc!!  ") == "Acme script alert 1 script Inc"
    assert len(clean_company_name("x" * 200)) == 60


# ── JD ──
def test_jd_areas_outside_the_vocabulary_become_other_skills():
    gw = FakeAIGateway().script("structured", {
        "role_title": "Backend Engineer", "seniority": "3-5", "summary": "APIs.",
        "requirements": [{"area": "system_design", "importance": "high", "evidence": "design scalable services"},
                         {"area": "kafka", "importance": "medium", "evidence": "Kafka"}],
        "other_skills": ["Kubernetes"], "interview_types": ["technical"]})
    out = asyncio.run(analyze_jd("We need...", gateway=gw, context=CallContext()))
    assert [r["area"] for r in out["requirements"]] == ["system_design"] and out["other_skills"] == ["Kubernetes", "kafka"]
    assert "We need..." in gw.calls_of("structured")[0]["prompt"]


# ── rendering ──
def test_plan_renders_with_practice_buttons_and_an_honest_source_note():
    plan = fallback_plan(company_name="Acme", company=None, analysis=ANALYSIS, weeks=2)
    actions = actions_for(plan, company="Acme", role="Software Engineer")
    assert actions[0]["href"].startswith("/interview/configure?type=") and "company=Acme" in actions[0]["href"]
    assert "role=Software+Engineer" in actions[0]["href"] and actions[-1]["label"].startswith("Week 2: Technical (serious)")
    text = render(company_name="Acme", company=None, company_source="unknown", plan=plan, analysis=ANALYSIS, jd=None,
                  plan_source="fallback")
    assert "## Your plan for Acme" in text and "I don't have reliable information on how Acme interviews" in text
    assert "built without AI" in text and "DBMS (8.0/10)" in text
