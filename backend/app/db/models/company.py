"""companies (architecture.md §5.2): company knowledge for the preparation agents (Phase 3).

Curated entries are seeded from data/seed/companies/; companies not in it are researched by Groq from general
knowledge and cached here with source="llm". Azure AI Search replaces the lookup later (implementation_plan 3.1).
"""
import re
from typing import Literal

from pydantic import BaseModel, Field

TopicKey = str  # a key from app.agents.prep.vocabulary (validated there)


class InterviewStage(BaseModel):
    stage: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)


class CompanyKnowledge(BaseModel):
    """What the research step produces, whoever wrote it."""
    overview: str = Field(default="", max_length=600)
    interview_process: list[InterviewStage] = Field(default_factory=list, max_length=8)
    technical_focus: list[TopicKey] = Field(default_factory=list, max_length=8)
    coding_focus: list[TopicKey] = Field(default_factory=list, max_length=8)
    behavioral_values: list[str] = Field(default_factory=list, max_length=20)
    competencies: list[TopicKey] = Field(default_factory=list, max_length=8)
    tips: list[str] = Field(default_factory=list, max_length=6)


class Company(CompanyKnowledge):
    company_id: str = Field(pattern=r"^[a-z0-9_]{2,60}$")
    name: str = Field(min_length=1, max_length=60)
    aliases: list[str] = Field(default_factory=list, max_length=10)
    source: Literal["curated", "llm"] = "curated"


def company_key(name: str) -> str:
    """"Goldman Sachs" -> "goldman_sachs": the cache key and company_id."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:60]

