"""Versioned prompt loading (architecture principle 7: prompts are versioned assets) and the prompt registry (6.4).

Prompts live in <repo>/prompts/<area>/<name>_v<N>.txt and are referenced by ID, e.g. "evaluator/technical_v1".
The ID is stored next to every LLM result it produced. Placeholders use ${name} (string.Template), so braces in
candidate text are harmless.

Code names a default version ("evaluator/technical_v1"). The registry (collection prompt_settings, edited through
the admin API) can switch a prompt to another version, or split traffic between versions (A/B), without a code
deploy; rolling back is setting the weights back. A split is stable per session (or candidate), so one
interview never mixes versions. `render_for()` picks the version, records it on the call's context, and renders.
"""
import hashlib
import logging
import re
from functools import lru_cache
from pathlib import Path
from string import Template

from app.db.repositories.interview_repo import utcnow

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts"
_ID = re.compile(r"^(?P<name>[a-z_]+/[a-z0-9_]+?)_v(?P<n>\d+)$")


@lru_cache
def _load(prompt_id: str) -> Template:
    path = (PROMPTS_DIR / f"{prompt_id}.txt").resolve()
    if PROMPTS_DIR not in path.parents:
        raise ValueError(f"invalid prompt id: {prompt_id}")
    return Template(path.read_text(encoding="utf-8"))


def render_prompt(prompt_id: str, **values: str) -> str:
    """Fills ${placeholders}. Missing values raise KeyError, so a prompt never ships half-filled."""
    return _load(prompt_id).substitute(**values)


def split_id(prompt_id: str) -> tuple[str, str]:
    """"evaluator/technical_v2" -> ("evaluator/technical", "v2")."""
    match = _ID.match(prompt_id)
    if not match:
        raise ValueError(f"not a versioned prompt id: {prompt_id}")
    return match.group("name"), f"v{match.group('n')}"


def available_versions(name: str) -> list[str]:
    """The versions on disk for a prompt name, oldest first: ["v1", "v2"]."""
    area, base = name.split("/", 1)
    found = []
    for path in (PROMPTS_DIR / area).glob(f"{base}_v*.txt"):
        match = _ID.match(f"{area}/{path.stem}")
        if match and match.group("name") == name:
            found.append(int(match.group("n")))
    return [f"v{n}" for n in sorted(found)]


def all_prompt_names() -> list[str]:
    names = set()
    for path in PROMPTS_DIR.glob("*/*_v*.txt"):
        match = _ID.match(f"{path.parent.name}/{path.stem}")
        if match:
            names.add(match.group("name"))
    return sorted(names)


def _bucket(name: str, key: str) -> int:
    return int(hashlib.sha256(f"{name}:{key}".encode()).hexdigest(), 16) % 100


class PromptRegistry:
    """Active versions per prompt name, from prompt_settings: {"name", "weights": {"v1": 90, "v2": 10}, ...}.
    Kept in memory and refreshed periodically (and right after an admin change on this worker)."""

    def __init__(self, db):
        self.db = db
        self.config: dict[str, dict[str, int]] = {}

    async def refresh(self) -> None:
        try:
            docs = await self.db["prompt_settings"].find({}, {"_id": 0, "name": 1, "weights": 1}).to_list(length=500)
        except Exception:  # noqa: BLE001 -- keep the last known config; defaults apply if there is none
            log.warning("prompt_settings_refresh_failed", exc_info=True)
            return
        self.config = {d["name"]: d["weights"] for d in docs if d.get("weights")}

    def choose(self, default_id: str, key: str | None) -> str:
        name, default_version = split_id(default_id)
        weights = self.config.get(name)
        if not weights:
            return default_id
        live = [(v, w) for v, w in sorted(weights.items(), key=lambda kv: int(kv[0][1:])) if w > 0]
        if not live:
            return default_id
        point, total = _bucket(name, key or "anonymous"), 0
        for version, weight in live:
            total += weight
            if point < total:
                return f"{name}_{version}"
        return f"{name}_{live[-1][0]}"

    async def set(self, name: str, weights: dict[str, int], *, by: str) -> dict:
        """Validates and stores new weights (the previous ones go into history, for rollback)."""
        versions = available_versions(name)
        if not versions:
            raise ValueError(f"unknown prompt: {name}")
        unknown = [v for v in weights if v not in versions]
        if unknown:
            raise ValueError(f"no such version(s) of {name}: {', '.join(unknown)} (available: {', '.join(versions)})")
        if any(not isinstance(w, int) or w < 0 for w in weights.values()) or sum(weights.values()) != 100:
            raise ValueError("weights must be whole numbers that add up to 100")
        current = await self.db["prompt_settings"].find_one({"name": name}, {"_id": 0}) or {}
        history = ([{"weights": current["weights"], "by": current.get("updated_by"), "at": current.get("updated_at")}]
                   if current.get("weights") else [])
        await self.db["prompt_settings"].update_one(
            {"name": name},
            {"$set": {"weights": weights, "updated_by": by, "updated_at": utcnow()},
             "$push": {"history": {"$each": history, "$slice": -20}}},
            upsert=True)
        await self.refresh()
        log.info("prompt_weights_changed", extra={"fields": {"prompt": name, "weights": weights, "by": by}})
        return {"name": name, "weights": weights}

    async def reset(self, name: str, *, by: str) -> None:
        """Back to the version named in code."""
        await self.db["prompt_settings"].update_one({"name": name}, {"$set": {"weights": {}, "updated_by": by,
                                                                             "updated_at": utcnow()}}, upsert=True)
        await self.refresh()


_registry: PromptRegistry | None = None


def set_registry(registry: PromptRegistry | None) -> None:
    global _registry
    _registry = registry


def choose_prompt(default_id: str, context=None) -> str:
    key = (getattr(context, "session_id", None) or getattr(context, "candidate_id", None)) if context else None
    prompt_id = _registry.choose(default_id, key) if _registry else default_id
    if context is not None:
        context.prompt_version = prompt_id
    return prompt_id


def render_for(context, default_id: str, **values: str) -> str:
    """Picks the active version of a prompt for this call (A/B stable per session), records it on the context
    (so it's stored with the result and in llm_calls), and renders it."""
    return render_prompt(choose_prompt(default_id, context), **values)
