"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import MentorChat from "@/components/mentor/MentorChat";
import MentorInput from "@/components/mentor/MentorInput";
import MentorSidebar from "@/components/mentor/MentorSidebar";
import MentorWelcome from "@/components/mentor/MentorWelcome";
import PrepareForm from "@/components/mentor/PrepareForm";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useAuthStore } from "@/store/authStore";
import { useMentorStore } from "@/store/mentorStore";

function errorText(error) {
  if (error.code === "mentor_disabled") return "The Mentor isn't configured on the server (HF_TOKEN missing).";
  return error.message;
}

function MentorView() {
  const router = useRouter();
  const conversationParam = useSearchParams().get("c");
  const firstName = useAuthStore((s) => s.user?.name?.split(" ")[0]);
  const {
    welcome, welcomeError, conversations, activeId, messages, conversationStatus, sending, pendingKind, error,
    failedMessage, failedPrepare, loadWelcome, loadConversations, openConversation, newConversation, send, prepare,
  } = useMentorStore();
  const [draft, setDraft] = useState("");
  const [showPrepare, setShowPrepare] = useState(false);

  useEffect(() => {
    loadWelcome();
    loadConversations();
  }, [loadWelcome, loadConversations]);

  // The URL is the source of truth for which conversation is open (so links and Back work).
  useEffect(() => {
    if (conversationParam) openConversation(conversationParam);
    else newConversation();
  }, [conversationParam, openConversation, newConversation]);

  async function afterReply(id) {
    if (id && id !== conversationParam) router.replace(`/mentor?c=${id}`, { scroll: false });
  }

  async function submitPrepare(request) {
    setShowPrepare(false);
    await afterReply(await prepare(request));
  }

  async function submit(text) {
    setDraft("");
    const id = await send(text);
    if (id && id !== conversationParam) router.replace(`/mentor?c=${id}`, { scroll: false });
    if (!id) setDraft((current) => current || text); // keep what they wrote so nothing is lost
  }

  const isNew = activeId === null && messages.length === 0;
  const unavailable = welcome && !welcome.mentor_available;

  return (
    <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
      <MentorSidebar conversations={conversations} activeId={activeId} />

      <div className="flex min-h-[calc(100dvh-10rem)] min-w-0 flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Mentor</h1>
          <p className="mt-1 text-sm text-muted">Answers come only from your own interview reports, with the sessions cited.</p>
        </header>

        {unavailable && <Alert tone="error">{errorText({ code: "mentor_disabled" })}</Alert>}
        {welcome?.pending_reports > 0 && (
          <p className="text-xs text-muted">
            {welcome.pending_reports === 1 ? "One report is" : `${welcome.pending_reports} reports are`} still being
            prepared for the Mentor, so answers may not include {welcome.pending_reports === 1 ? "it" : "them"} yet.
          </p>
        )}

        <div className="flex-1">
          {conversationStatus === "loading" && <Spinner label="Loading conversation…" />}
          {conversationStatus === "error" && (
            <Alert tone="error" title="Couldn't open this conversation">
              {errorText(error)} <Button href="/mentor" variant="ghost" size="sm">Start a new one</Button>
            </Alert>
          )}
          {isNew && !welcome && !welcomeError && <Spinner label="Loading…" />}
          {isNew && welcome && !unavailable && !showPrepare && (
            <MentorWelcome welcome={welcome} name={firstName} onPick={submit} onPrepare={() => setShowPrepare(true)} />
          )}
          {messages.length > 0 && <MentorChat messages={messages} sending={sending} pendingKind={pendingKind} />}
          {showPrepare && (
            <div className="mt-4">
              <PrepareForm busy={sending} onSubmit={submitPrepare} onCancel={() => setShowPrepare(false)} />
            </div>
          )}
        </div>

        {error && conversationStatus !== "error" && (
          <Alert tone="error">
            {errorText(error)}
            {failedMessage && error.code !== "conversation_full" && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => submit(failedMessage)}>Try again</Button>
            )}
            {failedPrepare && error.code !== "conversation_full" && error.code !== "rate_limited" && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => submitPrepare(failedPrepare)}>Try again</Button>
            )}
            {error.code === "conversation_full" && <Button href="/mentor" variant="ghost" size="sm" className="ml-2">New conversation</Button>}
          </Alert>
        )}

        {conversationStatus !== "error" && !unavailable && (
          <div className="sticky bottom-0 -mx-1 bg-background px-1 pt-2">
            {!showPrepare && !isNew && (
              <button type="button" onClick={() => setShowPrepare(true)} disabled={sending}
                className="mb-1 text-xs font-medium text-primary hover:underline disabled:opacity-50">
                Prepare for a company…
              </button>
            )}
            <MentorInput value={draft} onChange={setDraft} onSend={submit} sending={sending} autoFocus={isNew} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function MentorPage() {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <MentorView />
    </Suspense>
  );
}
