import { describe, expect, it } from "vitest";

import { QUALITY, qualityTier } from "@/components/three/quality";

// Which 3D quality a device starts at, from what its GPU, CPU and memory report.
describe("qualityTier", () => {
  it.each([
    ["Apple M2 desktop", { renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)", cores: 8, memory: 8 }, "high"],
    ["NVIDIA gaming laptop", { renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11)", cores: 16 }, "high"],
    ["hidden renderer, plenty of cores", { renderer: "", cores: 8 }, "high"],
    ["integrated Intel Iris on a laptop", { renderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)", cores: 8 }, "medium"],
    ["recent phone", { renderer: "Apple GPU", cores: 6, mobile: true, width: 390 }, "medium"],
    ["mid-range Android", { renderer: "Adreno (TM) 642L", cores: 8, memory: 4, mobile: true, width: 412 }, "medium"],
    ["old Android GPU", { renderer: "Mali-G52 MC2", cores: 8, memory: 4, mobile: true, width: 360 }, "low"],
    ["old Intel HD on a desktop", { renderer: "Intel(R) HD Graphics 520", cores: 4 }, "low"],
    ["software rendering (no GPU)", { renderer: "Google SwiftShader", cores: 8 }, "low"],
    ["two cores", { renderer: "", cores: 2 }, "low"],
    ["2 GB of memory", { renderer: "Apple GPU", cores: 6, memory: 2 }, "low"],
  ])("%s → %s", (_, device, tier) => {
    expect(qualityTier(device)).toBe(tier);
  });

  it("each tier is cheaper than the one above it", () => {
    expect(QUALITY.low.effects).toBe(false);
    expect(QUALITY.low.lampShadows).toBe(false);
    expect(QUALITY.medium.multisampling).toBeLessThan(QUALITY.high.multisampling);
    expect(QUALITY.low.maxDpr).toBeLessThan(QUALITY.medium.maxDpr);
    expect(QUALITY.medium.maxDpr).toBeLessThan(QUALITY.high.maxDpr);
  });
});
