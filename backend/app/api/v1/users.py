from fastapi import APIRouter

from app.core.auth.service import user_out
from app.db.models.user import UserOut
from app.dependencies import CurrentUser, SettingsDep, is_admin
from app.utils.responses import Envelope, ok

router = APIRouter(prefix="/users", tags=["users"])


class MeOut(UserOut):
    is_admin: bool = False


@router.get("/me", response_model=Envelope[MeOut])
async def me(user: CurrentUser, settings: SettingsDep):
    return ok({**user_out(user), "is_admin": is_admin(user, settings)})
