# AI Interview Coach — System Flow Documentation

> **Derived from**: `implementation_plan.md`
> **Purpose**: Defines every user journey, system flow, state machine, and agent workflow in the platform. All engineering decisions should trace back to these flows. When building any feature, refer to the corresponding flow diagram here first.

---

## Table of Contents

1. [Core Product Loop](#1-core-product-loop)
2. [Authentication & Onboarding Flow](#2-authentication--onboarding-flow)
3. [Application Routing Overview](#3-application-routing-overview)
4. [AI Mentor Flow](#4-ai-mentor-flow)
5. [Company Preparation Agent Flow](#5-company-preparation-agent-flow)
6. [Interview Configuration Flow](#6-interview-configuration-flow)
7. [Master Interview State Machine](#7-master-interview-state-machine)
8. [Technical Interview Flow (Text Mode)](#8-technical-interview-flow-text-mode)
9. [Personal / Behavioral Interview Flow](#9-personal--behavioral-interview-flow)
10. [Live Coding Interview Flow](#10-live-coding-interview-flow)
11. [Serious Interview Mode Flow](#11-serious-interview-mode-flow)
12. [Answer Evaluation Pipeline](#12-answer-evaluation-pipeline)
13. [Voice Interview Flow (Phase 5)](#13-voice-interview-flow-phase-5)
14. [Report Generation & Loop Closure](#14-report-generation--loop-closure)
15. [AI Gateway Request Routing](#15-ai-gateway-request-routing)
16. [WebSocket Communication Protocol](#16-websocket-communication-protocol)

---

## 1. Core Product Loop

The heartbeat of the entire platform. Everything in the system exists to power this cycle.

```mermaid
flowchart TD
    A([Candidate]) --> B[Build Profile\nSkills · Role · Experience]
    B --> C{First time?}
    C -- Yes --> D[Set up Profile\nComplete wizard]
    C -- No --> E[Dashboard\nView interview history & scores]
    D --> E

    E --> F{Choose action}

    F -- Talk to Mentor --> G[AI Mentor\nPersonalized coaching based on history]
    F -- Interview --> H[Interview Module\nTechnical · Behavioral · Coding]

    G --> I[Mentor gives guidance\nWhat to study · How to improve]
    I --> H

    H --> J[Interview Complete]
    J --> K[Evaluation Engine\nMulti-dimensional scoring]
    K --> L[Interview Report\nScores · Strengths · Weak Areas]
    L --> M[Talk to Mentor\nMentor reads report via RAG\nGives personalized next steps]
    M --> N{Action}
    N -- Follow Mentor advice --> H
    N -- Take Interview Again --> H
    N -- View Dashboard --> E

    style A fill:#6366f1,color:#fff
    style L fill:#10b981,color:#fff
    style K fill:#f59e0b,color:#000
    style G fill:#8b5cf6,color:#fff
    style M fill:#8b5cf6,color:#fff
```

---

## 2. Authentication & Onboarding Flow

```mermaid
flowchart TD
    START([User visits app]) --> LP[Landing Page]
    LP --> AUTH{Has account?}

    AUTH -- No --> REG[Register Page\nName · Email · Password]
    AUTH -- Yes --> LOGIN[Login Page\nEmail · Password]

    REG --> HASH[Backend: Hash password\nbcrypt]
    HASH --> STORE[Store user in Cosmos DB]
    STORE --> JWT_ISSUE[Issue JWT access token\nplus refresh token]

    LOGIN --> VERIFY[Backend: Verify credentials]
    VERIFY -- Invalid --> ERR[Show error message]
    ERR --> LOGIN
    VERIFY -- Valid --> JWT_ISSUE

    JWT_ISSUE --> PROFILE_CHECK{Profile\ncomplete?}

    PROFILE_CHECK -- No --> WIZARD[Profile Setup Wizard]
    WIZARD --> STEP1[Step 1: Personal Info\nName · Education · Experience]
    STEP1 --> STEP2[Step 2: Target Role\nRole · Company · JD optional]
    STEP2 --> STEP3[Step 3: Skills\nAdd skills from suggestions]
    STEP3 --> STEP4[Step 4: Preferences\nInput mode: text or voice]
    STEP4 --> SAVE_PROFILE[Save candidate_profile to DB]
    SAVE_PROFILE --> DASHBOARD

    PROFILE_CHECK -- Yes --> DASHBOARD[Dashboard]

    style START fill:#6366f1,color:#fff
    style DASHBOARD fill:#10b981,color:#fff
    style JWT_ISSUE fill:#f59e0b,color:#000
```

---

## 3. Application Routing Overview

High-level page map and route access rules.

```mermaid
flowchart LR
    subgraph Public["Public Routes - no auth required"]
        R1["/ Landing"]
        R2["/login"]
        R3["/register"]
    end

    subgraph Protected["Protected Routes - JWT required"]
        R4["/dashboard"]

        subgraph Mentor["Mentor"]
            R5["/mentor\nChat with AI Mentor"]
        end

        subgraph Interview["Interview"]
            R10["/interview/configure"]
            R11["/interview/session/sessionId"]
            R12["/interview/report/reportId"]
        end

        R13["/profile"]
    end

    Public -->|"Login or Register success"| R4
    R4 --> Mentor
    R4 --> Interview
    R4 --> R13

    style Public fill:#1e293b,color:#94a3b8
    style Protected fill:#0f172a,color:#94a3b8
```

---

## 4. AI Mentor Flow

> **Prototype-first**. The Mentor is the replacement for the entire preparation module. Instead of topic-by-topic learning, the candidate talks to an AI Mentor that knows their full interview history. The Mentor uses **RAG** (Retrieval Augmented Generation) to retrieve past interview reports, evaluation results, and performance data, then gives genuinely personalized coaching.

### 4a. Mentor — Core Chat Flow (Prototype)

```mermaid
flowchart TD
    DASH[Dashboard] --> MENTOR_PAGE[Mentor Page\n/mentor]

    MENTOR_PAGE --> LOAD[Backend: Load Mentor context\nFetch candidate_profile from DB]
    LOAD --> HISTORY_CHECK{Has interview history?}

    HISTORY_CHECK -- No --> WELCOME[Mentor intro message:\n'Hi, I am your interview coach.\nTake your first interview and\nI will help you improve.']
    HISTORY_CHECK -- Yes --> RAG_LOAD[rag_tool recency retrieval:\nsummary + recommendations chunks\nof the 2 most recent sessions]

    RAG_LOAD --> CONTEXT_BUILD[Build Mentor prompt:\nNumbered excerpts 1..n\nConversation history last 6 turns]

    CONTEXT_BUILD --> MENTOR_AGENT[Mentor Agent\nGroq gpt-oss-120b via Gateway\nPrompt: mentor/mentor_v1.txt]

    MENTOR_AGENT --> GREETING[Mentor greeting message:\nPersonalized based on last report\ne.g. 'Your DSA score dropped last time.\nLets work on that.']

    GREETING --> CHAT_LOOP[Candidate types message]

    CHAT_LOOP --> USER_MSG[User message received\ne.g. 'What should I study?'\nor 'How did I do in interviews?'\nor 'I am weak in system design']

    USER_MSG --> EMBED[rag_tool.classify_intent\nspecific · vague · comparison]

    EMBED --> RETRIEVE[Retrieve from Chroma\nfiltered by user_id = candidate_id\nsee 4b for each mode]

    RETRIEVE --> CHUNKS[Max 2 chunks per session\nNone left → no-data message, no LLM call]

    CHUNKS --> MENTOR_RESPOND[Mentor Agent\nAnswers only from the excerpts\nCites every claim as n]

    MENTOR_RESPOND --> RESPONSE[Mentor response displayed\nCitation chips: date · topic → report\nOptional Weak-Area Drill link]

    RESPONSE --> STORE_TURN[Store conversation turn in DB\nmentor_conversations\nretrieved_chunks = sources]

    STORE_TURN --> ACTION{Candidate action}
    ACTION -- Continue chat --> CHAT_LOOP
    ACTION -- Take interview --> INT_CONFIG[Interview Configuration]
    ACTION -- End session --> DASH

    style DASH fill:#6366f1,color:#fff
    style MENTOR_AGENT fill:#8b5cf6,color:#fff
    style RETRIEVE fill:#f59e0b,color:#000
    style INT_CONFIG fill:#10b981,color:#fff
```

### 4b. RAG Pipeline — What Gets Indexed

Implemented by the built **`rag_tool`** module (`backend/app/core/mentor/rag_tool/`).

```mermaid
flowchart LR
    subgraph SOURCES["Data Sources (Cosmos DB)"]
        IR[interview_reports\nOverall scores · Strengths · Weak areas]
        EV[evaluations\nPer-answer dimension scores]
        IQ[interview_questions\nQuestion text · topic]
    end

    subgraph INDEXING["Indexing (background task on REPORT_READY)"]
        ADAPT[indexer.to_rag_report\nCosmos docs → rag_tool.InterviewReport\ncandidate_id → user_id]
        CHUNK[chunks_for_report\nsession:summary\nsession:question:qid\nsession:recommendations]
        EMBED_IDX[HF all-MiniLM-L6-v2\n384-dim, via Gateway]
        UPSERT[Upsert into Chroma\ninterview_reports_v2\nDeterministic IDs, so it's idempotent]
    end

    subgraph RETRIEVAL["Retrieval at Query Time (intent-routed)"]
        INTENT{classify_intent}
        SPEC[specific: similarity search\nquery + last 2 user turns\ndrop distance > 0.8\nno hits + generic question → vague]
        VAGUE[vague: 2 most recent sessions\nsummary + recommendations\nincl. generic 'where am I weakest?']
        COMP[comparison: N most recent sessions\nN parsed from message, 2-5]
        DEDUPE[Max 2 chunks per session\nAll filtered by user_id]
    end

    SOURCES --> ADAPT --> CHUNK --> EMBED_IDX --> UPSERT
    INTENT --> SPEC --> DEDUPE
    INTENT --> VAGUE --> DEDUPE
    INTENT --> COMP --> DEDUPE
    UPSERT -.-> SPEC

    style EMBED_IDX fill:#0ea5e9,color:#fff
    style UPSERT fill:#10b981,color:#fff
    style DEDUPE fill:#8b5cf6,color:#fff
```

Generic self-assessment questions ("Where am I weakest?", "What should I practise next?") name no topic, so their embeddings sit just past the 0.8 cutoff (measured 0.81–0.84). `is_generic_self_assessment()` routes them to the vague path. It uses a full-string match, so "What are my weaknesses in SQL?" still goes through similarity. Mid-conversation they stay `specific` but fall back to recency when similarity finds nothing. Off-topic questions ("How's my cooking skill?") still get the no-data reply.

Citations: the answer cites excerpts as `[1]`, `[2]`… (full-width `【n】` is normalised to ASCII). `sources[i].citation == i+1` maps each citation to `{session_id, date, topic, chunk_type}`.

### 4c. What the Mentor Can Help With (Prototype Scope)

| Candidate Message | Mentor Capability |
|---|---|
| "What should I study?" | Retrieves weak areas from past reports, gives priority list |
| "How did I do overall?" | Summarizes performance trends across sessions |
| "I struggle with DSA" | Retrieves DSA-specific evaluation chunks, gives targeted advice |
| "Should I take another interview?" | Recommends based on readiness signals from reports |
| "What were my mistakes?" | Retrieves specific evaluation weaknesses with context |
| "Prepare me for Google" | Triggers Company Prep Agent workflow (Section 5) |
| "Compare my last two interviews" | Comparison mode: summary + recommendations of the N most recent sessions |
| "Drill me on my weak spots" | Returns a Weak-Area Drill link to `/interview/configure?topics=…` |
| Off-topic, or "solve this for me" | Declines and redirects to interview feedback (guardrail in the Mentor prompt) |

> [!NOTE]
> **Prototype boundary**: For the prototype, the Mentor is a RAG-powered chat. Advanced capabilities (Mentor-assigned practice tasks, structured study plans, follow-through tracking) are post-prototype enhancements.

---

## 5. Company Preparation Agent Flow

The Company Prep Agent is now accessible **through the Mentor**. When a candidate says "Prepare me for Company X", the Mentor triggers this workflow.

```mermaid
flowchart TD
    USER_INPUT["Mentor receives:\nPrepare me for Company X for ML Engineer role"] --> ORCH[Preparation Orchestrator]

    ORCH --> AG1[Company Research Agent\nTool: search_company\nTool: search_web]
    ORCH --> AG2[JD Analyzer Agent\nTool: extract_requirements\nInput: JD text pasted by user]
    ORCH --> AG3[Candidate Profiler Agent\nTool: get_candidate_profile\nTool: get_interview_history]

    AG1 --> CR["CompanyProfile\nTech stack · Interview style\nBehavioral values · Team structure"]
    AG2 --> JD["JDRequirements\nRole · Skills · Experience\nTechnical areas · Behavioral needs"]
    AG3 --> CP["CandidateSnapshot\nSkills · Interview history\nStrengths from past reports"]

    CR --> GAP[Gap Analyzer]
    JD --> GAP
    CP --> GAP

    GAP --> GA["GapAnalysis\nRequired but weak areas\nStrength overlaps\nPriority gaps ranked by severity"]

    GA --> PLANNER[Preparation Planner Agent]
    CR --> PLANNER
    CP --> PLANNER

    PLANNER --> PLAN["PersonalizedPreparationPlan\nPriority topics · Suggested interview timing\nFocus areas based on interview history"]

    PLAN --> MENTOR_REPLY[Mentor displays plan\nin the chat interface\nConversational format]

    MENTOR_REPLY --> ACTION{User action}
    ACTION -- Take interview with focus --> INT_CONFIG[Interview Configuration\nPre-filled with company focus]
    ACTION -- Ask follow-up --> CHAT_LOOP[Continue Mentor chat]

    ORCH -.->|"Every step logged"| OBS[agent_runs collection\nInput · Tool calls · Outputs · Latency]

    style USER_INPUT fill:#6366f1,color:#fff
    style PLAN fill:#10b981,color:#fff
    style GAP fill:#f59e0b,color:#000
    style MENTOR_REPLY fill:#8b5cf6,color:#fff
    style OBS fill:#1e293b,color:#94a3b8
```

---

## 6. Interview Configuration Flow

Before every interview session, the candidate configures parameters. The backend validates and creates a session.

```mermaid
flowchart TD
    DASH[Dashboard] --> CONFIG[Interview Configuration Page]

    CONFIG --> T{Interview Type}
    T --> TYPE_TECH[Technical Interview]
    T --> TYPE_BEHAV[Personal / Behavioral]
    T --> TYPE_CODE[Live Coding Interview]

    TYPE_TECH --> ROLE[Select Role\nSoftware Engineer · ML Engineer]
    TYPE_BEHAV --> ROLE
    TYPE_CODE --> ROLE

    ROLE --> EXP[Experience Level\nFresher · 1-2 yrs · 3-5 yrs · Senior]
    EXP --> COMPANY[Company optional\nFor company-specific questions]
    COMPANY --> DIFF[Difficulty\nEasy · Medium · Hard · Adaptive]
    DIFF --> IO_MODE[Input / Output Mode\nText · Voice · Mixed]
    IO_MODE --> INT_MODE[Interview Mode\nPractice · Serious]

    INT_MODE --> START_BTN[Start Interview button]

    START_BTN --> BE_VALIDATE[Backend: Validate configuration]
    BE_VALIDATE --> LOAD_PROFILE[Load candidate_profile from DB\nPrep scores · Interview history]
    LOAD_PROFILE --> LOAD_QS[Question Engine pre-selects\nfirst question based on profile]
    LOAD_QS --> CREATE_SESSION[Create interview_session in Cosmos DB\nStore full config + initial state: SETUP]
    CREATE_SESSION --> WS_CONNECT[Open WebSocket connection\n/ws/interview/session_id]
    WS_CONNECT --> INTERVIEW[Route to Interview Page]

    style DASH fill:#6366f1,color:#fff
    style INTERVIEW fill:#10b981,color:#fff
    style BE_VALIDATE fill:#f59e0b,color:#000
    style CREATE_SESSION fill:#3b82f6,color:#fff
```

---

## 7. Master Interview State Machine

The single most critical flow in the system. **State lives in Cosmos DB — not in the LLM, not in the WebSocket connection.** Reconnection always resumes from the last persisted state.

```mermaid
stateDiagram-v2
    [*] --> SETUP : Session created in DB

    SETUP --> INTRODUCTION : WebSocket connected\nCandidate ready

    INTRODUCTION --> QUESTION : Interviewer Agent generates\nopening question

    QUESTION --> WAITING_FOR_RESPONSE : Question delivered to candidate

    WAITING_FOR_RESPONSE --> EVALUATING : Candidate submits answer

    EVALUATING --> FOLLOW_UP_DECISION : Evaluator Agent scores answer\nEvaluationResult stored in DB

    FOLLOW_UP_DECISION --> QUESTION : Follow-up on same topic\nprobe deeper
    FOLLOW_UP_DECISION --> NEXT_TOPIC : Move to next topic\ncurrent topic sufficient
    FOLLOW_UP_DECISION --> INTERVIEW_COMPLETE : All topics covered\nor time limit reached

    NEXT_TOPIC --> QUESTION : Question Engine selects\nnext topic question

    INTERVIEW_COMPLETE --> GENERATING_REPORT : Trigger Report Generator

    GENERATING_REPORT --> REPORT_READY : Report stored in DB

    REPORT_READY --> [*] : Redirect to report page
```

---

## 8. Technical Interview Flow (Text Mode)

Detailed flow for the primary interview type, from first question to adaptive progression.

```mermaid
flowchart TD
    INTRO[Interviewer Agent generates\nintroduction message] --> Q1

    Q1[Question Engine selects Question\nRole · Difficulty · Topic · History] --> DISPLAY[Display question to candidate]

    DISPLAY --> HINT{Practice Mode?}
    HINT -- Yes --> HINTS_AVAIL[Hints button available]
    HINT -- No --> NO_HINTS[Clean interview room\nno hints shown]
    HINTS_AVAIL --> ANSWER
    NO_HINTS --> ANSWER

    ANSWER[Candidate submits answer] --> BUILD_CTX[ContextBuilder assembles:\nCandidate profile · Question · Answer\nPrevious Q&A · Current state]

    BUILD_CTX --> EVAL[Technical Evaluator Agent\nProblem Understanding · Approach\nCorrectness · Algorithm · Complexity\nEdge Cases · Communication]

    EVAL --> EVAL_JSON[Structured EvaluationResult JSON]
    EVAL_JSON --> STORE_EVAL[Store in Cosmos DB\nLinked to session + answer]
    STORE_EVAL --> UPDATE_PERF[Update running performance_vector]

    UPDATE_PERF --> ADAPT[AdaptationEngine\ncalculates next action]

    ADAPT --> DECISION{Performance tier?}

    DECISION -- Strong --> HARDER[Increase difficulty\nSelect harder question]
    DECISION -- Adequate --> SAME[Same difficulty\nMove to next topic]
    DECISION -- Weak --> FOLLOWUP{Practice mode?}

    FOLLOWUP -- Yes --> COACH[Show coaching feedback\nExplain what was missed · offer retry]
    FOLLOWUP -- No --> EASIER[Easier follow-up question]

    HARDER --> STATE_CHECK
    SAME --> STATE_CHECK
    EASIER --> STATE_CHECK
    COACH --> STATE_CHECK

    STATE_CHECK{Topics covered?\nTime limit reached?}
    STATE_CHECK -- No --> Q1
    STATE_CHECK -- Yes --> WRAP[Interviewer Agent: closing message\nState machine: INTERVIEW_COMPLETE]

    style INTRO fill:#6366f1,color:#fff
    style EVAL fill:#f59e0b,color:#000
    style ADAPT fill:#3b82f6,color:#fff
    style WRAP fill:#10b981,color:#fff
    style COACH fill:#22c55e,color:#000
```

---

## 9. Personal / Behavioral Interview Flow

Behavioral interviews use the STAR framework as the evaluation backbone.

```mermaid
flowchart TD
    START[Behavioral Interview Starts\nInterviewer: warm introduction] --> BQ[Select behavioral question\nFrom tagged question bank\nLeadership · Ownership · Problem Solving]

    BQ --> PROMPT[Deliver question to candidate\ne.g. Tell me about a time you\nled a difficult project]

    PROMPT --> ANSWER[Candidate answers]

    ANSWER --> STAR_EVAL[STAR Evaluator Agent]

    STAR_EVAL --> SIT[Situation\nClarity of context\n0-10]
    STAR_EVAL --> TASK[Task\nRole definition\n0-10]
    STAR_EVAL --> ACTION[Action\nSpecific steps taken\n0-10]
    STAR_EVAL --> RESULT[Result\nQuantifiable outcome\n0-10]

    STAR_EVAL --> COMM[Communication\nClarity · Structure]
    STAR_EVAL --> CONF[Confidence\nAssertiveness · Ownership]
    STAR_EVAL --> SPEC[Specificity\nConcrete vs vague]

    SIT & TASK & ACTION & RESULT & COMM & CONF & SPEC --> EVAL_JSON[Structured BehavioralEvaluation\nPer-dimension scores\nWHY each score was given]

    EVAL_JSON --> STORE[Store in DB]

    STORE --> MODE{Interview Mode?}
    MODE -- Practice --> FEEDBACK[Show full STAR breakdown\nExplain gaps · Suggest improvement]
    MODE -- Serious --> SILENT[Silent evaluation\nNo feedback shown during interview]

    FEEDBACK --> NEXT
    SILENT --> NEXT

    NEXT{More questions?}
    NEXT -- Yes --> BQ
    NEXT -- No --> WRAP_UP[Interviewer wraps up\nState: INTERVIEW_COMPLETE]

    style START fill:#6366f1,color:#fff
    style STAR_EVAL fill:#f59e0b,color:#000
    style FEEDBACK fill:#22c55e,color:#000
    style WRAP_UP fill:#10b981,color:#fff
```

---

## 10. Live Coding Interview Flow

The most technically complex interview type. Combines a real code editor, sandboxed execution, and AI evaluation.

### 10a. High-Level Flow

```mermaid
flowchart TD
    START[Live Coding Interview Starts] --> LANG[Candidate selects language\nPython · JavaScript · Java · C++ · C]

    LANG --> PROB[Interviewer Agent presents coding problem\nProblem statement · Examples · Constraints]

    PROB --> THINK[CANDIDATE_THINKING state\nCandidate may ask clarifying questions\nInterviewer answers conversationally]

    THINK --> CODE[CANDIDATE_CODING state\nMonaco Editor active]

    CODE --> RUN{Candidate clicks Run Code?}
    RUN -- Yes --> EXEC[POST /code/execute\nPiston run, ungraded, stdin allowed]
    EXEC --> OUTPUT[Show output to candidate\nstdout · stderr · runtime]
    OUTPUT --> CODE

    CODE --> SUBMIT[Candidate clicks Submit\nWS CODE_SUBMIT code + language]

    SUBMIT --> HARNESS[Server: test_harness wraps code\nwith ALL test cases incl. hidden]
    HARNESS --> PISTON[Gateway.execute_code → Piston on Azure VM\npython · c · c++ · java · javascript]

    PISTON --> RESULT["ExecutionResult\nstatus · stdout · stderr · runtime\nper-test pass/fail"]

    RESULT --> SHOW_RESULT[WS CODE_RESULT to candidate\nPassed N of M · Runtime\nHidden tests: count only in serious mode]

    SHOW_RESULT --> CODE_EVAL[CodeEvaluator Agent]

    CODE_EVAL --> ADAPT{Performance?}
    ADAPT -- Correct + efficient --> HARDER[Harder problem or\ncomplexity discussion]
    ADAPT -- Correct + slow --> COMPLEXITY[Follow-up: Can you optimize this?]
    ADAPT -- Wrong answer --> WRONG{Mode?}
    ADAPT -- Timeout or Error --> DEBUG[Debugging discussion\nWhat do you think went wrong?]

    WRONG -- Practice --> HINT_FB[Show hint · Point to error area]
    WRONG -- Serious --> NEXT_Q[Move to next problem]

    HARDER --> NEXT_CHECK
    COMPLEXITY --> NEXT_CHECK
    HINT_FB --> CODE
    NEXT_Q --> NEXT_CHECK
    DEBUG --> NEXT_CHECK

    NEXT_CHECK{Time or problem\nlimit reached?}
    NEXT_CHECK -- No --> PROB
    NEXT_CHECK -- Yes --> WRAP[State: INTERVIEW_COMPLETE\nTrigger report generation]

    style START fill:#6366f1,color:#fff
    style CODE_EVAL fill:#f59e0b,color:#000
    style PISTON fill:#0ea5e9,color:#fff
    style WRAP fill:#10b981,color:#fff
```

### 10b. Code Execution Sandbox Routing

```mermaid
flowchart LR
    BE[submit_code_for_execution\nsandbox_tool] --> GRADED{Harness exists\nfor language?}

    GRADED -- "Yes (Python first)" --> WRAP[test_harness.wrap\ncode + all test cases]
    GRADED -- No --> RAW[Run as-is\nrun-only, no grading]

    WRAP --> GW[AIGateway.execute_code]
    RAW --> GW
    GW --> CLIENT[sandbox_client\nPOST PISTON_URL/execute\nX-API-Key · language · version · files · stdin]
    CLIENT --> PISTON[Piston on Azure VM]
    PISTON --> PARSE[test_harness.parse\nper-test JSON lines → results]

    PARSE --> UNIFIED["ExecutionResult\n{ status, stdout, stderr, runtime_ms,\npassed_tests, total_tests, test_results[] }"]

    UNIFIED --> FE[WS CODE_RESULT to frontend\nhidden test details stripped in serious mode]
    UNIFIED --> EVAL[CodeEvaluator]

    style BE fill:#6366f1,color:#fff
    style PISTON fill:#0ea5e9,color:#fff
    style UNIFIED fill:#10b981,color:#fff
```

The browser never reports its own execution result. Grading is based only on the harness's per-test output, never on the exit code.

### 10c. Live Coding State Sub-Flow

```mermaid
stateDiagram-v2
    [*] --> CODING_QUESTION_PRESENTED

    CODING_QUESTION_PRESENTED --> CANDIDATE_THINKING : Problem delivered

    CANDIDATE_THINKING --> CANDIDATE_CODING : Candidate starts typing
    CANDIDATE_THINKING --> CANDIDATE_THINKING : Asks clarifying question\nInterviewer responds

    CANDIDATE_CODING --> CODE_SUBMITTED : Candidate clicks Submit
    CANDIDATE_CODING --> EXECUTION : Candidate clicks Run Code

    EXECUTION --> RESULT_SHOWN : Sandbox returns output
    RESULT_SHOWN --> CANDIDATE_CODING : Candidate iterates

    CODE_SUBMITTED --> EXECUTION : Final code run
    RESULT_SHOWN --> EVALUATING : After final submission

    EVALUATING --> FOLLOW_UP_DECISION

    FOLLOW_UP_DECISION --> CODING_QUESTION_PRESENTED : Correct and fast - harder problem
    FOLLOW_UP_DECISION --> CANDIDATE_CODING : Complexity discussion follow-up
    FOLLOW_UP_DECISION --> CANDIDATE_CODING : Wrong - hint given in practice mode
    FOLLOW_UP_DECISION --> CODING_QUESTION_PRESENTED : Wrong in serious mode - next problem
    FOLLOW_UP_DECISION --> [*] : Time or problem limit reached
```

### 10d. CodeEvaluator Dimensions

```mermaid
flowchart TD
    INPUT["Input to CodeEvaluator:\nProblem Statement\nCandidate Code\nExecution Result\nTime taken to write"] --> EVAL[CodeEvaluator Agent\nGroq gpt-oss with JSON output]

    EVAL --> D1[Correctness\nDo all test cases pass?]
    EVAL --> D2[Approach\nIs the algorithm sound?]
    EVAL --> D3[Time Complexity\nCorrect Big-O analysis?]
    EVAL --> D4[Space Complexity\nMemory awareness?]
    EVAL --> D5[Code Quality\nReadability · Naming · Structure]
    EVAL --> D6[Edge Case Handling\nnull · empty · boundary values]
    EVAL --> D7[Communication\nDid candidate explain before coding?]

    D1 & D2 & D3 & D4 & D5 & D6 & D7 --> OUTPUT["Structured CodeEvaluation JSON\nScore per dimension 0-10\nStrengths · Issues · Suggestions"]

    style INPUT fill:#6366f1,color:#fff
    style EVAL fill:#f59e0b,color:#000
    style OUTPUT fill:#10b981,color:#fff
```

---

## 11. Serious Interview Mode Flow

In Serious mode the Interviewer and Evaluator are **strictly separated**. The Interviewer Agent never sees numeric scores.

```mermaid
flowchart TD
    START[Serious Interview Selected] --> ROOM[Interview Room UI\nClean aesthetic\nNo hints · No scores · No coaching visible]

    ROOM --> INTRO_MSG[Interviewer Agent: introduction message]

    INTRO_MSG --> IA[Interviewer Agent delivers question]

    IA --> CANDIDATE[Candidate submits answer]

    CANDIDATE --> EA[Evaluator Agent\nRuns silently in background]

    EA --> DB_STORE[EvaluationResult stored in DB\nNumeric scores NEVER forwarded to Interviewer]

    DB_STORE --> PERF_TIER["Performance Tier Signal only\n'strong' or 'adequate' or 'weak'"]

    PERF_TIER --> IA_DECISION[Interviewer Agent receives tier signal\nDecides: follow-up · next topic · wrap-up]

    IA_DECISION --> CHECK{Session complete?}
    CHECK -- No --> IA
    CHECK -- Yes --> LOCK[Session locked\nNo more answers accepted]

    LOCK --> REPORT_GEN[Report Generator\nAggregates all silent EvaluationResults]

    REPORT_GEN --> FULL_REPORT[Full Interview Report revealed\nAll scores now visible\nOverall · Technical · Behavioral · Coding\nStrengths · Weaknesses · Recommendations]

    FULL_REPORT --> CTA[Practice Weak Areas button]
    CTA --> PREP[Weak-Area Drill interview\n/interview/configure pre-filled\nfocus_topics = weak_areas]

    style START fill:#6366f1,color:#fff
    style FULL_REPORT fill:#10b981,color:#fff
    style EA fill:#f59e0b,color:#000
    style PERF_TIER fill:#3b82f6,color:#fff
    style LOCK fill:#ef4444,color:#fff
```

---

## 12. Answer Evaluation Pipeline

How a single candidate answer moves from raw text to a structured, multi-dimensional score.

```mermaid
flowchart TD
    ANS[Raw Candidate Answer] --> CTX[ContextBuilder\nassembles evaluation context package]

    CTX --> CP2[Candidate Profile\nRole · Experience · Skills]
    CTX --> QUEST[Question\nTopic · Difficulty · Expected Concepts\nEvaluation Rubric from question bank]
    CTX --> HIST[Answer History\nPrevious Q&A in session]
    CTX --> INT_TYPE[Interview Type\ntechnical / behavioral / coding]

    CP2 & QUEST & HIST & INT_TYPE --> ROUTER{Interview Type?}

    ROUTER -- Technical --> TECH_EVAL[Technical Evaluator Agent\nPrompt: evaluator/technical_v1.txt]
    ROUTER -- Behavioral --> BEH_EVAL[Behavioral Evaluator Agent\nPrompt: evaluator/behavioral_v1.txt]
    ROUTER -- Coding --> CODE_EVAL2[Code Evaluator Agent\nPrompt: evaluator/coding_v1.txt]

    TECH_EVAL --> STRUCTURED[Structured Output via function calling\nJSON schema enforced]
    BEH_EVAL --> STRUCTURED
    CODE_EVAL2 --> STRUCTURED

    STRUCTURED --> SCORE_ENGINE[Score Engine\nWeighted aggregation\nOverall score computed]

    SCORE_ENGINE --> EVAL_RESULT["EvaluationResult stored in DB\nevaluations collection\n{ dimensions, overall, strengths, weaknesses, recommendations }"]

    EVAL_RESULT --> PERF_UPDATE[Update session performance_vector\nper-topic running average]

    PERF_UPDATE --> ADAPT_ENGINE[AdaptationEngine\ndetermines next action]

    style ANS fill:#6366f1,color:#fff
    style EVAL_RESULT fill:#10b981,color:#fff
    style STRUCTURED fill:#f59e0b,color:#000
    style SCORE_ENGINE fill:#3b82f6,color:#fff
```

---

## 13. Voice Interview Flow (Phase 5)

Voice is an **adapter** layered on top of the text interview engine. The core engine is completely unchanged.

```mermaid
flowchart TD
    subgraph INPUT_PATH["Input Path: Candidate to Engine"]
        MIC[Candidate speaks into microphone] --> VAD[Voice Activity Detection\nDetect speech start]
        VAD --> STREAM[Audio captured in browser]
        STREAM --> STT_API[Azure AI Speech SDK\nBatch STT transcription]
        STT_API --> TRANSCRIPT[Text transcript]
        TRANSCRIPT --> ENGINE[Interview Engine\nsame as text mode - unchanged]
    end

    subgraph OUTPUT_PATH["Output Path: Engine to Candidate"]
        ENGINE --> LLM_RESP[LLM generates text response]
        LLM_RESP --> TTS_API[Azure AI Speech SDK\nNeural TTS synthesis]
        TTS_API --> AUDIO[Audio bytes]
        AUDIO --> PLAYBACK[Browser plays audio\nCandidate hears AI interviewer]
    end

    subgraph TURN_DETECT["Turn Detection Logic"]
        VAD --> SPEECH[Speech detected]
        SPEECH --> SILENCE[Silence detected after speech]
        SILENCE --> EOT{Silence duration\nexceeds threshold?}
        EOT -- Yes --> END_TURN[End of turn\nProcess answer]
        EOT -- No --> SPEECH
        END_TURN --> DONE_BTN[OR: Candidate presses\nDone Speaking button\nManual fallback always available]
    end

    subgraph MODES["Supported Mode Combinations"]
        M1[Text to Text\nPhase 1 baseline]
        M2[Text to Speech\nAI speaks · Candidate types]
        M3[Speech to Text\nCandidate speaks · AI text response]
        M4[Speech to Speech\nFull voice interview - Phase 5 flagship]
    end

    style MIC fill:#6366f1,color:#fff
    style ENGINE fill:#f59e0b,color:#000
    style PLAYBACK fill:#10b981,color:#fff
    style EOT fill:#3b82f6,color:#fff
```

---

## 14. Report Generation & Loop Closure

How an interview result closes the loop: back to the Mentor, and into a targeted drill interview.

```mermaid
flowchart TD
    TRIGGER[Interview Complete\nAll EvaluationResults stored in DB] --> REPORT_GEN[Report Generator Agent]

    REPORT_GEN --> AGGREGATE[Aggregate all EvaluationResults\nfor this session]

    AGGREGATE --> SEC1[Overall Score\nWeighted combination of all dimensions]
    AGGREGATE --> SEC2[Technical Score\nDSA · System Design · Language]
    AGGREGATE --> SEC3[Behavioral Score\nSTAR · Communication · Confidence]
    AGGREGATE --> SEC4[Coding Score\nif live coding was included]
    AGGREGATE --> SEC5[Per-Topic Breakdown\nScore per topic covered]
    AGGREGATE --> SEC6[Strengths\nTop performing areas]
    AGGREGATE --> SEC7[Weak Areas\nRanked by severity and impact]
    AGGREGATE --> SEC8[Recommendations\nSpecific actionable next steps]

    SEC1 & SEC2 & SEC3 & SEC4 & SEC5 & SEC6 & SEC7 & SEC8 --> RECO_AGENT[Recommendation Agent\nGroq gpt-oss-120b generates human-readable insights]

    RECO_AGENT --> PREP_PLAN[Suggested Preparation Plan\nPriority topic list\nfeeds the drill link]

    PREP_PLAN --> STORE_REPORT[Store InterviewReport in Cosmos DB\nLinked to session_id and candidate_id]

    STORE_REPORT --> INDEX[Background task:\nindexer.to_rag_report → rag_tool.index_report\nMentor can now cite this session]

    STORE_REPORT --> UPDATE_PROFILE[Update candidate_profile\nPer-topic scores adjusted based on interview]

    UPDATE_PROFILE --> DISPLAY_REPORT[Display Report Page\nScore cards · Radar charts · Full breakdown]

    DISPLAY_REPORT --> CTA2{Candidate action}

    CTA2 -- Talk to Mentor --> MENTOR[Mentor chat\nanswers from this report with citations]
    CTA2 -- Practice Weak Areas --> ROUTE_WEAK[Weak-Area Drill\n/interview/configure?topics=weak_areas]
    CTA2 -- Take Interview Again --> CONFIG[Interview Configuration\nPre-filled with same role]
    CTA2 -- Go to Dashboard --> DASH2[Dashboard\nUpdated with new scores]

    ROUTE_WEAK --> DRILL[Drill interview\nQuestionEngine restricted to focus_topics\nCORE LOOP CLOSED]

    style TRIGGER fill:#6366f1,color:#fff
    style REPORT_GEN fill:#f59e0b,color:#000
    style RECO_AGENT fill:#3b82f6,color:#fff
    style DRILL fill:#10b981,color:#fff
    style INDEX fill:#8b5cf6,color:#fff
    style UPDATE_PROFILE fill:#22c55e,color:#000
```

---

## 15. AI Gateway Request Routing

All AI and code-execution calls go through a single internal gateway. **No component calls Azure, Groq, Chroma or Piston directly.**

```mermaid
flowchart TD
    subgraph CALLERS["Internal Callers"]
        C1[Interviewer Agent]
        C2[Evaluator Agent]
        C3[Mentor Agent · rag_tool]
        C4[Company Research Agent]
        C5[Report Generator]
        C6[Code Evaluator]
        C7[Voice Module]
    end

    CALLERS -->|"Always through gateway only"| GW[AI Gateway\nai_gateway.py]

    subgraph GW_METHODS["Gateway Public Interface"]
        M1["generate(prompt, context) → text"]
        M2["generate_structured(prompt, schema) → validated JSON"]
        M2b["generate_with_tools(messages, tools) → tool call or final message"]
        M3["stream(prompt, context) → streaming chunks"]
        M4["embed(text) → vector"]
        M5["transcribe(audio_bytes) → text"]
        M6["synthesize(text, voice) → audio bytes"]
        M7["search(query, index) → ranked documents"]
        M8["execute_code(language, code, stdin) → ExecutionResult"]
    end

    GW --> GW_METHODS

    GW_METHODS --> GROQ[Groq gpt-oss-120b / gpt-oss-20b\ninterview · eval · reports · Mentor]
    GW_METHODS --> HF_EMB[HF all-MiniLM-L6-v2\nembeddings]
    GW_METHODS --> CHROMA[Chroma\nMentor index]
    GW_METHODS --> AZURE_SPEECH[Azure AI Speech\nSTT and TTS]
    GW_METHODS --> AZURE_SEARCH[Azure AI Search\ncompany + JD, Phase 3]
    GW_METHODS --> PISTON[Piston on Azure VM]

    GW -.->|"Applied to every call"| LOG2[Token usage logging\n+ per-session budget]
    GW -.-> RETRY[Retry with exponential backoff]
    GW -.-> RATE[Rate limit handling]
    GW -.-> ERR[Error normalization]

    style GW fill:#6366f1,color:#fff
    style AZURE_SPEECH fill:#0ea5e9,color:#fff
    style AZURE_SEARCH fill:#0ea5e9,color:#fff
    style GROQ fill:#0ea5e9,color:#fff
    style PISTON fill:#0ea5e9,color:#fff
```

---

## 16. WebSocket Communication Protocol

The real-time channel between the frontend and backend during an active interview session.

```mermaid
sequenceDiagram
    participant FE as Frontend (Next.js)
    participant WS as WebSocket Server (FastAPI)
    participant ENGINE as Interview Engine
    participant DB as Cosmos DB
    participant AI as AI Gateway

    FE->>WS: Connect /ws/interview/session_id
    WS->>DB: Load session state
    DB-->>WS: InterviewSession document
    WS-->>FE: type SESSION_SNAPSHOT, state, transcript, current_question, coding_problem, draft_code
    Note over FE: Sent on every connect AND reconnect,<br/>so the UI rebuilds exactly where it was

    WS->>AI: generate() - interviewer intro message
    AI-->>WS: intro text
    WS-->>FE: type QUESTION, content "Hi, lets start..."
    Note over FE: Candidate reads question

    FE->>WS: type ANSWER, content "The answer is..."
    WS->>DB: Store candidate_answer document
    WS-->>FE: type PROCESSING

    WS->>AI: generate_structured() - evaluate answer
    AI-->>WS: EvaluationResult JSON
    WS->>DB: Store evaluation, update session state

    WS->>ENGINE: AdaptationEngine calculates next action
    ENGINE-->>WS: action NEXT_QUESTION, difficulty hard

    alt Practice Mode
        WS-->>FE: type EVALUATION, scores and feedback shown
    else Serious Mode
        Note over WS,DB: Evaluation stored silently. Nothing sent to FE.
    end

    WS->>AI: generate() - next question
    AI-->>WS: next question text
    WS-->>FE: type QUESTION, next question content

    opt Agent proposes request_coding_challenge
        WS-->>FE: type CODING_CHALLENGE_START, payload (hidden tests stripped)
        FE->>WS: type CODE_DRAFT (debounced autosave)
        FE->>WS: type CODE_SUBMIT, code, language
        WS->>AI: execute_code() via harness → Piston
        AI-->>WS: ExecutionResult with per-test results
        WS->>DB: Store candidate_answer (answer_type code)
        WS-->>FE: type CODE_RESULT
    end

    Note over FE,DB: Loop continues until session complete

    WS->>DB: Set state GENERATING_REPORT
    WS->>AI: Aggregate evaluations and generate report
    AI-->>WS: InterviewReport document
    WS->>DB: Store report
    WS-->>FE: type INTERVIEW_COMPLETE, report_id
    WS->>AI: Background: index report into Mentor RAG (rag_tool)
    FE->>FE: Redirect to /interview/report/report_id
```

Event names and payloads are defined in `architecture.md` §13 (single source of truth).

### Edge cases

| Situation | Behaviour |
|---|---|
| WebSocket drops mid-question or mid-coding | Reconnect → `SESSION_SNAPSHOT` restores the question, transcript and last autosaved code |
| Piston unreachable or times out | `CODE_RESULT` with status `internal_error` / `time_limit`; the candidate can resubmit, and the interview isn't blocked |
| Candidate skips the coding problem | Recorded as an unanswered coding question; the agent moves on |
| Token budget exceeded | `AdaptationEngine` forces a wrap-up; the interviewer closes normally and the report is generated |
| RAG indexing fails | Report stays in Cosmos; indexing is retried (idempotent upsert). The Mentor just can't cite that session yet |

---

## Flow Relationships Map

How all 16 flows connect to each other across the system.

```mermaid
flowchart LR
    F2[Auth and Onboarding] --> F3[App Routing]
    F3 --> F4[AI Mentor Flow]
    F3 --> F5[Company Prep Agent]
    F3 --> F6[Interview Config]

    F4 --> F5

    F6 --> F7[State Machine]
    F7 --> F8[Technical Interview]
    F7 --> F9[Behavioral Interview]
    F7 --> F10[Live Coding Interview]

    F8 --> F12[Evaluation Pipeline]
    F9 --> F12
    F10 --> F12

    F8 --> F11[Serious Interview Mode]
    F9 --> F11
    F10 --> F11

    F11 --> F12
    F12 --> F14[Report and Loop Closure]
    F14 --> F4

    F13[Voice Flow] -.->|"wraps"| F8
    F13 -.->|"wraps"| F9

    F15[AI Gateway] -.->|"used by"| F8
    F15 -.->|"used by"| F9
    F15 -.->|"used by"| F10
    F15 -.->|"used by"| F5
    F15 -.->|"used by"| F4

    F16[WebSocket Protocol] -.->|"transport for"| F7

    style F14 fill:#10b981,color:#fff
    style F15 fill:#f59e0b,color:#000
    style F12 fill:#3b82f6,color:#fff
    style F4 fill:#8b5cf6,color:#fff
```

---

> **Next document**: `architecture.md` — component-level system architecture, data model relationships, and Azure service mapping.
