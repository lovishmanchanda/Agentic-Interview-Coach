from fastapi import APIRouter

from app.api.v1 import auth, health, interviews, mentor, profiles, reports, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(profiles.router)
api_router.include_router(interviews.router)
api_router.include_router(reports.router)
api_router.include_router(mentor.router)
