"use client";

import { motion, useMotionValue, useMotionValueEvent } from "motion/react";
import { useState } from "react";

import { useSceneStore } from "@/store/sceneStore";

import RoomScene from "./RoomScene";

const isMotionValue = (v) => v && typeof v.get === "function";

/**
 * The site's one 3D canvas, rendered from the root layout behind every page (see store/sceneStore.js).
 * Pages claim it with useScene(); when no page wants it, it fades out and stops drawing, but stays mounted so
 * the next page that wants it gets it instantly, in the same place, mid-move if the camera was moving.
 * `opacity` (a number or a motion value) lets a page fade it with scroll; at ~0 it stops drawing too.
 */
export default function SceneHost() {
  const { everActive, active, props } = useSceneStore();
  const { opacity: pageOpacity = 1, ...sceneProps } = props;
  const fallback = useMotionValue(1);
  const opacity = isMotionValue(pageOpacity) ? pageOpacity : fallback;
  const [faded, setFaded] = useState(false);
  useMotionValueEvent(opacity, "change", (v) => setFaded(v < 0.02));

  if (!everActive) return null;
  const staticOpacity = isMotionValue(pageOpacity) ? undefined : pageOpacity;

  return (
    <motion.div aria-hidden={!active || undefined} className="pointer-events-none fixed inset-0 -z-10"
      initial={{ opacity: 0 }} animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
      <motion.div className="absolute inset-0" style={{ opacity: staticOpacity ?? opacity }}>
        <RoomScene className="absolute inset-0" {...sceneProps} fullscreen paused={!active || (isMotionValue(pageOpacity) && faded)} />
      </motion.div>
    </motion.div>
  );
}
