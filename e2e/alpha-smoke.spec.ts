import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Rendering/interaction smoke test for /alpha (ZOQO Alpha Phase 1 —
 * docs/alpha/plans/phase-1-core.md). Alpha is server-first with no
 * localStorage fallback, so unlike most of this app's pages there is no
 * "just load it" path — reaching the real dashboard means being signed in
 * AND having every /api/alpha/* route return data. Neither is available in
 * this sandboxed environment (no live Supabase project — the same
 * constraint auth-otp.spec.ts documents), so both are faked exactly the way
 * that suite fakes Supabase Auth: real Supabase network calls intercepted
 * via page.route(), never hitting a live project. This does NOT prove "Run
 * now" produces a real run end-to-end (that needs a live backend, out of
 * reach here per the build brief) — it proves the page renders its real
 * signed-out gate, then its real dashboard shell (kill switch included)
 * once a session and data exist, which is the honest scope for this
 * environment.
 */

const VALID_SESSION_BODY = {
  access_token: "e2e-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 9_999_999_999,
  refresh_token: "e2e-refresh-token",
  user: {
    id: "00000000-0000-0000-0000-000000000000",
    aud: "authenticated",
    role: "authenticated",
    email: "trader@example.com",
    email_confirmed_at: "2024-01-01T00:00:00Z",
    phone: "",
    confirmed_at: "2024-01-01T00:00:00Z",
    last_sign_in_at: "2024-01-01T00:00:00Z",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
};

async function mockSupabaseAuth(page: Page) {
  // Lowest-priority catch-all (registered first, Playwright matches LIFO —
  // same approach as auth-otp.spec.ts) so incidental Supabase calls never
  // hit the network, then the two calls the OTP sign-in flow actually needs.
  await page.route("**/auth/v1/**", (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/otp", (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/verify", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VALID_SESSION_BODY) }),
  );
}

// There's no live Supabase project to back these in this environment (see
// this file's header comment) — every /api/alpha/* call the page makes is
// a same-origin browser fetch, so page.route() can intercept it exactly
// like the Supabase calls above, standing in for what a real signed-in
// account with one enabled venue and one registry template would return.
async function mockAlphaApi(page: Page) {
  const fixtures: Record<string, unknown> = {
    "**/api/alpha/settings": { killSwitch: false, leagues: [], baseCurrency: "NGN" },
    "**/api/alpha/venues": [],
    "**/api/alpha/strategies": [],
    "**/api/alpha/strategy-templates": [
      { key: "terminal-ma-cross", venues: ["zoqo-terminal"], schedule: { kind: "interval", everyMin: 5 }, defaultParams: {} },
    ],
    "**/api/alpha/decisions**": [],
    "**/api/alpha/events**": [],
    "**/api/alpha/proposals**": [],
    "**/api/alpha/fixtures**": [],
    "**/api/alpha/credentials": [],
  };
  for (const [pattern, body] of Object.entries(fixtures)) {
    await page.route(pattern, (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
  }
}

test.describe("/alpha smoke", () => {
  test("renders the signed-out gate, then the dashboard (kill switch included) once signed in", async ({ page }) => {
    await mockSupabaseAuth(page);
    await mockAlphaApi(page);

    await page.goto("/alpha");

    // Page loads and — with no session yet — shows the real signed-out
    // gate rather than a broken fetch or blank screen.
    await expect(page.getByRole("heading", { name: "Sign in to use Alpha" })).toBeVisible();

    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Welcome to")).toBeVisible();

    await page.getByPlaceholder("Enter email address").fill("trader@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Confirm Email")).toBeVisible();

    const digitInputs = page.getByLabel(/Digit \d/);
    const code = "123456";
    for (let i = 0; i < 6; i++) {
      await digitInputs.nth(i).fill(code[i]);
    }

    // Once verifyOtp resolves, profile.tsx's session flips signedIn true and
    // the page fetches the mocked /api/alpha/* endpoints above — the kill
    // switch card is the acceptance criterion this test exists to guard.
    // Once the dashboard renders there's also a second (Venues) switch on
    // the page, so the switch-control check is a count rather than a bare
    // getByRole visibility assertion (which would be a strict-mode
    // violation with two matches).
    await expect(page.getByRole("heading", { name: "Kill switch" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("switch")).toHaveCount(2);
  });
});
