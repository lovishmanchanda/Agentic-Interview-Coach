"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { applyPose, blendPose, buildFigure, figureMaterials, seatedPose, smoothstep } from "./figure";
import { Chair, Desk, FURNITURE, deskMaterial } from "./furniture";
import { seededRandom, shadowsWhileLit } from "./materials";
import { busy, prefersReducedMotion, shadowFrame } from "./pace";

/**
 * The interview set (Phase 8): the corner of the room where interviews happen, shown while VERA prepares your
 * first question. A walnut table under a pendant lamp; across it, two interviewers (the same sculpted figures as
 * you, in cool greys) — one taking notes, one watching and nodding; behind them a slatted wood wall, a window
 * with its blinds lit by the city at night, a floor lamp and a plant. Your chair is brought to the near side
 * of the table (InterviewRoom moves it; the set only leaves room for it at z = +TABLE_GAP).
 *
 * Positions are relative to the table's centre on the floor; the interviewers sit at -z, facing +z.
 *   levelRef  0..1: how far the set is lit (the room eases it in when the shot comes here)
 *   mode      "push": the camera is pushing in for the first question, both interviewers look up at you;
 *             "notes": the writer keeps writing (the landing story's "every answer is scored")
 */
export const TABLE_TOP_Y = 0.74;
export const TABLE_SIZE = [1.75, 0.045, 0.9];
export const TABLE_GAP = 0.74; // table centre → each chair
const PANEL = [{ x: -0.42, tone: "#5f6068", role: "writer" }, { x: 0.42, tone: "#757069", role: "watcher" }];
const PENDANT_Y = 1.95;
const WALL_Z = -2.05;


// ── Decor ────────────────────────────────────────────────────────────────────────────────────────────────
const DECOR = {
  wall: new THREE.MeshStandardMaterial({ color: "#121214", roughness: 0.95, envMapIntensity: 0, transparent: true }),
  felt: new THREE.MeshStandardMaterial({ color: "#0b0b0c", roughness: 1, envMapIntensity: 0 }),
  rug: new THREE.MeshStandardMaterial({ color: "#1b1a19", roughness: 1, envMapIntensity: 0 }),
  rugEdge: new THREE.MeshStandardMaterial({ color: "#2a2826", roughness: 1, envMapIntensity: 0 }),
  frame: new THREE.MeshStandardMaterial({ color: "#1c1c20", metalness: 0.6, roughness: 0.4, envMapIntensity: 0.2 }),
  slat: new THREE.MeshStandardMaterial({ color: "#2a2a2e", roughness: 0.6, envMapIntensity: 0.05 }),
  ceramic: new THREE.MeshStandardMaterial({ color: "#1e1e22", roughness: 0.45, metalness: 0.05, envMapIntensity: 0.25 }),
  leaf: new THREE.MeshStandardMaterial({ color: "#2c3a2e", roughness: 0.6, envMapIntensity: 0.1, side: THREE.DoubleSide }),
  paper: new THREE.MeshStandardMaterial({ color: "#b3aea5", roughness: 0.9, envMapIntensity: 0.03 }),
  pen: new THREE.MeshStandardMaterial({ color: "#151517", metalness: 0.4, roughness: 0.35 }),
  glass: new THREE.MeshPhysicalMaterial({ color: "#c9d3e0", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22,
    envMapIntensity: 0.8, depthWrite: false }),
  water: new THREE.MeshPhysicalMaterial({ color: "#7c93b5", roughness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
};

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
/** An alpha map that is opaque in the middle and fades to nothing at every edge: walls that melt into the dark. */
function fadeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const across = ctx.createLinearGradient(0, 0, 256, 0);
  across.addColorStop(0, "#000");
  across.addColorStop(0.22, "#fff");
  across.addColorStop(0.78, "#fff");
  across.addColorStop(1, "#000");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, 256, 128);
  ctx.globalCompositeOperation = "multiply";
  const up = ctx.createLinearGradient(0, 0, 0, 128);
  up.addColorStop(0, "#000");
  up.addColorStop(0.35, "#fff");
  ctx.fillStyle = up;
  ctx.fillRect(0, 0, 256, 128);
  return new THREE.CanvasTexture(canvas);
}
const lathe = (profile, segments = 40) => new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segments);

