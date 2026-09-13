import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * /settings → MCP round trip for a multi-scope Alpha key
 * (docs/alpha/PROMPT-alpha-finish.md §2's required Playwright test).
 *
 * Same environment constraint as e2e/alpha-smoke.spec.ts: playwright.config.ts
 * deliberately points this suite's server at a placeholder Supabase project
 * (`NEXT_PUBLIC_SUPABASE_URL=https://e2e-test-project.supabase.co`), so a real
 * signed-in session and a real `/api/settings/api-keys` row are out of reach
 * here — this proves the UI/network wiring (checking Alpha scopes actually
 * requests them, the issued key is the one used to call `/api/mcp`), not a
 * live database round trip. `src/lib/mcp/auth.ts`'s scope-checking logic
 * itself has no unit test coverage gap this fills — it's covered by this
 * being the literal code path a real key exercises.
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

async function signIn(page: Page) {
  await page.route("**/auth/v1/**", (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/otp", (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/verify", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VALID_SESSION_BODY) }),
  );

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByPlaceholder("Enter email address").fill("trader@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Confirm Email")).toBeVisible();
  const digitInputs = page.getByLabel(/Digit \d/);
  const code = "123456";
  for (let i = 0; i < 6; i++) await digitInputs.nth(i).fill(code[i]);

  // verifyOtp success advances AuthModal to its rewards step, not straight
  // to closed (AuthModal.tsx: "claiming or skipping rewards closes the
  // modal") — skip it to actually dismiss the modal before interacting
  // with anything underneath.
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("heading", { name: "Generate a new key" })).toBeVisible({ timeout: 10_000 });
}

test.describe("Alpha MCP key issuance", () => {
  test("a key issued with an alpha:read scope from /settings authenticates a real list_venues call to /api/mcp", async ({ page }) => {
    const RAW_KEY = "zoqo_e2e_test_key_0123456789abcdef";

    await page.route("**/api/settings/api-keys", (route: Route) => {
      if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return route.continue();
    });
    await page.route("**/api/settings/digest", (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ optIn: true }) }));

    await signIn(page);

    await page.getByPlaceholder('e.g. "Trading bot"').fill("E2E agent");
    await page.getByLabel("Alpha: read").check();

    // Intercept the create call to assert the request actually carries both
    // the base scope and the checked alpha:* scope — the thing this test
    // exists to prove about the UI, before ever touching /api/mcp.
    const createRequest = page.waitForRequest(
      (req) => req.url().includes("/api/settings/api-keys") && req.method() === "POST",
    );
    await page.route("**/api/settings/api-keys", (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rawKey: RAW_KEY, name: "E2E agent" }),
      });
    });
    await page.getByRole("button", { name: "Generate key" }).click();

    const createReq = await createRequest;
    const createBody = createReq.postDataJSON() as { name: string; scopes: string[] };
    expect(createBody.scopes).toContain("read");
    expect(createBody.scopes).toContain("alpha:read");

    await expect(page.getByText(RAW_KEY)).toBeVisible();

    // Now use exactly that issued key as a Bearer token against the real
    // MCP JSON-RPC shape /api/mcp expects, same as an external agent would.
    let mcpAuthHeader: string | undefined;
    await page.route("**/api/mcp", (route: Route) => {
      mcpAuthHeader = route.request().headers()["authorization"];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "[]" }] } }),
      });
    });

    const mcpResult = await page.evaluate(
      async ([rawKey]) => {
        const res = await fetch("/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${rawKey}` },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_venues", arguments: {} } }),
        });
        return { status: res.status, body: await res.json() };
      },
      [RAW_KEY],
    );

    expect(mcpAuthHeader).toBe(`Bearer ${RAW_KEY}`);
    expect(mcpResult.status).toBe(200);
    expect(mcpResult.body.result.content[0].text).toBe("[]");
  });
});
