import { describe, expect, it } from "vitest";

import { keys } from "@/lib/queries";
import { getQueryClient } from "@/lib/queryClient";

describe("query client", () => {
  const retry = getQueryClient().getDefaultOptions().queries.retry;

  it("retries server and network errors twice", () => {
    expect(retry(0, { status: 503 })).toBe(true);
    expect(retry(1, new TypeError("Failed to fetch"))).toBe(true);
    expect(retry(2, { status: 500 })).toBe(false);
  });

  it("never retries a 4xx: it's an answer, not a blip", () => {
    for (const status of [400, 401, 403, 404, 422, 429]) expect(retry(0, { status })).toBe(false);
  });

  it("gives every server render its own cache (no data shared between requests)", () => {
    expect(getQueryClient()).not.toBe(getQueryClient());
  });

  it("keys a single report under the reports list, so refreshing reports refreshes both", () => {
    expect(keys.report("r1").slice(0, 1)).toEqual(keys.reports);
  });
});
