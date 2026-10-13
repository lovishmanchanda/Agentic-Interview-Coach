import * as THREE from "three";

/**
 * The people in the room: faceless sculpted figures, like an artist's mannequin cast in matte resin, built from
 * primitives in code (no model files), jointed so they can walk, sit and gesture. Everything here is plain
 * three.js and pure maths; the React side (Candidate.jsx, InterviewSet.jsx) only drives poses each frame.
 *
 * A figure faces +z with its feet on y = 0. A pose is a plain object of joint angles (radians) plus where the
 * pelvis is; blend two poses with blendPose and apply one with applyPose. Rotation conventions, from the
 * figure's point of view: a negative x rotation swings a limb forward (+z), a positive knee or elbow angle
 * folds it the natural way.
 */

// ── Proportions (metres) ─────────────────────────────────────────────────────────────────────────────────
const HIP_DROP = 0.02; // hip joints sit this far below the pelvis origin
export const THIGH = 0.44;
export const SHIN = 0.43;
const FOOT_DROP = 0.065; // ankle joint to sole
const LEG = HIP_DROP + SHIN + FOOT_DROP; // everything below the knee, plus the hip offset
export const STAND_HEIGHT = LEG + THIGH; // pelvis height standing straight
export const SEAT_THIGH = 1.42; // thigh angle when seated (just under 90°, so the feet reach the floor)

/** Pelvis height that keeps the feet on the floor with the thighs at `thigh` and the shins vertical. */
export const pelvisHeightFor = (thigh) => LEG + THIGH * Math.cos(thigh);

// ── Materials ────────────────────────────────────────────────────────────────────────────────────────────
/** Matte resin in a given tone, with slightly darker ball joints, as an artist's mannequin has. */
export function figureMaterials(tone) {
  const base = new THREE.Color(tone);
  return {
    body: new THREE.MeshPhysicalMaterial({ color: base, roughness: 0.58, metalness: 0, clearcoat: 0.15,
      clearcoatRoughness: 0.6, sheen: 0.4, sheenRoughness: 0.7, sheenColor: base.clone().multiplyScalar(1.4),
      envMapIntensity: 0.12 }),
    joint: new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.55), roughness: 0.4, metalness: 0.2,
      envMapIntensity: 0.15 }),
  };
}

// ── Geometry (shared by every figure; built once) ────────────────────────────────────────────────────────
let shapes = null;
function geometry() {
  if (shapes) return shapes;
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 16);
  const sphere = (r) => new THREE.SphereGeometry(r, 24, 16);
  shapes = {
    pelvis: sphere(0.14),
    abdomen: capsule(0.105, 0.1),
    chest: sphere(1),
    neck: new THREE.CylinderGeometry(0.038, 0.046, 0.11, 16),
    head: sphere(0.1),
    upperArm: capsule(0.042, 0.2),
    forearm: capsule(0.036, 0.18),
    hand: sphere(0.045),
    thigh: capsule(0.068, 0.3),
    shin: capsule(0.052, 0.32),
    foot: capsule(0.04, 0.16),
    ball: sphere(1),
  };
  return shapes;
}

function addPart(parent, geo, material, { position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], shadows = true } = {}) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

function joint(parent, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  return group;
}

/**
 * Build one figure. Returns { root, joints }: add `root` to the scene (a <primitive object={root} />) and
 * pose it with applyPose(figure, pose). `shadows: false` for a figure that isn't solid (the ghost).
 */
