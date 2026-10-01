# Project structure

What every folder and file in the repository is for. Local-only files (gitignored) are listed at the end.

```
Agentic Interview Coach/
├── backend/        FastAPI API + WebSocket server (Python)
├── frontend/       Next.js website (the InterviewOS UI)
├── prompts/        Versioned LLM prompts, loaded by the backend
├── data/seed/      Question bank and company knowledge, seeded into the database
├── evaluation/     AI quality evals (interviewer, evaluator, questions, ARIA)
├── docs/           Plans, architecture, design system, guides
├── .github/        CI (tests, lint, build on every push)
├── deploy/vps/     One-server production setup: Docker Compose (Caddy, frontend, backend, MongoDB, Piston) + Caddyfile
├── docker-compose.yml, .dockerignore, .env.example, .gitignore, README.md
```

## Root

| File | What it does |
|---|---|
| `README.md` | What InterviewOS is, how to run, test and deploy it. |
| `.env.example` | Every backend setting with a comment. Copy to `.env` (never committed). |
| `docker-compose.yml` | Local full stack: MongoDB + backend + frontend, fake AI, localhost only. |
| `deploy/vps/docker-compose.yml`, `deploy/vps/Caddyfile` | Production on one Linux server: automatic HTTPS, private network for the API, database and Piston (docs/deployment.md, Path 1). |
| `.dockerignore` | Keeps secrets, caches, local data and local-only files out of Docker images. |
| `.gitignore` | Keeps `.env`, virtualenvs, `node_modules`, caches, `data/chroma`, logs and local notes out of git. |
| `.github/workflows/ci.yml` | CI: seed validation + 575 backend tests; frontend lint + production build. |

## backend/

```
backend/
├── Dockerfile          python:3.12-slim image, runs as a non-root user, uvicorn with --proxy-headers
├── requirements.txt    Python dependencies
├── pytest.ini          test settings
├── scripts/            one-off commands
├── tests/              unit/ and integration/ tests (in-memory DB + fake AI; no keys needed)
└── app/
    ├── main.py         app factory: settings, DB, AI gateway, ARIA, rate limits, CORS, middleware, routers
    ├── config.py       all settings (from env / .env), with safety checks (JWT secret length, no in-memory DB in prod)
    ├── dependencies.py FastAPI dependency injection (current user, repositories, engine)
    ├── api/            HTTP + WebSocket endpoints
    ├── core/           business logic (interviews, evaluation, coding, ARIA, auth, prompts)
    ├── agents/         LLM agents (interviewer, company preparation)
    ├── gateway/        the only door to AI services (Groq, embeddings, code runner)
    ├── db/             MongoDB connection, models, repositories, seeding
    ├── utils/          errors, logging, metrics, rate limits, security, response envelope
    └── voice/          reserved for voice interviews (Phase 5, not built)
```

### backend/app/api/: the HTTP and WebSocket surface

| File | What it does |
|---|---|
| `v1/health.py` | `GET /api/v1/health`: liveness check for load balancers. |
| `v1/auth.py` | Register, login, refresh (rotating tokens, reuse detection, httpOnly cookie), logout. |
| `v1/users.py` | The signed-in user (`/users/me`). |
| `v1/profiles.py` | Candidate profile: create/read/update (role, experience, skills, preferences). |
| `v1/interviews.py` | Interview options, create, list, get, state, draft, "Run examples" for code. |
| `v1/reports.py` | Report list (with scores per topic, type, duration) and a full report. |
| `v1/mentor.py` | ARIA: welcome, chat, conversations, "prepare me for <company>". |
| `v1/prep.py` | Company preparation plans (list/read). |
| `v1/admin.py` | Admin only: live metrics, usage and cost, prompt versions and A/B splits. |
| `ws.py` | `/ws/interview/{id}`: the live interview socket (auth handshake, questions, answers, hints, code, heartbeat). |
| `ws_protocol.py` | Typed messages for that socket; the contract the frontend follows. |

### backend/app/core/: the rules of the product

