"""Interviewer agent eval (implementation_plan.md 6.3: agent quality).

Replays fixed situations (evaluation/datasets/agent_scenarios.jsonl) through the real interviewer agent and checks
its decision. Run it on every interviewer prompt change, and to compare versions:

    cd backend
    .venv/bin/python ../evaluation/agent_eval/run_agent_eval.py                                   # the version in code
    .venv/bin/python ../evaluation/agent_eval/run_agent_eval.py --prompt interviewer/interviewer_v2
    .venv/bin/python ../evaluation/agent_eval/run_agent_eval.py --runs 3 --case hashmap_partial_covered_resize

Metrics (higher is better unless noted):
    valid          the agent produced an accepted decision (not a fallback to the rules engine)
    expected       the action is one the scenario accepts (e.g. no follow-up after a complete answer)
    redundant      follow-ups that ask about something the answer already covered (lower is better)
    neutral        serious-mode lead-ins free of praise or judgement
    no_score_leak  lead-ins and follow-ups never mention scores or tiers
Exit code 1 if valid < --min-valid or redundant > --max-redundant.
"""
import argparse
import asyncio
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "evaluation"))

from app.agents.interview_agent import DECISION_PROMPT, InterviewAgent  # noqa: E402
from app.core.prompts import PromptRegistry, set_registry, split_id  # noqa: E402
import history  # noqa: E402

DATASET = ROOT / "evaluation" / "datasets" / "agent_scenarios.jsonl"
PAUSE_S = 2.5  # between decisions, to stay under the provider's rate limit
RATE_LIMIT_WAIT_S = 30
RATE_LIMIT_RETRIES = 3
RESULTS_DIR = ROOT / "evaluation" / "results"
_JUDGEMENT = re.compile(r"\b(great|excellent|perfect|well done|good job|nice|awesome|fantastic|impressive|"
                        r"not quite|incorrect|wrong|that's right|correct answer|spot on|strong answer|good answer)\b", re.I)
_SCORE = re.compile(r"\b(\d+(\.\d+)?\s*/\s*10|score|tier|rating|adequate|weak answer)\b", re.I)


def load_cases(path: Path = DATASET) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def pin(prompt_id: str | None) -> str:
    """Pins the interviewer prompt version for this run (the registry would otherwise use the code default)."""
    chosen = prompt_id or DECISION_PROMPT
    name, version = split_id(chosen)
    registry = PromptRegistry(db=None)
    registry.config = {name: {version: 100}}
    set_registry(registry)
    return chosen


def check(case: dict, run) -> dict:
    expect, decision = case["expect"], run.decision
    row = {"id": case["id"], "outcome": run.outcome, "valid": decision is not None, "action": None,
           "expected": False, "redundant": None, "neutral": None, "no_score_leak": True, "text": ""}
    if decision is None:
        row["error"] = run.error
        # The provider failing (rate limit, outage) says nothing about the prompt: counted apart, not as invalid.
        row["provider_error"] = bool(run.error and "ServiceUnavailableError" in run.error)
        return row
    text = " ".join(filter(None, [decision.lead_in, decision.follow_up_question or ""]))
    row.update(action=decision.action, expected=decision.action in expect["actions"], text=text,
               no_score_leak=not _SCORE.search(text))
    if decision.action == "deliver_follow_up" and expect["covered"]:
        asked = (decision.follow_up_question or "").lower()
        row["redundant"] = any(term in asked for term in expect["covered"])
    if expect["neutral"]:
        row["neutral"] = not _JUDGEMENT.search(decision.lead_in or "")
    return row


