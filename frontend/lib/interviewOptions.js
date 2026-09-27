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

const TOPIC_LABELS = {
  dsa: "DSA",
  dbms: "DBMS",
  os: "OS",
  oops: "OOP",
  api_design: "API design",
  css_layout: "CSS layout",
};

/** "system_design" -> "System design", "dsa" -> "DSA". */
export function topicLabel(topic) {
  if (TOPIC_LABELS[topic]) return TOPIC_LABELS[topic];
  const words = topic.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
