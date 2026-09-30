"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import AgentStatus from "@/components/brand/AgentStatus";
import CodingRoom from "@/components/coding/CodingRoom";
import EvaluationCard from "@/components/interview/EvaluationCard";
import QuestionTimer from "@/components/interview/QuestionTimer";
import AnswerComposer from "@/components/interview/room/AnswerComposer";
import InterviewDone from "@/components/interview/room/InterviewDone";
import RoomHeader from "@/components/interview/room/RoomHeader";
import { EmptyStage, PastRound, StageRound, groupRounds } from "@/components/interview/room/Round";
import Alert from "@/components/ui/Alert";
import { INTERVIEW_MODES, INTERVIEW_TYPES, topicLabel } from "@/lib/interviewOptions";
import { connectInterview } from "@/lib/interviewSocket";
import { TARGET_ROLES, labelFor } from "@/lib/profileOptions";

const MAX_ANSWER = 5000;
// While the server is between steps (see backend state_machine.py), say what it's doing.
const BUSY_TEXT = {
  SETUP: "Preparing your first question…",
  INTRODUCTION: "Preparing your first question…",
  QUESTION: "Preparing the next question…",
  FOLLOW_UP_DECISION: "Deciding whether to follow up…",
  NEXT_TOPIC: "Preparing the next question…",
  INTERVIEW_COMPLETE: "Writing your report…",
  GENERATING_REPORT: "Writing your report…",
};
const ENDING_STATES = new Set(["INTERVIEW_COMPLETE", "GENERATING_REPORT", "REPORT_READY"]);
const STATUS_TEXT = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Offline. Waiting…",
};
const DRAFT_DEBOUNCE_MS = 1500; // autosave the answer being typed, so a reload or drop doesn't lose it

/**
 * The interview room (Phase 7.8). One question at a time on a lit stage; earlier rounds fold into one-line
 * summaries above it (the one just scored stays open); the answer box is docked at the bottom. Serious mode is
 * the same room, quieter: no hints, no scores, the question fades in instead of arriving word by word.
 * A coding problem swaps the stage for the problem + editor.
 *
 * Everything shown is rebuilt from the socket's SESSION_SNAPSHOT on every (re)connect, so a reload or a
 * dropped connection resumes exactly where you were.
 */
