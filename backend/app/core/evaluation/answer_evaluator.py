"""Answer evaluation (implementation_plan.md 1.7).

Two evaluators share one result shape, so the engine, reports and the Mentor don't care which ran:

    technical   evaluator/technical_v1    correctness · depth · communication
    behavioral  evaluator/behavioral_v1   STAR (situation · task · action · result) · specificity · ownership · communication

The evaluator is picked from the question's type. Coding answers get their own evaluator in Phase 4,
which is where the problem-solving dimensions from the plan (approach, complexity, edge cases) belong.
Every prompt change is measured with evaluation/interview_eval/run_evaluator_eval.py first.
"""
import time
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from app.core.prompts import render_prompt
from app.gateway import AIGateway
from app.gateway.types import CallContext

EvaluationType = Literal["technical", "behavioral"]
PerformanceTier = Literal["strong", "adequate", "weak"]


def _score():
    return Field(ge=0, le=10)


class TechnicalDimensions(BaseModel):
    correctness: float = _score()
    depth: float = _score()
    communication: float = _score()


class BehavioralDimensions(BaseModel):
    situation: float = _score()
    task: float = _score()
    action: float = _score()
    result: float = _score()
    specificity: float = _score()
    ownership: float = _score()
    communication: float = _score()


class _EvaluationBase(BaseModel):
    """What the LLM must return. Validated by the gateway."""
    overall_score: float = _score()
    strengths: list[str] = Field(default_factory=list, max_length=6)
    weaknesses: list[str] = Field(default_factory=list, max_length=6)
    feedback: str
    suggestion: str
    model_answer_outline: list[str] = Field(default_factory=list, max_length=8)


class EvaluationOutput(_EvaluationBase):
    dimensions: TechnicalDimensions


class BehavioralEvaluationOutput(_EvaluationBase):
    dimensions: BehavioralDimensions


@dataclass(frozen=True)
class Evaluator:
    type: EvaluationType
    prompt_id: str
    schema: type[_EvaluationBase]


EVALUATORS: dict[str, Evaluator] = {
    "technical": Evaluator("technical", "evaluator/technical_v1", EvaluationOutput),
    "behavioral": Evaluator("behavioral", "evaluator/behavioral_v1", BehavioralEvaluationOutput),
}
TECHNICAL_PROMPT = EVALUATORS["technical"].prompt_id


def evaluator_for(question: dict) -> Evaluator:
    return EVALUATORS["behavioral" if question.get("type") == "behavioral" else "technical"]


def performance_tier(score: float) -> PerformanceTier:
    """architecture.md §8.4: strong >= 7.5, adequate 5.0-7.4, weak < 5.0.
    The interviewer only ever sees this tier, never the numeric score."""
    if score >= 7.5:
        return "strong"
    return "adequate" if score >= 5.0 else "weak"


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items) or "- (none listed)"


async def evaluate_answer(gateway: AIGateway, *, question: dict, answer_text: str, profile: dict | None,
                          context: CallContext, evaluator: Evaluator | None = None) -> dict:
    """Returns the output fields plus evaluation_type, performance_tier, prompt_version and latency_ms.
    `evaluator` overrides the choice by question type (the eval runner uses it to test a prompt version)."""
    evaluator = evaluator or evaluator_for(question)
    prompt = render_prompt(
        evaluator.prompt_id,
        role=(profile or {}).get("target", {}).get("role", "software_engineer"),
        experience_level=(profile or {}).get("personal", {}).get("experience_level", "fresher"),
        topic=question.get("topic", "general"),
        difficulty=question.get("difficulty", "medium"),
        question_text=question["question_text"],
        expected_concepts=_bullets(question.get("expected_concepts", [])),
        rubric=_bullets([f"{k}: {v}" for k, v in question.get("evaluation_rubric", {}).items()]),
        answer_text=answer_text.strip() or "(no answer given)",
    )
    context.prompt_version = evaluator.prompt_id
    started = time.perf_counter()
    result = await gateway.generate_structured(prompt, evaluator.schema, context=context, tier="fast")
    return {
        **result,
        "evaluation_type": evaluator.type,
        "performance_tier": performance_tier(result["overall_score"]),
        "prompt_version": evaluator.prompt_id,
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }
