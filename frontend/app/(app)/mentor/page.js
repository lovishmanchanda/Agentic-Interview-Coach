"use client";

import { useEffect, useRef, useState } from "react";

import MentorAnswer from "@/components/mentor/MentorAnswer";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { api } from "@/lib/api";

const STARTERS = ["How am I doing?", "Where am I weakest?", "What should I practise next?"];

export default function MentorPage() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [reportBySession, setReportBySession] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    api.interviews.list()
      .then((sessions) => setReportBySession(Object.fromEntries(sessions.filter((s) => s.report_id).map((s) => [s.session_id, s.report_id]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(text) {
    const message = text.trim();
    if (!message || sending) return;
    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: message }]);
    setDraft("");
    setSending(true);
    setError(null);
    try {
      const reply = await api.mentor.send(message, history);
      setMessages((m) => [...m, { role: "assistant", content: reply.answer, sources: reply.sources }]);
    } catch (err) {
      setError(err.code === "mentor_disabled" ? "The Mentor isn't configured on the server (HF_TOKEN missing)." : err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Mentor</h1>
        <p className="mt-1 text-sm text-muted">Answers come only from your own interview reports, with the sessions cited.</p>
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)}
              className="rounded-full border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary">
              {s}
            </button>
          ))}
        </div>
      )}

      <ol className="space-y-4">
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[85%]"}>
            <div className={`rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border border-border bg-surface"}`}>
              {m.role === "assistant" ? (
                <MentorAnswer text={m.content} sources={m.sources || []} reportBySession={reportBySession} />
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {sending && <Spinner label="Mentor is thinking…" />}
      {error && <Alert tone="error">{error}</Alert>}

      <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="flex gap-3">
        <label htmlFor="mentor-input" className="sr-only">Message the Mentor</label>
        <input id="mentor-input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
          placeholder="Ask about your interviews…"
          className="h-11 flex-1 rounded-xl border border-border bg-surface px-4 text-sm focus:border-primary focus:outline-none" />
        <Button type="submit" disabled={!draft.trim()} loading={sending}>Send</Button>
      </form>
      <div ref={bottomRef} />
    </div>
  );
}
