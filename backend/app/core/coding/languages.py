"""The coding languages Piston runs for us (implementation_plan.md 4.6.3). Python is graded against the
problem's tests (test_harness.py); the others run as written until they get a harness."""
from dataclasses import dataclass
from typing import Literal

Language = Literal["python", "javascript", "java", "cpp", "c"]


@dataclass(frozen=True)
class LanguageSpec:
    key: str
    label: str
    piston: str        # Piston's language name
    filename: str      # Java needs Main.java for `public class Main`
    graded: bool


LANGUAGES: dict[str, LanguageSpec] = {
    "python": LanguageSpec("python", "Python", "python", "main.py", graded=True),
    "javascript": LanguageSpec("javascript", "JavaScript", "javascript", "main.js", graded=False),
    "java": LanguageSpec("java", "Java", "java", "Main.java", graded=False),
    "cpp": LanguageSpec("cpp", "C++", "c++", "main.cpp", graded=False),
    "c": LanguageSpec("c", "C", "c", "main.c", graded=False),
}


def public_languages() -> list[dict]:
    return [{"key": s.key, "label": s.label, "graded": s.graded} for s in LANGUAGES.values()]
