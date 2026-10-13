import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests for the pure parts of the frontend (lib/, the 3D figure maths). No browser, no network.
// End-to-end tests live in tests/e2e and run with Playwright (playwright.config.mjs).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.js"],
    environment: "node",
  },
});
