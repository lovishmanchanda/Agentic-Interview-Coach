"""3.7 PrepAgentOrchestrator: research → JD analysis → candidate snapshot → gap analysis → plan.

Each step is timed and recorded in agent_runs. A failing step doesn't stop the run: no company info means the
plan comes from the JD and the candidate's history; no JD is normal; if the planner fails, a deterministic plan
is built from the same gaps. Only the candidate snapshot (our own database) is required.
"""
import asyncio
import logging
import time
import uuid

from app.agents.prep import gap_analyzer
from app.agents.prep.candidate_profiler import snapshot
from app.agents.prep.company_research import clean_company_name, research_company
from app.agents.prep.gap_analyzer import Requirement, company_requirements, jd_requirements, merge
from app.agents.prep.jd_analyzer import analyze_jd
from app.agents.prep.planner import fallback_plan, write_plan
from app.agents.prep.render import actions_for, render
from app.core.interview.question_engine import DEFAULT_ROLE, ROLE_TOPICS, role_key
from app.db.repositories.agent_run_repo import AgentRunRepository
from app.db.repositories.company_repo import CompanyRepository
from app.db.repositories.interview_repo import InterviewRepository, utcnow
from app.db.repositories.prep_repo import PrepPlanRepository
from app.db.repositories.profile_repo import ProfileRepository
from app.gateway import AIGateway
from app.gateway.types import CallContext
from app.utils.logging import log_event

log = logging.getLogger(__name__)
AGENT_NAME = "prep_orchestrator"


def role_requirements(target_role: str) -> list[Requirement]:
    """With no company notes and no JD: the usual topics for the candidate's target role."""
    topics = ROLE_TOPICS.get(role_key(target_role), ROLE_TOPICS[DEFAULT_ROLE])
    return ([Requirement(t, "high" if i < 2 else "medium", "your target role") for i, t in enumerate(topics[:4])]
            + [Requirement(c, "medium", "behavioral interviews") for c in ("ownership", "collaboration")])


class PrepOrchestrator:
    def __init__(self, *, gateway: AIGateway, companies: CompanyRepository, profiles: ProfileRepository,
                 interviews: InterviewRepository, plans: PrepPlanRepository, runs: AgentRunRepository):
        self.gateway = gateway
        self.companies = companies
        self.profiles = profiles
        self.interviews = interviews
        self.plans = plans
        self.runs = runs

    async def run(self, *, candidate_id: str, company_name: str, jd_text: str | None = None,
                  weeks: int | None = None) -> dict:
        run_id, started_at = uuid.uuid4().hex, utcnow()
        steps: list[dict] = []
        company_name = clean_company_name(company_name) or "the company"

        async def step(name: str, work):
            began = time.perf_counter()
            try:
                result = await work()
                steps.append({"step": name, "status": "ok", "latency_ms": int((time.perf_counter() - began) * 1000)})
                return result
            except Exception as exc:  # noqa: BLE001 -- partial results beat no results; every failure is recorded
                steps.append({"step": name, "status": "failed", "latency_ms": int((time.perf_counter() - began) * 1000),
                              "error": type(exc).__name__, "code": getattr(exc, "code", None)})
                log_event(log, "prep_step_failed", level=logging.WARNING, step=name, error=type(exc).__name__)
                return None

        contexts = {name: CallContext(candidate_id=candidate_id, extra={"agent": AGENT_NAME, "run_id": run_id})
                    for name in ("research", "jd", "planner")}

        # Research and JD analysis don't depend on each other: run them together.
        async def no_jd():
            return None

        has_jd = bool(jd_text and jd_text.strip())
        research, jd = await asyncio.gather(
            step("research_company", lambda: research_company(company_name, repo=self.companies, gateway=self.gateway,
                                                              context=contexts["research"])),
            step("analyze_jd", lambda: analyze_jd(jd_text.strip(), gateway=self.gateway, context=contexts["jd"]))
            if has_jd else no_jd())
        if not has_jd:
            steps.append({"step": "analyze_jd", "status": "skipped"})
        steps.sort(key=lambda s: ["research_company", "analyze_jd"].index(s["step"]))
        company = research.company if research else None
        company_source = research.source if research else "failed"
        if company:
            company_name = company["name"]

        candidate = await snapshot(candidate_id, profiles=self.profiles, interviews=self.interviews)
        steps.append({"step": "profile_candidate", "status": "ok", "interviews": candidate.interviews_done})

        requirements = merge(company_requirements(company) if company else [], jd_requirements(jd) if jd else [])
        if not requirements:
            requirements = role_requirements(candidate.target_role)
        analysis = gap_analyzer.analyze(requirements, candidate)
        steps.append({"step": "gap_analysis", "status": "ok", "gaps": len(analysis["gaps"]),
                      "strengths": len(analysis["strengths"])})

        plan = await step("write_plan", lambda: write_plan(
            gateway=self.gateway, context=contexts["planner"], company_name=company_name, company=company, jd=jd,
            candidate=candidate, analysis=analysis, weeks=weeks))
        plan_source = "llm"
        if plan is None:
            plan, plan_source = fallback_plan(company_name=company_name, company=company, analysis=analysis, weeks=weeks), "fallback"

        role = candidate.target_role
        doc = {
            "plan_id": uuid.uuid4().hex, "candidate_id": candidate_id, "company_name": company_name,
            "company_id": (company or {}).get("company_id"), "company_source": company_source,
            "jd_analysis": jd, "analysis": analysis, "plan": plan, "plan_source": plan_source,
            "estimated_weeks": plan["estimated_weeks"], "sources": {"company": company_source, "jd": bool(jd),
                                                                      "interviews": candidate.interviews_done},
            "actions": actions_for(plan, company=company_name, role=role),
            "markdown": render(company_name=company_name, company=company, company_source=company_source, plan=plan,
                               analysis=analysis, jd=jd, plan_source=plan_source),
            "run_id": run_id, "created_at": utcnow(),
            "prompt_versions": {name: ctx.prompt_version for name, ctx in contexts.items() if ctx.prompt_version},
        }
        await self.plans.save(doc)
        await self.runs.record({"run_id": run_id, "agent_name": AGENT_NAME, "candidate_id": candidate_id,
                                "plan_id": doc["plan_id"], "company": company_name, "steps": steps,
                                "outcome": "plan" if plan_source == "llm" else "fallback_plan",
                                "started_at": started_at, "finished_at": utcnow()})
        log_event(log, "prep_plan_created", plan_id=doc["plan_id"], company_source=company_source,
                  plan_source=plan_source, gaps=len(analysis["gaps"]))
        return doc
