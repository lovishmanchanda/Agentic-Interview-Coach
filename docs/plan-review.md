# Plan Review — Live Interview Coach

> **Date**: 2026-09-25
> **Scope**: A review of `implementation_plan.md`, `architecture.md`, `flow.md` and `interview-agent-implementation-plan.md` against the two modules that are already built: `rag_tool` (Mentor RAG) and `sandbox_tool` (coding sandbox).
> **Outcome**: The four docs in this folder have been updated in place. This file records **what changed, why, and what was added**, so the old and new plans can be compared.

---

## 1. Decisions locked in

| Area | Old plan | New plan | Why |
|---|---|---|---|
| Code execution | Azure AI Foundry Code Interpreter (Python) + Judge0 (other languages) | **Piston only**, self-hosted on an Azure VM: python 3.12.0, c 10.2.0, c++ 10.2.0, java 15.0.2, javascript 20.11.1 | It's already running and wired into `sandbox_tool`. One backend, one result format, no Code Interpreter session keep-alive to manage. |
| Mentor RAG store | Azure AI Search `interview-history` index, hybrid search | **`rag_tool` (Chroma + HF embeddings) now, with Azure AI Search later**, both behind `gateway.embed()` / `gateway.search()` | Built and tested (12 tests), with intent routing, dedupe and citations. Swapping to AI Search later only touches the gateway. |
| Mentor LLM | Azure OpenAI GPT-4o | **Groq `openai/gpt-oss-120b`** (via `rag_tool`) | Free tier, already calibrated against the eval set. |
| Interview / evaluation LLM | Azure OpenAI GPT-4o | **Groq**: `gpt-oss-120b` for the interviewer and reports, `gpt-oss-20b` for answer evaluation (decided 2026-09-26) | One provider and one key for every LLM call; free tier. Tool calling and JSON output quality get checked in Phase 1. |
| Question source | Contradictory: "no in-house store" (plan §1.1) vs a `question_bank` collection (architecture) | **Hybrid**: Cosmos `question_bank` (seeded from `data/seed/*.json`), with an LLM generation fallback. The research engine is a later add-on that adds questions to the bank. | Coding questions need stored test cases, and graded execution is impossible without them. |
| Agent loop framework | Open question (Q1) | **Hand-rolled ReAct loop** on `gateway.generate_with_tools()` | The doc already leaned this way. It keeps retries, prompt versioning and token budgets in the gateway. |

---

## 2. Contradictions fixed

| # | Problem | Fix (where) |
|---|---|---|
| A1 | The question bank both exists and doesn't | Hybrid bank (plan §1.1, arch §5, §8.3) |
| A2 | Preparation-module leftovers: `preparation_sessions` / `preparation_progress` in the ER diagram, `api/v1/preparation.py`, the "Preparation Module" in flow §11/§14, the Phase 2 check "practice session updates progress", and `preparation_link` in reports | Removed. Loop closure now goes to the **Mentor** and to a **Weak-Area Drill interview** (feature N3). |
| A3 | Repo layout: `backend/core/coding/` outside `backend/app/`; `api/v1/mentor.py` and `api/v1/code.py` missing; `mentor_conversations` missing from the ER diagram; `prompts.md` outside `docs/` | Layout corrected (plan "Project Structure", arch §5.1) |
| A4 | Principle 1 says "the LLM never decides state transitions", yet `AgentDecision.next_state` was chosen by the LLM and applied by the engine | The LLM **proposes** an `action`. The engine maps the action to a state, checks it with `StateMachine.can_transition()`, and `AdaptationEngine._should_wrap_up()` can overrule it. `next_state` is removed from the LLM output schema (agent plan). |
| A5 | Coding WebSocket events disagree: `CODE_SUBMIT` (architecture) vs `CANDIDATE_CODE_RESULT {code, execution_result}` (agent plan, sandbox README). The second trusts a result the browser reports. | Only `CODE_SUBMIT {code, language, is_final}` from the client. The server executes and emits `CODE_RESULT`. |
| A6 | Result status enums differ (`time_limit_exceeded` / `internal_error` vs `time_limit`) | One `ExecutionStatus` enum: `accepted, wrong_answer, time_limit, runtime_error, compile_error, internal_error` |
| A7 | Agent framework open question | Resolved (see §1) |

---

## 3. Design vs built modules

