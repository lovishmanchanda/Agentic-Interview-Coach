// Values match the backend enums (app/db/models/interview.py).

export const INTERVIEW_TYPES = [
  { value: "technical", label: "Technical", description: "Concepts, trade-offs and design, answered in prose" },
  { value: "behavioral", label: "Behavioral", description: "STAR-style questions about your experience" },
  { value: "coding", label: "Coding", description: "Solve problems in an editor, graded by tests" },
];

export const INTERVIEW_MODES = [
  { value: "practice", label: "Practice", description: "Feedback and a model answer after every question" },
  { value: "serious", label: "Serious", description: "Like the real thing: scores only in the report" },
];

export const QUESTION_COUNTS = [1, 3, 5].map((n) => ({ value: n, label: String(n) }));
// A coding problem takes 15-35 minutes, so a coding interview has at most 3.
export const CODING_QUESTION_COUNTS = [1, 2, 3].map((n) => ({ value: n, label: String(n) }));

// Piston runtimes (backend app/core/coding/languages.py). Only Python is graded against tests so far.
export const CODING_LANGUAGES = [
  { value: "python", label: "Python", description: "Graded against every test" },
  { value: "javascript", label: "JavaScript", description: "Runs as written; not graded yet" },
  { value: "java", label: "Java", description: "Runs as written; not graded yet" },
  { value: "cpp", label: "C++", description: "Runs as written; not graded yet" },
  { value: "c", label: "C", description: "Runs as written; not graded yet" },
];

export const EXECUTION_STATUS = {
  accepted: { label: "Accepted", tone: "success" },
  wrong_answer: { label: "Wrong answer", tone: "danger" },
  runtime_error: { label: "Runtime error", tone: "danger" },
  compile_error: { label: "Compile error", tone: "danger" },
  time_limit: { label: "Time limit exceeded", tone: "warning" },
  internal_error: { label: "Runner error", tone: "warning" },
};

const TOPIC_LABELS = {
  dsa: "DSA",
  dbms: "DBMS",
  os: "OS",
  oops: "OOP",
  api_design: "API design",
  css_layout: "CSS layout",
};

/** Evaluation dimensions: "time_complexity" -> "Time complexity". */
export function dimensionLabel(name) {
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "system_design" -> "System design", "dsa" -> "DSA". */
export function topicLabel(topic) {
  if (TOPIC_LABELS[topic]) return TOPIC_LABELS[topic];
  const words = topic.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
