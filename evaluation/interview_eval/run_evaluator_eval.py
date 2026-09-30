"""Evaluator accuracy check (implementation_plan.md 1.7).

Re-scores the hand-scored answers in evaluation/datasets/evaluator_golden.jsonl with the live evaluator
(Groq, via the AI Gateway) and reports how far it is from the human scores. Run it on every evaluator
prompt change: a change that makes these numbers worse doesn't ship.

    cd backend
    .venv/bin/python ../evaluation/interview_eval/run_evaluator_eval.py                 # both evaluators
    .venv/bin/python ../evaluation/interview_eval/run_evaluator_eval.py --evaluator behavioral
    .venv/bin/python ../evaluation/interview_eval/run_evaluator_eval.py --prompt technical=evaluator/technical_v2
    .venv/bin/python ../evaluation/interview_eval/run_evaluator_eval.py --case hash_good

Metrics, per evaluator:
    MAE            mean |model - human| on the 0-10 overall score (lower is better)
    bias           mean (model - human): positive means the model is generous
    spearman       rank correlation with the human scores across all cases (1.0 = same order)
    pairwise       for two answers to the same question, how often the model orders them like the human
    tier           how often the performance tier (weak / adequate / strong) matches

Exit code 1 if an evaluator misses --max-mae or --min-spearman, so it can gate a prompt change.
Results are saved to evaluation/results/ (gitignored) for comparing runs.
"""
import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "evaluation"))

from app.core.evaluation.answer_evaluator import EVALUATORS, Evaluator, evaluate_answer, performance_tier  # noqa: E402
from app.gateway.types import CallContext  # noqa: E402
from app.utils.exceptions import AppError  # noqa: E402

DATASET = ROOT / "evaluation" / "datasets" / "evaluator_golden.jsonl"
RESULTS_DIR = ROOT / "evaluation" / "results"
DEFAULT_PROFILE = {"target": {"role": "Software Engineer"}, "personal": {"experience_level": "1-2"}}
RATE_LIMIT_WAIT_S = 20
RATE_LIMIT_RETRIES = 5


# ── data ──────────────────────────────────────────────────────────────────────
def load_cases(path: Path = DATASET) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_questions(seed_dir: Path) -> dict[str, dict]:
    questions = {}
    for path in sorted((seed_dir / "question_bank").glob("*.json")):
        for q in json.loads(path.read_text(encoding="utf-8")):
            questions[q["question_id"]] = q
    return questions


