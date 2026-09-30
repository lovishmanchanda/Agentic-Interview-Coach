"""Scripted AI Gateway for tests and keyless local development.

Same interface as AIGateway, no network. Queue responses per call type; each queued item can be a
value, a callable that receives the call's arguments, or an Exception to raise:

    gw = FakeAIGateway()
    gw.script("structured", {"performance_tier": "strong", ...})
    gw.script("tools", ToolCall("get_next_question", {}), FinalMessage("Next question..."))
    gw.script("execute", lambda args: ExecutionResult(status="accepted", stdout=args["stdin"]))

When a queue is empty, `generate`, `embed` and `execute_code` fall back to harmless defaults so the
app runs locally; `generate_structured` and `generate_with_tools` raise, so a test never passes by
accident on an unscripted decision. Token usage is estimated and counted like the real gateway.
"""
import hashlib
import time
from collections import defaultdict, deque
from typing import Any, Callable

from pydantic import BaseModel

from app.gateway.ai_gateway import AIGateway
from app.gateway.types import CallContext, CallType, ExecutionResult, FinalMessage, ToolCall

FAKE_MODEL = "fake"
EMBED_DIM = 384


class UnscriptedCallError(AssertionError):
    pass


class FakeAIGateway(AIGateway):
    def __init__(self, *, session_token_budget: int = 60_000, embedder=None, executor=None):
        # embedder: a real provider (keyless dev with HF_TOKEN set) keeps the Mentor's Chroma collection
        # consistent with live runs; without one, embed() returns deterministic hash vectors.
        super().__init__(session_token_budget=session_token_budget, embedder=embedder, executor=executor)
        self._queues: dict[str, deque] = defaultdict(deque)
        self.calls: list[tuple[CallType, dict[str, Any]]] = []

    def script(self, call_type: CallType, *responses: Any) -> "FakeAIGateway":
        self._queues[call_type].extend(responses)
        return self

    def calls_of(self, call_type: CallType) -> list[dict[str, Any]]:
        return [args for kind, args in self.calls if kind == call_type]

    def _next(self, call_type: CallType, args: dict[str, Any], default: Callable[[], Any] | None) -> Any:
        self.calls.append((call_type, args))
        queue = self._queues[call_type]
        if not queue:
            if default is None:
                raise UnscriptedCallError(f"FakeAIGateway: no scripted response for '{call_type}'")
            return default()
        item = queue.popleft()
        if isinstance(item, BaseException):
            raise item
        return item(args) if callable(item) else item

    def _account(self, call_type: CallType, text: str, context: CallContext | None, started: float,
                 tier: str | None = None) -> None:
        self._log_usage(model=FAKE_MODEL, call_type=call_type, tokens_used=max(1, len(text.split())),
                        latency_ms=self._elapsed_ms(started), context=context, tier=tier, prompt_text=text)

    # ── LLM ──
    async def generate(self, prompt, *, context=None, tier="default", temperature=0.3, max_tokens=2_000) -> str:
        started = time.perf_counter()
        out = self._next("generate", {"prompt": prompt, "context": context, "tier": tier},
                         default=lambda: "[fake gateway] " + prompt[:80])
        self._account("generate", prompt + " " + out, context, started)
        return out

    async def generate_structured(self, prompt, schema: type[BaseModel], *, context=None, tier="default") -> dict:
        started = time.perf_counter()
        out = self._next("structured", {"prompt": prompt, "schema": schema, "context": context, "tier": tier},
                         default=None)
        validated = schema.model_validate(out).model_dump()  # same guarantee as the real gateway
        self._account("structured", prompt, context, started)
        return validated

    async def generate_with_tools(self, messages, tools, *, context=None, tier="default",
                                  tool_choice="auto") -> ToolCall | FinalMessage:
        started = time.perf_counter()
        # Copy: callers (the agent loop) keep appending to the same list, and a recording should show
        # what was sent at the time.
        out = self._next("tools", {"messages": [dict(m) for m in messages], "tools": tools, "context": context, "tier": tier,
                                   "tool_choice": tool_choice}, default=None)
        if not isinstance(out, (ToolCall, FinalMessage)):
            raise TypeError("scripted 'tools' responses must be ToolCall or FinalMessage")
        self._account("tools", " ".join(str(m.get("content", "")) for m in messages), context, started)
        return out

    # ── Embeddings ──
    async def embed(self, text, *, context=None) -> list[float]:
        if self.embedder is not None and not self._queues["embed"]:
            self.calls.append(("embed", {"text": text, "context": context}))
            return await super().embed(text, context=context)
        return self._next("embed", {"text": text, "context": context}, default=lambda: _hash_vector(text))

    # ── Speech ──
    async def transcribe(self, audio_bytes, language="en-US", *, context=None) -> str:
        return self._next("transcribe", {"size": len(audio_bytes), "language": language, "context": context},
                          default=None)

    async def synthesize(self, text, voice="en-US-AriaNeural", *, context=None) -> bytes:
        return self._next("synthesize", {"text": text, "voice": voice, "context": context}, default=lambda: b"")

    # ── Code execution ──
    async def execute_code(self, language, code, stdin="", *, context=None) -> ExecutionResult:
        if self.executor is not None and not self._queues["execute"]:  # e.g. the tests' local Python runner
            self.calls.append(("execute", {"language": language, "code": code, "stdin": stdin, "context": context}))
            return await super().execute_code(language, code, stdin, context=context)
        return self._next("execute", {"language": language, "code": code, "stdin": stdin, "context": context},
                          default=lambda: ExecutionResult(status="accepted", language=language,
                                                          stdout="[fake gateway] not executed\n"))


def _hash_vector(text: str) -> list[float]:
    """Deterministic pseudo-embedding: same text -> same vector."""
    digest = hashlib.sha256(text.encode()).digest()
    return [digest[i % len(digest)] / 255.0 for i in range(EMBED_DIM)]
