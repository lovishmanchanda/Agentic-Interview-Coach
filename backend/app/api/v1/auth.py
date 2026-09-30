from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from app.core.auth.service import AuthService, user_out
from app.db.models.user import AuthResponse, LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.db.repositories.user_repo import RefreshTokenRepository, UserRepository
from app.dependencies import SettingsDep, get_token_repo, get_user_repo
from app.utils.exceptions import AuthError, ForbiddenError, TooManyRequestsError
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


# ── cookie mode ──────────────────────────────────────────────────────────────
# The web app sends "X-Auth-Mode: cookie". Then the refresh token is set as an httpOnly cookie (scoped to
# /api/v1/auth, so it's sent nowhere else) and left out of the response body: an XSS bug can't steal it. Other
# clients (and the tests) keep receiving and sending it in the body.
COOKIE_PATH = "/api/v1/auth"


def _cookie_mode(request: Request) -> bool:
    return request.headers.get("x-auth-mode", "").lower() == "cookie"


def _deliver(tokens: TokenPair, request: Request, response: Response) -> dict:
    if not _cookie_mode(request):
        return tokens.model_dump()
    settings = request.app.state.settings
    secure = settings.refresh_cookie_secure
    if secure is None:
        secure = settings.app_env not in ("local", "test")
    response.set_cookie(settings.refresh_cookie_name, tokens.refresh_token, httponly=True, secure=secure,
                        samesite=settings.refresh_cookie_samesite, max_age=settings.refresh_token_days * 86400,
                        path=COOKIE_PATH)
    return {**tokens.model_dump(), "refresh_token": None}


def _refresh_token_from(body: RefreshRequest, request: Request) -> str | None:
    """The body's token, else the cookie's. A cookie is only honoured from an allowed origin (CSRF)."""
    if body.refresh_token:
        return body.refresh_token
    token = request.cookies.get(request.app.state.settings.refresh_cookie_name)
    origin = request.headers.get("origin")
    if token and origin and origin not in request.app.state.settings.cors_origins:
        raise ForbiddenError("Refreshing from this site isn't allowed", code="bad_origin")
    return token


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=Envelope[AuthResponse])
async def register(body: RegisterRequest, auth: AuthDep, request: Request, response: Response):
    enforce(request.app.state.limiters["register_ip"], _client_ip(request),
            "Too many sign-ups from this network. Try again later.")
    user, tokens = await auth.register(email=body.email, password=body.password, name=body.name)
    return ok({"user": user_out(user), "tokens": _deliver(tokens, request, response)})


@router.post("/login", response_model=Envelope[AuthResponse])
async def login(body: LoginRequest, auth: AuthDep, request: Request, response: Response):
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
    return ok({"user": user_out(user), "tokens": _deliver(tokens, request, response)})


@router.post("/refresh", response_model=Envelope[TokenPair])
async def refresh(auth: AuthDep, request: Request, response: Response, body: RefreshRequest | None = None):
    token = _refresh_token_from(body or RefreshRequest(), request)
    if not token:
        raise AuthError("Missing refresh token", code="missing_token")
    return ok(_deliver(await auth.refresh(token), request, response))


@router.post("/logout", response_model=Envelope[None])
async def logout(auth: AuthDep, request: Request, response: Response, body: RefreshRequest | None = None):
    token = _refresh_token_from(body or RefreshRequest(), request)
    if token:
        await auth.logout(token)
    response.delete_cookie(request.app.state.settings.refresh_cookie_name, path=COOKIE_PATH)
    return ok(None)
