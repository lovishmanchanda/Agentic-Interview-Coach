"""AIGateway.embed() (2.2): the Mentor's embeddings go through the gateway, logged like LLM calls."""
import asyncio

import numpy as np
import pytest

from app.core.mentor.setup import GatewayEmbeddings
from app.gateway import AIGateway, FakeAIGateway
from app.gateway.embeddings import HuggingFaceEmbedder
from app.gateway.types import CallContext
from app.utils.exceptions import ServiceUnavailableError


class StubHfClient:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.texts: list[str] = []

    def feature_extraction(self, text):
        self.texts.append(text)
        if self.fail:
            raise TimeoutError("hf timeout")
        return np.array([0.1, 0.2, 0.3], dtype=np.float32)


def _embedder(**kw):
    return HuggingFaceEmbedder(token="unused", model="minilm", client=StubHfClient(**kw))


def test_embed_goes_through_the_provider_and_is_counted():
    gateway = AIGateway(session_token_budget=100, embedder=_embedder())
    vector = asyncio.run(gateway.embed("four words right here", context=CallContext(session_id="s1")))
    assert vector == pytest.approx([0.1, 0.2, 0.3])
    assert gateway.tokens_used("s1") == 4


def test_embed_failure_is_a_503_not_a_provider_exception():
    gateway = AIGateway(session_token_budget=100, embedder=_embedder(fail=True))
    with pytest.raises(ServiceUnavailableError) as exc:
        asyncio.run(gateway.embed("x"))
    assert exc.value.code == "embed_unavailable"


def test_embed_without_a_provider_is_not_configured():
    with pytest.raises(ServiceUnavailableError) as exc:
        asyncio.run(AIGateway(session_token_budget=100).embed("x"))
    assert exc.value.code == "gateway_not_configured"


def test_fake_gateway_uses_a_real_provider_when_given_one_else_hash_vectors():
    real = FakeAIGateway(embedder=_embedder())
    assert asyncio.run(real.embed("x")) == pytest.approx([0.1, 0.2, 0.3])
    assert real.calls_of("embed") == [{"text": "x", "context": None}]
    hashed = FakeAIGateway()
    assert len(asyncio.run(hashed.embed("x"))) == 384


def test_gateway_embeddings_bridge_rag_tools_blocking_calls_to_the_async_gateway():
    """rag_tool calls embed_documents from a worker thread (anyio.to_thread), as the indexer and Mentor do."""
    import anyio

    stub = StubHfClient()
    embeddings = GatewayEmbeddings(AIGateway(session_token_budget=100, embedder=HuggingFaceEmbedder(
        token="unused", model="minilm", client=stub)))

    async def run():
        return await anyio.to_thread.run_sync(embeddings.embed_documents, ["a", "b"])

    assert len(anyio.run(run)) == 2 and stub.texts == ["a", "b"]