def validate_cases(cases: list[dict], questions: dict[str, dict]) -> None:
    ids = [c["id"] for c in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate case ids")
    for c in cases:
        if c["question_id"] not in questions:
            raise ValueError(f"{c['id']}: unknown question {c['question_id']}")
        if not 0 <= c["expected_score"] <= 10:
            raise ValueError(f"{c['id']}: expected_score out of range")
        if questions[c["question_id"]]["type"] not in EVALUATORS:
            raise ValueError(f"{c['id']}: no evaluator for type {questions[c['question_id']]['type']}")


# ── metrics (pure) ────────────────────────────────────────────────────────────
def _ranks(values: list[float]) -> list[float]:
    """1-based ranks; ties share their average rank."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 2:
        return float("nan")
    rx, ry = _ranks(xs), _ranks(ys)
    mx, my = mean(rx), mean(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    sx = sum((a - mx) ** 2 for a in rx) ** 0.5
    sy = sum((b - my) ** 2 for b in ry) ** 0.5
    return cov / (sx * sy) if sx and sy else float("nan")


def pairwise_agreement(rows: list[dict]) -> float:
    """Within each question, over pairs the human scored differently: 1 if the model orders them the same
    way, 0.5 if the model ties them, 0 if reversed."""
    total, agree = 0, 0.0
    by_question: dict[str, list[dict]] = {}
    for r in rows:
        by_question.setdefault(r["question_id"], []).append(r)
    for group in by_question.values():
        for a, b in combinations(group, 2):
            human = a["expected_score"] - b["expected_score"]
            if human == 0:
                continue
            model = a["model_score"] - b["model_score"]
            total += 1
            agree += 0.5 if model == 0 else float((human > 0) == (model > 0))
    return agree / total if total else float("nan")


def summarise(rows: list[dict]) -> dict:
    errors = [r["model_score"] - r["expected_score"] for r in rows]
    worst = sorted(rows, key=lambda r: abs(r["model_score"] - r["expected_score"]), reverse=True)[:5]
    return {
        "n": len(rows),
        "mae": round(mean(abs(e) for e in errors), 2),
        "bias": round(mean(errors), 2),
        "spearman": round(spearman([r["expected_score"] for r in rows], [r["model_score"] for r in rows]), 3),
        "pairwise": round(pairwise_agreement(rows), 3),
        "tier": round(mean(performance_tier(r["model_score"]) == performance_tier(r["expected_score"]) for r in rows), 3),
        "worst": [{"id": r["id"], "expected": r["expected_score"], "model": r["model_score"]} for r in worst],
    }


# ── running ───────────────────────────────────────────────────────────────────
@dataclass
class Run:
    rows: dict[str, list[dict]] = field(default_factory=dict)   # evaluator type -> scored cases
    failures: list[dict] = field(default_factory=list)


async def _score_one(gateway, case: dict, question: dict, evaluator: Evaluator) -> float:
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        try:
            result = await evaluate_answer(gateway, question=question, answer_text=case["answer"],
                                           profile=case.get("profile", DEFAULT_PROFILE),
                                           context=CallContext(session_id=f"eval:{case['id']}"), evaluator=evaluator)
            return float(result["overall_score"])
        except AppError as exc:
            if exc.code != "llm_rate_limited" or attempt == RATE_LIMIT_RETRIES:
                raise
            print(f"  rate limited, waiting {RATE_LIMIT_WAIT_S}s…", flush=True)
            await asyncio.sleep(RATE_LIMIT_WAIT_S)
    raise AssertionError("unreachable")


async def run_cases(gateway, cases: list[dict], questions: dict[str, dict], evaluators: dict[str, Evaluator],
                    *, verbose: bool = False) -> Run:
    run = Run()
    for case in cases:
        question = questions[case["question_id"]]
        evaluator = evaluators.get(question["type"])
        if evaluator is None:
            continue
        try:
            score = await _score_one(gateway, case, question, evaluator)
        except AppError as exc:
            run.failures.append({"id": case["id"], "code": exc.code, "message": exc.message})
            if verbose:
                print(f"  {case['id']:<20} FAILED {exc.code}", flush=True)
            continue
        row = {**{k: case[k] for k in ("id", "question_id", "expected_score")}, "model_score": score}
        run.rows.setdefault(evaluator.type, []).append(row)
        if verbose:
            print(f"  {case['id']:<20} human {case['expected_score']:>4}  model {score:>4}  "
                  f"Δ {score - case['expected_score']:+.1f}", flush=True)
    return run


def _parse_prompt_overrides(values: list[str]) -> dict[str, str]:
    overrides = {}
    for value in values:
        kind, _, prompt_id = value.partition("=")
        if kind not in EVALUATORS or not prompt_id:
            raise SystemExit(f"--prompt expects technical=<id> or behavioral=<id>, got {value!r}")
        overrides[kind] = prompt_id
    return overrides


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--evaluator", choices=["all", *EVALUATORS], default="all")
    parser.add_argument("--prompt", action="append", default=[], help="kind=prompt_id, e.g. technical=evaluator/technical_v2")
    parser.add_argument("--case", action="append", default=[], help="only these case ids")
    parser.add_argument("--max-mae", type=float, default=1.5)
    parser.add_argument("--min-spearman", type=float, default=0.8)
    parser.add_argument("--no-save", action="store_true")
    args = parser.parse_args()
    # Gateway warnings (e.g. a structured-output retry) as readable lines, not bare messages.
    logging.basicConfig(level=logging.WARNING, format="  [%(levelname)s] %(name)s: %(message)s")

    from app.config import get_settings
    from app.gateway import build_gateway, gateway_kind

    settings = get_settings()
    if not settings.groq_api_key:
        print("GROQ_API_KEY is not set in .env; this check needs the real evaluator.")
        return 2
    gateway = build_gateway(settings.model_copy(update={"use_fake_gateway": False, "session_token_budget": 10**9}))
    print(f"gateway: {gateway_kind(gateway)} · fast model: {settings.groq_fast_model}")

    questions = load_questions(Path(settings.seed_dir))
    cases = load_cases()
    validate_cases(cases, questions)
    if args.case:
        cases = [c for c in cases if c["id"] in set(args.case)]
    overrides = _parse_prompt_overrides(args.prompt)
    evaluators = {kind: Evaluator(ev.type, overrides.get(kind, ev.prompt_id), ev.schema)
                  for kind, ev in EVALUATORS.items() if args.evaluator in ("all", kind)}

    started = time.perf_counter()
    run = asyncio.run(run_cases(gateway, cases, questions, evaluators, verbose=True))
    print(f"\n{len(cases)} cases in {time.perf_counter() - started:.0f}s")

    ok = True
    summaries = {}
    for kind, rows in run.rows.items():
        s = summaries[kind] = {"prompt": evaluators[kind].prompt_id, **summarise(rows)}
        passed = s["mae"] <= args.max_mae and s["spearman"] >= args.min_spearman
        ok &= passed
        print(f"\n{kind} ({s['prompt']}) — {'PASS' if passed else 'FAIL'}")
        print(f"  MAE {s['mae']}  bias {s['bias']:+}  spearman {s['spearman']}  pairwise {s['pairwise']}  tier {s['tier']}  (n={s['n']})")
        print("  largest gaps: " + ", ".join(f"{w['id']} {w['expected']}→{w['model']}" for w in s["worst"]))
    if run.failures:
        ok = False
        print(f"\n{len(run.failures)} case(s) failed to evaluate: " + ", ".join(f["id"] for f in run.failures))

    if not args.no_save:
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out = RESULTS_DIR / f"{stamp}_{args.evaluator}.json"
        out.write_text(json.dumps({"summaries": summaries, "rows": run.rows, "failures": run.failures,
                                   "model": settings.groq_fast_model}, indent=2))
        print(f"\nsaved {out.relative_to(ROOT)}")
        import history
        for s in summaries.values():
            history.append("evaluator_eval", s["prompt"], {k: v for k, v in s.items() if isinstance(v, (int, float))})
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
