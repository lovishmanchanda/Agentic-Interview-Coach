"""Typed inputs and outputs of the interviewer agent (docs/interview-agent-implementation-plan.md)."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator

AgentAction = Literal["deliver_follow_up", "deliver_question", "wrap_up"]
# The AdaptationEngine's vocabulary for the same three moves.
ACTION_TO_ADAPTATION = {"deliver_follow_up": "follow_up", "deliver_question": "next_topic", "wrap_up": "complete"}
ADAPTATION_TO_ACTION = {v: k for k, v in ACTION_TO_ADAPTATION.items()}


class AgentDecision(BaseModel):
    """What the agent proposes after an answer. It never names a state: the engine maps the action through
    the state machine and can overrule it."""
    action: AgentAction
    lead_in: str = Field(default="", max_length=400)
    follow_up_question: str | None = Field(default=None, max_length=400)
    # What a good answer to *this* follow-up covers. The evaluator grades the follow-up against these;
    # without them it would grade a narrow follow-up against the whole parent question and under-score it.
    follow_up_expected_points: list[str] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def _follow_up_needs_a_question(self) -> "AgentDecision":
        self.lead_in = self.lead_in.strip()
        if self.action == "deliver_follow_up":
            if not self.follow_up_question or len(self.follow_up_question.strip()) < 15:
                raise ValueError("deliver_follow_up needs follow_up_question (at least 15 characters)")
            self.follow_up_question = self.follow_up_question.strip()
            self.follow_up_expected_points = [p.strip()[:160] for p in self.follow_up_expected_points if p.strip()]
        else:
            self.follow_up_question = None
            self.follow_up_expected_points = []
        return self


class OpeningOutput(BaseModel):
    opening: str = Field(min_length=5, max_length=500)


class HintOutput(BaseModel):
    hint: str = Field(min_length=5, max_length=400)


# Tool definitions in the OpenAI / Groq function-calling format.
def tools_for(allowed_actions: list[str]) -> list[dict]:
    """The tools with submit_decision's action list narrowed to what's allowed this turn, so the model can't
    propose a move the engine would reject (it still validates every proposal)."""
    import copy

    tools = copy.deepcopy(TOOLS)
    submit = next(t for t in tools if t["function"]["name"] == "submit_decision")
    submit["function"]["parameters"]["properties"]["action"]["enum"] = list(allowed_actions)
    return tools


TOOLS = [
    {"type": "function", "function": {
        "name": "get_performance_summary",
        "description": "Progress so far: questions asked, topics covered, and a strong/adequate/weak tier per topic. No scores.",
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
    {"type": "function", "function": {
        "name": "get_question_details",
        "description": "The current question's expected concepts and some example follow-ups, to help you write a better follow-up.",
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
    {"type": "function", "function": {
        "name": "submit_decision",
        "description": "Your final decision for this turn. Call it exactly once.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["deliver_follow_up", "deliver_question", "wrap_up"]},
                "lead_in": {"type": "string", "description": "What you say before the next question, or your closing line. Max 2 sentences."},
                "follow_up_question": {"type": "string", "description": "Only for deliver_follow_up: the one follow-up question."},
                "follow_up_expected_points": {"type": "array", "items": {"type": "string"},
                                              "description": "Only for deliver_follow_up: 2-4 short points a strong answer to your follow-up covers. Used to grade it."},
            },
            "required": ["action", "lead_in"],
            "additionalProperties": False,
        }}},
]
