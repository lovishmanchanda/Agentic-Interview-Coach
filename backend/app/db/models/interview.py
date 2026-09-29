"""Interview configuration (implementation_plan.md 1.2, architecture.md §5.2 interview_sessions.config).

Every field is optional except what has a default: anything left out comes from the candidate's
profile. Choices that exist in the schema but aren't built yet (voice) are accepted by the schema and
rejected by `unavailable_reason()`, so the API contract doesn't change when they ship. Coding interviews
also need the code runner (PISTON_URL); the API refuses them when it isn't configured.
"""
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.models.profile import Difficulty, ExperienceLevel, IOMode
from app.db.models.question import CodingLanguage

InterviewType = Literal["technical", "behavioral", "coding"]
InterviewMode = Literal["practice", "serious"]

DEFAULT_QUESTION_COUNT = 3
MAX_CODING_QUESTIONS = 3  # a problem takes 15-35 minutes
MAX_FOCUS_TOPICS = 5
TOPIC_PATTERN = r"^[a-z][a-z0-9_]{1,39}$"

# What isn't built yet, and when it arrives (shown to the candidate, so no task numbers).
UNAVAILABLE = {
    ("input_mode", "voice"): "Voice answers are coming soon. Use text for now.",
    ("output_mode", "voice"): "Spoken questions are coming soon. Use text for now.",
}


class InterviewConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a typo in a field name is an error, not a silent default

    interview_type: InterviewType = "technical"
    interview_mode: InterviewMode = "practice"
    role: str | None = Field(default=None, min_length=1, max_length=100)
    experience_level: ExperienceLevel | None = None
    company: str | None = Field(default=None, max_length=100)
    difficulty: Difficulty | None = None
    input_mode: IOMode = "text"
    output_mode: IOMode = "text"
    question_count: int = Field(default=DEFAULT_QUESTION_COUNT, ge=1, le=5)
    # Weak-Area Drill: the question engine sticks to these topics (competencies for a behavioral interview).
    focus_topics: list[str] = Field(default_factory=list, max_length=MAX_FOCUS_TOPICS)
    # The editor's starting language in a coding interview (the candidate can switch per problem).
    coding_language: CodingLanguage = "python"

    @field_validator("role", "company", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("focus_topics")
    @classmethod
    def _clean_topics(cls, topics: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(t.strip().lower().replace(" ", "_").replace("-", "_") for t in topics))
        bad = [t for t in cleaned if not re.fullmatch(TOPIC_PATTERN, t)]
        if bad:
            raise ValueError(f"invalid topic(s): {', '.join(bad)}")
        return cleaned

    @model_validator(mode="after")
    def _coding_question_count(self) -> "InterviewConfigRequest":
        if self.interview_type == "coding" and self.question_count > MAX_CODING_QUESTIONS:
            raise ValueError(f"a coding interview has at most {MAX_CODING_QUESTIONS} problems")
        return self

    def unavailable_reason(self) -> str | None:
        for (field, value), reason in UNAVAILABLE.items():
            if getattr(self, field) == value:
                return reason
        return None
