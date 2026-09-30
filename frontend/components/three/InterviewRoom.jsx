"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import Effects from "./Effects";
import { Chair, Desk, LAMP_HEAD, Lamp } from "./furniture";
import { ARIA_LIGHT, VERA_LIGHT, beamParams, poolParams, seededRandom } from "./materials";
import { concreteRoughness } from "./textures";

/**
 * The interview room: one scene for the whole site (Phase 7.2).
 *   landing: the empty chair alone under VERA's spotlight ("Take the seat"); scroll dollies the camera in.
 *   auth:    the same room, dimmer and closer.
 *   desk:    the chair has moved to the desk; ARIA's lamp is on; the dashboard's report sheets lie there.
 * Moving between presets eases the camera, the chair and the lights, so sign-in → dashboard reads as one move.
 * Everything is modelled in code (furniture.jsx) and textured in code (textures.js): no downloaded assets.
 *
 * Animated values live in refs and change only inside useFrame (three.js is imperative; React re-renders
 * would be far too slow for 60 fps), which also keeps renders pure for the React compiler's lint rules.
 */
export const PRESETS = {
  landing: { camera: [0, 1.5, 5.2], target: [0, 0.62, 0], chair: [0, 0, 0, -0.35], spot: 1, lamp: 0 },
  auth: { camera: [1.2, 1.25, 3.4], target: [0.1, 0.7, 0], chair: [0, 0, 0, -0.35], spot: 0.6, lamp: 0 },
  desk: { camera: [-3.1, 1.85, 1.35], target: [-4.12, 0.74, -0.52], chair: [-4.2, 0, 0.3, Math.PI], spot: 0.2, lamp: 1 },
};
// Where the desk stands: off to the left, out of the landing shot even on wide screens. DeskItems are
// placed relative to its centre.
export const DESK_POSITION = [-4.2, 0, -0.55];
export const DESK_TOP_Y = 0.76;
const LAMP_AIM = [0.08, DESK_TOP_Y, 0.08];

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

const valueOf = (v) => (v && typeof v.get === "function" ? v.get() : v || 0);
const damp = (current, target, k) => current + (target - current) * k;
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The desk, ARIA's lamp and its light. `onLights` receives { light, bulb, pool } for the room to animate. */
function DeskCorner({ onLights, children }) {
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
        decay={2} distance={3} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0003} shadow-normalBias={0.02} shadow-radius={5}
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
 *   children  rendered on the desk (DeskItems)
 */
const NO_FRAMING = { x: 0, y: 0, distance: 1 };

export default function InterviewRoom({ preset = "landing", progress = 0, lightOn = false, parallax = false,
  framing = NO_FRAMING, intro = false, children }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const small = useThree((s) => s.size.width < 640);

  const spot = useRef(null);
  const beam = useRef(null);
  const floorPool = useRef(null);
  const rim = useRef(null);
  const chair = useRef(null);
  const lamp = useRef(null); // { light, bulb, pool } from <DeskCorner>
  const strength = useRef(PRESETS[preset].spot); // the spotlight's current strength, shared with the dust
  const anim = useRef(null); // current eased values; starts at the first preset, so there's no fly-in
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const beamArgs = useMemo(() => beamParams(VERA_LIGHT, 0.1), []);
  const poolArgs = useMemo(() => poolParams(VERA_LIGHT, 0.16), []);
  const goal = useMemo(() => new THREE.Vector3(), []);
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

  useFrame((frame, delta) => {
    const p = PRESETS[preset];
    if (anim.current === null) {
      const start = shot(p, framing, 0); // start on the framed shot: no swoop on load
      anim.current = { cam: new THREE.Vector3(...start.cam), look: new THREE.Vector3(...start.look), chair: [...p.chair],
        spot: p.spot, lamp: p.lamp, rim: 0 };
    }
    const s = anim.current;
    const reduce = prefersReducedMotion();
    const k = reduce ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 2.4);
    const time = frame.clock.elapsedTime;

    // Camera: the preset, the landing dolly, pointer parallax, and a slow handheld drift.
    const t = preset === "landing" ? THREE.MathUtils.clamp(valueOf(progress), 0, 1) : 0;
    const px = parallax && !reduce ? frame.pointer.x * 0.22 : 0;
    const py = parallax && !reduce ? frame.pointer.y * 0.08 : 0;
    const drift = reduce ? 0 : 1;
    const view = shot(p, framing, t);
    goal.set(
      view.cam[0] + px + Math.sin(time * 0.13) * 0.06 * drift,
      view.cam[1] + py + Math.sin(time * 0.21) * 0.025 * drift,
      view.cam[2],
    );
    s.cam.lerp(goal, k);
    goal.set(...view.look);
    s.look.lerp(goal, k);
    frame.camera.position.copy(s.cam);
    frame.camera.lookAt(s.look);

    // The chair walks to the desk (or back).
    s.chair = s.chair.map((v, i) => damp(v, p.chair[i], k));
    chair.current.position.set(s.chair[0], s.chair[1], s.chair[2]);
    chair.current.rotation.y = s.chair[3];

    // Lights: VERA's spotlight, ARIA's lamp, the warm rim.
    s.spot = damp(s.spot, p.spot, k);
    const on = intro && !reduce ? introLevel(time) : 1; // multiplies the spotlight while it switches on
    s.lamp = damp(s.lamp, p.lamp, k);
    s.rim = damp(s.rim, lightOn ? 1 : 0, k);
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
  });

  return (
    <>
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
        shadow-mapSize={small ? [1024, 1024] : [2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.025} shadow-radius={6}
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
      <Dust count={small ? 70 : 180} strength={strength} />

      <pointLight ref={rim} position={[0, 0.9, -1.2]} color={ARIA_LIGHT} intensity={0} distance={4} decay={2} />

      <group ref={chair}>
        <Chair />
      </group>

      <DeskCorner onLights={onLights}>{children}</DeskCorner>

      <Effects />
    </>
  );
}
