import { describe, expect, it } from "vitest";

import { initialSession, isWaiting, sessionReducer } from "@/lib/interviewSession";

// Every transition of the interview room, without a socket or a browser.
const NOW = Date.parse("2026-10-06T10:00:00Z");
const event = (type, payload = {}, state) => ({ type: "event", event: { type, payload, state }, receivedAt: NOW });
const run = (...actions) => actions.reduce(sessionReducer, initialSession);

const question = (n, extra = {}) => ({ question_id: `q${n}`, text: `Question ${n}?`, question_number: n, total_questions: 3,
  hints_left: 1, server_time: "2026-10-06T10:00:02Z", ...extra });

describe("interview session reducer", () => {
  it("rebuilds everything from a snapshot (a reload or reconnect resumes where you were)", () => {
    const s = run(event("SESSION_SNAPSHOT", {
      server_time: "2026-10-06T10:00:05Z", started_at: "2026-10-06T09:50:00Z", state: "WAITING_FOR_RESPONSE",
      config: { interview_type: "technical" }, focus_topics: ["dsa"], transcript: [{ role: "interviewer", question_id: "q1", content: "Hi" }],
      report_id: null, questions_asked: 1, total_questions: 3, current_question: question(1, { is_follow_up: true, hints_left: 2 }),
      draft_code: { code: "x = 1", language: "python" },
    }));
    expect(s).toMatchObject({ state: "WAITING_FOR_RESPONSE", clockOffset: 5000, focusTopics: ["dsa"], hintsLeft: 2,
      progress: { asked: 1, total: 3, followUp: true }, draftCode: { code: "x = 1", language: "python" }, processing: false });
    expect(s.transcript).toHaveLength(1);
    expect(isWaiting(s)).toBe(true);
  });

  it("adds each question to the transcript and announces it", () => {
    const s = run(event("QUESTION", question(2), "WAITING_FOR_RESPONSE"));
    expect(s.transcript.at(-1)).toEqual({ role: "interviewer", question_id: "q2", content: "Question 2?", is_follow_up: undefined });
    expect(s.announcement).toBe("Question 2 of 3: Question 2?");
    expect(s.clockOffset).toBe(2000);
    expect(run(event("QUESTION", question(2, { is_follow_up: true }))).announcement).toMatch(/^Follow-up question: /);
  });

  it("an answer shows at once (pending), then the evaluation ends the wait", () => {
    let s = run(event("QUESTION", question(1), "WAITING_FOR_RESPONSE"), { type: "answerSent", text: "A hash map…" });
    expect(s.transcript.at(-1)).toMatchObject({ role: "candidate", question_id: "pending", content: "A hash map…" });
    expect(s.processing).toBe(true);
    expect(isWaiting(s)).toBe(false);
    s = sessionReducer(s, event("PROCESSING", { message: "VERA is evaluating your answer…" }));
    expect(s.processingText).toBe("VERA is evaluating your answer…");
    s = sessionReducer(s, event("EVALUATION", { question_id: "q1", overall_score: 7.5, performance_tier: "strong" }));
    expect(s.processing).toBe(false);
    expect(s.announcement).toBe("VERA scored your answer 7.5 out of 10, strong.");
  });

  it("a retryable error drops the pending answer (so a retry doesn't show twice) and says it's kept", () => {
    const s = run(event("QUESTION", question(1)), { type: "answerSent", text: "draft" },
      event("ERROR", { retryable: true, message: "VERA couldn't evaluate that." }));
    expect(s.transcript.some((e) => e.question_id === "pending")).toBe(false);
    expect(s.error).toBe("VERA couldn't evaluate that. Your answer is kept. Submit it again.");
    expect(s.processing).toBe(false);
  });

  it("a final error keeps the transcript and shows the message as is", () => {
    const s = run({ type: "answerSent", text: "x" }, event("ERROR", { retryable: false, message: "Interview not found" }));
    expect(s.transcript).toHaveLength(1);
    expect(s.error).toBe("Interview not found");
  });

  it("attaches a code run to the submission it belongs to", () => {
    const s = run({ type: "codeSent", code: "print(1)", language: "python", explanation: "brute force" },
      event("CODE_RESULT", { question_id: "q1", passed: 3, total: 3 }));
    expect(s.transcript.at(-1)).toMatchObject({ code: "print(1)", content: "brute force", execution: { passed: 3, total: 3 } });
    expect(s.codeResult).toMatchObject({ question_id: "q1" });
  });

  it("hints: loading until the hint arrives, then it's in the transcript with one fewer left", () => {
    let s = run({ type: "hintRequested" });
    expect(s.hintLoading).toBe(true);
    s = sessionReducer(s, event("HINT", { question_id: "q1", text: "Think about collisions.", hints_left: 0 }));
    expect(s).toMatchObject({ hintLoading: false, hintsLeft: 0, announcement: "Hint: Think about collisions." });
    expect(s.transcript.at(-1)).toEqual({ role: "hint", question_id: "q1", content: "Think about collisions." });
  });

  it("the end: VERA's closing line, the report id, and an announcement", () => {
    const s = run(event("INTERVIEW_COMPLETE", { report_id: "r1", closing_message: "Thanks. Your report is ready now." }, "REPORT_READY"));
    expect(s).toMatchObject({ state: "REPORT_READY", reportId: "r1", announcement: "Interview complete. Your report is ready." });
    expect(s.transcript.at(-1)).toMatchObject({ is_closing: true, content: "Thanks. Your report is ready now." });
  });

  it("connection status and local errors", () => {
    expect(run({ type: "status", kind: "reconnecting" }).status).toEqual({ kind: "reconnecting", message: null });
    expect(run({ type: "localError", message: "Not connected yet." }).error).toBe("Not connected yet.");
    expect(run({ type: "localError", message: "x" }, { type: "localError", message: null }).error).toBeNull();
  });

  it("ignores events it doesn't know, but still takes their state", () => {
    const s = run(event("SOMETHING_NEW", {}, "EVALUATING"));
    expect(s.state).toBe("EVALUATING");
    expect(s.transcript).toEqual([]);
  });
});
