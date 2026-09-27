"""Live sanity check of the Groq gateway (uses GROQ_API_KEY from .env; never prints it).

    cd backend && python -m scripts.check_groq
"""
import asyncio
import time

from pydantic import BaseModel, Field

from app.config import get_settings
from app.gateway.groq_gateway import GroqAIGateway
from app.gateway.types import CallContext


class Check(BaseModel):
    topic: str
    score: float = Field(ge=0, le=10)
    strengths: list[str]


async def main() -> None:
    settings = get_settings()
    if not settings.groq_api_key:
        raise SystemExit("GROQ_API_KEY is not set in .env")
    gw = GroqAIGateway(api_key=settings.groq_api_key, default_model=settings.groq_interview_model,
                       fast_model=settings.groq_fast_model, session_token_budget=settings.session_token_budget)
    ctx = CallContext(session_id="check")

    started = time.perf_counter()
    text = await gw.generate("Reply with exactly: pong", context=ctx, tier="fast", max_tokens=200)
    print(f"generate  [{settings.groq_fast_model}] {time.perf_counter() - started:.1f}s -> {text!r}")

    started = time.perf_counter()
    data = await gw.generate_structured(
        "Rate this interview answer about Python generators out of 10: "
        "'A generator uses yield to produce values lazily, one at a time, so it saves memory.'",
        Check, context=ctx)
    print(f"structured[{settings.groq_interview_model}] {time.perf_counter() - started:.1f}s -> {data}")
    print(f"tokens used this session: {gw.tokens_used('check')}")


if __name__ == "__main__":
    asyncio.run(main())
