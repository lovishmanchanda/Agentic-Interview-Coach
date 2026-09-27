import asyncio

import pytest
from pydantic import BaseModel

from app.gateway import AIGateway, FakeAIGateway
from app.gateway.fake_gateway import UnscriptedCallError
from app.gateway.types import CallContext, ExecutionResult, FinalMessage, ToolCall
from app.utils.exceptions import ServiceUnavailableError


class Tier(BaseModel):
    performance_tier: str


def run(coro):
    return asyncio.run(coro)


def test_scripted_responses_are_returned_in_order_and_recorded():
    gw = FakeAIGateway().script("generate", "first", "second")
    assert run(gw.generate("q1")) == "first"
    assert run(gw.generate("q2")) == "second"
    assert run(gw.generate("q3")).startswith("[fake gateway]")  # default once the queue is empty
    assert [c["prompt"] for c in gw.calls_of("generate")] == ["q1", "q2", "q3"]


def test_structured_output_is_validated_against_schema():
    gw = FakeAIGateway().script("structured", {"performance_tier": "strong"}, {"wrong": "shape"})
    assert run(gw.generate_structured("p", Tier)) == {"performance_tier": "strong"}
    with pytest.raises(Exception):
        run(gw.generate_structured("p", Tier))


def test_unscripted_decisions_fail_loudly():
    gw = FakeAIGateway()
    with pytest.raises(UnscriptedCallError):
        run(gw.generate_structured("p", Tier))
    with pytest.raises(UnscriptedCallError):
        run(gw.generate_with_tools([{"role": "user", "content": "hi"}], []))


def test_tool_loop_script_and_callable_and_exception():
    gw = FakeAIGateway().script(
        "tools", ToolCall("get_next_question", {"difficulty_delta": 1}), FinalMessage("Here is your question"))
    msgs = [{"role": "user", "content": "start"}]
    assert run(gw.generate_with_tools(msgs, [])).name == "get_next_question"
    assert run(gw.generate_with_tools(msgs, [])).content == "Here is your question"

    gw.script("execute", lambda args: ExecutionResult(status="accepted", stdout=args["stdin"]),
              TimeoutError("piston down"))
    assert run(gw.execute_code("python", "print(input())", "hi")).stdout == "hi"
    with pytest.raises(TimeoutError):
        run(gw.execute_code("python", "x", ""))


def test_token_budget_is_tracked_per_session():
    gw = FakeAIGateway(session_token_budget=10)
    ctx = CallContext(session_id="s1", candidate_id="u1")
    gw.script("generate", "one two three")
    run(gw.generate("four five", context=ctx))
    assert gw.tokens_used("s1") == 5
    assert gw.budget_remaining("s1") == 5
    assert gw.budget_remaining("other-session") == 10


def test_embed_default_is_deterministic():
    gw = FakeAIGateway()
    assert run(gw.embed("hello")) == run(gw.embed("hello"))
    assert run(gw.embed("hello")) != run(gw.embed("world"))
    assert len(run(gw.embed("hello"))) == 384


def test_real_gateway_is_stubbed_until_configured():
    gw = AIGateway(session_token_budget=100)
    with pytest.raises(ServiceUnavailableError):
        run(gw.generate("hi"))
