"""Creates the single RagService instance at startup (implementation_plan.md Phase 0.7).

Mentor chat itself is wired in Phase 2. Without HF_TOKEN (e.g. keyless local dev) the service is
skipped and the app still starts; /health reports the Mentor as unavailable.
"""
import logging
from pathlib import Path

from app.config import Settings

log = logging.getLogger(__name__)


def build_rag_service(settings: Settings):
    if not settings.hf_token:
        log.warning("rag_service_disabled", extra={"fields": {"reason": "HF_TOKEN not set"}})
        return None
    from app.core.mentor.rag_tool import RagService
    from app.core.mentor.rag_tool.providers import HuggingFaceApiEmbeddings

    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    embeddings = HuggingFaceApiEmbeddings(settings.hf_token, settings.embedding_model)
    service = RagService(embeddings, settings.chroma_path, settings.chroma_collection)
    log.info("rag_service_ready", extra={"fields": {"collection": settings.chroma_collection}})
    return service
