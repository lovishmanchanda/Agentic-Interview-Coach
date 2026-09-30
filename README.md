# InterviewOS

An AI interview coaching platform, with **VERA** (the interviewer agent) and **ARIA** (the mentor agent): adaptive live interviews (technical, behavioral, coding) over WebSockets, multi-dimensional evaluation, reports, and a RAG-powered Mentor that coaches from your own interview history.

**Core loop:** Interview → Evaluate → Report → Talk to Mentor → Weak-Area Drill → Interview Again

**Design:** dark-only, black and greys with sparing orange and steel accents. See [docs/design-system.md](docs/design-system.md); run the frontend in dev and open `/design` for the living style guide.

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
cd backend && .venv/bin/python ../evaluation/interview_eval/run_evaluator_eval.py   # evaluator accuracy vs hand scores (live Groq, ~10 min)
cd frontend && npm run lint && npm run build
```

CI runs all of these on every push/PR (`.github/workflows/ci.yml`).

## Start here

| Doc | What it's for |
|---|---|
| [docs/implementation_plan.md](docs/implementation_plan.md) | Master plan: stack, repo layout, phases 0–7 (7 = UI/UX design, last), execution order & MVP cut, verification |
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
| Mentor RAG (`rag_tool`) | `backend/app/core/mentor/rag_tool/` | ✅ Built. Starts when `HF_TOKEN` is set. [Guide](docs/modules/rag-tool/INTEGRATION.md) |
| Coding sandbox | `backend/app/core/coding/` | ✅ Rebuilt in Phase 4 with the `plan-review.md` §C fixes. The original `sandbox_tool/` stays local (gitignored) and is superseded. [Guide](docs/modules/coding-sandbox.md) |
| **Phase 1 — Interview engine** | | ✅ Done |
| 1.0 Walking skeleton: one question → Groq evaluation → report → RAG index → Mentor cites it | `backend/app/core/interview/engine.py`, `app/api/ws.py`, `frontend/app/(app)/interview/` | ✅ Verified live on Groq + HF |
| Groq AI Gateway (`gpt-oss-120b` / `gpt-oss-20b`, JSON validation, tool calls, token budget) | `backend/app/gateway/groq_gateway.py` | ✅ (`python -m scripts.check_groq` for a live check) |
| 1.1 Question bank + question engine: 1–5 questions per interview, picked for role and level; Groq writes one when the bank runs dry | `backend/app/core/interview/question_engine.py`, `prompts/interviewer/` | ✅ |
| 1.10 Report generator: Groq writes the summary, weak areas, recommendations and study plan; the numbers are always computed | `backend/app/core/interview/report_generator.py`, `prompts/report/` | ✅ |
| 1.11 Interview UI: serious-mode room, question timer, report score cards and charts | `frontend/app/(app)/interview/`, `frontend/components/charts/ScoreBars.jsx` | ✅ |
| 1.9 WebSocket flow: validated protocol + contract test, draft autosave, practice hints, heartbeat and resilient reconnects | `backend/app/api/ws_protocol.py`, `frontend/lib/interviewSocket.js` | ✅ |
| 1.6 Interviewer agent: opening, follow-ups written from your answer, transitions and closing on Groq `gpt-oss-120b`; every move validated by the engine | `backend/app/agents/interview_agent.py` | ✅ |
| 1.8 Adaptation engine: difficulty follows performance, one follow-up on partial answers, per-topic scores, drills revisit the weakest topic | `backend/app/core/interview/adaptation_engine.py` | ✅ |
| 1.7 Evaluators: technical + behavioral (STAR), behavioral interviews, 48-answer evaluator test set (`evaluation/`) | `backend/app/core/evaluation/`, `evaluation/interview_eval/run_evaluator_eval.py` | ✅ |
| 1.3 Interview state machine: validated transitions, state history, crash/reconnect recovery, `GET /interviews/{id}/state` | `backend/app/core/interview/state_machine.py` | ✅ |
| 1.2 Interview configuration: type, practice/serious mode, role, level, difficulty, company, question count, focus topics (Weak-Area Drill) | `backend/app/db/models/interview.py`, `frontend/app/(app)/interview/configure/` | ✅ |
| Mentor: generic "where am I weakest?" questions answered from recent sessions; markdown replies | `core/mentor/rag_tool/service.py`, `frontend/components/mentor/` | ✅ |
| **Phase 6 — Observability, AI evals, cost** | | ✅ Done |
| Every AI call recorded (`llm_calls`: prompt version, tokens, cost, latency, errors), admin dashboard (`/admin`), alerts, daily token cap per user | `backend/app/gateway/usage.py`, `app/utils/metrics.py`, `app/api/v1/admin.py`, `frontend/app/(app)/admin/` | ✅ |
| Prompt registry: switch versions, A/B split and roll back without a deploy | `backend/app/core/prompts.py`, admin page | ✅ |
| AI quality evals with trend history: interviewer agent (12 scenarios), question quality (LLM judge), evaluator and Mentor sets | `evaluation/agent_eval/`, `evaluation/question_eval/`, `evaluation/trends.py` | ✅ |
| Refresh token in an httpOnly cookie (web app) | `backend/app/api/v1/auth.py`, `frontend/lib/api.js` | ✅ |
| **Phase 3 — Company preparation** | | ✅ Done |
| "Prepare me for Google": company research (10 curated + AI-researched, cached), JD analysis, gap analysis from your scores, week-by-week plan with practice buttons, inside the Mentor | `backend/app/agents/prep/`, `prompts/prep/`, `data/seed/companies/`, `frontend/components/mentor/PrepareForm.jsx` | ✅ |
| **Phase 4 — Coding interviews** | | ✅ Done (verified on the Piston VM) |
| Live coding: Monaco editor, Run / Submit, 18 problems, Python graded against every test incl. hidden, code evaluator, coding in reports | `backend/app/core/coding/`, `app/core/evaluation/code_evaluator.py`, `frontend/components/coding/` | ✅ (needs `PISTON_URL`) |
| Time-limit wrap-up (`MAX_INTERVIEW_MINUTES`) | `backend/app/core/interview/adaptation_engine.py` | ✅ |
| **Phase 2 — Mentor** | | ✅ Done |
| Background report indexing with retries and a catch-up sweep; embeddings through the AI Gateway | `backend/app/core/mentor/indexer.py`, `app/gateway/embeddings.py` | ✅ |
| Mentor agent: versioned prompt, saved conversations, Weak-Area Drill button, welcome from your latest report | `backend/app/core/mentor/mentor_agent.py`, `app/api/v1/mentor.py`, `prompts/mentor/` | ✅ |
| Mentor UI: conversation sidebar, welcome and starters, citation chips, drill button | `frontend/app/(app)/mentor/`, `frontend/components/mentor/`, `store/mentorStore.js` | ✅ |
| Mentor eval: 21 cases (grounding, declines, injection, citations) | `evaluation/mentor_eval/run_mentor_eval.py` | ✅ |

## Layout

```
backend/    FastAPI app (app/api, core, agents, gateway, voice, db, utils), tests, scripts
frontend/   Next.js app (app/, components/, store/, lib/)
prompts/    Versioned prompts (interviewer, evaluator, mentor, report)
data/seed/  question_bank seed JSON
evaluation/ AI quality eval sets
docs/       Plans, architecture, module guides
```
