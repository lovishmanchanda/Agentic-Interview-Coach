import { describe, expect, it } from "vitest";

import { batches, byteSize } from "@/lib/telemetry";

const event = (i, size = 10) => ({ kind: "error", name: "Error", path: "/", message: `${i}:${"x".repeat(size)}` });

// Browsers cap keepalive requests at 64 KB in flight: batches must stay small and within the server's limits.
describe("telemetry batches", () => {
  it("never puts more than 25 events in one request (the server's limit)", () => {
    const bodies = batches(Array.from({ length: 60 }, (_, i) => event(i)));
    expect(bodies.map((b) => JSON.parse(b).events.length)).toEqual([25, 25, 10]);
  });

  it("splits by size, keeping every event, in order", () => {
    const events = Array.from({ length: 10 }, (_, i) => event(i, 3000));
    const bodies = batches(events, 16_000);
    expect(bodies.every((b) => b.length <= 16_000)).toBe(true);
    expect(bodies.flatMap((b) => JSON.parse(b).events.map((e) => e.message))).toEqual(events.map((e) => e.message));
  });

  it("sends an oversized single event on its own rather than dropping it", () => {
    expect(batches([event(1, 20_000)], 16_000)).toHaveLength(1);
    expect(batches([])).toEqual([]);
  });

  it("measures bodies in UTF-8 bytes, not characters (non-ASCII messages weigh more)", () => {
    expect(byteSize("abc")).toBe(3);
    expect(byteSize("é")).toBe(2);
    expect(byteSize("😀")).toBe(4);
    const wide = Array.from({ length: 6 }, (_, i) => ({ kind: "error", name: "Error", path: "/", message: `${i}${"é".repeat(2000)}` }));
    const bodies = batches(wide, 16_000);
    expect(bodies.every((b) => byteSize(b) <= 16_000)).toBe(true);
    expect(bodies.length).toBeGreaterThan(1); // 2,000 characters each, but 4,000 bytes
  });
});
