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


def _json_rejection(exc: "groq.BadRequestError") -> str | None:
    body = exc.body if isinstance(exc.body, dict) else {}
    error = body.get("error", body) if isinstance(body.get("error", body), dict) else {}
    return str(error.get("failed_generation") or "") if error.get("code") == "json_validate_failed" else None


class GroqAIGateway(AIGateway):
    def __init__(self, *, api_key: str, default_model: str, fast_model: str, session_token_budget: int,
                 client: Any = None, timeout_s: float = 60.0, embedder=None, executor=None):
        super().__init__(session_token_budget=session_token_budget, embedder=embedder, executor=executor)
        self.client = client or groq.AsyncGroq(api_key=api_key, timeout=timeout_s, max_retries=2)
        self.models: dict[str, str] = {"default": default_model, "fast": fast_model}

    # ── core call ────────────────────────────────────────────────────────────
    async def _chat(self, messages: list[dict], *, call_type: CallType, tier: ModelTier,
                    context: CallContext | None, **kwargs):
        model = self.models[tier]
        started = time.perf_counter()
        try:
            response = await self.client.chat.completions.create(model=model, messages=messages, **kwargs)
        except groq.RateLimitError as exc:
            raise ServiceUnavailableError("The AI service is busy. Please try again in a moment.",
                                          code="llm_rate_limited") from exc
        except groq.AuthenticationError as exc:
            log.error("groq_auth_failed")  # never log the key
            raise ServiceUnavailableError("The AI service is not configured correctly.",
                                          code="llm_auth_failed") from exc
        except groq.BadRequestError as exc:
            if (failed := _json_rejection(exc)) is not None:
                self._log_usage(model=model, call_type=call_type, tokens_used=0,
                                latency_ms=self._elapsed_ms(started), context=context)
                raise _JsonRejected(failed) from exc
            log.error("groq_api_error", extra={"fields": {"status": exc.status_code}})
            raise ServiceUnavailableError("The AI service returned an error. Please try again.",
                                          code="llm_unavailable") from exc
        except (groq.APITimeoutError, groq.APIConnectionError) as exc:
            raise ServiceUnavailableError("The AI service did not respond. Please try again.",
                                          code="llm_unavailable") from exc
        except groq.APIStatusError as exc:
            log.error("groq_api_error", extra={"fields": {"status": exc.status_code}})
            raise ServiceUnavailableError("The AI service returned an error. Please try again.",
                                          code="llm_unavailable") from exc
        usage = getattr(response, "usage", None)
        self._log_usage(model=model, call_type=call_type, tokens_used=getattr(usage, "total_tokens", 0) or 0,
                        latency_ms=self._elapsed_ms(started), context=context)
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
                                  tool_choice: str = "auto") -> ToolCall | FinalMessage:
        response = await self._chat(messages, call_type="tools", tier=tier, context=context,
                                    tools=tools, tool_choice=tool_choice, temperature=0.3, max_completion_tokens=2_000)
        message = response.choices[0].message
        if message.tool_calls:
            call = message.tool_calls[0]
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError as exc:
                raise LLMOutputError("The AI returned malformed tool arguments.") from exc
            return ToolCall(name=call.function.name, arguments=arguments, id=call.id)
        return FinalMessage(content=(message.content or "").strip())
