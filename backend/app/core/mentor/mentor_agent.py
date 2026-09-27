"""Mentor chat (implementation_plan.md 2.3).

Walking-skeleton version: single-turn-ish. The client may pass recent history; conversation
persistence in `mentor_conversations` arrives in Phase 2b. The candidate ID always comes from the JWT.

rag_tool's `RagService.answer` is synchronous and calls an `invoke_llm(prompt) -> str` callback, so it
runs in a worker thread and the callback hops back to the event loop to use the async AI Gateway.
"""
import anyio
import anyio.from_thread

from app.core.mentor.rag_tool import MentorChatRequest
from app.gateway import AIGateway
from app.gateway.types import CallContext
from app.utils.exceptions import ServiceUnavailableError

MENTOR_PROMPT_VERSION = "mentor/rag_tool_system_prompt_v1"  # rag_tool.service.SYSTEM_PROMPT


async def ask_mentor(rag, gateway: AIGateway, *, candidate_id: str, message: str,
                     history: list[dict[str, str]] | None = None) -> dict:
    if rag is None:
        raise ServiceUnavailableError("The mentor is not available: HF_TOKEN is not configured.",
                                      code="mentor_disabled")
    request = MentorChatRequest(user_id=candidate_id, message=message, history=(history or [])[-8:])
    context = CallContext(candidate_id=candidate_id, prompt_version=MENTOR_PROMPT_VERSION)

    def invoke_llm(prompt: str) -> str:
        return anyio.from_thread.run(lambda: gateway.generate(prompt, context=context, temperature=0))

    response = await anyio.to_thread.run_sync(rag.answer, request, invoke_llm)
    return response.model_dump()
