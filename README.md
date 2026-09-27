# AI Interview Coach

An AI interview coaching platform: adaptive live interviews (technical, behavioral, coding) over WebSockets, multi-dimensional evaluation, reports, and a RAG-powered Mentor that coaches from your own interview history.

**Core loop:** Interview → Evaluate → Report → Talk to Mentor → Weak-Area Drill → Interview Again

**Stack:** Next.js 16 + Tailwind 4 · FastAPI (REST + WebSockets) · Cosmos DB (MongoDB API) · AI Gateway (Groq `gpt-oss-120b` / `gpt-oss-20b` for every LLM call) · `rag_tool` (Chroma + HF embeddings) · Piston on an Azure VM · Azure AI Speech

## Run it locally (no cloud keys, no Docker)

Two terminals:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
APP_ENV=local USE_INMEMORY_DB=true uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and register, or sign in as the auto-seeded dev user **dev@example.com / dev-password-123**. API docs are at http://localhost:8000/docs.

`USE_INMEMORY_DB=true` runs on an in-memory MongoDB double that is re-seeded on every restart (data doesn't persist). With `APP_ENV=local` a dev-only JWT secret is used, and the AI Gateway is real Groq when `GROQ_API_KEY` is set in `.env` (the scripted `FakeAIGateway` otherwise).

**With real MongoDB instead:** `docker compose up --build`, then `docker compose exec backend python -m scripts.seed --dev-user`. Or point `COSMOS_CONNECTION_STRING` at any MongoDB/Cosmos instance and run `python -m scripts.seed --dev-user` from `backend/`.

Copy `.env.example` → `.env` (repo root) and `frontend/.env.example` → `frontend/.env.local` to change settings. Never commit `.env`.

## Tests

```bash
cd backend && pytest -q                  # unit + integration, in-memory DB + fake gateway, no keys
cd backend && python -m scripts.seed --check   # validate question-bank seed JSON
cd frontend && npm run lint && npm run build
```

CI runs all of these on every push/PR (`.github/workflows/ci.yml`).

## Start here

| Doc | What it's for |
|---|---|
| [docs/implementation_plan.md](docs/implementation_plan.md) | Master plan: stack, repo layout, phases 0–6, execution order & MVP cut, verification |
| [docs/architecture.md](docs/architecture.md) | Components, Cosmos schema, AI Gateway, WebSocket/REST contract (§13 is the event source of truth) |
| [docs/flow.md](docs/flow.md) | User journeys, state machine, coding, Mentor and report flows |
| [docs/interview-agent-implementation-plan.md](docs/interview-agent-implementation-plan.md) | The Interview Agent ReAct loop and its tools |
| [docs/plan-review.md](docs/plan-review.md) | What changed from the previous plan, why, and the new features |

## Status

| Area | Where | Status |
|---|---|---|
| **Phase 0 — Foundations** | | ✅ Done |
| Config, JSON logging (request/user/session IDs), error envelope | `backend/app/config.py`, `app/utils/` | ✅ |
| Cosmos DB layer: collections, indexes, repositories | `backend/app/db/` | ✅ |
| Auth: register / login / refresh (rotation + reuse detection) / logout, roles | `backend/app/core/auth/`, `app/api/v1/auth.py` | ✅ |
| Candidate profile API | `backend/app/api/v1/profiles.py` | ✅ |
| AI Gateway interface + `FakeAIGateway` + token budget | `backend/app/gateway/` | ✅ (real providers from Phase 1) |
| Question bank seed (20 questions incl. 3 coding problems with hidden tests) | `data/seed/question_bank/`, `backend/scripts/seed.py` | ✅ |
| Frontend: landing, login, register, profile wizard, dashboard shell | `frontend/app/`, `components/`, `store/`, `lib/api.js` | ✅ |
| Local dev without Azure, Docker Compose, CI | `docker-compose.yml`, `.github/workflows/ci.yml` | ✅ |
| Mentor RAG (`rag_tool`) | `backend/app/core/mentor/rag_tool/` | ✅ Built. Starts when `HF_TOKEN` is set; chat wiring in Phase 2. [Guide](docs/modules/rag-tool/INTEGRATION.md) |
| Coding sandbox (`sandbox_tool`) | `backend/app/core/coding/sandbox_tool/` (local only for now) | ⚠️ Built, not in Git yet: it joins the repo in Phase 4 with the fixes in `plan-review.md` §C (Piston URL from config instead of hard-coded). [Guide](docs/modules/coding-sandbox.md) |
| **Phase 1 — Interview engine** | | 🔨 In progress |
| 1.0 Walking skeleton: one question → Groq evaluation → report → RAG index → Mentor cites it | `backend/app/core/interview/engine.py`, `app/api/ws.py`, `frontend/app/(app)/interview/` | ✅ Verified live on Groq + HF |
| Groq AI Gateway (`gpt-oss-120b` / `gpt-oss-20b`, JSON validation, tool calls, token budget) | `backend/app/gateway/groq_gateway.py` | ✅ (`python -m scripts.check_groq` for a live check) |
| 1.1 Question bank + question engine: 1–5 questions per interview, picked for role and level; Groq writes one when the bank runs dry | `backend/app/core/interview/question_engine.py`, `prompts/interviewer/` | ✅ |
| 1.2 Interview configuration: type, practice/serious mode, role, level, difficulty, company, question count, focus topics (Weak-Area Drill) | `backend/app/db/models/interview.py`, `frontend/app/(app)/interview/configure/` | ✅ |
| Mentor: generic "where am I weakest?" questions answered from recent sessions; markdown replies | `core/mentor/rag_tool/service.py`, `frontend/components/mentor/` | ✅ |

## Layout

```
backend/    FastAPI app (app/api, core, agents, gateway, voice, db, utils), tests, scripts
frontend/   Next.js app (app/, components/, store/, lib/)
prompts/    Versioned prompts (interviewer, evaluator, mentor, report)
data/seed/  question_bank seed JSON
evaluation/ AI quality eval sets
docs/       Plans, architecture, module guides
```
