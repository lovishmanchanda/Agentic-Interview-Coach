"""Eval trend tracking (implementation_plan.md 6.3): every runner appends one summary line per run to
evaluation/results/history.jsonl (gitignored), and trends.py compares runs per prompt version."""
import json
from datetime import datetime, timezone
from pathlib import Path

HISTORY = Path(__file__).resolve().parent / "results" / "history.jsonl"


def append(runner: str, prompt: str, metrics: dict, **extra) -> None:
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    line = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "runner": runner, "prompt": prompt,
            "metrics": metrics, **extra}
    with HISTORY.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line) + "\n")


def load() -> list[dict]:
    if not HISTORY.exists():
        return []
    return [json.loads(line) for line in HISTORY.read_text(encoding="utf-8").splitlines() if line.strip()]