| File | What it does |
|---|---|
| `auth/service.py` | Password hashing, token issue/rotation/revocation. |
| `interview/engine.py` | Runs an interview end to end: questions, answers, evaluation, follow-ups, report. |
| `interview/state_machine.py` | Allowed interview states and transitions; crash/reconnect recovery. |
| `interview/question_engine.py` | Picks questions from the bank for role/level/focus; asks Groq to write one when the bank runs out. |
| `interview/adaptation_engine.py` | Difficulty follows performance, follow-up on partial answers, time-limit wrap-up. |
| `interview/context_builder.py` | What each LLM role is allowed to see (no answer keys leak to the interviewer). |
| `interview/report_generator.py` | Scores (always computed) + Groq-written summary, weak areas, recommendations, study plan. |
| `evaluation/answer_evaluator.py` | Scores technical and behavioural (STAR) answers on several dimensions. |
| `evaluation/code_evaluator.py` | Scores coding answers from test results + the code and explanation. |
| `coding/sandbox_client.py` | The only code that talks to Piston, the self-hosted code runner (`PISTON_URL`). |
| `coding/test_harness.py` | Wraps your function with the tests (visible + hidden) and checks results. |
| `coding/languages.py` | Supported languages (Python graded; JS/Java/C++/C run as written). |
| `mentor/mentor_agent.py` | ARIA: answers grounded in your reports, drill buttons, welcome message. |
| `mentor/indexer.py` | Indexes each finished report into ARIA's search index in the background (with retries). |
| `mentor/setup.py` | Creates ARIA's single RAG service at startup (only when `HF_TOKEN` is set). |
| `mentor/rag_tool/` | The RAG module: chunking, Chroma storage, intent-routed retrieval, citations. |
| `prompts.py` | Loads versioned prompts from `prompts/`; the registry for switching versions / A/B without a deploy. |

### backend/app/agents/: LLM agents

| File | What it does |
|---|---|
| `interview_agent.py` (+ `_schemas.py`) | VERA's voice: opening, follow-ups, transitions, closing; every move validated by the engine. |
| `prep/orchestrator.py` | Company prep pipeline: research → JD analysis → your scores → gap analysis → plan. |
| `prep/company_research.py` | Curated company knowledge first, Groq second, cached. |
| `prep/jd_analyzer.py` | Turns a pasted job description into structured requirements. |
| `prep/candidate_profiler.py` | Your profile and actual scores, from the database. |
| `prep/gap_analyzer.py` | What the role needs vs. how you've scored (pure, deterministic). |
| `prep/planner.py` | Writes the week-by-week plan (Groq), checked against the topic vocabulary. |
| `prep/render.py` | Turns the plan into an ARIA message + practice buttons. |
| `prep/intent.py`, `vocabulary.py`, `schemas.py` | Spotting "prepare me for X", shared topic keys, output schemas. |

### backend/app/gateway/: every AI call goes through here

| File | What it does |
|---|---|
| `ai_gateway.py` | The interface: chat, JSON, embeddings, code execution; token budgets and error mapping. |
| `groq_gateway.py` | Real implementation on Groq (`gpt-oss-120b` / `gpt-oss-20b`). |
| `fake_gateway.py` | Scripted stand-in for tests and keyless local runs. |
| `embeddings.py` | Hugging Face embeddings for ARIA's search. |
| `usage.py` | Records every AI call (tokens, cost, latency, errors, prompt version) in `llm_calls`. |
| `types.py` | Shared request/response types. |

### backend/app/db/ and utils/

| File | What it does |
|---|---|
| `db/client.py` | MongoDB / Cosmos connection, collections and indexes. |
| `db/models/*.py` | Pydantic models: user, profile, interview config, question, company. |
| `db/repositories/*.py` | All database reads/writes, one file per collection group. |
| `db/seed.py` | Question bank + companies (all envs); dev user (local only). |
| `utils/security.py` | bcrypt passwords, JWT tokens. |
| `utils/rate_limit.py` | Per-process sliding-window limits (login, register, ARIA, interviews, code runs, prep). |
| `utils/metrics.py` | In-memory live metrics for the admin page. |
| `utils/logging.py` | JSON logs with request/user/session IDs. |
| `utils/exceptions.py`, `responses.py` | One error/response envelope for every endpoint; no stack traces to clients. |

### backend/scripts/

