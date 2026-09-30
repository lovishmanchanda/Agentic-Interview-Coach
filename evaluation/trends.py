"""Eval results over time, per runner and prompt version (implementation_plan.md 6.3).

    cd backend && .venv/bin/python ../evaluation/trends.py            # every runner
    .venv/bin/python ../evaluation/trends.py --runner agent_eval       # one runner
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from history import load  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--runner")
    parser.add_argument("--last", type=int, default=10, help="runs to show per runner and prompt")
    args = parser.parse_args()
    rows = [r for r in load() if not args.runner or r["runner"] == args.runner]
    if not rows:
        print("No eval runs recorded yet (evaluation/results/history.jsonl).")
        return 0
    groups: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        groups.setdefault((r["runner"], r["prompt"]), []).append(r)
    for (runner, prompt), runs in sorted(groups.items()):
        print(f"\n{runner} · {prompt}")
        keys = sorted({k for r in runs for k, v in r["metrics"].items() if isinstance(v, (int, float))})
        print("  " + "at".ljust(21) + "".join(k[:14].rjust(15) for k in keys))
        for r in runs[-args.last:]:
            print("  " + r["at"][:19].ljust(21) + "".join(str(r["metrics"].get(k, "")).rjust(15) for k in keys))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
