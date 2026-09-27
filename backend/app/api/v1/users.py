from fastapi import APIRouter

from app.core.auth.service import user_out
from app.db.models.user import UserOut
from app.dependencies import CurrentUser
from app.utils.responses import Envelope, ok

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=Envelope[UserOut])
async def me(user: CurrentUser):
    return ok(user_out(user))