| File | What it does |
|---|---|
| `seed.py` | `python -m scripts.seed` loads questions + companies; `--check` validates; `--dev-user` (local only). |
| `check_groq.py` | Live Groq sanity check (never prints the key). |

## frontend/

```
frontend/
├── Dockerfile, .dockerignore   production image (next build → next start, non-root)
├── .env.example                NEXT_PUBLIC_API_URL only (public, inlined into the bundle)
├── .npmrc                      npm cache inside the project (.npm-cache/)
├── next.config.mjs             security headers, no "powered by" header
├── eslint.config.mjs, jsconfig.json (@/ imports), postcss.config.mjs (Tailwind 4), package.json
├── app/          pages (Next.js App Router)
├── components/   UI, grouped by area
├── lib/          API client, socket, pure helpers
└── store/        Zustand state
```

### frontend/app/: pages

| Route / file | What it is |
|---|---|
| `layout.js` | Root: fonts, metadata, skip link, motion settings, the persistent 3D room, toasts. |
| `globals.css` | Design tokens (dark palette), Tailwind theme, animations, print styles. |
| `page.js` → `/` | Landing page ("Take the seat"). |
| `(auth)/layout.js`, `login/`, `register/` | Sign in / create account: one card that morphs between them. |
| `(app)/layout.js` | Signed-in shell: auth guard, sidebar, top bar, status line, ⌘K. |
| `(app)/dashboard/` | Your desk: 3D desk with report sheets, KPIs, score trend, topics, activity, Ask ARIA, interviews. |
| `(app)/interview/configure/` | Start an interview: presets, Customise, VERA's brief. |
| `(app)/interview/session/[sessionId]/` | The interview room (and the coding room). |
| `(app)/interview/report/[reportId]/` | The report as a story, ending with the VERA → ARIA handoff; printable. |
| `(app)/mentor/` | ARIA's chat, conversations, company prep. |
| `(app)/profile/`, `profile/setup/` | Profile editing; the 4-step onboarding wizard. |
| `(app)/admin/` | Admin dashboard (metrics, cost, prompt A/B). Needs an `ADMIN_EMAILS` account. |
| `*/layout.js` (small ones) | Only set each page's browser-tab title. |
| `error.js`, `global-error.js`, `not-found.js`, `(app)/loading.js`, `(app)/error.js` | Error, 404 and loading states. |
| `design/` | `/design` living style guide (dev only; 404 in production). |
| `icon.svg` | Favicon (the chair under the light). |

### frontend/components/

