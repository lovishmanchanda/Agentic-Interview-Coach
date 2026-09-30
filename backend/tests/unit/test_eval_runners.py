"""Phase 6 eval runners on the fake gateway (no network): the agent and question evals compute what they claim."""
import asyncio
import importlib.util
from pathlib import Path

from app.agents.interview_agent_schemas import AgentDecision
from app.agents.interview_agent import AgentRun
from app.gateway import FakeAIGateway
from app.gateway.types import ToolCall

ROOT = Path(__file__).resolve().parents[3]


def _load(rel):
    spec = importlib.util.spec_from_file_location(rel.replace("/", "_"), ROOT / rel)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


agent_eval = _load("evaluation/agent_eval/run_agent_eval.py")
question_eval = _load("evaluation/question_eval/run_question_eval.py")


def test_agent_scenarios_are_well_formed():
    cases = agent_eval.load_cases()
    assert len(cases) >= 12 and len({c["id"] for c in cases}) == len(cases)
    for c in cases:
        assert set(c["expect"]["actions"]) <= {"deliver_follow_up", "deliver_question", "wrap_up"}
        assert c["allowed"] and c["recommended"] in c["allowed"]


def test_agent_checks_flag_redundant_follow_ups_praise_and_score_leaks():
    case = {"id": "t", "expect": {"actions": ["deliver_follow_up"], "covered": ["load factor"], "neutral": True}}
    redundant = AgentRun(decision=AgentDecision(action="deliver_follow_up", lead_in="Great answer!",
                                                follow_up_question="What happens when the load factor grows?"), outcome="accepted")
    row = agent_eval.check(case, redundant)
    assert row["expected"] and row["redundant"] is True and row["neutral"] is False
    leak = AgentRun(decision=AgentDecision(action="deliver_follow_up", lead_in="That was a 6/10.",
                                           follow_up_question="How would you pick a good hash function?"), outcome="accepted")
    row = agent_eval.check(case, leak)
    assert row["redundant"] is False and row["no_score_leak"] is False
    provider = agent_eval.check(case, AgentRun(error="ServiceUnavailableError (llm_rate_limited): busy"))
    assert provider["provider_error"] and agent_eval.summarise([provider])["provider_errors"] == 1


def test_agent_eval_end_to_end_on_the_fake_gateway():
    cases = [c for c in agent_eval.load_cases() if c["id"] == "tcp_udp_complete"]
    gw = FakeAIGateway(session_token_budget=10**9)
    gw.script("tools", ToolCall("submit_decision", {"action": "deliver_question", "lead_in": "Let's move on."}, id="c"))
    agent_eval.pin("interviewer/interviewer_v2")
    try:
        rows = asyncio.run(agent_eval.run_cases(gw, cases))
    finally:
        from app.core.prompts import set_registry
        set_registry(None)
    assert rows[0]["expected"] and gw.calls_of("tools")[0]["context"].prompt_version == "interviewer/interviewer_v2"


def test_question_eval_scores_and_counts_duplicates():
    rows = [{"topic": "dsa", "question": "Explain how a hash map handles collisions.", "relevance": 5, "difficulty_match": 4,
             "role_fit": 5, "clarity": 4},
            {"topic": "dsa", "question": "Explain how a hash map handles collisions in detail.", "relevance": 3,
             "difficulty_match": 3, "role_fit": 4, "clarity": 5},
            {"topic": "os", "question": "What is a page fault?", "relevance": 5, "difficulty_match": 5, "role_fit": 5,
             "clarity": 5}, {"cell": "x", "error": "boom"}]
    summary = question_eval.summarise(rows)
    assert summary["n"] == 3 and summary["errors"] == 1 and summary["avg_relevance"] == 4.33
    assert summary["duplicate_rate"] == 1.0 and summary["good_share"] == 0.667
