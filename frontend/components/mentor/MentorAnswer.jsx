"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CITE_PREFIX = "#cite-";
const CHIP = "mx-0.5 inline-flex rounded-full bg-primary-soft px-2 py-0.5 align-middle text-xs font-medium text-primary no-underline";

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
 * session's report. Raw HTML in the reply is not rendered (react-markdown's default), so model output can't
 * inject markup.
 */
export default function MentorAnswer({ text, sources, reportBySession }) {
  const components = {
    a({ href = "", children }) {
      if (href.startsWith(CITE_PREFIX)) {
        const source = sources[Number(href.slice(CITE_PREFIX.length)) - 1];
        if (!source) return <span>[{children}]</span>;
        const label = `${source.date} · ${source.topic}`;
        const reportId = reportBySession[source.session_id];
        return reportId ? (
          <Link href={`/interview/report/${reportId}`} className={`${CHIP} hover:underline`} title="Open this report">
            {label}
          </Link>
        ) : (
          <span className={CHIP}>{label}</span>
        );
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
