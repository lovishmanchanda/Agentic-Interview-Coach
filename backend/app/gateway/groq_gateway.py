"""Groq-backed AI Gateway: every LLM call in the system goes through here.

Models: tier="default" -> GROQ_INTERVIEW_MODEL (openai/gpt-oss-120b),
        tier="fast"    -> GROQ_FAST_MODEL (openai/gpt-oss-20b).

Structured output uses JSON mode plus our own Pydantic validation, with one corrective retry.
The result is always validated, whatever the model returns.
"""
import json
import logging
import time
from typing import Any

import groq
from pydantic import BaseModel, ValidationError

from app.gateway.ai_gateway import AIGateway
from app.gateway.types import CallContext, CallType, FinalMessage, ModelTier, ToolCall
from app.utils.exceptions import AppError, ServiceUnavailableError

log = logging.getLogger("app.gateway.groq")


class LLMOutputError(AppError):
    """The model answered, but not in the shape we asked for (even after a retry)."""
    status_code = 502
    code = "llm_bad_output"


class _JsonRejected(Exception):
    """Groq's JSON mode refused the model's output (HTTP 400 json_validate_failed). Not a provider outage:
    the model wrote bad JSON, so it gets the same corrective retry as JSON we fail to parse ourselves."""

    def __init__(self, failed_generation: str):
        super().__init__("json_validate_failed")
        self.failed_generation = failed_generation


def _provider_error(exc: Exception) -> ServiceUnavailableError:
    """One error type for every provider failure; the code says which."""
    if isinstance(exc, groq.RateLimitError):
        return ServiceUnavailableError("The AI service is busy. Please try again in a moment.", code="llm_rate_limited")
    if isinstance(exc, groq.AuthenticationError):
        log.error("groq_auth_failed")  # never log the key
        return ServiceUnavailableError("The AI service is not configured correctly.", code="llm_auth_failed")
    if isinstance(exc, (groq.APITimeoutError, groq.APIConnectionError)):
        return ServiceUnavailableError("The AI service did not respond. Please try again.", code="llm_unavailable")
    log.error("groq_api_error", extra={"fields": {"status": getattr(exc, "status_code", None)}})
    return ServiceUnavailableError("The AI service returned an error. Please try again.", code="llm_unavailable")


def _rejection(exc: "groq.BadRequestError", code: str) -> str | None:
    """The model's output, when Groq refused it for the given reason (json_validate_failed, tool_use_failed)."""
    body = exc.body if isinstance(exc.body, dict) else {}
    error = body.get("error", body) if isinstance(body.get("error", body), dict) else {}
    return str(error.get("failed_generation") or "") if error.get("code") == code else None


def _json_rejection(exc: "groq.BadRequestError") -> str | None:
    return _rejection(exc, "json_validate_failed")


class _ToolUseRejected(Exception):
    """Groq refused a tool-calling reply (HTTP 400 tool_use_failed): the model wrote its answer as plain JSON or
    called a tool that doesn't exist. Seen live with tool_choice="required"; a second try usually works."""


