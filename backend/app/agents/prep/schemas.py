"""What the prep LLM steps must return. Validated by the gateway; keys are checked against the vocabulary after."""
from typing import Literal

from pydantic import BaseModel, Field

from app.db.models.company import CompanyKnowledge

Importance = Literal["high", "medium", "low"]
InterviewKind = Literal["technical", "coding", "behavioral"]


class CompanyResearchOutput(CompanyKnowledge):
    known: bool
    name: str = Field(default="", max_length=60)


class JDRequirementItem(BaseModel):
    area: str = Field(max_length=40)
    importance: Importance
    evidence: str = Field(default="", max_length=200)


class JDAnalysisOutput(BaseModel):
    role_title: str = Field(default="", max_length=100)
    seniority: Literal["fresher", "1-2", "3-5", "senior", "unknown"] = "unknown"
    summary: str = Field(default="", max_length=400)
    requirements: list[JDRequirementItem] = Field(default_factory=list, max_length=12)
    other_skills: list[str] = Field(default_factory=list, max_length=12)
    interview_types: list[InterviewKind] = Field(default_factory=list, max_length=3)


class MockInterview(BaseModel):
    interview_type: InterviewKind
    focus_areas: list[str] = Field(default_factory=list, max_length=4)
    mode: Literal["practice", "serious"] = "practice"


class PlanWeek(BaseModel):
    week: int = Field(ge=1, le=12)
    theme: str = Field(max_length=120)
    focus_areas: list[str] = Field(default_factory=list, max_length=4)
    activities: list[str] = Field(min_length=1, max_length=5)
    mock_interview: MockInterview | None = None


class PlanOutput(BaseModel):
    summary: str = Field(max_length=800)
    estimated_weeks: int = Field(ge=1, le=12)
    weeks: list[PlanWeek] = Field(min_length=1, max_length=12)
    readiness_check: str = Field(default="", max_length=400)
    company_tips: list[str] = Field(default_factory=list, max_length=5)
