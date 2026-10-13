"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { useAuthStore } from "@/store/authStore";

import Candidate, { Ghost } from "./Candidate";
import Effects from "./Effects";
import { Chair, Desk, LAMP_HEAD, Lamp } from "./furniture";
import InterviewSet, { TABLE_GAP } from "./InterviewSet";
import { ARIA_LIGHT, VERA_LIGHT, beamParams, poolParams, seededRandom, shadowsWhileLit } from "./materials";
import { busy, prefersReducedMotion, setDprCeiling, shadowFrame } from "./pace";
import { QUALITY, applyQuality, detectQuality } from "./quality";
import { RoomFocus } from "./roomFocus";
import { concreteRoughness } from "./textures";

/**
 * The interview room: one scene for the whole site (Phase 7.2).
 *   landing: the empty chair alone under VERA's spotlight ("Take the seat"); scroll dollies the camera in.
 *   auth:    the same room, dimmer and closer.
 *   desk:    the chair has moved to the desk; ARIA's lamp is on; the dashboard's report sheets lie there.
 *   interview / interviewPush: the interview table (InterviewSet), two interviewers across it; your chair is
 *            brought to the near side while VERA prepares the first question, then the camera pushes in.
 *   notes / deskReport / deskLamp: the landing page's story — an interviewer taking notes on your answer, your
 *            report landing on the desk, ARIA's lamp lighting what to do next.
 * Moving between presets eases the camera, the chair and the lights, so sign-in → dashboard reads as one move.
 * Once you're signed in, you're in the room too (Candidate): you walk in and take the seat, and ride the chair.
 * Everything is modelled in code (furniture.jsx) and textured in code (textures.js): no downloaded assets.
 *
 * Animated values live in refs and change only inside useFrame (three.js is imperative; React re-renders
 * would be far too slow for 60 fps), which also keeps renders pure for the React compiler's lint rules.
 */
// Where the interview table stands: off to the right, out of every other shot.
export const INTERVIEW_POSITION = [5.6, 0, -1.2];
const [IX, , IZ] = INTERVIEW_POSITION;
const INTERVIEW_CHAIR = [IX, 0, IZ + TABLE_GAP, Math.PI];
// Your chair at the desk: on the lamp's side, close enough to work at it.
const DESK_CHAIR = [-4.55, 0, 0.12, Math.PI];

// camera/target: the shot; chair: where your chair stands [x, y, z, yaw]; spot/lamp/set: how lit VERA's
// spotlight, ARIA's lamp and the interview set are; pull: how far the chair is pulled out while you sit down
// (only at a desk or table); speed: how quickly the camera eases (the trip to the interview set is longer).
export const PRESETS = {
  landing: { camera: [0, 1.5, 5.2], target: [0, 0.62, 0], chair: [0, 0, 0, -0.35], spot: 1, lamp: 0, set: 0, pull: 0 },
  auth: { camera: [1.2, 1.25, 3.4], target: [0.1, 0.7, 0], chair: [0, 0, 0, -0.35], spot: 0.6, lamp: 0, set: 0, pull: 0 },
  desk: { camera: [-1.9, 2.15, 2.7], target: [-4.35, 0.8, -0.3], chair: DESK_CHAIR, spot: 0.2, lamp: 1, set: 0, pull: 0.55 },
  deskReport: { camera: [-2.3, 1.95, 2.3], target: [-4.15, 0.8, -0.45], chair: DESK_CHAIR, spot: 0.1, lamp: 0.3, set: 0,
    pull: 0.55 },
  deskLamp: { camera: [-3.05, 1.55, 1.2], target: [-4.3, 0.86, -0.4], chair: DESK_CHAIR, spot: 0.05, lamp: 1, set: 0,
    pull: 0.55, speed: 1.2 },
  interview: { camera: [IX + 1.35, 1.62, IZ + 3.05], target: [IX - 0.1, 0.92, IZ - 0.45], chair: INTERVIEW_CHAIR,
    spot: 0.08, lamp: 0, set: 1, pull: 0.55, speed: 0.7 },
  interviewPush: { camera: [IX + 0.58, 1.32, IZ + 1.05], target: [IX - 0.12, 1.0, IZ - 0.75], chair: INTERVIEW_CHAIR,
    spot: 0.05, lamp: 0, set: 1, pull: 0.55, speed: 1.1 },
  notes: { camera: [IX - 3.4, 1.9, IZ + 1.9], target: [IX - 0.3, 0.9, IZ + 0.1], chair: INTERVIEW_CHAIR,
    spot: 0.05, lamp: 0, set: 1, pull: 0.55, speed: 1.1 },
};
// Where the desk stands: off to the left, out of the landing shot even on wide screens. DeskItems are
// placed relative to its centre.
export const DESK_POSITION = [-4.2, 0, -0.55];
export const DESK_TOP_Y = 0.76;
const LAMP_AIM = [0.08, DESK_TOP_Y, 0.08];
// Where your reports lie and where the next-step card is (world space): what you read, and lean towards.
const REPORTS_AT = new THREE.Vector3(DESK_POSITION[0] + 0.28, DESK_TOP_Y, DESK_POSITION[2] + 0.05);
const NEXT_STEP_AT = new THREE.Vector3(DESK_POSITION[0] - 0.12, DESK_TOP_Y, DESK_POSITION[2] + 0.1);

