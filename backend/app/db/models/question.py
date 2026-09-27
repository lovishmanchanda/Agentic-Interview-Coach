"""question_bank documents (architecture.md §5.2). Seeded from data/seed/question_bank/*.json."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator

QuestionType = Literal["technical", "behavioral", "coding"]
QuestionDifficulty = Literal["easy", "medium", "hard"]
CodingLanguage = Literal["python", "c", "cpp", "java", "javascript"]  # Piston runtimes


class TestCase(BaseModel):
    input: str
    expected_output: str
    is_hidden: bool = False


class Example(BaseModel):
    input: str
    output: str
    explanation: str | None = None


class CodingSpec(BaseModel):
    """Only on coding questions. Consumed by sandbox_tool + the test harness (Phase 4)."""
    entry_function: str
    constraints: str = ""
    examples: list[Example] = Field(default_factory=list)
    template_code: dict[CodingLanguage, str]
    time_limit_minutes: int = Field(default=20, ge=1, le=120)


class Question(BaseModel):
    question_id: str = Field(pattern=r"^[a-z0-9_]+$")
    type: QuestionType
    topic: str
    subtopic: str = ""
    difficulty: QuestionDifficulty
    roles: list[str] = Field(min_length=1)
    question_text: str = Field(min_length=10)
    expected_concepts: list[str] = Field(default_factory=list)
    evaluation_rubric: dict[str, str] = Field(default_factory=dict)
    follow_up_possibilities: list[str] = Field(default_factory=list)
    for_coding_interview: bool = False
    test_cases: list[TestCase] = Field(default_factory=list)
    coding: CodingSpec | None = None
    source: Literal["seed", "llm_generated", "research"] = "seed"

    @model_validator(mode="after")
    def _coding_questions_need_tests(self) -> "Question":
        if self.type == "coding":
            if not self.for_coding_interview or self.coding is None:
                raise ValueError(f"{self.question_id}: coding questions need for_coding_interview=true and a coding spec")
            if not self.test_cases:
                raise ValueError(f"{self.question_id}: coding questions need test cases")
        return self
