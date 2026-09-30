"""Mentor API (implementation_plan.md 2.5). Every route is scoped to the signed-in candidate."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, StringConstraints

from app.agents.prep.orchestrator import PrepOrchestrator
from app.core.mentor.mentor_agent import MentorAgent, public_conversation
from app.db.repositories.agent_run_repo import AgentRunRepository
from app.db.repositories.company_repo import CompanyRepository
from app.db.repositories.prep_repo import PrepPlanRepository
from app.db.repositories.profile_repo import ProfileRepository
from app.db.repositories.interview_repo import InterviewRepository
from app.db.repositories.mentor_repo import MentorConversationRepository
from app.dependencies import CurrentUser, DailyLimitedUser
from app.utils.exceptions import NotFoundError
from app.utils.rate_limit import enforce
from app.utils.responses import ok

router = APIRouter(prefix="/mentor", tags=["mentor"])


def get_mentor(request: Request) -> MentorAgent:
    state = request.app.state
    interviews = InterviewRepository(state.db)
    prep = PrepOrchestrator(gateway=state.gateway, companies=CompanyRepository(state.db),
                            profiles=ProfileRepository(state.db), interviews=interviews,
                            plans=PrepPlanRepository(state.db), runs=AgentRunRepository(state.db))
    return MentorAgent(rag=state.rag, gateway=state.gateway, conversations=MentorConversationRepository(state.db),
                       interviews=interviews, indexer=state.indexer, prep=prep, prep_limiter=state.limiters["prep"])


MentorDep = Annotated[MentorAgent, Depends(get_mentor)]


class MentorMessageRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]  # blank: no AI call
    # Omitted: a new conversation. The server keeps the history; the client sends only the new message.
    conversation_id: str | None = Field(default=None, max_length=64)


@router.post("/message")
async def mentor_message(body: MentorMessageRequest, user: DailyLimitedUser, mentor: MentorDep, request: Request):
    enforce(request.app.state.limiters["mentor"], user["_id"],
            "You're sending messages quickly. Wait a moment and try again.")
    return ok(await mentor.chat(candidate_id=user["_id"], message=body.message,
                                conversation_id=body.conversation_id))


class PrepareRequest(BaseModel):
    company: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    jd_text: str | None = Field(default=None, max_length=50_000)
    weeks: int | None = Field(default=None, ge=1, le=12)
    conversation_id: str | None = Field(default=None, max_length=64)


@router.post("/prepare")
async def mentor_prepare(body: PrepareRequest, user: DailyLimitedUser, mentor: MentorDep, request: Request):
    """Company preparation (Phase 3) with an optional job description; the plan is posted into the conversation."""
    enforce(request.app.state.limiters["mentor"], user["_id"],
            "You're sending messages quickly. Wait a moment and try again.")
    return ok(await mentor.prepare(candidate_id=user["_id"], company=body.company, jd_text=body.jd_text,
                                   weeks=body.weeks, conversation_id=body.conversation_id))


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
