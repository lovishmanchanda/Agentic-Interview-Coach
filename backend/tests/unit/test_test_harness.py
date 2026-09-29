"""The graded Python harness (4.6.4): every test incl. hidden, compared on the server, forgery-resistant."""
import asyncio
import json
from pathlib import Path

import pytest

from app.core.coding.sandbox_client import execute_url, to_result
from app.core.coding.test_harness import outputs_match, redact, run_code
from app.gateway import AIGateway, FakeAIGateway
from app.gateway.types import ExecutionResult
from tests.fakes import LocalPythonExecutor

SEED = Path(__file__).resolve().parents[3] / "data" / "seed" / "question_bank" / "coding.json"
PROBLEMS = {q["question_id"]: q for q in json.loads(SEED.read_text())}


def _run(code, problem="two_sum", *, include_hidden=True, language="python", gateway=None):
    gateway = gateway or AIGateway(session_token_budget=10, executor=LocalPythonExecutor(timeout_s=3))
    return asyncio.run(run_code(gateway, PROBLEMS[problem], code, language, include_hidden=include_hidden))


TWO_SUM_OK = """
def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [i, seen[target - x]]   # reversed order: accepted, the problem says any order
        seen[x] = i
"""


def test_a_correct_solution_passes_every_test_including_hidden():
    result = _run(TWO_SUM_OK)
    assert result.status == "accepted" and result.graded
    assert (result.passed_tests, result.total_tests) == (5, 5)
    assert sum(t.is_hidden for t in result.test_results) == 2


def test_run_uses_only_the_visible_tests():
    result = _run(TWO_SUM_OK, include_hidden=False)
    assert result.total_tests == 3 and not any(t.is_hidden for t in result.test_results)


def test_wrong_answers_and_exceptions_are_reported_per_test():
    result = _run("def two_sum(nums, target):\n    return [0, 1]\n")
    assert result.status == "wrong_answer" and 0 < result.passed_tests < 5
    failing = next(t for t in result.test_results if not t.passed)
    assert failing.actual == "[0, 1]" and failing.expected
    boom = _run("def two_sum(nums, target):\n    return nums[99]\n")
    assert boom.status == "runtime_error" and boom.test_results[0].actual.startswith("Error: IndexError")


def test_missing_function_syntax_error_and_infinite_loop():
    missing = _run("def twoSum(nums, target):\n    return []\n")
    assert missing.status == "runtime_error" and "two_sum()" in missing.stderr and missing.passed_tests == 0
    syntax = _run("def two_sum(nums, target)\n    return []\n")
    assert syntax.status == "runtime_error" and "SyntaxError" in syntax.stderr and syntax.passed_tests == 0
    loop = _run("def two_sum(nums, target):\n    while True:\n        pass\n")
    assert loop.status == "time_limit" and loop.passed_tests == 0


def test_printing_fake_results_or_deleting_asserts_cannot_pass():
    forged = _run("""
import sys
for i in range(5):
    print("__aic_0000000000000000__" + repr((i, "ok", "[0, 1]")))
def two_sum(nums, target):
    print("all tests passed")
    return None
""")
    assert forged.passed_tests == 0 and forged.status == "wrong_answer"
    assert "all tests passed" in forged.stdout  # the candidate's own prints are kept, separately


def test_expected_outputs_never_reach_the_sandbox():
    executor = LocalPythonExecutor()
    _run(TWO_SUM_OK, gateway=AIGateway(session_token_budget=10, executor=executor))
    program = executor.programs[0]
    assert "[-3,4,3,90], 0" in program  # inputs yes
    assert "[0, 2]" not in program and "[2, 3]" not in program  # hidden expected outputs no


