"use client";

import { useFrame } from "@react-three/fiber";
import { useContext, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { STAND, applyPose, blendPose, buildFigure, figureMaterials, placeFigure, seatedPose, sitPose, smoothstep, walkPose } from "./figure";
import { RoomFocus } from "./roomFocus";
import { busy, isTouchOnly, prefersReducedMotion } from "./pace";

/**
 * You, in the room: the figure that takes the seat once you're signed in. It lives inside the chair's group,
 * so once seated it goes wherever the chair goes (to the desk, to the interview table).
 *
 * The first time it appears in a browser tab it walks in from the dark, turns, and sits down; after that (a
 * reload, another page) it is simply there, seated. Under reduced motion it is always just seated.
 * While it walks in, `pullRef.current` is 1: the room pulls the chair out from the desk so there is room to
 * sit, then slides it back in.
 *
 * Seated, you're alive: you breathe, glance about, look at whatever the pointer is over on the desk (RoomFocus)
 * and lean in to the next-step card; at the desk you go back to reading your reports now and then.
 *
 *   present   show the figure at all (signed in, or the landing page's story)
 *   walkIn    false: appear already seated, and don't use up the tab's walk-in (the landing story's stand-in)
 *   variant   "lap" (hands on the thighs) | "table" (forearms on the interview table) | "desk" (at your desk, reading)
 *   readAt    world point of the reports on the desk (where you read)
 *   nextAt    world point of the next-step card: on touch screens (nothing to hover) you glance at it and lean
 *             in as part of the reading routine, so the lamp-lit card still draws the eye
 *   attendAt  world point to look at and lean towards regardless of the pointer (the landing story), or null
 *   replay    change it to play the walk-in again (the /design page)
 */
const TONE = "#a69887"; // warm sand: you, the warm one among the cool-grey interviewers
const SEATED_KEY = "aic-seated"; // sessionStorage: the walk-in already played in this tab

const START = 2.4; // metres to the chair's side (chair-local +x) where the walk begins, in the dark
const FOOT_Z = 0.37; // where you stand to sit: just in front of the seat
const WALK_SECONDS = 2.3;
const TURN_SECONDS = 0.75;
const SIT_SECONDS = 1.4;
const PULL_BACK_SECONDS = 0.9; // sliding the chair back in once seated
const STEP = 0.68; // metres per step (half a gait cycle)
const HEAD = new THREE.Vector3(0, 1.22, -0.02); // roughly where the eyes are when seated (figure-local)
const READ_CYCLE = 11; // seconds: read the reports for a while, then look up

function playedThisTab() {
  try {
    return window.sessionStorage.getItem(SEATED_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberPlayed(played) {
  try {
    if (played) window.sessionStorage.setItem(SEATED_KEY, "1");
    else window.sessionStorage.removeItem(SEATED_KEY);
  } catch {
    // storage blocked: the walk-in may just play again
  }
}

/** Distance covered after `u` (0..1) of the walk: full speed from the dark, slowing for the last stretch. */
const walkCurve = (u) => (u < 0.7 ? u / 0.85 : 0.7 / 0.85 + (1 - 0.7 / 0.85) * (1 - (1 - (u - 0.7) / 0.3) ** 2));
const ease = (current, target, dt, rate) => current + (target - current) * (1 - Math.exp(-dt * rate));

export default function Candidate({ present, walkIn = true, variant = "lap", readAt = null, nextAt = null, attendAt = null,
  pullRef, replay = 0 }) {
  const materials = useMemo(() => figureMaterials(TONE), []);
  const figure = useMemo(() => buildFigure(materials), [materials]);
  const focus = useContext(RoomFocus);
  const local = useMemo(() => new THREE.Vector3(), []);
  // phase: "away" | "walk" | "turn" | "sit" | "seated"; t: seconds into the phase; gait: walk-cycle phase;
  // mix: lap (0) → table (1); yaw/pitch/lean: where you're looking and how far you lean in (eased)
  const state = useRef({ phase: "away", t: 0, gait: 0, mix: variant === "lap" ? 0 : 1, pull: 0, seen: null, yaw: 0, pitch: 0, lean: 0 });

  useEffect(() => () => {
    materials.body.dispose();
    materials.joint.dispose();
  }, [materials]);

  /** Head turn and tilt (radians, figure-local) to look at a world point. */
  function aim(point) {
    local.copy(point);
    figure.root.worldToLocal(local).sub(HEAD);
    const flat = Math.hypot(local.x, local.z);
    return { yaw: THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.1, 1.1),
      pitch: THREE.MathUtils.clamp(Math.atan2(-local.y, flat), -0.3, 0.75) };
  }

  useFrame((frame, delta) => {
    const s = state.current;
    const dt = Math.min(delta, 0.1);
    const still = prefersReducedMotion();

    // Arrive or leave. `seen` remembers what we last reacted to (presence, walk-in and the replay counter).
    const key = `${present}:${walkIn}:${replay}`;
    if (s.seen !== key) {
      const replayed = s.seen !== null && s.seen.split(":")[2] !== String(replay);
      const wasPresent = s.phase !== "away";
      s.seen = key;
      if (!present) {
        s.phase = "away";
        if (!replayed && walkIn) rememberPlayed(false); // signed out: the next sign-in walks in again
      } else if (wasPresent && !replayed) {
        // still here (only walkIn changed): carry on as you are
      } else if (still || !walkIn || (!replayed && playedThisTab())) {
        s.phase = "seated";
        s.pull = 0;
      } else {
        rememberPlayed(true);
        Object.assign(s, { phase: "walk", t: 0, gait: 0, pull: 1, x: START });
      }
    }
    if (s.phase === "away") {
      placeFigure(figure, 0, 0, 0, false);
      if (pullRef) pullRef.current = 0;
      return;
    }

    s.t += dt;
    const time = frame.clock.elapsedTime;
    let pose;

    if (s.phase === "walk") {
      const u = Math.min(1, s.t / WALK_SECONDS);
      const x = START * (1 - walkCurve(u));
      s.gait += (Math.abs(s.x - x) / STEP) * Math.PI;
      s.x = x;
      placeFigure(figure, x, FOOT_Z, -Math.PI / 2); // facing along -x, towards the chair
      pose = walkPose(s.gait, u < 0.7 ? 1 : 1 - 0.85 * smoothstep((u - 0.7) / 0.3));
      if (u >= 1) Object.assign(s, { phase: "turn", t: 0 });
    } else if (s.phase === "turn") {
      // Turn your back to the seat with two small steps.
      const u = Math.min(1, s.t / TURN_SECONDS);
      placeFigure(figure, 0, FOOT_Z, -Math.PI / 2 * (1 - smoothstep(u)));
      pose = walkPose(u * Math.PI * 2, 0.22 * Math.sin(Math.PI * u));
      if (u >= 1) Object.assign(s, { phase: "sit", t: 0 });
    } else if (s.phase === "sit") {
      const u = Math.min(1, s.t / SIT_SECONDS);
      placeFigure(figure, 0, 0, 0);
      pose = sitPose(smoothstep(u));
      if (u >= 1) Object.assign(s, { phase: "seated", t: 0 });
    }

    if (s.phase === "seated") {
      placeFigure(figure, 0, 0, 0);
      s.mix = ease(s.mix, variant === "lap" ? 0 : 1, dt, 3);
      s.pull = Math.max(0, s.pull - dt / PULL_BACK_SECONDS);
      pose = blendPose(seatedPose("lap"), seatedPose("table"), s.mix);

      // Where to look: what the pointer is over, what the page points at, your reports now and then, or ahead.
      const hovered = focus?.current?.point ?? null;
      // Touch screens: the routine also glances at the next-step card (what a hover would have done).
      const cycle = time % READ_CYCLE;
      const glance = !hovered && !attendAt && variant === "desk" && nextAt && isTouchOnly() && !still && cycle >= READ_CYCLE * 0.62
        && cycle < READ_CYCLE * 0.85;
      const target = hovered ?? attendAt ?? (glance ? nextAt : null);
      const reading = !target && variant === "desk" && readAt && !still && cycle < READ_CYCLE * 0.55;
      const look = target ? aim(target) : reading ? aim(readAt) : { yaw: 0, pitch: variant === "desk" ? 0.12 : 0 };
      const leanTo = (hovered ? focus.current.lean : Boolean(attendAt) || glance) ? 1 : 0;
      s.moving = Math.abs(s.yaw - look.yaw) + Math.abs(s.pitch - look.pitch) > 0.01 || Math.abs(s.mix - (variant === "lap" ? 0 : 1)) > 0.01;
      s.yaw = still ? look.yaw : ease(s.yaw, look.yaw, dt, 4);
      s.pitch = still ? look.pitch : ease(s.pitch, look.pitch, dt, 4);
      s.lean = still ? leanTo : ease(s.lean, leanTo, dt, 3);

      pose.headY = s.yaw * 0.75;
      pose.headX = (pose.headX ?? 0) + s.pitch * 0.65;
      pose.neck = (pose.neck ?? 0) + s.pitch * 0.3;
      pose.spine = (pose.spine ?? 0) + s.lean * 0.2;
      if (!still) {
        pose.breath = 0.018 * Math.sin(time * 1.6);
        if (!target && !reading) pose.headY += 0.1 * Math.sin(time * 0.21) * (1 - s.mix);
      }
    }

    applyPose(figure, pose ?? STAND);
    if (pullRef) pullRef.current = smoothstep(s.pull);
    if (s.phase !== "seated" || s.pull > 0 || Math.abs(s.lean - Math.round(s.lean)) > 0.01 || s.moving) busy();
  });

  return <primitive object={figure.root} />;
}

// ── The ghost: a preview of you ─────────────────────────────────────────────────────────────────────────
/**
 * A faint glowing silhouette seated in the empty chair: shown on the landing page while the pointer is on
 * "Take the seat" (signed out). An additive rim-light shader, so only the figure's edges glow, warm orange.
 */
function ghostMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color("#ff8a3d") } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        gl_FragColor = vec4(uColor * (0.25 + 1.6 * rim), (0.06 + 0.9 * rim) * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

const setGhostOpacity = (material, value) => {
  material.uniforms.uOpacity.value = value; // a three.js uniform, set every frame
};

// On touch screens there's no hover: the ghost appears once by itself, a moment after the spotlight comes on.
const INVITE_FROM = 2.6;
const INVITE_TO = 6.2;

export function Ghost({ show, invite = false }) {
  const material = useMemo(() => ghostMaterial(), []);
  const figure = useMemo(() => buildFigure({ body: material, joint: material }, { shadows: false }), [material]);
  const level = useRef(0);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((frame, delta) => {
    const still = prefersReducedMotion();
    const t = frame.clock.elapsedTime;
    const on = show || (invite && isTouchOnly() && !still && t > INVITE_FROM && t < INVITE_TO);
    level.current = still ? (on ? 1 : 0) : ease(level.current, on ? 1 : 0, Math.min(delta, 0.1), 3.5);
    if (Math.abs(level.current - (on ? 1 : 0)) > 0.01) busy();
    if (level.current < 0.01) {
      placeFigure(figure, 0, 0, 0, false); // hidden: nothing else to do
      return;
    }
    const shimmer = still ? 1 : 0.85 + 0.15 * Math.sin(frame.clock.elapsedTime * 2.3);
    setGhostOpacity(material, 0.55 * level.current * shimmer);
    placeFigure(figure, 0, 0, 0, level.current > 0.01);
    const pose = seatedPose("lap");
    if (!still) pose.breath = 0.02 * Math.sin(frame.clock.elapsedTime * 1.6);
    applyPose(figure, pose);
  });

  return <primitive object={figure.root} />;
}
