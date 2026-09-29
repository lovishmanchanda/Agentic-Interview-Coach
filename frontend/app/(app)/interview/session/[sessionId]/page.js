"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import CodingRoom from "@/components/coding/CodingRoom";
import EvaluationCard from "@/components/interview/EvaluationCard";
import QuestionTimer, { ElapsedClock } from "@/components/interview/QuestionTimer";
import Transcript from "@/components/interview/Transcript";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { INTERVIEW_MODES, INTERVIEW_TYPES, topicLabel } from "@/lib/interviewOptions";
import { connectInterview } from "@/lib/interviewSocket";
import { TARGET_ROLES, labelFor } from "@/lib/profileOptions";

const MAX_ANSWER = 5000;
// While the server is between steps (see backend state_machine.py), say what it's doing.
const BUSY_TEXT = {
  SETUP: "Preparing your first question…",
  INTRODUCTION: "Preparing your first question…",
  QUESTION: "Preparing the next question…",
  FOLLOW_UP_DECISION: "Preparing the next question…",
  NEXT_TOPIC: "Preparing the next question…",
  INTERVIEW_COMPLETE: "Writing your report…",
  GENERATING_REPORT: "Writing your report…",
};
const STATUS_TEXT = {
  connecting: "Connecting…",
  reconnecting: "Connection lost. Reconnecting…",
  offline: "You're offline. Waiting for the connection…",
};
const DRAFT_DEBOUNCE_MS = 1500; // autosave the answer being typed, so a reload or drop doesn't lose it

