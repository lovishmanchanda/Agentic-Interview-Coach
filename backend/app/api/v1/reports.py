from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.interview.engine import InterviewEngine
from app.db.repositories.interview_repo import InterviewRepository, as_utc
from app.dependencies import CurrentUser, get_engine, get_interview_repo
from app.utils.exceptions import NotFoundError
from app.utils.responses import ok

router = APIRouter(prefix="/reports", tags=["reports"])
RepoDep = Annotated[InterviewRepository, Depends(get_interview_repo)]


def _public(report: dict) -> dict:
    out = {k: v for k, v in report.items() if k not in ("rag_chunk_ids",)}
    out["generated_at"] = as_utc(report["generated_at"]).isoformat()
    return out


@router.get("")
async def list_reports(user: CurrentUser, repo: RepoDep):
    return ok([{"report_id": r["report_id"], "session_id": r["session_id"], "overall": r["scores"]["overall"],
                "topics": list(r.get("per_topic_scores", {})), "generated_at": as_utc(r["generated_at"]).isoformat()}
               for r in await repo.list_reports(user["_id"])])


@router.get("/{report_id}")
async def get_report(report_id: str, user: CurrentUser, repo: RepoDep,
                     engine: Annotated[InterviewEngine, Depends(get_engine)]):
    report = await repo.get_report(report_id)
    if report is None or report["candidate_id"] != user["_id"]:
        raise NotFoundError("Report not found", code="report_not_found")
    # Transcript replay: question · answer · evaluator notes (incl. model answer outline). A report always shows
    # the evaluations, including a serious-mode interview's, which were hidden while it ran.
    session = await repo.get_session(report["session_id"])
    transcript = await engine.transcript(report["session_id"], include_evaluations=True,
                                         closing_message=(session or {}).get("closing_message"))
    return ok({**_public(report), "transcript": transcript, "config": session["config"] if session else None})
