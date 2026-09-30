"""GroqAIGateway against a fake Groq client (no network)."""
import asyncio
import json
from types import SimpleNamespace

import groq
import httpx
import pytest
from pydantic import BaseModel

from app.config import Settings
from app.gateway import FakeAIGateway, GroqAIGateway, build_gateway
from app.gateway.groq_gateway import LLMOutputError
from app.gateway.types import CallContext, FinalMessage, ToolCall
from app.utils.exceptions import ServiceUnavailableError


class Verdict(BaseModel):
    score: float
    reason: str


def _response(content=None, tool_calls=None, tokens=42):
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=SimpleNamespace(total_tokens=tokens))


class FakeGroqClient:
    def __init__(self, *responses):
        self.queue = list(responses)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls.append(kwargs)
        item = self.queue.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


def _gateway(*responses):
    client = FakeGroqClient(*responses)
    gw = GroqAIGateway(api_key="unused", default_model="big-model", fast_model="small-model",
                       session_token_budget=100, client=client)
    return gw, client


def run(coro):
    return asyncio.run(coro)


def test_generate_uses_tier_model_and_counts_tokens():
    gw, client = _gateway(_response("pong", tokens=30))
    assert run(gw.generate("ping", tier="fast", context=CallContext(session_id="s1"))) == "pong"
    assert client.calls[0]["model"] == "small-model"
    assert gw.tokens_used("s1") == 30 and gw.budget_remaining("s1") == 70


def test_structured_validates_and_uses_json_mode():
    gw, client = _gateway(_response(json.dumps({"score": 7, "reason": "clear"})))
    assert run(gw.generate_structured("rate it", Verdict)) == {"score": 7.0, "reason": "clear"}
    call = client.calls[0]
    assert call["model"] == "big-model" and call["response_format"] == {"type": "json_object"}
    assert '"score"' in call["messages"][0]["content"]  # JSON Schema is sent to the model


def test_structured_retries_once_with_the_error_then_succeeds():
    gw, client = _gateway(_response("not json"), _response(json.dumps({"score": 5, "reason": "ok"})))
    assert run(gw.generate_structured("rate it", Verdict))["score"] == 5
    retry_messages = client.calls[1]["messages"]
    assert retry_messages[-2] == {"role": "assistant", "content": "not json"}
    assert "invalid" in retry_messages[-1]["content"]


def test_structured_gives_up_after_two_bad_outputs():
    gw, _ = _gateway(_response("{}"), _response('{"score": "high"}'))
    with pytest.raises(LLMOutputError):
        run(gw.generate_structured("rate it", Verdict))


def test_tool_call_and_final_message_are_parsed():
    call = SimpleNamespace(id="call_1", function=SimpleNamespace(name="get_next_question", arguments='{"difficulty_delta": 1}'))
    gw, _ = _gateway(_response(tool_calls=[call]), _response("Here's your next question."))
    tool = run(gw.generate_with_tools([{"role": "user", "content": "go"}], [{"type": "function"}]))
    assert tool == ToolCall(name="get_next_question", arguments={"difficulty_delta": 1}, id="call_1")
    assert run(gw.generate_with_tools([], [])) == FinalMessage(content="Here's your next question.")


@pytest.mark.parametrize("exc, code", [
    (groq.RateLimitError("slow down", response=httpx.Response(429, request=httpx.Request("POST", "https://x")), body=None), "llm_rate_limited"),
    (groq.AuthenticationError("bad key", response=httpx.Response(401, request=httpx.Request("POST", "https://x")), body=None), "llm_auth_failed"),
    (groq.APIConnectionError(request=httpx.Request("POST", "https://x")), "llm_unavailable"),
])
def test_provider_errors_become_503s(exc, code):
    gw, _ = _gateway(exc)
    with pytest.raises(ServiceUnavailableError) as raised:
        run(gw.generate("hi"))
    assert raised.value.code == code
    assert "unused" not in raised.value.message  # never leak the key


def test_gateway_selection():
    # tests always fake, even with a key
    assert isinstance(build_gateway(Settings(_env_file=None, app_env="test", groq_api_key="k")), FakeAIGateway)
    # local: real Groq when a key is set, fake otherwise; explicit flag wins
    assert isinstance(build_gateway(Settings(_env_file=None, app_env="local", groq_api_key="k")), GroqAIGateway)
    assert isinstance(build_gateway(Settings(_env_file=None, app_env="local")), FakeAIGateway)
    assert isinstance(build_gateway(Settings(_env_file=None, app_env="local", groq_api_key="k", use_fake_gateway=True)), FakeAIGateway)


def _json_rejected(failed: str):
    request = httpx.Request("POST", "https://x")
    body = {"error": {"message": "Failed to generate JSON.", "type": "invalid_request_error",
                      "code": "json_validate_failed", "failed_generation": failed}}
    return groq.BadRequestError("json_validate_failed", response=httpx.Response(400, request=request), body=body)


def test_groq_json_rejection_gets_the_corrective_retry():
    """Groq's JSON mode can refuse the model's output with a 400; that's bad JSON, not an outage."""
    gw, client = _gateway(_json_rejected('{"score": 5, "reason": "x"}"}'), _response(json.dumps({"score": 5, "reason": "ok"})))
    assert run(gw.generate_structured("rate it", Verdict))["reason"] == "ok"
    assert client.calls[1]["messages"][-2] == {"role": "assistant", "content": '{"score": 5, "reason": "x"}"}'}


def test_other_bad_requests_are_still_503s():
    request = httpx.Request("POST", "https://x")
    other = groq.BadRequestError("context too long", response=httpx.Response(400, request=request),
                                 body={"error": {"code": "context_length_exceeded"}})
    gw, _ = _gateway(other)
    with pytest.raises(ServiceUnavailableError):
        run(gw.generate_structured("rate it", Verdict))


def _tool_use_failed():
    request = httpx.Request("POST", "https://x")
    body = {"error": {"code": "tool_use_failed", "message": "Tool choice is required, but model did not call a tool",
                      "failed_generation": '{"action": "wrap_up"}'}}
    return groq.BadRequestError("tool_use_failed", response=httpx.Response(400, request=request), body=body)


def test_a_tool_use_rejection_is_retried_once():
    """Seen live: with tool_choice="required" the model sometimes writes plain JSON; Groq answers 400."""
    call = SimpleNamespace(id="c1", function=SimpleNamespace(name="submit_decision", arguments='{"action": "wrap_up"}'))
    gw, client = _gateway(_tool_use_failed(), _response(tool_calls=[call]))
    result = run(gw.generate_with_tools([{"role": "user", "content": "go"}], [{"type": "function"}], tool_choice="required"))
    assert result == ToolCall(name="submit_decision", arguments={"action": "wrap_up"}, id="c1") and len(client.calls) == 2


def test_two_tool_use_rejections_are_a_bad_output_error():
    gw, _ = _gateway(_tool_use_failed(), _tool_use_failed())
    with pytest.raises(LLMOutputError):
        run(gw.generate_with_tools([], [], tool_choice="required"))
