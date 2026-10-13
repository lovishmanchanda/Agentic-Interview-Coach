import { describe, expect, it } from "vitest";

import { PRESETS } from "@/components/three/InterviewRoom";
import { SHOTS } from "@/components/three/shots";

// The shot catalogue is the room's script: every entry must point at a real camera position and be complete.
describe("shots", () => {
  it.each(Object.entries(SHOTS))("%s is a real, complete shot", (name, shot) => {
    expect(PRESETS[shot.preset], `${name}: unknown preset ${shot.preset}`).toBeDefined();
    expect(shot.framing.wide).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), distance: expect.any(Number) }));
    expect(shot.label.length).toBeGreaterThan(10); // what the scene says to screen readers
    if (shot.cast) expect(["you", "standIn"]).toContain(shot.cast);
  });

  it("covers every page that shows the room", () => {
    for (const name of ["landing", "auth", "desk", "deskBackdrop", "interview", "interviewPush"]) expect(SHOTS).toHaveProperty(name);
  });
});
