"""Preparation plans (Phase 3). Plans are created through the Mentor (POST /mentor/prepare, or "prepare me for X"
in chat); these read them back. Every route is scoped to the signed-in candidate."""
from typing import Annotated

from fastapi import APIRouter, Depends

from app.db.repositories.interview_repo import as_utc
from app.db.repositories.prep_repo import PrepPlanRepository
from app.dependencies import CurrentUser, DbDep
from app.utils.exceptions import NotFoundError
from app.utils.responses import ok

router = APIRouter(prefix="/prep", tags=["prep"])


def get_plans(db: DbDep) -> PrepPlanRepository:
    return PrepPlanRepository(db)


PlansDep = Annotated[PrepPlanRepository, Depends(get_plans)]


@router.get("/plans")
async def list_plans(user: CurrentUser, plans: PlansDep):
    return ok([{**p, "created_at": as_utc(p["created_at"]).isoformat()} for p in await plans.list_for(user["_id"])])


@router.get("/plans/{plan_id}")
async def get_plan(plan_id: str, user: CurrentUser, plans: PlansDep):
    plan = await plans.get(plan_id, user["_id"])
    if plan is None:
        raise NotFoundError("Plan not found", code="plan_not_found")
    keys = ("plan_id", "company_name", "company_source", "plan", "plan_source", "analysis", "jd_analysis",
            "estimated_weeks", "sources", "actions", "markdown")
    return ok({**{k: plan.get(k) for k in keys}, "created_at": as_utc(plan["created_at"]).isoformat()})
