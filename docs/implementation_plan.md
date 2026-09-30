# AI Interview Coach — Master Implementation Plan

> **Purpose**: This is the guiding stone for the entire project. All subsequent phase-wise plans, `flow.md`, `architecture.md`, and component-level plans should trace back to this document. Every decision made during the build should be consistent with the principles established here.

---

## Project Vision (North Star)

Build an **AI-powered interview coaching platform** that goes beyond a simple question-asking chatbot. The system must:

1. **Understand the candidate** — profile, skills, experience, interview history
2. **Understand the target role/company** — requirements, interview style, skill expectations
3. **Coach the candidate via an AI Mentor** — RAG-powered personalized coaching based on actual past interview performance, not generic topic grids
4. **Simulate realistic interviews** — adaptive, stateful, role-appropriate, text or voice
5. **Evaluate deeply** — multi-dimensional structured assessment, not just a score
6. **Close the loop** — turn evaluation results into the Mentor's next coaching session automatically

The core product loop is the system's heartbeat:

```
Interview → Evaluate → Report → Talk to Mentor → Improve → Interview Again
```

---

## Open Questions

> [!IMPORTANT]
> These questions should be resolved before or during Phase 0. They will influence technical and architectural decisions.

1. ~~**Database choice**~~ ✅ **Resolved**: **Azure Cosmos DB (MongoDB API)**. Flexible JSON documents suit the evolving schema across profiles, sessions, and evaluations.
2. ~~**Authentication**~~ ✅ **Resolved**: **JWT + simple email/password** authentication. No Microsoft Entra ID.
3. ~~**Voice streaming**~~ ✅ **Resolved**: **Batch mode first** for Phase 5. Streaming STT/TTS considered as a Phase 5+ upgrade only.
4. ~~**Question bank seeding**~~ ✅ **Resolved**: Initial question bank covers **Software Engineer + ML Engineer** roles. Additional roles added in Phase 3 and beyond.
5. ~~**Frontend framework**~~ ✅ **Resolved**: **Next.js (App Router) + JavaScript + Tailwind CSS**. No TypeScript.

6. ~~**Code execution backend**~~ ✅ **Resolved**: **Piston**, self-hosted on an Azure VM (python, c, c++, java, javascript). Replaces Azure Code Interpreter + Judge0.
7. ~~**Mentor RAG store**~~ ✅ **Resolved**: the built **`rag_tool`** (Chroma + Hugging Face embeddings + Groq chat) now, behind the AI Gateway. Azure AI Search later without changing callers.
8. ~~**Question source**~~ ✅ **Resolved**: **hybrid**. Cosmos `question_bank` (seeded) first, with LLM generation as a fallback. The research engine is a later add-on that adds questions to the bank.
9. ~~**Agent loop framework**~~ ✅ **Resolved**: a hand-rolled ReAct loop on `AIGateway.generate_with_tools()`.
10. ~~**LLM provider**~~ ✅ **Resolved (2026-09-26)**: **Groq for every LLM call** (interviewer, evaluators, reports, Mentor). No Azure OpenAI. Embeddings stay on Hugging Face because Groq has no embedding models.

> [!NOTE]
> All open questions are resolved. See `plan-review.md` for what changed from the previous version of this plan and why.

---

## Built Modules

Two parts of this plan already exist and are wired in as modules rather than built from scratch:

| Module | Location | Covers | Status |
|---|---|---|---|
| **`rag_tool`** | `backend/app/core/mentor/rag_tool/` | Phase 2: chunking, indexing, intent-routed retrieval, guardrailed Mentor prompt, `[n]` citations | ✅ Built, 12 unit tests. Needs the Cosmos adapter + persistence (Phase 2). Guide: `docs/modules/rag-tool/INTEGRATION.md` |
| **`sandbox_tool`** | `backend/app/core/coding/sandbox_tool/` + `frontend/prototypes/coding-sandbox/` | Phase 4: `request_coding_question`, `submit_code_for_execution`, Piston client, reference editor UI | ⚠️ Built, needs fixes C1–C5 from `plan-review.md` (Phase 4). Guide: `docs/modules/coding-sandbox.md` |

---

## Proposed Technology Stack

### Frontend
| Layer | Technology | Reason |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | File-based routing, SSR, modern React patterns |
| Language | **JavaScript (ES2022+)** | Team's preferred language, no TS compile overhead |
| Styling | **Tailwind CSS** | Rapid, consistent UI with utility classes |
| Real-time | **WebSocket / Socket.IO client** | Live interview + live coding communication |
| Speech | **Web Speech API + Azure SDK** | Browser-side STT/TTS integration |
| Code Editor | **Monaco Editor** | VS Code-grade in-browser code editor for live coding |
| State | **Zustand** | Lightweight global state management |
| Forms | **React Hook Form** | Managed forms with built-in validation |
| UI Components | **Radix UI primitives** | Accessible, headless components |
| Charts | **Recharts** | Performance dashboards and score visualization |

### Backend
| Layer | Technology | Reason |
|---|---|---|
| Framework | **Python + FastAPI** | Async, fast, Pydantic-native, great for AI workloads |
| Language | **Python 3.11+** | Modern async support, excellent AI library ecosystem |
| Real-time | **FastAPI WebSockets** | Native support, integrates with async architecture |
| Validation | **Pydantic v2** | Schema enforcement across API and agent boundaries |
| Task Queue | **Celery + Redis** (later) | Background agent tasks (company research, report gen) |
| ORM/ODM | **Motor (async Cosmos DB)** or **SQLAlchemy** | Depends on DB choice |
| Testing | **Pytest + httpx** | Async API testing |

### AI / Azure
| Layer | Technology | Reason |
|---|---|---|
| LLM | **Groq**: `openai/gpt-oss-120b` (interviewer, reports, Mentor) · `openai/gpt-oss-20b` (answer evaluation, high-volume calls) | Every LLM call in the system, one provider and one key. Free tier; the Mentor is already calibrated on it. |
| Code Execution | **Piston (self-hosted, Azure VM)** | Sandboxed execution for python, c, c++, java, javascript. Candidate code never runs on the app server. |
| STT | **Azure AI Speech SDK** | Speech-to-text for voice interviews |
| TTS | **Azure AI Speech SDK** | Text-to-speech for AI interviewer voice |
| Mentor RAG | **Chroma + HF `all-MiniLM-L6-v2`** (via `rag_tool`) | Interview-history retrieval for the Mentor. Moves to Azure AI Search later behind `gateway.search()`. |
| Search/Retrieval | **Azure AI Search** (Phase 3) | Company knowledge and JD indexes |
| Agent loop | **Hand-rolled ReAct on Groq tool calling** | Interview agent + prep agents; no agent framework |

### Data / Infrastructure
| Layer | Technology | Reason |
|---|---|---|
| Primary DB | **Azure Cosmos DB (MongoDB API)** | Flexible document schema, evolving data model |
| File Storage | **Azure Blob Storage** | Resumes, JDs, audio, generated reports |
| Secrets | **Azure Key Vault** | API keys, DB credentials |
| Hosting (BE) | **Azure App Service** | Simple FastAPI deployment, no container orchestration needed |
| Hosting (FE) | **Azure Static Web Apps** | Next.js deployment with CDN |

### Developer Tooling
| Tool | Purpose |
|---|---|
| Git + GitHub | Version control |
| GitHub Actions | CI/CD pipelines |
| `.env` files + Azure Key Vault | Configuration management |
| `pytest` | Backend testing |
| `jest` + `testing-library` | Frontend testing |

---

## Project Structure (Repository Layout)

```text
Agentic Interview Coach/
│
├── frontend/                          # Next.js App (initialised in Phase 0)
│   ├── prototypes/coding-sandbox/     # Built: vanilla sandbox UI, reference for CodingLayout
│   ├── app/                           # App Router pages
│   │   ├── (auth)/                    # Auth group: login, register
│   │   ├── (app)/                     # Protected group
│   │   │   ├── dashboard/
│   │   │   ├── mentor/                # AI Mentor chat (replaces preparation)
│   │   │   ├── interview/
│   │   │   │   ├── configure/
│   │   │   │   ├── session/[sessionId]/
│   │   │   │   └── report/[reportId]/
│   │   │   └── profile/
│   │   ├── layout.js
│   │   └── page.js                    # Landing page
│   ├── components/                    # Reusable UI components
│   │   ├── ui/                        # Primitive components (buttons, inputs)
│   │   ├── interview/                 # Interview-specific components
│   │   ├── mentor/                    # AI Mentor chat components
│   │   ├── voice/                     # Voice UI components
│   │   └── charts/                    # Score/progress charts
│   ├── hooks/                         # Custom React hooks
│   ├── lib/                           # Utility functions, API client
│   ├── store/                         # Zustand state stores (authStore, interviewStore, mentorStore)
│   └── public/                        # Static assets
│
├── backend/                           # FastAPI Application
│   ├── app/
│   │   ├── main.py                    # FastAPI app entry point
│   │   ├── config.py                  # Settings and environment config
│   │   ├── dependencies.py            # FastAPI dependency injection
│   │   │
│   │   ├── api/                       # Route handlers
│   │   │   ├── v1/
│   │   │   │   ├── auth.py
│   │   │   │   ├── users.py
│   │   │   │   ├── profiles.py
│   │   │   │   ├── mentor.py          # /mentor/message, /mentor/conversations
│   │   │   │   ├── interviews.py
│   │   │   │   ├── questions.py
│   │   │   │   ├── reports.py
│   │   │   │   ├── code.py            # /code/execute (practice runs, ungraded)
│   │   │   │   └── ws.py              # WebSocket endpoints
│   │   │
│   │   ├── core/                      # Core domain logic
│   │   │   ├── interview/
│   │   │   │   ├── engine.py          # Interview orchestrator
│   │   │   │   ├── state_machine.py   # Interview state management
│   │   │   │   ├── question_engine.py # Question selection (bank + LLM)
│   │   │   │   ├── adaptation_engine.py
│   │   │   │   ├── context_builder.py # Build context for LLM calls
│   │   │   │   └── report_generator.py
│   │   │   │
│   │   │   ├── mentor/                # AI Mentor + RAG engine
│   │   │   │   ├── rag_tool/          # ✅ Built: chunking, retrieval, Mentor prompt, citations
│   │   │   │   ├── mentor_agent.py    # Loads conversation, calls RagService.answer(), persists turn
│   │   │   │   └── indexer.py         # to_rag_report() adapter + index on REPORT_READY
│   │   │   │
│   │   │   ├── coding/                # Live coding
│   │   │   │   ├── sandbox_tool/      # ✅ Built: coding tools + Piston client (fixes in Phase 4)
│   │   │   │   ├── sandbox_client.py  # Single Piston client, called via gateway.execute_code()
│   │   │   │   └── test_harness.py    # Wraps candidate code with test cases (Python first)
│   │   │   │
│   │   │   └── evaluation/
│   │   │       ├── answer_evaluator.py
│   │   │       ├── technical_evaluator.py
│   │   │       ├── behavioral_evaluator.py
│   │   │       └── code_evaluator.py
│   │   │
│   │   ├── agents/                    # Agentic workflows
│   │   │   ├── interview_agent.py     # ReAct loop (see interview-agent-implementation-plan.md)
│   │   │   ├── interview_tools.py
│   │   │   ├── interview_agent_schemas.py
│   │   │   ├── orchestrator.py        # Company prep orchestrator
│   │   │   ├── company_research.py    # Company research agent
│   │   │   ├── jd_analyzer.py        # JD analysis agent
│   │   │   ├── candidate_profiler.py  # Profile retrieval agent
│   │   │   ├── gap_analyzer.py        # Gap analysis agent
│   │   │   └── prep_planner.py       # Preparation plan agent
│   │   │
│   │   ├── gateway/                   # AI Gateway (central abstraction)
│   │   │   ├── ai_gateway.py          # Main AI gateway class
│   │   │   ├── llm_client.py          # Groq client wrapper (chat, tools, JSON output)
│   │   │   ├── speech_client.py       # Azure Speech SDK wrapper
│   │   │   ├── search_client.py       # Azure AI Search wrapper
│   │   │   └── embedding_client.py    # Embedding generation
│   │   │
│   │   ├── voice/                     # Voice processing
│   │   │   ├── stt.py                 # Speech-to-text
│   │   │   ├── tts.py                 # Text-to-speech
│   │   │   ├── streaming.py           # Real-time audio streaming
│   │   │   └── turn_detector.py       # Voice activity detection
│   │   │
│   │   ├── db/                        # Database layer
│   │   │   ├── client.py              # DB connection
│   │   │   ├── repositories/          # Data access objects
│   │   │   │   ├── user_repo.py
│   │   │   │   ├── profile_repo.py
│   │   │   │   ├── interview_repo.py
│   │   │   │   └── mentor_repo.py
│   │   │   └── models/                # Pydantic/DB models
│   │   │
│   │   └── utils/                     # Shared utilities
│   │       ├── security.py            # JWT, password hashing
│   │       ├── logging.py             # Structured logging
│   │       └── exceptions.py          # Custom exception types
│   │
│   ├── scripts/                       # Dev scripts (sandbox_demo.py)
│   ├── tests/                         # Backend tests
│   │   ├── unit/                      # unit/mentor/ holds the rag_tool tests
│   │   ├── integration/
│   │   └── e2e/
│   ├── requirements.txt
│   └── pytest.ini
│
├── prompts/                           # Version-controlled prompts
│   ├── interviewer/
│   │   ├── technical_v1.txt
│   │   └── personal_v1.txt
│   ├── evaluator/
│   │   ├── technical_v1.txt
│   │   └── behavioral_v1.txt
│   ├── mentor/
│   │   ├── mentor_v1.txt              # Mentor chat agent system prompt
│   │   └── rag_indexer_v1.txt         # Chunk formatting for indexing
│   ├── company/
│   │   ├── research_v1.txt
│   │   └── gap_analysis_v1.txt
│   └── report/
│       └── report_generator_v1.txt
│
├── data/                              # Seed data (committed) + local runtime data (ignored)
│   ├── seed/                          # question_bank JSON (incl. coding problems + test cases)
│   └── chroma/                        # Mentor RAG index (runtime, gitignored)
│
├── evaluation/                        # AI system evaluation
│   ├── datasets/
│   ├── agent_eval/
│   └── interview_eval/
│
├── docs/                              # Project documentation
│   ├── implementation_plan.md  architecture.md  flow.md
│   ├── interview-agent-implementation-plan.md
│   ├── plan-review.md                 # What changed vs the previous plan
│   ├── api.md  prompts.md  data_models.md   (to be written)
│   ├── modules/                       # Guides for built modules (rag-tool/, coding-sandbox.md)
│   └── archive/                       # Superseded designs
│
├── .github/
│   └── workflows/
│
├── .env.example
└── README.md
```

