"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { walnut } from "./textures";

/**
 * The room's furniture, modelled in code: a sled-base chair (one bent chrome tube per side, an upholstered seat
 * and a curved back), a walnut desk on the same chrome tubing, and an architect's lamp. One design language, so
 * the room reads as designed rather than assembled from boxes.
 */

// ── Materials (shared; created once) ─────────────────────────────────────────────────────────────────────
export const FURNITURE = {
  chrome: new THREE.MeshStandardMaterial({ color: "#b9bcc3", metalness: 1, roughness: 0.34, envMapIntensity: 0.3 }),
  fabric: new THREE.MeshPhysicalMaterial({ color: "#26262b", roughness: 0.9, sheen: 1, sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#8a8a96"), envMapIntensity: 0.04 }),
  seatPan: new THREE.MeshStandardMaterial({ color: "#16161a", metalness: 0.6, roughness: 0.45, envMapIntensity: 0.1 }),
  lampShell: new THREE.MeshStandardMaterial({ color: "#1b1b1f", metalness: 0.5, roughness: 0.35, envMapIntensity: 0.2,
    side: THREE.DoubleSide }),
};

let walnutMaterial = null;
function deskMaterial() {
  walnutMaterial ??= new THREE.MeshPhysicalMaterial({ map: walnut(), roughness: 0.42, clearcoat: 0.35,
    clearcoatRoughness: 0.3, envMapIntensity: 0.06 });
  return walnutMaterial;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────────────────────────────────

/** A polyline with every corner replaced by a small bend of radius r: how bent steel tubing looks. */
function bentPath(points, r, closed = false) {
  const pts = points.map((p) => new THREE.Vector3(...p));
  const n = pts.length;
  const corner = (i) => {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const rr = Math.min(r, a.distanceTo(p) / 2.2, b.distanceTo(p) / 2.2);
    return {
      start: p.clone().addScaledVector(a.clone().sub(p).normalize(), rr),
      control: p,
      end: p.clone().addScaledVector(b.clone().sub(p).normalize(), rr),
    };
  };
  // Closed loops bend at every point; open paths only at the inner ones.
  const corners = closed ? pts.map((_, i) => corner(i)) : pts.slice(1, -1).map((_, i) => corner(i + 1));
  const path = new THREE.CurvePath();
  let cursor = closed ? corners[corners.length - 1].end : pts[0];
  for (const c of corners) {
    path.add(new THREE.LineCurve3(cursor, c.start));
    path.add(new THREE.QuadraticBezierCurve3(c.start, c.control, c.end));
    cursor = c.end;
  }
  if (!closed) path.add(new THREE.LineCurve3(cursor, pts[n - 1]));
  return path;
}

function tube(points, { r = 0.1, radius = 0.011, closed = false, segments = 240 } = {}) {
  return new THREE.TubeGeometry(bentPath(points, r, closed), segments, radius, 14, closed);
}

/** A rounded box bent into a gentle curve across its width (a chair back that wraps around you). */
function curvedPanel(width, height, depth, bend) {
  const geometry = new RoundedBoxGeometry(width, height, depth, 4, Math.min(depth / 2, 0.018));
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) + bend * x * x);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ── The chair ────────────────────────────────────────────────────────────────────────────────────────────
export function Chair() {
  const geo = useMemo(() => {
    const side = (x) => tube([
      [x, 0.012, -0.24], [x, 0.012, 0.25], [x, 0.405, 0.2], [x, 0.405, -0.19],
    ], { r: 0.045, closed: true });
    const post = (x) => tube([[x, 0.405, -0.19], [x, 0.62, -0.225], [x, 0.84, -0.26]], { r: 0.06, segments: 60 });
    return {
      sides: [side(0.225), side(-0.225)],
      posts: [post(0.225), post(-0.225)],
      seat: new RoundedBoxGeometry(0.5, 0.06, 0.46, 4, 0.024),
      pan: new RoundedBoxGeometry(0.47, 0.018, 0.42, 2, 0.008),
      back: curvedPanel(0.49, 0.26, 0.04, 0.55),
    };
  }, []);

  return (
    <group>
      {[...geo.sides, ...geo.posts].map((g) => (
        <mesh key={g.uuid} geometry={g} material={FURNITURE.chrome} castShadow receiveShadow />
      ))}
      <mesh geometry={geo.pan} material={FURNITURE.seatPan} position={[0, 0.414, 0.005]} castShadow />
      <mesh geometry={geo.seat} material={FURNITURE.fabric} position={[0, 0.452, 0.01]} castShadow receiveShadow />
      <mesh geometry={geo.back} material={FURNITURE.fabric} position={[0, 0.72, -0.235]} rotation={[-0.16, 0, 0]}
        castShadow receiveShadow />
    </group>
  );
}

// ── The desk ─────────────────────────────────────────────────────────────────────────────────────────────
export const DESK_SIZE = [1.5, 0.045, 0.75];

export function Desk({ topY }) {
  const geo = useMemo(() => {
    const [w, t, d] = DESK_SIZE;
    const leg = (x) => tube([
      [x, 0.012, -d / 2 + 0.06], [x, 0.012, d / 2 - 0.06], [x, topY - t, d / 2 - 0.06], [x, topY - t, -d / 2 + 0.06],
    ], { r: 0.05, closed: true, radius: 0.013 });
    return {
      top: new RoundedBoxGeometry(w, t, d, 4, 0.014),
      legs: [leg(w / 2 - 0.1), leg(-w / 2 + 0.1)],
      rail: tube([[-w / 2 + 0.1, topY - t - 0.02, -d / 2 + 0.06], [w / 2 - 0.1, topY - t - 0.02, -d / 2 + 0.06]],
        { radius: 0.01, segments: 8 }),
    };
  }, [topY]);

  return (
    <group>
      <mesh geometry={geo.top} material={deskMaterial()} position={[0, topY - DESK_SIZE[1] / 2, 0]} castShadow receiveShadow />
      {[...geo.legs, geo.rail].map((g) => (
        <mesh key={g.uuid} geometry={g} material={FURNITURE.chrome} castShadow receiveShadow />
      ))}
    </group>
  );
}

// ── The lamp ─────────────────────────────────────────────────────────────────────────────────────────────
/** A lathe profile (x = radius, y = height) turned into a solid of revolution. */
function lathe(profile, segments = 40) {
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

/**
 * An architect's lamp: weighted base, two-part arm, dome shade aimed at `aim` (desk-local).
 * `head` is where the bulb sits; the room hangs the lamp's light and bulb glow off `onHead`.
 */
export const LAMP_BASE = [-0.52, 0, -0.24];
export const LAMP_HEAD = [-0.26, 0.47, -0.12];

export function Lamp({ topY, aim, bulbRef }) {
  const geo = useMemo(() => {
    const base = [LAMP_BASE[0], topY, LAMP_BASE[2]];
    const elbow = [base[0] + 0.04, topY + 0.36, base[2] + 0.01];
    const head = [LAMP_HEAD[0], topY + LAMP_HEAD[1], LAMP_HEAD[2]];
    // Orient the shade (a dome opening along -Y) so it points at the aim.
    const dir = new THREE.Vector3(aim[0] - head[0], aim[1] - head[1], aim[2] - head[2]).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    return {
      base,
      elbow,
      head,
      quaternion,
      foot: lathe([[0, 0], [0.085, 0], [0.09, 0.008], [0.082, 0.02], [0.03, 0.026], [0, 0.028]]),
      arm: tube([base.map((v, i) => v + (i === 1 ? 0.026 : 0)), elbow, head], { r: 0.02, radius: 0.0075, segments: 60 }),
      joint: new THREE.SphereGeometry(0.014, 16, 12),
      shade: lathe([[0.012, 0.07], [0.03, 0.065], [0.06, 0.045], [0.085, 0.01], [0.092, -0.035], [0.094, -0.04]]),
      liner: lathe([[0.01, 0.06], [0.055, 0.04], [0.08, 0.005], [0.087, -0.034]]),
    };
  }, [topY, aim]);

  return (
    <group>
      <mesh geometry={geo.foot} material={FURNITURE.lampShell} position={geo.base} castShadow receiveShadow />
      <mesh geometry={geo.arm} material={FURNITURE.chrome} castShadow />
      <mesh geometry={geo.joint} material={FURNITURE.chrome} position={geo.elbow} />
      <group position={geo.head} quaternion={geo.quaternion}>
        <mesh geometry={geo.shade} material={FURNITURE.lampShell} castShadow />
        {/* The inside of the shade and the bulb glow; the room animates their emissive strength */}
        <mesh geometry={geo.liner}>
          <meshStandardMaterial ref={bulbRef} color="#1a120c" emissive="#ff7a2e" emissiveIntensity={0} side={THREE.BackSide}
            toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
