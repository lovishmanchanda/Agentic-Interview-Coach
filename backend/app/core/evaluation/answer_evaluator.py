"""Answer evaluation (implementation_plan.md 1.7).

Walking-skeleton version: technical answers only, one prompt. Behavioral (STAR) and coding
evaluators plug in here later.
"""
import time
from typing import Literal

from pydantic import BaseModel, Field

from app.core.prompts import render_prompt
from app.gateway import AIGateway
from app.gateway.types import CallContext

TECHNICAL_PROMPT = "evaluator/technical_v1"
PerformanceTier = Literal["strong", "adequate", "weak"]


class DimensionScores(BaseModel):
    correctness: float = Field(ge=0, le=10)
    depth: float = Field(ge=0, le=10)
    communication: float = Field(ge=0, le=10)


class EvaluationOutput(BaseModel):
    """What the LLM must return. Validated by the gateway."""
    overall_score: float = Field(ge=0, le=10)
    dimensions: DimensionScores
    strengths: list[str] = Field(default_factory=list, max_length=6)
    weaknesses: list[str] = Field(default_factory=list, max_length=6)
    feedback: str
    suggestion: str
    model_answer_outline: list[str] = Field(default_factory=list, max_length=8)


def performance_tier(score: float) -> PerformanceTier:
    """architecture.md §8.4: strong >= 7.5, adequate 5.0-7.4, weak < 5.0.
    The interviewer only ever sees this tier, never the numeric score."""
    if score >= 7.5:
        return "strong"
    return "adequate" if score >= 5.0 else "weak"


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items) or "- (none listed)"


async def evaluate_answer(gateway: AIGateway, *, question: dict, answer_text: str, profile: dict | None,
                          context: CallContext) -> dict:
    """Returns the EvaluationOutput fields plus performance_tier, prompt_version and latency_ms."""
    prompt = render_prompt(
        TECHNICAL_PROMPT,
        role=(profile or {}).get("target", {}).get("role", "software_engineer"),
        experience_level=(profile or {}).get("personal", {}).get("experience_level", "fresher"),
        topic=question.get("topic", "general"),
        difficulty=question.get("difficulty", "medium"),
        question_text=question["question_text"],
        expected_concepts=_bullets(question.get("expected_concepts", [])),
        rubric=_bullets([f"{k}: {v}" for k, v in question.get("evaluation_rubric", {}).items()]),
        answer_text=answer_text.strip() or "(no answer given)",
    )
    context.prompt_version = TECHNICAL_PROMPT
    started = time.perf_counter()
    result = await gateway.generate_structured(prompt, EvaluationOutput, context=context, tier="fast")
    return {
        **result,
        "performance_tier": performance_tier(result["overall_score"]),
        "prompt_version": TECHNICAL_PROMPT,
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }
