"use client";

import useMediaQuery from "@/lib/useMediaQuery";
import { useScene } from "@/store/sceneStore";

import { deskFraming } from "./framings";

/**
 * A quiet view of the desk behind a page (onboarding): the same room you arrived in, dimmed, so sign-up →
 * onboarding → dashboard never leaves the scene. Renders nothing itself; the shared SceneHost draws it.
 */
export default function SceneBackdrop({ opacity = 0.35 }) {
  const wide = useMediaQuery("(min-width: 768px)");
  useScene({ preset: "desk", framing: deskFraming(wide), opacity, label: "Your desk, dimly lit" });
  return null;
}