**`rag_tool`** (`backend/app/core/mentor/rag_tool/`)
- It's stateless: `RagService.answer(request, invoke_llm)`. Conversation persistence stays in `mentor_agent.py`, which loads the last 8 turns from `mentor_conversations`, calls `answer()`, and saves the turn along with `sources` (→ `retrieved_chunks`).
- Its report schema (`InterviewReport`) is different from the Cosmos `interview_reports` document. **Adapter**: `core/mentor/indexer.py::to_rag_report(report, evaluations, questions)` maps `candidate_id → user_id`, and each evaluation + question → `QuestionFeedback` (score, strengths, weaknesses, feedback, suggestion). It runs as a background task on `REPORT_READY`.
- Its built-in router (`/api/mentor/chat`) is **not mounted**. `/api/v1/mentor/message` replaces it, and `user_id` always comes from the JWT.
- The retrieval behaviour documented in flow §4 now matches the code: intent routing (specific / vague / comparison), a 0.8 cosine-distance cutoff, at most 2 chunks per session, and `[n]` citations normalised to ASCII.

**`sandbox_tool`** (`backend/app/core/coding/sandbox_tool/`)
- It implements the two agent tools. It was built against the WebSocket design, so the tool signatures fit, but these issues need to be fixed in Phase 4:

| # | Issue | Fix |
|---|---|---|
| C1 | `status` depends only on the process exit code, so deleting the starter's `assert` lines gives "accepted". `test_cases` (including hidden ones) are never run, and `problem_id` is unused. | A server-side **test harness**: look up the problem by `problem_id`, wrap the candidate's function, run every test (hidden ones too), and return per-test results. Python first; other languages are run-only until they have a harness. |
| C2 | A separate Flask server on `0.0.0.0:9000`, one global `_current_question` shared by all users, and `webbrowser.open` called on the server | `api/v1/code.py` (practice runs) + WebSocket events. The current problem is stored per session in `interview_sessions.current_coding_problem`. |
| C3 | Piston is called directly, in two places, with a hard-coded IP, and `load_dotenv` runs when the module is imported | One `core/coding/sandbox_client.py`, called only via `gateway.execute_code()`. `PISTON_URL` and `PISTON_API_KEY` come from `config.py`. |
| C4 | Go is listed in `LANG_MAP` and the starter code, but Piston doesn't support it | Remove Go. Add C. |
| C5 | Unused `db` / `gateway` parameters, `difficulty` ignored, a 3-problem in-code bank | Problems move to `question_bank` (`for_coding_interview=true`) via seed JSON. `difficulty` becomes a filter. |

---

## 4. Security and hygiene

1. **Rotate the JDoodle credentials.** `jdoodle.py` and `test_proxy.py` in `Live Interview Coach copy/` contain a hard-coded client ID and secret. Neither file was carried into this project.
2. **Piston VM**: it currently uses plain HTTP with an API key. Put TLS in front of it, or restrict the VM's firewall to the App Service outbound IPs. Code size is capped at 10,000 characters before forwarding, and executions are rate-limited per user.
3. The old repo's `.gitignore` excluded the design docs, so they never reached Git. The new `.gitignore` only ignores secrets, data and build output.

---

## 5. New features added

| # | Feature | Phase | Why it's worth it |
|---|---|---|---|
| N1 | **Graded coding with per-test results.** Visible tests show pass/fail with input and expected vs actual output. In Serious mode, hidden tests show only a count. | 4 | It makes the coding round a real signal, and the CodeEvaluator gets objective input alongside the LLM judgement. |
| N2 | **Resumable sessions.** When the WebSocket reconnects, the server sends `SESSION_SNAPSHOT {state, current_question, transcript, coding_problem?, draft_code?}` | 1 | Principle 3 says state survives disconnects. This makes it visible to the user: the UI rebuilds exactly where it was. |
| N3 | **Weak-Area Drill interview.** The report's "Practice Weak Areas" button opens `/interview/configure?topics=…` with the topics taken from `weak_areas`, and the Mentor can suggest the same drill link. | 2, 4 | It closes the core loop (Interview → Report → Mentor → **Interview Again**) now that there's no Preparation module. |
| N4 | **Mentor citation chips.** Each `[n]` in a Mentor answer shows as a chip (date · topic) linking to that session's report. | 2 | `rag_tool` already returns `sources`. It's cheap, and it makes the Mentor feel grounded. |
| N5 | **Token budget per session in the AI Gateway.** `_log_usage` adds up tokens for each session and user. Over `SESSION_TOKEN_BUDGET`, the engine forces a graceful wrap-up. | 1 (hook), 6 (dashboards) | It keeps spending predictable with GPT-4o, and it's easy to add when the gateway is first built. |

