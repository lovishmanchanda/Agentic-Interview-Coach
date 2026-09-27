from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.auth.service import AuthService, user_out
from app.db.models.user import AuthResponse, LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.db.repositories.user_repo import RefreshTokenRepository, UserRepository
from app.dependencies import SettingsDep, get_token_repo, get_user_repo
from app.utils.responses import Envelope, ok

router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service(
    settings: SettingsDep,
    users: Annotated[UserRepository, Depends(get_user_repo)],
    tokens: Annotated[RefreshTokenRepository, Depends(get_token_repo)],
) -> AuthService:
    return AuthService(settings, users, tokens)


AuthDep = Annotated[AuthService, Depends(get_auth_service)]


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=Envelope[AuthResponse])
async def register(body: RegisterRequest, auth: AuthDep):
    user, tokens = await auth.register(email=body.email, password=body.password, name=body.name)
    return ok({"user": user_out(user), "tokens": tokens.model_dump()})


@router.post("/login", response_model=Envelope[AuthResponse])
async def login(body: LoginRequest, auth: AuthDep):
    user, tokens = await auth.login(email=body.email, password=body.password)
    return ok({"user": user_out(user), "tokens": tokens.model_dump()})


@router.post("/refresh", response_model=Envelope[TokenPair])
async def refresh(body: RefreshRequest, auth: AuthDep):
    return ok((await auth.refresh(body.refresh_token)).model_dump())


@router.post("/logout", response_model=Envelope[None])
async def logout(body: RefreshRequest, auth: AuthDep):
    await auth.logout(body.refresh_token)
    return ok(None)