export default function InterviewSessionPage() {
  const { sessionId } = useParams();
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const answerRef = useRef(null);
  const focusedFor = useRef(null);
  const [status, setStatus] = useState({ kind: "connecting", message: null });
  const [state, setState] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [progress, setProgress] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingText, setProcessingText] = useState("Evaluating your answer…");
  const [config, setConfig] = useState(null);
  const [focusTopics, setFocusTopics] = useState([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [hintsLeft, setHintsLeft] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const [announcement, setAnnouncement] = useState(""); // read out by screen readers (a polite live region)
  const lastDraftRef = useRef("");
  const [currentQuestion, setCurrentQuestion] = useState(null); // {question_id, asked_at, suggested_seconds, …}
  const [clockOffset, setClockOffset] = useState(0);            // server clock − browser clock, for the timers
  const [startedAt, setStartedAt] = useState(null);
  const [draftCode, setDraftCode] = useState(null);   // {code, language} autosaved for the current coding problem
  const [codeResult, setCodeResult] = useState(null); // the latest CODE_RESULT (the server's run of a submission)

  useEffect(() => {
    const socket = connectInterview(sessionId, {
      onStatus: (kind, message) => setStatus({ kind, message }),
      onEvent: ({ type, state: eventState, payload }) => {
        if (eventState) setState(eventState);
        switch (type) {
          case "SESSION_SNAPSHOT":
            setClockOffset(new Date(payload.server_time).getTime() - Date.now());
            setStartedAt(payload.started_at);
            setCurrentQuestion(payload.current_question);
            setState(payload.state);
            setConfig(payload.config);
            setFocusTopics(payload.focus_topics || []);
            setTranscript(payload.transcript);
            setReportId(payload.report_id);
            setProcessing(false); // the state now says whether the server is busy
            setProgress({ asked: payload.questions_asked, total: payload.total_questions,
              followUp: Boolean(payload.current_question?.is_follow_up) });
            setHintsLeft(payload.current_question?.hints_left ?? 0);
            setDraftCode(payload.draft_code || null);
            if (payload.draft_answer) {
              // Restore the autosaved answer, unless something has been typed since.
              lastDraftRef.current = payload.draft_answer;
              setAnswer((current) => current || payload.draft_answer);
            }
            break;
          case "QUESTION":
            setClockOffset(new Date(payload.server_time).getTime() - Date.now());
            setCurrentQuestion(payload);
            setProcessing(false); // serious mode sends no EVALUATION, so the next question ends the wait
            setTranscript((t) => [...t, { role: "interviewer", question_id: payload.question_id, content: payload.text,
              is_follow_up: payload.is_follow_up }]);
            setProgress({ asked: payload.question_number, total: payload.total_questions, followUp: payload.is_follow_up });
            setHintsLeft(payload.hints_left ?? 0);
            setAnnouncement(`${payload.is_follow_up ? "Follow-up question" : `Question ${payload.question_number} of ${payload.total_questions}`}: ${payload.text}`);
            break;
          case "HINT":
            setHintLoading(false);
            setHintsLeft(payload.hints_left);
            setTranscript((t) => [...t, { role: "hint", question_id: payload.question_id, content: payload.text }]);
            setAnnouncement(`Hint: ${payload.text}`);
            break;
          case "PROCESSING":
            if (payload.message) setProcessingText(payload.message);
            setProcessing(true);
            break;
          case "CODE_RESULT":
            setCodeResult(payload);
            // Attach the run to the submission this page just added to the transcript.
            setTranscript((t) => t.map((e) => (e.role === "candidate" && e.code && !e.execution ? { ...e, execution: payload } : e)));
            break;
          case "EVALUATION":
            setProcessing(false);
            setTranscript((t) => [...t, { role: "evaluation", question_id: payload.question_id, evaluation: payload }]);
            setAnnouncement(`VERA scored your answer ${payload.overall_score} out of 10, ${payload.performance_tier}.`);
            break;
          case "INTERVIEW_COMPLETE":
            setProcessing(false);
            if (payload.closing_message) {
              setTranscript((t) => [...t, { role: "interviewer", question_id: null, content: payload.closing_message, is_closing: true }]);
            }
            setReportId(payload.report_id);
            setAnnouncement("Interview complete. Your report is ready.");
            break;
          case "ERROR":
            setProcessing(false);
            setHintLoading(false);
            if (payload.retryable) {
              // Nothing was recorded: drop the optimistic submission so a retry doesn't show twice.
              setTranscript((t) => t.filter((e) => e.question_id !== "pending"));
            }
            setError(payload.retryable ? `${payload.message} Your answer is kept. Submit it again.` : payload.message);
            break;
          default:
        }
      },
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, processing]);

  const waiting = state === "WAITING_FOR_RESPONSE" && !processing;

  // A new question puts the cursor in the answer box (keyboard and mouse users; on a phone that would pop the
  // keyboard over the question, so there it waits for a tap).
  const questionId = currentQuestion?.question_id;
  useEffect(() => {
    if (!waiting || !questionId || focusedFor.current === questionId) return;
    focusedFor.current = questionId;
    if (window.matchMedia("(pointer: fine)").matches) answerRef.current?.focus({ preventScroll: true });
  }, [waiting, questionId]);

  // Draft autosave: a short pause after typing sends ANSWER_DRAFT (the server keeps it for this question).
  useEffect(() => {
    if (!waiting || answer === lastDraftRef.current) return undefined;
    const timer = setTimeout(() => {
      if (socketRef.current?.send({ type: "ANSWER_DRAFT", answer_text: answer })) lastDraftRef.current = answer;
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [answer, waiting]);
  // `processing`: an answer this page just sent. EVALUATING / BUSY_TEXT: the server is between steps.
  const busyText = processing || state === "EVALUATING" ? processingText : BUSY_TEXT[state];
  const finished = state === "REPORT_READY" || Boolean(reportId);
  const ended = finished || ENDING_STATES.has(state);
  const serious = config?.interview_mode === "serious";
  const title = config ? `${labelFor(INTERVIEW_TYPES, config.interview_type)} interview` : "Interview";
  const meta = config
    ? [
      `${labelFor(INTERVIEW_MODES, config.interview_mode)} mode`,
      labelFor(TARGET_ROLES, config.role),
      config.company,
      focusTopics.length > 0 && `Drill: ${focusTopics.map(topicLabel).join(", ")}`,
    ].filter(Boolean).join(" · ")
    : "Joining the room…";

  function submit(event) {
    event.preventDefault();
    const text = answer.trim();
    if (!text || !waiting) return;
    setError(null);
    if (socketRef.current?.send({ type: "ANSWER", answer_text: text })) {
      setTranscript((t) => [...t, { role: "candidate", question_id: "pending", content: text }]);
      setAnswer("");
      lastDraftRef.current = "";
      setProcessing(true);
    } else {
      setError("Not connected yet. Wait a moment and try again.");
    }
  }

  function submitCode({ code, language, explanation }) {
    setError(null);
    if (socketRef.current?.send({ type: "CODE_SUBMIT", code, language, explanation })) {
      setTranscript((t) => [...t, { role: "candidate", question_id: "pending", content: explanation, code, language }]);
      setProcessing(true);
    } else {
      setError("Not connected yet. Wait a moment and try again.");
    }
  }

  function requestHint() {
    setError(null);
    if (socketRef.current?.send({ type: "HINT_REQUEST", draft_text: answer })) setHintLoading(true);
  }

  const alerts = (
    <>
      {status.kind === "failed" && (
        <Alert tone="error" title="Couldn't connect to the interview">
          {status.message}{" "}
          <button type="button" onClick={() => socketRef.current?.reconnect()} className="font-medium underline">
            Try again
          </button>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </>
  );

  const header = (
    <RoomHeader title={title} meta={meta} busy={Boolean(busyText) && !finished} connection={STATUS_TEXT[status.kind]}
      progress={progress} finished={ended} elapsedSince={serious ? startedAt : null} clockOffset={clockOffset} />
  );

  const timer = currentQuestion?.asked_at && !ended && (
    <QuestionTimer askedAt={currentQuestion.asked_at} suggestedSeconds={currentQuestion.suggested_seconds}
      clockOffsetMs={clockOffset} stopped={!waiting} />
  );

  const rounds = groupRounds(transcript);
  const closing = transcript.find((e) => e.is_closing)?.content;
  const liveRegion = <p className="sr-only" aria-live="polite">{announcement}</p>;

  function pastList(past, { label = "Earlier in this interview" } = {}) {
    if (!past.length) return null;
    let lastScored = -1;
    past.forEach((r, i) => { if (r.evaluation) lastScored = i; });
    return (
      <section aria-label={label} className="space-y-2">
        <p className="eyebrow text-[11px]">{label}</p>
        <ol className="space-y-2">
          {past.map((round, i) => (
            <PastRound key={round.key} round={round} serious={serious} defaultOpen={!serious && i === lastScored} />
          ))}
        </ol>
      </section>
    );
  }

  const coding = !ended && currentQuestion?.coding ? currentQuestion : null;
  if (coding) {
    // Coding problem: the room is the problem + editor; earlier problems fold away above it.
    const evaluation = [...transcript].reverse().find((e) => e.role === "evaluation" && e.question_id === coding.question_id);
    const past = rounds.filter((r) => r.question.question_id !== coding.question_id);
    return (
      <div className="flex flex-col gap-5">
        {header}
        {liveRegion}
        {alerts}
        {pastList(past, { label: "Earlier problems" })}
        <CodingRoom key={coding.question_id} sessionId={sessionId} question={coding} draftCode={draftCode}
          waiting={waiting} submitting={processing} socketRef={socketRef} timer={timer}
          submittedResult={codeResult?.question_id === coding.question_id ? codeResult : null} onSubmit={submitCode} />
        {busyText && !error && <AgentStatus agent="interviewer" text={busyText} />}
        {!serious && evaluation && <EvaluationCard evaluation={evaluation.evaluation} />}
        {serious && <p className="text-xs text-subtle">Serious mode: scores and feedback appear in your report at the end. Hidden tests show pass/fail only.</p>}
        <div ref={bottomRef} />
      </div>
    );
  }

  const stage = ended ? null : rounds[rounds.length - 1];
  const past = stage ? rounds.slice(0, -1) : rounds;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {header}
      {liveRegion}
      {alerts}
      {pastList(past)}

      {!ended && (stage
        ? <StageRound round={stage} total={progress?.total} serious={serious} questionId="current-question"
          busyText={busyText && !error ? busyText : null} />
        : <EmptyStage busyText={busyText || (status.kind === "open" ? "Getting ready…" : null)} />)}

      {ended ? (
        <InterviewDone closing={closing} reportId={reportId} busyText={busyText} />
      ) : (
        <AnswerComposer textareaRef={answerRef} value={answer} onChange={setAnswer} onSubmit={submit} maxLength={MAX_ANSWER}
          waiting={waiting} processing={processing} timer={timer} serious={serious}
          hintsLeft={hintsLeft} hintLoading={hintLoading} onHint={requestHint} />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
