"use client";

import { useFrame } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { DESK_TOP_Y } from "./InterviewRoom";
import { RoomFocus } from "./roomFocus";
import { busy, prefersReducedMotion } from "./pace";

/**
 * What lies on your desk (dashboard, Phase 7.7): one sheet of paper per interview report, newest on top,
 * each printed with its score; and, in the lamp's pool of light, a card with the next thing to do.
 * Positions are relative to the desk's centre. Hover lifts a sheet (and you, at the desk, look at it); click opens it.
 * A report you haven't seen on the desk before drops onto the stack from above.
 * Keyboard and screen-reader users get the same actions from a plain 2D list the page renders alongside.
 */
const SHEET = [0.21, 0.297]; // A4 proportions
const MAX_SHEETS = 6;

function fontFamily() {
  return typeof document === "undefined" ? "sans-serif" : getComputedStyle(document.body).fontFamily;
}

/**
 * The printed face of a sheet: a canvas texture drawn by `draw(ctx, font)`, redrawn once web fonts have loaded
 * (so the Geist lettering replaces the fallback font). `content` lists what's printed; a change redraws it.
 */
function PrintedMaterial({ draw, content }) {
  const texture = useRef(null);
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 420;
    c.height = 594;
    return c;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const paint = () => {
      if (cancelled || !texture.current) return;
      draw(canvas.getContext("2d"), fontFamily());
      texture.current.needsUpdate = true;
    };
    paint();
    document.fonts?.ready.then(paint);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw only when the printed content changes
  }, [canvas, ...content]);

  return (
    <meshStandardMaterial roughness={0.9} metalness={0} envMapIntensity={0.03} side={THREE.DoubleSide}>
      <canvasTexture ref={texture} attach="map" args={[canvas]} colorSpace={THREE.SRGBColorSpace} anisotropy={4} />
    </meshStandardMaterial>
  );
}

function drawSheet(ctx, font, { score, label, date }) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = "#b9b4aa"; // paper, a little darker than white so the lamp doesn't blow it out
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1a1a1d";
  ctx.font = `600 22px ${font}`;
  ctx.fillText("INTERVIEW REPORT", 34, 58);
  ctx.fillStyle = "#6b6b72";
  ctx.font = `400 20px ${font}`;
  ctx.fillText(date || "", 34, 88);
  ctx.fillStyle = "#1a1a1d";
  ctx.font = `700 150px ${font}`;
  ctx.fillText(score == null ? "–" : Number(score).toFixed(1), 28, 260);
  ctx.font = `400 26px ${font}`;
  ctx.fillStyle = "#6b6b72";
  ctx.fillText("/ 10", 300, 260);
  ctx.fillStyle = "#1a1a1d";
  ctx.font = `600 28px ${font}`;
  ctx.fillText(label || "", 34, 320, w - 68);
  ctx.fillStyle = "#a39e94"; // body text, as a few soft lines
  for (let y = 380; y < h - 60; y += 44) ctx.fillRect(34, y, w - 68 - ((y * 7) % 110), 12);
}

function drawNextStep(ctx, font, { title, detail }) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = "#c9b8a8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ff7a2e";
  ctx.fillRect(0, 0, w, 14);
  ctx.fillStyle = "#8a4a22";
  ctx.font = `600 24px ${font}`;
  ctx.fillText("NEXT", 34, 70);
  ctx.fillStyle = "#1a1a1d";
  ctx.font = `700 46px ${font}`;
  const words = (title || "").split(" ");
  let line = "";
  let y = 140;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > w - 68) {
      ctx.fillText(line, 34, y);
      line = word;
      y += 56;
    } else {
      line = next;
    }
  }
  ctx.fillText(line, 34, y);
  ctx.fillStyle = "#6b5a4c";
  ctx.font = `400 26px ${font}`;
  ctx.fillText(detail || "", 34, y + 56, w - 68);
}

// When the scene sits behind a whole page (SceneHost), only pointer events over this CSS selector reach the
// desk; anything else (a card scrolled over it, a button) is the page's, not the desk's.
const HitArea = createContext(null);


/** Tell the seated figure what the pointer is over (a world point), or that it left. */
function attendTo(focus, mesh, lean) {
  if (!focus) return;
  const point = focus.current.point ?? new THREE.Vector3();
  focus.current = { point: mesh ? mesh.getWorldPosition(point) : null, lean, owner: mesh };
}

