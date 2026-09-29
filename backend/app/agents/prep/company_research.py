"""3.2 Company research: the curated knowledge base first, then Groq from general knowledge (cached).

Every cached entry is shared by all candidates, so only a company the model recognises is cached, and its
fields are checked against the vocabulary. A name the model doesn't recognise returns None: the plan then
works from the job description and the candidate's history alone.
"""
import re
from dataclasses import dataclass

from app.agents.prep.schemas import CompanyResearchOutput
from app.agents.prep.vocabulary import BEHAVIORAL, CODING, TECHNICAL, known
from app.core.prompts import render_prompt
from app.db.models.company import Company, company_key
from app.db.repositories.company_repo import CompanyRepository
from app.gateway import AIGateway
from app.gateway.types import CallContext

RESEARCH_PROMPT = "prep/company_research_v1"
_NAME = re.compile(r"[^A-Za-z0-9 &.'\-]+")


def clean_company_name(text: str) -> str:
    """What we accept as a company name: letters, digits, spaces and & . ' - , at most 60 characters."""
    return " ".join(_NAME.sub(" ", text).split())[:60].strip(" .-'&")


@dataclass
class Research:
    company: dict | None
    source: str  # curated | cached | llm | unknown


async def research_company(name: str, *, repo: CompanyRepository, gateway: AIGateway, context: CallContext) -> Research:
    name = clean_company_name(name)
    if not company_key(name):
        return Research(None, "unknown")
    stored = await repo.find(name)
    if stored:
        return Research(stored, "curated" if stored.get("source") == "curated" else "cached")

    context.prompt_version = RESEARCH_PROMPT
    out = await gateway.generate_structured(
        render_prompt(RESEARCH_PROMPT, company=name, technical_topics=", ".join(TECHNICAL),
                      coding_topics=", ".join(CODING), behavioral_topics=", ".join(BEHAVIORAL)),
        CompanyResearchOutput, context=context)
    if not out["known"]:
        return Research(None, "unknown")
    display = clean_company_name(out.get("name") or name) or name
    company = Company(
        company_id=company_key(name), name=display, aliases=[name.lower()] if display.lower() != name.lower() else [],
        source="llm", overview=out["overview"], interview_process=out["interview_process"],
        technical_focus=known(out["technical_focus"], "technical")[:4], coding_focus=known(out["coding_focus"], "coding")[:5],
        behavioral_values=out["behavioral_values"][:8], competencies=known(out["competencies"], "behavioral")[:4],
        tips=out["tips"][:4])
    await repo.upsert(company)
    return Research(company.model_dump(), "llm")
