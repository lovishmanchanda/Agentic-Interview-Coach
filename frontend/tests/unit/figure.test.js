import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { STAND, applyPose, blendPose, buildFigure, pelvisHeightFor, seatedPose, sitPose, walkPose } from "@/components/three/figure";

// The figure's poses are maths: these check the things that would look wrong on screen (feet sinking into the
// floor or floating, feet sliding while sitting down) without rendering anything.
const SOLE = 0.065; // ankle joint → sole of the foot

const material = { body: new THREE.MeshBasicMaterial(), joint: new THREE.MeshBasicMaterial() };
function feet(pose) {
  const figure = buildFigure(material);
  applyPose(figure, pose);
  figure.root.updateMatrixWorld(true);
  return ["ankleL", "ankleR"].map((j) => figure.joints[j].getWorldPosition(new THREE.Vector3()));
}

describe("figure poses", () => {
  it("stands with the soles on the floor", () => {
    for (const ankle of feet(STAND)) expect(ankle.y - SOLE).toBeCloseTo(0, 2);
  });

  it.each(["lap", "table"])("sits (%s) with the soles on the floor", (variant) => {
    for (const ankle of feet(seatedPose(variant))) expect(Math.abs(ankle.y - SOLE)).toBeLessThan(0.02);
  });

  it("keeps the feet planted while sitting down", () => {
    const start = feet(sitPose(0));
    for (const a of [0.25, 0.5, 0.75, 1]) {
      feet(sitPose(a)).forEach((ankle, i) => {
        expect(ankle.y - SOLE).toBeCloseTo(0, 2);
        expect(Math.abs(ankle.z - start[i].z)).toBeLessThan(0.01);
      });
    }
  });

  it("pelvisHeightFor drops from standing height to seat height as the thighs come up", () => {
    expect(pelvisHeightFor(0)).toBeCloseTo(STAND.pelvisY, 5);
    expect(pelvisHeightFor(1.42)).toBeLessThan(0.6);
  });

  it("a walk with no stride is standing still, and blends hit both ends", () => {
    const still = walkPose(1.3, 0);
    expect(still.hipL).toBeCloseTo(0, 6);
    expect(still.pelvisY).toBeCloseTo(STAND.pelvisY, 6);
    const a = seatedPose("lap");
    const b = seatedPose("table");
    expect(blendPose(a, b, 0).shoulderLX).toBeCloseTo(a.shoulderLX, 6);
    expect(blendPose(a, b, 1).shoulderLX).toBeCloseTo(b.shoulderLX, 6);
  });
});
