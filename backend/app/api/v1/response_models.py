"""Typed descriptions of what some list endpoints return, for the OpenAPI schema and so the frontend's TypeScript
API types (generated from it) are real types, not `unknown`.

They document the responses (`responses=` on the route) without filtering them, and every model forbids extra
fields: the integration tests validate real responses against them (test_walking_skeleton, test_prep_flow), so a
field added to or removed from a response fails a test until the model, and the frontend types, catch up.
"""
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.utils.responses import Envelope


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReportSummary(_Strict):
    """GET /reports, newest first: what the dashboard charts need without fetching each report."""
    report_id: str
    session_id: str
    overall: float
    interview_type: str
    topics: list[str]
    per_topic_scores: dict[str, float]
    duration_seconds: int | None
    generated_at: str  # ISO 8601, UTC


class SessionConfig(BaseModel):
    """A session's resolved interview settings (more may be stored; these are the ones the UI reads)."""
    model_config = ConfigDict(extra="allow")
    interview_type: str
    interview_mode: str
    role: str
    experience_level: str | None = None
    company: str | None = None
    difficulty: str | None = None
    question_count: int | None = None
    focus_topics: list[str] = []
    coding_language: str | None = None


class SessionSummary(_Strict):
    """GET /interviews, newest first."""
    session_id: str
    state: str
    config: SessionConfig
    started_at: str
    completed_at: str | None
    report_id: str | None
    topics_covered: list[str]
    focus_topics: list[str]
    questions_asked: int


class LatestReport(_Strict):
    report_id: str
    session_id: str
    generated_at: str
    interview_type: str
    overall: float
    weakest_topic: str | None
    strongest_topic: str | None


class MentorWelcome(_Strict):
    """GET /mentor/welcome: what ARIA's page (and the desk's next step) opens with."""
    mentor_available: bool
    report_count: int
    pending_reports: int
    latest: LatestReport | None


class PlanSummary(_Strict):
    """GET /prep/plans, newest first."""
    plan_id: str
    company_name: str
    created_at: str
    estimated_weeks: int | None = None
    sources: dict[str, Any] = {}  # where the plan drew from: { company, jd, interviews, ... }


def documented(model) -> dict:
    """`responses=` for a route that returns ok(...) of this model."""
    return {200: {"model": Envelope[model]}}
