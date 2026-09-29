"""Types that cross the AI Gateway boundary (architecture.md §7, §10.4)."""
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel

CallType = Literal["generate", "structured", "tools", "embed", "transcribe", "synthesize", "execute"]
ModelTier = Literal["default", "fast"]

ExecutionStatus = Literal["accepted", "wrong_answer", "time_limit", "runtime_error", "compile_error", "internal_error"]


class TestCaseResult(BaseModel):
    passed: bool
    is_hidden: bool
    input: str | None = None       # None once redacted (a hidden test in serious mode)
    expected: str | None = None
    actual: str | None = None      # the value returned, or "Error: …" if the call raised


class ExecutionResult(BaseModel):
    """One run in the sandbox. `execute_code()` fills the run fields; the test harness adds the tests.
    graded=False: a language without a harness yet, so the code ran as written and no tests were checked."""
    status: ExecutionStatus
    stdout: str | None = None
    stderr: str | None = None
    compile_output: str | None = None
    runtime_ms: int | None = None
    memory_kb: int | None = None
    passed_tests: int = 0
    total_tests: int = 0
    test_results: list[TestCaseResult] = []
    graded: bool = False
    language: str = ""


@dataclass
class ToolCall:
    """The model wants a tool run: generate_with_tools() returned a call, not a final message."""
    name: str
    arguments: dict[str, Any]
    id: str = ""


@dataclass
class FinalMessage:
    content: str
    parsed: dict[str, Any] | None = None  # structured AgentDecision when requested


@dataclass
class CallContext:
    """Who a call is for. Drives usage logging and the per-session token budget."""
    session_id: str | None = None
    candidate_id: str | None = None
    prompt_version: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)
