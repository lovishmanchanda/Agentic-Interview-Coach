// Values match the backend enums (app/db/models/profile.py) and question_bank role IDs.

export const EXPERIENCE_LEVELS = [
  { value: "fresher", label: "Fresher / student" },
  { value: "1-2", label: "1–2 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "senior", label: "Senior (5+ years)" },
];

export const TARGET_ROLES = [
  { value: "software_engineer", label: "Software Engineer" },
  { value: "backend", label: "Backend Engineer" },
  { value: "frontend", label: "Frontend Engineer" },
  { value: "fullstack", label: "Full-stack Engineer" },
  { value: "ml_engineer", label: "ML Engineer" },
];

export const IO_MODES = [
  { value: "text", label: "Text" },
  { value: "voice", label: "Voice (coming in Phase 5)" },
];

export const DIFFICULTIES = [
  { value: "adaptive", label: "Adaptive (recommended)" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export const SKILL_SUGGESTIONS = {
  software_engineer: ["data structures", "algorithms", "python", "java", "sql", "system design", "git"],
  backend: ["python", "java", "go", "sql", "rest apis", "databases", "caching", "system design"],
  frontend: ["javascript", "react", "css", "accessibility", "performance", "typescript"],
  fullstack: ["javascript", "react", "node.js", "sql", "rest apis", "system design"],
  ml_engineer: ["python", "machine learning", "deep learning", "statistics", "sql", "pytorch", "mlops"],
};

export function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label ?? value;
}
