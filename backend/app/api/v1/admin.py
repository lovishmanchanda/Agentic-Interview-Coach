"""Admin API (implementation_plan.md Phase 6): live metrics, usage and cost, prompt versions (A/B + rollback) and
recent AI calls for tracing. Admins only (the admin role or ADMIN_EMAILS)."""
from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from app.core.prompts import all_prompt_names, available_versions
from app.db.repositories.interview_repo import as_utc
from app.db.repositories.usage_repo import UsageRepository
from app.dependencies import AdminUser
from app.utils.exceptions import UnprocessableError
from app.utils.responses import ok

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/metrics")
async def metrics(_: AdminUser, request: Request):
    """Requests, WebSocket sessions and AI calls over the last 15 minutes on this worker, and firing alerts."""
    return ok(request.app.state.metrics.snapshot())


@router.get("/usage")
async def usage(_: AdminUser, request: Request, days: Annotated[int, Query(ge=1, le=90)] = 7):
    """Tokens, estimated cost, errors and latency per day, model, prompt version and call type; top candidates;
    how often interviews were cut short by the token budget or the time limit."""
    report = await UsageRepository(request.app.state.db).report(days)
    report["daily_token_limit_per_user"] = request.app.state.settings.daily_token_limit_per_user
    return ok(report)


@router.get("/prompts")
async def prompts(_: AdminUser, request: Request):
    """Every prompt, its versions on disk, the active weights (empty = the version named in code), and how each
    version has done: evaluations' average score and the interviewer agent's outcomes, for A/B comparisons."""
    db = request.app.state.db
    settings = {d["name"]: d for d in await db["prompt_settings"].find({}, {"_id": 0}).to_list(length=500)}
    evals = {r["_id"]: r for r in await db["evaluations"].aggregate([
        {"$group": {"_id": "$prompt_version_used", "n": {"$sum": 1}, "avg_score": {"$avg": "$overall_score"}}}]).to_list(200)}
    agent = {}
    for r in await db["agent_runs"].aggregate([
            {"$group": {"_id": {"v": "$prompt_version", "o": "$outcome"}, "n": {"$sum": 1}}}]).to_list(500):
        agent.setdefault(r["_id"]["v"], {})[r["_id"]["o"]] = r["n"]
    out = []
    for name in all_prompt_names():
        versions = []
        for v in available_versions(name):
            pid = f"{name}_{v}"
            e = evals.get(pid)
            versions.append({"version": v, "prompt_id": pid,
                             "evaluations": {"n": e["n"], "avg_score": round(e["avg_score"], 2)} if e else None,
                             "agent_outcomes": agent.get(pid)})
        doc = settings.get(name, {})
        out.append({"name": name, "versions": versions, "weights": doc.get("weights") or {},
                    "updated_by": doc.get("updated_by"),
                    "updated_at": as_utc(doc["updated_at"]).isoformat() if doc.get("updated_at") else None,
                    "history": [{**h, "at": as_utc(h["at"]).isoformat() if h.get("at") else None}
                                for h in doc.get("history", [])][-5:]})
    return ok(out)


class WeightsRequest(BaseModel):
    weights: dict[str, int] = Field(min_length=1, max_length=10)  # {"v1": 90, "v2": 10}; must add up to 100


@router.put("/prompts/{area}/{name}")
async def set_prompt(area: str, name: str, body: WeightsRequest, user: AdminUser, request: Request):
    """Switch a prompt's version, or split traffic between versions. Takes effect on this worker at once and on
    the others within 30 s. Stable per session, so an interview never mixes versions."""
    try:
        return ok(await request.app.state.prompts.set(f"{area}/{name}", body.weights, by=user["email"]))
    except ValueError as exc:
        raise UnprocessableError(str(exc), code="invalid_prompt_weights") from exc


@router.delete("/prompts/{area}/{name}")
async def reset_prompt(area: str, name: str, user: AdminUser, request: Request):
    """Back to the version named in code (the rollback of last resort)."""
    if f"{area}/{name}" not in all_prompt_names():
        raise UnprocessableError(f"unknown prompt: {area}/{name}", code="invalid_prompt_weights")
    await request.app.state.prompts.reset(f"{area}/{name}", by=user["email"])
    return ok({"name": f"{area}/{name}", "weights": {}})


@router.get("/llm-calls")
async def llm_calls(_: AdminUser, request: Request, session_id: str | None = None, status: str | None = None,
                    prompt_version: str | None = None, limit: Annotated[int, Query(ge=1, le=200)] = 50):
    """Recent AI calls, newest first, for tracing a bad result: filter by session, status or prompt version.
    Prompt/output text is present only when LLM_TRACE_CONTENT is on."""
    query = {k: v for k, v in {"session_id": session_id, "status": status, "prompt_version": prompt_version}.items() if v}
    rows = await request.app.state.db["llm_calls"].find(query, {"_id": 0}).sort("at", -1).to_list(length=limit)
    return ok([{**r, "at": as_utc(r["at"]).isoformat()} for r in rows])
