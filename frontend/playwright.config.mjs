import { defineConfig } from "@playwright/test";

// End-to-end tests: a real browser against a real backend and a production build of the frontend.
// The backend runs with an in-memory database and the fake AI gateway (no API keys, no cost, deterministic), on
// its own ports so a running dev setup (3000/8000) is left alone. Browsers: the installed Chrome locally, the
// runner's Chrome in CI; nothing is downloaded (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).
const API_PORT = 8100;
const WEB_PORT = 3100;
const python = process.env.E2E_PYTHON || ".venv/bin/python";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: "chrome",
    // Software WebGL, so the 3D room renders in headless Chrome too.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      port: API_PORT,
      env: {
        APP_ENV: "local",
        USE_INMEMORY_DB: "true",
        USE_FAKE_GATEWAY: "true",
        SEED_ON_STARTUP: "true",
        CORS_ORIGINS: `["http://localhost:${WEB_PORT}"]`,
        ADMIN_EMAILS: '["admin-e2e@example.com"]',
        GROQ_API_KEY: "",
        PISTON_URL: "",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      port: WEB_PORT,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