async def run_cases(gateway, cases: list[dict], runs: int = 1, verbose: bool = False, pause_s: float = PAUSE_S) -> list[dict]:
    agent = InterviewAgent(gateway, runs=None)
    rows = []
    for case in cases:
        s = case["session"]
        session = {"session_id": f"eval-{case['id']}", "candidate_id": "eval", "candidate_name": "Ada",
                   "questions_asked": s["question_number"], "topics_covered": s["topics_covered"], "performance_vector": {},
                   "config": {"interview_type": s["interview_type"], "interview_mode": s["interview_mode"], "role": s["role"],
                              "experience_level": s["experience_level"], "question_count": s["question_count"]}}
        question = {"question_id": f"q-{case['id']}", **case["question"]}
        evaluation = {"overall_score": {"strong": 8.5, "adequate": 6.0, "weak": 2.5}[case["evaluation"]["performance_tier"]],
                      **case["evaluation"]}
        for _ in range(runs):
            for attempt in range(RATE_LIMIT_RETRIES + 1):
                started = time.perf_counter()
                run = await agent.decide(session=session, question=question, answer_text=case["answer_text"],
                                         evaluation=evaluation, allowed=set(case["allowed"]), recommended=case["recommended"])
                row = {**check(case, run), "latency_ms": int((time.perf_counter() - started) * 1000)}
                if not row.get("provider_error") or attempt == RATE_LIMIT_RETRIES:
                    break
                await asyncio.sleep(RATE_LIMIT_WAIT_S)  # the provider's per-minute token limit: wait it out
            rows.append(row)
            await asyncio.sleep(pause_s)
            if verbose:
                flags = [f"{k}={row[k]}" for k in ("expected", "redundant", "neutral", "no_score_leak") if row[k] is not None]
                print(f"{case['id']:34} {row['outcome']:21} {str(row['action']):18} {' '.join(flags)}")
                if row["text"]:
                    print(f"{'':34} \"{row['text'][:160]}\"")
                if row.get("error") or run.rejections:
                    print(f"{'':34} error: {row.get('error')} · rejections: {run.rejections}")
    return rows


def summarise(all_rows: list[dict]) -> dict:
    def rate(values):
        values = [v for v in values if v is not None]
        return round(sum(values) / len(values), 3) if values else None
    rows = [r for r in all_rows if not r.get("provider_error")]
    return {"n": len(rows), "provider_errors": len(all_rows) - len(rows), "valid": rate(r["valid"] for r in rows), "expected": rate(r["expected"] for r in rows),
            "redundant": rate(r["redundant"] for r in rows), "neutral": rate(r["neutral"] for r in rows),
            "no_score_leak": rate(r["no_score_leak"] for r in rows),
            "avg_latency_ms": round(sum(r["latency_ms"] for r in rows) / len(rows)) if rows else 0}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prompt", help="interviewer prompt id, e.g. interviewer/interviewer_v2")
    parser.add_argument("--case", action="append", default=[])
    parser.add_argument("--runs", type=int, default=2, help="runs per scenario (the model isn't deterministic)")
    parser.add_argument("--min-valid", type=float, default=0.9)
    parser.add_argument("--max-redundant", type=float, default=0.2)
    parser.add_argument("--pause", type=float, default=PAUSE_S,
                        help="seconds between decisions; ~45 on Groq's free tier (8k tokens/min, ~6k per decision)")
    parser.add_argument("--no-save", action="store_true")
    args = parser.parse_args()

    from app.config import get_settings
    from app.gateway import build_gateway

    settings = get_settings()
    if not settings.groq_api_key:
        print("GROQ_API_KEY is not set in .env; this eval uses the real interviewer agent.")
        return 2
    gateway = build_gateway(settings.model_copy(update={"use_fake_gateway": False, "session_token_budget": 10**9}))
    prompt = pin(args.prompt)
    cases = [c for c in load_cases() if not args.case or c["id"] in args.case]
    print(f"interviewer agent eval · {prompt} · {len(cases)} scenario(s) × {args.runs}")
    rows = asyncio.run(run_cases(gateway, cases, args.runs, verbose=True, pause_s=args.pause))
    summary = summarise(rows)
    ok = (summary["valid"] or 0) >= args.min_valid and (summary["redundant"] or 0) <= args.max_redundant
    print(f"\n{'PASS' if ok else 'FAIL'} · " + " · ".join(f"{k} {v}" for k, v in summary.items()))
    if not args.no_save:
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        from datetime import datetime, timezone
        out = RESULTS_DIR / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_agent.json"
        out.write_text(json.dumps({"prompt": prompt, "summary": summary, "rows": rows}, indent=2))
        history.append("agent_eval", prompt, summary)
        print(f"saved {out.relative_to(ROOT)}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
