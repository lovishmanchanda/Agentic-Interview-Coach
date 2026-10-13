import { expect, test } from "@playwright/test";

// The main journey: sign in → your desk → start an interview → the walk to the table → the first question.
// The account is created through the API (with a profile, so onboarding is skipped); everything after that
// goes through the UI. The fake AI gateway answers instantly and the same way every time.
const API = "http://localhost:8100/api/v1";

/** Collects Content-Security-Policy violations (console + securitypolicyviolation events) for this page. */
function watchCsp(page) {
  const violations = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(m.text())) violations.push(m.text());
  });
  return violations;
}

async function createCandidate(request, email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`) {
  const password = `Pw-${Math.random().toString(36).slice(2, 12)}-9`;
  const registered = await request.post(`${API}/auth/register`, { data: { email, password, name: "Ada Tester" } });
  expect(registered.status()).toBe(201);
  const token = (await registered.json()).data.tokens.access_token;
  const profile = await request.post(`${API}/profiles`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { personal: { name: "Ada Tester" }, target: { role: "Software Engineer" }, skills: ["python"] },
  });
  expect(profile.status()).toBe(201);
  return { email, password };
}

async function fillSignIn(page, { email, password }) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password); // not the "Show password" toggle
  await page.getByRole("button", { name: /sign in/i }).click();
}

async function signIn(page, candidate) {
  await page.goto("/login");
  await fillSignIn(page, candidate);
}

test("sign in, see your desk, start an interview and get the first question", async ({ page, request }) => {
  const csp = watchCsp(page);
  const candidate = await createCandidate(request);
  await signIn(page, candidate);

  // Signing in returns to the room; from there, your desk.
  await page.getByRole("link", { name: /back to your desk/i }).click();
  await expect(page.getByRole("heading", { name: /Hi Ada/ })).toBeVisible();
  await expect(page.getByText("Your desk is empty for now.")).toBeVisible();

  // Start the default interview; the walk to the table plays while VERA prepares the first question.
  await page.goto("/interview/configure");
  await page.getByRole("button", { name: "Take the seat", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Take your seat/ })).toBeVisible(); // your first interview: the whole scene

  // The first question arrives and the interview screen takes over.
  await expect(page.getByText(/Question 1 of/).first()).toBeVisible({ timeout: 30_000 }); // (the screen-reader announcement says it too)
  await expect(page.getByPlaceholder(/Type your answer/)).toBeVisible();

  // Answer it: the answer shows at once, and the server's reply is shown. (The fake AI has no evaluation scripted,
  // by design, so the server reports an error; scoring itself is covered by the backend's tests.)
  const answer = "A process has its own memory; threads share their process's memory, so shared data needs locks.";
  await page.getByPlaceholder(/Type your answer/).fill(answer);
  await page.getByRole("button", { name: /submit/i }).click();
  await expect(page.getByText(answer)).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /went wrong|try again/i })).toBeVisible({ timeout: 30_000 });

  // The whole journey (landing, sign-in, desk + 3D, interview + socket) ran under the strict policy.
  expect(csp).toEqual([]);
});

test("after your first interview the intro never holds the question back", async ({ page, request }) => {
  const candidate = await createCandidate(request);
  // An interview already on record (started through the API), so the next one isn't the first.
  const token = (await (await request.post(`${API}/auth/login`, { data: candidate })).json()).data.tokens.access_token;
  expect((await request.post(`${API}/interviews`, { headers: { Authorization: `Bearer ${token}` }, data: {} })).status()).toBe(201);

  await signIn(page, candidate);
  await page.waitForURL("**/");
  await page.goto("/interview/configure");
  await page.getByRole("button", { name: "Take the seat", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Back in the seat/ })).toBeVisible();
  await expect(page.getByText(/Question 1 of/).first()).toBeVisible({ timeout: 30_000 });
});

test("reduced motion skips the intro and goes straight to the question", async ({ browser, request }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await signIn(page, await createCandidate(request));
  await page.waitForURL("**/");
  await page.goto("/interview/configure");
  await page.getByRole("button", { name: "Take the seat", exact: true }).click();
  await expect(page.getByText(/Question 1 of/).first()).toBeVisible({ timeout: 30_000 }); // (the screen-reader announcement says it too)
  await expect(page.getByRole("heading", { name: /Take your seat/ })).toHaveCount(0);
  await context.close();
});

test("a signed-out visit to the desk goes to sign in, and comes back after", async ({ page, request }) => {
  const candidate = await createCandidate(request);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await fillSignIn(page, candidate);
  await expect(page.getByRole("heading", { name: /Hi Ada/ })).toBeVisible();
});

test("the desk and the status bar share one request per list (one cache)", async ({ page, request }) => {
  await signIn(page, await createCandidate(request));
  await page.waitForURL("**/");
  const calls = {};
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/api\/v1\/(reports|interviews|mentor\/welcome)$/.test(path) && r.method() === "GET") calls[path] = (calls[path] || 0) + 1;
  });
  await page.getByRole("link", { name: /back to your desk/i }).click();
  await expect(page.getByRole("heading", { name: /Hi Ada/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(calls).toEqual({ "/api/v1/reports": 1, "/api/v1/interviews": 1, "/api/v1/mentor/welcome": 1 });
});

test("real visitors' page speed reaches the admin dashboard (self-hosted telemetry)", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Take the/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.goto("/login"); // leaving the page sends what was measured (fetch keepalive on pagehide)
  await page.waitForTimeout(1500);

  const admin = await createCandidate(request, "admin-e2e@example.com"); // ADMIN_EMAILS in playwright.config.mjs
  const token = (await (await request.post(`${API}/auth/login`, { data: admin })).json()).data.tokens.access_token;
  const health = await request.get(`${API}/admin/client-health`, { headers: { Authorization: `Bearer ${token}` } });
  expect(health.status()).toBe(200);
  const { vitals } = (await health.json()).data;
  expect(vitals.some((v) => v.path === "/" && ["FCP", "TTFB", "LCP"].includes(v.name))).toBe(true);
});
