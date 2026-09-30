from app.config import Settings
from app.gateway.ai_gateway import AIGateway
from app.gateway.embeddings import HuggingFaceEmbedder
from app.gateway.usage import Pricing
from app.gateway.fake_gateway import FakeAIGateway
from app.gateway.groq_gateway import GroqAIGateway


def build_gateway(settings: Settings) -> AIGateway:
    # Embeddings (the Mentor) need HF_TOKEN; without it embed() -> 503 and the Mentor is disabled.
    embedder = HuggingFaceEmbedder(token=settings.hf_token, model=settings.embedding_model) if settings.hf_token else None
    # Coding interviews need PISTON_URL; without it execute_code() -> 503 and the coding type is unavailable.
    from app.core.coding.sandbox_client import PistonExecutor  # here, not at the top: it imports app.gateway.types

    executor = PistonExecutor(url=settings.piston_url, api_key=settings.piston_api_key,
                              timeout_s=settings.piston_timeout_s) if settings.piston_url else None
    pricing = Pricing({settings.groq_interview_model: (settings.groq_price_default_in, settings.groq_price_default_out),
                       settings.groq_fast_model: (settings.groq_price_fast_in, settings.groq_price_fast_out)})
    if settings.fake_gateway:
        return FakeAIGateway(session_token_budget=settings.session_token_budget, embedder=embedder, executor=executor)
    if settings.groq_api_key:
        return GroqAIGateway(api_key=settings.groq_api_key, default_model=settings.groq_interview_model,
                             fast_model=settings.groq_fast_model, session_token_budget=settings.session_token_budget,
                             embedder=embedder, executor=executor, pricing=pricing)
    return AIGateway(session_token_budget=settings.session_token_budget, embedder=embedder,
                     executor=executor)  # stub: LLM calls -> 503


def gateway_kind(gateway: AIGateway) -> str:
    if isinstance(gateway, FakeAIGateway):
        return "fake"
    if isinstance(gateway, GroqAIGateway):
        return "groq"
    return "not_configured"


__all__ = ["AIGateway", "FakeAIGateway", "GroqAIGateway", "build_gateway", "gateway_kind"]
