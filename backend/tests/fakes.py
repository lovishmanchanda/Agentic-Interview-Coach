"""Shared test doubles."""
import hashlib

from langchain_core.embeddings import Embeddings

GOOD_EVALUATION = {
    "overall_score": 6.5,
    "dimensions": {"correctness": 7, "depth": 5, "communication": 7},
    "strengths": ["Explained buckets and hashing clearly"],
    "weaknesses": ["Did not mention resizing or load factor"],
    "feedback": "Solid basics. Go one level deeper on how the table grows.",
    "suggestion": "Practise explaining load factor and rehashing with an example.",
    "model_answer_outline": ["hash function -> bucket", "collisions: chaining vs open addressing",
                             "load factor + resize", "O(1) average, O(n) worst"],
}


class HashEmbeddings(Embeddings):
    """Deterministic, non-zero 32-dim vectors: same text -> same vector, no network."""

    def _vector(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode()).digest()
        return [b / 255.0 + 0.01 for b in digest]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vector(text)
