/**
 * The configure page's one-click starting points. Each preset is a patch over the profile's defaults; the page
 * works out which preset (if any) the current choices match, so "Customise" and a preset never disagree.
 */
import { ChairIcon, ChatIcon, CodeIcon, SparkIcon, TargetIcon } from "@/components/ui/icons";
import { topicLabel } from "@/lib/interviewOptions";

const MINUTES_PER = { technical: 5, behavioral: 5, coding: 25 };

export const BASE_PRESETS = [
  {
    id: "quick", title: "Quick practice", Icon: SparkIcon,
    blurb: "Three technical questions, with feedback after each answer.",
    patch: { interview_type: "technical", interview_mode: "practice", question_count: 3, focus_topics: [] },
  },
  {
    id: "behavioral", title: "Behavioural round", Icon: ChatIcon,
    blurb: "STAR stories about your experience, scored part by part.",
    patch: { interview_type: "behavioral", interview_mode: "practice", question_count: 3, focus_topics: [] },
  },
  {
    id: "coding", title: "Coding round", Icon: CodeIcon,
    blurb: "Two problems in the editor, graded by tests.",
    patch: { interview_type: "coding", interview_mode: "practice", question_count: 2, focus_topics: [] },
  },
  {
    id: "mock", title: "Full mock", Icon: ChairIcon,
    blurb: "Five questions, no hints, scores only in the report. Like the real thing.",
    patch: { interview_type: "technical", interview_mode: "serious", question_count: 5, focus_topics: [] },
  },
];

/** "Drill <weakest topic>": only offered once a report has shown what's weakest. */
export function drillPreset(topic, type) {
  const interviewType = type || "technical";
  return {
    id: "drill", title: `Drill ${topicLabel(topic)}`, Icon: TargetIcon, recommended: true,
    blurb: "Your weakest topic last time. Three questions, all on it.",
    patch: { interview_type: interviewType, interview_mode: "practice", question_count: interviewType === "coding" ? 2 : 3, focus_topics: [topic] },
  };
}

const sameList = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

/** The preset these choices amount to, or null ("Custom"). */
export function matchPreset(form, presets) {
  return presets.find(({ patch }) => Object.entries(patch).every(([key, value]) => (
    Array.isArray(value) ? sameList(value, form[key]) : form[key] === value
  )))?.id ?? null;
}

export function estimateMinutes(type, count) {
  return (MINUTES_PER[type] || 5) * count;
}

export function presetMeta(patch) {
  const unit = patch.interview_type === "coding" ? "problem" : "question";
  return `${patch.question_count} ${unit}${patch.question_count === 1 ? "" : "s"} · ~${estimateMinutes(patch.interview_type, patch.question_count)} min`;
}