---

## Feature Requirements

### Core Features (Must Have — All Phases)

| Feature | Priority | Phase |
|---|---|---|
| Candidate profile creation and management | 🔴 Critical | Phase 0 |
| Authentication and session management | 🔴 Critical | Phase 0 |
| Technical interview engine (text mode) | 🔴 Critical | Phase 1 |
| Interview state machine | 🔴 Critical | Phase 1 |
| Adaptive question selection | 🔴 Critical | Phase 1 |
| Structured answer evaluation | 🔴 Critical | Phase 1 |
| Interview report generation | 🔴 Critical | Phase 1 |
| **AI Mentor (RAG-powered chat)** | 🔴 Critical | Phase 2 |
| **Post-interview RAG indexing pipeline** | 🔴 Critical | Phase 2 |
| **Interview history retrieval (`rag_tool`: Chroma now, Azure AI Search later)** | 🔴 Critical | Phase 2 |
| **Resumable sessions (`SESSION_SNAPSHOT` on reconnect)** | 🔴 Critical | Phase 1 |
| **Graded coding with per-test results** | 🟠 High | Phase 4 |
| **Weak-Area Drill interview (loop closure)** | 🟠 High | Phase 2 / 4 |
| Company research agent | 🟠 High | Phase 3 |
| JD analysis and skill extraction | 🟠 High | Phase 3 |
| Gap analysis | 🟠 High | Phase 3 |
| Company prep plan (surfaced via Mentor) | 🟠 High | Phase 3 |
| Serious Interview mode (Interviewer + Evaluator separation) | 🔴 Critical | Phase 4 |
| Personal/behavioral interview | 🟠 High | Phase 4 |
| STAR evaluation framework | 🟠 High | Phase 4 |
| **Live coding interview with code execution** | 🟠 High | Phase 4 |
| Voice STT integration | 🟡 Medium | Phase 5 |
| Voice TTS integration | 🟡 Medium | Phase 5 |
| Real-time voice turn detection | 🟡 Medium | Phase 5 |

### Enhanced Features (Should Have)

| Feature | Priority | Phase |
|---|---|---|
| Dashboard with performance overview | 🟠 High | Phase 1–2 |
| Practice mode with coaching | 🟠 High | Phase 1 |
| Hybrid question bank + LLM generation | 🟠 High | Phase 1 |
| Mentor-driven next-steps recommendation (post-interview) | 🟠 High | Phase 2 |
| Mentor conversation history | 🟡 Medium | Phase 2 |
| Mentor "Talk to Mentor" CTA on report page | 🟠 High | Phase 2 |
| Mentor citation chips (`[n]` → session report link) | 🟠 High | Phase 2 |
| Per-session token budget in the AI Gateway | 🟡 Medium | Phase 1 (hook) / Phase 6 |
| Company knowledge indexing (Azure AI Search) | 🟡 Medium | Phase 3 |
| Monaco Editor syntax highlighting + multi-language support | 🟠 High | Phase 4 |
| Code execution result shown to candidate in practice mode | 🟡 Medium | Phase 4 |
| Audio retention consent flow | 🟡 Medium | Phase 5 |
| Agent observability and logging | 🟡 Medium | Phase 6 |

### Future / Nice-to-Have Features

| Feature | Phase |
|---|---|
| Streaming real-time STT (low-latency voice) | Phase 5+ |
| Voice + live coding combined (speak while coding) | Future |
| Resume parsing and auto-profile | Future |
| Collaborative real-time coding (Yjs CRDT) | Future |
| Group/peer interview simulation | Future |
| Mentor-assigned structured study plans | Future |
| Mentor follow-through tracking (did candidate act on advice?) | Future |
| Mobile app | Future |

---

## Phase-by-Phase Execution Plan

### Execution Order & MVP Cut

Phase numbers are kept stable so references across docs stay valid, but phases are **built in this order**:

```
Phase 0 → Phase 1 (starting with the walking skeleton, 1.0) → Phase 2 → Phase 4 → Phase 3 → Phase 5 → Phase 6 → Phase 7
```

- **Phase 4 comes before Phase 3.** Coding is mostly built already (`sandbox_tool`) and is a strong demo feature. Company prep is the least essential and most expensive phase. Building 0 → 1 → 2 → 4 closes the full loop (Interview → Report → Mentor → Drill → Interview again) sooner.
- **MVP = Phases 0, 1, 2 and 4, text mode only.** Voice (Phase 5) and company prep (Phase 3) come after the MVP. Voice is the riskiest phase (latency, end-of-speech detection), so it stays off the critical path.
- Phase 6's *upgrade* work comes late, but its foundations (session-ID logging, fake Gateway, evaluator test set) start in Phases 0–1.
- **Phase 7 (UI/UX design) is the last phase.** Until then every phase ships a *functional, test-grade* UI: correct, accessible and responsive enough to use and test, but not designed. Phase 7 is the production design pass over the whole site, done once the features and flows have stopped moving, so the design isn't redone after every phase.

---

### Phase 0 — Foundations & Infrastructure
**Goal**: Establish the project structure, core configuration, authentication, candidate profile system, and database. No AI features yet. Everything else builds on this.

**Duration Estimate**: 1–2 weeks

#### Tasks

**0.1 Repository and Project Setup**
- Initialize Git repository on GitHub
- Set up monorepo structure: `frontend/`, `backend/`, `prompts/`, `data/`, `docs/`
- Set up `.env.example` with all required environment variable keys
- Create `README.md` with project overview and setup instructions
- **Local dev without Azure:** `docker-compose.yml` with the Cosmos DB emulator (or plain MongoDB), the backend and the frontend. With `APP_ENV=local`, the app uses the fake Gateway (0.2) and a local Chroma directory, so `docker-compose up` runs the whole app with no cloud keys.

**0.2 Backend Foundation**
- Initialize FastAPI project with async support
- Configure Pydantic v2 settings (environment-based config)
- Set up structured logging with context (request ID, user ID, **session ID**) **from day one**. Every log line during an interview carries its `session_id`; debugging the agent loop without it is painful.
- Create `custom exception handlers` and standard error response schema
- Implement `AI Gateway` stub (generate, stream, embed, transcribe, synthesize — all stubbed initially)
- **Fake Gateway for tests and local dev:** `FakeAIGateway` implements the same interface and returns scripted replies (LLM text, structured JSON, tool calls, `ExecutionResult`s), like `rag_tool`'s `FakeEmbeddings`. Agent loops, the state machine and whole interviews can then be tested quickly, for free and deterministically. Keep a few real-model runs for prompt quality only.
- Set up Azure Key Vault integration for secrets (or `.env` for local)

**0.3 Database Setup**
- Connect to Azure Cosmos DB (MongoDB API)
- Create all core collections:
  - `users`, `candidate_profiles`, `roles`, `companies`
  - `interview_sessions`, `interview_questions`, `candidate_answers`
  - `evaluations`, `interview_reports`, `agent_runs`
  - `mentor_conversations`
- Implement repository pattern — one repository class per entity
- Write DB connection health check endpoint

**0.4 Authentication**
- Implement JWT-based authentication (register, login, refresh token)
- Password hashing with bcrypt
- Protected route middleware
- Role-based access (user, admin)

**0.5 Candidate Profile API**
- `POST /api/v1/profiles` — create candidate profile
- `GET /api/v1/profiles/me` — fetch my profile
- `PUT /api/v1/profiles/me` — update profile
- Profile schema: name, education, experience level, target role, company, skills, preferences (input/output mode)

**0.6 Frontend Foundation**
- Initialize Next.js 14 (App Router) with JavaScript and Tailwind CSS
- Set up design system: color palette, typography, spacing tokens
- Configure Zustand for global state (auth, user profile, interview session, mentor)
- Implement API client (`lib/api.js`) with auth token handling
- Create auth pages: Landing, Login, Register
- Create profile setup wizard (multi-step form)
- Create dashboard shell (layout with sidebar navigation)

