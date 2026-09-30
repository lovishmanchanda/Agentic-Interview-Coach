"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CITE_PREFIX = "#cite-";
const CHIP = "mx-0.5 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft py-0.5 pl-0.5 pr-2 align-middle font-mono text-[11px] font-medium text-primary no-underline transition-colors";
const SOURCE_KIND = {
  summary: "Report summary", question: "One of your answers", recommendations: "Recommendations", prep_plan: "Preparation plan",
};
const chipDate = (date) => {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/**
 * A citation: a small chip (number and date) that opens the cited report. Hovering or focusing it shows a card
 * with where the quote came from. The card is decoration; the link's own label says the same for screen readers.
 */
function Citation({ n, source }) {
  const kind = SOURCE_KIND[source.chunk_type] || "Interview report";
  const topic = source.topic.split(",").map((t) => t.trim()).filter(Boolean).map((t) => t.replace(/_/g, " ")).join(", ");
  const label = `Source ${n}: ${kind}, ${chipDate(source.date)}${topic ? `, ${topic}` : ""}${source.report_id ? ". Opens the report." : ""}`;
  const chip = (
    <>
      <span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-[10px]">{n}</span>{chipDate(source.date)}
    </>
  );
  return (
    <span className="group/cite relative inline-block">
      {source.report_id ? (
        <Link href={`/interview/report/${source.report_id}`} aria-label={label} className={`${CHIP} hover:border-primary/60 hover:bg-primary/15`}>{chip}</Link>
      ) : (
        <span role="note" aria-label={label} tabIndex={0} className={CHIP}>{chip}</span>
      )}
      <span aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-60 max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-dialog-in rounded-xl border border-border-strong bg-raised p-3 text-left text-xs leading-relaxed shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)] group-focus-within/cite:block group-hover/cite:block">
        <span className="block font-mono text-[10px] uppercase tracking-wider text-subtle">Source {n}</span>
        <span className="mt-1 block font-medium text-foreground">{kind}</span>
        <span className="block text-muted">{chipDate(source.date)}{topic ? ` · ${topic}` : ""}</span>
        {source.report_id && <span className="mt-1.5 block text-primary">Open the report →</span>}
      </span>
    </span>
  );
}

/** Turns bare "[n]" citations into "[n](#cite-n)" links so the markdown renderer hands them to `a` below.
 *  "[n](" is left alone because that is already a real markdown link. */
function linkCitations(text) {
  return text.replace(/\[(\d+)\](?!\()/g, `[$1](${CITE_PREFIX}$1)`);
}

/** Remark plugin: the model often writes <br> inside table cells. Raw HTML stays disabled, so turn exactly
 *  that tag into a markdown line break instead of showing it as literal text. */
function remarkBreakTags() {
  const walk = (node) => {
    node.children?.forEach((child, i) => {
      if (child.type === "html" && /^<br\s*\/?>$/i.test(child.value.trim())) node.children[i] = { type: "break" };
      else walk(child);
    });
  };
  return walk;
}

/**
 * Renders a Mentor reply as markdown (lists, bold, tables, code). Citations become chips linking to the cited
 * session's report (the server adds each source's report_id), with a hover card saying where each came from. Raw HTML in the reply is not rendered (react-markdown's default), so model output can't
 * inject markup.
 */
export default function MentorAnswer({ text, sources }) {
  const components = {
    a({ href = "", children }) {
      if (href.startsWith(CITE_PREFIX)) {
        const n = Number(href.slice(CITE_PREFIX.length));
        const source = sources[n - 1];
        if (!source) return <span>[{children}]</span>;
        return <Citation n={n} source={source} />;
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
          {children}
        </a>
      );
    },
    p: ({ children }) => <p className="leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
    h1: ({ children }) => <h3 className="font-semibold">{children}</h3>,
    h2: ({ children }) => <h3 className="font-semibold">{children}</h3>,
    h3: ({ children }) => <h3 className="font-semibold">{children}</h3>,
    h4: ({ children }) => <h4 className="font-semibold">{children}</h4>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    code: ({ children }) => <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">{children}</code>,
    pre: ({ children }) => <pre className="overflow-x-auto rounded-lg bg-background p-3 [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
    table: ({ children }) => (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-border px-2 py-1 font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-border px-2 py-1 align-top">{children}</td>,
  };

  return (
    <div className="space-y-3 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreakTags]} components={components}>
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
}
