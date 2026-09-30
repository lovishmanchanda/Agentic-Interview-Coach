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

## Motion and 3D (Phase 7.2)

**Motion** (`frontend/components/motion/`, built on the `motion` library):
- `MotionProvider` wraps the app with `reducedMotion="user"`. When the OS asks for reduced motion, movement drops out and only fades remain.
- Primitives:
  - `Reveal`: fade and lift on scroll
  - `Stagger` / `StaggerItem`
  - `NumberTicker`: count-up; screen readers get the final number
  - `PageTransition`: enter-only
  - `useSectionProgress`: scroll progress through a section
- `SmoothScroll` (Lenis) is for the landing page only. App pages keep native scrolling.

**The interview room** (`frontend/components/three/`):
- Pages use `<RoomScene preset="landing|auth|desk" … />`. It loads three.js lazily and client-only, as one separate chunk (about 240 KB gzipped). Pages without 3D never download it.
- While the scene loads, and in browsers without WebGL, a CSS/SVG still of the same shot shows instead (`RoomPoster`).
- `InterviewRoom` is one scene with three presets. Switching presets eases the camera, the chair and the lights:
  - **landing:** the chair under VERA's spotlight
  - **auth:** dimmer and closer
  - **desk:** the chair at the desk, ARIA's lamp on
- Props:
  - `progress` (number or motion value) dollies the landing camera
  - `lightOn` warms an orange rim light
  - `parallax` makes the camera follow the pointer a little
  - `desk` holds `{ reports, nextStep, onOpenReport, onNextStep }` for `DeskItems`
- `DeskItems` draws one printed sheet per report and a "next" card under the lamp. Hover lifts a sheet; clicking one fires its callback. The printing is canvas textures in Geist.
- Everything is modelled from primitives in code. No model files or remote assets. The dust uses a seeded random generator, so every load looks the same.
- **Budget:** the pixel ratio is capped at 1.5. No frames are drawn offscreen or when the tab is hidden. Under reduced motion only a still frame is drawn. Small screens get fewer dust motes and smaller shadow maps.
- **Lint pattern:** three.js objects are mutated only through refs inside `useFrame`, never during render. This keeps the React-compiler lint rules happy.

The live demo is on `/design`: switch presets, drag the scroll dolly, hover for the warm light, and click the sheets.

### Cinematic pass (after "still too basic")

- **Furniture** (`furniture.jsx`), modelled in code:
  - a sled-base chair (bent chrome tube per side, upholstered rounded seat, back curved to wrap around you)
  - a walnut desk on chrome tube legs
  - an architect's lamp: lathe-turned shade, a liner that glows orange, and a spotlight aimed at the desk
- **Surfaces** (`textures.js`), painted on canvases at run time:
  - polished-concrete roughness for the floor, kept mostly matte (a glossy floor washes the whole room grey)
  - walnut grain for the desk
- **Look** (`Effects.jsx`, `@react-three/postprocessing`):
  - bloom on the brightest highlights only
  - ACES tone mapping; AgX lifted the blacks to grey
  - vignette and subtle grain
  - the canvas renders `flat`, so tone mapping happens once, in the effects
- **Light:**
  - reflections come from three's procedural `RoomEnvironment`, with nothing downloaded
  - reflection strength is kept low on every material; paper and fabric especially, or they glow white
  - soft shadows (PCF radius, normal bias against acne)
  - the beam's haze drifts slowly (noise in the shader)
- **Framing:** `framing={{ x, y, distance }}` moves the shot per layout. On desktop the chair sits right of centre with the headline on the left; on phones the chair is higher and smaller, with the words below.
- **Bundle:** one lazy chunk of about 270 KB gzipped, loaded only by pages that show the room.

## Landing page (7.4, pulled forward)

`components/landing/`, top to bottom:
- **Hero:** pinned for about 190svh. The camera dollies toward the chair as you scroll, the headline words rise in, and hovering "Take the seat" warms the light behind the chair.
- **Loop story:** four steps pass on the right while a live visual stays pinned on the left:
  - VERA's question types itself out
  - the scores draw in
  - the VERA → ARIA handoff
  - ARIA's reply with citations and a drill button
- **Agents, interview types, sample report:**
  - Meet VERA and ARIA: two cards, each with its own light
  - interview types as a bento grid
  - a sample report whose ring draws itself, labelled "Sample"
- **FAQ, closing call to action, footer:** an FAQ accordion, then "The chair is empty." under a CSS spotlight, then the footer.
- **Page-wide:** Lenis smooth scrolling on this page only (anchors glide) and a film-grain overlay (`.grain`). Signed-in visitors see "Go to your desk" instead of the sign-up buttons.

## Richer pass, components and auth (7.3 + 7.5)

