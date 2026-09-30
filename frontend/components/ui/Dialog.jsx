"use client";

import { useEffect, useId, useRef } from "react";

import { XIcon } from "./icons";

/**
 * A modal built on the native <dialog> element: the browser traps focus, closes on Escape and returns focus
 * to where it was. It fades and rises in (CSS, skipped under reduced motion). Clicking the backdrop closes it.
 */
export default function Dialog({ open, onClose, title, description, children, footer, className = "" }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className={`m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border-strong bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm open:animate-dialog-in ${className}`}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="-m-2 flex size-10 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        </div>
        {children && <div className="mt-5">{children}</div>}
      </div>
      {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
    </dialog>
  );
}
