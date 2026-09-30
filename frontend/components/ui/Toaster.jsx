"use client";

import { AnimatePresence, motion } from "motion/react";

import { useToastStore } from "@/store/toastStore";

import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "./icons";

const TONES = {
  success: { Icon: CheckIcon, className: "text-success" },
  error: { Icon: AlertIcon, className: "text-danger" },
  info: { Icon: InfoIcon, className: "text-steel" },
};

/** Where toasts appear: bottom-right on desktop, bottom-centre on phones. Announced politely. */
export default function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
      <AnimatePresence initial={false}>
        {toasts.map(({ id, tone, title, message }) => {
          const { Icon, className } = TONES[tone];
          return (
            <motion.div key={id} layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              role={tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border-strong bg-raised/95 p-4 text-sm shadow-2xl backdrop-blur">
              <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} />
              <div className="min-w-0 flex-1">
                {title && <p className="font-medium">{title}</p>}
                <p className={title ? "text-muted" : ""}>{message}</p>
              </div>
              <button type="button" onClick={() => dismiss(id)} aria-label="Dismiss" className="-m-1 rounded-md p-1 text-muted hover:text-foreground">
                <XIcon className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