**Type and texture**
- **Instrument Serif italic** is the editorial accent: one or two words per headline ("Take the *seat.*", "Before VERA *begins.*"). Use `SplitHeading` with `*word*`. Never use it for body text.
- `section-title` and `eyebrow` utilities give fluid section headings (clamp from phone to desktop) and the small mono label above them.
- **Cursor-lit cards** (`SpotlightCard`): the border and surface brighten under the pointer, via CSS variables with no re-renders.
- **Motion helpers:**
  - `Magnetic` for the hero CTAs
  - `Marquee` for the topic band
  - `animate-shimmer`, `animate-dialog-in`, `animate-blink`

**Hero intro:** the room starts black. VERA's spotlight flickers on (`intro` prop, a step pattern), then the words rise. Film-credit lines sit in the corners on large screens.

**Responsive:** checked at 375, 768 and 1280 px with no horizontal overflow.
- The scene framing adapts: phones get the chair higher and smaller, above the words.
- The camera starts on the framed shot, so there's no swoop on load.
- Phones get a full-screen menu.

**Component library** (`components/ui/`):
- **Existing components, same props:**
  - Button: 44 px touch targets, a highlight and glow on primary, a focus ring
  - Field: 48 px controls, an orange focus glow, a password show/hide toggle, errors with an icon
  - Card: `surface`, `raised` and `lamp` variants
  - Alert and Badge: icon or dot plus text, never colour alone
  - ChoiceGroup
- **New:**
  - Skeleton / SkeletonText
  - EmptyState
  - ProgressRing
  - StatTile (the delta is shown with an arrow and a sign)
  - Kbd, IconButton, Tooltip (CSS, with aria-describedby)
  - Tabs (WAI-ARIA arrow keys, sliding pill)
  - Dialog (native `<dialog>`: focus trap and Escape come free)
  - Toast (`toast.success(…)` plus `<Toaster />` in the root layout)
  - `icons.jsx`
- All of them are shown on `/design`.

**Auth** (`components/auth/AuthShell.jsx`, `AuthForm.jsx`)
- One glass card lives in `app/(auth)/layout.js` over the dimmed room.
- **The morph:** `/login` ⇄ `/register` swap without remounting. The tab pill slides, the headline cross-fades, the Name field and the strength meter fold in, and typed values stay. `router.replace` keeps `?next=`.
- **On success:** the card steps aside, the camera glides to the desk ("To your desk…", about 1.3 s), then the app opens. Under reduced motion it navigates at once.
- **Onboarding:** "Before VERA *begins.*" with a numbered progress rail, sliding steps, and choice chips for experience, difficulty and input/output. Voice is shown but disabled until Phase 5. It finishes with a "You're all set" toast on the desk.

## One room across pages (SceneHost)

- **The problem:** the login screen and the dashboard each mounted their own canvas. Navigating threw the scene away and flashed a loading spinner, so login → dashboard felt like a reload.
- **How it works now:**
  - `components/three/SceneHost.jsx` in the **root layout** owns the only 3D canvas. It is fixed behind every page (`-z-10`) and survives navigation.
  - Pages ask for a shot with `useScene({ preset, framing, desk, opacity, … })` from `store/sceneStore.js`.
  - A leaving page releases the scene after a 400 ms grace period, and only if it has really unmounted. Dev StrictMode remounts once and must keep it.
  - The owner is a per-mount token, not `useId`, because ids from different page trees can collide.
  - When no page wants the room it fades out and stops drawing, but stays mounted, so the next claim is instant.
- **Events:** the canvas sits behind the page, so it reads pointer events from `document.body` in client coordinates. The desk only reacts over its hit area (`[data-desk-hit]`, the dashboard's open hero band), never through cards scrolled over it.
- **Flows:**
  - **landing → sign-up:** the camera keeps moving from the landing shot into the auth shot. The landing scene fades out with scroll as the hero pin releases.
  - **sign-in → dashboard:**
    - The card steps aside and the camera glides to the desk.
    - Meanwhile the profile and report list load, and the report sheets land on the desk.
    - Navigation waits for both the move and the data, so the dashboard opens with nothing to load.
    - The dashboard's `DeskHero` claims the same shot (shared `framings.js`) and starts from the sheets already on the desk, so nothing blinks.
    - The rest of the dashboard sits on solid black, and the room fades as you scroll.
  - **sign-up → onboarding:** onboarding shows the same desk, dimmed (`SceneBackdrop`).
  - **sign-in → landing page:** the card steps aside ("Welcome back…"), the camera glides from the auth shot back to the chair, and the landing page opens with "Back to your desk".
    - A `?next=` page (you were sent to sign in from somewhere) still goes back there, via the desk.
    - New accounts go desk → onboarding.
  - **sign-out → landing page:** the camera travels from the desk back to the chair.
    - `isSigningOut()` stops AuthGuard from treating the cleared session as expired and bouncing to /login.
    - The landing page is prefetched.
    - Its words skip the spotlight-flicker delay when the room is already lit.