**0.7 Mentor RAG + Question Bank Seed Setup**
- Configure `CHROMA_PATH` / `CHROMA_COLLECTION` and create one `RagService` at startup (see `docs/modules/rag-tool/INTEGRATION.md`). The index schema (chunk IDs + metadata) is already fixed by `rag_tool`.
- Create `data/seed/question_bank/*.json` and a seed script that upserts it into Cosmos `question_bank`. Include the 3 coding problems from `sandbox_tool` (`two_sum`, `reverse_linked_list`, `valid_parentheses`) with their test cases.
- Azure AI Search `company-knowledge` index is deferred to Phase 3.

**📌 Suggestions for Phase 0**
- Use `pydantic-settings` for config management — it natively reads `.env` files and validates all required vars at startup. This catches missing secrets early.
- Define your API response envelope standard early: `{ success, data, error, meta }`. All endpoints should use this.
- Use `motor` (async MongoDB driver) from day one — you cannot switch to async later without rewriting.
- Seed the database with a test user and test profile to make frontend development faster.
- Document the `candidate_profile` schema thoroughly — it is the spine of the entire system. Every agent, interview engine, and evaluator will read from it.
- Run the existing `rag_tool` tests (`cd backend && pytest -q`) in CI from day one so the built module stays green while everything around it is added.

---

### Phase 1 — Core Interview Engine (Text Mode)
**Goal**: Build the technical interview engine with text input, adaptive questioning, structured evaluation, and report generation. This is the product's foundation.

**Duration Estimate**: 2–3 weeks

#### Tasks

**1.0 Walking Skeleton (do this first, ~3–4 days)**
- Before building out 1.1–1.11, get **one text interview working end to end** with the thinnest possible version of each piece:
  - one hard-coded question → `ANSWER` over the WebSocket → a basic evaluator call → a minimal saved report → `indexer.to_rag_report()` → `rag_tool.index_report()` → one Mentor question that cites that report
- Use the fake Gateway (0.2) first, then switch to the real one.
- The goal is to surface integration problems early (WebSocket lifecycle, state persistence, report shape, RAG adapter) rather than at the end of Phase 2. Every later task in this phase replaces one skeleton piece with the real one.
- ✅ **Done (2026-09-26)**, verified live with Groq + Hugging Face. Thin pieces to replace next:

| Skeleton piece (file) | Replaced by |
|---|---|
| ~~Fixed bank question, one question per interview~~ ✅ replaced in 1.1: `core/interview/question_engine.py`, 1–5 questions | ✅ 1.2 full config (type, focus topics, serious mode) |
| ~~Direct state writes with a compare-and-set guard~~ ✅ replaced in 1.3: `core/interview/state_machine.py` | 1.6 feeds agent actions through `next_state_for_action()` |
| ~~Bank text used verbatim as the interviewer's message~~ ✅ replaced in 1.6: the interviewer agent writes the opening, transitions, follow-ups and closing | — |
| ~~Technical evaluator only~~ ✅ replaced in 1.7: technical + behavioral (STAR) evaluators, evaluator test set | Phase 4 coding evaluator |
| ~~Deterministic report, no LLM~~ ✅ replaced in 1.10: Groq writes the words, the numbers stay computed, and the deterministic report is the fallback | — |
| ~~Mentor with client-sent history, no persistence~~ ✅ replaced in Phase 2: saved conversations (`mentor_conversations`), background indexing | — |

**1.1 Question Bank (Hybrid)**
- Questions live in the Cosmos `question_bank` collection, seeded from `data/seed/` (Phase 0.7). Coding problems carry `test_cases` (visible + hidden), which the graded harness needs.
- `question_repo` supports lookup by `type`, `topic`, `difficulty`, `roles`, excluding `asked_question_ids`.
- On a bank miss, `QuestionEngine` generates a question via `AIGateway.generate_structured()` in the same `Question` schema: `id, type, topic, subtopic, difficulty, roles, expected_concepts, evaluation_rubric, follow_up_possibilities, source`. Good generated questions can be saved back to the bank (`source: llm_generated`).
- ✅ **Done (2026-09-26)**, together with a thin 1.4:
  - `QuestionEngine.next_question()` ranks bank candidates by: a topic not yet covered this session, then not asked in the candidate's recent sessions, then closest to the target difficulty, then a random draw seeded per session and turn.
  - The profile's free-text role maps to a bank role key (`role_key()`). Difficulty is the profile preference, or comes from experience level when set to adaptive.
  - On a bank miss, Groq (`gpt-oss-120b`, `prompts/interviewer/question_generation_v1.txt`) writes a question on the next uncovered role topic.
  - Generated questions are kept with the session only. Saving them back to the bank waits for a quality gate (evaluator scores or human review).
  - Interviews run 1–5 questions through `NEXT_TOPIC`. They wrap up early when the token budget runs low; a failed question fetch mid-interview also ends it, using the answers so far.
- *Later add-on:* a `QuestionResearcher` agent that finds real-world questions and adds them to the bank. It isn't on the critical path.

**1.2 Interview Configuration API**
- `POST /api/v1/interviews` — create interview session
- Configuration schema: interview_type (technical/personal), role, experience_level, company (optional), difficulty, input_mode, output_mode, interview_mode (practice/serious)
- Validate configuration and store in DB
- Return `session_id` to frontend
- ✅ **Done (2026-09-27)**:
  - `InterviewConfigRequest` (`db/models/interview.py`) takes `interview_type`, `interview_mode`, `role`, `experience_level`, `company`, `difficulty`, `input_mode`, `output_mode`, `question_count` (1–5) and `focus_topics` (≤ 5, for a Weak-Area Drill). Unknown fields are rejected.
  - Any field left out comes from the profile. `target_difficulty` is stored on the session; "adaptive" starts from the experience level, and 1.8 will move it.
  - Choices in the schema that aren't built yet (behavioral → 1.7, coding → Phase 4, voice → Phase 5) return 422 `option_unavailable` with a readable reason, so the contract won't change when they ship.
  - `GET /api/v1/interviews/options?role=` returns the profile defaults, the role's topics (usual topics for the role, then bank topics) and the unavailable choices.
  - Serious mode: no `EVALUATION` events and no evaluations in the snapshot until `REPORT_READY`. The report always shows them.
  - The Weak-Area Drill link on the report (`/interview/configure?focus=…&role=…`) is in too, since it's the only entry point for `focus_topics`.

**1.3 Interview State Machine**
- Implement states: `SETUP → INTRODUCTION → QUESTION → WAITING_FOR_RESPONSE → EVALUATING → FOLLOW_UP_DECISION → NEXT_TOPIC → INTERVIEW_COMPLETE → EVALUATION → REPORT`
- State transitions are handled by the backend — not the LLM
- Persist full state to DB on every transition
- Expose state via `GET /api/v1/interviews/{session_id}/state`
- ✅ **Done (2026-09-27)**:
  - `core/interview/state_machine.py`: `State` enum, `TRANSITIONS`, pure `can_transition()` / `allowed_next()` / `next_state_for_action()` (`ACTION_TO_STATE` + the wrap-up override), and `InterviewStateMachine.transition()`, which validates every move and then persists it with compare-and-set.
  - The table adds two failure paths to architecture.md §8.2: `EVALUATING → WAITING_FOR_RESPONSE` (the evaluation failed) and `NEXT_TOPIC → INTERVIEW_COMPLETE` (no next question). The documented `EVALUATION → REPORT` tail is `GENERATING_REPORT → REPORT_READY`.
  - The engine walks every state, and each one is saved with a capped `state_history`.
  - `_drive()` moves a session forward from any state. States fall into three groups: SETTLED, WORKING (another worker may be busy: wait, and take over once it is stale after `STALE_WORK_SECONDS`, default 120 s) and DRIVEN (safe to redo, because the losing connection just loses the compare-and-set).
  - A connection that loses a race waits, then re-syncs with a fresh `SESSION_SNAPSHOT`.
  - WebSocket sends are best-effort, so the engine finishes its step even when the browser has gone.

**1.4 Question Engine**
- `QuestionEngine` class: selects next question based on current state
- Selection factors: role, difficulty, topics_covered, candidate_performance, previous_questions
- Approach: bank first (matching topic, difficulty, role, not already asked); on a miss, LLM generation. Either way, the Interviewer Agent phrases the question conversationally.
- LLM generation: call `AIGateway.generate_structured()` with role, difficulty and topic context. It returns a question in the standard schema.

**1.5 AI Gateway — LLM Integration**
- Connect `AIGateway.generate()` to Groq (`GROQ_INTERVIEW_MODEL`, default `openai/gpt-oss-120b`; `GROQ_FAST_MODEL` `openai/gpt-oss-20b` for `evaluate_answer`)
- Implement `generate_structured()` — JSON output via Groq's `response_format`, always validated against the Pydantic schema, one retry on failure (verify which JSON modes the gpt-oss models support on Groq before relying on strict schema mode)
- Implement token usage logging
- Handle rate limits and retries with exponential backoff
- Support temperature configuration per call type
- Implement `generate_with_tools()` for the Interview Agent's ReAct loop (Groq `tools` parameter)
- **Token budget hook**: `_log_usage()` adds up tokens per `session_id` and per user. `budget_remaining(session_id)` is read by `AdaptationEngine._should_wrap_up()`, so going over `SESSION_TOKEN_BUDGET` triggers a graceful wrap-up rather than an error.

**1.6 Interviewer Agent**
- Receives interview context (profile + state + question)
- Generates conversational introduction to the question
- Generates natural follow-up questions
- Does **not** make state decisions — only generates dialogue
- ✅ **Done (2026-09-28)** in `app/agents/interview_agent.py`:
  - **Opening:** one `gpt-oss-120b` call writes the introduction. The bank or generated question follows word for word, so the evaluator grades exactly what was asked.
  - **After each answer**, the agent runs a ReAct loop on `generate_with_tools(tool_choice="required")`: at most 4 steps, read-only `get_performance_summary` / `get_question_details`, ending in `submit_decision`. It proposes `deliver_follow_up`, `deliver_question` or `wrap_up`, with a lead-in line, a follow-up it writes from the actual answer, and the points that follow-up should be graded on.
  - **Validation.** The engine offers only the moves `allowed_actions()` permits and checks the proposal with `next_state_for_action()`. An invalid proposal is sent back once; if the second is also invalid, the engine falls back to the AdaptationEngine. The adaptation engine still sets difficulty and drill topics. An agent outage falls back to plain wording.
  - **No scores reach the agent.** `core/interview/context_builder.py` passes only tiers and qualitative notes, and the adaptation reasons (which contain scores) are rewritten first.
  - **Recorded runs.** Every run goes into `agent_runs`: outcome, steps, tool calls, rejections, latency.
  - **Setting.** `INTERVIEW_AGENT` switches the agent on or off.

