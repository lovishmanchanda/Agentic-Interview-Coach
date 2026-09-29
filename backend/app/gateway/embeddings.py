"""Embedding providers behind AIGateway.embed() (implementation_plan.md 2.2).

Today: sentence-transformers/all-MiniLM-L6-v2 on the Hugging Face Inference API (384 dimensions), the
model the Mentor's Chroma collection was built with. Moving to Azure AI Search / Azure OpenAI embeddings
means a new provider here; callers don't change. Changing the model means re-indexing (new collection).
"""
from typing import Any, Protocol


class EmbeddingProvider(Protocol):
    model: str

    def embed(self, text: str) -> list[float]:
        """Blocking; the gateway runs it in a worker thread."""
        ...


class HuggingFaceEmbedder:
    def __init__(self, *, token: str, model: str, client: Any = None):
        if client is None:
            from huggingface_hub import InferenceClient

            client = InferenceClient(model=model, token=token)
        self.client = client
        self.model = model

    def embed(self, text: str) -> list[float]:
        vector = self.client.feature_extraction(text)
        return vector.tolist() if hasattr(vector, "tolist") else list(vector)
