from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, EmailStr, Field, field_validator

from app.utils.security import BCRYPT_MAX_BYTES

Role = Literal["user", "admin"]


class UserOut(BaseModel):
    """Public view of a user document. Never includes password_hash."""

    id: str = Field(validation_alias=AliasChoices("_id", "id"))
    email: EmailStr
    name: str
    role: Role = "user"
    is_active: bool = True
    created_at: datetime
    last_login: datetime | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=100)

    @field_validator("password")
    @classmethod
    def _bcrypt_limit(cls, value: str) -> str:
        if len(value.encode()) > BCRYPT_MAX_BYTES:
            raise ValueError(f"password must be at most {BCRYPT_MAX_BYTES} bytes")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # access token lifetime, seconds


class AuthResponse(BaseModel):
    user: UserOut
    tokens: TokenPair
