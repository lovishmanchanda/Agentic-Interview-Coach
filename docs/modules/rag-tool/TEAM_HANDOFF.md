# What to Send the Main-App Team

Send these files only:

```text
rag_tool/                      # required: RAG schemas, Chroma service, mentor router, Groq + HF adapters
requirements-rag.txt           # merge its lines into the main requirements.txt
INTEGRATION.md                 # exact setup and API hand-off instructions
tests/test_rag_tool.py         # optional but recommended regression test
tests/test_mentor_service.py   # optional but recommended: retrieval-mode and citation tests
pytest.ini                     # needed alongside the tests above so `pytest` finds rag_tool/ without extra setup
.env.example                   # reference only; never send an actual .env, HF_TOKEN, or GROQ_API_KEY
```

Do **not** send `.venv/`, `data/`, `__pycache__/`, the local `.env`, `eval/`, or `scripts/`. They are not part of the drop-in tool.

## Where each teammate connects it

| Main-app owner | Integration point |
|---|---|
| Report generator | Creates the validated `InterviewReport`, saves it in SQLite, then calls `rag.index_report(report)`. |
| FastAPI app owner | Creates one `RagService` during application setup and mounts `create_mentor_router(...)`. |
| Mentor frontend owner | Calls `POST /api/mentor/chat` and renders `answer` plus `sources`. |
| Config owner | Adds `HF_TOKEN`, `EMBEDDING_MODEL`, `CHAT_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL`, `CHROMA_PATH`, and `CHROMA_COLLECTION` to the backend-only environment. |

## Important report enrichment

The LLM should generate evaluation content only. The server adds trusted session fields before RAG indexing:

```python
report_data = report_llm_output  # overall_score, summary, feedback, study areas, etc.
report = InterviewReport(
    **report_data,
    session_id=session.id,
    user_id=session.user_id,
    interview_type=getattr(session, "interview_type", "practice"),
    topic=getattr(session, "topic", "mixed"),
)
```

Never ask the LLM to invent `session_id`, `user_id`, or the date.

The current main-app plan has `mode` (`text`/`speech`) but not `interview_type` or a single report-level `topic`. Keep `mode` separate. Add `interview_type` to the session if the product needs it; otherwise use `practice`. For mixed question sets, use `topic="mixed"`; each per-question chunk still receives its specific question topic.
