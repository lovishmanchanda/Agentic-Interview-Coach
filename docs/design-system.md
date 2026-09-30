# InterviewOS design system

The living reference is the `/design` page (development only: `npm run dev`, then open `/design`). This note records the decisions behind it.

## Names

| Name | What it is | In code |
|---|---|---|
| **InterviewOS** | The product. It manages the whole preparation loop, like an operating system for interview prep. | — |
| **VERA** (Virtual Evaluator & Responsive Assessor) | The interviewer agent: adaptive questions, follow-ups, evaluation. | `interviewer` |
| **ARIA** (Adaptive Reflection & Intelligent Assistance) | The mentor agent: history-aware guidance, drills, company prep. | `mentor` |

Code keeps `interviewer` and `mentor`. `aria-*` is HTML's accessibility prefix, so a component called `Aria…` would be confusing. The names appear only in UI text.

## The story: the interview room

- The **landing page** is an empty chair under a spotlight ("Take the seat").
- The **auth screens** show the same room, dimmed.
- The **dashboard** is your desk: report sheets, with a lamp lighting the next thing to practise.

The two agents are the two lights of the room:
- **VERA is the spotlight.** Cool steel-white, precise. She appears wherever you're interviewed.
- **ARIA is the desk lamp.** Warm orange. She appears wherever you reflect and improve.

Avatars are light glyphs (`components/brand/AgentAvatar.jsx`), never faces or robots.

## Colour (dark only)

Black and greys carry every page. Accents are used sparingly:
- **Orange (`--primary`)** is the brand and ARIA. Use it for the primary action, the active item, focus rings and chart marks. At most one "under the lamp" highlight per screen.
- **Steel (`--steel`)** is VERA, for "AI at work" states and info notes. Rare.
- **Status colours** (`--success`, `--warning`, `--danger`) are reserved and always paired with an icon or a label.
- **Score tiers:** strong = success, adequate = neutral grey, weak = warning. Orange is not a tier.

All values are in `frontend/app/globals.css`, with the contrast and colour-vision results in its header comment. Checks used:
- the dataviz palette validator, run on brand + status with all pairs against `--surface`
- WCAG contrast for text

**Text on an orange fill uses `--primary-foreground`** (dark, 7.6:1). White on orange fails (2.6:1).

## Type, elevation, motion

- **Type:** Geist Sans for UI and Geist Mono for code, scores and key-caps. Both are self-hosted through `next/font`. `text-display` and `text-headline` are for hero moments.
- **Elevation:** a border plus a faint top highlight (`.elevated`), not drop shadows, which disappear on black.
- **Motion tokens:**
  - `--duration-fast` 150 ms: hovers
  - `--duration-base` 250 ms: reveals
  - `--duration-slow` 400 ms: panels and morphs
  - `--duration-scene` 700 ms: camera moves
  - Easing is `--ease-out-expo`.
- Under `prefers-reduced-motion` every animation becomes instant.

## Voice

- **VERA:** calm, neutral, professional. "Take your time. When you're ready, walk me through your approach." In serious mode she is quieter still.
- **ARIA:** warm, specific, encouraging. "Your STAR stories improved: results went from vague to measurable."
- **Status lines name the agent:** "VERA is evaluating your answer…", "ARIA is reviewing your last 3 interviews…".
