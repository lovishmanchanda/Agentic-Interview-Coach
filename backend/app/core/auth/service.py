"""Register / login / refresh / logout (architecture.md §12.1).

Refresh tokens rotate: each one is single-use. Presenting a refresh token that was already used
means it was probably stolen, so every session for that user is revoked.
"""
import logging

from app.config import Settings
from app.db.models.user import TokenPair, UserOut
from app.db.repositories.user_repo import RefreshTokenRepository, UserRepository
from app.utils.exceptions import AuthError
from app.utils.logging import log_event
from app.utils.security import create_token, decode_token, hash_password, hash_token_id, verify_password

log = logging.getLogger(__name__)

# Verified against when the email doesn't exist, so response time doesn't reveal which emails are registered.
_DUMMY_HASH = hash_password("timing-equaliser-not-a-real-password")


class AuthService:
    def __init__(self, settings: Settings, users: UserRepository, tokens: RefreshTokenRepository):
        self.settings = settings
        self.users = users
        self.tokens = tokens

    async def register(self, *, email: str, password: str, name: str) -> tuple[dict, TokenPair]:
        user = await self.users.create(email=email, name=name, password_hash=hash_password(password))
        log_event(log, "user_registered", user_id=user["_id"])
        return user, await self._issue(user)

    async def login(self, *, email: str, password: str) -> tuple[dict, TokenPair]:
        user = await self.users.get_by_email(email)
        if user is None:
            verify_password(password, _DUMMY_HASH)
            raise AuthError("Invalid email or password", code="invalid_credentials")
        if not verify_password(password, user["password_hash"]) or not user.get("is_active", True):
            raise AuthError("Invalid email or password", code="invalid_credentials")
        user = await self.users.mark_login(user["_id"]) or user
        return user, await self._issue(user)

    async def refresh(self, refresh_token: str) -> TokenPair:
        payload = decode_token(self.settings, refresh_token, "refresh")
        stored = await self.tokens.consume(hash_token_id(payload["jti"]))
        if stored is None:
            revoked = await self.tokens.revoke_all(payload["sub"])
            log_event(log, "refresh_token_reuse", level=logging.WARNING, user_id=payload["sub"], revoked=revoked)
            raise AuthError("Refresh token is no longer valid", code="refresh_reused")
        user = await self.users.get_by_id(payload["sub"])
        if user is None or not user.get("is_active", True):
            raise AuthError("User not found or inactive", code="invalid_token")
        return await self._issue(user)

    async def logout(self, refresh_token: str) -> None:
        try:
            payload = decode_token(self.settings, refresh_token, "refresh")
        except AuthError:
            return  # logging out with a bad/expired token is a no-op
        await self.tokens.consume(hash_token_id(payload["jti"]))

    async def _issue(self, user: dict) -> TokenPair:
        role = user.get("role", "user")
        access, _, _ = create_token(self.settings, user["_id"], "access", role)
        refresh, jti, expires_at = create_token(self.settings, user["_id"], "refresh", role)
        await self.tokens.store(user_id=user["_id"], token_hash=hash_token_id(jti), expires_at=expires_at)
        return TokenPair(access_token=access, refresh_token=refresh,
                         expires_in=self.settings.access_token_minutes * 60)


def user_out(user: dict) -> dict:
    return UserOut.model_validate(user).model_dump(mode="json")