export default function InterviewSessionPage() {
  const { sessionId } = useParams();
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
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
            break;
          case "HINT":
            setHintLoading(false);
            setHintsLeft(payload.hints_left);
            setTranscript((t) => [...t, { role: "hint", question_id: payload.question_id, content: payload.text }]);
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
            break;
          case "INTERVIEW_COMPLETE":
            setProcessing(false);
            if (payload.closing_message) {
              setTranscript((t) => [...t, { role: "interviewer", question_id: null, content: payload.closing_message, is_closing: true }]);
            }
            setReportId(payload.report_id);
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
  const serious = config?.interview_mode === "serious";
  const title = config ? `${labelFor(INTERVIEW_TYPES, config.interview_type)} interview` : "Interview";
  const subtitle = [
    config && `${labelFor(INTERVIEW_MODES, config.interview_mode)} mode`,
    progress?.total && `Question ${progress.asked || 1} of ${progress.total}${progress.followUp ? " (follow-up)" : ""}`,
    focusTopics.length > 0 && `Drill: ${focusTopics.map(topicLabel).join(", ")}`,
  ].filter(Boolean).join(" · ");

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

  const statusBar = (
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

  const finishedCard = (
    <div className="rounded-xl border border-success/30 bg-success-soft p-5">
      <p className="font-medium text-success">Interview complete</p>
      <p className="mt-1 text-sm">Your report is ready. The Mentor can now answer questions about it.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button href={`/interview/report/${reportId}`}>View report</Button>
        <Button href="/mentor" variant="secondary">Talk to Mentor</Button>
      </div>
    </div>
  );

  const answerForm = (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="answer" className="sr-only">Your answer</label>
      <textarea
        id="answer"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        maxLength={MAX_ANSWER}
        disabled={!waiting}
        placeholder={waiting ? "Type your answer…" : "Waiting for the interviewer…"}
        className="min-h-40 w-full rounded-xl border border-border bg-surface p-4 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {answer.length}/{MAX_ANSWER} · ⌘/Ctrl + Enter to submit
        </span>
        <div className="flex gap-2">
          {!serious && (
            <Button type="button" variant="secondary" onClick={requestHint} loading={hintLoading}
              disabled={!waiting || hintsLeft < 1} title={hintsLeft < 1 ? "One hint per question" : "A nudge, not the answer"}>
              {hintsLeft < 1 && waiting ? "Hint used" : "Get a hint"}
            </Button>
          )}
          <Button type="submit" disabled={!waiting || !answer.trim()} loading={processing}>
            Submit answer
          </Button>
        </div>
      </div>
    </form>
  );

  const timer = currentQuestion?.asked_at && !finished && (
    <QuestionTimer askedAt={currentQuestion.asked_at} suggestedSeconds={currentQuestion.suggested_seconds}
      clockOffsetMs={clockOffset} stopped={!waiting} compact={!serious} />
  );

  const coding = !finished && currentQuestion?.coding ? currentQuestion : null;
  if (coding) {
    // Coding problem: the room is the problem + editor; the conversation so far folds away.
    const evaluation = [...transcript].reverse().find((e) => e.role === "evaluation" && e.question_id === coding.question_id);
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            {STATUS_TEXT[status.kind] && <Spinner label={STATUS_TEXT[status.kind]} />}
            {timer && <div className="w-56">{timer}</div>}
          </div>
        </header>
        {statusBar}
        <CodingRoom key={coding.question_id} sessionId={sessionId} question={coding} draftCode={draftCode}
          waiting={waiting} submitting={processing} socketRef={socketRef}
          submittedResult={codeResult?.question_id === coding.question_id ? codeResult : null} onSubmit={submitCode} />
        {busyText && !error && <Spinner label={busyText} />}
        {!serious && evaluation && <EvaluationCard evaluation={evaluation.evaluation} />}
        {serious && <p className="text-xs text-muted">Serious mode: scores and feedback appear in your report at the end. Hidden tests show pass/fail only.</p>}
        {transcript.length > 1 && (
          <details className="rounded-xl border border-border bg-surface px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Conversation so far</summary>
            <div className="mt-4"><Transcript entries={transcript} /></div>
          </details>
        )}
        <div ref={bottomRef} />
      </div>
    );
  }

  if (serious) {
    // A clean room: the interviewer and the current question on stage, earlier turns folded away,
    // no scores, no hints, no coaching.
    let stageIndex = -1;
    transcript.forEach((entry, i) => { if (entry.role === "interviewer") stageIndex = i; });
    const stage = transcript[stageIndex];
    const earlier = stageIndex > 0 ? transcript.slice(0, stageIndex) : [];
    const roleLine = config
      ? [labelFor(TARGET_ROLES, config.role), config.company].filter(Boolean).join(" · ")
      : "";
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              AI
            </span>
            <div>
              <p className="font-semibold">Interviewer</p>
              <p className="text-xs text-muted">{roleLine}</p>
            </div>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{progress?.total ? `Question ${progress.asked || 1} of ${progress.total}${progress.followUp ? " · follow-up" : ""}` : title}</p>
            {startedAt && !finished && <ElapsedClock since={startedAt} clockOffsetMs={clockOffset} />}
          </div>
        </header>
        {STATUS_TEXT[status.kind] && <Spinner label={STATUS_TEXT[status.kind]} />}
        {statusBar}

        <section aria-live="polite" aria-label="Interviewer" className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {stage?.is_follow_up && <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Follow-up</p>}
          {stage ? <p className="whitespace-pre-wrap text-lg leading-relaxed">{stage.content}</p> : null}
          {busyText && !reportId && !error && <div className="mt-4"><Spinner label={busyText} /></div>}
        </section>

        {timer && <div className="rounded-xl border border-border bg-surface px-4 py-3">{timer}</div>}
        {finished ? finishedCard : answerForm}
        {!finished && <p className="text-xs text-muted">Serious mode: scores and feedback appear in your report at the end.</p>}

        {earlier.length > 0 && (
          <details className="rounded-xl border border-border bg-surface px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Earlier in this interview</summary>
            <div className="mt-4"><Transcript entries={earlier} /></div>
          </details>
        )}
        <div ref={bottomRef} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {STATUS_TEXT[status.kind] && <Spinner label={STATUS_TEXT[status.kind]} />}
      </div>
      {statusBar}

      <Transcript entries={transcript} />
      {busyText && !reportId && !error && <Spinner label={busyText} />}

      {finished ? finishedCard : (
        <div className="space-y-3">
          {waiting && timer}
          {answerForm}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
