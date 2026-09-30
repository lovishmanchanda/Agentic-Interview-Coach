"""Phase 6 building blocks: prompt registry, call recording and cost, metrics and alerts."""
import asyncio
from collections import Counter
from types import SimpleNamespace

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.core.prompts import PromptRegistry, choose_prompt, set_registry, split_id
from app.gateway import GroqAIGateway
from app.gateway.types import CallContext
from app.gateway.usage import LLMCallRecorder, Pricing
from app.utils.metrics import Metrics, percentile
from tests.unit.test_groq_gateway import FakeGroqClient, Verdict, _response


def _registry():
    return PromptRegistry(AsyncMongoMockClient()["obs_test"])


def test_split_id_and_default_choice():
    assert split_id("interviewer/behavioral_question_generation_v1") == ("interviewer/behavioral_question_generation", "v1")
    assert _registry().choose("report/report_v1", "s1") == "report/report_v1"


def test_a_split_is_stable_per_key_and_roughly_proportional():
    registry = _registry()
    asyncio.run(registry.set("report/report", {"v1": 70, "v2": 30}, by="admin@example.com"))
    picks = Counter(registry.choose("report/report_v1", f"session-{i}") for i in range(2000))
    assert 0.25 < picks["report/report_v2"] / 2000 < 0.35
    assert len({registry.choose("report/report_v1", "same-session") for _ in range(20)}) == 1


def test_setting_weights_is_validated_and_keeps_history_for_rollback():
    registry = _registry()
    for weights, error in [({"v9": 100}, "no such version"), ({"v1": 60, "v2": 30}, "add up to 100"),
                           ({"v1": 110, "v2": -10}, "whole numbers")]:
        with pytest.raises(ValueError, match=error):
            asyncio.run(registry.set("report/report", weights, by="a"))
    with pytest.raises(ValueError, match="unknown prompt"):
        asyncio.run(registry.set("report/nope", {"v1": 100}, by="a"))
    asyncio.run(registry.set("report/report", {"v2": 100}, by="a"))
    asyncio.run(registry.set("report/report", {"v1": 100}, by="b"))
    doc = asyncio.run(registry.db["prompt_settings"].find_one({"name": "report/report"}))
    assert doc["weights"] == {"v1": 100} and doc["history"][-1]["weights"] == {"v2": 100}
    asyncio.run(registry.reset("report/report", by="c"))
    assert registry.choose("report/report_v1", "x") == "report/report_v1"


def test_choose_prompt_records_the_version_on_the_context():
    registry = _registry()
    asyncio.run(registry.set("interviewer/interviewer", {"v2": 100}, by="a"))
    set_registry(registry)
    try:
        context = CallContext(session_id="s1")
        assert choose_prompt("interviewer/interviewer_v1", context) == "interviewer/interviewer_v2"
        assert context.prompt_version == "interviewer/interviewer_v2"
    finally:
        set_registry(None)


def test_pricing_estimates_cost_from_the_token_split():
    pricing = Pricing({"big": (0.15, 0.75)})
    assert pricing.cost("big", 1_000_000, 100_000, 1_100_000) == pytest.approx(0.225)
    assert pricing.cost("big", 0, 0, 1_000_000) == pytest.approx(0.15)  # only a total: priced as input
    assert pricing.cost("unknown", 10, 10, 20) == 0


def _groq(*responses, trace=False):
    client = FakeGroqClient(*responses)
    gw = GroqAIGateway(api_key="unused", default_model="big", fast_model="small", session_token_budget=10**6,
                       client=client, pricing=Pricing({"big": (0.15, 0.75)}))
    db = AsyncMongoMockClient()["calls"]
    gw.recorder = LLMCallRecorder(db, trace_content=trace)
    return gw, db


def test_every_call_is_recorded_with_version_tokens_cost_and_errors():
    import groq
    import httpx
    ok = _response('{"score": 7, "reason": "ok"}', tokens=1500)
    ok.usage.prompt_tokens, ok.usage.completion_tokens = 1000, 500
    busy = groq.RateLimitError("slow", response=httpx.Response(429, request=httpx.Request("POST", "https://x")), body=None)
    gw, db = _groq(ok, busy)
    context = CallContext(session_id="s1", candidate_id="c1", prompt_version="evaluator/technical_v1")
    asyncio.run(gw.generate_structured("rate it", Verdict, context=context, tier="default"))
    with pytest.raises(Exception):
        asyncio.run(gw.generate("again", context=context))
    asyncio.run(gw.recorder.flush())
    first, second = asyncio.run(db["llm_calls"].find({}, {"_id": 0}).sort("at", 1).to_list(10))
    assert first["prompt_version"] == "evaluator/technical_v1" and first["tier"] == "default"
    assert (first["tokens"], first["prompt_tokens"], first["completion_tokens"]) == (1500, 1000, 500)
    assert first["cost_usd"] == pytest.approx(0.000525) and first["status"] == "ok"
    assert second["status"] == "error" and second["error"] == "llm_rate_limited" and second["tokens"] == 0
    assert "prompt_text" not in first  # content isn't stored unless tracing is on


def test_tracing_stores_prompt_and_output_when_enabled():
    gw, db = _groq(_response("pong"), trace=True)
    asyncio.run(gw.generate("ping", context=CallContext()))
    asyncio.run(gw.recorder.flush())
    [doc] = asyncio.run(db["llm_calls"].find({}, {"_id": 0}).to_list(1))
    assert doc["prompt_text"] == "ping" and doc["output_text"] == "pong"


def test_metrics_percentiles_and_alerts():
    assert percentile([1, 2, 3, 4, 100], 95) == 100 and percentile([], 50) is None
    now = [1000.0]
    metrics = Metrics(clock=lambda: now[0])
    for i in range(30):
        metrics.observe_http("GET /x", 500 if i % 5 == 0 else 200, 10)
    for i in range(10):
        metrics.observe_llm("structured", "big", 25_000, ok=i > 1)
    snap = metrics.snapshot()
    assert {a["name"] for a in snap["alerts"]} == {"http_errors", "llm_errors", "llm_latency"}
    assert snap["http"]["by_route"][0]["key"] == "GET /x" and snap["http"]["errors"] == 6
    now[0] += 16 * 60  # outside the 15-minute window
    assert metrics.snapshot()["alerts"] == [] and metrics.snapshot()["http"]["count"] == 0
