# Prompt: finish ZOQO Alpha (nav, missing MCP surface, Vault, live verification)

Paste everything below the line into Claude Code at the repo root.

---

You are finishing **ZOQO Alpha**. Read `CLAUDE.md`, `docs/alpha/STATUS.md`, `docs/alpha/03-architecture.md`, `docs/alpha/05-mcp-spec.md`, and `docs/alpha/07-build-plan.md` (standing rules) first. Phases 0 to 5 are committed and pushed. This is the completion pass. Work through every section below in order, without stopping between sections, using the same loop as before: plan file in `docs/alpha/plans/phase-7-finish.md`, `/plan-eng-review` (and `/plan-design-review` for the nav and UI work), build, `/review`, `/qa`, `tsc`, `lint`, `test:unit`, `test:e2e`, `next build`, commit as `alpha(finish): ...`, update `docs/alpha/STATUS.md`. Push at the end of each section; I have said you may push to `main`.

## 1. Make Alpha reachable (it is currently invisible)

`/alpha` exists but no navigation links to it. `src/components/trade/HeaderChrome.tsx`'s `NAV_ITEMS` has Predict, Trade, Automations; the profile menu has Profile, Settings, Referrals, System. Fix:

- Add `{ key: "alpha", href: "/alpha", label: "Alpha", icon: <lucide icon, e.g. Sparkles or FlaskConical> }` to `NAV_ITEMS` so it appears in every header that composes `HeaderChrome` (TopNav, AutomationsHeader, ProfileTopNav, ReferralsTopNav, SettingsTopNav, AlphaHeader) and in the mobile five-tab nav. Check `src/components/terminal/*` and the mobile nav component for a second hard-coded nav list and update it too. Do not hand-copy a new header.
- Add a small unread badge on the Alpha nav item when there are unacknowledged `alpha_events` of kind `proposal`, `paused`, `error`, or `kill` (same pattern as the automations badge and the settlements bell).
- On `/alpha`, add an empty state for first visit that walks through: enable a venue, create a strategy, press Run now, and links to Settings for API keys and credentials. Include a "Needs setup" panel driven by `get_health` showing which providers and venues have credentials configured (env var present) and which do not, with the exact signup URL for each missing one.
- Add `/alpha` to the `/settings` page description of what MCP scopes unlock, and list the `alpha:*` scopes there with one-line explanations.
- Redirect `/` stays `/terminal`. Do not change it.

## 2. The 13 missing MCP tools, plus resources and prompts

Implement in `src/lib/mcp/alphaTools.ts` and register in `src/app/api/mcp/route.ts`, all via `src/lib/alpha/service.ts`, with `requireScope` per tool exactly as `05-mcp-spec.md` states:

`get_balances` (alpha:read), `set_venue_credentials` (alpha:credentials; never returns the secret), `backtest_strategy` (alpha:run; wraps `src/lib/alpha/backtest.ts`), `get_runs` and `get_run` (alpha:read; from `alpha_runs`, include the log jsonb), `list_orders` (alpha:read), `place_intent` (alpha:run; builds an `Intent` from the args, passes it through `evaluateIntent` in `risk.ts` and the venue adapter exactly like a strategy intent, records the decision either way, returns the decision and order), `cancel_order` (alpha:run; adapters that lack `cancel` return a clear error), `settle_now` (alpha:run; runs the settle pass for one venue or all), `get_settings` and `set_settings` (alpha:read / alpha:manage), `get_events` and `ack_event` (alpha:read / alpha:manage).

Then MCP resources and prompts using `mcp-handler`'s `server.registerResource` / `server.registerPrompt` (check the installed `@modelcontextprotocol` types in `node_modules` for the exact API, do not guess): resources `zoqo://alpha/strategies/{id}`, `zoqo://alpha/fixtures/{id}`, `zoqo://alpha/leaderboard`, and `zoqo://docs/alpha/{file}` serving the markdown files in `docs/alpha/` read-only; prompts `daily-review` and `pre-kickoff-scan` as described in the spec.

Add a Vitest for `place_intent` proving a stake above `max_stake` is rejected and logged, and a Playwright test that issues a multi-scope key on `/settings` and calls `list_venues` through `/api/mcp` with it.

## 3. Wire Supabase Vault for real

`src/app/api/alpha/credentials/route.ts` currently writes `vault:pending:<uuid>` and discards the secret. Replace with a real round trip: a Postgres function `alpha_store_secret(name text, secret text) returns text` (security definer, service-role only) that calls `vault.create_secret` and returns the secret id; `broker_credentials.secret_ref` stores that id; `src/lib/alpha/secrets.ts` resolves `vault:<id>` via `vault.decrypted_secrets` using the service-role client, with the existing env-var fallback kept as the second lookup. Add the function in a new migration, apply it with the linked Supabase CLI, regenerate `database.types.ts`, and prove it with a round-trip test that stores a dummy value and reads it back (skip with reason if the linked project is unreachable). Never log the decrypted value.

