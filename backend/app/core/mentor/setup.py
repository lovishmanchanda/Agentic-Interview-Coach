"""Creates the single RagService instance at startup.

Without HF_TOKEN (e.g. keyless local dev) the service is skipped and the app still starts; /health
reports the Mentor as unavailable.

rag_tool embeds through a LangChain `Embeddings` object. `GatewayEmbeddings` is that object, routed
through the AI Gateway (implementation_plan.md 2.2), so every embedding call is logged with the LLM calls
and the provider can change without touching rag_tool.
"""
import logging
from pathlib import Path

import anyio.from_thread
from langchain_core.embeddings import Embeddings

from app.config import Settings
from app.gateway import AIGateway

log = logging.getLogger(__name__)


class GatewayEmbeddings(Embeddings):
    """rag_tool's calls are blocking and always run in an anyio worker thread (the indexer and the Mentor
    use anyio.to_thread), so each embedding hops back to the event loop to use the async gateway."""

    def __init__(self, gateway: AIGateway):
        self.gateway = gateway

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [anyio.from_thread.run(self.gateway.embed, text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


def build_rag_service(settings: Settings, gateway: AIGateway):
    if not settings.hf_token:
        log.warning("rag_service_disabled", extra={"fields": {"reason": "HF_TOKEN not set"}})
        return None
    from app.core.mentor.rag_tool import RagService

    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    service = RagService(GatewayEmbeddings(gateway), settings.chroma_path, settings.chroma_collection)
    log.info("rag_service_ready", extra={"fields": {"collection": settings.chroma_collection}})
    return service
