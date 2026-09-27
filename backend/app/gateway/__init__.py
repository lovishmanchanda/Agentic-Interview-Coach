from app.config import Settings
from app.gateway.ai_gateway import AIGateway
from app.gateway.fake_gateway import FakeAIGateway
from app.gateway.groq_gateway import GroqAIGateway


def build_gateway(settings: Settings) -> AIGateway:
    if settings.fake_gateway:
        return FakeAIGateway(session_token_budget=settings.session_token_budget)
    if settings.groq_api_key:
        return GroqAIGateway(api_key=settings.groq_api_key, default_model=settings.groq_interview_model,
                             fast_model=settings.groq_fast_model,
                             session_token_budget=settings.session_token_budget)
    return AIGateway(session_token_budget=settings.session_token_budget)  # stub: every call -> 503


def gateway_kind(gateway: AIGateway) -> str:
    if isinstance(gateway, FakeAIGateway):
        return "fake"
    if isinstance(gateway, GroqAIGateway):
        return "groq"
    return "not_configured"


__all__ = ["AIGateway", "FakeAIGateway", "GroqAIGateway", "build_gateway", "gateway_kind"]
