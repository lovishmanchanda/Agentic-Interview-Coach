"""Mentor API (implementation_plan.md 2.5). Every route is scoped to the signed-in candidate."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from app.core.mentor.mentor_agent import MentorAgent, public_conversation
from app.db.repositories.interview_repo import InterviewRepository
from app.db.repositories.mentor_repo import MentorConversationRepository
from app.dependencies import CurrentUser
from app.utils.exceptions import NotFoundError
from app.utils.rate_limit import enforce
from app.utils.responses import ok

router = APIRouter(prefix="/mentor", tags=["mentor"])


def get_mentor(request: Request) -> MentorAgent:
    state = request.app.state
    return MentorAgent(rag=state.rag, gateway=state.gateway, conversations=MentorConversationRepository(state.db),
                       interviews=InterviewRepository(state.db), indexer=state.indexer)


MentorDep = Annotated[MentorAgent, Depends(get_mentor)]


class MentorMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2_000)
    # Omitted: a new conversation. The server keeps the history; the client sends only the new message.
    conversation_id: str | None = Field(default=None, max_length=64)


@router.post("/message")
async def mentor_message(body: MentorMessageRequest, user: CurrentUser, mentor: MentorDep, request: Request):
    enforce(request.app.state.limiters["mentor"], user["_id"],
            "You're sending messages quickly. Wait a moment and try again.")
    return ok(await mentor.chat(candidate_id=user["_id"], message=body.message.strip() or body.message,
                                conversation_id=body.conversation_id))


@router.get("/welcome")
async def mentor_welcome(user: CurrentUser, mentor: MentorDep):
    return ok(await mentor.welcome(user["_id"]))


@router.get("/conversations")
async def list_conversations(user: CurrentUser, mentor: MentorDep, limit: int = Query(default=30, ge=1, le=100)):
    return ok([public_conversation(c) for c in await mentor.conversations.list_for(user["_id"], limit=limit)])


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: CurrentUser, mentor: MentorDep):
    conversation = await mentor.conversations.get(conversation_id, user["_id"])
    if conversation is None:
        raise NotFoundError("Conversation not found", code="conversation_not_found")
    return ok(public_conversation(conversation, with_messages=True))