### 5b. Process and product improvements (second review pass)

| # | Improvement | Where in the plan | Why |
|---|---|---|---|
| S1 | **Build order 0 → 1 → 2 → 4 → 3 → 5 → 6** (phase numbers unchanged) | "Execution Order & MVP Cut" | Coding is mostly built and demos well. Company prep is the least essential and most expensive. This closes the full loop sooner. |
| S2 | **Walking skeleton first**: one hard-coded question → answer → basic eval → report → RAG index → Mentor cites it | Phase 1.0 | Finds integration problems (WebSocket, state, report shape, RAG adapter) in week 1 instead of week 5 |
| S3 | **`FakeAIGateway`** with scripted LLM and Piston replies | Phase 0.2, Automated Tests | Fast, free, deterministic tests of agent loops and full interviews, the same pattern as `rag_tool`'s `FakeEmbeddings` |
| S4 | **Local dev without Azure**: `docker-compose` with the Cosmos emulator or MongoDB, local Chroma, and the fake Gateway | Phase 0.1 | Develop and demo with no cloud keys; much faster iteration |
| S5 | **Evaluator test set**: 20–30 hand-scored answers per evaluator, re-scored on every prompt change | Phase 1.7 (was implicitly Phase 6) | Scoring accuracy is what users trust; regressions are caught before they ship |
| S6 | **Transcript replay** on the report: question · answer · evaluator notes (coding: code + failed tests) | Phase 1.11, 4.8 | Often the most useful part of a report, and it's cheap because all the data is already stored |
| S7 | **Model answer outline** in practice mode | Phase 1.7, 1.11 | Candidates learn more from "a strong answer covers…" than from a score |
| S8 | **MVP = Phases 0, 1, 2, 4, text only**; voice and company prep come after | "Execution Order & MVP Cut", Phase 3/5 notes | Keeps the riskiest phase (voice) off the critical path |
| S9 | **Session-ID logging from Phase 0** | Phase 0.2, Phase 6 note | Debugging the agent loop without it is painful |

---

## 6. Phase changes at a glance

| Phase | Old | New |
|---|---|---|
| 0 | Includes the Azure AI Search index setup | AI Search is deferred. Setup adds the Chroma path and `data/seed/` question JSON, plus `docker-compose` local dev (S4), `FakeAIGateway` (S3) and session-ID logging (S9). |
| 1 | Question Research Engine | Starts with the walking skeleton (S2). Hybrid question bank + LLM fallback. Adds `SESSION_SNAPSHOT` (N2), the gateway token budget hook (N5), the evaluator test set (S5), model answers (S7) and transcript replay (S6). |
| 2 | Build the RAG pipeline from scratch on AI Search (1.5–2 weeks) | **Integrate the built `rag_tool`** (≈1 week): the adapter, `mentor_agent.py`, conversation persistence, the v1 API and the UI with citations (N4) |
| 3 | Company prep agent | Reads interview history through `RagService` instead of AI Search. **Built after Phase 4, outside the MVP** (S1, S8). |
| 4 | Live coding on Code Interpreter + Judge0 | Coding on **Piston via `sandbox_tool`**, with fixes C1–C5, the harness (N1), the drill CTA (N3) and coding transcript replay (S6). **Built before Phase 3** (S1). |
| 5 | Voice | Unchanged in scope; **outside the MVP** (S8) |
| 6 | Observability | Upgrades what starts earlier (S5, S9). Adds token-budget dashboards (N5) and the `rag_tool` eval set in `evaluation/` |

---

## 7. Still open

1. ~~**Interview-agent LLM**~~ ✅ Groq for everything (2026-09-26). Watch in Phase 1: tool-calling reliability and JSON output from gpt-oss on Groq, and free-tier rate limits during a full interview.
2. **When to move the Mentor to Azure AI Search**: only needed for hybrid keyword search, or for scale beyond one App Service instance (Chroma is local-disk).
3. **Piston TLS / network restriction** (§4.2).
4. **Harness languages after Python**: JavaScript is the likely next one (it's the simplest to wrap).