def test_linked_lists_are_built_and_read_back():
    ok = _run("""
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def reverse_list(head):
    prev = None
    while head:
        head.next, prev, head = prev, head, head.next
    return prev
""", problem="reverse_linked_list")
    assert ok.status == "accepted" and ok.passed_tests == ok.total_tests == 4
    # Without their own ListNode class, the harness supplies one.
    merged = _run("""
def merge_two_lists(list1, list2):
    vals = []
    for node in (list1, list2):
        while node:
            vals.append(node.val); node = node.next
    head = None
    for v in sorted(vals, reverse=True):
        n = type(list1 or list2)(v) if (list1 or list2) else None
        if n is None:
            return None
        n.next = head; head = n
    return head
""", problem="merge_two_sorted_lists")
    assert merged.status == "accepted", merged.test_results


@pytest.mark.parametrize("actual, expected, compare, ok", [
    ("[1, 0]", "[0, 1]", "unordered", True), ("[1, 0]", "[0, 1]", "exact", False),
    ("(0, 1)", "[0, 1]", "exact", True), ("True", "True", "exact", True), ("'ab'", "'ab'", "exact", True),
    ("<object at 0x1>", "[0, 1]", "exact", False), ("[[1, 6], [8, 10]]", "[[1,6],[8,10]]", "exact", True),
])
def test_outputs_match(actual, expected, compare, ok):
    assert outputs_match(actual, expected, compare) is ok


def test_serious_mode_redacts_hidden_tests():
    shown = redact(_run(TWO_SUM_OK), hide_hidden=True)
    hidden = [t for t in shown["test_results"] if t["is_hidden"]]
    assert hidden and all(t["input"] is None and t["expected"] is None and t["actual"] is None for t in hidden)
    assert all(t["input"] for t in shown["test_results"] if not t["is_hidden"])


def test_ungraded_languages_run_as_written():
    gateway = FakeAIGateway()
    gateway.script("execute", ExecutionResult(status="accepted", stdout="[0, 1]\n"))
    result = _run("console.log([0,1])", language="javascript", gateway=gateway)
    assert result.graded is False and result.total_tests == 0 and result.stdout == "[0, 1]\n"
    assert gateway.calls_of("execute")[0]["code"] == "console.log([0,1])"  # no runner appended


def test_piston_responses_map_to_one_status():
    assert to_result("cpp", {"compile": {"code": 1, "stderr": "error: x"}, "run": {}}).status == "compile_error"
    assert to_result("python", {"run": {"code": None, "signal": "SIGKILL"}}).status == "time_limit"
    assert to_result("python", {"run": {"code": 1, "stderr": "Traceback"}}).status == "runtime_error"
    assert to_result("python", {"run": {"code": 0, "stdout": "hi\n", "wall_time": 41}}).runtime_ms == 41
    java = {"run": {"code": 1, "stderr": "Main.java.java:1: error: illegal start of expression"}}  # seen on the real VM
    assert to_result("java", java).status == "compile_error"
    assert to_result("java", {"run": {"code": 1, "stderr": "Exception in thread \"main\""}}).status == "runtime_error"
    assert execute_url("http://h:3000/") == "http://h:3000/execute"
    assert execute_url("http://h:2000/api/v2") == "http://h:2000/api/v2/execute"
    assert execute_url("http://h/execute") == "http://h/execute"


def test_without_piston_running_code_is_a_503():
    from app.utils.exceptions import ServiceUnavailableError
    with pytest.raises(ServiceUnavailableError) as exc:
        _run(TWO_SUM_OK, gateway=AIGateway(session_token_budget=10))
    assert exc.value.code == "code_runner_not_configured"


def test_coding_modules_import_first_in_a_fresh_process():
    """Regression: sandbox_client imported before app.gateway used to be a circular import."""
    import subprocess
    import sys
    for module in ("app.core.coding.sandbox_client", "app.core.coding.test_harness"):
        done = subprocess.run([sys.executable, "-c", f"import {module}"], capture_output=True, text=True,
                              cwd=Path(__file__).resolve().parents[2])
        assert done.returncode == 0, done.stderr
