"""Question quality eval (implementation_plan.md 6.3): relevance, difficulty alignment, role alignment, uniqueness.

The real question generator (the LLM path the question engine uses on a bank miss) writes questions over a grid
of role x topic x difficulty; a separate LLM judge (evaluation/question_eval/judge_v1.txt, default tier) scores
each one, and near-duplicates are counted.

    cd backend
    .venv/bin/python ../evaluation/question_eval/run_question_eval.py
    .venv/bin/python ../evaluation/question_eval/run_question_eval.py --prompt interviewer/question_generation_v2 --per-cell 2

Exit code 1 if the average of any score is below --min-avg (default 3.5) or the duplicate rate is above 10%.
"""
import argparse
import asyncio
import itertools
import json
import re
import sys
from pathlib import Path
from string import Template

from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "evaluation"))

from app.core.interview.question_engine import GENERATION_PROMPT, QuestionEngine  # noqa: E402
from app.core.prompts import PromptRegistry, set_registry, split_id  # noqa: E402
from app.gateway.types import CallContext  # noqa: E402
import history  # noqa: E402

JUDGE = Template((Path(__file__).parent / "judge_v1.txt").read_text(encoding="utf-8"))
RESULTS_DIR = ROOT / "evaluation" / "results"
GRID = [  # (interview_type, role label, role key, topics)
    ("technical", "Software Engineer", "software_engineer", ["dsa", "system_design", "dbms"]),
    ("technical", "Backend Engineer", "backend", ["api_design", "networking"]),
    ("technical", "ML Engineer", "ml_engineer", ["machine_learning", "statistics"]),
    ("behavioral", "Software Engineer", "software_engineer", ["ownership", "conflict"]),
]
DIFFICULTIES = ["easy", "hard"]
SCORES = ("relevance", "difficulty_match", "role_fit", "clarity")
DUPLICATE = 0.6  # word-set Jaccard above this counts as a near-duplicate


class Judgement(BaseModel):
    relevance: int = Field(ge=1, le=5)
    difficulty_match: int = Field(ge=1, le=5)
    role_fit: int = Field(ge=1, le=5)
    clarity: int = Field(ge=1, le=5)
    issues: list[str] = Field(default_factory=list, max_length=6)


class _NoHistory:
    async def session_questions(self, _):
        return []


def words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower())) - {"the", "a", "an", "of", "to", "and", "in", "you", "how", "what", "is"}


def jaccard(a: str, b: str) -> float:
    wa, wb = words(a), words(b)
    return len(wa & wb) / len(wa | wb) if wa | wb else 0.0


def cells():
    for (itype, role, key, topics), difficulty in itertools.product(GRID, DIFFICULTIES):
        for topic in topics:
            yield itype, role, key, topic, difficulty


async def run(gateway, per_cell: int = 1, verbose: bool = False) -> list[dict]:
    engine = QuestionEngine(bank=None, repo=_NoHistory(), gateway=gateway)
    rows = []
    for i, (itype, role, key, topic, difficulty) in enumerate(cells()):
        for n in range(per_cell):
            session = {"session_id": f"qeval-{i}-{n}", "candidate_id": "eval", "questions_asked": 0, "topics_covered": [],
                       "focus_topics": [topic], "target_difficulty": difficulty, "last_decision": None,
                       "config": {"interview_type": itype, "role": role, "role_key": key, "experience_level": "1-2"}}
            try:
                question = await engine._generate(session, context=CallContext(session_id=session["session_id"]))
                verdict = await gateway.generate_structured(
                    JUDGE.substitute(interview_type=itype, role=role, topic=topic, difficulty=difficulty,
                                     question_text=question["question_text"]),
                    Judgement, context=CallContext(prompt_version="eval/question_judge_v1"))
            except Exception as exc:  # noqa: BLE001 -- one failed cell shouldn't sink the run
                rows.append({"cell": f"{itype}/{key}/{topic}/{difficulty}", "error": f"{type(exc).__name__}: {exc}"[:200]})
                continue
            row = {"cell": f"{itype}/{key}/{topic}/{difficulty}", "topic": topic, "question": question["question_text"],
                   "prompt": question.get("prompt_version") or "", **verdict}
            rows.append(row)
            if verbose:
                print(f"{row['cell']:48} " + " ".join(f"{k[:4]}={row[k]}" for k in SCORES) + f"  {row['question'][:90]}")
            await asyncio.sleep(1.5)  # stay under the provider's per-minute token limit
    return rows


def summarise(rows: list[dict]) -> dict:
    ok = [r for r in rows if "error" not in r]
    summary = {"n": len(ok), "errors": len(rows) - len(ok)}
    for key in SCORES:
        values = [r[key] for r in ok]
        summary[f"avg_{key}"] = round(sum(values) / len(values), 2) if values else None
    pairs = [(a, b) for a, b in itertools.combinations(ok, 2) if a["topic"] == b["topic"]]
    duplicates = sum(jaccard(a["question"], b["question"]) > DUPLICATE for a, b in pairs)
    summary["duplicate_rate"] = round(duplicates / len(pairs), 3) if pairs else 0.0
    summary["good_share"] = round(sum(all(r[k] >= 4 for k in SCORES) for r in ok) / len(ok), 3) if ok else None
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prompt", help="question generation prompt id to pin, e.g. interviewer/question_generation_v2")
    parser.add_argument("--per-cell", type=int, default=1)
    parser.add_argument("--min-avg", type=float, default=3.5)
    parser.add_argument("--no-save", action="store_true")
    args = parser.parse_args()

    from app.config import get_settings
    from app.gateway import build_gateway

    settings = get_settings()
    if not settings.groq_api_key:
        print("GROQ_API_KEY is not set in .env; this eval uses the real generator and judge.")
        return 2
    gateway = build_gateway(settings.model_copy(update={"use_fake_gateway": False, "session_token_budget": 10**9}))
    prompt = args.prompt or GENERATION_PROMPT
    if args.prompt:
        name, version = split_id(args.prompt)
        registry = PromptRegistry(db=None)
        registry.config = {name: {version: 100}}
        set_registry(registry)
    rows = asyncio.run(run(gateway, args.per_cell, verbose=True))
    summary = summarise(rows)
    ok = summary["n"] > 0 and all((summary[f"avg_{k}"] or 0) >= args.min_avg for k in SCORES) and summary["duplicate_rate"] <= 0.1
    print(f"\n{'PASS' if ok else 'FAIL'} · " + " · ".join(f"{k} {v}" for k, v in summary.items()))
    if not args.no_save:
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        from datetime import datetime, timezone
        out = RESULTS_DIR / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_questions.json"
        out.write_text(json.dumps({"prompt": prompt, "summary": summary, "rows": rows}, indent=2))
        history.append("question_eval", prompt, summary)
        print(f"saved {out.relative_to(ROOT)}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
