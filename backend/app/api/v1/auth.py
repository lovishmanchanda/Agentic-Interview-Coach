from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.core.auth.service import AuthService, user_out
from app.db.models.user import AuthResponse, LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.db.repositories.user_repo import RefreshTokenRepository, UserRepository
from app.dependencies import SettingsDep, get_token_repo, get_user_repo
from app.utils.exceptions import AuthError, TooManyRequestsError
from app.utils.rate_limit import enforce
from app.utils.responses import Envelope, ok

router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service(
    settings: SettingsDep,
    users: Annotated[UserRepository, Depends(get_user_repo)],
    tokens: Annotated[RefreshTokenRepository, Depends(get_token_repo)],
) -> AuthService:
    return AuthService(settings, users, tokens)


AuthDep = Annotated[AuthService, Depends(get_auth_service)]


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=Envelope[AuthResponse])
async def register(body: RegisterRequest, auth: AuthDep, request: Request):
    enforce(request.app.state.limiters["register_ip"], _client_ip(request),
            "Too many sign-ups from this network. Try again later.")
    user, tokens = await auth.register(email=body.email, password=body.password, name=body.name)
    return ok({"user": user_out(user), "tokens": tokens.model_dump()})


@router.post("/login", response_model=Envelope[AuthResponse])
async def login(body: LoginRequest, auth: AuthDep, request: Request):
    """Failed attempts are limited per email and per IP, so passwords can't be guessed at speed. The check runs
    before the password is verified, and a blocked attempt looks the same whether or not the email exists."""
    limiters = request.app.state.limiters
    email_key, ip_key = body.email.lower(), _client_ip(request)
    if limiters["login_email"].blocked(email_key) or limiters["login_ip"].blocked(ip_key):
        raise TooManyRequestsError("Too many sign-in attempts. Wait a few minutes and try again.")
    try:
        user, tokens = await auth.login(email=body.email, password=body.password)
    except AuthError:
        limiters["login_email"].record(email_key)
        limiters["login_ip"].record(ip_key)
        raise
    limiters["login_email"].reset(email_key)
    return ok({"user": user_out(user), "tokens": tokens.model_dump()})


@router.post("/refresh", response_model=Envelope[TokenPair])
async def refresh(body: RefreshRequest, auth: AuthDep):
    return ok((await auth.refresh(body.refresh_token)).model_dump())


@router.post("/logout", response_model=Envelope[None])
async def logout(body: RefreshRequest, auth: AuthDep):
    await auth.logout(body.refresh_token)
    return ok(None)