export function buildFigure(materials, { shadows = true } = {}) {
  const g = geometry();
  const { body, joint: ball } = materials;
  const root = new THREE.Group();
  const j = {};
  const part = (parent, geo, material, options = {}) => addPart(parent, geo, material, { ...options, shadows });

  j.pelvis = joint(root, [0, STAND_HEIGHT, 0]);
  part(j.pelvis, g.pelvis, body, { position: [0, 0.03, -0.01], scale: [1.18, 0.72, 0.86] });

  j.spine = joint(j.pelvis, [0, 0.08, 0]);
  part(j.spine, g.abdomen, body, { position: [0, 0.09, 0], scale: [1, 1, 0.82] });
  j.chest = joint(j.spine, [0, 0.2, 0]);
  j.chestMesh = part(j.chest, g.chest, body, { position: [0, 0.12, 0], scale: [0.175, 0.185, 0.118] });

  j.neck = joint(j.chest, [0, 0.29, 0]);
  part(j.neck, g.neck, body, { position: [0, 0.04, 0.005] });
  j.head = joint(j.neck, [0, 0.09, 0.01]);
  part(j.head, g.head, body, { position: [0, 0.1, 0.012], scale: [0.88, 1.2, 1.02] });

  for (const [side, x] of [["L", 0.2], ["R", -0.2]]) {
    const shoulder = joint(j.chest, [x, 0.235, -0.005]);
    part(shoulder, g.ball, ball, { scale: [0.052, 0.052, 0.052] });
    part(shoulder, g.upperArm, body, { position: [0, -0.14, 0] });
    const elbow = joint(shoulder, [0, -0.285, 0]);
    part(elbow, g.ball, ball, { scale: [0.04, 0.04, 0.04] });
    part(elbow, g.forearm, body, { position: [0, -0.125, 0] });
    const wrist = joint(elbow, [0, -0.25, 0]);
    part(wrist, g.hand, body, { position: [0, -0.055, 0.005], scale: [0.55, 1.2, 0.95] });

    const hip = joint(j.pelvis, [x * 0.48, -HIP_DROP, 0]);
    part(hip, g.thigh, body, { position: [0, -0.22, 0], scale: [1, 1, 1.05] });
    const knee = joint(hip, [0, -THIGH, 0]);
    part(knee, g.ball, ball, { scale: [0.05, 0.05, 0.05] });
    part(knee, g.shin, body, { position: [0, -0.215, 0] });
    const ankle = joint(knee, [0, -SHIN, 0]);
    part(ankle, g.foot, body, { position: [0, -0.03, 0.055], rotation: [Math.PI / 2, 0, 0], scale: [1.05, 1, 0.75] });

    Object.assign(j, { [`shoulder${side}`]: shoulder, [`elbow${side}`]: elbow, [`wrist${side}`]: wrist,
      [`hip${side}`]: hip, [`knee${side}`]: knee, [`ankle${side}`]: ankle });
  }
  return { root, joints: j };
}

// ── Poses ────────────────────────────────────────────────────────────────────────────────────────────────
// Every key a pose may set; anything missing counts as 0 (pelvisY defaults to standing height).
const KEYS = ["pelvisY", "pelvisZ", "pelvisX", "spine", "chest", "neck", "headX", "headY", "breath",
  "shoulderLX", "shoulderLZ", "elbowL", "wristL", "shoulderRX", "shoulderRZ", "elbowR", "wristR",
  "hipL", "kneeL", "ankleL", "hipR", "kneeR", "ankleR", "hipSpread"];

const ARMS_DOWN = { shoulderLZ: 0.08, shoulderRZ: -0.08, elbowL: 0.12, elbowR: 0.12 };
export const STAND = { pelvisY: STAND_HEIGHT, ...ARMS_DOWN };

/**
 * Seated, back against the chair, hands resting on the thighs (variant "lap") or forearms on a table in
 * front ("table"). The hips sit over the chair's seat at z = -0.07 (chair-local).
 */
export function seatedPose(variant = "lap") {
  const legs = { pelvisY: pelvisHeightFor(SEAT_THIGH), pelvisZ: -0.07, hipL: -SEAT_THIGH, kneeL: SEAT_THIGH,
    hipR: -SEAT_THIGH, kneeR: SEAT_THIGH, hipSpread: 0.1 };
  if (variant === "table") {
    return { ...legs, spine: 0.14, chest: 0.04, neck: -0.08, headX: -0.04, shoulderLX: -0.35, shoulderLZ: -0.06,
      elbowL: 1.22, wristL: -0.1, shoulderRX: -0.35, shoulderRZ: 0.06, elbowR: 1.22, wristR: -0.1 };
  }
  return { ...legs, spine: -0.08, chest: 0.02, neck: 0.04, headX: 0.04, shoulderLX: -0.08, shoulderLZ: -0.12,
    elbowL: 1.05, wristL: 0.25, shoulderRX: -0.08, shoulderRZ: 0.12, elbowR: 1.05, wristR: 0.25 };
}

/**
 * Lowering into a chair, `a` = 0 (standing at the seat's front edge) → 1 (seated). The feet stay planted:
 * the thighs swing forward while the pelvis drops and slides back, and the body leans forward on the way
 * down for balance, as people do.
 */
