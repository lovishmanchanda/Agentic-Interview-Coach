"""Versioned prompt loading (architecture principle 7: prompts are versioned assets).

Prompts live in <repo>/prompts/<area>/<name>_v<N>.txt and are referenced by ID, e.g.
"evaluator/technical_v1". The ID is stored next to every LLM result it produced.
Placeholders use ${name} (string.Template), so braces in candidate text are harmless.
"""
from functools import lru_cache
from pathlib import Path
from string import Template

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts"


@lru_cache
def _load(prompt_id: str) -> Template:
    path = (PROMPTS_DIR / f"{prompt_id}.txt").resolve()
    if PROMPTS_DIR not in path.parents:
        raise ValueError(f"invalid prompt id: {prompt_id}")
    return Template(path.read_text(encoding="utf-8"))


def render_prompt(prompt_id: str, **values: str) -> str:
    """Fills ${placeholders}. Missing values raise KeyError, so a prompt never ships half-filled."""
    return _load(prompt_id).substitute(**values)
