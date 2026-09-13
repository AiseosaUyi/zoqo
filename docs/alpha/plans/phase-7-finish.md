# Phase 7 plan: finish ZOQO Alpha (nav, missing MCP surface, Vault, live verification)

Driven by `docs/alpha/PROMPT-alpha-finish.md`. Six sections, built back to back per that prompt's standing loop. This file front-loads two environment facts discovered before writing any code, because they change what "done" can mean for two sections:

**Environment facts (checked before planning, not assumed):**
1. `.env.local` currently has only `TWELVE_DATA_API_KEY`, the Supabase triplet, `NEXT_PUBLIC_BACKEND_ENABLED`, `CRON_SECRET`, `BREVO_*`, `NEXT_PUBLIC_SITE_URL`. **No `MANIFOLD_API_KEY`, `KALSHI_*`, `BYBIT_*`, `DERIV_*`, `ODDS_API_IO_KEY`, `THE_ODDS_API_KEY`, or `API_FOOTBALL_KEY` exist**, locally or in Vercel production (`vercel env ls production` confirms the same 8 names live there). So section 4's live-adapter verification and the "place a real Manifold bet" acceptance line stay unreachable this pass — every one of those adapters' conformance tests stays `skip`-marked, per `07-build-plan.md`'s own standing rule ("skip with reason, record in STATUS.md, continue"). The keyless work in section 4 (Bet9ja/Nairabet public JSON, API-Football odds *code* though its test still skips) is fully in scope and is where section 4's real effort goes.
2. The Supabase CLI has no `SUPABASE_ACCESS_TOKEN` available in this session (not in `.env.local`, not in Vercel env, no prior `supabase login` state on disk), and there is no direct Postgres connection string/password anywhere in scope either. `supabase migration list --linked` hangs waiting for auth and was killed. **Section 3's migration will be written and committed but cannot be applied with `supabase db push` this pass.** This matches the prompt's own explicit escape hatch: "prove it with a round-trip test... skip with reason if the linked project is unreachable." `database.types.ts` regen is skipped for the same reason (nothing new to regen against). Recorded plainly in STATUS.md's "Needs Aise" list with the exact follow-up command.
   The Vercel CLI *is* authenticated (`vercel whoami` → `aiseosauyiidahor-5554`, project `zoqo` linked) so section 5's deploy-confirmation and cron-hit checks are reachable; only the direct `cron.job_run_details` SQL query is not (same missing-DB-access reason) — substituted with a check against `alpha_events`/`automations` cron ticks via the service-role Supabase client, which the app already has credentials for.

