"""3.6 Preparation planner: gap analysis -> a week-by-week plan (Groq), checked against the vocabulary and the
gaps; if the model fails, a deterministic plan from the same gaps (a partial result beats no result)."""
import math

from app.agents.prep.candidate_profiler import CandidateSnapshot
from app.agents.prep.schemas import PlanOutput
from app.agents.prep.vocabulary import KIND_OF
from app.core.prompts import render_for
from app.gateway import AIGateway
from app.gateway.types import CallContext

PLANNER_PROMPT = "prep/planner_v1"
MAX_GAPS_IN_PROMPT = 8
LABEL = {"dsa": "DSA", "dbms": "DBMS", "os": "OS", "oops": "OOP", "api_design": "API design"}


def label(topic: str) -> str:
    return LABEL.get(topic) or topic.replace("_", " ").capitalize()


def _gap_lines(rows: list[dict]) -> str:
    lines = []
    for r in rows:
        score = f", {r['score']}/10" if r["score"] is not None else ""
        lines.append(f"- {r['area']} ({r['kind']}): {r['status']}{score}; importance {r['importance']}; {r['reason']}")
    return "\n".join(lines) or "- (none)"


def _company_notes(company: dict | None) -> str:
    if not company:
        return "- No reliable company information; plan from the job description and the gaps."
    stages = "; ".join(s["stage"] for s in company.get("interview_process", []))
    return "\n".join(filter(None, [
        f"- Process: {stages}" if stages else "",
        f"- Values they assess: {', '.join(company.get('behavioral_values', [])[:8])}" if company.get("behavioral_values") else "",
        *[f"- Tip: {t}" for t in company.get("tips", [])[:4]],
    ]))


def _jd_notes(jd: dict | None) -> str:
    if not jd:
        return "No job description was provided."
    return "\n".join(filter(None, [
        f"Job description: {jd.get('role_title') or 'the role'} ({jd.get('seniority', 'unknown')}). {jd.get('summary', '')}",
        f"Other skills it asks for: {', '.join(jd['other_skills'])}" if jd.get("other_skills") else "",
    ]))


def validate(plan: dict, allowed: set[str]) -> dict:
    """Keep only topics from the analysis, of the right kind for each mock interview; renumber weeks."""
    weeks = []
    for i, week in enumerate(plan["weeks"], start=1):
        focus = [a for a in week["focus_areas"] if a in allowed]
        mock = week.get("mock_interview")
        if mock:
            mock = {**mock, "focus_areas": [a for a in mock["focus_areas"]
                                            if a in allowed and KIND_OF.get(a) == mock["interview_type"]][:3]}
        weeks.append({**week, "week": i, "focus_areas": focus, "mock_interview": mock})
    return {**plan, "weeks": weeks, "estimated_weeks": len(weeks), "company_tips": plan.get("company_tips", [])[:4]}


async def write_plan(*, gateway: AIGateway, context: CallContext, company_name: str, company: dict | None,
                     jd: dict | None, candidate: CandidateSnapshot, analysis: dict, weeks: int | None) -> dict:
    prompt = render_for(
        context, PLANNER_PROMPT, company=company_name, experience_level=candidate.experience_level,
        target_role=candidate.target_role, interviews_done=str(candidate.interviews_done),
        weeks_line=f"The candidate wants to be ready in {weeks} week(s)." if weeks else "",
        company_notes=_company_notes(company), jd_notes=_jd_notes(jd),
        gaps=_gap_lines(analysis["gaps"][:MAX_GAPS_IN_PROMPT]), strengths=_gap_lines(analysis["strengths"][:6]))
    plan = await gateway.generate_structured(prompt, PlanOutput, context=context)
    allowed = {r["area"] for r in [*analysis["gaps"], *analysis["strengths"]]}
    return validate(plan, allowed)


def fallback_plan(*, company_name: str, company: dict | None, analysis: dict, weeks: int | None) -> dict:
    """No LLM: the most urgent gaps spread over the study weeks, each week ending in a practice interview on them,
    then (if there's more than one week) a serious-mode rehearsal."""
    gaps = analysis["gaps"][:8] or analysis["strengths"][:2]
    total = weeks or max(2, min(6, math.ceil(len(gaps) / 2) + 1))
    study = total - 1 if total > 1 else 1
    chunks = [gaps[i::study] for i in range(study)] if gaps else [[] for _ in range(study)]
    plan_weeks = []
    for i, chunk in enumerate(chunks):
        areas = [g["area"] for g in chunk] or (company or {}).get("technical_focus", [])[:2]
        kind = chunk[0]["kind"] if chunk else "technical"
        plan_weeks.append({
            "week": i + 1, "theme": f"Close the gap: {', '.join(label(a) for a in areas)}" if areas else "Fundamentals",
            "focus_areas": areas,
            "activities": [f"Review the fundamentals of {label(a)} and write down how you'd explain it in an interview."
                           for a in areas][:3] + ["Redo the questions you scored lowest on, out loud and timed."],
            "mock_interview": {"interview_type": kind, "mode": "practice",
                               "focus_areas": [a for a in areas if KIND_OF.get(a) == kind]}})
    if total > 1:
        main = (company or {}).get("technical_focus", [])[:2]
        plan_weeks.append({
            "week": len(plan_weeks) + 1, "theme": f"Dress rehearsal for {company_name}", "focus_areas": main,
            "activities": ["Take a serious-mode interview under real timing.", "Review the report and fix the top weak area."],
            "mock_interview": {"interview_type": "technical", "mode": "serious", "focus_areas": main}})
    return {
        "summary": f"This plan works through your biggest gaps for {company_name}, a few areas a week, each week ending "
                   "in a practice interview" + (", then a serious-mode rehearsal." if total > 1 else "."),
        "estimated_weeks": len(plan_weeks), "weeks": plan_weeks,
        "readiness_check": "Schedule the real interview once you score 7.5+ in serious mode on the key areas.",
        "company_tips": (company or {}).get("tips", [])[:4],
    }
