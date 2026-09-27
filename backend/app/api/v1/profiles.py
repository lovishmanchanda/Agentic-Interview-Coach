from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.db.models.profile import ProfileCreate, ProfileOut, ProfileUpdate
from app.db.repositories.profile_repo import ProfileRepository
from app.dependencies import CurrentUser, get_profile_repo
from app.utils.exceptions import NotFoundError
from app.utils.responses import Envelope, ok

router = APIRouter(prefix="/profiles", tags=["profiles"])
ProfilesDep = Annotated[ProfileRepository, Depends(get_profile_repo)]


def _out(doc: dict) -> dict:
    return ProfileOut.model_validate(doc).model_dump(mode="json")


@router.post("", status_code=status.HTTP_201_CREATED, response_model=Envelope[ProfileOut])
async def create_profile(body: ProfileCreate, user: CurrentUser, profiles: ProfilesDep):
    return ok(_out(await profiles.create(user["_id"], body)))


@router.get("/me", response_model=Envelope[ProfileOut])
async def get_my_profile(user: CurrentUser, profiles: ProfilesDep):
    doc = await profiles.get_by_candidate(user["_id"])
    if doc is None:
        raise NotFoundError("Profile not created yet", code="profile_missing")
    return ok(_out(doc))


@router.put("/me", response_model=Envelope[ProfileOut])
async def update_my_profile(body: ProfileUpdate, user: CurrentUser, profiles: ProfilesDep):
    doc = await profiles.update(user["_id"], body)
    if doc is None:
        raise NotFoundError("Profile not created yet", code="profile_missing")
    return ok(_out(doc))
