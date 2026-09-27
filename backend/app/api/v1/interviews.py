from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.interview.engine import InterviewEngine
from app.core.interview.question_engine import topics_for_role
from app.db.models.interview import UNAVAILABLE, InterviewConfigRequest
from app.db.repositories.interview_repo import InterviewRepository
from app.db.repositories.profile_repo import ProfileRepository
from app.dependencies import CurrentUser, get_engine, get_interview_repo, get_profile_repo
from app.utils.exceptions import ConflictError, UnprocessableError
from app.utils.responses import ok

router = APIRouter(prefix="/interviews", tags=["interviews"])
EngineDep = Annotated[InterviewEngine, Depends(get_engine)]
ProfilesDep = Annotated[ProfileRepository, Depends(get_profile_repo)]


async def _require_profile(profiles: ProfileRepository, candidate_id: str) -> dict:
    profile = await profiles.get_by_candidate(candidate_id)
    if profile is None:
        raise ConflictError("Complete your profile before starting an interview", code="profile_missing")
    return profile


def _summary(session: dict) -> dict:
    return {
        "session_id": session["session_id"],
        "state": session["state"],
        "config": session["config"],
        "started_at": session["started_at"].isoformat(),
        "completed_at": session["completed_at"].isoformat() if session.get("completed_at") else None,
        "report_id": session.get("report_id"),
        "topics_covered": session.get("topics_covered", []),
        "focus_topics": session.get("focus_topics", []),
        "questions_asked": session.get("questions_asked", 0),
    }


@router.get("/options")
async def interview_options(user: CurrentUser, engine: EngineDep, profiles: ProfilesDep,
                            role: Annotated[str | None, Query(max_length=100)] = None):
    """What the start page needs: the profile's defaults, the topics for a role, and the choices not built yet."""
    profile = await _require_profile(profiles, user["_id"])
    config = engine.resolve_config(InterviewConfigRequest(role=role), profile)
    return ok({
        "defaults": {k: config[k] for k in ("interview_type", "interview_mode", "role", "experience_level",
                                            "company", "difficulty", "question_count", "input_mode", "output_mode")},
        "role_key": config["role_key"],
        "topics": await topics_for_role(engine.question_bank, config["role_key"]),
        "unavailable": [{"field": field, "value": value, "reason": reason} for (field, value), reason in UNAVAILABLE.items()],
    })


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_interview(body: InterviewConfigRequest, user: CurrentUser, engine: EngineDep, profiles: ProfilesDep):
    profile = await _require_profile(profiles, user["_id"])
    if reason := body.unavailable_reason():
        raise UnprocessableError(reason, code="option_unavailable")
    session = await engine.create_session(candidate_id=user["_id"], profile=profile, request=body)
    return ok(_summary(session))


@router.get("")
async def list_interviews(user: CurrentUser, repo: Annotated[InterviewRepository, Depends(get_interview_repo)]):
    return ok([_summary(s) for s in await repo.list_sessions(user["_id"])])


@router.get("/{session_id}")
async def get_interview(session_id: str, user: CurrentUser, engine: EngineDep):
    session = await engine.get_owned_session(session_id, user["_id"])
    return ok(await engine.snapshot(session))