**1.7 Answer Evaluation Engine**
- `TechnicalEvaluator`: evaluates technical answers across dimensions — Problem Understanding, Approach, Correctness, Algorithm, Complexity, Edge Cases, Communication, Follow-up Handling
- `BehavioralEvaluator`: evaluates behavioral answers — STAR framework (Situation, Task, Action, Result) + Communication, Clarity, Specificity, Ownership
- Output: structured `EvaluationResult` JSON (scores per dimension + strengths + weaknesses + recommendations)
- Store evaluation in DB linked to the answer and session
- **Model answer (practice mode):** the evaluator also returns `model_answer_outline`, a short "a strong answer would cover…" list built from the question's `expected_concepts` and rubric. It's shown after each practice answer and kept out of the context in Serious mode.
- **Evaluator test set:** `evaluation/datasets/evaluator_golden.jsonl` holds 20–30 answers per evaluator (weak → strong) with scores you set by hand. `evaluation/interview_eval/run_evaluator_eval.py` re-scores them and reports the gap (mean absolute error, rank agreement). Run it on **every** evaluator prompt change; a prompt change that worsens it doesn't ship. Scoring accuracy is what users trust, so this starts now rather than in Phase 6.
- ✅ **Done (2026-09-27)**:
  - **Two evaluators.** `core/evaluation/answer_evaluator.py` picks the evaluator from the question type and gives both the same result shape.
    - Technical keeps `technical_v1` (correctness, depth, communication) for conceptual questions. The problem-solving dimensions listed above (approach, algorithm, complexity, edge cases) belong to the Phase 4 coding evaluator.
    - Behavioral uses `prompts/evaluator/behavioral_v1.txt`: situation, task, action, result, specificity, ownership and communication (clarity folded into communication). It is calibrated to mark down hypothetical answers, disguised strengths and blame.
  - **Behavioral interviews are enabled.** Competencies (ownership, collaboration, …) are the topics, so drills, reports and the Mentor work unchanged. Groq writes a behavioral question when the bank runs out (`prompts/interviewer/behavioral_question_generation_v1.txt`).
  - **Test set.** 48 hand-scored answers (24 per evaluator, 8 per question) run from "I don't know" and injection attempts up to excellent answers, each with a note explaining its score. The runner reports MAE, bias, Spearman, same-question pairwise order and tier agreement, and exits 1 past `--max-mae 1.5` / `--min-spearman 0.8`.
  - **Baseline** on `gpt-oss-20b`:

    | Evaluator | MAE | Bias | Spearman | Pairwise order | Tier agreement |
    |---|---|---|---|---|---|
    | technical | 0.62 | +0.21 | 0.975 | 0.96 | 0.96 |
    | behavioral | 0.75 | +0.17 | 0.94 | 0.91 | 0.83 |

**1.8 Adaptive Question Selection**
- After each evaluation, compute running `performance_score` per topic
- QuestionEngine uses this to: increase difficulty on strong answers, decrease on weak, trigger follow-up questions on partial answers, avoid repeating topics
- Implement `AdaptationEngine` as a separate component with unit-testable logic
- ✅ **Done (2026-09-28)**:
  - **`core/interview/adaptation_engine.py`** (pure) exposes `decide_next_action(evaluation, question, session, budget_remaining, …)` and returns a `NextAction`: follow_up, next_topic or complete, plus a difficulty delta, target difficulty, suggested topic, reason and follow-up text. Rules, in order:
    1. Token budget nearly spent → complete.
    2. A partial (adequate) answer to a main question → one follow-up, taken from the question's `follow_up_possibilities`.
    3. Question count reached → complete.
    4. Otherwise, next topic.
  - **Difficulty:** in adaptive mode, strong → +1 and weak → −1, bounded at easy and hard; a fixed difficulty stays fixed. It applies from the next main question.
  - **`performance_vector`** keeps a running mean per topic. In a drill, once every focus topic is covered, the weakest comes back via `suggested_topic`, which `QuestionEngine` ranks first.
  - **Engine:** `_decide()` feeds the decision through `next_state_for_action()`. A follow-up is `FOLLOW_UP_DECISION → QUESTION`, graded against the parent question's concepts, and it does not count towards `question_count`.
  - **State and settings:** `last_decision`, `target_difficulty`, `performance_vector` and `follow_ups_asked` appear on `/state`. `INTERVIEW_FOLLOW_UPS` is an off switch.
  - **Difficulty misses:** a bank that lacks the target difficulty now counts as a miss, so Groq writes a question at that level. If generation fails, the closest bank question is used.
  - **Not yet:** a time limit (the config has none) and follow-ups written from the actual answer (1.6 interviewer agent).

**1.9 WebSocket Interview Flow**
- `WebSocket /ws/interview/{session_id}` — real-time communication
- Message types: see `architecture.md` §13 (single source of truth for event names)
- Frontend sends `ANSWER` event → backend processes → sends `EVALUATION` (practice only) + `QUESTION`
- State is stored in DB, not in WebSocket connection — reconnection-safe
- **On every (re)connect** the server sends `SESSION_SNAPSHOT { state, current_question, transcript, coding_problem?, draft_code? }` so the UI rebuilds exactly where it left off. The frontend saves the editor draft to the session every 10s (debounced) so `draft_code` survives a disconnect.
- ✅ **Done (2026-09-28)** for text mode; coding and voice events arrive with Phases 4 and 5:
  - **Protocol:** `app/api/ws_protocol.py` has typed inbound messages, a 64,000-character frame limit, a per-connection rate limit (ERROR at 30 messages per 10 s, close `4429` at 90), and outbound payload models.
  - **Contract test:** replays practice and serious interviews and checks every server event against those models.
  - **Drafts:** `ANSWER_DRAFT` autosaves the answer being typed; it is restored from the snapshot after a reload or drop and cleared on submit.
  - **Hints:** `HINT_REQUEST` → `HINT` in practice mode, one per question. The interviewer agent writes it on the fast model (`prompts/interviewer/hint_v1.txt`), built on the draft; otherwise a deterministic nudge points at a concept the draft hasn't touched. Hints appear in the transcript and the report.
  - **Client:** heartbeat (a PING every 25 s; the connection is replaced after 10 s of silence), reconnects with backoff that never give up, waiting while offline and resuming when the network or tab returns, and a "Try again" button for fatal failures.

**1.10 Interview Report Generator**
- After `INTERVIEW_COMPLETE`, trigger report generation
- Report structure: Overall Score, Technical Score, Communication Score, Per-topic Breakdown, Strong Areas, Weak Areas, Recommendations, Suggested Next Preparation
- Store report in DB; expose via `GET /api/v1/reports/{report_id}`
- ✅ **Done (2026-09-28), completing Phase 1:**
  - **Two layers in `core/interview/report_generator.py`:**
    - `build_report()` is deterministic: every score (overall plus technical/communication or STAR story/communication), per-topic and per-question scores, dimension averages, stats, and a fallback narrative.
    - `write_narrative()` has Groq `gpt-oss-120b` (`prompts/report/report_v1.txt`) write the summary, strong areas, weak areas with reasons, concrete recommendations, and an estimated-days study plan. It sees the evaluator's notes per answer, never the answers.
  - **`apply_narrative()` validates the result:** topics must be ones covered (recommendations may say `general`); severity and priority come from the real topic scores; if every weak area names a wrong topic, the evaluator-based ones stay.
  - **Fallback:** a writer failure or invalid output leaves the deterministic report (`narrative_source: fallback`).
  - **Setting:** `REPORT_WRITER` switches the writer on or off.
  - **Report page:** the sub-scores under the hero number, recommendations with topic tags, a "Next steps" card, and a note on what AI wrote.

**1.11 Frontend — Interview UI**
- Interview configuration page (role, type, difficulty, mode selector)
- Interview session page:
  - **Practice Mode**: shows question, text input, optional hints, immediate feedback including the **model answer outline**
  - **Serious Mode**: clean UI — interviewer avatar/name, question display, text area, timer, no scores visible
- Report page: score cards, charts, breakdown, **"Talk to Mentor"** CTA
- **Transcript replay** on the report page: each question, the candidate's answer and the evaluator's notes (strengths, weaknesses, model answer outline) side by side. Built from data already stored (`interview_questions`, `candidate_answers`, `evaluations`); no new AI calls.
- ✅ **Done (2026-09-28)**:
  - **Serious room:** interviewer avatar and name, role and company, progress and total elapsed time. Only the current question is on stage (follow-ups labelled); earlier turns fold into "Earlier in this interview". A timer, no scores, no hints.
  - **Question timer** (both modes; compact in practice): it runs from the server's `asked_at`, corrected by `server_time`, so it survives a reload. Suggested time: ~3 min technical, ~4 min behavioral, +1 min hard, 2 min follow-up. Past it, the timer says so in words as well as colour.
  - **Answers** record `time_taken_s`.
  - **Report:**
    - the overall score as the hero number, with its tier
    - stat tiles: answers (and follow-ups), average time per answer, hints used, interview length
    - three `ScoreBars` charts: by question, by topic, by dimension (technical dimensions or STAR parts)
    - the existing summary, strengths and weaknesses, recommendations and transcript
    - **new report fields:** `question_scores`, `dimension_scores` and `stats` (Phase 1b keeps them)
  - **Charts** follow the dataviz rules: one validated hue per theme (`--chart-mark` `#5b5bd6` light / `#7a7aee` dark; the dark primary failed the lightness band), thin rounded bars, hairline grid, tier guide lines named in a caption, the value at the tip in text colour, a tooltip on hover and keyboard focus, and a table view.

**📌 Suggestions for Phase 1**
- Do the walking skeleton (1.0) before anything else. It's the cheapest way to find integration problems.
- Build the `InterviewStateMachine` as a pure class first — test it independently with no AI calls. State transitions should be deterministic and fully tested before LLM is involved.
- Separate `InterviewerAgent` (what to ask) from `EvaluatorAgent` (how they did). Two prompts, two responsibilities. This is the key architectural decision.
- For the Question Engine, implement a simple heuristic selection first (rule-based difficulty scaling), then upgrade to LLM-assisted selection in Phase 4. Don't over-engineer it in Phase 1.
- Use `structured outputs` / `function calling` for all evaluation calls. Never ask the LLM to "return a JSON" in free text — it will break.
- Store every raw LLM response alongside the parsed result in DB for debugging. You will need this when evaluating AI quality later.
- The `context_builder.py` is critical. Define exactly what context each agent receives. Over-stuffing context = inconsistent output + high cost.

---

### Phase 2 — AI Mentor & RAG Engine
**Goal**: Build the AI Mentor — the RAG-powered coaching assistant that has access to all of the candidate's past interview history. After every completed interview, the report and evaluations are indexed. The Mentor retrieves this data to give genuinely personalized, history-grounded coaching rather than generic advice.

> [!IMPORTANT]
> This is the core differentiator of the product. The Mentor is what makes the platform feel like a real coach instead of another quiz tool. **Build it immediately after Phase 1** so that there is a complete end-to-end loop: Interview → Report → Mentor → Interview Again.

**Duration Estimate**: ~1 week (the RAG core is already built in `rag_tool`; this phase integrates it)

> [!NOTE]
> **Already done in `rag_tool`** (`backend/app/core/mentor/rag_tool/`): semantic chunking with deterministic IDs (`{session_id}:summary`, `:question:{id}`, `:recommendations`), idempotent upsert, per-user filtering, intent-routed retrieval (specific → similarity with a 0.8 distance cutoff; vague → 2 most recent sessions; comparison → N most recent sessions), at most 2 chunks per session, a guardrailed Mentor prompt (grounding, prompt-injection resistance, scope limits), and `[n]` citations with `sources`. Tests: `backend/tests/unit/mentor/`.

#### Tasks

