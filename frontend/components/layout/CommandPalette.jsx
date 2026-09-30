"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ArrowRightIcon, ChatIcon, CodeIcon, LogoutIcon, SearchIcon, SparkIcon } from "@/components/ui/icons";
import Kbd from "@/components/ui/Kbd";
import { topicLabel } from "@/lib/interviewOptions";
import { ADMIN_ITEM, NAV_ITEMS } from "@/lib/navigation";
import { signOut } from "@/lib/session";
import { useAuthStore } from "@/store/authStore";
import { useShellStore } from "@/store/shellStore";
import { useUiStore } from "@/store/uiStore";

/** Every command the palette can run, built from where you are in the product right now. */
function useCommands(query) {
  const isAdmin = useAuthStore((s) => Boolean(s.user?.is_admin));
  const shell = useShellStore();
  return useMemo(() => {
    const suggested = [
      shell.inProgress && { id: "resume", group: "Suggested", label: "Resume your interview", hint: "Pick up where you left off", Icon: ArrowRightIcon, href: `/interview/session/${shell.inProgress.session_id}` },
      shell.weakestTopic && { id: "drill", group: "Suggested", label: `Drill ${topicLabel(shell.weakestTopic)}`, hint: "Your weakest topic last time", Icon: SparkIcon, href: `/interview/configure?focus=${encodeURIComponent(shell.weakestTopic)}` },
      shell.latestReportId && { id: "report", group: "Suggested", label: "Open your latest report", hint: "What went well, what to fix", Icon: ArrowRightIcon, href: `/interview/report/${shell.latestReportId}` },
    ].filter(Boolean);
    const go = [...NAV_ITEMS, ...(isAdmin ? [ADMIN_ITEM] : [])].map((n) => ({ id: n.href, group: "Go to", label: n.label, hint: n.hint, Icon: n.Icon, href: n.href }));
    const actions = [
      { id: "practice", group: "Actions", label: "Start a practice interview", hint: "Technical, behavioural or coding", Icon: SparkIcon, href: "/interview/configure" },
      { id: "coding", group: "Actions", label: "Start a coding round", hint: "Live coding with real tests", Icon: CodeIcon, href: "/interview/configure?type=coding" },
      { id: "signout", group: "Account", label: "Sign out", hint: "Back to the landing page", Icon: LogoutIcon, signOut: true },
    ];
    const q = query.trim().toLowerCase();
    const all = [...suggested, ...go, ...actions].filter((c) => !q || `${c.label} ${c.hint}`.toLowerCase().includes(q));
    if (q) all.push({ id: "ask", group: "Ask ARIA", label: `Ask ARIA: “${query.trim()}”`, hint: "Answered from your own reports", Icon: ChatIcon, href: `/mentor?q=${encodeURIComponent(query.trim())}` });
    return all;
  }, [query, isAdmin, shell.inProgress, shell.weakestTopic, shell.latestReportId]);
}

/**
 * Quick actions (⌘K / Ctrl+K from anywhere in the app): type to filter, ↑↓ to move, Enter to go, Esc to close.
 * Built on the native <dialog>, so focus is trapped and returned for free. Anything typed that isn't a
 * command can be asked to ARIA.
 */
export default function CommandPalette() {
  const router = useRouter();
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const dialog = useRef(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const commands = useCommands(query);
  const current = Math.min(active, Math.max(commands.length - 1, 0));

  // ⌘K / Ctrl+K toggles it from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUiStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
      useShellStore.getState().load(); // fresh suggestions (no-op if already loaded)
    }
    if (!open && node.open) node.close();
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  async function run(command) {
    close();
    if (command.signOut) {
      await signOut();
      router.replace("/");
      return;
    }
    router.push(command.href);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + commands.length) % Math.max(commands.length, 1));
    } else if (e.key === "Enter" && commands[current]) {
      e.preventDefault();
      run(commands[current]);
    }
  }

  return (
    <dialog ref={dialog} onClose={close} onClick={(e) => e.target === dialog.current && close()} aria-label="Quick actions"
      className="m-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border-strong bg-surface/95 p-0 text-foreground shadow-2xl backdrop-blur-xl backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-dialog-in">
      <div className="flex items-center gap-3 border-b border-border px-4">
        <SearchIcon className="size-4 text-muted" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={commands[current] ? `${listId}-${commands[current].id}` : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder="Jump to, start something, or ask ARIA…"
          className="h-14 flex-1 bg-transparent text-[15px] placeholder:text-subtle focus:outline-none"
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
        {commands.map((c, i) => {
          const header = i === 0 || commands[i - 1].group !== c.group ? c.group : null;
          return (
            <li key={c.id} role="presentation">
              {header && <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{header}</p>}
              <div id={`${listId}-${c.id}`} role="option" aria-selected={i === current} onMouseMove={() => setActive(i)} onClick={() => run(c)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${i === current ? "bg-raised" : ""}`}>
                <span className={`flex size-8 items-center justify-center rounded-lg border ${i === current ? "border-primary/40 text-primary" : "border-border text-muted"}`}>
                  <c.Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{c.label}</span>
                  <span className="block truncate text-xs text-muted">{c.hint}</span>
                </span>
                {i === current && <Kbd>↵</Kbd>}
              </div>
            </li>
          );
        })}
        {commands.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches.</li>}
      </ul>
    </dialog>
  );
}