## Section 1 — Alpha nav visibility
- `src/components/trade/HeaderChrome.tsx`: add `{ key: "alpha", href: "/alpha", label: "Alpha", icon: Sparkles }` to `NAV_ITEMS`. Grep for a second hard-coded nav array (mobile five-tab nav, terminal's own nav) and update in place — no new header file.
- Unread badge: new `useAlphaUnread()` (or extend the existing settlements-bell/automations-badge hook if one already generalizes) that counts `alpha_events` rows where `kind in ('proposal','paused','error','kill')` and `acked_at is null` for the signed-in user, polled the same cadence as the existing automations badge.
- `/alpha` empty state: first-visit panel (no venues enabled AND no strategies) walking through enable a venue → create a strategy → Run now, linking to `/settings`. "Needs setup" panel calls `get_health`-equivalent (`service.getHealth` server-side, same function the MCP tool will wrap in section 2) and lists providers/venues with credential env vars absent, each with its exact signup URL (reuse STATUS.md's "Needs Aise" URL list as the single source so they can't drift).
- `/settings`: add an "Alpha scopes" paragraph next to the existing MCP scope explanation, one line per `alpha:read`/`alpha:run`/`alpha:manage`/`alpha:credentials`.
- `/` redirect untouched.

## Section 2 — 13 missing MCP tools + resources + prompts
All in `src/lib/mcp/alphaTools.ts` (extend, matching the existing thin-wrapper-over-`service.ts` shape) and registered in `src/app/api/mcp/route.ts` with `requireScope` exactly as today's 24 tools do:
`get_balances` (read), `set_venue_credentials` (credentials; wraps section 3's vault path, returns `{ok, keyPrefix}` only, never the secret), `backtest_strategy` (run; wraps `backtest.ts`), `get_runs`/`get_run` (read; `alpha_runs` incl. log jsonb), `list_orders` (read), `place_intent` (run; builds an `Intent`, through `evaluateIntent`/`risk.ts` and the adapter exactly like a strategy intent — reuses `runner.ts`'s per-intent path rather than duplicating it), `cancel_order` (run; adapters without `cancel` return a typed error, not a throw), `settle_now` (run; one venue or all via `settle.ts`), `get_settings`/`set_settings` (read/manage; `alpha_settings` row), `get_events`/`ack_event` (read/manage).

Resources (`server.registerResource`) and prompts (`server.registerPrompt`) — **read the installed `@modelcontextprotocol/sdk` types in `node_modules` first, do not guess the API shape**: `zoqo://alpha/strategies/{id}`, `zoqo://alpha/fixtures/{id}`, `zoqo://alpha/leaderboard` (JSON via existing service functions), `zoqo://docs/alpha/{file}` (reads `docs/alpha/*.md` off disk, read-only, path-traversal guarded to that directory). Prompts `daily-review` and `pre-kickoff-scan` per `05-mcp-spec.md`.

Tests: Vitest for `place_intent` rejecting a stake above `max_stake` (asserting the rejection is logged to `alpha_decisions`), Playwright test issuing a multi-scope key on `/settings` and calling `list_venues` through `/api/mcp`.

## Section 3 — Supabase Vault (written, not appliable this pass — see environment facts)
- New migration `supabase/migrations/<ts>_alpha_vault_secrets.sql`: `alpha_store_secret(name text, secret text) returns uuid` — `security definer`, `revoke execute from public/authenticated/anon`, `grant execute to service_role` only, body calls `vault.create_secret(secret, name)`.
- `src/app/api/alpha/credentials/route.ts`: replace the `vault:pending:<uuid>` placeholder with a real call — service-role client `.rpc('alpha_store_secret', {...})`, store `vault:<id>` in `broker_credentials.secret_ref`.
- `src/lib/alpha/secrets.ts`: resolve `vault:<id>` refs by selecting from `vault.decrypted_secrets` via the service-role client (needs a `security definer` read wrapper function exposed to PostgREST for the same reason as above — `vault` schema isn't PostgREST-exposed by default), env-var fallback kept as the second lookup exactly as now. Never log the decrypted value (grep after writing to confirm no `console.log`/`log()` call touches the resolved secret).
- Round-trip test: Vitest that calls the store+resolve path against the linked project. **Skipped with reason `"no SUPABASE_ACCESS_TOKEN / DB credential in this environment to apply the migration first"`** — the function doesn't exist live yet, so a live round-trip is not possible until Aise runs `supabase db push --linked` with a valid access token. This is the prompt's own named escape hatch, not a scope cut.
- `database.types.ts`: no regen this pass (nothing new applied to introspect); note in STATUS.md that it needs regenerating in the same follow-up session as the migration apply.

## Section 4 — Adapter verification + new odds providers
- Every adapter needing a key absent from `.env.local`/Vercel (Manifold, Kalshi demo, Bybit demo, Deriv, API-Football) stays `skip`-marked; no code changes forced beyond what section 4's actual live-testable scope below produces. Confirmed exact signup URLs already exist in STATUS.md's "Needs Aise" — re-verified current, not duplicated.
- Polymarket: re-run its existing live conformance test to reconfirm (no key needed, already passes per Phase 4).
- `providers/oddsApiIo.ts`: mark inactive (module-level comment + a guard that throws if ever called), never invoked from `alpha-ingest`.
- New `providers/bet9jaPublic.ts` and `providers/nairabetPublic.ts`: port the relevant bits of `jayteealao/NaijaBet_Api` (MIT) from its GitHub source — fetch `bookmakers/*.py` and `id.py` for real, cite the exact upstream file path/commit in a header comment, do not port the BetKing scraper. Normalize to `alpha_odds_snapshots`'s existing shape (`book`, `market` ∈ {1x2, dc, ou25, btts} where present). Rate budget: ≤1 req/league/15min normally, ≤1 req/league/5min inside 2h of kickoff, browser-like User-Agent, 24h circuit breaker on 403/429/shape-change writing an `alpha_events` error and pausing the provider (reuse `rateBudget.ts`'s token bucket, add a breaker flag alongside it rather than a parallel mechanism).
- New `providers/apiFootballOdds.ts`: API-Football `/odds` (and `/odds/bookmakers` once, to record ids for 1xBet/Betway/Bet365 as consensus books) — built against the documented v3 shape like the existing `apiFootball.ts`; conformance test skip-marked (`API_FOOTBALL_KEY` absent).
- Live verification for the two keyless providers: run them for real against one live EPL matchday from this machine, iterate parsing until real rows land in `alpha_odds_snapshots` (requires `NEXT_PUBLIC_BACKEND_ENABLED`-style DB write, i.e. the service-role client — reachable, unlike section 3's DDL).
- Docs: `docs/alpha/02-market-landscape.md` §2/§8 and `06-football-model.md` §1 updated for the new sources; both note the Bet9ja T&C clause IV(4) point plainly (read-only, low-cadence, never places bets, Aise's call) exactly as the prompt requires.

## Section 5 — Production check
- `vercel ls` / `vercel inspect` (authenticated, confirmed) to show the latest production deployment's commit SHA and compare to `git rev-parse HEAD` at push time.
- `curl -H "Authorization: Bearer $CRON_SECRET" https://zoqo.vercel.app/api/cron/alpha-run` (and the other `alpha-*` + `evaluate-triggers` routes) and confirm 200.
- `cron.job_run_details` direct query is **not reachable** (no DB/CLI credential — same gap as section 3); substituted with a service-role read of `alpha_events` for `kind='info'` ticks in the last 15 minutes across the alpha cron jobs, which is the same signal Phase 0's own acceptance check used ("write to alpha_events kind info on first tick"). Documented as a substitution, not silently swapped.
- Results with timestamps written into STATUS.md.

## Section 6 — Housekeeping
- STATUS.md: fix the stale "not yet pushed" line (already stale per the file's own current text — `origin/main` matches local as of this session's `git status`).
- `service.ts`: runtime assertion — any venue row or adapter reporting `mode === 'live'` throws a typed error before any adapter method is called; keep the `VenueMode` union including `"live"` (per instruction) purely so the type system can express the illegal state the runtime check rejects. Vitest covering the throw.
- `docs/alpha/RUNBOOK.md`: add a key → enable a venue → create/run a strategy → read the leaderboard → kill everything → resume the build, each as a short numbered how-to referencing the real file/route/MCP tool involved.

## Files touched (summary)
`HeaderChrome.tsx`, mobile nav component, `/settings/page.tsx`, `/alpha/page.tsx` (+ new empty-state/needs-setup component), `src/lib/mcp/alphaTools.ts`, `src/app/api/mcp/route.ts`, new migration file, `src/app/api/alpha/credentials/route.ts`, `src/lib/alpha/secrets.ts`, `src/lib/alpha/service.ts`, `src/lib/alpha/providers/{oddsApiIo,bet9jaPublic,nairabetPublic,apiFootballOdds}.ts`, `src/lib/alpha/rateBudget.ts` (breaker flag), `docs/alpha/{02-market-landscape,06-football-model,STATUS,RUNBOOK}.md`, new/extended Vitest + Playwright tests.

## Verification
Per section: `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npm run build`. Section 3 and part of section 5 have a named, environment-caused skip (no Supabase CLI/DB credential) rather than a full green run — everything else targets fully green, same bar as phases 0-5.

## Rollback
Each section is an independent commit (`alpha(finish): section N — ...`); reverting one section's commit doesn't require reverting another's, except section 2's MCP route registration touches the same file section 1 doesn't, so ordering (1 → 2 → 3 → 4 → 5 → 6) is preserved to avoid merge noise within this single-branch, single-session build.

## Step 0 — scope challenge (self-conducted; no design-doc gap, spec is docs/alpha/*.md already read in full)
- **Reuse first**: section 2's 13 tools are 100% thin wrappers over `service.ts`/`runner.ts`/`risk.ts`/`settle.ts`/`backtest.ts` functions that already exist from phases 1-5 — no new business logic, matching the existing 24 tools' pattern exactly. `place_intent` reuses `runner.ts`'s per-intent execution path rather than duplicating risk-gate wiring. Section 6's live-mode guard is one assertion in `service.ts`'s existing adapter-dispatch chokepoint, not a new module.
- **Minimum change**: section 3 stops at "migration written, round-trip skipped with reason" rather than inventing a workaround (fake local Postgres, hand-rolled encryption) to force a green test against infra this session cannot reach — the prompt names this exact skip as acceptable.
- **File count**: this plan is 6 independently-scoped sections mandated verbatim by the user's own `docs/alpha/PROMPT-alpha-finish.md`, not discretionary feature scope — each section's file list was fixed by that prompt before this plan existed. Aggregate file count is high (~25+) because it spans nav, MCP, DB, providers, and docs, but no section individually introduces new architecture: every section extends an existing module in place (`alphaTools.ts`, `HeaderChrome.tsx`, `secrets.ts`, `rateBudget.ts`) rather than adding a parallel system. Not reducing scope — the prompt is explicit that all 6 sections ship in one pass.
- **Built-ins over custom**: MCP resources/prompts use `mcp-handler`'s own `registerResource`/`registerPrompt` (read from `node_modules` types before writing, per the prompt's own instruction) rather than a hand-rolled resource router. Vault access uses Postgres' native `vault.create_secret`/`vault.decrypted_secrets` rather than app-level encryption.
- **TODOS.md cross-reference**: no blocking overlap found; TODOS.md's Supabase SMTP item is orthogonal to this pass.

## GSTACK REVIEW REPORT

| Section | Status | Findings |
|---|---|---|
| Architecture | Pass | Every section extends an existing chokepoint (`service.ts`, `alphaTools.ts`, `secrets.ts`, `HeaderChrome.tsx`) rather than introducing a parallel path — consistent with phases 0-5's own discipline. `place_intent` and `cancel_order` reusing `runner.ts`/adapter methods (not a second execution path for agent-driven orders) is the one thing worth double-checking during build: confirm no divergence from strategy-driven intents in risk-gate coverage. |
| Code quality | Pass, one watch item | Vault secret resolution needs a `security definer` wrapper function to cross the PostgREST/`vault`-schema boundary — get the grant list right (`service_role` only, explicit `revoke` from `anon`/`authenticated`) since this is a credentials path; call this out explicitly in the migration's own comments, not just this plan. |
| Tests | Pass | Section 2's `place_intent` rejection test and section 6's live-mode-assertion test are both real negative-path coverage, not just happy-path additions. Section 3/5's named skips are environment-caused (no DB credential) and documented with the exact reason string per the standing rule, not silent gaps. |
| Performance | Pass | Section 4's rate budget (≤1 req/league/15min, tighter near kickoff, 24h circuit breaker) is the right shape for a keyless public-JSON scrape — no hot path concerns elsewhere; MCP tools are all request-scoped reads/writes matching existing tool cost profile. |

Scope check: matches `docs/alpha/PROMPT-alpha-finish.md` sections 1-6 exactly; no reduction proposed — the file-count complexity signal is explained above as span-of-integration, not new architecture, and the plan's author (the user) fixed this scope in writing before the plan was drafted.

VERDICT: APPROVED — proceed to `/plan-design-review` for section 1's UI surface, then build sections 1-6 in order without stopping between them, per the driving prompt's explicit instruction.

NO UNRESOLVED DECISIONS

## Design review (section 1's UI surface only — sections 2-6 are backend/infra/docs, no UI scope)

Scope: one `NAV_ITEMS` entry, one unread-count badge, one `/alpha` empty-state + needs-setup panel, one paragraph on `/settings`. ZOQO already has a mature, documented design system (`design.md`, `src/lib/tokens.ts`, the `/system` explorer, `TYPOGRAPHY.md`) — this is incremental extension of an existing, already-designed product, not greenfield UI. Full mockup-generation/comparison-board tooling is disproportionate to a nav-link, a badge, and one empty state that must visually match neighbors already on screen; skipping it in favor of a grounded text review against the real existing patterns below, per the plan-design-review's own "no UI scope on a backend change" escape valve extended here to "trivial, pattern-matched UI scope."

**0A rating: 6/10 as drafted.** The plan said *what* to add but not the concrete visual spec — that's the gap a 10 needs, closed below.

- **Nav item**: `NAV_ITEMS` (`HeaderChrome.tsx:19-23`) is a flat array of `{key, href, label, icon}` rendered identically for every header — Predict/Trade/Automations. `Sparkles` (already imported family, lucide-react) for Alpha reads as "new/smart" without implying a specific asset class, consistent with Target/TerminalIcon/Bot each being a plain, literal icon for their surface. Order: append after Automations (`market, terminal, automations, alpha`) — Alpha is the newest, most experimental surface, last matches how Automations itself was added after Trade. No color/size deviation from the existing 3 — `NAV_FOCUS`'s ring treatment applies unchanged, so this is a 10/10 "reuse, don't reinvent" case.
- **Badge**: `HeaderBell` (`HeaderChrome.tsx:330-343`) is the exact existing pattern — a numeric pill overlaid top-right on an icon, `unread > 0` conditional render. The Alpha nav item's badge reuses this same visual (small red/accent dot+count, not a second bell-shaped icon) anchored to the nav link itself rather than a separate bell, since the automations badge (per CLAUDE.md's own note: "badge on the automations nav item") already establishes "badge sits on the nav item" as the convention for count-of-things-needing-attention, while the bell is reserved for settlements specifically. Confirms with existing code before build (Automations badge implementation) rather than assuming — flagged as a build-time check, not a re-litigated decision.
- **`/alpha` empty state**: per Design Principle 1 ("empty states are features"), the walkthrough (enable a venue → create a strategy → Run now) needs to be one linear, numbered 3-step card — not three separate call-to-actions competing for attention (Hierarchy as service: one job, one primary action visible at a time; the *next* uncompleted step is visually primary, completed steps collapse to a checked, muted state). The "Needs setup" panel is a second, secondary-visual-weight panel below the walkthrough (subtraction default: don't let a warning-colored setup checklist outrank the primary path for a first-time visitor who has zero context yet) — each row is provider/venue name, a status dot (configured / missing), and for "missing" rows the exact signup URL as a real link, not a copy-paste string. Empty state only renders pre-first-venue-or-strategy; once either exists, the page reverts to the normal dashboard sections per `03-architecture.md` §9 — no dead "getting started" card lingering for a returning user (a documented AI-slop failure mode: onboarding cruft that never goes away).
- **`/settings` scopes paragraph**: matches the existing MCP scope explanation's format exactly (one line per scope, plain language before the raw scope string) — `alpha:read`/`alpha:run`/`alpha:manage`/`alpha:credentials`, each glossed in outcome terms ("lets an agent see your strategies and balances" not "grants SELECT on alpha_* tables") per the Writing Style jargon-gloss rule.
- **Mobile**: five-tab bottom nav (build-time note: grep for the actual mobile nav component before assuming its shape — the plan's own section 1 already flags "check `src/components/terminal/*` and the mobile nav component for a second hard-coded nav list," this design pass adds: whichever tab set results, Alpha's icon/label must match the desktop `NAV_ITEMS` entry verbatim, not a re-invented mobile-only icon) — touch target ≥44px per the mobile UX rule, consistent with the other 4 tabs already in that bar.

**Re-rated: 9/10.** The one open item (exact automations-badge visual source, since I have not yet read that component's file) is a build-time verification, not a design ambiguity — recorded as a task in section 1's build checklist, not an unresolved decision here.

## GSTACK REVIEW REPORT (design)

| Pass | Status | Findings |
|---|---|---|
| Information architecture | Pass | Alpha slots at the end of an already-flat, already-understood nav array; no new IA pattern introduced. |
| Empty/edge states | Pass, action item | Empty state and needs-setup panel both specified above with explicit primary/secondary weighting; build must verify it disappears once real data exists (no persistent onboarding cruft). |
| Consistency with design system | Pass | Zero new tokens, radii, or colors — every element (nav item, badge, focus ring) reuses an existing primitive verbatim. |
| Mobile/responsive | Pass, action item | Spec matches desktop nav 1:1; build-time task to locate the actual mobile nav component before editing (not yet confirmed which file). |
| AI-slop risk | Pass | No generic card grid, no decorative hero — this is a nav link and a status list, the plainest possible treatment, which is correct here. |

Scope check: matches section 1 of `docs/alpha/PROMPT-alpha-finish.md` exactly; mockup-generation tooling explicitly skipped as disproportionate to trivial, pattern-matched UI on a product with an existing enforced design system — documented above, not silently dropped.

VERDICT: APPROVED — proceed to build, sections 1-6 in order, without stopping between them.

NO UNRESOLVED DECISIONS
