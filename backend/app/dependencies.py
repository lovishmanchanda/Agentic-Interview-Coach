"""FastAPI dependency injection (architecture.md §4.2)."""
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings
from app.agents.interview_agent import InterviewAgent
from app.core.interview.engine import InterviewEngine
from app.db.repositories.agent_run_repo import AgentRunRepository
from app.db.repositories.interview_repo import InterviewRepository
from app.db.repositories.profile_repo import ProfileRepository
from app.db.repositories.question_repo import QuestionRepository
from app.db.repositories.user_repo import RefreshTokenRepository, UserRepository
from app.gateway import AIGateway
from app.utils.exceptions import AuthError, ForbiddenError
from app.utils.logging import bind_context
from app.utils.security import decode_token

_bearer = HTTPBearer(auto_error=False)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request):
    return request.app.state.db


def get_gateway(request: Request) -> AIGateway:
    return request.app.state.gateway


def get_rag(request: Request):
    return request.app.state.rag


SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[object, Depends(get_db)]
GatewayDep = Annotated[AIGateway, Depends(get_gateway)]


def get_user_repo(db: DbDep) -> UserRepository:
    return UserRepository(db)


def get_token_repo(db: DbDep) -> RefreshTokenRepository:
    return RefreshTokenRepository(db)


def get_profile_repo(db: DbDep) -> ProfileRepository:
    return ProfileRepository(db)


def get_interview_repo(db: DbDep) -> InterviewRepository:
    return InterviewRepository(db)


def build_engine(state) -> InterviewEngine:
    """Also used by the WebSocket handler, which has app.state but no Request."""
    return InterviewEngine(repo=InterviewRepository(state.db), question_bank=QuestionRepository(state.db),
                           gateway=state.gateway, indexer=state.indexer, max_answer_chars=state.settings.max_answer_chars,
                           stale_work=timedelta(seconds=state.settings.stale_work_seconds),
                           follow_ups=state.settings.interview_follow_ups,
                           agent=InterviewAgent(state.gateway, AgentRunRepository(state.db))
                           if state.settings.interview_agent else None,
                           report_writer=state.settings.report_writer)


def get_engine(request: Request) -> InterviewEngine:
    return build_engine(request.app.state)


async def get_current_user(
    settings: SettingsDep,
    users: Annotated[UserRepository, Depends(get_user_repo)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> dict:
    """Validates the access JWT and returns the user document. candidate_id == user['_id']."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthError("Missing bearer token", code="missing_token")
    payload = decode_token(settings, credentials.credentials, "access")
    user = await users.get_by_id(payload["sub"])
    if user is None or not user.get("is_active", True):
        raise AuthError("User not found or inactive", code="invalid_token")
    bind_context(user_id=user["_id"])
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_role(*roles: str):
    async def _check(user: CurrentUser) -> dict:
        if user.get("role") not in roles:
            raise ForbiddenError("Insufficient permissions")
        return user
    return _check
