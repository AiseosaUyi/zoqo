import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Guards the P0 fix for the auth OTP silent-failure bug (see
 * PLAN-tester-report-2026-09-12.md): a failed signInWithOtp/verifyOtp used
 * to leave the user staring at an empty code box or a stuck "verified" UI
 * with no error shown anywhere. These tests run with
 * NEXT_PUBLIC_BACKEND_ENABLED=1 (see playwright.config.ts) so the real
 * Supabase codepath is exercised — the mocked path always succeeds and
 * can't reproduce this bug class. All Supabase network calls are
 * intercepted; no live project is contacted.
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

async function mockSupabaseFallback(page: Page) {
  // Lowest-priority catch-all so incidental Supabase calls (getSession,
  // getUser, the realtime/token refresh probes the SDK makes on mount)
  // never hit the network — registered first, so more specific routes
  // added later take priority (Playwright matches LIFO).
  await page.route("**/auth/v1/**", (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

async function openSignup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("Welcome to")).toBeVisible();
}

async function submitEmail(page: Page, email = "trader@example.com") {
  await page.getByPlaceholder("Enter email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  // Optimistic transition — the OTP screen appears immediately regardless
  // of whether the send succeeds or fails.
  await expect(page.getByText("Confirm Email")).toBeVisible();
}

test.describe("auth OTP error visibility (P0 fix)", () => {
  test("a failed send shows a visible error on the OTP screen", async ({ page }) => {
    await mockSupabaseFallback(page);
    await page.route("**/auth/v1/otp", (route: Route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "server_error", msg: "boom" }) }),
    );

    await openSignup(page);
    await submitEmail(page);

    // Previously: OtpStep never rendered authError at all — this would have
    // stayed silent forever.
    await expect(page.getByText(/boom|something went wrong|error/i)).toBeVisible({ timeout: 5000 });
  });

  test("a rate-limited send shows the distinct rate-limit message, not a generic error", async ({ page }) => {
    await mockSupabaseFallback(page);
    await page.route("**/auth/v1/otp", (route: Route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error_code: "over_email_send_rate_limit", code: "over_email_send_rate_limit", msg: "rate limited" }),
      }),
    );

    await openSignup(page);
    await submitEmail(page);

    await expect(page.getByText(/too many attempts/i)).toBeVisible({ timeout: 5000 });
  });

  test("a failed resend surfaces an error instead of failing silently", async ({ page }) => {
    await mockSupabaseFallback(page);
    let otpCalls = 0;
    await page.route("**/auth/v1/otp", (route: Route) => {
      otpCalls += 1;
      if (otpCalls === 1) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "server_error", msg: "resend failed" }) });
    });

    await openSignup(page);
    await submitEmail(page);

    // Skip the 2:59 resend countdown via Playwright's clock instead of
    // waiting in real time.
    await page.clock.install();
    await page.clock.fastForward("03:10");
    await page.getByRole("button", { name: "Resend code" }).click();

    await expect(page.getByText(/resend failed|something went wrong|error/i)).toBeVisible({ timeout: 5000 });
  });

  test("a failed verify keeps the typed code, re-enables inputs, and 'Try again' recovers", async ({ page }) => {
    await mockSupabaseFallback(page);
    await page.route("**/auth/v1/otp", (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

    let verifyCalls = 0;
    await page.route("**/auth/v1/verify", (route: Route) => {
      verifyCalls += 1;
      if (verifyCalls === 1) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid_grant", error_description: "Token has expired or is invalid" }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VALID_SESSION_BODY) });
    });

    await openSignup(page);
    await submitEmail(page);

    const digitInputs = page.getByLabel(/Digit \d/);
    const code = "123456";
    for (let i = 0; i < 6; i++) {
      await digitInputs.nth(i).fill(code[i]);
    }

    // Error shows, inputs re-enable (not stuck on a disabled "verified" UI),
    // and the code is retained rather than wiped.
    await expect(page.getByText(/token has expired|invalid|something went wrong/i)).toBeVisible({ timeout: 5000 });
    await expect(digitInputs.first()).toBeEnabled();
    await expect(digitInputs.nth(0)).toHaveValue("1");
    await expect(digitInputs.nth(5)).toHaveValue("6");

    // Explicit retry (not reliant on the auto-fire effect, which wouldn't
    // re-run since `code` never changed) succeeds against the 2nd mocked call.
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Claim Your")).toBeVisible({ timeout: 5000 });
  });
});
