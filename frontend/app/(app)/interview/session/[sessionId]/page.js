"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import Transcript from "@/components/interview/Transcript";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { INTERVIEW_MODES, INTERVIEW_TYPES, topicLabel } from "@/lib/interviewOptions";
import { connectInterview } from "@/lib/interviewSocket";
import { labelFor } from "@/lib/profileOptions";

const MAX_ANSWER = 5000;
const STATUS_TEXT = { connecting: "Connecting…", reconnecting: "Connection lost. Reconnecting…" };

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

  useEffect(() => {
    const socket = connectInterview(sessionId, {
      onStatus: (kind, message) => setStatus({ kind, message }),
      onEvent: ({ type, state: eventState, payload }) => {
        if (eventState) setState(eventState);
        switch (type) {
          case "SESSION_SNAPSHOT":
            setState(payload.state);
            setConfig(payload.config);
            setFocusTopics(payload.focus_topics || []);
            setTranscript(payload.transcript);
            setReportId(payload.report_id);
            setProcessing(payload.state === "EVALUATING");
            setProgress({ asked: payload.questions_asked, total: payload.total_questions });
            break;
          case "QUESTION":
            setProcessing(false); // serious mode sends no EVALUATION, so the next question ends the wait
            setTranscript((t) => [...t, { role: "interviewer", question_id: payload.question_id, content: payload.text }]);
            setProgress({ asked: payload.question_number, total: payload.total_questions });
            break;
          case "PROCESSING":
            if (payload.message) setProcessingText(payload.message);
            setProcessing(true);
            break;
          case "EVALUATION":
            setProcessing(false);
            setTranscript((t) => [...t, { role: "evaluation", question_id: payload.question_id, evaluation: payload }]);
            break;
          case "INTERVIEW_COMPLETE":
            setProcessing(false);
            setReportId(payload.report_id);
            break;
          case "ERROR":
            setProcessing(false);
            setError(payload.retryable ? `${payload.message} Your answer is kept below. Submit it again.` : payload.message);
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
  const finished = state === "REPORT_READY" || Boolean(reportId);
  const serious = config?.interview_mode === "serious";
  const title = config ? `${labelFor(INTERVIEW_TYPES, config.interview_type)} interview` : "Interview";
  const subtitle = [
    config && `${labelFor(INTERVIEW_MODES, config.interview_mode)} mode`,
    progress?.total && `Question ${progress.asked || 1} of ${progress.total}`,
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
      setProcessing(true);
    } else {
      setError("Not connected yet. Wait a moment and try again.");
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted">{subtitle}</p>
          {serious && !finished && <p className="mt-1 text-xs text-muted">Scores and feedback appear in your report at the end.</p>}
        </div>
        {STATUS_TEXT[status.kind] && <Spinner label={STATUS_TEXT[status.kind]} />}
      </div>

      {status.kind === "failed" && <Alert tone="error" title="Couldn't connect to the interview">{status.message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Transcript entries={transcript} />
      {processing && <Spinner label={processingText} />}

      {finished ? (
        <div className="rounded-xl border border-success/30 bg-success-soft p-5">
          <p className="font-medium text-success">Interview complete</p>
          <p className="mt-1 text-sm">Your report is ready. The Mentor can now answer questions about it.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button href={`/interview/report/${reportId}`}>View report</Button>
            <Button href="/mentor" variant="secondary">Talk to Mentor</Button>
          </div>
        </div>
      ) : (
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
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {answer.length}/{MAX_ANSWER} · ⌘/Ctrl + Enter to submit
            </span>
            <Button type="submit" disabled={!waiting || !answer.trim()} loading={processing}>
              Submit answer
            </Button>
          </div>
        </form>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
