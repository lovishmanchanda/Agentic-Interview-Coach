"""The plan as a Mentor message (markdown, like the Mentor's other replies) plus practice buttons."""
from urllib.parse import urlencode

from app.agents.prep.planner import label

MAX_ACTIONS = 6
KIND_LABEL = {"technical": "Technical", "coding": "Coding", "behavioral": "Behavioral"}
STATUS_TEXT = {"untested": "not practised yet", "weak": "weak", "developing": "developing", "strong": "strong"}


def practice_href(mock: dict, *, company: str, role: str | None) -> str:
    params = {"type": mock["interview_type"], "mode": mock.get("mode", "practice"), "company": company}
    if mock.get("focus_areas"):
        params["focus"] = ",".join(mock["focus_areas"])
    if role:
        params["role"] = role
    return f"/interview/configure?{urlencode(params, safe=',')}"


def actions_for(plan: dict, *, company: str, role: str | None) -> list[dict]:
    actions = []
    for week in plan["weeks"]:
        mock = week.get("mock_interview")
        if not mock:
            continue
        topics = ", ".join(label(a) for a in mock.get("focus_areas", []))
        serious = " (serious)" if mock.get("mode") == "serious" else ""
        actions.append({"type": "practice", "href": practice_href(mock, company=company, role=role),
                        "label": f"Week {week['week']}: {KIND_LABEL[mock['interview_type']]}{serious}" + (f" · {topics}" if topics else ""),
                        "interview_type": mock["interview_type"], "topics": mock.get("focus_areas", [])})
    return actions[:MAX_ACTIONS]


def _score(row: dict) -> str:
    return f" ({row['score']}/10)" if row.get("score") is not None else ""


def render(*, company_name: str, company: dict | None, company_source: str, plan: dict, analysis: dict,
           jd: dict | None, plan_source: str) -> str:
    lines = [f"## Your plan for {company_name} (about {plan['estimated_weeks']} week{'s' if plan['estimated_weeks'] != 1 else ''})",
             "", plan["summary"], ""]
    gaps, strengths = analysis["gaps"], analysis["strengths"]
    if gaps or strengths:
        lines.append("**Where you stand**")
        if strengths:
            lines.append("- Strong: " + ", ".join(f"{label(s['area'])}{_score(s)}" for s in strengths[:5]))
        if gaps:
            lines.append("- To work on: " + ", ".join(f"{label(g['area'])} ({STATUS_TEXT[g['status']]}{', ' + str(g['score']) + '/10' if g['score'] is not None else ''})"
                                                     for g in gaps[:6]))
        lines.append("")
    for week in plan["weeks"]:
        lines.append(f"### Week {week['week']}: {week['theme']}")
        lines += [f"- {a}" for a in week["activities"]]
        mock = week.get("mock_interview")
        if mock:
            topics = ", ".join(label(a) for a in mock.get("focus_areas", [])) or "a mix"
            lines.append(f"- **Practice:** a {mock.get('mode', 'practice')}-mode {mock['interview_type']} interview on {topics} (button below).")
        lines.append("")
    if plan.get("readiness_check"):
        lines += [f"**When to book the real interview:** {plan['readiness_check']}", ""]
    if company and company.get("interview_process"):
        lines.append(f"### How {company_name} usually interviews")
        lines += [f"{i}. **{s['stage']}**: {s['description']}" for i, s in enumerate(company["interview_process"], 1)]
        # Values are shown only from curated notes: a model's recollection of a company's values can't be checked,
        # and quoting the wrong ones in an interview hurts. (AI-researched values still shape the behavioral focus.)
        if company.get("behavioral_values") and company_source == "curated":
            lines.append(f"\n**What they look for:** {', '.join(company['behavioral_values'][:10])}")
        lines.append("")
    if plan.get("company_tips"):
        lines.append("### Tips")
        lines += [f"- {t}" for t in plan["company_tips"]]
        lines.append("")
    if jd and jd.get("other_skills"):
        lines += [f"**Also in the job description:** {', '.join(jd['other_skills'])}. The app can't test these yet; review them yourself.", ""]
    notes = {
        "curated": "Company notes are general guidance from our curated notes; processes vary by team and change over time, so confirm with your recruiter.",
        "cached": "Company notes were written by AI from general knowledge and may be out of date; confirm with your recruiter or the company's careers site.",
        "llm": "Company notes were written by AI from general knowledge and may be out of date; confirm with your recruiter or the company's careers site.",
        "unknown": f"I don't have reliable information on how {company_name} interviews, so this plan is built from your interview history{' and the job description' if jd else ''}.",
        "failed": "I couldn't look up the company just now, so this plan is built from your interview history" + (" and the job description." if jd else "."),
    }
    lines.append(f"*{notes.get(company_source, notes['unknown'])}*" + ("" if plan_source == "llm" else " *The schedule was built without AI this time.*"))
    return "\n".join(lines).strip()
