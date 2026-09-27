from datetime import datetime, timezone
from pydantic import BaseModel, Field


class QuestionFeedback(BaseModel):
    question_id: str
    question: str
    topic: str = "general"
    score: float = Field(ge=0, le=10)
    answer_summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    feedback: str = ""
    suggestion: str = ""


class InterviewReport(BaseModel):
    """The only object the report-generation teammate must send to this tool."""
    session_id: str
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    interview_type: str
    topic: str
    overall_score: float = Field(ge=0, le=10)
    summary: str
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    topics_covered: list[str] = Field(default_factory=list)
    question_feedback: list[QuestionFeedback] = Field(default_factory=list)
    recommended_study_areas: list[str] = Field(default_factory=list)


class MentorChatRequest(BaseModel):
    user_id: str = Field(min_length=1)  # replace from auth in production
    message: str = Field(min_length=1)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=8)
    limit: int = Field(default=5, ge=1, le=10)


class MentorChatResponse(BaseModel):
    answer: str
    sources: list[dict]