function Paper({ material, position, rotation, onClick, label }) {
  const hitArea = useContext(HitArea);
  const focus = useContext(RoomFocus);
  const reachable = (e) => !hitArea || Boolean(e.nativeEvent?.target?.closest?.(hitArea));
  const [hovered, setHovered] = useState(false);
  const lift = hovered ? 0.035 : 0;

  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  return (
    <mesh
      name={label}
      position={[position[0], position[1] + lift, position[2]]}
      rotation={[-Math.PI / 2, 0, rotation]}
      castShadow
      receiveShadow
      onPointerOver={(e) => {
        e.stopPropagation();
        if (!reachable(e)) return;
        setHovered(true);
        attendTo(focus, e.object, label === "next-step");
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e) => {
        setHovered(false);
        if (focus?.current.owner === e.object) attendTo(focus, null, false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (reachable(e)) onClick?.();
      }}
    >
      <planeGeometry args={SHEET} />
      {material}
    </mesh>
  );
}

// The drop: a short wait (the camera settles), then the sheet falls from above the desk, turning as it
// goes, and settles with a small skid, the way paper lands.
const DROP_DELAY = 0.9;
const DROP_SECONDS = 1.1;
const DROP_HEIGHT = 0.55;

/**
 * `drop` (any key, e.g. the report id) makes the sheet at `base` (desk-local) drop onto the desk; a new key drops
 * it again. Returns the ref for the group that carries the sheet (the sheet itself sits at the group's origin).
 */
function useDrop(drop, base) {
  const group = useRef(null);
  const started = useRef({ key: null, at: 0 });
  useFrame((frame) => {
    if (!group.current) return;
    const s = started.current;
    if (drop !== s.key) {
      s.key = drop;
      s.at = frame.clock.elapsedTime;
    }
    const u = drop && !prefersReducedMotion() ? (frame.clock.elapsedTime - s.at - DROP_DELAY) / DROP_SECONDS : 1;
    const t = Math.min(1, Math.max(0, u));
    if (u < 1) busy(); // the sheet is in the air
    const fall = 1 - t * t * (3 - 2 * t); // 1 → 0
    group.current.visible = u >= 0 || !drop || prefersReducedMotion();
    group.current.position.set(base[0] + fall * 0.05, base[1] + fall * DROP_HEIGHT, base[2] - fall * 0.08);
    group.current.rotation.set(fall * 0.5, fall * 0.9, fall * -0.35);
  });
  return group;
}

function ReportSheet({ report, index, onOpen, drop }) {
  // A loose stack: each older sheet a little lower and turned, the same way every time (no randomness).
  const rotation = ((index * 37) % 11 - 5) * 0.035;
  const offset = [0.28 + ((index * 13) % 5 - 2) * 0.012, DESK_TOP_Y + 0.002 + (MAX_SHEETS - index) * 0.0015,
    0.05 + ((index * 7) % 5 - 2) * 0.01];
  const group = useDrop(drop, offset);
  return (
    <group ref={group} position={offset}>
      <Paper position={[0, 0, 0]} rotation={rotation} label={`report-${report.id}`} onClick={() => onOpen?.(report.id)}
        material={<PrintedMaterial draw={(ctx, font) => drawSheet(ctx, font, report)} content={[report.score, report.label, report.date]} />} />
    </group>
  );
}

function NextStepCard({ step, onClick }) {
  return (
    <Paper position={[-0.12, DESK_TOP_Y + 0.003, 0.1]} rotation={0.12} label="next-step" onClick={onClick}
      material={<PrintedMaterial draw={(ctx, font) => drawNextStep(ctx, font, step)} content={[step.title, step.detail]} />} />
  );
}

/**
 * reports:  [{ id, score, label, date }] newest first
 * nextStep: { title, detail } shown under the lamp, or null
 * hitArea:  CSS selector; if set, the desk only reacts to pointer events over elements matching it
 * drop:     a key (e.g. the newest report's id) to drop the newest sheet onto the desk; a new key drops it again
 */
export default function DeskItems({ reports = [], nextStep = null, onOpenReport, onNextStep, hitArea = null, drop = null }) {
  const shown = reports.slice(0, MAX_SHEETS);
  return (
    <HitArea.Provider value={hitArea}>
      <group>
        {shown.map((r, i) => <ReportSheet key={r.id} report={r} index={i} onOpen={onOpenReport} drop={i === 0 ? drop : null} />).reverse()}
        {nextStep && <NextStepCard step={nextStep} onClick={onNextStep} />}
      </group>
    </HitArea.Provider>
  );
}