> [!NOTE]
> **✅ Done (2026-09-29)**, verified live on Groq + Hugging Face (report indexed in the background ~2 s after it's ready; Mentor replies ~1.5–13 s). 423 backend tests. What was built, and where it differs from the plan below:
> - **2.1** `ReportIndexer` (`core/mentor/indexer.py`): the engine schedules indexing once `INTERVIEW_COMPLETE` is sent; a failure is retried after 2 s, 10 s and 30 s; reports still unindexed are picked up by a sweep at startup and whenever the candidate opens the Mentor (`GET /mentor/welcome`). Chunk IDs stay on the report (`rag_chunk_ids`).
> - **2.2** `AIGateway.embed()` runs an embedding provider (`gateway/embeddings.py`, HF MiniLM today) with usage logging; rag_tool embeds through it (`GatewayEmbeddings`). **Deviation:** there is no `gateway.search()`. Vector search stays inside rag_tool: it's a local Chroma query that must always filter on `user_id`, and the Azure AI Search move replaces rag_tool's store plus the embedder, nothing else.
> - **2.3** `MentorAgent` (`core/mentor/mentor_agent.py`): prompt `prompts/mentor/mentor_v1.txt` (rag_tool's prompt plus a practice-request rule and a note that earlier citations were removed); rag_tool gained an optional `system_prompt` argument (default unchanged). The last 8 turns are sent with their `[n]` removed, so the model can't reuse stale numbers. A drill or study question gets a **Weak-Area Drill** action (`/interview/configure?focus=…&role=…&type=…`): the latest score per topic across the last 3 reports of the latest interview's type, below 7.5, weakest first, up to 3. The prompt is told which topics the button covers, so the reply and the button agree. rag_tool's generic-question routing now also covers "drill/quiz/test me (on my weak spots)".
> - **2.4** `mentor_conversations` (`db/repositories/mentor_repo.py`): one document per conversation with the turns embedded. A turn (question + reply) is written only after the reply, so a failed call leaves nothing half-saved. Each reply stores `retrieved_chunks` (with `report_id`), `actions`, `intent`, `prompt_version` and `latency_ms`. 200 messages per conversation, then 409 `conversation_full`.
> - **2.5** `POST /mentor/message {message, conversation_id?}`, `GET /mentor/conversations`, `GET /mentor/conversations/{id}` (another candidate's reads as 404), plus `GET /mentor/welcome` (report count, latest report's score and weakest/strongest topic, reports still being indexed).
> - **2.6** `/mentor?c=<id>`: `MentorSidebar` (a column on desktop, a History toggle on phones), `MentorWelcome` (no reports: what the Mentor does + "Start your first interview"; otherwise a greeting from the latest report, built without an LLM call, and four starters), `ChatBubble` with citation chips and the drill button, `MentorInput` (Enter sends, Shift+Enter new line), `store/mentorStore.js`, and "Try again" that keeps the failed message.
> - **Eval:** `evaluation/mentor_eval/run_mentor_eval.py` runs the 19 rag_tool cases plus 2 new ones through this stack; all automatic checks pass, and declines and injection resistance read correctly.
> - **Follow-ups that point back (fixed, approved 2026-09-29):** "which of *those* should I fix first?" after generic questions used to find nothing and get the no-data reply. Now, mid-conversation, when a question finds nothing of its own, it's answered from the excerpts the previous grounded reply used: sources carry `chunk_id`, `MentorAgent` passes them as `MentorChatRequest.previous_chunk_ids`, and rag_tool reads them back with the usual `user_id` filter. Its own hits always win; a new conversation never uses it. Eval case `followup_pronoun_mid_conversation`.

**2.1 Report → RAG Adapter + Indexing Trigger**
- Implement `core/mentor/indexer.py::to_rag_report(report, evaluations, questions) -> rag_tool.InterviewReport`:
  - `candidate_id` → `user_id`, `generated_at` → `created_at`, `config.interview_type` → `interview_type`
  - `scores.overall` → `overall_score`; `strong_areas` → `strengths`; `weak_areas[].topic + reason` → `weaknesses`
  - each evaluation + its question → `QuestionFeedback` (score, strengths, weaknesses, feedback, suggestion = first recommendation)
  - `recommendations[].action` → `recommended_study_areas`
- Trigger `rag.index_report(...)` as a **background task** when the session enters `REPORT_READY`. On failure, keep the Cosmos report and retry later (the upsert is idempotent).
- Store the chunk IDs on the `interview_reports` document for traceability.

**2.2 Gateway Wiring**
- `gateway.embed()` and `gateway.search()` delegate to `rag_tool`'s HF embeddings and Chroma for now. Moving to Azure AI Search later only changes these two methods.
- The Mentor's LLM call goes through the gateway (Groq `openai/gpt-oss-120b`), so token logging and budgets apply.

**2.3 Mentor Agent**
- Implement `mentor_agent.py`:
  - `chat(candidate_id, user_message, conversation_id)` → `MentorResponse`
  - Flow: load the last 8 turns from `mentor_conversations` → `RagService.answer(MentorChatRequest(user_id=candidate_id, message, history), invoke_llm=gateway…)` → store the turn with `retrieved_chunks = sources`
  - `candidate_id` always comes from the JWT, never from the request body
  - System prompt: `rag_tool.service.SYSTEM_PROMPT` is the current Mentor prompt. Move it to `prompts/mentor/mentor_v1.txt` and load it by version ID (principle 6).
  - Mentor handles:
    - "What should I study?" → retrieves weak areas, ranks by frequency + recency
    - "How did I do overall?" → summarizes performance trends
    - "I struggle with DSA" → retrieves DSA-specific evaluation chunks
    - "Prepare me for Google" → triggers Company Prep Agent workflow (Phase 3)
    - "Drill me on my weak spots" → replies with a **Weak-Area Drill** link (`/interview/configure?topics=…`) built from the latest report's `weak_areas`
  - First-time (no history): `rag_tool` returns its no-data message. The UI shows `MentorWelcome` with a CTA to take a first interview.

**2.4 Mentor Conversation Persistence**
- Store every turn in `mentor_conversations` collection:
  - `role`, `content`, `timestamp`, `retrieved_chunks` (for traceability)
- Support multi-turn conversation history — Mentor sees last N turns in context
- New conversation starts fresh but Mentor still has RAG access to all historical data

**2.5 Mentor API**
- `POST /api/v1/mentor/message` — send message, get Mentor response (streaming optional)
- `GET /api/v1/mentor/conversations` — list past conversations
- `GET /api/v1/mentor/conversations/{id}` — get full conversation history

**2.6 Frontend — Mentor Chat UI**
- Route: `/mentor`
- Components:
  - `MentorChat.jsx` — main chat container
  - `ChatBubble.jsx` — per-message display (user vs. Mentor). Renders `[n]` as **citation chips** (date · topic from `sources[n-1]`) linking to `/interview/report/{reportId}`
  - `MentorInput.jsx` — text input + send button
  - `MentorWelcome.jsx` — shown when candidate has no interview history yet
  - `MentorSidebar.jsx` — list of past conversations
- First-load behavior:
  - Has history → Mentor proactively greets with personalized insight from last report
  - No history → `MentorWelcome` with CTA to take first interview
- Navigation: "Talk to Mentor" CTA on every report page routes here
- Mentorstore (Zustand): `conversationId`, `messages`, `isLoading`, `sendMessage()`, `loadHistory()`

**📌 Suggestions for Phase 2**
- The RAG indexing **must be async** — don't block the report API response waiting for indexing. Trigger it as a background task after `REPORT_READY`.
- Filtering by `candidate_id` is already enforced on every Chroma query inside `rag_tool` (`where={"user_id": …}`). Keep a cross-user leakage test in the integration suite.
- Don't retune retrieval without evidence. The 0.8 distance cutoff was calibrated against real MiniLM output; off-topic refusal is enforced by the prompt, not the cutoff.
- The Mentor system prompt is the most important prompt in the system. The current one in `rag_tool` covers grounding, citations, injection resistance and scope; iterate on it against an eval set in `evaluation/`.
- Store `retrieved_chunks` in every Mentor response in DB. This gives you explainability and debugging capability from day one.
- Build the `MentorWelcome` state carefully — a first-time candidate with no history should feel welcomed, not confused. The CTA to take a first interview should be prominent.

---

### Phase 3 — Company Preparation Agent (Surfaced via Mentor)
**Goal**: Build the company-specific preparation agentic workflow — company research, JD analysis, gap analysis, and personalized preparation plan. The plan is delivered **inside the Mentor chat** rather than as a separate page.

> [!NOTE]
> **Built after Phase 4 and outside the MVP** (see "Execution Order & MVP Cut"). Nothing in Phases 1, 2 or 4 depends on it.

**Duration Estimate**: 2–3 weeks

> [!NOTE]
> **✅ Done (2026-09-29)**, verified live on Groq. 509 backend tests. Code: `backend/app/agents/prep/`, prompts `prompts/prep/`, data `data/seed/companies/`.
> - **3.1 (deviation):** no Azure AI Search or web search yet (no keys). The knowledge base is the `companies` collection: 10 curated companies (widely documented facts, hedged) + Groq research from general knowledge for others, cached only when the model recognises the company. Lookup by name/alias; Azure AI Search replaces the lookup later.
> - **3.2 Company research**, **3.3 JD analyzer** (fast tier), run in parallel; JD areas outside the topic vocabulary become "also in the job description".
> - **3.4 Candidate profiler (deviation):** the latest score per topic from the reports in the database, not RAG retrieval: exact rather than approximate.
> - **3.5 Gap analyzer:** deterministic (importance × status: weak / untested / developing / strong).
> - **3.6 Planner:** Groq writes the weeks, validated against the gaps; deterministic fallback plan. Plans stored in `prep_plans`.
> - **3.7 Orchestrator:** each step timed and recorded in `agent_runs`; research, JD or planner failures still give a plan. `PREP_PLANS_PER_HOUR` (5) per candidate.
> - **3.8 In the Mentor:** "Prepare me for X (in N weeks)" in chat, or the **Prepare for a company** form (with an optional JD); step-by-step progress while it works; the plan as a message with a practice button per week that opens the start page pre-filled (type, mode, company, topics). The plan is indexed so follow-ups are answered from it.
> - **Live:** Amazon (curated, chat) 20 s; Razorpay with a JD (researched + JD) 42 s → 7.7 s after running research and JD in parallel; an unknown company is handled honestly; follow-up about the plan answered from it; Flipkart via the form in the browser → Week 4 button opens a serious coding interview pre-filled for Flipkart.
> - **Quality guards added after reading live output:** AI-researched company values are no longer quoted (a model recalled Amazon-like values for Razorpay); tips never tell the candidate to claim experience they don't have.

#### Tasks

**3.1 Azure AI Search Setup**
- Create Azure AI Search index for: company information, job descriptions, preparation documents, public interview data
- Implement `SearchClient` in AI Gateway
- Seed initial knowledge base with tech company interview info
- Support both keyword and vector/semantic search

**3.2 Company Research Agent**
- Tool: `search_company(name)` → Azure AI Search
- Tool: `search_web(query)` → optional web search tool
- Agent researches: company overview, team structure, tech stack, interview process, behavioral values
- Output: structured `CompanyProfile` object

**3.3 JD Analyzer Agent**
- Input: raw job description text (pasted or uploaded)
- Tool: `extract_requirements(jd_text)` → structured extraction
- Output: role, required skills, experience level, technical areas, behavioral requirements, nice-to-have skills

**3.4 Candidate Profiler Agent**
- Tool: `get_candidate_profile()` → DB retrieval
- Tool: `get_interview_history()` → past interview performance (via `RagService` retrieval, which reuses the Phase 2 index)
- Output: structured `CandidateSnapshot` for gap analysis

**3.5 Gap Analyzer**
- Receives: JD requirements + Candidate Snapshot
- Computes: skill gaps (required but weak/missing), strength overlaps (required and strong), priority areas (high-impact gaps)
- Output: `GapAnalysis` object — ranked list of gaps with severity

**3.6 Preparation Planner Agent**
- Input: GapAnalysis + CandidateProfile + CompanyProfile
- Output: `PersonalizedPreparationPlan` — priority topics, learning sequence, practice sequence, assessment schedule, recommended interview timing, estimated preparation duration
- Store plan in DB, display to user

**3.7 Orchestrator**
- `PrepAgentOrchestrator` coordinates the workflow: Research → Analyze JD → Profile Candidate → Gap Analysis → Plan
- Triggered by the Mentor Agent when candidate says "Prepare me for Company X"
- Tracks agent execution in `agent_runs` collection for observability
- Handles failures gracefully — partial results are better than no results
- Returns the plan as a structured response to the Mentor, which presents it conversationally in the chat

**3.8 Frontend — No Separate Page Needed**
- Company prep is now triggered and displayed **inside the Mentor chat** (`/mentor`)
- Mentor shows agent progress conversationally: "Let me research Google for you…"
- Plan is displayed as a Mentor message with structured formatting (priority list, focus areas)
- User can ask follow-up questions in the same chat

**📌 Suggestions for Phase 3**
- Build each agent as a standalone function first, test it independently, then wire into the orchestrator. This makes debugging much easier.
- Log every tool call in `agent_runs` — what tool, what input, what output, latency. This is essential for debugging agent behavior.
- The Orchestrator should handle partial failures. If company research fails, still proceed with JD analysis + candidate profile. A partial plan is better than an error.
- For the JD Analyzer, use structured output/function calling exclusively. The output must be machine-readable — it feeds directly into gap analysis.
- Cache company research results in Azure AI Search. Don't re-research the same company on every request.
- Consider rate limiting company research requests per user — web search tools can be expensive.

---

### Phase 4 — Serious Adaptive Interview & Behavioral Mode
**Goal**: Build the flagship Serious Interview mode with explicit Interviewer/Evaluator separation, adaptive difficulty, and the Personal/Behavioral interview type.

> [!NOTE]
> **✅ Done (2026-09-29)**, verified live on the Piston VM + Groq. 468 backend tests.
> - **Already done in Phase 1:** 4.1 serious mode (1.2/1.11), 4.2 the interviewer sees tiers only (1.6), 4.3 per-answer evaluations + performance vector (1.7/1.8), 4.4 adaptive difficulty, topic rotation and no repeats across sessions (1.1/1.8), 4.5 behavioral STAR interviews (1.7).
> - **4.6 Live coding:** `core/coding/` (`languages.py`, `sandbox_client.py` = `PistonExecutor` behind `AIGateway.execute_code()`, `test_harness.py`), `core/evaluation/code_evaluator.py` + `prompts/evaluator/coding_v1.txt` (7 dimensions; correctness = share of tests passed; overall = fixed weighting), 18 problems (8 easy, 7 medium, 3 hard) in `data/seed/question_bank/coding.json` with expected outputs computed from reference solutions. Engine: `CODE_SUBMIT` → run every test → `CODE_RESULT` → evaluate; `CODE_DRAFT`; `POST /interviews/{id}/code/run` (visible tests, rate-limited). Coding problems are never LLM-generated. Frontend: `components/coding/` (Monaco via `@monaco-editor/react`, one buffer per language, Run / Submit, approach box, output panel), coding options on the start page (1–3 problems, starting language).
> - **Deviations:** no extra coding states (4.6.6 maps onto the existing states); `/code/execute` became `POST /interviews/{id}/code/run` (session-scoped, uses the session's problem, no stdin); Run checks the visible tests instead of free stdin; only Python is graded, the other four languages run as written; the candidate's written approach is part of the submission (it's what "communication" and complexity analysis are scored on); Monaco loads from its CDN (self-hosting in Phase 7).
> - **4.7:** `MAX_INTERVIEW_MINUTES` (60) — the state machine wraps up at the question count or the time limit, whichever comes first.
> - **4.8:** coding headline scores (problem solving, complexity, code quality, communication), tests passed per question, the transcript shows code + run (hidden tests pass/fail only in serious mode, also in the report).
> - **Also fixed:** Groq JSON-mode rejections (HTTP 400 `json_validate_failed`) now get the normal corrective retry instead of failing the call.
> - **Live on Piston:** all 5 languages run; compile errors (C++, and Java via its single-file launcher), runtime errors and time limits (3 s) map to the right status; every one of the 18 problems' reference solutions passes all its tests (~100 ms each); faked result lines score 0, a bug only a hidden test catches scores 4/5. A full practice interview in the browser (Java run, Python submissions, a wrong answer at 3/5, a follow-up, the report) worked end to end. Found and fixed on the way: a circular import when the sandbox client was imported first.

**Duration Estimate**: 2–3 weeks

#### Tasks

**4.1 Serious Interview Mode**
- Implement strict mode: no hints, no coaching, no visible scoring
- UI: clean interview room — interviewer name/avatar, question display only, text input, timer
- Background evaluation runs silently — scores not shown during interview
- Full report unlocked only at end

**4.2 Interviewer Agent (Enhanced)**
- Receives: interview context + question + previous answers + evaluation signals
- Decides: natural follow-up vs. next topic vs. wrap-up
- Generates: conversational transitions ("Good, let me follow up on that…", "Let's move to a different area…")
- Does NOT see raw evaluation scores — receives only high-level signals (strong/weak/partial)

**4.3 Evaluator Agent (Persistent)**
- Runs after every answer
- Accumulates per-topic, per-dimension scores throughout the interview
- Inputs to next-question decision: running performance vector
- At end: compiles final `InterviewEvaluation` — aggregate of all per-answer evaluations

**4.4 Adaptive Question Selection (Enhanced)**
- Full implementation of adaptive engine: performance history + current topic + role requirements + prep level
- Difficulty scaling: Strong answer → harder; Weak answer → easier or follow-up; Partial → targeted follow-up
- Topic rotation: ensure all required topics are covered within interview time limit
- Avoid question repetition across sessions (track `asked_questions` per candidate)

**4.5 Personal/Behavioral Interview**
- Question bank: behavioral questions tagged by STAR component emphasis, leadership, ownership, problem-solving etc.
- Evaluator: STAR framework evaluation + soft skills assessment
- Evaluation dimensions: Situation Clarity, Task Definition, Action Description, Result Quantification, Communication, Confidence, Specificity, Professionalism
- Feedback: explain *why* each STAR component scored high/low

**4.6 Live Coding Interview Engine**

The live coding interview is a **third interview type** alongside Personal and Technical. It gives candidates a real code editor inside the browser, asks coding problems, executes their code, and evaluates both the solution and the problem-solving process.

> [!NOTE]
> This is one of the most technically ambitious features. The coding execution infrastructure must be completely sandboxed — candidate code must never touch the application server.

> [!NOTE]
> **Already built in `sandbox_tool`** (`backend/app/core/coding/sandbox_tool/`): `request_coding_question` and `submit_code_for_execution` with the agent's tool signatures, a Piston client, and a 3-problem bank. A vanilla reference UI is in `frontend/prototypes/coding-sandbox/`. **Fix before wiring in** (`plan-review.md` §C): C1 graded harness, C2 remove the Flask server and global question state, C3 one Piston client via the gateway, C4 drop Go and add C, C5 problems move to `question_bank`.

**4.6.1 — Code Execution Architecture**

```text
Candidate writes code (Monaco Editor)
         ↓
   Run   → POST /api/v1/code/execute   (practice run, ungraded, stdin allowed)
   Submit→ WS CODE_SUBMIT {code, language, is_final}
         ↓
   submit_code_for_execution (sandbox_tool)
         ↓
   test_harness.wrap(code, problem.test_cases)   ← all tests, incl. hidden
         ↓
   AIGateway.execute_code() → sandbox_client → Piston (Azure VM)
         python 3.12.0 · c 10.2.0 · c++ 10.2.0 · java 15.0.2 · javascript 20.11.1
         ↓
   ExecutionResult (status, stdout, stderr, runtime_ms, passed/total, test_results[])
         ↓
   WS CODE_RESULT → frontend      CodeEvaluator Agent → Structured Evaluation
```

The browser **never** reports an execution result. The server always runs the code itself.

**4.6.2 — Frontend: Monaco Editor Integration**
- Embed `@monaco-editor/react` — the same editor that powers VS Code
- Language selector: Python, JavaScript, Java, C++, C (matching the Piston runtimes). Use `frontend/prototypes/coding-sandbox/` as the behaviour reference: starter code per language, run/submit, console output.
- Features: syntax highlighting, auto-indent, bracket matching, basic IntelliSense
- "Run Code" button → sends code + language + stdin (if any) to backend
- Output panel: stdout, stderr, runtime, pass/fail status for test cases
- In **Practice Mode**: output is always visible to candidate
- In **Serious Mode**: candidate can run code and see their own output, but evaluator scoring remains hidden

**4.6.3 — Piston Execution Client**
- `core/coding/sandbox_client.py`: the **only** code that talks to Piston. `POST {PISTON_URL}/execute` with `X-API-Key`, body `{language, version, files:[{name, content}], stdin}`. Filenames: `main.py`, `main.c`, `main.cpp`, `Main.java`, `main.js`.
- Called only via `AIGateway.execute_code(language, code, stdin)` (principle 2), so retries, logging and rate limits apply.
- `PISTON_URL` / `PISTON_API_KEY` come from `config.py`. There's no hard-coded IP and no `load_dotenv` in module code.
- Limits: code ≤ 10,000 chars, 30s request timeout, per-user rate limit on `/code/execute`. The VM sits behind TLS, or its firewall only allows the App Service outbound IPs.
- Map Piston responses to a single `ExecutionStatus` enum: `accepted | wrong_answer | time_limit | runtime_error | compile_error | internal_error`.

**4.6.4 — Graded Test Harness (new)**
- `core/coding/test_harness.py`: given `problem_id`, load the problem from `question_bank`, wrap the candidate's function with a runner that executes **every** test case (hidden ones too), and print a machine-readable result per test.
- It returns `passed_tests`, `total_tests` and `test_results[] {input, expected, actual, passed, is_hidden}`. In Serious mode, hidden tests' inputs and outputs are stripped before the result goes to the client; only the count is shown.
- Python first. Other languages are run-only (stdout, no grading) until each gets a harness; JavaScript is next.
- This replaces `sandbox_tool`'s current "exit code 0 = accepted" logic (C1).

**4.6.5 — Code Evaluation Agent**
- `CodeEvaluator` runs after code execution and receives: the problem statement, candidate's code, execution result (pass/fail, output), time taken to write
- Evaluation dimensions:
  - **Correctness** — does the code produce correct output?
  - **Approach** — is the algorithm sound?
  - **Time Complexity** — did the candidate analyse it correctly?
  - **Space Complexity** — memory usage awareness
  - **Code Quality** — readability, variable naming, structure
  - **Edge Case Handling** — null, empty, boundary values
  - **Communication** — did the candidate explain their thinking before coding?
- In Practice Mode: detailed feedback shown immediately
- In Serious Mode: stored silently, shown in final report

**4.6.6 — Live Coding Interview State Machine Sub-Flow**

```text
CODING_QUESTION_PRESENTED
         ↓
CANDIDATE_THINKING          ← candidate can ask clarifying questions
         ↓
CANDIDATE_CODING            ← candidate types code in Monaco Editor
         ↓
CODE_SUBMITTED
         ↓
EXECUTION                   ← code runs in sandbox
         ↓
RESULT_SHOWN (to candidate)
         ↓
EVALUATING (background)
         ↓
FOLLOW_UP_DECISION
  ├── Correct + fast → harder problem
  ├── Correct + slow → complexity discussion follow-up
  ├── Wrong → hint or simpler variant (practice) / next question (serious)
  └── Timeout/Error → debugging discussion
         ↓
NEXT_PROBLEM or WRAP_UP
```

**4.6.7 — Frontend: Live Coding Interview UI**

```text
┌──────────────────────────────────────────────────────────┐
│ CODING INTERVIEW                   Python ▾    23:41     │
├────────────────────────┬─────────────────────────────────┤
│                        │                                  │
│  PROBLEM               │  CODE EDITOR (Monaco)            │
│                        │                                  │
│  Given an array of     │  def two_sum(nums, target):      │
│  integers, return      │      seen = {}                   │
│  indices of two        │      for i, num in enumerate...  │
│  numbers that add      │                                  │
│  up to target.         │                                  │
│                        │                                  │
│  Example:              ├─────────────────────────────────┤
│  Input: [2,7,11,15]    │  OUTPUT                          │
│  Output: [0,1]         │  ✓ Passed 3/3 test cases        │
│                        │  Runtime: 48ms                   │
│                        │                                  │
├────────────────────────┴─────────────────────────────────┤
│       [Run Code]              [Submit]   [End Interview]  │
└──────────────────────────────────────────────────────────┘
```

**4.7 Interview Timer and Wrap-up Logic**
- Track interview duration
- State machine: after N minutes or N questions, transition to INTERVIEW_COMPLETE
- Graceful wrap-up: interviewer agent signals closing ("That covers our technical questions, let me wrap up…")

**4.8 Enhanced Report**
- For Serious Interview: full breakdown — overall, technical, behavioral, coding, per-topic, per-dimension
- For Live Coding: code quality scores, complexity analysis, approach quality, edge case handling
- Transcript replay (from 1.11) extended to coding questions: submitted code, language and which tests failed (hidden tests shown as pass/fail only)
- Highlight weak areas with explanation
- Specific, actionable recommendations
- One-click **"Practice Weak Areas"** → opens `/interview/configure?topics=<weak_areas>&difficulty=adaptive` pre-filled (the Weak-Area Drill interview). `QuestionEngine` restricts topic selection to those topics.

**📌 Suggestions for Phase 4**
- The Interviewer/Evaluator separation is the most important architectural decision in this phase. The Interviewer Agent should be completely blind to numeric scores — it only receives high-level performance signals (e.g., `performance_tier: "strong"|"adequate"|"weak"`). This prevents the interviewer from leaking evaluation to the candidate.
- For behavioral evaluation, add example good/bad answer examples to the evaluator prompt. STAR evaluation is subjective — anchored examples dramatically improve consistency.
- Test adaptive difficulty with simulated candidate profiles: "always correct", "always wrong", "improving", "declining". Verify the difficulty curve behaves as expected.
- The wrap-up logic needs to be in the state machine, not in the LLM. The LLM decides *what to say* during wrap-up, but the state machine decides *when* to wrap up.
- Consider giving the Serious Interview a distinct visual identity — interview room aesthetic vs. the chat-like practice mode.
- **For Live Coding**: Start with graded Python via the harness. The other Piston languages work as run-only from day one; add harnesses one language at a time.
- **Never execute code on the application server**. Always route through Piston. A single unguarded `exec()` call is a severe security vulnerability.
- **Never trust a client-reported result.** The only coding events from the client are `CODE_SUBMIT` (and `/code/execute` for practice runs); the server always executes.
- Use hidden test cases for Serious Mode (candidate sees pass/fail count, not the actual test inputs). This mirrors real technical interviews at companies like Google and Amazon.
- The Monaco Editor should **not** send code to the backend on every keystroke — only on explicit "Run" or "Submit". Debounce aggressively.
- Save the editor draft to the session (debounced, about every 10s) so `SESSION_SNAPSHOT` can restore it after a disconnect.

---

### Phase 5 — Voice Integration
**Goal**: Add voice input/output support as an adapter layer on the existing interview engine, without changing core logic.

> [!NOTE]
> **Outside the MVP.** This is the riskiest phase (end-to-end latency, end-of-speech detection), so it stays off the critical path. Text mode must be complete and stable first.

**Duration Estimate**: 2 weeks

#### Tasks

**5.1 Speech-to-Text (STT)**
- Integrate Azure AI Speech SDK — streaming STT
- `STTClient.transcribe_stream(audio_stream)` → partial + final transcripts
- Handle: different accents, technical terminology, silence detection
- Fallback: batch transcription if streaming fails

**5.2 Text-to-Speech (TTS)**
- Integrate Azure AI Speech SDK — neural TTS
- Choose an interviewer voice (professional, neutral)
- `TTSClient.synthesize(text)` → audio bytes
- Support streaming TTS output for lower latency

**5.3 Voice Adapter**
- `VoiceAdapter` wraps the existing `InterviewEngine`
- Input path: Audio → STT → Text → InterviewEngine
- Output path: InterviewEngine → Text → TTS → Audio
- The core interview engine receives and returns text — voice is purely an I/O adapter

**5.4 Turn Detection**
- Implement Voice Activity Detection (VAD) using Azure Speech or WebRTC VAD
- States: `SILENCE → SPEECH → SPEECH_END → PROCESSING`
- Manual fallback: "Done Speaking" button on UI
- Avoid premature cutoffs: add configurable silence threshold

**5.5 Real-time Audio WebSocket**
- Extend WebSocket to support binary audio frames
- Message types: `AUDIO_START`, `AUDIO_CHUNK`, `AUDIO_END`, `TRANSCRIPT`, `AI_RESPONSE_AUDIO`
- Handle connection drops gracefully — resume from last state

**5.6 Frontend — Voice UI**
- Voice interview page: microphone button, speaking indicator (waveform animation), AI response playback
- Voice mode toggle: text ↔ speech on interview configuration page
- Recording consent modal (GDPR-compliant)
- Fallback to text if voice fails

**5.7 All Mode Support**
- Text → Text (Phase 1 baseline)
- Text → Speech (AI speaks, candidate types)
- Speech → Text (candidate speaks, AI types response)
- Speech → Speech (full voice interview — Phase 5 flagship)

**📌 Suggestions for Phase 5**
- The biggest risk in voice is latency. Measure STT latency + LLM latency + TTS latency end-to-end. Target: < 3 seconds total from end-of-speech to AI response start.
- Use streaming TTS — start playing audio as soon as the first sentence is generated, don't wait for the full response. This dramatically reduces perceived latency.
- Test turn detection extensively — false ends (candidate pausing mid-sentence) and false starts (candidate hasn't started yet) are the two main failure modes.
- Store audio only if the user explicitly consents. Show a clear recording indicator (red dot or microphone icon) during active recording.
- Build a "text fallback" that kicks in automatically if voice fails mid-interview. Users should never lose a session due to a voice connectivity issue.

---

### Phase 6 — Observability, Agent Evaluation & Polish
**Goal**: Add production-grade monitoring, evaluate AI system quality, and polish the entire product for a demo-ready state.

**Duration Estimate**: 1–2 weeks

> [!NOTE]
> **✅ Done (2026-09-29).** 532 backend tests.
> - **6.1** Every AI call is a document in `llm_calls` (model, tier, prompt version, session, candidate, agent, tokens in/out, estimated cost, latency, status/error), written in batches by `gateway/usage.py`; failures are recorded too. Prompt/output text only with `LLM_TRACE_CONTENT`. Agent runs record the prompt version actually used.
> - **6.2 (deviation: no Azure keys)** In-process metrics (`utils/metrics.py`: requests per endpoint, AI calls, WebSocket sessions; p50/p95 over 15 min) with alert rules (5xx > 5 %, AI errors > 10 %, AI p95 > 20 s, request p95 > 2 s) logged as `alert_triggered`, and an **admin dashboard** at `/admin` (admins: the admin role or `ADMIN_EMAILS`). `APPLICATIONINSIGHTS_CONNECTION_STRING` turns on the Azure Monitor OpenTelemetry export in deployment.
> - **6.3** Eval suite with trend history (`evaluation/results/history.jsonl`, `evaluation/trends.py`): interviewer-agent eval (12 scenarios: valid decision, expected move, redundant follow-ups, serious-mode neutrality, score leaks; provider errors counted apart), question-quality eval (generator × LLM judge: relevance, difficulty, role fit, clarity, near-duplicates), and the Phase 1/2 evaluator and Mentor sets now log to the same history.
> - **6.4** Prompt registry (`core/prompts.py`, `prompt_settings`): every call goes through `render_for()`, which picks the active version (A/B split stable per session) and records it. Admin API/page: switch, split, roll back (history kept) with no deploy. New variants `interviewer/interviewer_v2` (don't re-ask what was covered) and `report/report_v2` (a follow-up can close its parent's gap); v1 stays the default.
> - **6.5** `DAILY_TOKEN_LIMIT_PER_USER` (400k) checked where AI work starts (never mid-interview); usage and estimated cost per day / model / prompt version / candidate; budget- and time-limit wrap-ups counted.
> - **Security backlog:** the web app's refresh token is now an httpOnly cookie (§12.1 cookie mode), never in localStorage.
> - **Found by the agent eval and fixed:** with a single allowed move the model often answered in plain JSON and Groq refused it (`tool_use_failed`), so the interview lost the agent's wording. Fix: the gateway retries `tool_use_failed` once, the agent names the tool when submitting is the only option, and the tool's action list only offers the allowed moves.
> - **Capacity finding:** this Groq account allows 8,000 tokens/min on `gpt-oss-120b`; one interviewer decision is ~6,000 tokens, so the free tier supports about one live interview at a time. Production needs a paid tier (or moving the agent to the fast model); the dashboard's AI-error tile shows when it's hit.

#### Tasks

**6.1 Structured Logging**
- Log every agent run: inputs, tool calls, tool outputs, LLM response, decision, latency
- Log every evaluation: question, answer, evaluation scores, model used
- Log all LLM token usage per request

**6.2 Azure Monitor + Application Insights**
- Track: API latency, WebSocket connection duration, LLM latency, STT/TTS latency
- Alert on: high LLM error rates, evaluation failures, agent timeouts
- Dashboard: request volume, error rate, p95 latency

**6.3 AI Evaluation System**
- Question Quality: relevance, difficulty alignment, role alignment, uniqueness
- Evaluation Quality: consistency, correctness, specificity, actionability. Builds on the evaluator test set from Phase 1.7; this phase grows it and adds trend tracking per prompt version.
- Agent Quality: tool-call accuracy, routing accuracy, task completion, hallucination rate
- Voice Quality: STT accuracy, turn detection accuracy, TTS quality

**6.4 Prompt Management**
- Version all prompts in `prompts/` directory
- Track which prompt version was used for each LLM call (store in DB)
- A/B testing infrastructure: route % of traffic to different prompt versions
- Rollback capability: revert to previous prompt version without code deploy

**6.5 Rate Limiting and Cost Management**
- Implement per-user rate limiting for AI endpoints
- Track token usage per user per day
- Dashboards on top of the Phase 1 token-budget hook: tokens and cost per session and user, and how often budget-forced wrap-ups happen
- Alert when spending exceeds thresholds (Azure Cost Management alerts)

**6.6 Product Polish** → moved to **Phase 7** (7.5 states & feedback, 7.6 accessibility, 7.7 responsive), where it's done as part of the full design pass.

**📌 Suggestions for Phase 6**
- Observability doesn't start here: session-ID logging starts in Phase 0.2 and the evaluator test set in Phase 1.7. Phase 6 is for *upgrading* them, not starting from scratch.
- AI evaluation (measuring AI quality) is what makes this project stand out as an engineering project. Invest time here — it demonstrates mature AI system thinking.
- For prompt versioning: store the prompt version ID alongside every LLM call in the database. When you debug a bad evaluation, you need to know exactly which prompt was used.

---

### Phase 7 — UI/UX Design & Production Frontend
**Goal**: Turn the working, test-grade frontend into a designed, production-quality product: a consistent visual identity and design system, redesigned key screens, and a UI that is accessible, responsive, fast and tested with real users. No new backend features; the APIs and WebSocket contract (architecture.md §13) stay as they are.

**Duration Estimate**: 2–3 weeks

> [!NOTE]
> **Revised split (2026-09-30).** Phase 7 was re-planned around the InterviewOS brand (VERA the interviewer, ARIA the mentor) and a dark-only "interview room" design: a three.js chair under a spotlight on the landing page, the same room behind auth, and a desk with report sheets and a lamp on the dashboard. The work now runs as **7.1 Design foundation → 7.2 Motion + 3D foundations → 7.3 Component library → 7.4 Landing page → 7.5 Auth morph + onboarding → 7.6 App shell + navigation → 7.7 Signed-in dashboard → 7.8 Interview experience → 7.9 Report + Mentor chat → 7.10 Quality pass** (accessibility, responsive, performance, copy, usability test). The task lists below still apply; they are grouped into those steps. Design decisions: [design-system.md](design-system.md).

**Why last:** by now every flow exists (interview, report, Mentor, drills, coding, voice), so screens are designed once, around the real content and states, instead of being redesigned after each phase.

#### Tasks

**7.1 UX Audit & Research**
- Heuristic review of every current screen (landing, auth, profile wizard, dashboard, configure, practice room, serious room, coding room, report, Mentor): list the friction, inconsistencies and missing states.
- Map the core journeys end to end: first visit → first interview → report → Mentor → drill → next interview. Define 2–3 personas (e.g. a fresher preparing for campus placements; an experienced engineer targeting a specific company).
- Success metrics to design for and later measure: time to first interview, interview completion rate, report → Mentor / drill click-through, return within 7 days.

**7.2 Visual Identity & Design System**
- Brand: product name and logo, voice and tone, illustration or icon style.
- Design tokens in `app/globals.css` (Tailwind 4 `@theme`): colour palettes for light and dark (brand, neutrals, status), type scale, spacing, radii, elevation, motion. The chart palette stays validated with the dataviz checker for both themes.
- Theme switcher: light / dark / system, remembered per user.
- Component library in `components/ui/`: buttons, inputs, selects, choice groups, cards, badges, alerts, toasts, modals/dialogs, tabs, tooltips, dropdowns, skeletons, empty states, avatars, progress/meter. Each with every state (hover, focus, disabled, loading, error).
- A living style guide page (e.g. `/design`, dev-only) that renders every token and component, so the system is reviewed in the browser rather than in a separate tool.

**7.3 Information Architecture & Navigation**
- App shell redesign: sidebar / top bar, mobile navigation, page headers, breadcrumbs where they help.
- The dashboard becomes the home: score trend over time (from past reports), the latest report at a glance, the recommended next drill, and quick-start buttons.
- Consistent naming across the site (Practice vs Serious, Drill, Mentor, Report).

**7.4 Key Screen Redesigns**
- **Landing page**: what it does, how it works (Interview → Report → Mentor → Drill), sample report, call to action.
- **Auth & onboarding**: a shorter profile wizard, then a guided first interview with a short "how it works" tour.
- **Configure**: presets (e.g. "Quick 3-question practice", "Full mock interview", "Drill my weak areas") with the full options behind "Customise".
- **Interview room** (practice, serious, coding): a focus mode, an auto-growing answer editor that handles code blocks, keyboard shortcuts, and clear question / follow-up / hint / feedback hierarchy. Serious mode feels like a real interview.
- **Report**: a clear story from top to bottom (score → what went well → what to fix → next steps → evidence); share link and print / PDF export.
- **Mentor**: conversation sidebar, suggested prompts, streaming responses, polished citation chips and drill links.
- **History / progress**: all past interviews, filters, and trends per topic.

**7.5 States & Feedback** (from 6.6)
- Meaningful loading states for every AI step (skeletons and progress text, not just spinners), streaming and typing indicators, optimistic UI where safe.
- Toasts for background results; error boundaries and friendly 404 / 500 / offline pages; empty states for every list and first-time screen.

**7.6 Accessibility** (from 6.6)
- WCAG 2.2 AA: automated axe checks in CI plus a manual screen-reader pass (VoiceOver and NVDA).
- A complete interview is possible keyboard-only. Focus moves sensibly on each new question, and new questions, hints and results are announced through live regions.
- Contrast checked in both themes, `prefers-reduced-motion` respected, and usable in forced-colors mode.

**7.7 Responsive & Cross-Browser** (from 6.6)
- Every screen designed for phone (375 px), tablet and desktop; touch targets at least 44 px.
- Tested in Chrome, Safari (including iOS) and Firefox.

**7.8 Motion & Micro-interactions**
- Subtle transitions where they aid understanding (a new question arriving, feedback revealing, charts drawing), never decorative, and off under reduced motion.

**7.9 Frontend Performance**
- Core Web Vitals targets on key pages: LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
- Bundle analysis and code-splitting (charts, markdown, Monaco), font and image optimisation; Lighthouse ≥ 90 for performance, accessibility and best practices.

**7.10 Content & Microcopy**
- A short voice-and-tone guide; rewrite every error, empty-state and button label to match; help / FAQ; a clear note on how AI is used (evaluation, reports, Mentor) and what is stored.

**7.11 Usability Testing**
- A 5-person test with a task script (take a first interview, read the report, ask the Mentor, start a drill); System Usability Scale (SUS) score; fix the top issues and re-test.
- Privacy-respecting product analytics events for the funnel in 7.1.

**📌 Suggestions for Phase 7**
- Design with real data: use actual reports, transcripts and Mentor answers from the earlier phases, including long, empty and error cases, not lorem ipsum.
- Keep the design system in code (tokens + components + the `/design` page) so it cannot drift from what ships.
- Redesign the interview room and the report first: they are where users spend their time and form their opinion of the product.
- Every visual change must keep the §13 WebSocket contract and the existing tests green; the contract test (`tests/integration/test_ws_flow.py`) catches a frontend that expects a field the server doesn't send.

---

## Core Architectural Principles

These principles must be respected across all phases:

### 1. The LLM is a Component, Not the System
The backend owns: state, rules, persistence, workflow control. The LLM owns: language generation, reasoning within a defined context. Never let the LLM decide interview state transitions.

### 2. The AI Gateway is the Only Door to Azure AI
All LLM, STT, TTS, and embedding calls go through `AIGateway`. No other component calls Azure APIs directly. This enables: centralized logging, token tracking, easy model swaps, and consistent retry logic.

### 3. State Lives in the Database
Interview state, preparation progress, evaluation scores — all persisted to DB on every update. The system must survive: WebSocket disconnections, server restarts, LLM timeouts. Reconnecting should resume from the exact last state.

### 4. Interviewer and Evaluator are Separate
In Serious Interview mode, the Interviewer Agent and Evaluator Agent are strictly separated. The Interviewer receives only performance tier signals (not raw scores). The Evaluator runs independently of the conversational flow.

### 5. Context is Controlled
Every LLM call receives only the context it needs — no more. Context packages are assembled by `ContextBuilder` and typed with Pydantic models. This prevents prompt bloat and improves consistency.

### 6. Prompts are Versioned Assets
All prompts live in the `prompts/` directory, are version-controlled, and are referenced by ID in every LLM call. Prompt engineering is treated as part of the development workflow, not an afterthought.

### 7. Voice is an Adapter
The voice system wraps the text-based interview engine. The core engine is always text-in/text-out. Voice is an I/O layer only. This means: text mode is always the baseline, voice is additive.

### 8. Agents are Observable
Every agent run is logged: inputs, tool calls, outputs, decisions, latency, errors. This is non-negotiable for debugging agentic behavior.

---

## Guiding Documents to be Created (Following This Plan)

| Document | Purpose | Created In |
|---|---|---|
| `docs/flow.md` | User journey flows, interview state machine diagrams, agent workflow diagrams | Phase 0 |
| `docs/architecture.md` | Full system architecture, component relationships, data flow, Azure service mapping | Phase 0 |
| `docs/api.md` | REST API reference — all endpoints, request/response schemas | Phase 1 |
| `docs/prompts.md` | Prompt design guide, version history, evaluation notes | Phase 1 |
| `docs/data_models.md` | Full DB schema with all collections/tables, field descriptions, relationships | Phase 0 |
| `docs/agent_guide.md` | How agents are built, tool patterns, orchestration patterns | Phase 3 |
| `docs/voice_guide.md` | Voice architecture, STT/TTS integration, streaming patterns, VAD | Phase 5 |

---

## Verification Plan

### Per Phase Verification

| Phase | Verification Method |
|---|---|
| Phase 0 | Auth works, profile CRUD works, DB connected, dev server runs locally |
| Phase 0 (local) | `docker-compose up` runs the app with no cloud keys, using the fake Gateway |
| Phase 1 | Walking skeleton works first (answer → report → Mentor cites it); then a full text interview end-to-end; report with transcript replay; practice mode shows model answers; adaptive difficulty verified with test profiles; the evaluator test set runs and its score is recorded |
| Phase 2 | Finishing an interview indexes its report into `rag_tool`; the Mentor answers with `[n]` citations that link to the right report; no cross-user leakage; the Weak-Area Drill link opens a pre-filled configure page |
| Phase 3 | Company prep workflow runs end-to-end; plan generated; agent runs logged |
| Phase 4 | Serious interview completes; Interviewer blind to scores verified; behavioral STAR evaluation works; a coding submission with the asserts deleted is still graded correctly by the harness; hidden test inputs never reach the client |
| Phase 5 | Full speech interview completed; STT/TTS pipeline verified; turn detection tested |
| Phase 6 | AI quality metrics collected; all agent runs logged; prompt versions tracked |
| Phase 7 | Every screen matches the design system in light and dark; axe reports no serious issues and a keyboard-only interview works; key pages score Lighthouse ≥ 90 (performance, accessibility, best practices) and meet the Core Web Vitals targets; usability test tasks completed, with a SUS score recorded and the top issues fixed |

### Automated Tests
```bash
# Backend unit tests
pytest backend/tests/unit/ -v

# Backend integration tests (DB emulator + FakeAIGateway: no cloud keys, deterministic)
pytest backend/tests/integration/ -v

# API end-to-end tests (scripted full interviews through FakeAIGateway)
pytest backend/tests/e2e/ -v

# Evaluator test set (real model; run on every evaluator prompt change)
python evaluation/interview_eval/run_evaluator_eval.py

# Frontend component tests
cd frontend && npm run test
```

### Manual Verification
- Complete a full interview (configure → interview → report) as a user
- Verify adaptive difficulty: strong answers → harder questions
- Verify serious mode: no coaching or scores visible during interview
- Verify voice: complete a voice interview end-to-end
- Verify company prep: enter a company + JD → receive a preparation plan
- Verify the core loop: interview → report → "Talk to Mentor" / "Practice Weak Areas" → drill interview → new report
- Verify resume: kill the WebSocket mid-question and mid-coding; on reconnect, `SESSION_SNAPSHOT` restores the question, transcript and editor draft
