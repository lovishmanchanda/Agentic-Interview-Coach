"use client";

import { useShot } from "./shots";

/**
 * A quiet view of the desk behind a page (onboarding): the same room you arrived in, dimmed, so sign-up →
 * onboarding → dashboard never leaves the scene. Renders nothing itself; the shared SceneHost draws it.
 */
export default function SceneBackdrop({ opacity }) {
  useShot("deskBackdrop", opacity === undefined ? {} : { opacity });
  return null;
}
