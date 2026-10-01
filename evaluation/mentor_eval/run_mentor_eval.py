"""Mentor eval (implementation_plan.md Phase 2): the rag_tool eval set, run through this app's stack.

Each case indexes its reports into a throwaway Chroma collection (embeddings via the AI Gateway), asks
ARIA the case's question exactly as the app does (`mentor_answer`: the grounded prompt, mentor/mentor_v2 by
default, and the general prompt when nothing in the reports matches), and prints the
answer next to the case's pass_criteria. Most criteria are judgment calls ("did it decline?"), so read
the answers; the structural checks are automatic and marked [auto]:

    citations   every [n] in the answer has a matching source
    dedupe      no session contributes more than DEFAULT_DEDUPE_PER_SESSION excerpts
    no-data     a case with no reports gets no sources and no citations (nothing invented from other data)

    cd backend
    .venv/bin/python ../evaluation/mentor_eval/run_mentor_eval.py
    .venv/bin/python ../evaluation/mentor_eval/run_mentor_eval.py --case prompt_injection --case zero_reports
    .venv/bin/python ../evaluation/mentor_eval/run_mentor_eval.py --prompt mentor/mentor_v1

Exit code 1 if an [auto] check fails. Results are saved to evaluation/results/ (gitignored).
"""
import argparse
import asyncio
import json
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anyio
import anyio.from_thread

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "evaluation"))

from app.core.mentor.mentor_agent import GENERAL_PROMPT_VERSION, MentorAgent, general_prompt_note, mentor_answer  # noqa: E402
from app.core.mentor.rag_tool import InterviewReport, MentorChatRequest, RagService  # noqa: E402
from app.core.mentor.rag_tool.service import DEFAULT_DEDUPE_PER_SESSION, classify_intent  # noqa: E402
from app.core.mentor.setup import GatewayEmbeddings  # noqa: E402
from app.core.prompts import render_prompt  # noqa: E402
from app.gateway.types import CallContext  # noqa: E402

DATASET = ROOT / "evaluation" / "datasets" / "mentor_eval.jsonl"
RESULTS_DIR = ROOT / "evaluation" / "results"
DEFAULT_PROMPT = "mentor/mentor_v2"
_CITATION = re.compile(r"\[(\d+)\]")


def load_cases(path: Path = DATASET) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def build_report(entry: dict) -> InterviewReport:
    entry = dict(entry)
    days_ago = entry.pop("days_ago")
    entry["created_at"] = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return InterviewReport.model_validate(entry)


def auto_checks(case: dict, answer: str, sources: list[dict]) -> dict[str, bool]:
    cited = {int(n) for n in _CITATION.findall(answer)}
    per_session: dict[str, int] = {}
    for s in sources:
        per_session[s["session_id"]] = per_session.get(s["session_id"], 0) + 1
    checks = {"citations": all(1 <= n <= len(sources) for n in cited),
              "dedupe": all(n <= DEFAULT_DEDUPE_PER_SESSION for n in per_session.values())}
    if not case["setup"]:
        checks["no-data"] = not sources and not _CITATION.search(answer)
    return checks


async def run_case(gateway, case: dict, prompt_id: str, workdir: str) -> dict:
    rag = RagService(GatewayEmbeddings(gateway), workdir, f"eval_{case['id']}")
    reports = [build_report(entry) for entry in case["setup"]]
    await anyio.to_thread.run_sync(lambda: [rag.index_report(r) for r in reports])

    request = MentorChatRequest.model_validate(case["request"])
    system_prompt = render_prompt(prompt_id, practice_note=MentorAgent._practice_note(None))
    general_prompt = render_prompt(GENERAL_PROMPT_VERSION, report_note=general_prompt_note(len(reports)))
    context = CallContext(candidate_id=request.user_id, prompt_version=prompt_id)
    general_context = CallContext(candidate_id=request.user_id, prompt_version=GENERAL_PROMPT_VERSION)

    def invoke_llm(prompt: str) -> str:
        return anyio.from_thread.run(lambda: gateway.generate(prompt, context=context, temperature=0))

    def invoke_general(prompt: str) -> str:
        return anyio.from_thread.run(lambda: gateway.generate(prompt, context=general_context, temperature=0))

    response = await anyio.to_thread.run_sync(mentor_answer, rag, request, invoke_llm, system_prompt, general_prompt,
                                              invoke_general)
    checks = auto_checks(case, response.answer, response.sources)
    return {"id": case["id"], "message": request.message, "intent": classify_intent(request.message, bool(request.history)),
            "answer": response.answer, "sources": response.sources, "checks": checks,
            "pass_criteria": case["pass_criteria"]}


async def run_cases(gateway, cases: list[dict], prompt_id: str = DEFAULT_PROMPT, verbose: bool = False) -> list[dict]:
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for case in cases:
            row = await run_case(gateway, case, prompt_id, tmp)
            rows.append(row)
            if verbose:
                print("=" * 100)
                print(f"CASE {row['id']}  ·  intent={row['intent']}\nQ: {row['message']}\n\n{row['answer']}\n")
                print("sources: " + (", ".join(f"[{s['citation']}] {s['session_id']} {s['chunk_type']}" for s in row["sources"]) or "none"))
                print("[auto] " + "  ".join(f"{k}={'PASS' if v else 'FAIL'}" for k, v in row["checks"].items()))
                print(f"criteria: {row['pass_criteria']}")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--case", action="append", default=[], help="only these case ids")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT, help="prompt id, e.g. mentor/mentor_v2")
    parser.add_argument("--no-save", action="store_true")
    args = parser.parse_args()

    from app.config import get_settings
    from app.gateway import build_gateway, gateway_kind

    settings = get_settings()
    if not (settings.groq_api_key and settings.hf_token):
        print("GROQ_API_KEY and HF_TOKEN must be set in .env; this eval uses the real Mentor stack.")
        return 2
    gateway = build_gateway(settings.model_copy(update={"use_fake_gateway": False}))
    print(f"gateway: {gateway_kind(gateway)} · model: {settings.groq_interview_model} · prompt: {args.prompt}")

    cases = load_cases()
    if args.case:
        cases = [c for c in cases if c["id"] in set(args.case)]
    rows = asyncio.run(run_cases(gateway, cases, args.prompt, verbose=True))
    failed = [r["id"] for r in rows if not all(r["checks"].values())]
    print("=" * 100)
    print(f"{len(rows)} case(s). [auto] checks: {'all passed' if not failed else 'FAILED in ' + ', '.join(failed)}. "
          "Read each answer against its criteria.")

    if not args.no_save:
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        out = RESULTS_DIR / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_mentor.json"
        out.write_text(json.dumps({"prompt": args.prompt, "rows": rows}, indent=2, ensure_ascii=False))
        print(f"saved {out.relative_to(ROOT)}")
        import history
        checks = [v for r in rows for v in r["checks"].values()]
        history.append("mentor_eval", args.prompt, {"n": len(rows), "auto_checks_passed": round(sum(checks) / len(checks), 3)
                                                    if checks else None, "failed_cases": len(failed)})
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
