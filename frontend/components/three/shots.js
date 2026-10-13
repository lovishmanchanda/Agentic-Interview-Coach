"use client";

import useMediaQuery from "@/lib/useMediaQuery";
import { useScene, useSceneOverride } from "@/store/sceneStore";

/**
 * Every shot the site's one interview room plays, by name: the camera position (an InterviewRoom preset), how
 * it's framed on wide screens and on phones, who is in the room, and what the scene says to screen readers.
 * Pages ask for a shot by name (`useShot("desk", { desk })`) and pass only what's live: data, scroll-driven
 * values, hover. The choreography lives here, in one place, instead of in every page.
 *
 * framing  { x, y, distance } (see InterviewRoom): x slides the shot sideways (negative puts the subject right
 *          of centre, leaving room for words on the left), y aims lower, distance pulls back
 * cast     "you"      the signed-in user (walks in the first time, then sits), or nobody when signed out
 *          "standIn"  a figure already seated, signed in or not (the landing page's story)
 * wideAt   the breakpoint where the wide framing starts (min-width, px)
 */
const NO_SHIFT = { x: 0, y: 0, distance: 1 };

// The landing hero: wide screens put the chair right of centre (words on the left); phones put it higher and
// smaller, above the words.
const LANDING = { wide: { x: -0.62, y: 0, distance: 1 }, phone: { x: 0, y: -0.75, distance: 1.45 } };
// The desk: wide screens put you, seated, just right of the greeting (bottom left), the desk and sheets beyond;
// phones centre on the desk, pulled back, so you, the lamp and the sheets fit a tall, narrow frame.
const DESK = { wide: { x: -0.75, y: 0, distance: 1 }, phone: { x: -0.35, y: 0.2, distance: 1.3 } };

export const SHOTS = {
  landing: { preset: "landing", framing: LANDING, parallax: true, intro: true,
    label: "An empty chair under a spotlight in a dark room" },
  // Sign in / sign up: the chair sits left of the card on wide screens; on phones the room is a dim backdrop above it.
  auth: { preset: "auth", framing: { wide: { x: 0.75, y: 0, distance: 1 }, phone: { x: 0, y: -1.05, distance: 1.6 } },
    wideAt: 1024, parallax: true, label: "The interview room, dimly lit" },
  desk: { preset: "desk", framing: DESK, label: "Your desk: your interview reports, and a lamp over what to do next" },
  // Behind onboarding: the same desk, dimmed, so sign-up → onboarding → dashboard never leaves the room.
  deskBackdrop: { preset: "desk", framing: DESK, opacity: 0.35, label: "Your desk, dimly lit" },
  // The walk into an interview (InterviewIntro), then the push-in as the first question arrives.
  interview: { preset: "interview", framing: { wide: NO_SHIFT, phone: { x: 0.15, y: 0.05, distance: 1.5 } },
    label: "The interview room: your chair at a table, two interviewers waiting across it" },
  interviewPush: { preset: "interviewPush", framing: { wide: NO_SHIFT, phone: { x: 0.15, y: 0.05, distance: 1.5 } },
    label: "The interview room: the interviewers look up as the first question comes" },
  // The landing page's loop story (wide screens only): the subject sits left, the step's words on the right.
  storyInterview: { preset: "interview", framing: { wide: { x: 0.95, y: 0.05, distance: 1.05 } }, cast: "standIn",
    label: "An interview: a candidate at a table, two interviewers across it" },
  storyNotes: { preset: "notes", framing: { wide: NO_SHIFT }, cast: "standIn",
    label: "An interviewer writing up the candidate's answer" },
  storyReport: { preset: "deskReport", framing: { wide: { x: 0.85, y: 0, distance: 1 } }, cast: "standIn",
    label: "A report landing on the candidate's desk" },
  storyNext: { preset: "deskLamp", framing: { wide: { x: 0.55, y: 0, distance: 1 } }, cast: "standIn", attend: "next",
    label: "The desk lamp lighting what to practise next" },
};

/** RoomScene props for a shot: its choreography, at this screen size, plus what's live (data, scroll, hover). */
function useShotProps(name, live) {
  const shot = SHOTS[name] ?? SHOTS.landing;
  const wide = useMediaQuery(`(min-width: ${shot.wideAt ?? 768}px)`);
  const { preset, framing, parallax = false, intro = false, cast = "you", attend = null, label, opacity } = shot;
  return {
    preset,
    framing: (wide ? framing.wide : framing.phone ?? framing.wide) ?? NO_SHIFT,
    parallax,
    intro,
    label,
    attend,
    ...(opacity !== undefined ? { opacity } : {}),
    ...(cast === "standIn" ? { occupied: true, walkIn: false } : {}),
    ...live,
  };
}

/** Show this shot behind the page (claims the site's room; see store/sceneStore.js). */
export function useShot(name, live = {}) {
  useScene(useShotProps(name, live));
}

/** While `name` is set, this section of the page plays its shot instead of the page's own (null hands it back). */
export function useShotOverride(name, live = {}) {
  const props = useShotProps(name ?? "landing", live);
  useSceneOverride(name ? props : null);
}
