/**
 * Shared camera framings (see InterviewRoom's `framing` prop), so two pages that show the same shot use the
 * same numbers and a hand-off between them doesn't nudge the camera.
 */

// The desk. Wide screens leave room for the app's sidebar on the left, so the desk sits a little right of centre.
export const DESK_WIDE = { x: -0.25, y: 0, distance: 1 };
// Phones: pulled back so the lamp and the desk both fit a tall, narrow frame.
export const DESK_PHONE = { x: 0.2, y: 0.15, distance: 1.75 };

export const deskFraming = (wide) => (wide ? DESK_WIDE : DESK_PHONE);

// The landing hero: wide screens put the chair right of centre (words on the left); phones put it higher and
// smaller, above the words. Breakpoint: 768 px (md).
export const LANDING_WIDE = { x: -0.62, y: 0, distance: 1 };
export const LANDING_PHONE = { x: 0, y: -0.75, distance: 1.45 };

export const landingFraming = (wide) => (wide ? LANDING_WIDE : LANDING_PHONE);
