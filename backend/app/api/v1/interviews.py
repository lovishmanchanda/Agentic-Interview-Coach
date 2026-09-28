from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.interview.engine import InterviewEngine
from app.core.interview.question_engine import topics_for
from app.core.interview.state_machine import allowed_next
from app.db.models.interview import UNAVAILABLE, InterviewConfigRequest, InterviewType
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
                            role: Annotated[str | None, Query(max_length=100)] = None,
                            interview_type: Annotated[InterviewType, Query()] = "technical"):
    """What the start page needs: the profile's defaults, the topics for a role and interview type (competencies
    for behavioral), and the choices not built yet."""
    profile = await _require_profile(profiles, user["_id"])
    config = engine.resolve_config(InterviewConfigRequest(role=role, interview_type=interview_type), profile)
    return ok({
        "defaults": {k: config[k] for k in ("interview_type", "interview_mode", "role", "experience_level",
                                            "company", "difficulty", "question_count", "input_mode", "output_mode")},
        "role_key": config["role_key"],
        "topics": await topics_for(engine.question_bank, interview_type, config["role_key"]),
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


def _decision_view(decision: dict | None) -> dict | None:
    if not decision:
        return None
    return {**decision, "at": decision["at"].isoformat() if hasattr(decision.get("at"), "isoformat") else decision.get("at")}


@router.get("/{session_id}/state")
async def get_interview_state(session_id: str, user: CurrentUser, engine: EngineDep):
    """The state machine's view of a session: where it is, where it can go, and how it got here."""
    session = await engine.get_owned_session(session_id, user["_id"])
    return ok({
        "session_id": session_id,
        "state": session["state"],
        "allowed_next": allowed_next(session["state"]),
        "questions_asked": session["questions_asked"],
        "total_questions": session["config"]["question_count"],
        "current_question_id": session.get("current_question_id"),
        "follow_ups_asked": session.get("follow_ups_asked", 0),
        # Adaptation (1.8): the difficulty the next main question aims for, scores per topic, and why the
        # engine made its last move.
        "target_difficulty": session.get("target_difficulty"),
        "performance_vector": session.get("performance_vector", {}),
        "last_decision": _decision_view(session.get("last_decision")),
        "updated_at": session["updated_at"].isoformat(),
        "state_history": [{"state": h["state"], "at": h["at"].isoformat()} for h in session.get("state_history", [])],
    })