const SPOT_HEIGHT = 5.2;
const SPOT_ANGLE = 0.3;
const BEAM_RADIUS = Math.tan(SPOT_ANGLE) * SPOT_HEIGHT;

// The spotlight switching on, like a stage light: dark, two stutters, then on. [seconds, level] steps.
const FLICKER = [[0, 0], [0.55, 0.85], [0.62, 0.05], [0.74, 0.6], [0.8, 0.12], [0.95, 1]];
function introLevel(t) {
  let level = 0;
  for (const [at, value] of FLICKER) if (t >= at) level = value;
  return level;
}

/** Where the camera stands and looks for a preset, framing and landing-dolly progress t (0..1). */
function shot(p, framing, t) {
  const { x: fx = 0, y: fy = 0, distance = 1 } = framing;
  // Camera = target + (preset offset × distance), so "distance" pulls back along the same line of sight.
  return {
    cam: [
      p.target[0] + (p.camera[0] - p.target[0]) * distance + fx,
      p.target[1] + (p.camera[1] - p.target[1]) * distance + fy - t * 0.4,
      p.target[2] + (p.camera[2] - p.target[2]) * distance - t * 2.2 * distance,
    ],
    look: [p.target[0] + fx, p.target[1] + fy - t * 0.04, p.target[2]],
  };
}

/** The chair's trip between two places: a smooth start and stop, longer for longer trips. */
const chairSeconds = (from, to) => Math.min(2.6, 0.7 + Math.hypot(to[0] - from[0], to[2] - from[2]) * 0.2);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from)); // the short way round

const valueOf = (v) => (v && typeof v.get === "function" ? v.get() : v || 0);
const damp = (current, target, k) => current + (target - current) * k;

/** The desk, ARIA's lamp and its light. `onLights` receives { light, bulb, pool } for the room to animate. */
function DeskCorner({ onLights, shadows = true, children }) {
  const lamp = useRef(null);
  const bulb = useRef(null);
  const pool = useRef(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const poolArgs = useMemo(() => poolParams(ARIA_LIGHT, 0), []);
  const head = [LAMP_HEAD[0], DESK_TOP_Y + LAMP_HEAD[1] - 0.02, LAMP_HEAD[2]];

  useEffect(() => {
    onLights({ light: lamp.current, bulb: bulb.current, pool: pool.current });
  }, [onLights]);

  return (
    <group position={DESK_POSITION}>
      <Desk topY={DESK_TOP_Y} />
      <Lamp topY={DESK_TOP_Y} aim={LAMP_AIM} bulbRef={bulb} />
      <spotLight ref={lamp} target={target} position={head} color={ARIA_LIGHT} intensity={0} angle={0.8} penumbra={0.9}
        decay={2} distance={3} castShadow={shadows} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0003} shadow-normalBias={0.02} shadow-radius={5}
        shadow-blurSamples={12} />
      <primitive object={target} position={LAMP_AIM} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LAMP_AIM[0], DESK_TOP_Y + 0.001, LAMP_AIM[2]]}>
        <circleGeometry args={[0.6, 48]} />
        <shaderMaterial ref={pool} args={[poolArgs]} />
      </mesh>
      {children}
    </group>
  );
}