/** A slatted acoustic wall: vertical walnut slats on black felt, behind the interviewers. */
function SlatWall() {
  const mesh = useRef(null);
  const count = 34;
  const geo = useMemo(() => new RoundedBoxGeometry(0.042, 2.55, 0.035, 2, 0.008), []);
  useEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      m.makeTranslation(-1.27 + i * 0.077, 1.4, WALL_Z + 0.04);
      mesh.current.setMatrixAt(i, m);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <mesh position={[0, 1.4, WALL_Z + 0.012]} material={DECOR.felt} receiveShadow>
        <boxGeometry args={[2.66, 2.62, 0.02]} />
      </mesh>
      <instancedMesh ref={mesh} args={[geo, deskMaterial(), count]} castShadow receiveShadow />
    </group>
  );
}

/** A window with horizontal blinds, the night outside glowing between the slats. */
function Window({ glowRef }) {
  const slats = useMemo(() => Array.from({ length: 17 }, (_, i) => 0.95 + i * 0.088), []);
  return (
    <group position={[-2.3, 0, WALL_Z + 0.02]}>
      <mesh position={[0, 1.66, 0]}>
        <planeGeometry args={[1.08, 1.56]} />
        <meshStandardMaterial ref={glowRef} color="#000000" emissive="#8fa6c9" emissiveIntensity={0} toneMapped={false} />
      </mesh>
      {slats.map((y) => (
        <mesh key={y} position={[0, y, 0.03]} rotation={[0.5, 0, 0]} material={DECOR.slat}>
          <boxGeometry args={[1.06, 0.07, 0.004]} />
        </mesh>
      ))}
      {[[0, 2.46, 1.16, 0.04], [0, 0.86, 1.16, 0.04], [-0.56, 1.66, 0.04, 1.64], [0.56, 1.66, 0.04, 1.64]].map(([x, y, w, h]) => (
        <mesh key={`${x}:${y}`} position={[x, y, 0.04]} material={DECOR.frame} castShadow>
          <boxGeometry args={[w, h, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** A floor lamp with a fabric drum shade: the warm light in the corner. */
function FloorLamp({ position, shadeRef }) {
  return (
    <group position={position}>
      <mesh material={FURNITURE.lampShell} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.16, 0.025, 40]} />
      </mesh>
      <mesh position={[0, 0.78, 0]} material={FURNITURE.chrome} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 1.54, 12]} />
      </mesh>
      <mesh position={[0, 1.63, 0]}>
        <cylinderGeometry args={[0.2, 0.22, 0.32, 48, 1, true]} />
        <meshStandardMaterial ref={shadeRef} color="#2b241e" emissive="#e07a3c" emissiveIntensity={0} roughness={0.9}
          side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** A snake plant in a ceramic pot: tall blades, seeded so it grows the same every time. */
function Plant({ position }) {
  const geo = useMemo(() => {
    const random = seededRandom(23);
    const blade = (h) => {
      const s = new THREE.Shape();
      s.moveTo(-0.035, 0);
      s.quadraticCurveTo(-0.05, h * 0.55, 0, h);
      s.quadraticCurveTo(0.05, h * 0.55, 0.035, 0);
      return new THREE.ShapeGeometry(s, 10);
    };
    const blades = Array.from({ length: 12 }, (_, i) => ({
      geometry: blade(0.55 + random() * 0.5),
      yaw: (i / 12) * Math.PI * 2 + random() * 0.4,
      tilt: 0.06 + random() * 0.2,
      r: 0.03 + random() * 0.07,
    }));
    return {
      blades,
      pot: lathe([[0, 0], [0.13, 0], [0.15, 0.03], [0.17, 0.4], [0.165, 0.42], [0.15, 0.42], [0.145, 0.39], [0, 0.39]]),
    };
  }, []);
  return (
    <group position={position}>
      <mesh geometry={geo.pot} material={DECOR.ceramic} castShadow receiveShadow />
      {geo.blades.map((b) => (
        <group key={b.yaw} rotation={[0, b.yaw, 0]}>
          <mesh geometry={b.geometry} material={DECOR.leaf} position={[b.r, 0.38, 0]} rotation={[0, Math.PI / 2, b.tilt]} castShadow />
        </group>
      ))}
    </group>
  );
}

/** What's on the table: a notepad and a pen for each interviewer, water glasses, and a copy of your CV. */
function TableTop() {
  const glass = useMemo(() => lathe([[0, 0], [0.035, 0], [0.038, 0.003], [0.042, 0.11], [0.04, 0.11], [0.036, 0.004], [0, 0.004]], 32), []);
  const water = useMemo(() => new THREE.CylinderGeometry(0.036, 0.033, 0.065, 32), []);
  const y = TABLE_TOP_Y;
  return (
    <group>
      {[[-0.42, -0.17, 0.08], [0.44, -0.2, -0.1]].map(([x, z, r]) => (
        <group key={x} position={[x, y + 0.004, z]} rotation={[0, r, 0]}>
          <mesh material={DECOR.paper} castShadow receiveShadow>
            <boxGeometry args={[0.2, 0.008, 0.27]} />
          </mesh>
          <mesh material={DECOR.pen} position={[0.13, 0.008, 0.02]} rotation={[Math.PI / 2, 0, 0.3]} castShadow>
            <cylinderGeometry args={[0.005, 0.005, 0.14, 10]} />
          </mesh>
        </group>
      ))}
      {/* Your CV, turned towards the interviewers */}
      <mesh material={DECOR.paper} position={[0.05, y + 0.002, -0.02]} rotation={[-Math.PI / 2, 0, 3.0]} receiveShadow>
        <planeGeometry args={[0.21, 0.297]} />
      </mesh>
      {[[-0.74, -0.08], [0.72, -0.05], [0.52, 0.3]].map(([x, z]) => (
        <group key={x} position={[x, y, z]}>
          <mesh geometry={glass} material={DECOR.glass} />
          <mesh geometry={water} material={DECOR.water} position={[0, 0.037, 0]} />
        </group>
      ))}
    </group>
  );
}

// ── The interviewers ─────────────────────────────────────────────────────────────────────────────────────
/**
 * One interviewer, seated across the table. The writer takes notes and looks up now and then; the watcher
 * keeps their eyes on you and nods. `look` is how far to turn the head to face your chair.
 */
function Interviewer({ x, tone, role, mode, levelRef }) {
  const push = mode === "push";
  const materials = useMemo(() => figureMaterials(tone), [tone]);
  const figure = useMemo(() => buildFigure(materials), [materials]);
  const base = useMemo(() => seatedPose("table"), []);
  const attention = useRef(role === "watcher" ? 1 : 0);
  const look = Math.atan2(-x, TABLE_GAP * 2); // towards your chair across the table
  useEffect(() => () => {
    materials.body.dispose();
    materials.joint.dispose();
  }, [materials]);

  useFrame((frame, delta) => {
    if (levelRef.current < 0.002) return; // the set is dark (hidden): nothing to animate
    const t = frame.clock.elapsedTime + x * 7; // offset, so the two never move in step
    const still = prefersReducedMotion();
    let pose;
    if (role === "writer") {
      // Head down over the notepad, the pen moving; every 8 s, look up at you for a couple of seconds.
      const cycle = t % 8;
      const wantsLook = push || (mode !== "notes" && !still && cycle > 5.4 && cycle < 7.6);
      attention.current += ((wantsLook ? 1 : 0) - attention.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 4));
      if (Math.abs(attention.current - (wantsLook ? 1 : 0)) > 0.01) busy();
      const a = attention.current;
      const writing = still ? 0 : 1 - a;
      const notes = { ...base, neck: 0.18, headX: 0.42, spine: 0.22, shoulderRX: -0.5, elbowR: 1.2, shoulderRZ: 0.12 };
      pose = blendPose(notes, { ...base, headY: look }, a);
      pose.wristR = (pose.wristR ?? 0) + 0.18 * Math.sin(t * 11) * writing;
      pose.elbowR += 0.05 * Math.sin(t * 5.3) * writing;
      pose.shoulderRZ += 0.04 * Math.sin(t * 2.1) * writing;
    } else {
      // Watching you, hands together; a slow nod now and then; leaning in when the first question comes.
      attention.current += ((push ? 1 : 0) - attention.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 3));
      if (Math.abs(attention.current - (push ? 1 : 0)) > 0.01) busy();
      const nod = still ? 0 : smoothstep(Math.sin(t * 1.1) * 3 - 2) * 0.1;
      pose = { ...base, headY: look * 0.85, headX: nod, shoulderLZ: -0.14, shoulderRZ: 0.14, spine: base.spine + attention.current * 0.1 };
    }
    if (!still) pose.breath = 0.016 * Math.sin(t * 1.5);
    applyPose(figure, pose);
  });

  return (
    <group position={[x, 0, -TABLE_GAP]}>
      <Chair />
      <primitive object={figure.root} />
    </group>
  );
}

// ── The set ──────────────────────────────────────────────────────────────────────────────────────────────
export default function InterviewSet({ position, levelRef, mode = null, shadows = true }) {
  const meshes = useRef(null);
  const pendant = useRef(null);
  const pendantBulb = useRef(null);
  const corner = useRef(null);
  const cornerShade = useRef(null);
  const windowGlow = useRef(null);
  const windowLight = useRef(null);
  const pendantTarget = useMemo(() => new THREE.Object3D(), []);
  const windowTarget = useMemo(() => new THREE.Object3D(), []);
  const shadowCount = useRef({ n: 0 });
  const pendantShade = useMemo(() => ({
    shell: lathe([[0.01, 0.2], [0.05, 0.19], [0.13, 0.13], [0.2, 0.04], [0.225, 0], [0.228, -0.005]], 48),
    liner: lathe([[0.008, 0.19], [0.12, 0.12], [0.2, 0.03], [0.222, -0.002]], 48),
  }), []);
  const wallFade = useMemo(() => fadeTexture(), []);
  const rug = useMemo(() => ({ edge: new THREE.ShapeGeometry(roundedRect(3.3, 2.7, 0.12)), body: new THREE.ShapeGeometry(roundedRect(3.16, 2.56, 0.1)) }), []);

  useFrame(() => {
    const level = levelRef.current;
    // Hidden entirely when the shot is elsewhere (no draw calls, nothing in other lights' shadows). The lights
    // stay in the scene at zero, so the shaders never recompile when the set lights up.
    meshes.current.visible = level > 0.002;
    pendant.current.intensity = 9 * level;
    shadowsWhileLit(pendant.current, level > 0.002, shadowFrame(shadowCount.current));
    pendantBulb.current.emissiveIntensity = 3.2 * level;
    corner.current.intensity = 1.4 * level;
    cornerShade.current.emissiveIntensity = 0.45 * level;
    windowGlow.current.emissiveIntensity = 0.55 * level;
    windowLight.current.intensity = 2.2 * level;
  });

  return (
    <group position={position}>
      {/* Lights: the pendant over the table (VERA's cool light), the warm floor lamp, the window's rim light */}
      <spotLight ref={pendant} target={pendantTarget} position={[0, PENDANT_Y - 0.02, 0]} color="#e3e9f2" intensity={0}
        angle={0.95} penumbra={0.85} decay={2} distance={5} castShadow={shadows} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0003}
        shadow-normalBias={0.02} shadow-radius={5} shadow-blurSamples={12} />
      <primitive object={pendantTarget} position={[0, TABLE_TOP_Y, 0]} />
      <pointLight ref={corner} position={[-1.7, 1.6, -1.25]} color="#ff9a5c" intensity={0} distance={3.4} decay={2} />
      <spotLight ref={windowLight} target={windowTarget} position={[-2.3, 1.8, WALL_Z + 0.3]} color="#8fa6c9" intensity={0}
        angle={0.9} penumbra={1} decay={2} distance={4.5} />
      <primitive object={windowTarget} position={[0, 1.0, -TABLE_GAP]} />

      <group ref={meshes}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0.08]} geometry={rug.edge} material={DECOR.rugEdge} receiveShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.08]} geometry={rug.body} material={DECOR.rug} receiveShadow />
        <mesh position={[0, 1.8, WALL_Z]} material={DECOR.wall} receiveShadow>
          <planeGeometry args={[8, 3.6]} />
          <primitive object={wallFade} attach="material-alphaMap" />
        </mesh>
        <SlatWall />
        <Window glowRef={windowGlow} />
        <FloorLamp position={[-1.7, 0, -1.25]} shadeRef={cornerShade} />
        <Plant position={[1.75, 0, -1.5]} />

        <Desk topY={TABLE_TOP_Y} size={TABLE_SIZE} />
        <TableTop />
        {PANEL.map((p) => <Interviewer key={p.role} {...p} mode={mode} levelRef={levelRef} />)}

        {/* The pendant: a cable from the dark ceiling and a dome shade, lit inside */}
        <mesh position={[0, PENDANT_Y + 1.1, 0]} material={FURNITURE.lampShell}>
          <cylinderGeometry args={[0.004, 0.004, 2.2, 6]} />
        </mesh>
        <group position={[0, PENDANT_Y, 0]}>
          <mesh geometry={pendantShade.shell} material={FURNITURE.lampShell} castShadow />
          <mesh geometry={pendantShade.liner}>
            <meshStandardMaterial ref={pendantBulb} color="#15161a" emissive="#e3e9f2" emissiveIntensity={0}
              side={THREE.BackSide} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
