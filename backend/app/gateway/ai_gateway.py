"""AI Gateway: the only door to LLMs, embeddings, search, speech and code execution.

Phase 0 ships the interface plus the cross-cutting parts every provider will share (usage logging,
per-session token budget). Provider calls are stubbed and raise until wired: Groq for every LLM call
(Phase 1), embeddings for the Mentor (Phase 2, any gateway given an `embedder`), Piston (Phase 4) and
Speech (Phase 5). Tests and local dev use `FakeAIGateway` (gateway/fake_gateway.py), which implements
the same interface.
"""
import logging
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import anyio
from pydantic import BaseModel

from app.gateway.embeddings import EmbeddingProvider
from app.gateway.usage import LLMCallRecorder, Pricing
from app.gateway.types import CallContext, CallType, ExecutionResult, FinalMessage, ModelTier, ToolCall
from app.utils.exceptions import ServiceUnavailableError
from app.utils.logging import log_event

log = logging.getLogger("app.gateway")


class AIGateway:
    def __init__(self, *, session_token_budget: int, embedder: EmbeddingProvider | None = None, executor=None,
                 pricing: Pricing | None = None):
        self.session_token_budget = session_token_budget
        self.pricing = pricing or Pricing({})
        self.recorder: LLMCallRecorder | None = None  # set at startup (app.main); tests may leave it off
        self.metrics = None                            # utils.metrics.Metrics, set at startup
        self.embedder = embedder
        self.executor = executor  # core/coding/sandbox_client.PistonExecutor, when PISTON_URL is set
        self._session_tokens: dict[str, int] = defaultdict(int)
        self._candidate_tokens: dict[str, int] = defaultdict(int)

    # ── LLM ──────────────────────────────────────────────────────────────────
    # tier="default" -> the main model (interviewer, reports, Mentor);
    # tier="fast"    -> the cheaper model for high-volume calls such as answer evaluation.
    async def generate(self, prompt: str, *, context: CallContext | None = None, tier: ModelTier = "default",
                       temperature: float = 0.3, max_tokens: int = 2_000) -> str:
        return await self._not_configured("generate")

    async def generate_structured(self, prompt: str, schema: type[BaseModel], *,
                                  context: CallContext | None = None, tier: ModelTier = "default") -> dict[str, Any]:
        return await self._not_configured("structured")

    async def generate_with_tools(self, messages: list[dict], tools: list[dict], *,
                                  context: CallContext | None = None, tier: ModelTier = "default",
                                  tool_choice: str | dict = "auto") -> ToolCall | FinalMessage:
        """One step of a tool loop. tool_choice "required" forces a tool call (e.g. a terminal submit tool)."""
        return await self._not_configured("tools")

    # ── Embeddings (Mentor) ──────────────────────────────────────────────────
    # Vector search itself stays in rag_tool (a local Chroma query that must always filter on user_id);
    # the swap to Azure AI Search replaces the embedder here and rag_tool's store, nothing else.
    async def embed(self, text: str, *, context: CallContext | None = None) -> list[float]:
        if self.embedder is None:
            return await self._not_configured("embed")
        started = time.perf_counter()
        try:
            vector = await anyio.to_thread.run_sync(self.embedder.embed, text)
        except Exception as exc:  # noqa: BLE001 -- provider SDKs raise many types; callers see one
            log.warning("embed_failed", extra={"fields": {"model": self.embedder.model, "error": type(exc).__name__}})
            raise ServiceUnavailableError("ARIA's search service did not respond. Please try again.",
                                          code="embed_unavailable") from exc
        # The HF API doesn't report tokens; a word count is close enough for usage dashboards.
        self._log_usage(model=self.embedder.model, call_type="embed", tokens_used=len(text.split()),
                        latency_ms=self._elapsed_ms(started), context=context)
        return vector

    # ── Speech ───────────────────────────────────────────────────────────────
    async def transcribe(self, audio_bytes: bytes, language: str = "en-US", *,
                         context: CallContext | None = None) -> str:
        return await self._not_configured("transcribe")

    async def synthesize(self, text: str, voice: str = "en-US-AriaNeural", *,
                         context: CallContext | None = None) -> bytes:
        return await self._not_configured("synthesize")

    # ── Code execution (Piston) ──────────────────────────────────────────────
    async def execute_code(self, language: str, code: str, stdin: str = "", *,
                           context: CallContext | None = None) -> ExecutionResult:
        """Runs code in the Piston sandbox, never on this server. A failing sandbox is a 503 (retryable);
        the candidate's own errors (compile, runtime, time limit) come back in the result."""
        if self.executor is None:
            raise ServiceUnavailableError("Running code isn't set up on this server (PISTON_URL).",
                                          code="code_runner_not_configured")
        started = time.perf_counter()
        try:
            result = await self.executor.execute(language, code, stdin)
        except Exception as exc:  # noqa: BLE001 -- network and HTTP errors from the sandbox look alike to callers
            log.warning("execute_failed", extra={"fields": {"language": language, "error": type(exc).__name__}})
            raise ServiceUnavailableError("The code runner didn't respond. Please try again.",
                                          code="code_runner_unavailable") from exc
        self._log_usage(model=getattr(self.executor, "model", "sandbox"), call_type="execute", tokens_used=0,
                        latency_ms=self._elapsed_ms(started), context=context)
        return result

    # ── Budget + usage (shared by every provider) ────────────────────────────
    def budget_remaining(self, session_id: str) -> int:
        return max(0, self.session_token_budget - self._session_tokens[session_id])

    def tokens_used(self, session_id: str) -> int:
        return self._session_tokens[session_id]

    def _log_usage(self, *, model: str, call_type: CallType, tokens_used: int, latency_ms: int,
                   context: CallContext | None, tier: str | None = None, prompt_tokens: int = 0,
                   completion_tokens: int = 0, status: str = "ok", error: str | None = None,
                   prompt_text: str | None = None, output_text: str | None = None) -> None:
        ctx = context or CallContext()
        if ctx.session_id:
            self._session_tokens[ctx.session_id] += tokens_used
        if ctx.candidate_id:
            self._candidate_tokens[ctx.candidate_id] += tokens_used
        cost = self.pricing.cost(model, prompt_tokens, completion_tokens, tokens_used)
        log_event(log, "ai_call", level=logging.INFO if status == "ok" else logging.WARNING, model=model,
                  call_type=call_type, tokens=tokens_used, latency_ms=latency_ms, status=status, error=error,
                  session_id=ctx.session_id, candidate_id=ctx.candidate_id, prompt_version=ctx.prompt_version)
        if self.metrics is not None and call_type != "execute":
            self.metrics.observe_llm(call_type, model, latency_ms, status == "ok")
        if self.recorder is not None:
            self.recorder.record({
                "at": datetime.now(timezone.utc), "model": model, "call_type": call_type, "tier": tier,
                "prompt_version": ctx.prompt_version, "session_id": ctx.session_id, "candidate_id": ctx.candidate_id,
                "agent": ctx.extra.get("agent"), "tokens": tokens_used, "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens, "cost_usd": cost, "latency_ms": latency_ms,
                "status": status, "error": error, "prompt_text": prompt_text, "output_text": output_text,
            })

    @staticmethod
    def _elapsed_ms(started: float) -> int:
        return int((time.perf_counter() - started) * 1000)

    async def _not_configured(self, call_type: CallType):
        raise ServiceUnavailableError(f"AI Gateway '{call_type}' is not configured yet",
                                      code="gateway_not_configured")
