"use client";

import { AnimatePresence, motion } from "motion/react";

import { AgentLabel } from "@/components/brand/AgentStatus";
import useTypewriter from "@/components/motion/useTypewriter";
import Button from "@/components/ui/Button";
import { TargetIcon } from "@/components/ui/icons";
import { topicLabel } from "@/lib/interviewOptions";

import MentorAnswer from "./MentorAnswer";

const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 };
const POP = { hidden: { opacity: 0, y: 6, scale: 0.96 }, shown: { opacity: 1, y: 0, scale: 1, transition: SPRING } };

/** The buttons under a reply (a weak-area drill, a plan's practice interviews), popping in once the text is written.
 *  The drill button keeps the name ARIA's prompt uses for it ("Start a weak-area drill"). */
function Actions({ actions }) {
  const drills = actions.filter((a) => a.type === "drill");
  const practice = actions.filter((a) => a.type === "practice");
  if (!drills.length && !practice.length) return null;
  return (
    <motion.div className="mt-4 flex flex-wrap gap-2" initial="hidden" animate="shown" transition={{ staggerChildren: 0.07 }}>
      {drills.map((a) => (
        <motion.div key={a.href} variants={POP}>
          <Button href={a.href} size="sm" className="h-auto! min-h-9 py-1.5 text-left pointer-coarse:min-h-11"><TargetIcon className="size-4" /> Start a weak-area drill · {a.topics.map(topicLabel).join(", ")}</Button>
        </motion.div>
      ))}
      {practice.map((a) => (
        <motion.div key={a.href} variants={POP}>
          <Button href={a.href} variant="secondary" size="sm" className="h-auto! min-h-9 py-1.5 text-left pointer-coarse:min-h-11">{a.label}</Button>
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * One message. Yours sits on the right; ARIA's on the left under her lamp's warm edge. A new reply springs in
 * and writes itself out a few words at a time (the full text arrives at once; `animate` is false for
 * conversation history, which simply appears), then its buttons pop in.
 */
export default function ChatBubble({ message, animate = false }) {
  const { text, done } = useTypewriter(message.content, animate && message.role === "assistant");

  if (message.role === "user") {
    return (
      <motion.li className="ml-auto max-w-[85%]" initial={animate ? { opacity: 0, y: 12, scale: 0.97 } : false}
        animate={{ opacity: message.pending ? 0.7 : 1, y: 0, scale: 1 }} transition={SPRING} style={{ transformOrigin: "bottom right" }}>
        <div className="rounded-2xl rounded-tr-md border border-border-strong bg-raised px-4 py-3 text-sm">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </motion.li>
    );
  }
  return (
    <motion.li className="max-w-[94%] sm:max-w-[85%]" initial={animate ? { opacity: 0, y: 14, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} style={{ transformOrigin: "bottom left" }}>
      <div className="relative overflow-visible rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 text-sm">
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl rounded-tl-md bg-[radial-gradient(80%_60%_at_0%_0%,rgb(255_122_46/0.07),transparent_70%)]" />
        <div className="relative">
          <AgentLabel agent="mentor" />
          <MentorAnswer text={text} sources={message.sources || []} />
          {!done && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-primary" />}
          <AnimatePresence>{done && <Actions actions={message.actions || []} />}</AnimatePresence>
        </div>
      </div>
    </motion.li>
  );
}
