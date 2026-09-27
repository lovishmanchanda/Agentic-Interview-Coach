"""Hosted chat/embedding adapters. No local model weights are loaded."""
from groq import Groq
from huggingface_hub import InferenceClient
from langchain_core.embeddings import Embeddings
from langchain_core.messages import AIMessage


class GroqApiChat:
    def __init__(self, api_key: str, model: str):
        self.client = Groq(api_key=api_key)
        self.model = model

    def invoke(self, prompt: str) -> AIMessage:
        response = self.client.chat.completions.create(
            model=self.model, messages=[{"role": "user", "content": prompt}], max_tokens=700, temperature=0
        )
        return AIMessage(content=response.choices[0].message.content or "")


def build_chat_provider(provider: str, *, groq_api_key: str | None = None, groq_chat_model: str | None = None):
    """Selects the chat backend by name. rag_tool intentionally does not read env vars itself;
    the host app's config layer passes plain values in. Groq is currently the only chat provider;
    the provider-name indirection stays so a future provider can be added without touching call sites."""
    if provider == "groq":
        if not groq_api_key:
            raise RuntimeError("GROQ_API_KEY is required when CHAT_PROVIDER=groq")
        return GroqApiChat(groq_api_key, groq_chat_model or "openai/gpt-oss-120b")
    raise ValueError(f"Unknown CHAT_PROVIDER: {provider!r} (expected 'groq')")


class HuggingFaceApiEmbeddings(Embeddings):
    def __init__(self, token: str, model: str):
        super().__init__()
        self.client = InferenceClient(model=model, token=token)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors = []
        for text in texts:
            vector = self.client.feature_extraction(text)
            vectors.append(vector.tolist() if hasattr(vector, "tolist") else list(vector))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]