## 4. Verify every external adapter against real keys

Read `.env.local`. For every key present, run that adapter's conformance test un-skipped against the live endpoint and fix the adapter until it passes. Specifically:

- `MANIFOLD_API_KEY`: list markets, get quote, place a 10 mana bet on a liquid market, read it back, cancel a limit order. Then create a real `manifold-mean-reversion` strategy instance for my user with a small budget, enable the venue, set `next_run_at = now()`, and confirm an `alpha_runs` row and a real bet appear.
- **odds-api.io is dead for us: new free keys are "paused indefinitely" (checked 2026-09-13).** Replace it. Keep `providers/oddsApiIo.ts` but mark it inactive and never call it. Build two new free, key-less providers by porting the MIT-licensed `jayteealao/NaijaBet_Api` (Python) to TypeScript: `providers/bet9jaPublic.ts` and `providers/nairabetPublic.ts`, reading the same public JSON endpoints that library uses (fetch its source from GitHub, read `NaijaBet_Api/bookmakers/*.py` and `id.py` for the endpoint URLs, league ids, and response parsing; cite the file in a header comment). Do not port the BetKing scraper (Cloudflare, needs a headless browser). Normalize to the existing `alpha_odds_snapshots` shape (book `bet9ja` / `nairabet`, markets 1x2, dc, ou25, btts where the JSON has them). Put them behind the rate budget at a polite cadence (no more than one request per league per 15 minutes, 5 minutes inside the last 2 hours before kickoff) with a browser-like User-Agent and a 24-hour circuit breaker that pauses the provider and writes an `alpha_events` error if it gets 403/429 or a shape change. Verify against the live endpoints from this machine for one EPL matchday and fix parsing until real rows land in `alpha_odds_snapshots`. Then add `providers/apiFootballOdds.ts` using API-Football's `/odds` endpoint (included in the free plan, same 100/day budget; use `/odds/bookmakers` once to learn the ids, prefer 1xBet, Betway, Bet365 as the consensus books) for the consensus line and closing line. Update `docs/alpha/02-market-landscape.md` §2 and §8 and `06-football-model.md` §1 to reflect the new sources, and note plainly in both that reading public odds JSON is extraction under Bet9ja's T&C clause IV(4); it is read-only, low-cadence, never places bets, and is Aise's call.
- Optional free backup: `THE_ODDS_API_KEY` (the-odds-api.com free tier, 500 credits per month, 1xBet in region `eu`). Only for closing-line snapshots on fixtures we actually bet, never for scanning.
- `API_FOOTBALL_KEY`: fixtures, lineups, injuries, one result. Correct `providers/apiFootball.ts` if needed. Run `alpha-ingest` once by hand (curl with `CRON_SECRET` against localhost) and confirm rows in `alpha_fixtures` and `alpha_odds_snapshots`.
- Kalshi demo, Bybit demo, Deriv: same, if their keys exist.
- Polymarket needs no key; keep its live test.

For any key still absent, leave the test skipped and keep the exact signup URL in STATUS.md's "Needs Aise" list. Everything in this program must stay on free tiers; if a provider's free tier disappears, replace it with a free source and record the change, never a paid plan.

## 5. Production check

Confirm the latest commit is deployed on Vercel (`vercel ls` or the deploy hook; if you cannot, say so). Then hit `https://zoqo.vercel.app/api/cron/alpha-run` with `CRON_SECRET` and confirm 200. Query `cron.job_run_details` on the linked project and confirm all five `alpha-*` and `evaluate-triggers` jobs have succeeded in the last 15 minutes. Record the results in STATUS.md with timestamps.

## 6. Housekeeping

- STATUS.md's "not yet pushed" line is stale; `origin/main` matches local. Fix it.
- The `VenueMode` TS union still includes `"live"`. Keep it, but add a runtime assertion in `service.ts` that throws if any venue row or adapter reports `live`, and a test for it.
- Add `docs/alpha/RUNBOOK.md`: how to add a key, how to enable a venue, how to create and run a strategy, how to read the leaderboard, how to kill everything, how to resume the build.

## Definition of done

Alpha is in the nav on desktop and mobile with a live badge; all 36 spec tools plus resources and prompts respond through `/api/mcp` with a scoped key; credentials round-trip through Vault; every adapter with a key in `.env.local` passes its conformance test un-skipped; at least one real Manifold bet was placed by the scheduler; STATUS.md and RUNBOOK.md are current; everything is committed and pushed and all checks are green.

Begin with section 1 now.
