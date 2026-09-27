"""candidate_profiles (architecture.md §5.2). The profile is the spine every agent reads from."""
from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, Field

ExperienceLevel = Literal["fresher", "1-2", "3-5", "senior"]
IOMode = Literal["text", "voice"]
Difficulty = Literal["easy", "medium", "hard", "adaptive"]

PREPARATION_TOPICS = ("dsa", "system_design", "python", "machine_learning", "dbms", "os", "oops", "behavioral")


class Personal(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    education: str = Field(default="", max_length=200)
    experience_level: ExperienceLevel = "fresher"


class Target(BaseModel):
    role: str = Field(min_length=1, max_length=100)
    company: str | None = Field(default=None, max_length=100)
    job_description: str | None = Field(default=None, max_length=50_000)


class Preferences(BaseModel):
    input_mode: IOMode = "text"
    output_mode: IOMode = "text"
    preferred_difficulty: Difficulty = "adaptive"


class ProfileCreate(BaseModel):
    personal: Personal
    target: Target
    skills: list[str] = Field(default_factory=list, max_length=50)
    preferences: Preferences = Field(default_factory=Preferences)


class ProfileUpdate(BaseModel):
    """PUT /profiles/me: each provided section replaces the stored one; omitted sections stay."""
    personal: Personal | None = None
    target: Target | None = None
    skills: list[str] | None = Field(default=None, max_length=50)
    preferences: Preferences | None = None


class ProfileOut(ProfileCreate):
    id: str = Field(validation_alias=AliasChoices("_id", "id"))
    candidate_id: str
    preparation_scores: dict[str, float]
    created_at: datetime
    updated_at: datetime
