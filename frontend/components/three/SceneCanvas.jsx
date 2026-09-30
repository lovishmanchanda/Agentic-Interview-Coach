"use client";

import { Canvas } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import RoomPoster from "./RoomPoster";

/**
 * The WebGL canvas every 3D scene renders into. It only draws while it can be seen:
 *   offscreen, the tab hidden, or `paused` -> no frames at all
 *   reduced motion                -> one still frame, redrawn only when the scene asks (frameloop "demand")
 *   otherwise                     -> every frame
 * Pixel ratio is capped at 1.5 (the scene is soft and dark; more pixels only cost battery). Without WebGL
 * the still poster shows instead.
 *
 * `fullscreen` (the site-wide SceneHost): the canvas sits behind the page and never receives events itself,
 * so pointer events are read from the whole document instead (`eventSource`), in client coordinates.
 */
export default function SceneCanvas({ children, className = "", label, paused = false, fullscreen = false }) {
  const wrap = useRef(null);
  const reduce = useReducedMotion();
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const node = wrap.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin: "100px" });
    observer.observe(node);
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const frameloop = paused || !onScreen || !tabVisible ? "never" : reduce ? "demand" : "always";
  const events = fullscreen && typeof document !== "undefined" ? { eventSource: document.body, eventPrefix: "client" } : {};

  return (
    <div ref={wrap} className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <Canvas
        frameloop={frameloop}
        dpr={[1, 1.5]}
        shadows="percentage"
        flat // untone-mapped: tone mapping happens in the post-processing pass (Effects.jsx)
        camera={{ fov: 32, near: 0.1, far: 60, position: [0, 1.55, 5.4] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        fallback={<RoomPoster className="size-full" />}
        {...events}
      >
        {children}
      </Canvas>
    </div>
  );
}