class GroqAIGateway(AIGateway):
    def __init__(self, *, api_key: str, default_model: str, fast_model: str, session_token_budget: int,
                 client: Any = None, timeout_s: float = 60.0, embedder=None, executor=None, pricing=None):
        super().__init__(session_token_budget=session_token_budget, embedder=embedder, executor=executor,
                         pricing=pricing)
        # 4 retries (the SDK backs off exponentially on 429/5xx): rides out Groq "over capacity" blips, common on the free tier.
        self.client = client or groq.AsyncGroq(api_key=api_key, timeout=timeout_s, max_retries=4)
        self.models: dict[str, str] = {"default": default_model, "fast": fast_model}

    # ── core call ────────────────────────────────────────────────────────────
    async def _chat(self, messages: list[dict], *, call_type: CallType, tier: ModelTier,
                    context: CallContext | None, **kwargs):
        model = self.models[tier]
        started = time.perf_counter()
        prompt_text = "\n\n".join(str(m.get("content") or "") for m in messages)
        try:
            response = await self.client.chat.completions.create(model=model, messages=messages, **kwargs)
        except groq.APIError as exc:
            bad_request = isinstance(exc, groq.BadRequestError)
            if bad_request and (tool_failed := _rejection(exc, "tool_use_failed")) is not None:
                self._log_usage(model=model, call_type=call_type, tokens_used=0, latency_ms=self._elapsed_ms(started),
                                context=context, tier=tier, status="error", error="tool_use_failed",
                                prompt_text=prompt_text, output_text=tool_failed)
                raise _ToolUseRejected() from exc
            failed = _json_rejection(exc) if bad_request else None
            error = None if failed is not None else _provider_error(exc)
            self._log_usage(model=model, call_type=call_type, tokens_used=0, latency_ms=self._elapsed_ms(started),
                            context=context, tier=tier, status="error",
                            error="json_validate_failed" if failed is not None else error.code,
                            prompt_text=prompt_text, output_text=failed)
            if failed is not None:
                raise _JsonRejected(failed) from exc
            raise error from exc
        usage = getattr(response, "usage", None)
        message = response.choices[0].message if getattr(response, "choices", None) else None
        output = (message.content or "") if message is not None else ""
        if message is not None and getattr(message, "tool_calls", None):
            output = "; ".join(f"{c.function.name}({c.function.arguments})" for c in message.tool_calls)
        self._log_usage(model=model, call_type=call_type, tokens_used=getattr(usage, "total_tokens", 0) or 0,
                        latency_ms=self._elapsed_ms(started), context=context, tier=tier,
                        prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                        completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                        prompt_text=prompt_text, output_text=output)
        return response

    # ── public LLM methods ───────────────────────────────────────────────────
    async def generate(self, prompt: str, *, context: CallContext | None = None, tier: ModelTier = "default",
                       temperature: float = 0.3, max_tokens: int = 2_000) -> str:
        response = await self._chat([{"role": "user", "content": prompt}], call_type="generate", tier=tier,
                                    context=context, temperature=temperature, max_completion_tokens=max_tokens)
        return (response.choices[0].message.content or "").strip()

    async def generate_structured(self, prompt: str, schema: type[BaseModel], *,
                                  context: CallContext | None = None, tier: ModelTier = "default") -> dict[str, Any]:
        messages = [
            {"role": "system", "content": (
                "Respond with a single JSON object only, no prose and no markdown fences. "
                "It must validate against this JSON Schema:\n"
                + json.dumps(schema.model_json_schema(), separators=(",", ":")))},
            {"role": "user", "content": prompt},
        ]
        last_error = ""
        for attempt in range(2):
            try:
                response = await self._chat(messages, call_type="structured", tier=tier, context=context,
                                            temperature=0.2, max_completion_tokens=3_000,
                                            response_format={"type": "json_object"})
                content = response.choices[0].message.content or ""
            except _JsonRejected as rejected:
                content = rejected.failed_generation  # validated below like any other output; usually it fails
            try:
                return schema.model_validate(json.loads(content)).model_dump()
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = str(exc)[:500]
                log.warning("llm_structured_retry", extra={"fields": {"attempt": attempt, "error": last_error}})
                messages = [*messages, {"role": "assistant", "content": content},
                            {"role": "user", "content": f"That JSON was invalid: {last_error}\nReturn the corrected JSON object only."}]
        raise LLMOutputError("The AI returned an unexpected format. Please try again.", details=last_error)

    async def generate_with_tools(self, messages: list[dict], tools: list[dict], *,
                                  context: CallContext | None = None, tier: ModelTier = "default",
                                  tool_choice: str | dict = "auto") -> ToolCall | FinalMessage:
        for attempt in range(2):
            try:
                response = await self._chat(messages, call_type="tools", tier=tier, context=context,
                                            tools=tools, tool_choice=tool_choice, temperature=0.3,
                                            max_completion_tokens=2_000)
                break
            except _ToolUseRejected as exc:
                log.warning("llm_tool_use_retry", extra={"fields": {"attempt": attempt}})
                if attempt:
                    raise LLMOutputError("The AI didn't call a tool as required.") from exc
        message = response.choices[0].message
        if message.tool_calls:
            call = message.tool_calls[0]
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError as exc:
                raise LLMOutputError("The AI returned malformed tool arguments.") from exc
            return ToolCall(name=call.function.name, arguments=arguments, id=call.id)
        return FinalMessage(content=(message.content or "").strip())
