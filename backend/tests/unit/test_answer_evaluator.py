import asyncio

import pytest

from app.core.evaluation.answer_evaluator import EVALUATORS, evaluate_answer, evaluator_for, performance_tier
from app.gateway import FakeAIGateway
from app.gateway.types import CallContext
from tests.fakes import BEHAVIORAL_EVALUATION, GOOD_EVALUATION

QUESTION = {"question_text": "Tell me about a time you disagreed with your manager.", "topic": "collaboration",
            "expected_concepts": ["data or evidence"], "evaluation_rubric": {"action": "Shows evidence."}}


def test_evaluator_is_chosen_by_question_type():
    assert evaluator_for({"type": "behavioral"}) is EVALUATORS["behavioral"]
    assert evaluator_for({"type": "technical"}) is EVALUATORS["technical"]
    assert evaluator_for({}) is EVALUATORS["technical"]  # questions stored before 1.7 have no type


@pytest.mark.parametrize("score, tier", [(0, "weak"), (4.9, "weak"), (5.0, "adequate"), (7.4, "adequate"),
                                         (7.5, "strong"), (10, "strong")])
def test_performance_tier_boundaries(score, tier):
    assert performance_tier(score) == tier


def test_behavioral_prompt_and_result():
    gw = FakeAIGateway().script("structured", BEHAVIORAL_EVALUATION)
    result = asyncio.run(evaluate_answer(gw, question={**QUESTION, "type": "behavioral"}, answer_text="I showed data.",
                                         profile={"target": {"role": "backend"}}, context=CallContext(session_id="s")))
    prompt = gw.calls_of("structured")[0]["prompt"]
    assert "Competency: collaboration" in prompt and "- action: Shows evidence." in prompt
    assert "<<<ANSWER\nI showed data.\nANSWER>>>" in prompt and "${" not in prompt
    assert result["evaluation_type"] == "behavioral" and result["performance_tier"] == "adequate"
    assert result["prompt_version"] == "evaluator/behavioral_v1"


def test_behavioral_output_must_have_star_dimensions():
    gw = FakeAIGateway().script("structured", GOOD_EVALUATION)  # technical-shaped: no STAR dimensions
    with pytest.raises(ValueError):
        asyncio.run(evaluate_answer(gw, question={**QUESTION, "type": "behavioral"}, answer_text="x",
                                    profile=None, context=CallContext()))


def test_both_prompts_render_every_placeholder():
    for evaluator in EVALUATORS.values():
        gw = FakeAIGateway().script("structured", BEHAVIORAL_EVALUATION if evaluator.type == "behavioral" else GOOD_EVALUATION)
        asyncio.run(evaluate_answer(gw, question=QUESTION, answer_text="a", profile=None, context=CallContext(),
                                    evaluator=evaluator))
        assert "${" not in gw.calls_of("structured")[0]["prompt"]
