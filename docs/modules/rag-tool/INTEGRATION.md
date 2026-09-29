# RAG Tool Integration Guide

> **In this project** (Live Interview Coach design): the module lives at `backend/app/core/mentor/rag_tool/` and its tests at `backend/tests/unit/mentor/`. The guide below was written for the earlier small design (SQLite + LangGraph). Where the two differ, this box wins:
>
> | Guide says | In this project |
> |---|---|
> | SQLite is the canonical report store | **Cosmos DB** `interview_reports` is canonical; Chroma stays a rebuildable index |
> | Mount `create_mentor_router` at `/api/mentor/chat` | **Don't mount it.** `app/api/v1/mentor.py` → `core/mentor/mentor_agent.py` calls `RagService.answer()` and persists the turn in `mentor_conversations` |
> | Report generator produces `InterviewReport` directly | `core/mentor/indexer.py::to_rag_report()` maps the Cosmos report + evaluations → `InterviewReport` (`candidate_id` → `user_id`), then `index_report()` runs as a background task on `REPORT_READY` |
> | `user_id` from the request body | `user_id` always comes from the JWT (`get_current_user`) |
> | `from backend.rag_tool import ...` | `from app.core.mentor.rag_tool import ...` |
>
> See `docs/plan-review.md` §B for the reasoning, and `docs/implementation_plan.md` Phase 2 for the tasks.

**What it needs:** `HF_TOKEN` (embeddings only, `sentence-transformers/all-MiniLM-L6-v2`) and `GROQ_API_KEY` (mentor chat, `openai/gpt-oss-120b`). Both are passed in by the app's config layer; `rag_tool/` never reads `.env` itself. Tests need no keys: `cd backend && pytest -q`.

This module is the RAG component. It does **not** own interview flow, speech, frontend, or canonical report persistence.

## Ownership and hand-off

```text
Interview graph → Report service → SQLite save (main app) → rag.index_report(report)
Browser mentor UI → POST /api/mentor/chat → RAG retrieval → shared LLM → response + sources
```

The main app owns the full report JSON in SQLite. This module owns a rebuildable Chroma index only.

## 1. Copy into the main backend

Copy `rag_tool/` into `interview-coach/backend/rag_tool/`. Add this module's packages from `requirements.txt` to the team's unified requirements file. Keep one shared `data/chroma` path in the team's configuration.

## 2. Initialise once during FastAPI startup

Use the same embedding instance for the RAG service throughout the process. The example uses Hugging Face hosted inference, but any LangChain `Embeddings` provider works.

```python
# backend/main.py
from fastapi import FastAPI
from backend.rag_tool import RagService
from backend.rag_tool.router import create_mentor_router
from backend.rag_tool.providers import HuggingFaceApiEmbeddings, build_chat_provider
from backend.config import settings

if not settings.hf_token:
    raise RuntimeError("HF_TOKEN is required")
rag = RagService(HuggingFaceApiEmbeddings(settings.hf_token, settings.embedding_model), settings.chroma_path, "interview_reports_v2")
chat_provider = build_chat_provider(
    settings.chat_provider,  # "groq" -- the only supported chat provider
    groq_api_key=settings.groq_api_key, groq_chat_model=settings.groq_model,
)
app = FastAPI()
app.state.rag = rag  # optional: convenient for the report-completion handler
app.include_router(create_mentor_router(rag, chat_provider))
```

Chat runs on Groq only (`CHAT_PROVIDER=groq`) -- Hugging Face Inference Providers' free tier only gives $0.10/month in routing credit, so it isn't used for chat. Embeddings stay on Hugging Face (`sentence-transformers/all-MiniLM-L6-v2`) regardless of chat provider. The `build_chat_provider(provider, ...)` indirection is kept so a future provider can be added without changing call sites, but today `provider` must be `"groq"`.

If the team uses an application factory, create `RagService` before calling `create_mentor_router`; do not instantiate it on every request.

Set `HF_TOKEN` only in the backend `.env` or deployment secret store. The hosted Hugging Face API generates both chat completions and embeddings; no model download occurs. Do not put this token in the browser.

## 3. Index after a successful report save

The report generator must produce the `InterviewReport` contract below. Save it to SQLite first, then index it. If Chroma fails, leave the SQLite report intact and retry the indexing job later.

```python
from backend.rag_tool import InterviewReport

report = InterviewReport.model_validate(generated_report_json)
report_repo.save(report)            # SQLite: canonical source of truth
request.app.state.rag.index_report(report)  # Chroma: retry-safe upsert
```

Required report fields are `session_id`, `user_id`, `interview_type`, `topic`, `overall_score`, and `summary`. Each question feedback item needs `question_id`, `question`, `score`; the remaining feedback fields have safe defaults. The report generator should use the project-wide field names `feedback` and `recommended_study_areas`. The server—not the LLM—must add `session_id`, `user_id`, `interview_type`, `topic`, and `created_at` from the trusted session record.

## 4. Mentor API contract

The mounted route exactly matches the team plan:

```http
POST /api/mentor/chat
Content-Type: application/json

{
  "user_id": "temporary-browser-uuid",
  "message": "Where am I weakest?",
  "history": [{"role": "user", "content": "How did I do?"}]
}
```

It returns an `answer` and `sources`, including chunk ID, session ID, date, topic, and chunk type. The frontend can display source dates and use the session ID to link to `/api/reports/detail/{session_id}`.

**In this app** (Phase 2) the host is `MentorAgent` (`core/mentor/mentor_agent.py`), not this router. It passes two optional arguments the standalone router doesn't use:

- `RagService.answer(request, invoke_llm, system_prompt=…)`: the versioned prompt from `prompts/mentor/`. Default: `SYSTEM_PROMPT`.
- `MentorChatRequest.previous_chunk_ids`: the `chunk_id`s the previous reply cited. Used only mid-conversation when a follow-up finds nothing of its own (e.g. "which of those should I fix first?"), which is then answered from those excerpts. The read still filters on `user_id`.

## Security rule

Every Chroma query filters `where={"user_id": user_id}`. Until authentication exists, pass the browser UUID. Once login is added, **ignore the request's `user_id` and obtain it from the authenticated server-side user** before calling `RagService.retrieve` or `answer`.

## Chroma metadata and IDs

For every report, the tool creates: one `summary` chunk, one `question_feedback` chunk per question, and one `recommendations` chunk. Metadata always includes `user_id`, `session_id`, `date`, `topic`, `chunk_type`, and `score`. IDs are deterministic (`{session_id}:summary`, etc.), so retries update rather than duplicate a report.

## Team acceptance checks

1. Complete one interview; its full report is visible through the reports endpoint and its chunks appear in Chroma.
2. Re-index that report; Chroma still contains one copy of each chunk.
3. Ask the mentor a question as the same user; the answer has source metadata.
4. Ask as a different user; no chunks from the first user's session are returned.
5. Stop/restart FastAPI; Chroma retrieval still works from `data/chroma`.
