"""The only code that talks to Piston (implementation_plan.md 4.6.3, plan-review C3). Called only through
AIGateway.execute_code(), so logging and error handling are shared with every other external call.

Candidate code never runs on the application server: it goes to Piston, which runs each job in an
isolated, resource-limited sandbox on its own VM.
"""
import logging
import re
from typing import Any

import httpx

from app.core.coding.languages import LANGUAGES
from app.gateway.types import ExecutionResult, ExecutionStatus

log = logging.getLogger(__name__)

MAX_OUTPUT_CHARS = 20_000
_TIMEOUT_SIGNALS = {"SIGKILL", "SIGXCPU"}
# Piston runs Java in single-file mode (no separate compile step), so javac's errors arrive in the run's stderr.
_JAVA_COMPILE_ERROR = re.compile(r"\.java(?:\.java)?:\d+: error:")


def execute_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    return base if base.endswith("/execute") else f"{base}/execute"


def to_result(language: str, data: dict[str, Any]) -> ExecutionResult:
    """Piston's response -> one ExecutionStatus. Tests are added by the harness, not here."""
    compile_step = data.get("compile") or {}
    run = data.get("run") or {}
    status: ExecutionStatus
    if compile_step and compile_step.get("code") not in (0, None):
        status = "compile_error"
    elif run.get("signal") in _TIMEOUT_SIGNALS or run.get("status") in ("TO", "timeout"):
        status = "time_limit"
    elif language == "java" and run.get("code") not in (0, None) and _JAVA_COMPILE_ERROR.search(run.get("stderr") or ""):
        status = "compile_error"
    elif run.get("code") not in (0, None):
        status = "runtime_error"
    else:
        status = "accepted"
    wall = run.get("wall_time")
    return ExecutionResult(
        status=status, language=language,
        stdout=(run.get("stdout") or "")[:MAX_OUTPUT_CHARS] or None,
        stderr=(run.get("stderr") or "")[:MAX_OUTPUT_CHARS] or None,
        compile_output=((compile_step.get("stderr") or compile_step.get("output") or "")[:MAX_OUTPUT_CHARS] or None),
        runtime_ms=int(wall) if isinstance(wall, (int, float)) else None,
        memory_kb=int(run["memory"] / 1024) if isinstance(run.get("memory"), (int, float)) else None,
    )


class PistonExecutor:
    """POST {language, version, files, stdin} -> Piston's {compile?, run} result."""

    def __init__(self, *, url: str, api_key: str = "", timeout_s: float = 30.0, client: httpx.AsyncClient | None = None):
        self.url = execute_url(url)
        self.api_key = api_key
        self.timeout_s = timeout_s
        self.client = client or httpx.AsyncClient(timeout=timeout_s)
        self.model = "piston"

    async def execute(self, language: str, code: str, stdin: str = "") -> ExecutionResult:
        spec = LANGUAGES[language]
        body = {"language": spec.piston, "version": "*", "files": [{"name": spec.filename, "content": code}],
                "stdin": stdin}
        headers = {"X-API-Key": self.api_key} if self.api_key else {}
        response = await self.client.post(self.url, json=body, headers=headers)
        response.raise_for_status()
        return to_result(language, response.json())