/** Where each dust mote starts and how fast it drifts: fixed by a seed, so every load looks the same. */
function dustField(count) {
  const random = seededRandom(7);
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const y = random() * (SPOT_HEIGHT - 0.4);
    const radius = Math.tan(SPOT_ANGLE) * (SPOT_HEIGHT - y) * 0.85 * Math.sqrt(random());
    const a = random() * Math.PI * 2;
    positions.set([Math.cos(a) * radius, y, Math.sin(a) * radius], i * 3);
    speeds[i] = 0.02 + random() * 0.05;
  }
  return { positions, speeds };
}

/** Dust drifting in the spotlight: what makes the beam read as light in a real room. */
function Dust({ count, strength }) {
  const points = useRef(null);
  const material = useRef(null);
  const field = useMemo(() => dustField(count), [count]);

  useFrame((_, delta) => {
    if (!points.current || !material.current) return;
    material.current.opacity = 0.7 * strength.current;
    if (prefersReducedMotion()) return;
    const attr = points.current.geometry.attributes.position;
    for (let i = 0; i < count; i += 1) {
      let y = attr.array[i * 3 + 1] + field.speeds[i] * delta;
      if (y > SPOT_HEIGHT - 0.4) y = 0.05;
      attr.array[i * 3 + 1] = y;
      attr.array[i * 3] += Math.sin(y * 3 + i) * 0.0006;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[field.positions.slice(), 3]} />
      </bufferGeometry>
      <pointsMaterial ref={material} color={VERA_LIGHT} size={0.011} transparent opacity={0.7} depthWrite={false}
        blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/**
 * The scene contents. Props:
 *   preset    "landing" | "auth" | "desk"
 *   progress  0..1 (number or motion value): the landing scroll story's camera dolly
 *   lightOn   warms an orange rim light behind the chair (the landing CTA's hover)
 *   parallax  the camera follows the pointer a little
 *   intro     the spotlight flickers on when the scene first appears (the landing hero)
 *   framing   { x, y, distance }: slide the shot sideways (x = -0.6 puts the chair right of centre, leaving room for
 *             a headline), aim lower (y < 0 raises the chair in frame) and pull back (distance > 1)
 *   occupied  you're in the room (defaults to: signed in); replay restarts your walk-in (the /design page)
 *   walkIn    false: if you're shown, you're already seated (the landing story's stand-in for you)
 *   attend    "next": you look at (and lean towards) the next-step card under the lamp
 *   children  rendered on the desk (DeskItems)
 */
const NO_FRAMING = { x: 0, y: 0, distance: 1 };

export default function InterviewRoom({ preset = "landing", progress = 0, lightOn = false, parallax = false,
  framing = NO_FRAMING, intro = false, occupied, walkIn = true, attend = null, replay = 0, children }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const small = useThree((s) => s.size.width < 640);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  // What this device's GPU can comfortably draw (quality.js), decided before the first frame.
  const quality = useMemo(() => QUALITY[detectQuality(gl)], [gl]);
  useLayoutEffect(() => {
    applyQuality(gl, quality, THREE);
    setDprCeiling(quality.maxDpr);
  }, [gl, quality]);

  const spot = useRef(null);
  const beam = useRef(null);
  const floorPool = useRef(null);
  const rim = useRef(null);
  const chair = useRef(null);
  const lamp = useRef(null); // { light, bulb, pool } from <DeskCorner>
  const pull = useRef(0); // 0..1 from <Candidate>: the chair is pulled out while you sit down
  const focus = useRef({ point: null, lean: false }); // what the pointer is over on the desk (RoomFocus)
  const setLevel = useRef(PRESETS[preset].set); // how lit the interview set is, shared with <InterviewSet>
  const signedIn = useAuthStore((st) => st.hasHydrated && Boolean(st.user));
  const present = occupied ?? signedIn;
  const strength = useRef(PRESETS[preset].spot); // the spotlight's current strength, shared with the dust
  const anim = useRef(null); // current eased values; starts at the first preset, so there's no fly-in
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const beamArgs = useMemo(() => beamParams(VERA_LIGHT, 0.1), []);
  const poolArgs = useMemo(() => poolParams(VERA_LIGHT, 0.16), []);
  const goal = useMemo(() => new THREE.Vector3(), []);
  const shadowCount = useRef({ n: 0 });
  // Reflections come from three's procedural studio room (no HDR download), kept faint per material.
  const environment = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return texture;
  }, [gl]);
  const floorRoughness = useMemo(() => concreteRoughness(), []);
  const onLights = useCallback((lights) => {
    lamp.current = lights;
  }, []);

  useEffect(() => invalidate(), [preset, lightOn, invalidate]); // redraw once under the "demand" frameloop
  // Compile every shader now, while everything is still visible (before the first frame hides the interview set
  // and the ghost), so nothing stutters the first time it appears.
  useEffect(() => {
    gl.compileAsync?.(scene, camera).catch(() => {});
  }, [gl, scene, camera]);

  useFrame((frame, delta) => {
    const p = PRESETS[preset];
    if (anim.current === null) {
      const start = shot(p, framing, 0); // start on the framed shot: no swoop on load
      anim.current = { cam: new THREE.Vector3(...start.cam), look: new THREE.Vector3(...start.look),
        base: new THREE.Vector3(...start.cam), chair: [...p.chair],
        trip: null, spot: p.spot, lamp: p.lamp, rim: 0, set: p.set, pull: p.pull };
    }
    const s = anim.current;
    const reduce = prefersReducedMotion();
    const dt = Math.min(delta, 0.1);
    const k = reduce ? 1 : 1 - Math.exp(-dt * 2.4 * (p.speed ?? 1));
    const kLights = reduce ? 1 : 1 - Math.exp(-dt * 2.4);
    const time = frame.clock.elapsedTime;

    // Camera: the preset, the landing dolly, pointer parallax, and a slow handheld drift.
    const t = preset === "landing" ? THREE.MathUtils.clamp(valueOf(progress), 0, 1) : 0;
    const px = parallax && !reduce ? frame.pointer.x * 0.22 : 0;
    const py = parallax && !reduce ? frame.pointer.y * 0.08 : 0;
    const drift = reduce ? 0 : 1;
    const view = shot(p, framing, t);
    // Has the shot itself arrived? (Judged without the handheld drift and parallax, which never settle.)
    goal.set(...view.cam);
    const moving = s.base.distanceToSquared(goal) > 1e-5;
    s.base.lerp(goal, k);
    goal.set(
      view.cam[0] + px + Math.sin(time * 0.13) * 0.06 * drift,
      view.cam[1] + py + Math.sin(time * 0.21) * 0.025 * drift,
      view.cam[2],
    );
    s.cam.lerp(goal, k);
    goal.set(...view.look);
    const turning = s.look.distanceToSquared(goal) > 1e-5;
    s.look.lerp(goal, k);
    frame.camera.position.copy(s.cam);
    frame.camera.lookAt(s.look);

    // The chair (with you in it, once you're signed in) travels to the desk, the interview table or back:
    // a timed trip with a soft start and stop. A new destination mid-trip starts a new trip from where it is.
    const destination = p.chair;
    if (!s.trip || s.trip.to !== destination) {
      const from = [...s.chair];
      from[3] = destination[3] - angleDelta(from[3], destination[3]);
      s.trip = { from, to: destination, t: 0, seconds: chairSeconds(from, destination) };
    }
    s.trip.t = reduce ? s.trip.seconds : Math.min(s.trip.seconds, s.trip.t + dt);
    const e = easeInOut(s.trip.t / s.trip.seconds);
    s.chair = s.trip.from.map((v, i) => v + (s.trip.to[i] - v) * e);
    // Pulled out from the desk or table (backwards along the chair's own facing) while you sit down.
    s.pull = damp(s.pull, p.pull, kLights);
    const out = pull.current * s.pull;
    chair.current.position.set(s.chair[0] - Math.sin(s.chair[3]) * out, s.chair[1], s.chair[2] - Math.cos(s.chair[3]) * out);
    chair.current.rotation.y = s.chair[3];

    // Lights: VERA's spotlight, ARIA's lamp, the warm rim.
    s.spot = damp(s.spot, p.spot, kLights);
    // multiplies the spotlight while it switches on; then it breathes, very slightly, like a real stage light
    const on = (intro && !reduce ? introLevel(time) : 1) * (reduce ? 1 : 1 + 0.045 * Math.sin(time * 0.8));
    s.lamp = damp(s.lamp, p.lamp, kLights);
    s.rim = damp(s.rim, lightOn ? 1 : 0, kLights);
    s.set = damp(s.set, p.set, kLights * 0.8);
    setLevel.current = s.set;
    strength.current = s.spot * on;
    spot.current.intensity = 62 * s.spot * on;
    beam.current.uniforms.uOpacity.value = 0.1 * s.spot * on;
    beam.current.uniforms.uTime.value = time;
    floorPool.current.uniforms.uOpacity.value = 0.1 * s.spot * on;
    rim.current.intensity = 6 * s.rim;
    if (lamp.current) {
      lamp.current.light.intensity = 2 * s.lamp;
      lamp.current.bulb.emissiveIntensity = 6 * s.lamp;
      lamp.current.pool.uniforms.uOpacity.value = 0.05 * s.lamp;
    }
    const fresh = shadowFrame(shadowCount.current);
    if (lamp.current) shadowsWhileLit(lamp.current.light, s.lamp > 0.002, fresh);
    shadowsWhileLit(spot.current, s.spot * on > 0.002, fresh);

    // Full frame rate while the shot is still changing (camera, chair trip, lights easing, the intro flicker).
    const easing = Math.abs(s.spot - p.spot) + Math.abs(s.lamp - p.lamp) + Math.abs(s.set - p.set) + Math.abs(s.rim - (lightOn ? 1 : 0));
    if (moving || turning || s.trip.t < s.trip.seconds || easing > 0.004 || (intro && time < 1.2)) busy();
  });

  const desky = preset.startsWith("desk");
  return (
    <RoomFocus.Provider value={focus}>
      <color attach="background" args={["#0a0a0b"]} />
      <fog attach="fog" args={["#0a0a0b", 4.5, 13]} />
      <primitive object={environment} attach="environment" />
      <hemisphereLight args={["#9aa3b5", "#000000", 0.03]} />
      {/* A faint cool fill from the viewer's side, so the chair's front never goes fully black */}
      <directionalLight position={[2, 3, 6]} color="#9aa3b5" intensity={0.18} />

      {/* Polished concrete: speckle and blotches in the roughness catch the spotlight */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0f0f11" roughness={1} roughnessMap={floorRoughness} metalness={0}
          envMapIntensity={0} />
      </mesh>

      {/* VERA: the spotlight over the chair, its visible beam, the pool on the floor and the dust */}
      <spotLight ref={spot} target={spotTarget} position={[0, SPOT_HEIGHT, 0.001]} color={VERA_LIGHT} intensity={62}
        angle={SPOT_ANGLE} penumbra={0.5} decay={2} distance={0} castShadow
        shadow-mapSize={small ? [1024, 1024] : [quality.spotShadow, quality.spotShadow]} shadow-bias={-0.0002} shadow-normalBias={0.025} shadow-radius={6}
        shadow-blurSamples={16} />
      <primitive object={spotTarget} position={[0, 0, 0]} />
      <mesh position={[0, SPOT_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.04, BEAM_RADIUS, SPOT_HEIGHT, 64, 1, true]} />
        <shaderMaterial ref={beam} args={[beamArgs]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[BEAM_RADIUS * 1.1, 64]} />
        <shaderMaterial ref={floorPool} args={[poolArgs]} />
      </mesh>
      <Dust count={Math.min(small ? 70 : 180, quality.dust)} strength={strength} />

      <pointLight ref={rim} position={[0, 0.9, -1.2]} color={ARIA_LIGHT} intensity={0} distance={4} decay={2} />

      <group ref={chair}>
        <Chair />
        <Candidate present={present} walkIn={walkIn} variant={desky ? "desk" : PRESETS[preset].set ? "table" : "lap"}
          readAt={REPORTS_AT} nextAt={NEXT_STEP_AT} attendAt={attend === "next" ? NEXT_STEP_AT : null} pullRef={pull} replay={replay} />
        <Ghost show={lightOn && !present && preset === "landing"} invite={intro && !present && preset === "landing"} />
      </group>

      <DeskCorner onLights={onLights} shadows={quality.lampShadows}>{children}</DeskCorner>
      <InterviewSet position={INTERVIEW_POSITION} levelRef={setLevel} shadows={quality.lampShadows}
        mode={preset === "interviewPush" ? "push" : preset === "notes" ? "notes" : null} />

      {quality.effects && <Effects multisampling={quality.multisampling} />}
    </RoomFocus.Provider>
  );
}