export function sitPose(a, variant = "lap") {
  const seated = seatedPose(variant);
  const thigh = SEAT_THIGH * a;
  const footZ = 0.37; // where the feet stay planted (chair-local)
  const lean = Math.sin(Math.PI * Math.min(1, a * 1.15)) * 0.42;
  return {
    ...blendPose(STAND, seated, a),
    pelvisY: pelvisHeightFor(thigh),
    pelvisZ: footZ - THIGH * Math.sin(thigh),
    hipL: -thigh, kneeL: thigh, hipR: -thigh, kneeR: thigh,
    spine: seated.spine * a + lean,
    shoulderLX: (seated.shoulderLX ?? 0) * a - lean * 0.6,
    shoulderRX: (seated.shoulderRX ?? 0) * a - lean * 0.6,
  };
}

/**
 * Walking, at gait phase `phase` (radians; one stride = 2π) and stride strength `amp` (0 = standing still,
 * 1 = a full stride), so a walk can ease in and out.
 */
export function walkPose(phase, amp = 1) {
  const leg = (p) => ({ hip: -0.4 * Math.sin(p) * amp, knee: (0.08 + 0.7 * Math.max(0, Math.cos(p)) ** 2) * amp,
    ankle: 0.15 * Math.sin(p) * amp });
  const l = leg(phase);
  const r = leg(phase + Math.PI);
  return {
    ...STAND,
    pelvisY: STAND_HEIGHT - 0.035 * Math.sin(phase) ** 2 * amp - 0.01 * amp,
    pelvisX: 0.012 * Math.sin(phase) * amp,
    spine: 0.04 * amp,
    headX: -0.03 * amp,
    hipL: l.hip, kneeL: l.knee, ankleL: l.ankle,
    hipR: r.hip, kneeR: r.knee, ankleR: r.ankle,
    shoulderLX: 0.32 * Math.sin(phase) * amp, // arms swing against the legs
    shoulderRX: -0.32 * Math.sin(phase) * amp,
    elbowL: 0.12 + 0.2 * amp, elbowR: 0.12 + 0.2 * amp,
  };
}

export function blendPose(a, b, t) {
  const out = {};
  for (const key of KEYS) {
    const from = a[key] ?? (key === "pelvisY" ? STAND_HEIGHT : 0);
    const to = b[key] ?? (key === "pelvisY" ? STAND_HEIGHT : 0);
    out[key] = from + (to - from) * t;
  }
  return out;
}

/** Set every joint of `figure` from `pose` (missing keys count as 0). */
export function applyPose({ joints: j }, pose) {
  const v = (key) => pose[key] ?? (key === "pelvisY" ? STAND_HEIGHT : 0);
  j.pelvis.position.set(v("pelvisX"), v("pelvisY"), v("pelvisZ"));
  j.spine.rotation.x = v("spine");
  j.chest.rotation.x = v("chest");
  const breath = 1 + v("breath");
  j.chestMesh.scale.set(0.175 * breath, 0.185, 0.118 * breath);
  j.neck.rotation.x = v("neck");
  j.head.rotation.set(v("headX"), v("headY"), 0);
  j.shoulderL.rotation.set(v("shoulderLX"), 0, v("shoulderLZ"));
  j.shoulderR.rotation.set(v("shoulderRX"), 0, v("shoulderRZ"));
  j.elbowL.rotation.x = -v("elbowL");
  j.elbowR.rotation.x = -v("elbowR");
  j.wristL.rotation.x = v("wristL");
  j.wristR.rotation.x = v("wristR");
  j.hipL.rotation.set(v("hipL"), 0, v("hipSpread"));
  j.hipR.rotation.set(v("hipR"), 0, -v("hipSpread"));
  j.kneeL.rotation.x = v("kneeL");
  j.kneeR.rotation.x = v("kneeR");
  j.ankleL.rotation.x = v("ankleL");
  j.ankleR.rotation.x = v("ankleR");
}

/** Stand the whole figure at (x, z) on the floor, turned `yaw` about the vertical; hide it with visible = false. */
export function placeFigure({ root }, x, z, yaw, visible = true) {
  root.position.set(x, 0, z);
  root.rotation.set(0, yaw, 0);
  root.visible = visible;
}

export const smoothstep = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