| Folder | What's inside |
|---|---|
| `three/` | The 3D interview room (three.js via react-three-fiber): `SceneHost` (one persistent canvas), `InterviewRoom` (camera shots, lights), `furniture` (chair, desk, lamp from code), `DeskItems` (report sheets, lamp pool), `Effects` (bloom, tone mapping), `materials`/`textures` (procedural), `RoomPoster` (no-WebGL fallback), `framings`, `SceneBackdrop`. |
| `landing/` | Landing sections: header, hero, the loop story, bands, VERA & ARIA, interview types, sample report, FAQ, final CTA. |
| `auth/` | `AuthShell` (room + card + camera moves), `AuthForm` (sign in ⇄ sign up). |
| `profile/` | Onboarding wizard, skills input. |
| `layout/` | App shell: sidebar, top bar, user menu, ⌘K palette, status line, phone tab bar, auth guard, error state. |
| `dashboard/` | Desk hero, score trend, activity heatmap, recent interviews, Ask ARIA, empty desk, data hook. |
| `interview/` | `configure/` (presets, VERA's brief), `room/` (header, rounds, answer box, finish), evaluation card, timer ring. |
| `coding/` | Coding room: problem panel, Monaco editor (custom theme), console/test results. |
| `report/` | Report hero, chapters, handoff, print transcript. |
| `mentor/` | ARIA: chat bubbles (typewriter), answers with citation cards, input, sidebar, welcome, prep form + timeline. |
| `charts/` | `ScoreBars` (accessible bar chart with table view). |
| `brand/` | Logo, VERA and ARIA avatars, agent status lines. |
| `motion/` | Animation helpers: reveals, split headings, word reveal, typewriter, counters, page transitions, magnetic buttons, marquee. |
| `providers/` | Smooth scrolling (landing only). |
| `ui/` | Component library: Button, Card, Field, Badge, Alert, Tabs, Dialog, Tooltip, Toaster, Skeleton, ProgressRing, StatTile, SpotlightCard, Kbd, icons… |
| `admin/` | Prompt version / A/B settings. |

### frontend/lib/ and store/

| File | What it does |
|---|---|
| `lib/api.js` | REST client: auth headers, token refresh (shared across tabs), error envelope. |
| `lib/interviewSocket.js` | Interview WebSocket: auth handshake, heartbeat, reconnect with backoff. |
| `lib/session.js` | Sign-out and safe redirects. |
| `lib/dashboard.js`, `desk.js` | Pure functions turning API data into dashboard numbers and desk sheets. |
| `lib/interviewOptions.js`, `interviewPresets.js`, `profileOptions.js` | Option lists, labels, presets, drill links. |
| `lib/navigation.js`, `format.js`, `useMediaQuery.js`, `useElementWidth.js` | Nav items, formatting, small hooks. |
| `store/authStore.js` | Session: the 30-minute access token + user in `localStorage` (synced across tabs); the refresh token is an httpOnly cookie the page can't read. |
| `store/profileStore.js`, `mentorStore.js`, `shellStore.js` | Profile, ARIA chat state, status line / ⌘K data. |
| `store/sceneStore.js`, `uiStore.js`, `toastStore.js` | Which 3D shot is showing, sidebar state, toasts. |

## prompts/

Versioned prompt text files (`*_v1.txt`, `_v2.txt`), chosen by the prompt registry:
`interviewer/` (VERA: opening, questions, hints, dialogue), `evaluator/` (technical, behavioural, coding scoring), `report/` (report writing), `mentor/` (ARIA), `prep/` (company research, JD analysis, planner).

## data/seed/

`question_bank/*.json` (technical, ML, behavioural and 18 coding problems with hidden tests) and `companies/companies.json` (10 curated companies). `data/chroma/` (ARIA's index) is created at runtime and never committed.

## evaluation/

AI quality checks run against real Groq: `interview_eval/` (evaluator accuracy vs hand scores), `agent_eval/` (interviewer behaviour, 12 scenarios), `question_eval/` (LLM-judged question quality), `mentor_eval/` (ARIA grounding, declines, injection, citations), `datasets/` (their inputs), `history.py` + `trends.py` (results over time; run output goes to the gitignored `evaluation/results/`).

## docs/

| File | What it covers |
|---|---|
| `architecture.md` | Components, database schema, AI gateway, the REST/WebSocket contract. |
| `flow.md` | User journeys and state flows. |
| `deployment.md` | How to deploy: a VPS with Docker, Vercel + Render + Atlas, or Azure. |
| `project-structure.md` | This file. |
| `modules/rag-tool/INTEGRATION.md` | Setup and API guide for the RAG module behind ARIA. |

## Local only (gitignored, never pushed)

- **Secrets:** `.env`, `frontend/.env.local`.
- **Installed packages and caches:** `backend/.venv/` (Python packages + pip cache), `frontend/node_modules/`, `frontend/.npm-cache/`, `.next/`, caches and logs.
- **Runtime data:** `data/chroma/` (ARIA's index, created at runtime).
- **Working docs written while building:** `workingflow.md` (progress log), `docs/implementation_plan.md`, `docs/plan-review.md`, `docs/interview-agent-implementation-plan.md`, `docs/design-system.md`, `docs/usability-test.md`, `docs/modules/coding-sandbox.md`, `docs/modules/rag-tool/TEAM_HANDOFF.md`, `docs/archive/`.
- **Superseded code:** `backend/app/core/coding/sandbox_tool/` and `backend/scripts/sandbox_demo.py` (the old sandbox), `frontend/prototypes/`.
- **Tool files:** `.claude/`, `frontend/AGENTS.md` + `CLAUDE.md` (written by Next.js).
- **Eval output:** `evaluation/results/`.

Some code comments still point at the working docs (e.g. "implementation_plan.md 1.7"); those files exist only on the original author's machine.
