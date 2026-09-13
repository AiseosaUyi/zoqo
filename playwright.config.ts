import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against a dev server started with NEXT_PUBLIC_BACKEND_ENABLED=1 and
 * placeholder Supabase env vars — the real Supabase Auth codepath must be
 * active for these tests, since the mocked (flag-off) path always succeeds
 * and can't reproduce the bug this suite guards against. Real Supabase
 * network calls are intercepted per-test via page.route(), never hitting a
 * live project.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, not `next dev` — NEXT_PUBLIC_* vars are inlined at
    // build time, so both steps need the same env. Deliberately not `next
    // dev`: in constrained/sandboxed environments the dev server's Turbopack
    // HMR websocket can fail its handshake, which stalls client hydration
    // entirely (confirmed while authoring this suite — a plain useEffect
    // counter never advanced). A production build sidesteps that dev-only
    // machinery and is closer to what's actually deployed anyway.
    command: "npm run build && npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_BACKEND_ENABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://e2e-test-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-test-anon-key",
    },
  },
});
