from fastapi import APIRouter
from langchain_core.runnables import Runnable
from .schemas import MentorChatRequest, MentorChatResponse
from .service import RagService


def create_mentor_router(service: RagService, llm: Runnable) -> APIRouter:
    """Mount this router in the team's FastAPI app; it deliberately owns only /mentor."""
    router = APIRouter(prefix="/api/mentor", tags=["mentor"])

    @router.post("/chat", response_model=MentorChatResponse)
    def chat(request: MentorChatRequest):
        return service.answer(request, lambda prompt: str(llm.invoke(prompt).content))

    return router
