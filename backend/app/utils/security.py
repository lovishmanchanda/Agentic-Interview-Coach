"""Password hashing (bcrypt) and JWT access/refresh tokens (PyJWT, HS256)."""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
import jwt

from app.config import Settings
from app.utils.exceptions import AuthError

TokenType = Literal["access", "refresh"]
BCRYPT_MAX_BYTES = 72  # bcrypt ignores/rejects input beyond 72 bytes


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_token(settings: Settings, user_id: str, token_type: TokenType, role: str = "user") -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at)."""
    jti = uuid.uuid4().hex
    lifetime = (timedelta(minutes=settings.access_token_minutes) if token_type == "access"
                else timedelta(days=settings.refresh_token_days))
    expires_at = _now() + lifetime
    payload = {
        "sub": user_id, "type": token_type, "role": role, "jti": jti,
        "iss": settings.jwt_issuer, "iat": _now(), "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256"), jti, expires_at


def decode_token(settings: Settings, token: str, expected_type: TokenType) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer,
                             options={"require": ["exp", "iat", "sub", "jti", "iss"]})
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Token has expired", code="token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid token", code="invalid_token") from exc
    if payload.get("type") != expected_type:
        raise AuthError("Wrong token type", code="invalid_token")
    return payload


def hash_token_id(jti: str) -> str:
    """Refresh tokens are stored only as a hash of their jti (rotation + reuse detection)."""
    return hashlib.sha256(jti.encode()).hexdigest()
