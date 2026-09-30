import * as THREE from "three";

import { seededRandom } from "./materials";

/**
 * Surface detail painted in code (no image files): polished concrete for the floor and walnut for the desk.
 * Each is drawn once on a canvas, cached, and shared. Seeded, so every load looks the same.
 */
const cache = new Map();

function canvasTexture(key, size, paint, { repeat = 1, color = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext("2d"), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

/**
 * Soft blotches and fine speckle, used as a roughness map: mostly matte (~0.85) with slightly glossier patches,
 * so the spotlight picks out a troweled-concrete sheen without turning the whole floor into a mirror.
 */
function paintConcrete(ctx, size) {
  const random = seededRandom(11);
  ctx.fillStyle = "#d9d9d9";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i += 1) {
    const r = 20 + random() * 90;
    const g = ctx.createRadialGradient(random() * size, random() * size, 0, random() * size, random() * size, r);
    const shade = 170 + random() * 60;
    g.addColorStop(0, `rgba(${shade},${shade},${shade},0.22)`);
    g.addColorStop(1, "rgba(217,217,217,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const speckle = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < speckle.data.length; i += 4) {
    const n = (random() - 0.5) * 26;
    speckle.data[i] += n;
    speckle.data[i + 1] += n;
    speckle.data[i + 2] += n;
  }
  ctx.putImageData(speckle, 0, 0);
}

export function concreteRoughness() {
  return canvasTexture("concrete", 512, paintConcrete, { repeat: 6, color: false });
}

/** Long, gently wavering grain lines in two tones of walnut. */
function paintWalnut(ctx, size) {
  const random = seededRandom(23);
  ctx.fillStyle = "#3a2a20";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 180; i += 1) {
    const y0 = random() * size;
    const amp = 2 + random() * 6;
    const freq = 0.004 + random() * 0.01;
    const dark = random() > 0.45;
    ctx.strokeStyle = dark ? `rgba(20,12,8,${0.15 + random() * 0.25})` : `rgba(110,78,55,${0.08 + random() * 0.15})`;
    ctx.lineWidth = 0.6 + random() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const y = y0 + Math.sin(x * freq + i) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function walnut() {
  return canvasTexture("walnut", 512, paintWalnut, { repeat: 1 });
}
