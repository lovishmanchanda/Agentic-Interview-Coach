/**
 * The interview room's state, as a pure reducer: every server event (the socket) and every local action (an
 * answer sent, a hint asked for) is one transition. The page renders from this state; useInterviewSession wires
 * the socket to it. Pure on purpose: no clock, no socket, no React, so every transition is unit-tested
 * (tests/unit/interviewSession.test.js). Time comes in on the action (`receivedAt`).
 *
 * Everything is rebuilt from SESSION_SNAPSHOT on every (re)connect, so a reload or a dropped connection resumes
 * exactly where you were.
 */

export type Role = "interviewer" | "candidate" | "hint" | "evaluation";

/** One line of the transcript. `question_id` is "pending" for an answer sent but not yet recorded. */
export type Entry = {
  role: Role;
  question_id: string | null;
  content?: string;
  is_follow_up?: boolean;
  is_closing?: boolean;
  code?: string;
  language?: string;
  execution?: unknown;
  evaluation?: Evaluation;
};

export type Evaluation = { question_id: string; overall_score: number; performance_tier: string; [key: string]: unknown };

export type Question = {
  question_id: string;
  text: string;
  question_number: number;
  total_questions: number;
  is_follow_up?: boolean;
  hints_left?: number;
  asked_at?: string;
  suggested_seconds?: number;
  server_time?: string;
  coding?: unknown;
  [key: string]: unknown;
};

export type ConnectionStatus = { kind: string; message: string | null };

export type SessionState = {
  status: ConnectionStatus;
  state: string | null; // the server's state machine (SETUP, WAITING_FOR_RESPONSE, EVALUATING, …)
  transcript: Entry[];
  progress: { asked: number; total: number; followUp: boolean } | null;
  processing: boolean; // an answer this page sent is being evaluated
  processingText: string;
  config: Record<string, unknown> | null;
  focusTopics: string[];
  error: string | null;
  reportId: string | null;
  hintsLeft: number;
  hintLoading: boolean;
  announcement: string; // read out by screen readers (a polite live region)
  currentQuestion: Question | null;
  clockOffset: number; // server clock − browser clock (ms), for the timers
  startedAt: string | null;
  draftCode: { code: string; language: string } | null; // autosaved for the current coding problem
  codeResult: { question_id?: string; [key: string]: unknown } | null; // the server's run of the latest submission
};

export type ServerEvent = { type: string; state?: string; payload?: Record<string, unknown> };

export type Action =
  | { type: "status"; kind: string; message?: string | null }
  | { type: "event"; event: ServerEvent; receivedAt: number }
  | { type: "answerSent"; text: string }
  | { type: "codeSent"; code: string; language: string; explanation: string }
  | { type: "hintRequested" }
  | { type: "localError"; message: string | null };

export const initialSession: SessionState = {
  status: { kind: "connecting", message: null },
  state: null,
  transcript: [],
  progress: null,
  processing: false,
  processingText: "Evaluating your answer…",
  config: null,
  focusTopics: [],
  error: null,
  reportId: null,
  hintsLeft: 0,
  hintLoading: false,
  announcement: "",
  currentQuestion: null,
  clockOffset: 0,
  startedAt: null,
  draftCode: null,
  codeResult: null,
};

const offset = (serverTime: unknown, receivedAt: number) => new Date(String(serverTime)).getTime() - receivedAt;

function onEvent(s: SessionState, { type, state: eventState, payload = {} }: ServerEvent, receivedAt: number): SessionState {
  const next = eventState ? { ...s, state: eventState } : s;
  const p = payload as Record<string, any>; // server payloads: their fields are read per event type below

  switch (type) {
    case "SESSION_SNAPSHOT": {
      const question = (p.current_question ?? null) as Question | null;
      return {
        ...next,
        clockOffset: offset(p.server_time, receivedAt),
        startedAt: p.started_at ?? null,
        currentQuestion: question,
        state: p.state ?? next.state,
        config: p.config ?? null,
        focusTopics: p.focus_topics || [],
        transcript: p.transcript ?? [],
        reportId: p.report_id ?? null,
        processing: false, // the state now says whether the server is busy
        progress: { asked: p.questions_asked, total: p.total_questions, followUp: Boolean(question?.is_follow_up) },
        hintsLeft: question?.hints_left ?? 0,
        draftCode: p.draft_code || null,
      };
    }
    case "QUESTION": {
      const q = p as Question;
      return {
        ...next,
        clockOffset: offset(q.server_time, receivedAt),
        currentQuestion: q,
        processing: false, // serious mode sends no EVALUATION, so the next question ends the wait
        transcript: [...next.transcript, { role: "interviewer", question_id: q.question_id, content: q.text, is_follow_up: q.is_follow_up }],
        progress: { asked: q.question_number, total: q.total_questions, followUp: Boolean(q.is_follow_up) },
        hintsLeft: q.hints_left ?? 0,
        announcement: `${q.is_follow_up ? "Follow-up question" : `Question ${q.question_number} of ${q.total_questions}`}: ${q.text}`,
      };
    }
    case "HINT":
      return {
        ...next,
        hintLoading: false,
        hintsLeft: p.hints_left,
        transcript: [...next.transcript, { role: "hint", question_id: p.question_id, content: p.text }],
        announcement: `Hint: ${p.text}`,
      };
    case "PROCESSING":
      return { ...next, processing: true, processingText: p.message || next.processingText };
    case "CODE_RESULT":
      return {
        ...next,
        codeResult: p,
        // Attach the run to the submission this page just added to the transcript.
        transcript: next.transcript.map((e) => (e.role === "candidate" && e.code && !e.execution ? { ...e, execution: p } : e)),
      };
    case "EVALUATION":
      return {
        ...next,
        processing: false,
        transcript: [...next.transcript, { role: "evaluation", question_id: p.question_id, evaluation: p as Evaluation }],
        announcement: `VERA scored your answer ${p.overall_score} out of 10, ${p.performance_tier}.`,
      };
    case "INTERVIEW_COMPLETE":
      return {
        ...next,
        processing: false,
        transcript: p.closing_message
          ? [...next.transcript, { role: "interviewer", question_id: null, content: p.closing_message, is_closing: true }]
          : next.transcript,
        reportId: p.report_id ?? next.reportId,
        announcement: "Interview complete. Your report is ready.",
      };
    case "ERROR":
      return {
        ...next,
        processing: false,
        hintLoading: false,
        // Nothing was recorded: drop the optimistic submission so a retry doesn't show twice.
        transcript: p.retryable ? next.transcript.filter((e) => e.question_id !== "pending") : next.transcript,
        error: p.retryable ? `${p.message} Your answer is kept. Submit it again.` : p.message,
      };
    default:
      return next;
  }
}

export function sessionReducer(s: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "status":
      return { ...s, status: { kind: action.kind, message: action.message ?? null } };
    case "event":
      return onEvent(s, action.event, action.receivedAt);
    case "answerSent":
      return { ...s, error: null, processing: true,
        transcript: [...s.transcript, { role: "candidate", question_id: "pending", content: action.text }] };
    case "codeSent":
      return { ...s, error: null, processing: true, transcript: [...s.transcript,
        { role: "candidate", question_id: "pending", content: action.explanation, code: action.code, language: action.language }] };
    case "hintRequested":
      return { ...s, error: null, hintLoading: true };
    case "localError":
      return { ...s, error: action.message };
    default:
      return s;
  }
}

/** Waiting for your answer (and not already evaluating one you sent). */
export const isWaiting = (s: SessionState) => s.state === "WAITING_FOR_RESPONSE" && !s.processing;
