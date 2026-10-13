import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/session";

// The ?next= redirect after sign-in must never leave the site (open redirect) or run script.
describe("safeNextPath", () => {
  it.each(["/dashboard", "/interview/report/abc?tab=evidence", "/mentor#latest"])("keeps same-site path %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example/login",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "dashboard",
    "",
    null,
    undefined,
    42,
  ])("falls back for %s", (next) => {
    expect(safeNextPath(next)).toBe("/dashboard");
    expect(safeNextPath(next, "/")).toBe("/");
  });
});
