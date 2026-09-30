"""LLM call records (implementation_plan.md 6.1, 6.5): one document per AI call in `llm_calls`, for tracing a bad
result back to its prompt version and for usage/cost reports.

The gateway hands each record to `LLMCallRecorder.record()`, which only appends to a buffer; a background task
writes the buffer in batches, so recording never slows or breaks an AI call. Prompt and output text are stored
only when LLM_TRACE_CONTENT is on (they contain candidates' answers).
"""
import asyncio
import logging
from collections import deque
from datetime import datetime, timezone

log = logging.getLogger(__name__)

FLUSH_INTERVAL_S = 2.0
MAX_BUFFER = 10_000
MAX_TRACE_CHARS = 20_000


class Pricing:
    """Estimated USD per 1M tokens, by model. Rates change: set GROQ_PRICE_* to your current ones."""

    def __init__(self, rates: dict[str, tuple[float, float]]):
        self.rates = rates

    def cost(self, model: str, prompt_tokens: int, completion_tokens: int, total_tokens: int) -> float:
        rate_in, rate_out = self.rates.get(model, (0.0, 0.0))
        if not prompt_tokens and not completion_tokens:  # provider gave only a total
            prompt_tokens = total_tokens
        return round((prompt_tokens * rate_in + completion_tokens * rate_out) / 1_000_000, 6)


class LLMCallRecorder:
    def __init__(self, db, *, trace_content: bool = False):
        self.db = db
        self.trace_content = trace_content
        self._buffer: deque[dict] = deque()
        self._dropped = 0
        self._task: asyncio.Task | None = None

    def record(self, doc: dict) -> None:
        if not self.trace_content:
            doc.pop("prompt_text", None)
            doc.pop("output_text", None)
        else:
            for key in ("prompt_text", "output_text"):
                if doc.get(key):
                    doc[key] = doc[key][:MAX_TRACE_CHARS]
        if len(self._buffer) >= MAX_BUFFER:  # the database is down or slow: keep the newest
            self._buffer.popleft()
            self._dropped += 1
        self._buffer.append(doc)

    async def flush(self) -> int:
        batch = []
        while self._buffer:
            batch.append(self._buffer.popleft())
        if batch:
            try:
                await self.db["llm_calls"].insert_many(batch, ordered=False)
            except Exception:  # noqa: BLE001 -- observability must never take the app down
                log.warning("llm_calls_write_failed", extra={"fields": {"count": len(batch)}}, exc_info=True)
        if self._dropped:
            log.warning("llm_calls_dropped", extra={"fields": {"count": self._dropped}})
            self._dropped = 0
        return len(batch)

    def start(self) -> None:
        async def loop():
            while True:
                await asyncio.sleep(FLUSH_INTERVAL_S)
                await self.flush()
        self._task = asyncio.create_task(loop(), name="llm-calls-flush")

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self.flush()


def today_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)
