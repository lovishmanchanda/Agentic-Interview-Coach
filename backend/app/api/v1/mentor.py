from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.core.mentor.mentor_agent import ask_mentor
from app.dependencies import CurrentUser
from app.utils.responses import ok

router = APIRouter(prefix="/mentor", tags=["mentor"])


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=5_000)


class MentorMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2_000)
    # Walking skeleton: the client sends recent turns. Server-side persistence arrives in Phase 2b.
    history: list[HistoryTurn] = Field(default_factory=list, max_length=8)


@router.post("/message")
async def mentor_message(body: MentorMessageRequest, user: CurrentUser, request: Request):
    state = request.app.state
    result = await ask_mentor(state.rag, state.gateway, candidate_id=user["_id"], message=body.message,
                              history=[turn.model_dump() for turn in body.history])
    return ok(result)
