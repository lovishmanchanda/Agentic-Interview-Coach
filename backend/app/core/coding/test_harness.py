"""Graded test harness (implementation_plan.md 4.6.4, plan-review C1). Python first.

The candidate's code is sent to Piston with a small runner appended that calls their function on every
test's input (hidden tests too) and prints each return value on a line tagged with a random marker. The
expected outputs never leave the server: the comparison happens here, so reading the program's own
source doesn't reveal them, and a stray print can't pass a test.

Other languages run as written (graded=False) until each gets a harness.
"""
import ast
import secrets

from app.core.coding.languages import LANGUAGES
from app.gateway import AIGateway
from app.gateway.types import CallContext, ExecutionResult, TestCaseResult

MAX_ACTUAL_CHARS = 300
MAX_TESTS = 50

_RUNNER = '''

# ── test runner added by the interview (not part of your answer) ──
def __aic_run_tests():
    import sys as _sys
    _sys.setrecursionlimit(10000)
    _node_cls = globals().get("ListNode")
    if _node_cls is None:
        class _node_cls:
            def __init__(self, val=0, next=None):
                self.val, self.next = val, next

    def _to_list_node(values):
        head = None
        for v in reversed(values or []):
            head = _node_cls(v, head)
        return head

    def _from_list_node(node):
        out, steps = [], 0
        while node is not None and steps < 100000:
            out.append(node.val)
            node, steps = node.next, steps + 1
        return out

    _fn = globals().get({entry!r})
    if not callable(_fn):
        print({marker!r} + repr((-1, "missing", {entry!r})), flush=True)
        return
    _arg_types = {arg_types!r}
    for _i, _src in {cases!r}:
        try:
            _args = list(eval("(" + _src + ",)", {{}}))
            _args = [_to_list_node(a) if i < len(_arg_types) and _arg_types[i] == "linked_list" else a
                     for i, a in enumerate(_args)]
            _out = _fn(*_args)
            if {return_type!r} == "linked_list":
                _out = _from_list_node(_out)
            print({marker!r} + repr((_i, "ok", repr(_out))), flush=True)
        except Exception as _e:
            print({marker!r} + repr((_i, "error", type(_e).__name__ + ": " + str(_e)[:200])), flush=True)


__aic_run_tests()
'''


def build_program(code: str, question: dict, tests: list[dict], marker: str) -> str:
    spec = question["coding"]
    cases = [(i, t["input"]) for i, t in enumerate(tests)]
    return code.rstrip() + "\n" + _RUNNER.format(entry=spec["entry_function"], marker=marker, cases=cases,
                                                 arg_types=list(spec.get("arg_types") or []),
                                                 return_type=spec.get("return_type") or "value")


def _normalize(value):
    if isinstance(value, (list, tuple)):
        return [_normalize(v) for v in value]
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    return value


def _parse(text: str):
    try:
        return True, _normalize(ast.literal_eval(text))
    except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
        return False, text.strip()


def outputs_match(actual: str, expected: str, compare: str = "exact") -> bool:
    ok_a, a = _parse(actual)
    ok_e, e = _parse(expected)
    if not (ok_a and ok_e):
        return str(a).replace(" ", "") == str(e).replace(" ", "")
    if compare == "unordered" and isinstance(a, list) and isinstance(e, list):
        try:
            return sorted(a) == sorted(e)
        except TypeError:
            return sorted(map(repr, a)) == sorted(map(repr, e))
    return a == e


def split_output(stdout: str, marker: str) -> tuple[dict[int, tuple[str, str]], str]:
    """Runner lines -> {test index: (kind, text)}; everything else is the candidate's own output."""
    results: dict[int, tuple[str, str]] = {}
    own: list[str] = []
    for line in (stdout or "").splitlines():
        if line.startswith(marker):
            try:
                index, kind, text = ast.literal_eval(line[len(marker):])
                results[int(index)] = (str(kind), str(text))
            except (ValueError, SyntaxError, TypeError):
                own.append(line)
        else:
            own.append(line)
    return results, "\n".join(own)


def grade(run: ExecutionResult, question: dict, tests: list[dict], marker: str) -> ExecutionResult:
    compare = question["coding"].get("compare", "exact")
    results, own_output = split_output(run.stdout or "", marker)
    if -1 in results:  # the entry function isn't defined
        name = question["coding"]["entry_function"]
        return run.model_copy(update={"status": "runtime_error", "stdout": own_output or None, "graded": True,
                                      "stderr": f"Define a function named {name}() so the tests can call it.",
                                      "total_tests": len(tests), "passed_tests": 0,
                                      "test_results": [TestCaseResult(passed=False, is_hidden=t.get("is_hidden", False),
                                                                      input=t["input"], expected=t["expected_output"],
                                                                      actual="Not run") for t in tests]})
    test_results, errored = [], False
    for i, test in enumerate(tests):
        kind, text = results.get(i, ("missing", ""))
        if kind == "ok":
            passed = outputs_match(text, test["expected_output"], compare)
            actual = text
        elif kind == "error":
            passed, actual, errored = False, f"Error: {text}", True
        else:  # the run stopped before this test (time limit, crash)
            passed, actual = False, "Not run"
        test_results.append(TestCaseResult(passed=passed, is_hidden=test.get("is_hidden", False), input=test["input"],
                                           expected=test["expected_output"], actual=actual[:MAX_ACTUAL_CHARS]))
    passed = sum(r.passed for r in test_results)
    if run.status in ("compile_error", "time_limit") or (run.status == "runtime_error" and not results):
        status = run.status
    elif errored:
        status = "runtime_error"
    else:
        status = "accepted" if passed == len(tests) else "wrong_answer"
    return run.model_copy(update={"status": status, "stdout": own_output or None, "graded": True,
                                  "passed_tests": passed, "total_tests": len(tests), "test_results": test_results})


async def run_code(gateway: AIGateway, question: dict, code: str, language: str, *, include_hidden: bool,
                   context: CallContext | None = None) -> ExecutionResult:
    """Run = the visible tests (include_hidden=False); Submit = every test. Ungraded languages run as written."""
    if not LANGUAGES[language].graded:
        run = await gateway.execute_code(language, code, context=context)
        return run.model_copy(update={"graded": False, "language": language})
    tests = [t for t in question.get("test_cases", []) if include_hidden or not t.get("is_hidden")][:MAX_TESTS]
    marker = f"__aic_{secrets.token_hex(8)}__"
    run = await gateway.execute_code(language, build_program(code, question, tests, marker), context=context)
    return grade(run, question, tests, marker).model_copy(update={"language": language})


def redact(result: ExecutionResult | dict, *, hide_hidden: bool) -> dict:
    """What the candidate sees. Serious mode: a hidden test shows only pass/fail, never its input or output."""
    data = result.model_dump() if isinstance(result, ExecutionResult) else dict(result)
    if hide_hidden:
        data["test_results"] = [{**t, "input": None, "expected": None, "actual": None} if t["is_hidden"] else t
                                for t in data.get("test_results", [])]
    return data
